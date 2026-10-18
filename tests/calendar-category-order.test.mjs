import test from 'node:test';
import assert from 'node:assert/strict';
import { orderCategories, nextCategorySortOrder, persistCategoryOrder, getCategoryEdgeScrollSpeed } from '../assets/js/modules/calendar-category-order.js';

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
