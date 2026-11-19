import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};
const catalog = await import('../assets/js/modules/store-data.js');
const itemId = 'skin-cucumber-07';
const skinCode = 'char-cucumber-daegu';
const imagePath = 'images/skins/cucumber-daegu.png';
const editorPath = 'supabase-SQLEditor/20260913-daegu-cucumber-skin.sql';
const migrationPath = 'supabase/migrations/20260913010000_daegu_cucumber_skin.sql';
const retirementPath = 'supabase/migrations/20261119000000_retire_daegu_cucumber_skin.sql';

test('대구FC 오이는 상점 목록과 상세 조회에서 빠지고 DGB PARK는 판매된다', () => {
  assert.equal(catalog.getStoreItemById(itemId), null);
  assert.equal(catalog.STORE_ITEMS.some(item => item.id === itemId), false);
  assert.equal(catalog.getFeaturedStoreItems(catalog.STORE_ITEMS.length).some(item => item.id === itemId), false);
  assert.equal(catalog.getStoreItemById('BG-06').isPurchasable, true);
});

test('대구FC 오이는 미보유 스킨 목록에서도 빠지고 카탈로그 ID와 순서는 중복되지 않는다', () => {
  assert.equal(catalog.getSkinCatalogItemBySkinCode(skinCode), null);
  assert.equal(catalog.getSkinParentRequirementByStoreItemId(itemId), null);
  for (const ids of [
    catalog.STORE_ITEMS.map(item => item.id),
    catalog.CHARACTER_SKIN_CATALOG.map(item => item.skin_code),
    catalog.CHARACTER_SKIN_CATALOG.map(item => item.display_order),
  ]) assert.equal(new Set(ids).size, ids.length);
});

test('제공 PNG와 www 복사본·준비 목록·파일 목록이 일치한다', async () => {
  const image = await readFile(imagePath);
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(image.readUInt32BE(16), 1024);
  assert.equal(image.readUInt32BE(20), 1536);
  assert.equal(image[25], 6, '알파 채널을 가진 RGBA PNG');
  assert.deepEqual(image, await readFile(`www/${imagePath}`));
  assert.ok((await readFile('scripts/prepare-capacitor-web.mjs', 'utf8')).includes(`'${imagePath}'`));
  assert.deepEqual(await readFile('assets/js/modules/store-data.js'), await readFile('www/assets/js/modules/store-data.js'));
  const files = (await readFile('file-list.txt', 'utf8')).trim().split(/\r?\n/);
  for (const path of [imagePath, `www/${imagePath}`, editorPath, migrationPath, 'tests/daegu-cucumber-skin.test.mjs']) {
    assert.equal(files.filter(line => line === `./${path}`).length, 1);
  }
});

test('과거 판매 SQL과 지급 기록용 매핑을 확인한다', async () => {
  const sql = await readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8');
  const migration = await readFile(migrationPath, 'utf8');
  const retirement = await readFile(retirementPath, 'utf8');
  const backup = await readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8');
  assert.equal(migration, await readFile(editorPath, 'utf8'));
  assert.equal(retirement, await readFile('supabase-SQLEditor/20261119-retire-daegu-cucumber-skin.sql', 'utf8'));
  assert.ok(backup.includes(migration));
  assert.ok(backup.includes(retirement));
  const guard = /if p_item_id = 'skin-cucumber-07' then\s+return query\s+select false, '판매가 종료된 상품이야.'/;
  assert.match(retirement, guard);
  assert.match(sql.split("if p_item_id = 'emo-basic-01' then")[0], guard);
  for (const name of ['price', 'inventory', 'message', 'balance', 'topup']) {
    const start = migration.indexOf(`  v_${name} text := $b$`) + `  v_${name} text := $b$`.length;
    assert.ok(sql.includes(migration.slice(start, migration.indexOf('$b$;', start))), `${name} 분기 동기화`);
  }
  assert.match(sql, /p_item_id = 'skin-cucumber-07' then\s+v_price := 389;/);
  assert.match(sql, /p_item_id = 'skin-cucumber-07' then\s+v_can_bypass_store_balance := false;/);
  assert.match(sql, /if coalesce\(v_is_auto_topup_admin, false\)\s+and p_item_id <> 'skin-cucumber-07'/);
  const grant = sql.split("elsif p_item_id = 'skin-cucumber-07' then")[2].split("elsif p_item_id")[0];
  assert.match(grant, /insert into public\.user_characters/);
  assert.match(grant, /'char-cucumber',\s+'기본오이'/);
  assert.match(grant, /'default_grant'/);
  assert.match(grant, /on conflict \(user_id, character_code\) do nothing/);
  assert.match(grant, /insert into public\.user_character_skins/);
  assert.match(grant, /'char-cucumber',\s+'char-cucumber-daegu',\s+'대구FC 오이',\s+'\.\/images\/skins\/cucumber-daegu\.png',\s+7,/);
  assert.match(grant, /on conflict \(user_id, skin_code\) do nothing/);
  assert.match(sql, /for update/);
  assert.match(sql, /if v_exists then/);
  assert.match(sql, /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/);
  assert.match(sql, /insert into public\.pickle_ledger[\s\S]*?-v_charged_amount/);
  assert.match(migration, /if position\('skin-cucumber-07' in v_sql\) = 0 then/);
  assert.match(migration, /DAEGU_SKIN_ID_CONFLICT/);
  assert.match(migration, /DAEGU_SKIN_PURCHASE_SECURITY_MISMATCH/);
});

test('상품 상세·인벤토리·프로필·글·댓글·답글·피클 내역의 기존 공통 경로를 사용한다', async () => {
  const read = path => readFile(`assets/js/modules/${path}.js`, 'utf8');
  const [store, profile, post, comments, history] = await Promise.all(
    ['store', 'profile', 'post-detail', 'post-comments', 'profile-history'].map(read));
  assert.match(store, /getSkinParentRequirementByStoreItemId\(item.id\)/);
  assert.match(profile, /CHARACTER_SKIN_CATALOG.map/);
  assert.match(profile, /\(skinRows \|\| \[\]\).forEach\(\(row\) => \{[\s\S]*?merged.push\(\{[\s\S]*?is_owned: true/);
  assert.match(profile, /equipped_character_image_url: nextImagePath/);
  assert.match(profile, /previewEl.src = getPreviewImageForCharacter/);
  assert.match(post, /select\('id, equipped_character_image_url'\)/);
  assert.match(comments, /renderAuthorProfileLink\([\s\S]*characterImageUrl/);
  assert.match(history, /pickle_ledger/);
});
