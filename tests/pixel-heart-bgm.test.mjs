import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: {
    hostname: 'localhost',
    origin: 'http://localhost',
    pathname: '/',
    href: 'http://localhost/',
  },
};

const { BGM_CATALOG, STORE_ITEMS, getFeaturedStoreItems } = await import(
  '../assets/js/modules/store-data.js'
);
const ITEM_ID = 'bgm-cucumbergirl-03';
const TRACK_ID = 'mallin-oi-pixel-heart';
const SQL_PATH = 'supabase-SQLEditor/20260906-pixel-heart-bgm.sql';
const MIGRATION_PATH = 'supabase/migrations/20260906000000_pixel_heart_bgm.sql';
// 독립 게임의 미배포 계정·라디오 기반은 이번 웹 상품 배포 범위에 포함하지 않는다.

test('PIXEL HEART는 브로콜리 알바생 다음 상품이며 588피클·설명·미리듣기가 일치한다', () => {
  const items = STORE_ITEMS.filter((item) => item.id === ITEM_ID);
  const tracks = BGM_CATALOG.filter((track) => track.storeItemId === ITEM_ID);
  assert.equal(items.length, 1);
  assert.equal(tracks.length, 1);
  const [item] = items;
  const [track] = tracks;
  assert.equal(getFeaturedStoreItems(2)[1].id, ITEM_ID);
  assert.equal(item.name, 'PIXEL HEART');
  assert.equal(item.category, 'bgm');
  assert.equal(item.price, 588);
  assert.equal(item.isPurchasable, true);
  assert.equal(item.releaseDate, '2026-09-06');
  assert.equal(item.description, '오이소녀 컨셉의 귀여운 곡이야.');
  assert.equal(item.detailDescription, '오이소녀 컨셉의 귀여운 곡이야. <br>구매하면 내프로필의 인벤토리에 추가되고, 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.');
  assert.equal(item.thumbImagePath, '/images/BGM/Pixel-Heart_LP.png?v=test');
  assert.equal(item.previewAudioPath, '/assets/mp3/Pixel-Heart.mp3?v=test');
  assert.equal(item.previewImages.length, 1);
  assert.equal(item.previewImages[0].imagePath, item.thumbImagePath);
  assert.equal(track.id, TRACK_ID);
  assert.equal(track.title, item.name);
  assert.equal(track.audioPath, item.previewAudioPath);
  assert.equal(track.coverPath, item.thumbImagePath);
  assert.equal(track.isDefault, false);
  assert.equal(track.displayOrder, 16);
  for (const values of [STORE_ITEMS.map((entry) => entry.id), BGM_CATALOG.map((entry) => entry.id), BGM_CATALOG.map((entry) => entry.displayOrder)]) {
    assert.equal(new Set(values).size, values.length);
  }
});

test('웹 상품 MP3·LP는 사용자 원본 해시와 형식을 유지한다', async () => {
  const assets = [
    ['assets/mp3/Pixel-Heart.mp3', 'b7877f3eae95b58d50f6c029397c4cc8df83a218382fd793e04c442d7e3799da'],
    ['images/BGM/Pixel-Heart_LP.png', 'b85cef4b2bb0d8a49a939e3ae03cdccd630ea011d913f561022389a935e57df1'],
  ];
  for (const [sourcePath, sha256] of assets) {
    const source = await readFile(sourcePath);
    assert.equal(createHash('sha256').update(source).digest('hex'), sha256);
  }
  const png = await readFile(assets[1][0]);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
  assert.equal((await readFile(assets[0][0])).subarray(0, 3).toString(), 'ID3');
});

test('전용 SQL·마이그레이션은 동일하고 서버 가격·원장·중복 구매 보호를 검증한다', async () => {
  const [sql, migration, canonical] = await Promise.all([
    readFile(SQL_PATH, 'utf8'), readFile(MIGRATION_PATH, 'utf8'),
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
  ]);
  assert.equal(sql, migration);
  for (const source of [sql, canonical]) {
    assert.match(source, /elsif p_item_id = 'bgm-cucumbergirl-03' then\s+v_price := 588;\s+v_name := 'PIXEL HEART';\s+v_category := 'bgm';/);
    assert.match(source, /elsif p_item_id = 'bgm-cucumbergirl-03' then\s+null;/);
    assert.ok(source.includes('PIXEL HEART 구매가 완료됐어. 588피클이 차감됐고'));
    assert.ok(source.includes('insert into public.user_store_items'));
    assert.ok(source.includes('insert into public.pickle_ledger'));
    assert.ok(source.includes('-v_charged_amount'));
    assert.ok(source.includes('and coalesce(pickles, 0) >= v_price'));
    assert.ok(source.includes('for update'));
    assert.ok(source.includes('if v_exists then'));
  }
  assert.match(sql, /position\('bgm-cucumbergirl-03' in v_sql\) = 0/);
  assert.match(sql, /PIXEL_HEART_PURCHASE_ANCHOR_MISMATCH/);
  assert.match(sql, /UNIQUE \(user_id, item_id\)/);
  assert.match(sql, /revoke all on function public.purchase_store_item\(text\) from public, anon/);
  assert.match(sql, /grant execute on function public.purchase_store_item\(text\) to authenticated/);
  assert.doesNotMatch(sql, /drop\s+(?:table|function)|delete\s+from/i);
});

test('루트와 www 상품 원본은 같고 신규 파일만 file-list에 등록된다', async () => {
  assert.deepEqual(await readFile('assets/js/modules/store-data.js'), await readFile('www/assets/js/modules/store-data.js'));
  const paths = (await readFile('file-list.txt', 'utf8')).trim().split('\n');
  for (const file of [SQL_PATH, MIGRATION_PATH, 'tests/pixel-heart-bgm.test.mjs']) {
    assert.equal(paths.filter((entry) => entry === `./${file}`).length, 1, file);
  }
});
