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
});
