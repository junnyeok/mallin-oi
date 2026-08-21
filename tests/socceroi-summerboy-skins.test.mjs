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
  getSkinParentRequirementByStoreItemId,
} = await import('../assets/js/modules/store-data.js');

const SKINS = [
  {
    itemId: 'skin-cucumber-05',
    name: '카를레스 푸오이욜',
    description: '이번 월드컵을 우승했어.',
    price: 587,
    characterCode: 'char-cucumber',
    characterName: '기본오이',
    parentStoreItemId: null,
    skinCode: 'char-cucumber-socceroi',
    imageFile: 'socceroi.png',
    displayOrder: 5,
  },
  {
    itemId: 'skin-cucumberboy-02',
    name: '여름 기동보이 오이소년',
    description: '더운 날 휴대용 선풍기는 필수야.',
    price: 721,
    characterCode: 'char-cucumber-boy',
    characterName: '오이소년 캐릭터',
    parentStoreItemId: 'character-cucumberboy-01',
    skinCode: 'char-cucumber-boy-summer',
    imageFile: 'summerboy.png',
    displayOrder: 503,
  },
];

const SQL_EDITOR_PATH =
  'supabase-SQLEditor/20260809-socceroi-summerboy-skins.sql';
const MIGRATION_PATH =
  'supabase/migrations/20260809000000_socceroi_summerboy_skins.sql';

test('신규 스킨 2종이 지정 가격·이미지·설명으로 한 번씩 등록되고 BG-05 다음에 노출된다', () => {
  for (const expected of SKINS) {
    const products = STORE_ITEMS.filter((item) => item.id === expected.itemId);

    assert.equal(products.length, 1);
    assert.equal(products[0].name, expected.name);
    assert.equal(products[0].description, expected.description);
    assert.equal(products[0].category, 'skin');
    assert.equal(products[0].badge, '스킨');
    assert.equal(products[0].price, expected.price);
    assert.equal(products[0].releaseDate, '2026-08-09');
    assert.equal(products[0].state, '판매 중');
    assert.equal(products[0].isPurchasable, true);
    assert.equal(
      products[0].thumbImagePath,
      `/images/skins/${expected.imageFile}?v=test`,
    );
    assert.equal(products[0].previewImages.length, 1);
    assert.equal(products[0].previewImages[0].label, expected.name);
    assert.equal(
      products[0].previewImages[0].imagePath,
      products[0].thumbImagePath,
    );
  }

  assert.deepEqual(
    getFeaturedStoreItems(4)
      .slice(2)
      .map((item) => item.id),
    SKINS.map((item) => item.itemId),
  );
});

test('각 스킨은 지정 캐릭터 카탈로그에만 연결되고 부모 캐릭터 조건을 노출한다', () => {
  for (const expected of SKINS) {
    const catalogRows = CHARACTER_SKIN_CATALOG.filter(
      (item) => item.store_item_id === expected.itemId,
    );

    assert.equal(catalogRows.length, 1);
    assert.equal(catalogRows[0].character_code, expected.characterCode);
    assert.equal(catalogRows[0].skin_code, expected.skinCode);
    assert.equal(catalogRows[0].skin_name, expected.name);
    assert.equal(catalogRows[0].display_order, expected.displayOrder);
    assert.equal(
      catalogRows[0].image_path,
      `/images/skins/${expected.imageFile}?v=test`,
    );

    assert.deepEqual(
      getSkinParentRequirementByStoreItemId(expected.itemId),
      {
        character_code: expected.characterCode,
        character_name: expected.characterName,
        parent_store_item_id: expected.parentStoreItemId,
      },
    );
  }

  const itemIds = STORE_ITEMS.map((item) => item.id);
  const skinCodes = CHARACTER_SKIN_CATALOG.map((item) => item.skin_code);
  const displayOrders = CHARACTER_SKIN_CATALOG.map(
    (item) => item.display_order,
  );

  assert.equal(new Set(itemIds).size, itemIds.length);
  assert.equal(new Set(skinCodes).size, skinCodes.length);
  assert.equal(new Set(displayOrders).size, displayOrders.length);
});

test('투명 PNG 원본과 앱 복사본이 동일하고 앱 준비 목록에 두 자산이 포함된다', async () => {
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
    assert.equal(rootImage[25], 6, 'PNG must use RGBA color type');
    assert.match(
      prepareScript,
      new RegExp(`'images/skins/${expected.imageFile.replace('.', '\\.')}'`),
    );
  }
});

test('구매 SQL은 서버 고정 가격·호환 캐릭터·인벤토리·원장·엄격 잔액 정책을 포함한다', async () => {
  const [purchaseSql, migration, sqlEditor, backup] = await Promise.all([
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
    readFile(MIGRATION_PATH, 'utf8'),
    readFile(SQL_EDITOR_PATH, 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
  ]);

  assert.equal(sqlEditor, migration);
  assert.ok(backup.includes(sqlEditor));

  for (const expected of SKINS) {
    assert.equal(
      [...purchaseSql.matchAll(new RegExp(`'${expected.itemId}'`, 'g'))]
        .length,
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

  const strictBalancePattern = /'skin-cucumber-03',\s*'skin-cucumber-04',\s*'skin-cucumber-05',\s*'skin-cucumberboy-02',\s*'skin-grilled-egg-02'/g;
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

  assert.match(migration, /SOCCEROI_SUMMERBOY_ITEM_ID_CONFLICT/);
  assert.match(migration, /SOCCEROI_SUMMERBOY_SKIN_CODE_CONFLICT/);
  assert.match(migration, /SOCCEROI_SUMMERBOY_EXISTING_BRANCH_MISMATCH/);
  assert.match(migration, /SOCCEROI_SUMMERBOY_EQUIP_TRIGGER_MISSING/);
  assert.match(migration, /SOCCEROI_SUMMERBOY_EQUIP_TRIGGER_MISMATCH/);
  assert.match(migration, /revoke all[\s\S]*from public, anon;/);
  assert.match(migration, /grant execute[\s\S]*to authenticated;/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});

test('공통 장착 이미지 값이 프로필·인벤토리·게시물·댓글·답글 표시 경로로 이어진다', async () => {
  const [
    rootStoreData,
    mobileStoreData,
    storeJs,
    profileJs,
    postDetailJs,
    commentsJs,
  ] = await Promise.all([
    readFile('assets/js/modules/store-data.js'),
    readFile('www/assets/js/modules/store-data.js'),
    readFile('assets/js/modules/store.js', 'utf8'),
    readFile('assets/js/modules/profile.js', 'utf8'),
    readFile('assets/js/modules/post-detail.js', 'utf8'),
    readFile('assets/js/modules/post-comments.js', 'utf8'),
  ]);

  assert.deepEqual(mobileStoreData, rootStoreData);
  assert.match(storeJs, /getSkinParentRequirementByStoreItemId\(item\.id\)/);
  assert.match(storeJs, /loadOwnedCharacterCodes\(\)/);
  assert.match(profileJs, /CHARACTER_SKIN_CATALOG\.map\(\(item\) =>/);
  assert.match(profileJs, /is_parent_owned/);
  assert.match(profileJs, /data-can-equip/);
  assert.match(profileJs, /equipped_character_image_url: nextImagePath/);
  assert.match(
    postDetailJs,
    /select\('id, equipped_character_image_url'\)/,
  );
  assert.match(
    commentsJs,
    /profile_image_url, equipped_character_image_url, equipped_character_effect_item_id/,
  );
  assert.match(commentsJs, /renderAuthorProfileLink\([\s\S]*characterImageUrl/);
});
