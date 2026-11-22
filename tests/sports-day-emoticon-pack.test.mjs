import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: new URL('http://localhost/'),
};

const root = new URL('../', import.meta.url);
const storeUrl = new URL('assets/js/modules/store-data.js?v=test', root);
const catalog = await import(storeUrl.href);
const itemId = 'emo-sportsday-01';
const imagesDir = 'images/emoticons/sports-pack';
const assets = catalog.SPORTS_DAY_EMOTICON_PACK;

// Run the real shared picker and renderers without opening a browser session.
const emptyOrderModule = `data:text/javascript,${encodeURIComponent(
  'export const loadItemOrder = async () => []; export const sortByItemOrder = (items) => items;',
)}`;
const emoticonSource = await readFile(new URL('assets/js/modules/emoticons.js', root), 'utf8');
const emoticonModule = emoticonSource
  .replace("from './inventory-order.js'", `from '${emptyOrderModule}'`)
  .replace("from './site-version.js'", `from '${new URL('assets/js/modules/site-version.js', root).href}'`)
  .replace("import { supabase } from './supabase-client.js';", 'const supabase = {};')
  .replace('await import(`./store-data.js?v=${MODULE_VERSION}`)', `await import('${storeUrl.href}')`);
const renderers = await import(`data:text/javascript;base64,${Buffer.from(emoticonModule).toString('base64')}`);

test('말오닷 운동회 precedes the banknote effect and retains the requested metadata and ten previews', () => {
  const item = catalog.getStoreItemById(itemId);
  assert.equal(catalog.STORE_ITEMS.filter((entry) => entry.id === itemId).length, 1);
  const featuredIds = catalog.getFeaturedStoreItems(catalog.STORE_ITEMS.length).map((entry) => entry.id);
  const previousIndex = featuredIds.indexOf('emo-sportsday-01');
  assert.deepEqual(featuredIds.slice(previousIndex, previousIndex + 2), ['emo-sportsday-01', 'cha-cash-01']);
  const releaseIds = catalog.STORE_ITEMS
    .toSorted((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .map((entry) => entry.id);
  const releaseIndex = releaseIds.indexOf('emo-sportsday-01');
  assert.deepEqual(releaseIds.slice(releaseIndex, releaseIndex + 2), ['emo-sportsday-01', 'cha-cash-01']);
  assert.equal(item.name, '말오닷 운동회 이모티콘팩');
  assert.equal(item.price, 521);
  assert.equal(item.category, 'emoticon');
  assert.equal(item.badge, '이모티콘');
  assert.equal(item.icon, '🏂');
  assert.equal(item.state, '판매 중');
  assert.equal(item.description, '말오닷 운동회 이모티콘 팩이야.');
  assert.equal(item.isPurchasable, true);
  assert.equal(item.previewImages, assets);
  assert.equal(item.thumbImagePath, assets[0].imagePath);
  assert.equal(renderers.getEmoticonPackByItemId(itemId), assets);
  assert.equal(assets.length, 10);
  assert.deepEqual(assets.map((image) => image.label), [
    '축구', '헬스', '러닝', '줄넘기', '농구', '배드민턴', '요가', '스케이트보드', '수영', '자전거',
  ]);
});

test('the shared picker, post editor and comment or reply token renderer resolve all ten stickers', () => {
  const rows = assets.map((image) => ({
    item_id: itemId,
    emoticon_code: image.code,
    emoticon_label: image.label,
    image_path: image.imagePath,
    display_order: image.displayOrder,
    is_equipped: true,
  }));
  const picker = renderers.renderOwnedEmoticonPicker(rows);
  assert.match(picker, /data-pack-key="sportsday"/);
  assert.match(picker, /말오닷 운동회/);
  assert.equal((picker.match(/data-action="select-emoticon"/g) || []).length, 10);

  const originalDocument = globalThis.document;
  try {
    globalThis.document = {
      createElement: (tag) => ({
        tag, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; },
      }),
    };
    rows.forEach((row, index) => {
      const order = index + 1;
      const code = `sportsday-${String(order).padStart(2, '0')}`;
      assert.equal(row.emoticon_code, code);
      assert.equal(row.display_order, 1300 + order);
      assert.ok(picker.includes(`data-emoticon-code="${code}"`));

      const node = renderers.createInlineEmoticonNode(row);
      assert.equal(node.tag, 'img');
      assert.equal(node.src, row.image_path);
      assert.equal(node.alt, row.emoticon_label);
      assert.equal(node.attributes['data-emoticon-code'], code);

      const token = `[emo:${code}]`;
      const html = renderers.renderTextWithEmoticons(token);
      assert.ok(html.includes(`src="${row.image_path}"`));
      assert.ok(html.includes(`alt="${row.emoticon_label}"`));
      assert.ok(!html.includes(token));
    });
  } finally {
    globalThis.document = originalDocument;
  }
});

test('all linked assets are the original transparent PNGs in both web bundles', async () => {
  const listedPaths = new Set((await readFile(new URL('file-list.txt', root), 'utf8')).split('\n'));
  const discovered = (await readdir(new URL(`${imagesDir}/`, root))).filter((path) => path.endsWith('.png'));
  const assetPaths = assets.map((image) => new URL(image.imagePath, window.location).pathname.slice(1));
  assert.deepEqual(assetPaths, discovered.sort().map((path) => `${imagesDir}/${path}`));

  for (const path of assetPaths) {
    const [source, mirror] = await Promise.all([
      readFile(new URL(path, root)), readFile(new URL(`www/${path}`, root)),
    ]);
    assert.deepEqual(source, mirror);
    assert.equal(source.subarray(1, 4).toString(), 'PNG');
    assert.equal(source.readUInt32BE(16), 1254);
    assert.equal(source.readUInt32BE(20), 1254);
    assert.equal(source[25], 6, 'RGBA color type preserves the approved alpha channel');
    assert.ok(listedPaths.has(`./${path}`));
    assert.ok(listedPaths.has(`./www/${path}`));
  }

  for (const path of ['assets/js/modules/store-data.js', 'assets/js/modules/emoticons.js', 'assets/version.json']) {
    assert.deepEqual(await readFile(new URL(path, root)), await readFile(new URL(`www/${path}`, root)));
  }
});
