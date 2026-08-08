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

const {
  PROFILE_FRAME_CATALOG,
  STORE_ITEMS,
  getFeaturedStoreItems,
  getProfileFrameByItemId,
} = await import('../assets/js/modules/store-data.js');

const ITEM_ID = 'BF-02';
const ITEM_NAME = '말린오이 테마 빛나는 테두리';
const MIGRATION_PATH =
  'supabase/migrations/20260728060000_bf02_mallin_shiny_profile_frame.sql';
const SQL_EDITOR_PATH =
  'supabase-SQLEditor/20260728-mallin-shiny-profile-frame.sql';

test('BF-02 상품과 프로필테두리 카탈로그가 정확히 한 번 연결된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === ITEM_ID);
  const frames = PROFILE_FRAME_CATALOG.filter(
    (item) => item.itemId === ITEM_ID,
  );

  assert.equal(products.length, 1);
  assert.equal(frames.length, 1);
  assert.equal(products[0].name, ITEM_NAME);
  assert.equal(products[0].category, 'profile');
  assert.equal(products[0].itemType, 'profile-frame');
  assert.equal(products[0].price, 488);
  assert.equal(products[0].isPurchasable, true);
  assert.deepEqual(
    products[0].previewImages.map(({ code, label }) => ({ code, label })),
    [
      { code: 'BF-02-pc', label: 'PC 버전 미리보기' },
      { code: 'BF-02-mobile', label: '모바일 버전 미리보기' },
    ],
  );
  assert.equal(
    frames[0].pcImagePath,
    '/images/profile-frame/mallin-shiny.png?v=test',
  );
  assert.equal(
    frames[0].mobileImagePath,
    '/images/profile-frame/mallin-shiny-mobile.png?v=test',
  );
  assert.equal(getProfileFrameByItemId(ITEM_ID)?.itemId, ITEM_ID);
});

test('BF-02가 신규 BGM 2곡·거미줄 효과·신규 스킨 2종·텅 빈 거리 다음 New 상품이다', async () => {
  assert.equal(getFeaturedStoreItems(7)[6].id, ITEM_ID);

  const homeHtml = await readFile('index.html', 'utf8');
  assert.match(
    homeHtml,
    /<h2 class="home-section__title">🛍️ New 상품 품목<\/h2>/,
  );
  assert.doesNotMatch(homeHtml, /🛍️ NEW 상품 품목/);

  const newest = STORE_ITEMS.toSorted((left, right) => {
    const difference =
      Date.parse(right.releaseDate) - Date.parse(left.releaseDate);
    return difference;
  });

  assert.equal(newest[0].id, 'bgm-cucumbergirl-02');
  assert.equal(newest[1].id, 'bgm-grilledegg-02');
  assert.equal(newest[2].id, 'cha-effects-web-01');
  assert.equal(newest[3].id, 'skin-cucumber-04');
  assert.equal(newest[4].id, 'skin-grilled-egg-02');
  assert.equal(newest[5].id, 'bgm-potato-02');
  assert.equal(newest[6].id, ITEM_ID);
});

test('PC·모바일 PNG가 요청한 RGBA 크기와 종횡비를 유지한다', async () => {
  const [desktop, mobile] = await Promise.all([
    readFile('images/profile-frame/mallin-shiny.png'),
    readFile('images/profile-frame/mallin-shiny-mobile.png'),
  ]);

  assert.equal(desktop.subarray(1, 4).toString(), 'PNG');
  assert.equal(desktop.readUInt32BE(16), 1484);
  assert.equal(desktop.readUInt32BE(20), 1060);
  assert.equal(desktop[25], 6, 'desktop PNG must include alpha');
  assert.equal(mobile.subarray(1, 4).toString(), 'PNG');
  assert.equal(mobile.readUInt32BE(16), 957);
  assert.equal(mobile.readUInt32BE(20), 1643);
  assert.equal(mobile[25], 6, 'mobile PNG must include alpha');
});

test('프로필 프레임은 장착 화면과 상점에서 이동 반짝임·모션 감소를 적용한다', async () => {
  const [profileJs, storeJs, profileCss, inventoryCss, storeCss] =
    await Promise.all([
    readFile('assets/js/modules/profile.js', 'utf8'),
    readFile('assets/js/modules/store.js', 'utf8'),
    readFile('assets/css/main/profile-main.css', 'utf8'),
    readFile('assets/css/main/inventory-main.css', 'utf8'),
    readFile('assets/css/main/store-main.css', 'utf8'),
    ]);

  assert.match(profileJs, /MALLIN_SHINY_FRAME_ITEM_ID = 'BF-02'/);
  assert.match(profileJs, /MALLIN_SHINY_SPARKLE_COUNT = 4/);
  assert.match(profileJs, /syncMallinShinyFrameMotion/);
  assert.match(profileJs, /existingMotionEl\?\.remove\(\)/);
  assert.match(profileJs, /has-profile-frame--mallin-shiny/);
  assert.match(profileCss, /@keyframes profile-frame-mallin-shiny-breathe/);
  assert.match(profileCss, /@keyframes profile-frame-mallin-shiny-orbit/);
  assert.doesNotMatch(profileCss, /profile-frame-mallin-shiny-glow/);
  assert.match(profileCss, /offset-distance: 100%/);
  assert.match(profileCss, /offset-path: inset\(/);
  assert.match(profileCss, /@supports \(offset-position: normal\)/);
  assert.match(profileCss, /profile-frame-motion__sparkle:nth-child\(4\)/);
  assert.match(profileCss, /border-image-slice: 110 103 109 103/);
  assert.match(profileCss, /border-image-slice: 111 119 104 117/);
  assert.match(inventoryCss, /border-image-slice: 110 103 109 103/);
  assert.match(inventoryCss, /border-image-slice: 111 119 104 117/);
  assert.match(profileCss, /filter: brightness\(/);
  assert.match(profileCss, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    profileCss,
    /has-profile-frame--mallin-shiny > \.profile-frame-motion[\s\S]*?display: none;/,
  );
  assert.match(
    profileCss,
    /profile-card\.has-profile-frame::after[\s\S]*?pointer-events: none;/,
  );
  assert.match(storeCss, /store-item-preview__profile-frame-img/);
  assert.match(storeCss, /max-height: 520px;/);
  assert.match(storeCss, /object-fit: contain;/);
  assert.match(storeJs, /MALLIN_SHINY_FRAME_ITEM_ID = 'BF-02'/);
  assert.match(storeJs, /STORE_MALLIN_SHINY_SPARKLE_COUNT = 4/);
  assert.match(storeJs, /renderMallinShinyFrameMotion/);
  assert.match(storeJs, /store-mallin-shiny-frame--\$\{variant\}/);
  assert.match(storeJs, /store-profile-frame-motion__sparkle/);
  assert.match(
    storeCss,
    /@keyframes store-profile-frame-mallin-shiny-breathe/,
  );
  assert.match(
    storeCss,
    /@keyframes store-profile-frame-mallin-shiny-orbit/,
  );
  assert.match(storeCss, /offset-distance: 100%/);
  assert.match(storeCss, /store-mallin-shiny-frame--thumb/);
  assert.match(
    storeCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.store-mallin-shiny-frame > \.store-profile-frame-motion[\s\S]*?display: none;/,
  );
});

test('구매 SQL은 488 서버 가격·엄격 잔액·원장·장착 보유 검증을 포함한다', async () => {
  const [purchaseSql, migration, sqlEditor, backup] = await Promise.all([
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
    readFile(MIGRATION_PATH, 'utf8'),
    readFile(SQL_EDITOR_PATH, 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
  ]);

  assert.equal(migration, sqlEditor);

  for (const source of [purchaseSql, migration, backup]) {
    assert.match(
      source,
      /p_item_id = 'BF-02'[\s\S]*?v_price := 488;[\s\S]*?v_name := '말린오이 테마 빛나는 테두리';[\s\S]*?v_category := 'profile';/,
    );
    assert.match(source, /말린오이 테마 빛나는 테두리 구매/);
  }

  assert.match(
    purchaseSql,
    /v_can_bypass_store_balance :=[\s\S]*?'bgm-tetocarrto-02',[\s\S]*?'BF-02'[\s\S]*?and exists/,
  );
  assert.match(
    purchaseSql,
    /v_is_auto_topup_admin[\s\S]*?'bgm-tetocarrto-02',[\s\S]*?'BF-02'[\s\S]*?perform public\.ensure_user_pickles/,
  );
  assert.match(purchaseSql, /from public\.profiles p[\s\S]*?for update;/);
  assert.match(
    purchaseSql,
    /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/,
  );
  assert.match(purchaseSql, /insert into public\.user_store_items/);
  assert.match(purchaseSql, /insert into public\.pickle_ledger/);
  assert.match(migration, /usi\.item_id in \('BF-01', 'BF-02'\)/);
  assert.match(migration, /BF02_PURCHASE_PERMISSION_VERIFY_FAILED/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});

test('Capacitor 동기화 대상에 상점 페이지와 모든 프로필테두리 이미지가 포함된다', async () => {
  const prepareScript = await readFile(
    'scripts/prepare-capacitor-web.mjs',
    'utf8',
  );

  assert.match(prepareScript, /'store\.html'/);
  assert.match(prepareScript, /'store-item\.html'/);
  assert.match(prepareScript, /nativeProfileFrameImageFiles/);
  assert.match(prepareScript, /images\/profile-frame\/mallin-shiny\.png/);
  assert.match(
    prepareScript,
    /images\/profile-frame\/mallin-shiny-mobile\.png/,
  );
});

test('BF-02 관련 루트 배포 파일과 www 미러가 일치한다', async () => {
  const mirrors = [
    'store.html',
    'store-item.html',
    'assets/css/main/profile-main.css',
    'assets/css/main/inventory-main.css',
    'assets/css/main/store-main.css',
    'assets/js/modules/profile.js',
    'assets/js/modules/store-data.js',
    'assets/js/modules/store.js',
    'images/profile-frame/mallin-shiny.png',
    'images/profile-frame/mallin-shiny-mobile.png',
  ];

  await Promise.all(
    mirrors.map(async (path) => {
      assert.deepEqual(
        await readFile(path),
        await readFile(`www/${path}`),
        `${path} must match www/${path}`,
      );
    }),
  );
});
