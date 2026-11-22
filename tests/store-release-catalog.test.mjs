import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildStoreReleaseCatalog } from '../scripts/build-store-release-catalog.mjs';

const product = {
  id: 'paid-item',
  name: '유료 상품',
  price: 413,
  state: '판매 중',
  isPurchasable: true,
};

test('catalog includes purchasable items and free claims in stable ID order', () => {
  const items = [
    product,
    { ...product, id: 'future', state: '준비 중' },
    { ...product, id: 'retired', state: '판매 종료', isPurchasable: false },
    { ...product, id: 'unavailable', isPurchasable: false },
    { ...product, id: 'Free', name: '무료 상품', price: 0, state: '무료 지급' },
    { ...product, id: 'free', name: '0피클 상품', price: 0 },
  ];

  const catalog = buildStoreReleaseCatalog(items);
  assert.deepEqual(catalog, {
    version: 1,
    items: [
      { id: 'Free', name: '무료 상품', price: null },
      { id: 'free', name: '0피클 상품', price: null },
      { id: 'paid-item', name: '유료 상품', price: 413 },
    ],
  });
  assert.deepEqual(buildStoreReleaseCatalog(items.toReversed()), catalog);
});

test('malformed active products stop the release build', () => {
  assert.throws(() => buildStoreReleaseCatalog([product, product]), /Duplicate/);
  assert.throws(() => buildStoreReleaseCatalog([{ ...product, id: 'new&id' }]), /ID/);
  assert.throws(() => buildStoreReleaseCatalog([{ ...product, id: 'x'.repeat(101) }]), /ID/);
  assert.throws(() => buildStoreReleaseCatalog([{ ...product, name: ' ' }]), /name/);
  assert.throws(() => buildStoreReleaseCatalog([{ ...product, name: '줄바꿈\n상품' }]), /name/);
  assert.throws(() => buildStoreReleaseCatalog([{ ...product, name: '오'.repeat(121) }]), /name/);
  for (const price of [-1, 1.5, '413', 2147483648]) {
    assert.throws(() => buildStoreReleaseCatalog([{ ...product, price }]), /price/);
  }
  const tooManyItems = Array.from({ length: 501 }, (_, index) => ({ ...product, id: `item-${index}` }));
  assert.throws(() => buildStoreReleaseCatalog(tooManyItems), /at most 500/);
});

test('the deployment command exports the actual store catalog to JSON', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'mallinoi-store-release-'));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const outputPath = join(temp, 'store-release-catalog.json');
  const script = fileURLToPath(new URL('../scripts/build-store-release-catalog.mjs', import.meta.url));
  execFileSync(process.execPath, [script, outputPath]);

  const raw = await readFile(outputPath, 'utf8');
  const { version, items } = JSON.parse(raw);
  assert.equal(version, 1);
  assert.ok(items.length > 0);
  assert.deepEqual(items.map(({ id }) => id), items.map(({ id }) => id).sort());
  assert.ok(items.every((item) => Object.keys(item).join() === 'id,name,price'));
  assert.deepEqual(items.find(({ id }) => id === 'bgm-cucumbergirl&grilledegg-01'), {
    id: 'bgm-cucumbergirl&grilledegg-01',
    name: 'シャキッ！ムキッ！マッスル祭！',
    price: 687,
  });
});

test('the festival BGM leads New and shares its preview media with the inventory track', async () => {
  globalThis.window = { __SITE_VERSION__: 'test', location: new URL('https://mallin-oi.com/') };
  const catalog = await import('../assets/js/modules/store-data.js');
  const id = 'bgm-cucumbergirl&grilledegg-01';
  const title = 'シャキッ！ムキッ！マッスル祭！';
  const item = catalog.getStoreItemById(id);
  const track = catalog.BGM_CATALOG.find((entry) => entry.storeItemId === id);
  const newest = catalog.STORE_ITEMS.toSorted((left, right) => right.releaseDate.localeCompare(left.releaseDate));

  assert.equal(catalog.getFeaturedStoreItems(1)[0], item);
  assert.equal(newest[0], item);
  assert.equal(item.category, 'bgm');
  assert.equal(item.isPurchasable, true);
  assert.equal(item.previewAudioPath, `/assets/mp3/${encodeURIComponent(title)}.mp3?v=test`);
  assert.equal(item.thumbImagePath, `/images/BGM/${encodeURIComponent(title)}.png?v=test`);
  assert.equal(item.previewImages.length, 1);
  assert.equal(item.previewImages[0].imagePath, item.thumbImagePath);
  assert.equal(track.id, 'mallin-oi-cucumbergirl-grilledegg-01');
  assert.equal(track.title, title);
  assert.equal(track.coverPath, item.thumbImagePath);
  assert.equal(track.audioPath, item.previewAudioPath);
  assert.equal(new URL(catalog.getStoreItemDetailHref(id), 'https://mallin-oi.com/').searchParams.get('id'), id);
});

test('the representative BGM request accepts the festival ID and rejects unrelated ampersand IDs', async () => {
  const moduleUrl = new URL('../assets/js/modules/bgm-preferences.js', import.meta.url);
  const source = await readFile(moduleUrl, 'utf8');
  const stubbedSource = source.replace(
    "import { supabase } from './supabase-client.js';",
    `export const calls = [];
    const supabase = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        return { data: [{ success: true, profile_featured_bgm_item_id: args.p_item_id }] };
      },
    };`,
  );
  const { calls, saveMyProfileFeaturedBgm } = await import(
    `data:text/javascript,${encodeURIComponent(stubbedSource)}`
  );
  const id = 'bgm-cucumbergirl&grilledegg-01';

  assert.equal((await saveMyProfileFeaturedBgm(id)).itemId, id);
  await assert.rejects(saveMyProfileFeaturedBgm('other&bgm'), /상품 정보가 올바르지 않아/);
  assert.deepEqual(calls, [{ name: 'set_my_profile_featured_bgm', args: { p_item_id: id } }]);
});
