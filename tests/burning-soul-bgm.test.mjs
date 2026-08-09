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

const ITEM_ID = 'bgm-tetocarrto-02';
const TRACK_ID = 'mallin-oi-burning-soul';

test('Burning Soul 상품과 BGM 카탈로그가 한 번만 연결된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === ITEM_ID);
  const tracks = BGM_CATALOG.filter((track) => track.id === TRACK_ID);

  assert.equal(products.length, 1);
  assert.equal(tracks.length, 1);
  assert.equal(products[0].name, 'Burning Soul');
  assert.equal(
    products[0].description,
    'X-Japan을 사랑하는 테토당근의 리메이크 강렬한 록 사운드 곡이야.',
  );
  assert.equal(products[0].category, 'bgm');
  assert.equal(products[0].price, 665);
  assert.equal(products[0].previewAudioPath, '/assets/mp3/Burning-Soul.mp3?v=test');
  assert.equal(products[0].previewImages.length, 1);
  assert.equal(
    products[0].previewImages[0].imagePath,
    '/images/BGM/Burning-Soul_LP.png?v=test',
  );
  assert.equal(tracks[0].storeItemId, ITEM_ID);
  assert.equal(tracks[0].audioPath, products[0].previewAudioPath);
  assert.equal(tracks[0].coverPath, products[0].thumbImagePath);
});

test('Burning Soul이 신규 BGM 2곡과 기존 우선 품목 다음 New 상품이다', () => {
  assert.equal(getFeaturedStoreItems(10)[9].id, ITEM_ID);
});

test('구매 SQL은 서버 가격, 인벤토리 보유 기록, 원장 기록을 연결한다', async () => {
  const sql = await readFile(
    'supabase-SQLEditor/store-item_purchase-functions.sql',
    'utf8',
  );
  const migration = await readFile(
    'supabase/migrations/20260728040000_burning_soul_bgm.sql',
    'utf8',
  );
  const backup = await readFile(
    'supabase-SQLEditor/99_all_backup.sql',
    'utf8',
  );

  for (const source of [sql, migration, backup]) {
    assert.match(
      source,
      /p_item_id = 'bgm-tetocarrto-02'[\s\S]*?v_price := 665;[\s\S]*?v_name := 'Burning Soul';[\s\S]*?v_category := 'bgm';/,
    );
    assert.match(source, /Burning Soul 구매/);
  }

  assert.match(sql, /from public\.profiles p[\s\S]*?for update;/);
  assert.match(
    sql,
    /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/,
  );
  assert.match(sql, /insert into public\.user_store_items/);
  assert.match(sql, /insert into public\.pickle_ledger/);
  assert.match(sql, /'store_purchase'/);
  assert.match(
    sql,
    /v_can_bypass_store_balance :=[\s\S]*?'cha-effects-fire-01',[\s\S]*?'bgm-tetocarrto-02'[\s\S]*?and exists/,
  );
  assert.match(
    sql,
    /v_is_auto_topup_admin[\s\S]*?'cha-effects-fire-01',[\s\S]*?'bgm-tetocarrto-02'[\s\S]*?perform public\.ensure_user_pickles/,
  );
  assert.match(migration, /BURNING_SOUL_ITEM_ID_CONFLICT/);
  assert.match(migration, /begin;[\s\S]*commit;/i);
});
