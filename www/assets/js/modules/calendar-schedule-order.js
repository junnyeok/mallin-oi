import { enableCalendarListReorder } from './calendar-category-order.js';

export { resetCalendarListReorder } from './calendar-category-order.js';

function getOrderKey({ userId, calendarType, dateKey }) {
  if (!userId || !['study', 'event'].includes(calendarType) || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return null;
  }
  return `mallin_calendar_schedule_order:${userId}:${calendarType}:${dateKey}`;
}

function getTodoId(todo) {
  return String(todo.id ?? '');
}

export function applyCalendarScheduleOrder({ todos, ...scope }) {
  const key = getOrderKey(scope);
  if (!key || todos.length < 2) return todos;

  let savedIds;
  try {
    savedIds = JSON.parse(globalThis.localStorage.getItem(key));
  } catch {
    return todos;
  }
  if (!Array.isArray(savedIds)) return todos;

  // Keep newly added schedules in their default order after the saved ones.
  const ranks = new Map(savedIds.map((id, index) => [id, index]));
  const rank = (todo) => ranks.get(getTodoId(todo)) ?? savedIds.length;
  return [...todos].sort((a, b) => rank(a) - rank(b));
}

export function enableCalendarScheduleOrder({ root, todos, onChange, ...scope }) {
  const key = getOrderKey(scope);
  if (!key || todos.length < 2) return;

  const items = todos.map((todo) => ({ id: getTodoId(todo), name: todo.text || '일정' }));
  if (items.some(({ id }) => !id) || new Set(items.map(({ id }) => id)).size !== items.length) return;

  enableCalendarListReorder({
    root,
    items,
    handleSide: 'right',
    allowPageScroll: true,
    statusClass: 'calendar-schedule-order-status',
    itemClass: 'calendar-schedule-sortable',
    handleClass: 'calendar-schedule-handle',
    placeholderClass: 'is-schedule-placeholder',
    previewClass: 'calendar-schedule-drag-preview',
    instructions: '일정 오른쪽 손잡이를 누른 채 위아래로 끌면 순서를 바꿀 수 있어요.',
    failureMessage: '순서를 저장하지 못했어요. 기기의 저장 공간을 확인해 주세요.',
    onReorder(ids) {
      globalThis.localStorage.setItem(key, JSON.stringify(ids));
      onChange?.();
    },
  });
}
