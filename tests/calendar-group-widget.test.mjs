import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {
  orderWidgetMembers,
  readWidgetMemberOrder,
  saveWidgetMemberOrder,
} from '../assets/js/modules/calendar-widget-member-order.js';

function source(name) {
  return readFileSync(new URL('../assets/js/modules/' + name + '.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
    .replaceAll('export ', '').replaceAll('import.meta.url', JSON.stringify(import.meta.url));
}
const groups = source('calendar-groups');
const data = source('calendar-widget-data').replace(
  "const { buildGroupWidgetRows, fetchCalendarGroups } = await import('./calendar-groups.js');",
  'const { buildGroupWidgetRows, fetchCalendarGroups } = groupModule;'
);
const group = { id: 'group-a', name: '시험 그룹', allow_work: true, allow_event: true };
const dates = ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28'];
const roster = [{ user_id: 'a', nickname: '다정한오이' }, { user_id: 'b', nickname: ' 말린오이 ' }];
const board = vm.runInNewContext(groups + '\nbuildGroupWidgetRows', {
  normalizeCategoryColor: (value, fallback) => value || fallback,
  orderWidgetMembers,
});

function mockStorage(t) {
  const stored = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: key => stored.get(key) ?? null, setItem: (key, value) => stored.set(key, value) },
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  });
}

test('내 일정이 비어 있어도 첫 글자로 맨 위에 표시하고 공유 일정은 마지막에 한 줄로 표시한다', () => {
  const event = { title: '휴무', user_id: 'a', color: 'transparent', event_date: dates[0], payload: { isDone: true }, memo: '제외' };
  const shared = { ...event, title: '회의', shared_group_id: group.id, shared_origin_todo_id: 'origin' };
  const rows = JSON.parse(JSON.stringify(board(group, 'work', roster,
    [event, shared, { ...shared, user_id: 'b' }, { ...event, event_date: '2026-11-29' }], dates, 'b')));
  assert.deepEqual(rows.map(row => row.name), ['말', '다', '우리']);
  assert.deepEqual(rows[0].days, {});
  assert.deepEqual(rows[1].days, { [dates[0]]: [{ title: '휴무', color: 'transparent', done: true }] });
  assert.equal(rows[2].days[dates[0]].length, 1);
});

test('위젯 순서 저장은 계정·그룹·종류별로 구분되며 탈퇴자와 중복 ID를 건너뛴다', t => {
  mockStorage(t);
  const scope = { userId: 'b', groupId: group.id, calendarType: 'work' };
  const joined = [
    { user_id: 'd', nickname: '나무오이' },
    ...roster,
    { user_id: 'c', nickname: '참오이' },
    { user_id: 'e', nickname: '가시오이' },
  ];
  saveWidgetMemberOrder(scope, ['deleted', 'c', 'b', 'a', 'c', null]);
  const savedIds = readWidgetMemberOrder(scope);
  assert.deepEqual(savedIds, ['deleted', 'c', 'a']);
  assert.deepEqual(orderWidgetMembers(joined, scope.userId, savedIds).map(row => row.user_id),
    ['b', 'c', 'a', 'e', 'd']);
  for (const other of [{ userId: 'a' }, { groupId: 'group-b' }, { calendarType: 'event' }]) {
    assert.deepEqual(readWidgetMemberOrder({ ...scope, ...other }), []);
  }
  saveWidgetMemberOrder(scope, []);
  assert.deepEqual(readWidgetMemberOrder(scope), []);
});

test('가입·허용된 종류만 조회하며 이번 주와 해가 바뀌는 다음 주에 저장 순서를 사용한다', async t => {
  mockStorage(t);
  saveWidgetMemberOrder({ userId: 'b', groupId: group.id, calendarType: 'work' }, ['c', 'a']);
  const calls = [];
  const read = vm.runInNewContext(data + '\nfetchWidgetGroupBoards', {
    Date, readWidgetMemberOrder, groupModule: { buildGroupWidgetRows: board, fetchCalendarGroups: async () => [group,
      { ...group, id: 'group-b', allow_event: false }, { id: 'off' }] },
    supabase: { rpc: async (name, params) => {
      calls.push({ name, ...params });
      if (name === 'get_calendar_group_members') return { data: [...roster, { user_id: 'c', nickname: '참오이' }] };
      return params.p_calendar_type === 'event' ? { error: '권한 해제' } : { data: [] };
    } },
  });
  const boards = await read(new Date(2026, 11, 31), 'b');
  assert.equal(boards.study.length, 0);
  assert.equal(boards.work.length, 2);
  assert.equal(boards.event.length, 1);
  assert.deepEqual(Object.keys(boards.event[0].weeks), []);
  assert.deepEqual(Object.keys(boards.work[0].weeks), ['2026-12-27', '2027-01-03']);
  assert.equal(boards.work[0].weeks['2026-12-27'].map(row => row.name).join(','), '말,참,다');
  assert.equal(boards.work[0].weeks['2027-01-03'].map(row => row.name).join(','), '말,참,다');
  assert.equal(boards.work[1].weeks['2027-01-03'].map(row => row.name).join(','), '말,다,참');
  assert.equal(calls.filter(call => call.name === 'get_calendar_group_members').length, 2);
  const reads = calls.filter(call => call.name === 'get_group_calendar_view');
  assert.equal(reads.length, 3);
  assert.ok(reads.every(call => call.p_start_date === '2026-12-27' && call.p_end_date === '2027-01-09'));
});
