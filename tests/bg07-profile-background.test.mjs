import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};
const catalog = await import('../assets/js/modules/store-data.js');
const itemId = 'BG-07';
const desktop = '/images/profile-background/mafia.png?v=test';
const mobile = '/images/profile-background/mafia-mobile.png?v=test';
const editorPath = 'supabase-SQLEditor/20260913-mafia-profile-background.sql';
const migrationPath = 'supabase/migrations/20260913030000_bg07_mafia_profile_background.sql';

test('방울토마토리토 아지트가 NEW 첫 번째이며 625피클·지정 문구·두 미리보기가 정확하다', () => {
  const item = catalog.getStoreItemById(itemId);
  assert.equal(catalog.getFeaturedStoreItems(1)[0].id, itemId);
  assert.equal(item.name, '방울토마토리토 아지트');
  assert.equal(item.category, 'profile');
  assert.equal(item.itemType, 'profile-background');
  assert.equal(item.badge, '프로필배경');
  assert.equal(item.icon, '🚬🏠');
  assert.equal(item.price, 625);
  assert.equal(item.state, '판매 중');
  assert.equal(item.isPurchasable, true);
  assert.equal(item.description, '방울토마토리토의 아지트야.');
  assert.equal(item.detailDescription, '구매하면 인벤토리의 프로필배경 항목에 추가되고, 장착하면 프로필카드 배경에 표시돼.');
  assert.equal(item.thumbImagePath, desktop);
  assert.deepEqual(item.previewImages, [
    {code: 'BG-07-pc', label: 'PC 버전 미리보기', imagePath: desktop, displayOrder: 1},
    {code: 'BG-07-mobile', label: '모바일 버전 미리보기', imagePath: mobile, displayOrder: 2},
  ]);
  assert.equal(item.releaseDate, '2026-09-13');
  assert.equal(catalog.STORE_ITEMS.toSorted((a,b) => String(b.releaseDate).localeCompare(String(a.releaseDate)))[0].id, itemId);
  assert.equal(catalog.getStoreItemDetailHref(itemId), './store-item.html?id=BG-07');
});

test('프로필배경 카탈로그에서 PC·모바일 파일을 구분하며 ID와 순서가 중복되지 않는다', () => {
  assert.deepEqual(catalog.getProfileBackgroundByItemId(itemId), {
    itemId, name:'방울토마토리토 아지트', pcImagePath:desktop, mobileImagePath:mobile,
    thumbImagePath:desktop, displayOrder:7,
  });
  for (const values of [
    catalog.STORE_ITEMS.map(item=>item.id),
    catalog.PROFILE_BACKGROUND_CATALOG.map(item=>item.itemId),
    catalog.PROFILE_BACKGROUND_CATALOG.map(item=>item.displayOrder),
  ]) assert.equal(new Set(values).size, values.length);
});

test('PC·모바일 PNG 원본이 디코딩 가능하며 앱 복사본·파일 목록과 일치한다', async () => {
  const prepare = await readFile('scripts/prepare-capacitor-web.mjs','utf8');
  const files = (await readFile('file-list.txt','utf8')).trim().split(/\r?\n/);
  for (const [name,width,height] of [['mafia.png',1484,1060],['mafia-mobile.png',960,1639]]) {
    const path = `images/profile-background/${name}`;
    const source = await readFile(path);
    assert.deepEqual(source.subarray(0,8), Buffer.from([137,80,78,71,13,10,26,10]));
    assert.equal(source.readUInt32BE(16),width);
    assert.equal(source.readUInt32BE(20),height);
    assert.equal(source[24],8);
    assert.equal(source[25],2, '8비트 RGB PNG');
    assert.equal(source[28],0);
    const chunks=[];
    for(let offset=8; offset<source.length;) {
      const length=source.readUInt32BE(offset);
      if(source.toString('ascii',offset+4,offset+8)==='IDAT') chunks.push(source.subarray(offset+8,offset+8+length));
      offset+=length+12;
    }
    const pixels=inflateSync(Buffer.concat(chunks));
    assert.equal(pixels.length,(width*3+1)*height);
    for(let y=0;y<height;y++) assert.ok(pixels[y*(width*3+1)]<=4,'PNG scanline filter');
    assert.deepEqual(source,await readFile(`www/${path}`));
    assert.ok(prepare.includes(`'${path}'`));
    for(const entry of [path,`www/${path}`]) assert.equal(files.filter(line=>line===`./${entry}`).length,1);
  }
  for(const path of [editorPath,migrationPath,'tests/bg07-profile-background.test.mjs']) assert.equal(files.filter(line=>line===`./${path}`).length,1);
  assert.deepEqual(await readFile('assets/js/modules/store-data.js'),await readFile('www/assets/js/modules/store-data.js'));
});

test('기존 인벤토리 장착·소유 검사·반응형 프로필 배경·피클 내역 경로에 연결된다', async () => {
  const [profile, store, css, inventoryCss, history] = await Promise.all([
    readFile('assets/js/modules/profile.js','utf8'),
    readFile('assets/js/modules/store.js','utf8'),
    readFile('assets/css/main/profile-main.css','utf8'),
    readFile('assets/css/main/inventory-main.css','utf8'),
    readFile('assets/js/modules/profile-history.js','utf8'),
  ]);
  assert.match(store,/item\?\.itemType === 'profile-background'/);
  assert.match(profile,/PROFILE_BACKGROUND_CATALOG.map/);
  assert.match(profile,/isOwned: ownedStoreItemIds.has\(item.itemId\)/);
  assert.match(profile,/equipped_profile_background_item_id: nextBackgroundItemId/);
  assert.match(profile,/--profile-bg-desktop/);
  assert.match(profile,/--profile-bg-mobile/);
  assert.match(css,/background-image: var\(--profile-bg-desktop, none\)/);
  assert.match(css,/background-image: var\(--profile-bg-mobile, var\(--profile-bg-desktop, none\)\)/);
  assert.match(inventoryCss,/--profile-bg-mobile/);
  assert.match(history,/pickle_ledger/);
});

test('구매 SQL 네 관리 지점에 가격·지급·우회 금지·원자적 원장이 일치한다', async () => {
  const [sql,migration,editor,backup] = await Promise.all([
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql','utf8'),
    readFile(migrationPath,'utf8'), readFile(editorPath,'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql','utf8'),
  ]);
  assert.equal(migration,editor);
  assert.ok(backup.includes(migration));
  for(const name of ['price','inventory','message','balance','topup']) {
    const marker=`  v_${name} text := $b$`;
    const start=migration.indexOf(marker)+marker.length;
    assert.ok(sql.includes(migration.slice(start,migration.indexOf('$b$;',start))),name);
  }
  assert.match(sql,/p_item_id = 'BG-07' then\s+v_price := 625;\s+v_name := '방울토마토리토 아지트';\s+v_category := 'profile';/);
  assert.match(sql,/p_item_id = 'BG-07' then\s+v_can_bypass_store_balance := false;/);
  assert.match(sql,/p_item_id = 'BG-07' then\s+v_is_auto_topup_admin := false;/);
  assert.match(sql,/p_item_id = 'BG-07' then\s+-- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능\s+null;/);
  assert.match(sql,/for update/);
  assert.match(sql,/if v_exists then/);
  assert.match(sql,/set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/);
  assert.match(sql,/insert into public.user_store_items/);
  assert.match(sql,/insert into public.pickle_ledger[\s\S]*?-v_charged_amount/);
  assert.match(migration,/if position\('BG-07' in v_sql\) = 0 then/);
  assert.match(migration,/BG07_ITEM_ID_CONFLICT/);
  assert.match(migration,/BG07_EQUIP_OWNERSHIP_TRIGGER_MISMATCH/);
  assert.match(migration,/BG07_PURCHASE_SECURITY_MISMATCH/);
});
