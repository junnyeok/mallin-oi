import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { inflateSync } from 'node:zlib';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};
const catalog = await import('../assets/js/modules/store-data.js');
const itemId = 'character-paprikagirl-01';
const characterCode = 'char-paprika-girl';
const imagePath = 'images/characters/paprikagirl.png';
const editorPath = 'supabase-SQLEditor/20261012-paprikagirl-character.sql';
const migrationPath = 'supabase/migrations/20261012010000_paprikagirl_character.sql';

test('파프리카걸이 NEW 첫 번째이며 지정 문구·622피클·미리보기가 정확하다', () => {
  const item = catalog.getStoreItemById(itemId);
  assert.equal(catalog.getFeaturedStoreItems(1)[0].id, itemId);
  assert.equal(catalog.STORE_ITEMS.toSorted((a, b) => b.releaseDate.localeCompare(a.releaseDate))[0].id, itemId);
  assert.equal(item.name, '파프리카걸');
  assert.equal(item.category, 'character');
  assert.equal(item.badge, '캐릭터');
  assert.equal(item.icon, '👧🏼🫑');
  assert.equal(item.price, 622);
  assert.equal(item.state, '판매 중');
  assert.equal(item.description, '발랄한 느낌의 파프리카소녀야. ');
  assert.equal(item.detailDescription, '옷가게 직원으로 일을 하고 있어.<br>구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.');
  assert.equal(item.isPurchasable, true);
  assert.equal(item.releaseDate, '2026-10-12');
  assert.equal(item.thumbImagePath, `/${imagePath}?v=test`);
  assert.deepEqual(item.previewImages, [{ code: `${itemId}-preview`, label: '파프리카걸 미리보기', imagePath: item.thumbImagePath, displayOrder: 1 }]);
  assert.equal(catalog.getStoreItemDetailHref(itemId), `./store-item.html?id=${itemId}`);
});

test('캐릭터와 기본 스킨이 같은 상품에 연결되고 ID·정렬 값이 중복되지 않는다', () => {
  assert.deepEqual(catalog.getCharacterCatalogItemByCode(characterCode), {
    character_code: characterCode, character_name: '파프리카걸',
    base_image_path: `/${imagePath}?v=test`, preview_image_path: `/${imagePath}?v=test`,
    display_order: 10, store_item_id: itemId,
  });
  assert.deepEqual(catalog.getSkinCatalogItemBySkinCode(`${characterCode}-basic`), {
    character_code: characterCode, skin_code: `${characterCode}-basic`, skin_name: '파프리카걸',
    image_path: `/${imagePath}?v=test`, display_order: 901, store_item_id: itemId,
  });
  for (const ids of [catalog.STORE_ITEMS.map(item => item.id), catalog.CHARACTER_CATALOG.map(item => item.character_code), catalog.CHARACTER_CATALOG.map(item => item.display_order), catalog.CHARACTER_SKIN_CATALOG.map(item => item.skin_code), catalog.CHARACTER_SKIN_CATALOG.map(item => item.display_order)]) {
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('사용자 원본 RGBA PNG를 보존하며 www·생성 정책·파일 목록과 일치한다', async () => {
  const image = await readFile(imagePath);
  assert.equal(createHash('sha256').update(image).digest('hex'), '2dfc9ba46d4eb41ebc71153cdb25b694bc8eb8f82bca25399de800f7cb07651f');
  assert.deepEqual(image.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
  assert.equal(image.readUInt32BE(16), 941);
  assert.equal(image.readUInt32BE(20), 1672);
  assert.equal(image[24], 8);
  assert.equal(image[25], 6);
  assert.equal(image[28], 0);
  const chunks = [];
  for (let offset = 8; offset < image.length;) {
    const length = image.readUInt32BE(offset);
    if (image.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(image.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  assert.equal(inflateSync(Buffer.concat(chunks)).length, (941 * 4 + 1) * 1672);
  assert.deepEqual(image, await readFile(`www/${imagePath}`));
  assert.ok((await readFile('scripts/prepare-capacitor-web.mjs', 'utf8')).includes(`'${imagePath}'`));
  assert.deepEqual(await readFile('assets/js/modules/store-data.js'), await readFile('www/assets/js/modules/store-data.js'));
  const files = (await readFile('file-list.txt', 'utf8')).trim().split(/\r?\n/);
  for (const path of [imagePath, `www/${imagePath}`, editorPath, migrationPath, 'tests/paprikagirl-character.test.mjs']) assert.equal(files.filter(line => line === `./${path}`).length, 1);
});

test('SQL은 정확한 차감·캐릭터 및 기본 스킨 지급·중복 방지·원장·권한을 보존한다', async () => {
  const sql = await readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8');
  const migration = await readFile(migrationPath, 'utf8');
  assert.equal(migration, await readFile(editorPath, 'utf8'));
  assert.ok((await readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8')).includes(migration));
  for (const name of ['price', 'inventory', 'message', 'balance', 'topup']) {
    const block = migration.match(new RegExp(`  v_${name} text := \\$b\\$([\\s\\S]*?)\\$b\\$;`))[1];
    assert.ok(sql.includes(block), `${name} 분기 동기화`);
  }
  assert.match(sql, /p_item_id = 'character-paprikagirl-01' then\s+v_price := 622;\s+v_name := '파프리카걸';\s+v_category := 'character';/);
  assert.match(sql, /p_item_id = 'character-paprikagirl-01' then\s+v_can_bypass_store_balance := false;/);
  assert.match(sql, /p_item_id = 'character-paprikagirl-01' then\s+v_is_auto_topup_admin := false;/);
  const grant = sql.split("elsif p_item_id = 'character-paprikagirl-01' then")[2].split('elsif p_item_id')[0];
  assert.match(grant, /insert into public\.user_characters[\s\S]*?'char-paprika-girl',\s+'파프리카걸',\s+'\.\/images\/characters\/paprikagirl\.png',\s+'\.\/images\/characters\/paprikagirl\.png',\s+10,/);
  assert.match(grant, /insert into public\.user_character_skins[\s\S]*?'char-paprika-girl-basic',\s+'파프리카걸',\s+'\.\/images\/characters\/paprikagirl\.png',\s+901,/);
  assert.match(grant, /on conflict \(user_id, character_code\) do nothing/);
  assert.match(grant, /on conflict \(user_id, skin_code\) do nothing/);
  assert.match(sql, /for update/);
  assert.match(sql, /if v_exists then/);
  assert.match(sql, /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/);
  assert.match(sql, /insert into public\.pickle_ledger[\s\S]*?-v_charged_amount/);
  assert.match(migration, /if position\('character-paprikagirl-01' in v_sql\) = 0 then/);
  assert.match(migration, /PAPRIKAGIRL_CHARACTER_ID_CONFLICT/);
  assert.match(migration, /PAPRIKAGIRL_CHARACTER_PURCHASE_SECURITY_MISMATCH/);
  assert.doesNotMatch(migration, /delete from|update public\./i);
});

test('상품·캐릭터 인벤토리·프로필·작성자·댓글·답글·피클 내역의 공통 경로를 사용한다', async () => {
  const read = path => readFile(`assets/js/modules/${path}.js`, 'utf8');
  const [store, profile, post, comments, history] = await Promise.all(['store', 'profile', 'post-detail', 'post-comments', 'profile-history'].map(read));
  assert.match(store, /purchase_store_item/);
  assert.match(profile, /CHARACTER_CATALOG.map/);
  assert.match(profile, /CHARACTER_SKIN_CATALOG.map/);
  assert.match(profile, /equipped_character_image_url: nextImagePath/);
  assert.match(profile, /previewEl.src = getPreviewImageForCharacter/);
  assert.match(post, /select\('id, equipped_character_image_url'\)/);
  assert.match(comments, /renderAuthorProfileLink\([\s\S]*characterImageUrl/);
  assert.match(history, /pickle_ledger/);
});
