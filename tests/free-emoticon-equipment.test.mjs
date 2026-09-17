import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};

const modulePath = 'assets/js/modules/emoticons.js';
const source = await readFile(modulePath, 'utf8');
const profileSource = await readFile('assets/js/modules/profile.js', 'utf8');
const storeUrl = new URL('../assets/js/modules/store-data.js?v=test', import.meta.url);
const { BASIC_EMOTICON_PACK, STORE_ITEMS } = await import(storeUrl.href);
const USER_ID = 'equipment-test-user';
const BASIC_ID = 'emo-basic-01';
let rows;
let requests;
let updateError;
let missingEquipmentColumn;

// 접속 대신 저장소만 대체하고 조회·정규화·저장·렌더링은 실제 모듈을 실행한다.
const client = {
  from(table) {
    assert.equal(table, 'user_emoticons');
    const request = { filters: [] };
    return {
      select(columns) { request.columns = columns; return this; },
      update(values) { request.values = values; return this; },
      eq(column, value) { request.filters.push([column, value]); return this; },
      order() { return this; },
      then(resolve, reject) {
        requests.push(request);
        const selected = rows.filter((row) => request.filters.every(([key, value]) => row[key] === value));
        if (request.values) {
          if (!updateError) selected.forEach((row) => Object.assign(row, request.values));
          return Promise.resolve({ error: updateError }).then(resolve, reject);
        }
        if (missingEquipmentColumn && request.columns.includes('is_equipped')) {
          return Promise.resolve({ error: { message: 'column is_equipped does not exist' } }).then(resolve, reject);
        }
        const data = selected.map((row) => Object.fromEntries(
          request.columns.split(',').map((key) => [key.trim(), row[key.trim()]]),
        ));
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      },
    };
  },
};
globalThis.__emoticonEquipmentTestClient = client;
const sourceForNode = source
  .replace("from './site-version.js'", `from '${new URL('../assets/js/modules/site-version.js', import.meta.url).href}'`)
  .replace("import { supabase } from './supabase-client.js';", 'const supabase = globalThis.__emoticonEquipmentTestClient;')
  .replace('await import(`./store-data.js?v=${MODULE_VERSION}`)', `await import('${storeUrl.href}')`);
const {
  loadOwnedEmoticons, loadOwnedEmoticonPacks, setEmoticonPackEquipped,
  renderOwnedEmoticonPicker, renderTextWithEmoticons,
} = await import(`data:text/javascript;base64,${Buffer.from(sourceForNode).toString('base64')}`);
delete globalThis.__emoticonEquipmentTestClient;

function resetRows(equipped = true) {
  rows = BASIC_EMOTICON_PACK.map((image) => ({
    user_id: USER_ID, item_id: BASIC_ID, emoticon_code: image.code,
    emoticon_label: image.label, image_path: image.imagePath,
    display_order: image.displayOrder, is_equipped: equipped,
  }));
  requests = [];
  updateError = null;
  missingEquipmentColumn = false;
}

test('무료 기본팩 7종의 저장된 장착·해제 상태를 그대로 표시한다', async () => {
  for (const equipped of [true, false]) {
    resetRows(equipped);
    const [pack] = await loadOwnedEmoticonPacks(USER_ID);
    assert.equal(pack.itemId, BASIC_ID);
    assert.equal(pack.isDefault, true);
    assert.equal(pack.isEquipped, equipped);
    assert.equal(pack.count, 7);
    assert.equal((await loadOwnedEmoticons(USER_ID)).length, equipped ? 7 : 0);
  }
});

test('무료팩 해제·재조회·재장착은 사용자와 품목 범위를 제한해 7종에 저장한다', async () => {
  resetRows();
  rows.push({ ...rows[0], user_id: 'other-user' });
  rows.push({ ...rows[0], item_id: 'emo-cheer-01', emoticon_code: 'cheer-1' });
  for (const equipped of [false, true, false]) {
    await setEmoticonPackEquipped(USER_ID, BASIC_ID, equipped);
    const [basic] = (await loadOwnedEmoticonPacks(USER_ID)).filter((pack) => pack.itemId === BASIC_ID);
    assert.equal(basic.isEquipped, equipped);
    assert.ok(rows.slice(0, 7).every((row) => row.is_equipped === equipped));
    assert.equal(rows[7].is_equipped, true, '다른 사용자 보존');
    assert.equal(rows[8].is_equipped, true, '다른 팩 보존');
  }
  for (const request of requests.filter((entry) => entry.values)) {
    assert.deepEqual(Object.keys(request.values), ['is_equipped']);
    assert.deepEqual(request.filters, [['user_id', USER_ID], ['item_id', BASIC_ID]]);
  }
});

test('선택기는 해제한 기본팩을 숨기고 유료팩은 유지하며 재장착하면 다시 노출한다', async () => {
  resetRows();
  rows.push({ ...rows[0], item_id: 'emo-cheer-01', emoticon_code: 'cheer-1' });
  await setEmoticonPackEquipped(USER_ID, BASIC_ID, false);
  const hidden = renderOwnedEmoticonPicker(await loadOwnedEmoticons(USER_ID));
  assert.ok(!hidden.includes('data-pack-key="basic"'));
  assert.ok(hidden.includes('data-pack-key="cheer"'));
  await setEmoticonPackEquipped(USER_ID, BASIC_ID, true);
  const visible = renderOwnedEmoticonPicker(await loadOwnedEmoticons(USER_ID));
  assert.ok(visible.includes('data-pack-key="basic"'));
  assert.equal((visible.match(/data-emoticon-code="free-/g) || []).length, 7);
});

test('무료팩만 보유한 사용자가 해제하면 장착 목록은 비지만 인벤토리 소유권은 유지된다', async () => {
  resetRows();
  await setEmoticonPackEquipped(USER_ID, BASIC_ID, false);
  assert.match(renderOwnedEmoticonPicker(await loadOwnedEmoticons(USER_ID)), /emoticon-picker__empty/);
  assert.equal((await loadOwnedEmoticonPacks(USER_ID)).length, 1);
  assert.equal(rows.length, 7);
});

test('기존 글·댓글의 무료 이모티콘 표시는 장착 해제 후에도 유지된다', async () => {
  resetRows();
  await setEmoticonPackEquipped(USER_ID, BASIC_ID, false);
  for (const image of BASIC_EMOTICON_PACK) {
    assert.ok(renderTextWithEmoticons(`[emo:${image.code}]`).includes(image.imagePath));
  }
});

test('로그인/품목 ID 누락 시 저장 요청을 보내지 않고 저장 실패는 호출자에 전달한다', async () => {
  resetRows();
  await setEmoticonPackEquipped('', BASIC_ID, false);
  await setEmoticonPackEquipped(USER_ID, '', false);
  assert.equal(requests.length, 0);
  updateError = new Error('equipment permission denied');
  await assert.rejects(setEmoticonPackEquipped(USER_ID, BASIC_ID, false), updateError);
  assert.ok(rows.every((row) => row.is_equipped));
});

test('구형 DB의 장착 컬럼 누락 조회 대체는 유지하며 명시적인 false와 구분한다', async () => {
  resetRows();
  missingEquipmentColumn = true;
  assert.equal((await loadOwnedEmoticons(USER_ID)).length, 7);
  assert.equal(requests.length, 2);
  assert.ok(!requests[1].columns.includes('is_equipped'));
});

test('무료팩 카드도 장착/해제 안내·키보드 버튼·ARIA 상태를 제공한다', () => {
  const cardSource = profileSource.slice(
    profileSource.indexOf('function renderEmoticonPackCard('),
    profileSource.indexOf('async function renderEmoticonInventorySection('),
  );
  const render = vm.runInNewContext(`${cardSource}\nrenderEmoticonPackCard`, { escapeHtml: String });
  for (const equipped of [true, false]) {
    const html = render({ itemId: BASIC_ID, label: '기본', isDefault: true, isEquipped: equipped });
    assert.ok(html.includes(`aria-pressed="${equipped}"`));
    assert.ok(html.includes(equipped ? '장착됨 · 클릭하면 해제' : '미장착 · 클릭하면 장착'));
    assert.ok(html.includes('type="button"'));
    assert.ok(!html.includes('항상 사용 가능'));
  }
});

test('글쓰기·댓글·답글은 동일한 장착 필터 조회를 사용하고 상품 안내와 일치한다', async () => {
  for (const path of ['assets/js/modules/write.js', 'assets/js/modules/post-comments.js']) {
    assert.match(await readFile(path, 'utf8'), /await loadOwnedEmoticons\(user.id\)/);
  }
  assert.match(STORE_ITEMS.find((item) => item.id === BASIC_ID).detailDescription, /인벤토리에서 장착하면/);
});

test('변경 원본과 www가 바이트 단위로 일치하고 새 테스트 경로는 한 번 등록된다', async () => {
  for (const path of [modulePath, 'assets/js/modules/profile.js', 'assets/js/modules/store-data.js']) {
    assert.deepEqual(await readFile(path), await readFile(`www/${path}`));
  }
  const paths = (await readFile('file-list.txt', 'utf8')).split('\n');
  assert.equal(paths.filter((path) => path === './tests/free-emoticon-equipment.test.mjs').length, 1);
});
