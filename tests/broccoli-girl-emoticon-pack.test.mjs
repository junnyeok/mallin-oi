import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};

const storeUrl = new URL('../assets/js/modules/store-data.js?v=test', import.meta.url);
const { STORE_ITEMS, BROCCOLI_GIRL_EMOTICON_PACK, getFeaturedStoreItems } = await import(storeUrl.href);
const ITEM_ID = 'emo-broccoli-girl-01';
const SQL_PATH = 'supabase-SQLEditor/20260906-broccoli-girl-emoticon-pack.sql';
const MIGRATION_PATH = 'supabase/migrations/20260906010000_broccoli_girl_emoticon_pack.sql';
const emoticonSource = await readFile('assets/js/modules/emoticons.js', 'utf8');
// 브라우저 전용 Supabase 연결만 대체한다. 실제 선택기/토큰 렌더러 코드를 실행한다.
const sourceForNode = emoticonSource
  .replace("from './site-version.js'", `from '${new URL('../assets/js/modules/site-version.js', import.meta.url).href}'`)
  .replace("import { supabase } from './supabase-client.js';", 'const supabase = {};')
  .replace('await import(`./store-data.js?v=${MODULE_VERSION}`)', `await import('${storeUrl.href}')`);
const { renderTextWithEmoticons, renderOwnedEmoticonPicker, createInlineEmoticonNode } = await import(
  `data:text/javascript;base64,${Buffer.from(sourceForNode).toString('base64')}`
);

test('브로콜리 알바생은 주요 상품 첫 번째이며 지정 문구·443피클·10종이 정확하다', () => {
  const matches = STORE_ITEMS.filter((item) => item.id === ITEM_ID);
  assert.equal(matches.length, 1);
  const [item] = matches;
  assert.equal(getFeaturedStoreItems(1)[0].id, ITEM_ID);
  assert.equal(item.name, '브로콜리 알바생 이모티콘팩');
  assert.equal(item.icon, '🥦👧🏼');
  assert.equal(item.category, 'emoticon');
  assert.equal(item.badge, '이모티콘');
  assert.equal(item.price, 443);
  assert.equal(item.isPurchasable, true);
  assert.equal(item.description, '브로콜리 알바생의 스티커 느낌의 이모티콘 팩이야.');
  assert.equal(item.detailDescription, item.description);
  assert.equal(item.thumbImagePath, '/images/emoticons/01-broccoli-girl.png?v=test');
  assert.equal(item.previewImages, BROCCOLI_GIRL_EMOTICON_PACK);
  assert.equal(item.previewImages.length, 10);
  const codes = STORE_ITEMS.filter((entry) => entry.category === 'emoticon').flatMap((entry) => entry.previewImages.map((image) => image.code));
  assert.equal(new Set(codes).size, codes.length);
  assert.equal(new Set(STORE_ITEMS.map((entry) => entry.id)).size, STORE_ITEMS.length);
  item.previewImages.forEach((image, index) => {
    assert.equal(image.code, `broccoli-girl-${index + 1}`);
    assert.equal(image.label, `브로콜리 알바생 이모티콘 ${index + 1}`);
    assert.equal(image.displayOrder, 1201 + index);
    assert.equal(image.imagePath, `/images/emoticons/${String(index + 1).padStart(2, '0')}-broccoli-girl.png?v=test`);
  });
});

test('댓글·답글 토큰 10개가 실제 렌더러에서 이미지로 변환되고 HTML은 이스케이프된다', () => {
  for (const image of BROCCOLI_GIRL_EMOTICON_PACK) {
    const html = renderTextWithEmoticons(`<script>alert(1)</script> [emo:${image.code}]`);
    assert.ok(html.includes(`src="${image.imagePath}"`));
    assert.ok(html.includes(`alt="${image.label}"`));
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes(`<script>`));
    assert.ok(!html.includes(`[emo:${image.code}]`));
  }
  assert.ok(renderTextWithEmoticons('[emo:unknown-pack-999]').includes('[emo:unknown-pack-999]'));
});

test('실제 공통 선택기는 구매한 브로콜리 팩 탭과 10개 버튼을 노출한다', () => {
  const rows = BROCCOLI_GIRL_EMOTICON_PACK.map((image) => ({
    item_id: ITEM_ID, emoticon_code: image.code, emoticon_label: image.label,
    image_path: image.imagePath, display_order: image.displayOrder, is_equipped: true,
  }));
  const html = renderOwnedEmoticonPicker(rows);
  assert.ok(html.includes('브로콜리 알바생'));
  assert.equal((html.match(/data-action="select-emoticon"/g) || []).length, 10);
  for (const row of rows) assert.ok(html.includes(`data-emoticon-code="${row.emoticon_code}"`));
});

test('새글 본문 삽입 노드는 올바른 경로·alt·직렬화 코드가 있다', () => {
  const previousDocument = globalThis.document;
  try {
    globalThis.document = { createElement: (tag) => ({ tag, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } }) };
    const image = BROCCOLI_GIRL_EMOTICON_PACK[0];
    const node = createInlineEmoticonNode({ image_path: image.imagePath, emoticon_label: image.label, emoticon_code: image.code });
    assert.equal(node.tag, 'img');
    assert.equal(node.src, image.imagePath);
    assert.equal(node.alt, image.label);
    assert.equal(node.attributes['data-emoticon-code'], image.code);
    assert.equal(node.className, 'inline-emoticon');
  } finally { globalThis.document = previousDocument; }
});

test('실제 PNG 10종의 경로·원본-www 바이트와 파일 목록이 일치한다', async () => {
  const paths = (await readFile('file-list.txt', 'utf8')).trim().split('\n');
  for (let order = 1; order <= 10; order += 1) {
    const path = `images/emoticons/${String(order).padStart(2, '0')}-broccoli-girl.png`;
    const [source, generated] = await Promise.all([readFile(path), readFile(`www/${path}`)]);
    assert.deepEqual(source, generated);
    assert.equal(source.subarray(1, 4).toString(), 'PNG');
    assert.equal(source.readUInt32BE(16), 1254);
    assert.equal(source.readUInt32BE(20), 1254);
    assert.equal(source[25], 2, '사용자 RGB 원본을 변경하지 않는다');
    for (const entry of [path, `www/${path}`]) assert.equal(paths.filter((value) => value === `./${entry}`).length, 1);
  }
  for (const path of ['assets/js/modules/store-data.js', 'assets/js/modules/emoticons.js']) assert.deepEqual(await readFile(path), await readFile(`www/${path}`));
});

test('SQL은 서버 443피클·10종 즉시 장착·중복 방지·원장·재실행 검증을 포함한다', async () => {
  const [sql, migration, canonical] = await Promise.all([readFile(SQL_PATH, 'utf8'), readFile(MIGRATION_PATH, 'utf8'), readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8')]);
  assert.equal(sql, migration);
  for (const source of [sql, canonical]) {
    assert.match(source, /p_item_id = 'emo-broccoli-girl-01' then\s+v_price := 443;\s+v_name := '브로콜리 알바생 이모티콘팩';\s+v_category := 'emoticon';/);
    for (let order = 1; order <= 10; order += 1) assert.ok(source.includes(`'broccoli-girl-${order}', '브로콜리 알바생 이모티콘 ${order}', './images/emoticons/${String(order).padStart(2, '0')}-broccoli-girl.png', ${1200 + order}, true)`));
    for (const token of ['for update', 'if v_exists then', 'and coalesce(pickles, 0) >= v_price', 'insert into public.user_store_items', 'insert into public.pickle_ledger', '-v_charged_amount', 'on conflict (user_id, emoticon_code) do nothing']) assert.ok(source.includes(token), token);
    assert.ok(!source.includes('emo-brocolli-girl-01'));
  }
  assert.ok(sql.includes("position('emo-broccoli-girl-01' in v_sql) = 0"));
  assert.ok(sql.includes('BROCCOLI_GIRL_PURCHASE_ANCHOR_MISMATCH'));
  assert.ok(sql.includes('from public, anon'));
  assert.ok(sql.includes('to authenticated'));
});
