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
  CUCUMBER_BOY_EMOTICON_PACK,
  STORE_ITEMS,
  getFeaturedStoreItems,
} = await import('../assets/js/modules/store-data.js');

const ITEM_ID = 'emo-cucumberboy-01';
const MIGRATION_PATH =
  'supabase/migrations/20260821000000_cucumber_boy_emoticon_pack.sql';
const SQL_EDITOR_PATH =
  'supabase-SQLEditor/20260821-cucumber-boy-emoticon-pack.sql';

test('오이소년 이모티콘팩 상품과 10개 미리보기가 지정 내용으로 등록된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === ITEM_ID);

  assert.equal(products.length, 1);

  const [product] = products;
  assert.equal(product.name, '오이소년 이모티콘팩');
  assert.equal(product.category, 'emoticon');
  assert.equal(product.badge, '이모티콘');
  assert.equal(product.icon, '🥒👦');
  assert.equal(product.price, 391);
  assert.equal(product.state, '판매 중');
  assert.equal(
    product.description,
    '오이소년의 스티커 느낌의 이모티콘 팩이야.',
  );
  assert.equal(product.detailDescription, product.description);
  assert.equal(product.releaseDate, '2026-08-21');
  assert.equal(product.isPurchasable, true);
  assert.equal(
    product.thumbImagePath,
    '/images/emoticons/emo-cucumberboy-01.png?v=test',
  );
  assert.equal(product.previewImages, CUCUMBER_BOY_EMOTICON_PACK);
  assert.equal(product.previewImages.length, 10);

  product.previewImages.forEach((emoticon, index) => {
    const order = index + 1;
    const paddedOrder = String(order).padStart(2, '0');

    assert.equal(emoticon.code, `cucumberboy-${order}`);
    assert.equal(emoticon.label, `오이소년 이모티콘 ${order}`);
    assert.equal(emoticon.displayOrder, 1100 + order);
    assert.equal(
      emoticon.imagePath,
      `/images/emoticons/emo-cucumberboy-${paddedOrder}.png?v=test`,
    );
  });
});

test('오이소년 이모티콘팩이 브로콜리 알바생과 PIXEL HEART 다음에 노출된다', () => {
  assert.equal(getFeaturedStoreItems(3)[2]?.id, ITEM_ID);
});

test('루트·앱 이미지와 공통 이모티콘 선택기 연결이 모두 포함된다', async () => {
  const [emoticonSource, prepareSource, rootStoreData, mobileStoreData] =
    await Promise.all([
      readFile('assets/js/modules/emoticons.js', 'utf8'),
      readFile('scripts/prepare-capacitor-web.mjs', 'utf8'),
      readFile('assets/js/modules/store-data.js'),
      readFile('www/assets/js/modules/store-data.js'),
    ]);

  assert.deepEqual(mobileStoreData, rootStoreData);
  assert.match(emoticonSource, /\.\.\.CUCUMBER_BOY_EMOTICON_PACK/);
  assert.match(emoticonSource, /itemId: 'emo-cucumberboy-01'/);
  assert.match(emoticonSource, /prefix: 'cucumberboy-'/);
  assert.match(
    emoticonSource,
    /safeItemId === 'emo-cucumberboy-01'[\s\S]*?return CUCUMBER_BOY_EMOTICON_PACK/,
  );
  assert.match(prepareSource, /nativeEmoticonImageFiles/);

  for (let order = 1; order <= 10; order += 1) {
    const paddedOrder = String(order).padStart(2, '0');
    const relativePath = `images/emoticons/emo-cucumberboy-${paddedOrder}.png`;
    const [rootImage, mobileImage] = await Promise.all([
      readFile(relativePath),
      readFile(`www/${relativePath}`),
    ]);

    assert.deepEqual(mobileImage, rootImage);
    assert.equal(rootImage.subarray(1, 4).toString(), 'PNG');
    assert.equal(rootImage[25], 6, 'PNG must use RGBA color type');
  }
});

test('구매 SQL은 391피클 차감·10종 즉시 지급·구매 내역 기록을 보장한다', async () => {
  const [purchaseSql, migrationSql, sqlEditorSql, backupSql, historySource] =
    await Promise.all([
      readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
      readFile(MIGRATION_PATH, 'utf8'),
      readFile(SQL_EDITOR_PATH, 'utf8'),
      readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
      readFile('assets/js/modules/profile-history.js', 'utf8'),
    ]);

  assert.equal(sqlEditorSql, migrationSql);
  assert.ok(backupSql.includes(migrationSql));

  for (const source of [purchaseSql, migrationSql]) {
    assert.match(
      source,
      /p_item_id = 'emo-cucumberboy-01' then[\s\S]*?v_price := 391;[\s\S]*?v_name := '오이소년 이모티콘팩';[\s\S]*?v_category := 'emoticon';/,
    );
    assert.match(source, /insert into public\.user_emoticons/);
    assert.match(source, /'cucumberboy-1'/);
    assert.match(source, /'cucumberboy-10'/);
    assert.match(source, /1110, true/);
    assert.match(
      source,
      /오이소년 이모티콘팩 구매가 완료됐어\. 391피클이 차감됐고 바로 사용할 수 있어\./,
    );
  }

  assert.match(migrationSql, /set pickles = coalesce\(pickles, 0\) - v_price/);
  assert.match(migrationSql, /and coalesce\(pickles, 0\) >= v_price/);
  assert.match(migrationSql, /insert into public\.user_store_items/);
  assert.match(migrationSql, /insert into public\.pickle_ledger/);
  assert.match(migrationSql, /'store_purchase'/);
  assert.match(migrationSql, /public\.seoul_today\(\)/);
  assert.match(
    migrationSql,
    /revoke all on function public\.purchase_store_item\(text\) from public, anon;/,
  );
  assert.match(
    migrationSql,
    /grant execute on function public\.purchase_store_item\(text\) to authenticated;/,
  );
  assert.match(historySource, /\.from\('pickle_ledger'\)/);
});
