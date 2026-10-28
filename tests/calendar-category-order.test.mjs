import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { orderCategories, nextCategorySortOrder, persistCategoryOrder, getCategoryEdgeScrollSpeed, syncReorderedCategorySelection } from '../assets/js/modules/calendar-category-order.js';

const categories = () => [
  { id: 'a', user_id: 'me', name: '당직', sort_order: 10, start_time: '17:00' },
  { id: 'b', user_id: 'me', name: '연가', sort_order: 20, color: '#ffffff' },
  { id: 'c', user_id: 'me', name: '일근', sort_order: 101, is_default: true },
];

test('카테고리 창 중앙에서는 멈추고 가장자리에 가까울수록 빠르게 스크롤한다', () => {
  assert.equal(getCategoryEdgeScrollSpeed(400, 100, 700), 0);
  assert.equal(getCategoryEdgeScrollSpeed(156, 100, 700), 0);
  assert.equal(getCategoryEdgeScrollSpeed(644, 100, 700), 0);
  assert.ok(getCategoryEdgeScrollSpeed(130, 100, 700) < 0);
  assert.ok(getCategoryEdgeScrollSpeed(105, 100, 700) < getCategoryEdgeScrollSpeed(130, 100, 700));
  assert.ok(getCategoryEdgeScrollSpeed(670, 100, 700) > 0);
  assert.ok(getCategoryEdgeScrollSpeed(695, 100, 700) > getCategoryEdgeScrollSpeed(670, 100, 700));
});

test('창 바깥으로 끌어도 속도를 제한하고 높이가 없는 창은 움직이지 않는다', () => {
  assert.equal(getCategoryEdgeScrollSpeed(-1000, 100, 700), -480);
  assert.equal(getCategoryEdgeScrollSpeed(2000, 100, 700), 480);
  assert.equal(getCategoryEdgeScrollSpeed(400, 400, 400), 0);
  assert.equal(getCategoryEdgeScrollSpeed(130, 100, 160), 0);
});

function database({ failAt = 0, conflictAt = 0 } = {}) {
  const rows = categories();
  const writes = [];
  const client = { from(table) {
    assert.equal(table, 'work_calendar_categories');
    return { update(patch) {
      const filters = {};
      return {
        eq(key, value) { filters[key] = value; return this; },
        async select() {
          writes.push({ patch, filters });
          assert.deepEqual(Object.keys(patch), ['sort_order']);
          assert.equal(filters.user_id, 'me');
          if (writes.length === failAt) return { error: new Error('offline') };
          if (writes.length === conflictAt) rows.find((row) => row.id === filters.id).sort_order = 500;
          const row = rows.find((row) => Object.entries(filters).every(([key, value]) => row[key] === value));
          if (!row) return { data: [] };
          Object.assign(row, patch);
          return { data: [{ id: row.id }] };
        },
      };
    } };
  } };
  return { rows, writes, client };
}

test('맨 앞/맨 뒤 이동은 기본 카테고리와 근무시간을 보존한다', () => {
  const input = categories();
  const result = orderCategories(input, ['c', 'a', 'b']);
  assert.deepEqual(result.map((row) => row.id), ['c', 'a', 'b']);
  assert.deepEqual(result.map((row) => row.sort_order), [10, 20, 30]);
  assert.equal(result[0].is_default, true);
  assert.equal(result[1].start_time, '17:00');
  assert.equal(input[2].sort_order, 101);
  assert.equal(nextCategorySortOrder(result), 40);
  assert.equal(nextCategorySortOrder(input), 111);
});

test('중복·누락·다른 사용자 항목을 받은 순서 저장은 쓰기 전에 거부한다', async () => {
  for (const ids of [['a', 'a', 'c'], ['a', 'b'], ['a', 'b', 'unknown']]) {
    const db = database();
    await assert.rejects(persistCategoryOrder({ ...db, table: 'work_calendar_categories', userId: 'me', categories: categories(), ids }));
    assert.equal(db.writes.length, 0);
  }
});

test('순서만 서버에 저장하며 다시 조회한 결과도 같은 순서다', async () => {
  const db = database();
  await persistCategoryOrder({ ...db, table: 'work_calendar_categories', userId: 'me', categories: categories(), ids: ['c', 'a', 'b'] });
  assert.deepEqual(db.rows.sort((a, b) => a.sort_order - b.sort_order).map((row) => row.id), ['c', 'a', 'b']);
  assert.equal(db.rows.find((row) => row.id === 'a').start_time, '17:00');
});

test('중간 저장 실패는 이미 저장한 순서 값을 복원한다', async () => {
  const db = database({ failAt: 2 });
  await assert.rejects(persistCategoryOrder({ ...db, table: 'work_calendar_categories', userId: 'me', categories: categories(), ids: ['c', 'a', 'b'] }), /offline/);
  assert.deepEqual(db.rows, categories());
});

test('동시 변경은 덮어쓰지 않고 이전 성공 쓰기만 되돌린다', async () => {
  const db = database({ conflictAt: 2 });
  await assert.rejects(persistCategoryOrder({ ...db, table: 'work_calendar_categories', userId: 'me', categories: categories(), ids: ['c', 'a', 'b'] }));
  assert.equal(db.rows.find((row) => row.id === 'a').sort_order, 500);
  assert.equal(db.rows.find((row) => row.id === 'c').sort_order, 101);
});

test('새 일정의 실제 기본값은 세 달력 모두 순서 변경 후 첫 카테고리다', () => {
  for (const type of ['study', 'event', 'work']) {
    const source = readFileSync(new URL(`../assets/js/modules/${type}-calendar.js`, import.meta.url), 'utf8');
    const expression = type === 'work'
      ? source.match(/const defaultCategory = ([^;]+);/)[1]
      : source.match(/const category = isEdit\s*\? getCategoryByTodo\(todo, state.categories\)\s*: ([^;]+);/)[0].replace(/^const category = /, '').replace(/;$/, '');
    const original = [{ id: 'study', slug: 'etc' }, { id: 'exercise', slug: 'exercise' }];
    const ordered = orderCategories(original, ['exercise', 'study']);
    for (const isEdit of [false, true]) {
      const result = vm.runInNewContext(expression, {
        state: { categories: ordered }, isEdit, todo: { categoryId: 'study' },
        getFallbackCategory: () => original[0],
        getCategoryByTodo: () => original[0],
      });
      assert.equal(result.id, isEdit && type !== 'work' ? 'study' : 'exercise');
    }
  }
});

test('열려 있는 새 일정도 순서 변경을 반영하고 근무시간 변경 이벤트를 전달한다', () => {
  const ordered = orderCategories(categories(), ['c', 'b', 'a']);
  for (const mode of ['create', 'edit']) {
    const events = [];
    const select = { value: 'a', dispatchEvent: event => events.push(event.type) };
    const sheet = { dataset: { mode }, querySelector: () => select };
    const documentRef = { querySelector: () => sheet };
    const renderSelect = (node, list, preferred) => { node.value = list.find(c => c.id === preferred)?.id || list[0]?.id || ''; };
    syncReorderedCategorySelection({ calendarType: 'work', categories: ordered, renderSelect, documentRef });
    assert.equal(select.value, mode === 'create' ? 'c' : 'a');
    assert.deepEqual(events, mode === 'create' ? ['change'] : []);
  }
});

test('맨 위 카테고리가 그대로이면 사용자가 입력한 시간 변경 이벤트를 발생시키지 않는다', () => {
  const select = { value: 'a', dispatchEvent: () => assert.fail('unchanged category') };
  const sheet = { dataset: { mode: 'create' }, querySelector: () => select };
  syncReorderedCategorySelection({ calendarType: 'study', categories: categories(), documentRef: { querySelector: () => sheet }, renderSelect: (node, list, preferred) => { node.value = preferred; } });
  syncReorderedCategorySelection({ calendarType: 'study', categories: [], documentRef: { querySelector: () => null }, renderSelect: () => assert.fail('no sheet') });
});
