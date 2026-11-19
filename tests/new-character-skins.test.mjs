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
  CHARACTER_SKIN_CATALOG,
  STORE_ITEMS,
  getFeaturedStoreItems,
  getSkinCatalogItemBySkinCode,
  getSkinParentRequirementByStoreItemId,
  getStoreItemById,
} = await import('../assets/js/modules/store-data.js');

const SKINS = [
  {
    itemId: 'skin-cucumber-04',
    name: '당신의 친절한 오이',
    price: 621,
    characterCode: 'char-cucumber',
    skinCode: 'char-cucumber-kind',
    imageFile: 'spioi.png',
    displayOrder: 4,
  },
  {
    itemId: 'skin-grilled-egg-02',
    name: '이놈스케',
    price: 689,
    characterCode: 'char-grilled-egg',
    skinCode: 'char-grilled-egg-inomske',
    imageFile: 'inomske.png',
    displayOrder: 403,
  },
];

const RETIRED_SKINS = [
  ...SKINS,
  { itemId: 'skin-cucumber-03', skinCode: 'char-cucumber-ozyo' },
  { itemId: 'skin-cucumber-07', skinCode: 'char-cucumber-daegu' },
];

const SQL_EDITOR_PATH =
  'supabase-SQLEditor/20260803-new-character-skins.sql';
const MIGRATION_PATH =
  'supabase/migrations/20260803010000_new_character_skins.sql';

test('판매 종료 스킨 4종을 상점 목록·추천·상품 상세에서 찾을 수 없다', () => {
  const featuredIds = new Set(getFeaturedStoreItems(STORE_ITEMS.length).map((item) => item.id));
  for (const { itemId } of RETIRED_SKINS) {
    assert.equal(getStoreItemById(itemId), null, itemId);
    assert.equal(featuredIds.has(itemId), false, itemId);
  }

  const background = getStoreItemById('BG-06');
  assert.equal(background.name, 'DGB PARK');
  assert.equal(background.isPurchasable, true);
  assert.equal(featuredIds.has(background.id), true);
});

test('판매 종료 스킨 4종은 미보유 인벤토리에도 나타나지 않는다', () => {
  for (const { itemId, skinCode } of RETIRED_SKINS) {
    assert.equal(getSkinCatalogItemBySkinCode(skinCode), null, skinCode);
    assert.equal(getSkinParentRequirementByStoreItemId(itemId), null, itemId);
  }

  assert.equal(getSkinCatalogItemBySkinCode('char-cucumber-basic').skin_name, '기본오이');

  const itemIds = STORE_ITEMS.map((item) => item.id);
  const skinCodes = CHARACTER_SKIN_CATALOG.map((item) => item.skin_code);
  const displayOrders = CHARACTER_SKIN_CATALOG.map(
    (item) => item.display_order,
  );

  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(new Set(skinCodes).size, skinCodes.length);
  assert.equal(new Set(displayOrders).size, displayOrders.length);
});

test('원본·모바일 PNG가 동일하고 앱 준비 목록에 두 자산이 포함된다', async () => {
  const prepareScript = await readFile(
    'scripts/prepare-capacitor-web.mjs',
    'utf8',
  );

  for (const expected of SKINS) {
    const [rootImage, mobileImage] = await Promise.all([
      readFile(`images/skins/${expected.imageFile}`),
      readFile(`www/images/skins/${expected.imageFile}`),
    ]);

    assert.deepEqual(mobileImage, rootImage);
    assert.equal(rootImage.subarray(1, 4).toString(), 'PNG');
    assert.equal(rootImage.readUInt32BE(16), 1024);
    assert.equal(rootImage.readUInt32BE(20), 1536);
    assert.match(
      prepareScript,
      new RegExp(`'images/skins/${expected.imageFile.replace('.', '\\.')}'`),
    );
  }
});

test('구매 SQL은 서버 가격·캐릭터 제한·스킨 지급·원장·엄격 잔액 정책을 포함한다', async () => {
  const [purchaseSql, migration, sqlEditor, backup] = await Promise.all([
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
    readFile(MIGRATION_PATH, 'utf8'),
    readFile(SQL_EDITOR_PATH, 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
  ]);

  assert.equal(sqlEditor, migration);
  assert.ok(backup.includes(sqlEditor));

  const productBranches = purchaseSql.slice(purchaseSql.indexOf("if p_item_id = 'emo-basic-01' then"));
  for (const expected of SKINS) {
    assert.equal(
      [...productBranches.matchAll(new RegExp(`'${expected.itemId}'`, 'g'))].length,
      5,
      `${expected.itemId} must appear in price, two strict lists, inventory, and message`,
    );

    assert.match(
      purchaseSql,
      new RegExp(
        `p_item_id = '${expected.itemId}'[\\s\\S]*?` +
          `v_price := ${expected.price};[\\s\\S]*?` +
          `v_name := '${expected.name}';[\\s\\S]*?` +
          `v_category := 'skin';[\\s\\S]*?` +
          `v_required_character_code := '${expected.characterCode}';`,
      ),
    );
    assert.match(
      purchaseSql,
      new RegExp(
        `p_item_id = '${expected.itemId}'[\\s\\S]*?` +
          `'${expected.characterCode}',[\\s\\S]*?` +
          `'${expected.skinCode}',[\\s\\S]*?` +
          `'${expected.name}',[\\s\\S]*?` +
          `'\\./images/skins/${expected.imageFile.replace('.', '\\.')}',[\\s\\S]*?` +
          `${expected.displayOrder},[\\s\\S]*?'store_purchase'`,
      ),
    );
    assert.match(
      purchaseSql,
      new RegExp(
        `${expected.name} 구매가 완료됐어\\. ${expected.price}피클이 차감됐고`,
      ),
    );
  }

  const strictBalancePattern = /'skin-cucumber-03',\s*'skin-cucumber-04',\s*'skin-cucumber-05',\s*'skin-cucumberboy-02',\s*'skin-grilled-egg-02',\s*'cha-effects-fire-01'/g;
  assert.equal([...purchaseSql.matchAll(strictBalancePattern)].length, 2);
  assert.match(
    purchaseSql,
    /v_category = 'skin'[\s\S]*?v_required_character_code <> 'char-cucumber'[\s\S]*?from public\.user_characters/,
  );
  assert.match(purchaseSql, /from public\.profiles p[\s\S]*?for update;/);
  assert.match(
    purchaseSql,
    /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/,
  );
  assert.match(purchaseSql, /insert into public\.user_store_items/);
  assert.match(purchaseSql, /insert into public\.user_character_skins/);
  assert.match(purchaseSql, /insert into public\.pickle_ledger/);
  assert.match(purchaseSql, /-v_charged_amount/);
  assert.match(purchaseSql, /'store_purchase'/);
  assert.match(purchaseSql, /public\.seoul_today\(\)/);
  assert.match(
    purchaseSql,
    /enforce_equipped_character_ownership[\s\S]*?from public\.user_character_skins s[\s\S]*?join public\.user_characters c[\s\S]*?c\.character_code = s\.character_code[\s\S]*?s\.image_path = new\.equipped_character_image_url/,
  );

  assert.match(migration, /NEW_CHARACTER_SKINS_ITEM_ID_CONFLICT/);
  assert.match(migration, /NEW_CHARACTER_SKINS_SKIN_CODE_CONFLICT/);
  assert.match(migration, /NEW_CHARACTER_SKINS_EXISTING_BRANCH_MISMATCH/);
  assert.match(migration, /NEW_CHARACTER_SKINS_EQUIP_TRIGGER_MISSING/);
  assert.match(migration, /NEW_CHARACTER_SKINS_EQUIP_TRIGGER_MISMATCH/);
  assert.match(migration, /revoke all[\s\S]*from public, anon;/);
  assert.match(migration, /grant execute[\s\S]*to authenticated;/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});

test('인벤토리 장착값이 프로필·게시물·댓글 표시 경로로 이어진다', async () => {
  const [rootStoreData, mobileStoreData, rootVersion, mobileVersion, serviceWorker, storeJs, profileJs, postDetailJs, commentsJs] =
    await Promise.all([
      readFile('assets/js/modules/store-data.js'),
      readFile('www/assets/js/modules/store-data.js'),
      readFile('assets/version.json', 'utf8'),
      readFile('www/assets/version.json', 'utf8'),
      readFile('sw.js', 'utf8'),
      readFile('assets/js/modules/store.js', 'utf8'),
      readFile('assets/js/modules/profile.js', 'utf8'),
      readFile('assets/js/modules/post-detail.js', 'utf8'),
      readFile('assets/js/modules/post-comments.js', 'utf8'),
    ]);

  assert.deepEqual(mobileStoreData, rootStoreData);
  assert.equal(mobileVersion, rootVersion);
  const siteVersion = JSON.parse(rootVersion).siteVersion;
  assert.match(siteVersion, /^\d{8}-\d{2}$/);
  assert.match(serviceWorker, new RegExp(`const SITE_VERSION = '${siteVersion}';`));
  assert.match(storeJs, /const item = getStoreItemById\(itemId\);\s*if \(!item\) \{[\s\S]*?품목 정보를 찾지 못했어/);
  assert.match(storeJs, /getSkinParentRequirementByStoreItemId\(item\.id\)/);
  assert.match(storeJs, /loadOwnedCharacterCodes\(\)/);
  assert.match(profileJs, /CHARACTER_SKIN_CATALOG\.map\(\(item\) =>/);
  assert.match(profileJs, /is_parent_owned/);
  assert.match(profileJs, /data-can-equip/);
  assert.match(
    profileJs,
    /equipped_character_image_url: nextImagePath/,
  );
  assert.match(
    postDetailJs,
    /select\('id, equipped_character_image_url'\)/,
  );
  assert.match(
    commentsJs,
    /profile_image_url, equipped_character_image_url, equipped_character_effect_item_id/,
  );
});
