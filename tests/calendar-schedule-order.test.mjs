import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCalendarScheduleOrder } from '../assets/js/modules/calendar-schedule-order.js';

const scope = { userId: 'user-a', calendarType: 'study', dateKey: '2026-11-17' };
const key = 'mallin_calendar_schedule_order:user-a:study:2026-11-17';
const todos = [{ id: 'a', text: '단백질' }, { id: 'b', text: '유산소', done: true }, { id: 'c', text: '독서' }];

function useStorage(t, getItem) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem } });
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'localStorage', descriptor);
    else delete globalThis.localStorage;
  });
}

test('저장 순서는 해당 계정, 캘린더 종류, 날짜에만 적용된다', (t) => {
  useStorage(t, (name) => name === key ? '["b","a"]' : null);
  assert.deepEqual(applyCalendarScheduleOrder({ ...scope, todos }), [todos[1], todos[0], todos[2]]);
  for (const other of [{ userId: 'user-b' }, { calendarType: 'event' }, { dateKey: '2026-11-18' }]) {
    assert.equal(applyCalendarScheduleOrder({ ...scope, ...other, todos }), todos);
  }
});

test('삭제된 일정을 건너뛰고 새 일정들을 기존 순서대로 덧붙인다', (t) => {
  useStorage(t, () => '["deleted","b"]');
  assert.deepEqual(applyCalendarScheduleOrder({ ...scope, todos }), [todos[1], todos[0], todos[2]]);
  assert.equal(todos[0].id, 'a');
  assert.equal(todos[1].done, true);
});

test('기기 저장소를 읽지 못하면 원래 순서로 표시한다', (t) => {
  useStorage(t, () => { throw new Error('storage unavailable'); });
  assert.equal(applyCalendarScheduleOrder({ ...scope, todos }), todos);
});
