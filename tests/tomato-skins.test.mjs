import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};
const catalog = await import('../assets/js/modules/store-data.js');
const specs = [
  { id: 'skin-tomato-01', name: '방울토마(피아)토리토', price: 521, file: 'tomato-gang.png',
    code: 'char-tomato-gang', order: 702, icon: '🍅🚬',
    description: '방울토마(피아)토리토야.',
    detailDescription: '한국에 찐감자가 있다면 멕시코엔 방울토마토리토가 있어.<br>구매하면 내프로필의 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.' },
  { id: 'skin-tomato-02', name: '멕시코 방울토마토리토', price: 87, file: 'tomato_mexico.png',
    code: 'char-tomato-mexico', order: 703, icon: '🍅🌮',
    description: '멕시코 풍 모자를 쓴 방울토마토리토야.',
    detailDescription: '구매하면 내프로필의 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.' },
];
const editorPath = 'supabase-SQLEditor/20260913-tomato-skins.sql';
const migrationPath = 'supabase/migrations/20260913000000_tomato_skins.sql';

function readPngAlpha(png) {
  assert.equal(png[24], 8, '8-bit PNG');
  assert.equal(png[25], 6, 'RGBA PNG');
  assert.equal(png[28], 0, 'non-interlaced PNG');
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const chunks = [];
  for (let offset = 8; offset < png.length;) {
    const length = png.readUInt32BE(offset);
    if (png.toString('ascii', offset + 4, offset + 8) === 'IDAT') {
      chunks.push(png.subarray(offset + 8, offset + 8 + length));
    }
    offset += length + 12;
  }
  const scanlines = inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  assert.equal(scanlines.length, (stride + 1) * height);
  const alpha = new Uint8Array(width * height);
  let previous = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const offset = y * (stride + 1);
    const filter = scanlines[offset];
    assert.ok(filter <= 4);
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const corner = x >= 4 ? previous[x - 4] : 0;
      const estimate = left + up - corner;
      const distances = [Math.abs(estimate - left), Math.abs(estimate - up), Math.abs(estimate - corner)];
      const paeth = distances[0] <= distances[1] && distances[0] <= distances[2]
        ? left : distances[1] <= distances[2] ? up : corner;
      const predictor = [0, left, up, Math.floor((left + up) / 2), paeth][filter];
      row[x] = (scanlines[offset + 1 + x] + predictor) & 255;
      if (x % 4 === 3) alpha[y * width + (x - 3) / 4] = row[x];
    }
    previous = row;
  }
  return { alpha, width, height };
}

test('DGB PARK와 대구FC 오이 다음 토마토 스킨 두 상품의 순서, 가격, 원본 문구와 미리보기', () => {
  assert.deepEqual(catalog.getFeaturedStoreItems(5).slice(3).map(item => item.id), specs.map(item => item.id));
  for (const spec of specs) {
    const item = catalog.getStoreItemById(spec.id);
    assert.equal(catalog.STORE_ITEMS.filter(row => row.id === spec.id).length, 1);
    assert.equal(item.name, spec.name);
    assert.equal(item.category, 'skin');
    assert.equal(item.badge, '스킨');
    assert.equal(item.icon, spec.icon);
    assert.equal(item.price, spec.price);
    assert.equal(item.description, spec.description);
    assert.equal(item.detailDescription, spec.detailDescription);
    assert.equal(item.state, '판매 중');
    assert.equal(item.isPurchasable, true);
    assert.equal(item.releaseDate, '2026-09-13');
    assert.equal(item.thumbImagePath, `/images/skins/${spec.file}?v=test`);
    assert.deepEqual(item.previewImages, [{ code: spec.code, label: spec.name, imagePath: item.thumbImagePath, displayOrder: 1 }]);
    assert.equal(catalog.getStoreItemDetailHref(spec.id), `./store-item.html?id=${spec.id}`);
  }
});

test('각 스킨은 방울토마토리토 전용이며 상품·스킨·정렬 ID 중복이 없다', () => {
  for (const spec of specs) {
    const skin = catalog.getSkinCatalogItemBySkinCode(spec.code);
    assert.equal(skin.character_code, 'char-tomato');
    assert.equal(skin.store_item_id, spec.id);
    assert.equal(skin.skin_name, spec.name);
    assert.equal(skin.display_order, spec.order);
    assert.equal(skin.image_path, `/images/skins/${spec.file}?v=test`);
    assert.deepEqual(catalog.getSkinParentRequirementByStoreItemId(spec.id), {
      character_code: 'char-tomato', character_name: '방울토마토리토', parent_store_item_id: 'character-tomato-01',
    });
  }
  for (const ids of [catalog.STORE_ITEMS.map(item => item.id),
    catalog.CHARACTER_SKIN_CATALOG.map(item => item.skin_code),
    catalog.CHARACTER_SKIN_CATALOG.map(item => item.display_order)]) {
    assert.equal(new Set(ids).size, ids.length);
  }
});

test('투명 PNG 스킨을 준비 목록 및 www에 정확히 연결한다', async () => {
  const prepare = await readFile('scripts/prepare-capacitor-web.mjs', 'utf8');
  const files = (await readFile('file-list.txt', 'utf8')).trim().split(/\r?\n/);
  for (const spec of specs) {
    const path = `images/skins/${spec.file}`;
    const original = await readFile(path);
    assert.deepEqual(original.subarray(0, 8), Buffer.from([137,80,78,71,13,10,26,10]));
    assert.ok(original.readUInt32BE(16) > 0 && original.readUInt32BE(20) > 0);
    assert.equal(original[25], 6, '스킨은 실제 알파 채널이 있는 RGBA PNG여야 한다');
    assert.deepEqual(original, await readFile(`www/${path}`));
    assert.ok(prepare.includes(`'${path}'`));
    assert.equal(files.filter(line => line === `./${path}`).length, 1);
    assert.equal(files.filter(line => line === `./www/${path}`).length, 1);
  }
  assert.deepEqual(await readFile('assets/js/modules/store-data.js'), await readFile('www/assets/js/modules/store-data.js'));
});

test('스킨 이미지에 불투명 체크 배경이 다시 포함되지 않는다', async () => {
  for (const spec of specs) {
    const { alpha, width, height } = readPngAlpha(await readFile(`images/skins/${spec.file}`));
    assert.ok(alpha.filter(value => value === 0).length > width * height * 0.2);
    assert.ok(alpha.some(value => value === 255), '캐릭터 불투명 영역 유지');
    assert.ok(alpha.some(value => value > 0 && value < 255), '가장자리 반투명도 유지');
    for (let x = 0; x < width; x += 1) {
      assert.equal(alpha[x], 0, '위쪽 배경은 완전히 투명');
      assert.equal(alpha[(height - 1) * width + x], 0, '아래쪽 배경은 완전히 투명');
    }
    for (let y = 0; y < height; y += 1) {
      assert.equal(alpha[y * width], 0, '왼쪽 배경은 완전히 투명');
      assert.equal(alpha[y * width + width - 1], 0, '오른쪽 배경은 완전히 투명');
    }
  }
});

test('구매 SQL은 고정 가격, 전용 스킨 지급, 우회 금지와 원자적 원장을 보장한다', async () => {
  const sql = await readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8');
  const migration = await readFile(migrationPath, 'utf8');
  assert.equal(migration, await readFile(editorPath, 'utf8'));
  assert.ok((await readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8')).includes(migration));
  for (const spec of specs) {
    const branch = `elsif p_item_id = '${spec.id}' then`;
    assert.ok(sql.includes(branch));
    const price = sql.slice(sql.indexOf(branch) + branch.length).split('elsif p_item_id')[0];
    assert.ok(price.includes(`v_price := ${spec.price};`));
    assert.ok(price.includes(`v_name := '${spec.name}';`));
    assert.ok(price.includes("v_category := 'skin';"));
    assert.ok(price.includes("v_required_character_code := 'char-tomato';"));
    assert.ok(sql.includes(`'${spec.code}',\n      '${spec.name}',\n      './images/skins/${spec.file}',\n      ${spec.order},`));
  }
  assert.match(sql, /if p_item_id in \('skin-tomato-01', 'skin-tomato-02'\) then\s+v_can_bypass_store_balance := false;/);
  assert.match(sql, /v_is_auto_topup_admin, false\)[\s\S]*?p_item_id not in \([\s\S]*?'skin-tomato-01',[\s\S]*?'skin-tomato-02'/);
  assert.match(sql, /from public\.profiles p[\s\S]*?for update;/);
  assert.match(sql, /if v_exists then/);
  assert.match(sql, /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/);
  assert.match(sql, /insert into public\.pickle_ledger[\s\S]*?-v_charged_amount[\s\S]*?'store_purchase'/);
  for (const guard of ['DEPENDENCY_MISSING','UNIQUE_CONSTRAINT_MISSING','EQUIP_TRIGGER_MISMATCH','ITEM_ID_CONFLICT',
    'SKIN_CODE_CONFLICT','PURCHASE_ANCHOR_MISMATCH','BALANCE_POLICY_ANCHOR_MISMATCH','PURCHASE_VERIFY_FAILED','PURCHASE_SECURITY_MISMATCH']) {
    assert.ok(migration.includes('TOMATO_SKINS_'+guard));
  }
  assert.match(migration, /if position\('skin-tomato-' in v_sql\) = 0 then/);
  assert.match(migration, /begin;[\s\S]*commit;/);
  assert.doesNotMatch(migration, /delete from|truncate|update public\.profiles/i);
});

test('기존 프로필·인벤토리·글·댓글·답글·내역의 공통 표시 경로를 재사용한다', async () => {
  const profile = await readFile('assets/js/modules/profile.js', 'utf8');
  const store = await readFile('assets/js/modules/store.js', 'utf8');
  const post = await readFile('assets/js/modules/post-detail.js', 'utf8');
  const comments = await readFile('assets/js/modules/post-comments.js', 'utf8');
  const history = await readFile('assets/js/modules/profile-history.js', 'utf8');
  assert.match(store, /getSkinParentRequirementByStoreItemId\(item.id\)/);
  assert.match(profile, /CHARACTER_SKIN_CATALOG.map/);
  assert.match(profile, /is_parent_owned/);
  assert.match(profile, /equipped_character_image_url: nextImagePath/);
  assert.match(profile, /previewEl.src = getPreviewImageForCharacter/);
  assert.match(post, /select\('id, equipped_character_image_url'\)/);
  assert.match(comments, /profile_image_url, equipped_character_image_url/);
  assert.match(comments, /renderAuthorProfileLink\([\s\S]*characterImageUrl/);
  assert.match(history, /pickle_ledger/);
});
