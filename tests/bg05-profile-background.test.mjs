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
  PROFILE_BACKGROUND_CATALOG,
  STORE_ITEMS,
  getFeaturedStoreItems,
  getProfileBackgroundByItemId,
} = await import('../assets/js/modules/store-data.js');

const ITEM_ID = 'BG-05';
const ITEM_NAME = '오이소녀의 스테이지';
const DESKTOP_PATH = '/images/profile-background/idolstage.webp?v=test';
const MOBILE_PATH = '/images/profile-background/idolstage-mobile.webp?v=test';
const SQL_EDITOR_PATH =
  'supabase-SQLEditor/20260812-cucumber-girl-stage-profile-background.sql';
const MIGRATION_PATH =
  'supabase/migrations/20260812000000_bg05_cucumber_girl_stage_profile_background.sql';

test('BG-05 상품과 프로필배경 카탈로그가 지정값으로 한 번씩 연결된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === ITEM_ID);
  const backgrounds = PROFILE_BACKGROUND_CATALOG.filter(
    (item) => item.itemId === ITEM_ID,
  );

  assert.equal(products.length, 1);
  assert.equal(backgrounds.length, 1);
  assert.equal(products[0].name, ITEM_NAME);
  assert.equal(products[0].category, 'profile');
  assert.equal(products[0].itemType, 'profile-background');
  assert.equal(products[0].badge, '프로필배경');
  assert.equal(products[0].icon, '🥒🤷🏻‍♀️🎊');
  assert.equal(products[0].price, 626);
  assert.equal(products[0].state, '판매 중');
  assert.equal(products[0].description, '오이소녀의 아이돌 스테이지야.');
  assert.equal(
    products[0].detailDescription,
    '구매하면 인벤토리의 프로필배경 항목에 추가되고, 장착하면 프로필카드 배경에 표시돼.',
  );
  assert.equal(products[0].isPurchasable, true);
  assert.deepEqual(
    products[0].previewImages.map(({ code, label, imagePath }) => ({
      code,
      label,
      imagePath,
    })),
    [
      {
        code: 'BG-05-pc',
        label: 'PC 버전 미리보기',
        imagePath: DESKTOP_PATH,
      },
      {
        code: 'BG-05-mobile',
        label: '모바일 버전 미리보기',
        imagePath: MOBILE_PATH,
      },
    ],
  );
  assert.equal(backgrounds[0].pcImagePath, DESKTOP_PATH);
  assert.equal(backgrounds[0].mobileImagePath, MOBILE_PATH);
  assert.equal(backgrounds[0].thumbImagePath, DESKTOP_PATH);
  assert.equal(backgrounds[0].displayOrder, 5);
  assert.equal(getProfileBackgroundByItemId(ITEM_ID)?.itemId, ITEM_ID);
});

test('BG-05는 주요 상품 첫 번째이고 전체 상품 ID에는 중복이 없다', () => {
  assert.equal(getFeaturedStoreItems(15)[0].id, ITEM_ID);

  const itemIds = STORE_ITEMS.map((item) => item.id);
  const backgroundIds = PROFILE_BACKGROUND_CATALOG.map((item) => item.itemId);

  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(new Set(backgroundIds).size, backgroundIds.length);
});

test('상세·인벤토리·프로필은 기존 프로필배경 반응형 경로를 재사용한다', async () => {
  const [storeJs, profileJs, profileCss, inventoryCss, storeCss] =
    await Promise.all([
      readFile('assets/js/modules/store.js', 'utf8'),
      readFile('assets/js/modules/profile.js', 'utf8'),
      readFile('assets/css/main/profile-main.css', 'utf8'),
      readFile('assets/css/main/inventory-main.css', 'utf8'),
      readFile('assets/css/main/store-main.css', 'utf8'),
    ]);

  assert.match(storeJs, /item\?\.itemType === 'profile-background'/);
  assert.match(storeJs, /store-item-preview__profile-background/);
  assert.match(profileJs, /PROFILE_BACKGROUND_CATALOG/);
  assert.match(profileJs, /getProfileBackgroundByItemId/);
  assert.match(profileJs, /equipped_profile_background_item_id/);
  assert.match(profileJs, /--profile-bg-desktop/);
  assert.match(profileJs, /--profile-bg-mobile/);
  assert.match(profileCss, /background-image: var\(--profile-bg-desktop, none\)/);
  assert.match(
    profileCss,
    /background-image: var\(--profile-bg-mobile, var\(--profile-bg-desktop, none\)\)/,
  );
  assert.match(inventoryCss, /--profile-bg-mobile/);
  assert.match(storeCss, /store-item-preview__profile-background-img/);
  assert.match(storeCss, /object-fit: contain/);
});

test('구매 SQL 네 관리 지점은 626 고정가·보유·원장·엄격 잔액 정책이 일치한다', async () => {
  const [purchaseSql, sqlEditor, migration, backup] = await Promise.all([
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
    readFile(SQL_EDITOR_PATH, 'utf8'),
    readFile(MIGRATION_PATH, 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
  ]);

  assert.equal(sqlEditor, migration);
  assert.ok(backup.endsWith(sqlEditor));
  assert.equal([...purchaseSql.matchAll(/'BG-05'/g)].length, 5);
  assert.match(
    purchaseSql,
    /p_item_id = 'BG-05'[\s\S]*?v_price := 626;[\s\S]*?v_name := '오이소녀의 스테이지';[\s\S]*?v_category := 'profile';/,
  );
  assert.match(
    purchaseSql,
    /p_item_id = 'BG-05'[\s\S]*?user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능[\s\S]*?null;/,
  );
  assert.match(
    purchaseSql,
    /오이소녀의 스테이지 구매가 완료됐어\. 626피클이 차감됐고/,
  );
  assert.equal(
    [
      ...purchaseSql.matchAll(
        /'BG-03',\s*'BG-04',\s*'BG-05',\s*'skin-cucumber-03'/g,
      ),
    ].length,
    2,
  );
  assert.match(purchaseSql, /insert into public\.user_store_items/);
  assert.match(purchaseSql, /insert into public\.pickle_ledger/);
  assert.match(purchaseSql, /'store_purchase'/);
  assert.match(sqlEditor, /BG05_ITEM_ID_CONFLICT/);
  assert.match(sqlEditor, /BG05_PURCHASE_FUNCTION_VERIFY_FAILED/);
  assert.match(sqlEditor, /revoke all[\s\S]*from public, anon;/);
  assert.match(sqlEditor, /grant execute[\s\S]*to authenticated;/);
});

test('Capacitor 준비 목록에 관련 페이지와 BG-05 WebP 경로가 포함된다', async () => {
  const prepareScript = await readFile(
    'scripts/prepare-capacitor-web.mjs',
    'utf8',
  );

  for (const expectedPath of [
    'inventory.html',
    'store.html',
    'store-item.html',
    'profile.html',
    'images/profile-background/idolstage.webp',
    'images/profile-background/idolstage-mobile.webp',
  ]) {
    assert.ok(prepareScript.includes(`'${expectedPath}'`));
  }
});

test('BG-05 WebP 원본과 Capacitor 생성본이 유효하고 서로 일치한다', async () => {
  for (const filename of ['idolstage.webp', 'idolstage-mobile.webp']) {
    const [source, generated] = await Promise.all([
      readFile(`images/profile-background/${filename}`),
      readFile(`www/images/profile-background/${filename}`),
    ]);

    assert.equal(source.subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(source.subarray(8, 12).toString('ascii'), 'WEBP');
    assert.deepEqual(generated, source);
  }
});
