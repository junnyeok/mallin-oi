import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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

const {
  BGM_CATALOG,
  STORE_ITEMS,
  RUN_BGM_PREVIEW,
  MUSCLE_NIGHT_BGM_PREVIEW,
  getFeaturedStoreItems,
} = await import('../assets/js/modules/store-data.js');

const SQL_EDITOR_PATH =
  'supabase-SQLEditor/20260808-run-muscle-night-bgm.sql';
const MIGRATION_PATH =
  'supabase/migrations/20260808000000_run_muscle_night_bgm.sql';

const expected = [
  {
    itemId: 'bgm-cucumbergirl-02',
    trackId: 'mallin-oi-cucumbergirl-run',
    name: 'まだいけるよ',
    description: '오이소녀의 두번째 곡이야.',
    price: 721,
    audio: '/assets/mp3/Run.mp3?v=test',
    audioFile: 'assets/mp3/Run.mp3',
    audioSize: 5_689_979,
    cover: '/images/BGM/Run_LP.png?v=test',
    coverFile: 'images/BGM/Run_LP.png',
    coverSize: 4_087_509,
    previewCode: 'bgm-cucumbergirl-run',
    displayOrder: 14,
  },
  {
    itemId: 'bgm-grilledegg-02',
    trackId: 'mallin-oi-grilledegg-muscle-night',
    name: 'MUSCLE NIGHT',
    description: '벌크업에 성공한 구운계란 형님의 두번째 헬스곡이야.',
    price: 653,
    audio: '/assets/mp3/MUSCLE-NIGHT.mp3?v=test',
    audioFile: 'assets/mp3/MUSCLE-NIGHT.mp3',
    audioSize: 4_417_693,
    cover: '/images/BGM/MUSCLE-NIGHT_LP.png?v=test',
    coverFile: 'images/BGM/MUSCLE-NIGHT_LP.png',
    coverSize: 2_741_533,
    previewCode: 'bgm-grilledegg-muscle-night',
    displayOrder: 15,
  },
];

test('신규 BGM 상품·트랙·미리보기 연결은 각각 정확히 하나다', () => {
  const allPreviewCodes = STORE_ITEMS.flatMap((item) =>
    (item.previewImages || []).map((preview) => preview.code),
  );

  for (const itemSpec of expected) {
    const products = STORE_ITEMS.filter((item) => item.id === itemSpec.itemId);
    const tracks = BGM_CATALOG.filter((track) => track.id === itemSpec.trackId);

    assert.equal(products.length, 1, `${itemSpec.itemId} must be unique`);
    assert.equal(tracks.length, 1, `${itemSpec.trackId} must be unique`);
    assert.equal(
      allPreviewCodes.filter((code) => code === itemSpec.previewCode).length,
      1,
      `${itemSpec.previewCode} must be unique`,
    );

    const [product] = products;
    const [track] = tracks;
    assert.equal(product.name, itemSpec.name);
    assert.equal(product.description, itemSpec.description);
    assert.equal(product.category, 'bgm');
    assert.equal(product.badge, 'BGM');
    assert.equal(product.price, itemSpec.price);
    assert.equal(product.state, '판매 중');
    assert.equal(product.releaseDate, '2026-08-08');
    assert.equal(product.isPurchasable, true);
    assert.equal(product.previewAudioPath, itemSpec.audio);
    assert.equal(product.thumbImagePath, itemSpec.cover);
    assert.equal(product.previewImages.length, 1);
    assert.equal(product.previewImages[0].imagePath, itemSpec.cover);
    assert.equal(track.storeItemId, itemSpec.itemId);
    assert.equal(track.title, itemSpec.name);
    assert.equal(track.artist, '말린오이닷컴');
    assert.equal(track.audioPath, product.previewAudioPath);
    assert.equal(track.coverPath, product.thumbImagePath);
    assert.equal(track.displayOrder, itemSpec.displayOrder);
  }

  assert.equal(RUN_BGM_PREVIEW.length, 1);
  assert.equal(MUSCLE_NIGHT_BGM_PREVIEW.length, 1);
});

test('상품·트랙·displayOrder 전체 중복이 없고 New 순서가 명시적이다', () => {
  const itemIds = STORE_ITEMS.map((item) => item.id);
  const trackIds = BGM_CATALOG.map((track) => track.id);
  const displayOrders = BGM_CATALOG.map((track) => track.displayOrder);

  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(new Set(trackIds).size, trackIds.length);
  assert.equal(new Set(displayOrders).size, displayOrders.length);
  assert.deepEqual(
    getFeaturedStoreItems(6).map((item) => item.id),
    [
      'BG-05',
      'skin-cucumber-05',
      'skin-cucumberboy-02',
      'bgm-cucumbergirl-02',
      'bgm-grilledegg-02',
      'cha-effects-web-01',
    ],
  );
});

test('사이트 MP3·LP PNG 경로, 대소문자, 시그니처와 크기가 정확하다', async () => {
  const storeDataSource = await readFile(
    'assets/js/modules/store-data.js',
    'utf8',
  );
  assert.equal(storeDataSource.includes(['Run', 'road.mp3'].join('-')), false);

  for (const itemSpec of expected) {
    const [audio, cover, audioStat, coverStat] = await Promise.all([
      readFile(itemSpec.audioFile),
      readFile(itemSpec.coverFile),
      stat(itemSpec.audioFile),
      stat(itemSpec.coverFile),
    ]);

    assert.equal(audio.subarray(0, 3).toString(), 'ID3');
    assert.equal(audioStat.size, itemSpec.audioSize);
    assert.equal(cover.subarray(1, 4).toString(), 'PNG');
    assert.equal(cover.readUInt32BE(16), 1254);
    assert.equal(cover.readUInt32BE(20), 1254);
    assert.equal(cover[25], 2, 'LP PNG must be 8-bit RGB');
    assert.equal(coverStat.size, itemSpec.coverSize);
  }
});

test('상점 미리듣기·BGM 복원·인벤토리·대표 BGM·구매 내역은 공통 동적 경로를 유지한다', async () => {
  const [storeJs, bgmPlayerJs, profileJs, historyJs, featuredSql] =
    await Promise.all([
      readFile('assets/js/modules/store.js', 'utf8'),
      readFile('assets/js/modules/bgm-player.js', 'utf8'),
      readFile('assets/js/modules/profile.js', 'utf8'),
      readFile('assets/js/modules/profile-history.js', 'utf8'),
      readFile(
        'supabase-SQLEditor/20260721-profile-featured-bgm.sql',
        'utf8',
      ),
    ]);

  assert.match(storeJs, /destroyStoreItemBgmPreview\(\);/);
  assert.match(storeJs, /new Audio\(audioPath\)/);
  assert.match(storeJs, /mallin:before-pjax-swap/);
  assert.match(storeJs, /window\.addEventListener\('pagehide', stopPreview/);
  assert.match(bgmPlayerJs, /mallin:store-bgm-preview/);
  assert.match(bgmPlayerJs, /if \(shouldResume\) \{[\s\S]*?pauseTrack\(\)/);
  assert.match(profileJs, /ownedStoreItemIds\.has\(track\.storeItemId\)/);
  assert.match(
    profileJs,
    /String\(track\?\.storeItemId \|\| ''\)\.trim\(\) === normalizedItemId/,
  );
  assert.match(featuredSql, /usi\.item_id = v_item_id/);
  assert.match(featuredSql, /usi\.item_category = 'bgm'/);
  assert.doesNotMatch(featuredSql, /bgm-cucumbergirl-02|bgm-grilledegg-02/);
  assert.match(historyJs, /\.from\('pickle_ledger'\)/);
  assert.match(historyJs, /amount > 0 \? `\+\$\{amount\} 피클` : `\$\{amount\} 피클`/);
});

test('구매 SQL은 서버 고정 가격·원자성·엄격 잔액·원장·권한을 보장한다', async () => {
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
      /p_item_id = 'bgm-cucumbergirl-02'[\s\S]*?v_price := 721;[\s\S]*?v_name := 'まだいけるよ';[\s\S]*?v_category := 'bgm';/,
    );
    assert.match(
      source,
      /p_item_id = 'bgm-grilledegg-02'[\s\S]*?v_price := 653;[\s\S]*?v_name := 'MUSCLE NIGHT';[\s\S]*?v_category := 'bgm';/,
    );
    assert.match(source, /まだいけるよ 구매가 완료됐어\. 721피클이 차감됐고/);
    assert.match(source, /MUSCLE NIGHT 구매가 완료됐어\. 653피클이 차감됐고/);
  }

  for (const itemSpec of expected) {
    assert.equal(
      [...purchaseSql.matchAll(new RegExp(`'${itemSpec.itemId}'`, 'g'))]
        .length,
      5,
      `${itemSpec.itemId} must occur in price, two strict lists, inventory, message`,
    );
  }

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
  assert.match(sqlEditor, /RUN_BGM_ITEM_ID_CONFLICT/);
  assert.match(sqlEditor, /MUSCLE_NIGHT_BGM_ITEM_ID_CONFLICT/);
  assert.match(sqlEditor, /RUN_MUSCLE_NIGHT_EXISTING_BRANCH_MISMATCH/);
  assert.match(sqlEditor, /revoke all[\s\S]*from public, anon;/);
  assert.match(sqlEditor, /grant execute[\s\S]*to authenticated;/);
  assert.match(sqlEditor, /begin;[\s\S]*commit;/i);
});

test('루트와 www 데이터는 일치하고 앱의 BGM 원본 제외 정책은 유지된다', async () => {
  const [rootStoreData, wwwStoreData, prepareScript] = await Promise.all([
    readFile('assets/js/modules/store-data.js'),
    readFile('www/assets/js/modules/store-data.js'),
    readFile('scripts/prepare-capacitor-web.mjs', 'utf8'),
  ]);

  assert.deepEqual(wwwStoreData, rootStoreData);
  assert.match(prepareScript, /const excludedAssetDirs = new Set\(\['mp3'\]\)/);
  assert.match(prepareScript, /'BGM'/);
});
