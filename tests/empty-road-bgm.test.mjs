import assert from 'node:assert/strict';
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

const ITEM_ID = 'bgm-potato-02';
const TRACK_ID = 'mallin-oi-empty-road';
const SQL_EDITOR_PATH = 'supabase-SQLEditor/20260802-empty-road-bgm.sql';
const MIGRATION_PATH =
  'supabase/migrations/20260802000000_empty_road_bgm.sql';

test('텅 빈 거리 상품과 BGM 카탈로그가 정확히 한 번 연결된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === ITEM_ID);
  const tracks = BGM_CATALOG.filter((track) => track.id === TRACK_ID);

  assert.equal(products.length, 1);
  assert.equal(tracks.length, 1);
  assert.equal(products[0].name, '텅 빈 거리');
  assert.equal(products[0].category, 'bgm');
  assert.equal(products[0].badge, 'BGM');
  assert.equal(products[0].price, 698);
  assert.equal(products[0].releaseDate, '2026-08-02');
  assert.equal(products[0].isPurchasable, true);
  assert.equal(
    products[0].previewAudioPath,
    '/assets/mp3/Empty-road.mp3?v=test',
  );
  assert.equal(products[0].previewImages.length, 1);
  assert.equal(
    products[0].previewImages[0].imagePath,
    '/images/BGM/Empty-road_LP.png?v=test',
  );
  assert.equal(tracks[0].storeItemId, ITEM_ID);
  assert.equal(tracks[0].artist, '말린오이닷컴');
  assert.equal(tracks[0].displayOrder, 13);
  assert.equal(tracks[0].audioPath, products[0].previewAudioPath);
  assert.equal(tracks[0].coverPath, products[0].thumbImagePath);
});

test('텅 빈 거리가 New 상품과 출시일 정렬의 첫 번째다', () => {
  assert.equal(getFeaturedStoreItems(1)[0].id, ITEM_ID);

  const newest = STORE_ITEMS.toSorted((left, right) => {
    return Date.parse(right.releaseDate) - Date.parse(left.releaseDate);
  });

  assert.equal(newest[0].id, ITEM_ID);
});

test('상품·카탈로그 ID와 BGM displayOrder에 중복이 없다', () => {
  const itemIds = STORE_ITEMS.map((item) => item.id);
  const trackIds = BGM_CATALOG.map((track) => track.id);
  const displayOrders = BGM_CATALOG.map((track) => track.displayOrder);

  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(new Set(trackIds).size, trackIds.length);
  assert.equal(new Set(displayOrders).size, displayOrders.length);
});

test('MP3와 LP PNG의 파일 시그니처·크기·대소문자 경로가 일치한다', async () => {
  const [mp3, png] = await Promise.all([
    readFile('assets/mp3/Empty-road.mp3'),
    readFile('images/BGM/Empty-road_LP.png'),
  ]);

  assert.equal(mp3.subarray(0, 3).toString(), 'ID3');
  assert.equal(mp3.length, 7_042_869);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1254);
  assert.equal(png.readUInt32BE(20), 1254);
  assert.equal(png[25], 2, 'LP PNG must be 8-bit RGB');
});

test('상점 미리듣기는 중복 재생 방지·정리·실패 복구 경로를 유지한다', async () => {
  const [storeJs, bgmPlayerJs] = await Promise.all([
    readFile('assets/js/modules/store.js', 'utf8'),
    readFile('assets/js/modules/bgm-player.js', 'utf8'),
  ]);

  assert.match(storeJs, /destroyStoreItemBgmPreview\(\);/);
  assert.match(storeJs, /new Audio\(audioPath\)/);
  assert.match(storeJs, /audio\.pause\(\);[\s\S]*?audio\.currentTime = 0;/);
  assert.match(storeJs, /mallin:before-pjax-swap/);
  assert.match(storeJs, /window\.addEventListener\('pagehide', stopPreview/);
  assert.match(storeJs, /bgm preview play failed/);
  assert.match(storeJs, /updateStoreItemBgmPreviewUi\(false, item\.name\)/);
  assert.match(bgmPlayerJs, /mallin:store-bgm-preview/);
  assert.match(bgmPlayerJs, /if \(state === 'start'\)/);
  assert.match(bgmPlayerJs, /if \(shouldResume\) \{[\s\S]*?pauseTrack\(\)/);
  assert.match(bgmPlayerJs, /if \(state === 'stop'\)/);
});

test('인벤토리·대표 BGM은 카탈로그 매핑과 서버 보유 검증을 동적으로 사용한다', async () => {
  const [profileJs, featuredSql] = await Promise.all([
    readFile('assets/js/modules/profile.js', 'utf8'),
    readFile('supabase-SQLEditor/20260721-profile-featured-bgm.sql', 'utf8'),
  ]);

  assert.match(profileJs, /ownedStoreItemIds\.has\(track\.storeItemId\)/);
  assert.match(
    profileJs,
    /String\(track\?\.storeItemId \|\| ''\)\.trim\(\) === normalizedItemId/,
  );
  assert.match(featuredSql, /usi\.item_id = v_item_id/);
  assert.match(featuredSql, /usi\.item_category = 'bgm'/);
  assert.doesNotMatch(featuredSql, /bgm-tetocarrto-02/);
});

test('구매 SQL은 698 서버 가격·원자성·원장·엄격 잔액 정책을 포함한다', async () => {
  const [purchaseSql, sqlEditor, migration, backup] = await Promise.all([
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
    readFile(SQL_EDITOR_PATH, 'utf8'),
    readFile(MIGRATION_PATH, 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
  ]);

  assert.equal(migration, sqlEditor);
  assert.ok(backup.includes(sqlEditor));

  for (const source of [purchaseSql, sqlEditor, backup]) {
    assert.match(
      source,
      /p_item_id = 'bgm-potato-02'[\s\S]*?v_price := 698;[\s\S]*?v_name := '텅 빈 거리';[\s\S]*?v_category := 'bgm';/,
    );
    assert.match(source, /텅 빈 거리 구매가 완료됐어\. 698피클이 차감됐고/);
  }

  assert.equal(
    [...purchaseSql.matchAll(/'bgm-potato-02'/g)].length,
    5,
    'price, two strict-balance lists, inventory, and message must reference the item',
  );
  assert.match(purchaseSql, /from public\.profiles p[\s\S]*?for update;/);
  assert.match(
    purchaseSql,
    /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/,
  );
  assert.match(purchaseSql, /insert into public\.user_store_items/);
  assert.match(purchaseSql, /insert into public\.pickle_ledger/);
  assert.match(purchaseSql, /-v_charged_amount/);
  assert.match(purchaseSql, /'store_purchase'/);
  assert.match(purchaseSql, /public\.seoul_today\(\)/);
  assert.match(sqlEditor, /EMPTY_ROAD_ITEM_ID_CONFLICT/);
  assert.match(sqlEditor, /EMPTY_ROAD_EXISTING_BRANCH_MISMATCH/);
  assert.match(sqlEditor, /revoke all[\s\S]*from public, anon;/);
  assert.match(sqlEditor, /grant execute[\s\S]*to authenticated;/);
  assert.match(sqlEditor, /begin;[\s\S]*commit;/i);
});

test('생성된 www 데이터는 루트 원본과 같고 BGM 자산 제외 정책을 유지한다', async () => {
  const [rootStoreData, wwwStoreData, prepareScript] = await Promise.all([
    readFile('assets/js/modules/store-data.js'),
    readFile('www/assets/js/modules/store-data.js'),
    readFile('scripts/prepare-capacitor-web.mjs', 'utf8'),
  ]);

  assert.deepEqual(wwwStoreData, rootStoreData);
  assert.match(prepareScript, /const excludedAssetDirs = new Set\(\['mp3'\]\)/);
  assert.match(prepareScript, /'BGM'/);
});
