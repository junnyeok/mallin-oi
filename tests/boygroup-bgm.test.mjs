import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};
const { STORE_ITEMS, BGM_CATALOG, getFeaturedStoreItems, getStoreItemDetailHref } =
  await import('../assets/js/modules/store-data.js');
const itemId = 'bgm-boygroup-01';
const sqlPath = 'supabase-SQLEditor/20261116-boygroup-bgm.sql';
const migrationPath = 'supabase/migrations/20261116000000_boygroup_bgm.sql';

test('네가 머문 자리는 655피클·지정 문구로 NEW에서 귀여운 덩쿨잎 다음에 등록된다', () => {
  const products = STORE_ITEMS.filter(item => item.id === itemId);
  assert.equal(products.length, 1);
  const [item] = products;
  assert.deepEqual(getFeaturedStoreItems(4).slice(2).map(item => item.id), ['BF-03', itemId]);
  assert.equal(item.name, '네가 머문 자리');
  assert.equal(item.category, 'bgm');
  assert.equal(item.price, 655);
  assert.equal(item.description, '말린오이닷컴 대표 보컬들의 듀엣곡이야.');
  assert.equal(item.detailDescription, '메인보컬은 오이소년이야. <br>구매하면 내프로필의 인벤토리에 추가되고, 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.');
  assert.equal(item.releaseDate, '2026-11-16');
  assert.equal(item.isPurchasable, true);
  assert.equal(item.previewImages.length, 1);
  assert.equal(item.previewImages[0].imagePath, item.thumbImagePath);
  assert.equal(getStoreItemDetailHref(itemId), './store-item.html?id=bgm-boygroup-01');
});

test('상품과 인벤토리·재생목록은 같은 구매 ID·음원·LP 경로를 사용한다', async () => {
  const item = STORE_ITEMS.find(item => item.id === itemId);
  const tracks = BGM_CATALOG.filter(track => track.storeItemId === itemId);
  assert.equal(tracks.length, 1);
  const [track] = tracks;
  assert.equal(track.id, 'mallin-oi-boygroup-01');
  assert.equal(track.title, item.name);
  assert.equal(track.isDefault, false);
  assert.equal(track.audioPath, item.previewAudioPath);
  assert.equal(track.coverPath, item.thumbImagePath);
  assert.equal(track.displayOrder, 17);
  for (const values of [STORE_ITEMS.map(item => item.id), BGM_CATALOG.map(track => track.id), BGM_CATALOG.map(track => track.displayOrder)]) {
    assert.equal(new Set(values).size, values.length);
  }
  for (const path of [track.audioPath, track.coverPath]) {
    const url = new URL(path, 'http://localhost');
    assert.equal(url.searchParams.get('v'), 'test');
    assert.ok((await readFile(decodeURIComponent(url.pathname).slice(1))).length > 0);
  }
});

test('사용자 제공 MP3와 LP 원본의 바이트·형식을 보존한다', async () => {
  const specs = [
    ['assets/mp3/네가머문자리.mp3', '519b7b465a947cee28c8d392d0a4fdceef95977c7836548e2fcb4fe900014b14'],
    ['images/BGM/네가머문자리.png', 'e86f22748e2b43eb5f7adb75e8b9c768c9a44ddad0eebd2b51f199e9ca87f94a'],
  ];
  for (const [path, hash] of specs) {
    assert.equal(createHash('sha256').update(await readFile(path)).digest('hex'), hash);
  }
  const png = await readFile(specs[1][0]);
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 444);
  assert.equal(png.readUInt32BE(20), 444);
  assert.equal((await readFile(specs[0][0])).subarray(0, 3).toString(), 'ID3');
});

test('로컬 SQL·마이그레이션·누적본과 구매 기준본의 이번 분기가 일치한다', async () => {
  const [sql, migration, canonical, backup] = await Promise.all([
    readFile(sqlPath, 'utf8'), readFile(migrationPath, 'utf8'),
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
  ]);
  assert.equal(sql, migration);
  assert.ok(backup.includes(sql));
  for (const source of [sql, canonical]) {
    assert.match(source, /elsif p_item_id = 'bgm-boygroup-01' then\s+v_price := 655;\s+v_name := '네가 머문 자리';\s+v_category := 'bgm';/);
    assert.match(source, /elsif p_item_id = 'bgm-boygroup-01' then\s+null;/);
    assert.match(source, /if p_item_id = 'bgm-boygroup-01' then\s+v_is_auto_topup_admin := false;/);
    assert.ok(source.includes('네가 머문 자리 구매가 완료됐어. 655피클이 차감됐고'));
    assert.ok(source.includes('insert into public.user_store_items'));
    assert.ok(source.includes('insert into public.pickle_ledger'));
    assert.ok(source.includes('-v_charged_amount'));
    assert.ok(source.includes('and coalesce(pickles, 0) >= v_price'));
    assert.ok(source.includes('for update'));
    assert.ok(source.includes('if v_exists then'));
  }
  assert.match(sql, /BOYGROUP_BGM_PURCHASE_ANCHOR_MISMATCH/);
  assert.match(sql, /UNIQUE \(user_id, item_id\)/);
  assert.match(sql, /has_function_privilege\('anon'/);
  assert.doesNotMatch(sql, /drop\s+(?:table|function)|delete\s+from|insert into supabase_migrations/i);
});

test('대표 BGM은 상품 종류와 보유 여부로 검사하며 새 상품 ID를 허용한다', async () => {
  const featured = await readFile('supabase-SQLEditor/20260721-profile-featured-bgm.sql', 'utf8');
  assert.match(itemId, /^[A-Za-z0-9_-]+$/);
  assert.match(featured, /usi\.item_id = v_item_id/);
  assert.match(featured, /usi\.item_category = 'bgm'/);
  assert.match(featured, /profile_featured_bgm_item_id = v_item_id/);
});

test('루트·www 상품 데이터가 같고 신규 파일 경로가 한 번씩 등록된다', async () => {
  assert.deepEqual(await readFile('assets/js/modules/store-data.js'), await readFile('www/assets/js/modules/store-data.js'));
  const list = (await readFile('file-list.txt', 'utf8')).trim().split('\n');
  for (const file of [sqlPath, migrationPath, 'tests/boygroup-bgm.test.mjs', 'assets/mp3/네가머문자리.mp3', 'images/BGM/네가머문자리.png']) {
    assert.equal(list.filter(path => path.normalize('NFC') === `./${file}`).length, 1, file);
  }
});
