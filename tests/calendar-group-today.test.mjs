import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const source = readFileSync(new URL('../assets/js/modules/calendar-groups.js', import.meta.url), 'utf8')
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
  .replaceAll('export ', '').replaceAll('import.meta.url', JSON.stringify(import.meta.url));
class Element {
  className = ''; children = []; dataset = {}; attributes = {};
  classList = { add: value => { this.className += ` ${value}`; } };
  style = { setProperty() {} };
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener() {}
}
function all(root, cls) { return [root, ...root.children.flatMap(n => all(n, cls))].filter(n => n.className.split(' ').includes(cls)); }
function render({ type = 'study', date = '2026-10-28', selected = '2026-10-29', members = false,
  dateItems, eventsByDate, userId, userNickname, appMode = false } = {}) {
  const context = vm.createContext({ console, URL,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 28, 12, 0, 0])); } },
    document: { createElement: () => new Element() },
    isCalendarAppMode: () => appMode,
    normalizeCategoryColor: (color, fallback) => color || fallback,
    appendKoreanHolidayBadge: head => { const badge = new Element(); badge.className = 'holiday-test'; head.append(badge); },
  });
  vm.runInContext(source + '\nglobalThis.render = appendCalendarGroupBoard;', context);
  const root = new Element();
  context.render(root, dateItems ?? [
    { dateKey: date, dateNumber: 28, weekday: '수', isCurrentMonth: true },
    { dateKey: '2026-10-29', dateNumber: 29, weekday: '목', isCurrentMonth: true },
  ], { calendarType: type, userId, userNickname, selectedGroup: { id: 'group', [`allow_${type}`]: true },
    eventsByDate: eventsByDate ?? (members ? { [date]: [{ userId: 'a', name: '테스트 가', events: [] }, { userId: 'b', name: '테스트 나', events: [] }] } : {}),
  }, { selectedDateKey: selected });
  return root;
}
test('세 캘린더 그룹 모두 오늘 머리글과 모든 회원의 오늘 칸을 표시한다', () => {
  for (const type of ['study', 'work', 'event']) {
    const root = render({ type, members: true });
    const heads = all(root, 'calendar-group-schedule__date-head');
    assert.equal(heads[0].attributes['aria-current'], 'date');
    assert.match(heads[0].attributes['aria-label'], /오늘/);
    assert.equal(all(root, 'is-today').length, 3);
    assert.equal(all(root, 'is-selected').length, 2);
    assert.equal(all(root, 'holiday-test').length, 2);
  }
});
test('빈 그룹의 공유 행에서도 오늘과 선택 날짜를 독립적으로 유지한다', () => {
  const root = render({ selected: '2026-10-28' });
  assert.equal(all(root, 'is-today').length, 2);
  assert.equal(all(root, 'is-selected').length, 1);
});
test('오늘이 없는 달에는 오늘 표시를 붙이지 않는다', () => {
  assert.equal(all(render({ date: '2026-11-28' }), 'is-today').length, 0);
});

test('세 그룹 캘린더의 앱과 웹에서 내 행이 공유 행보다 먼저 표시된다', () => {
  const sharedEvent = { title: '같이 하는 일정', shared_group_id: 'group', shared_origin_todo_id: 'shared' };
  const eventsByDate = {
    '2026-10-28': [
      { userId: 'other', name: '다순이', events: [sharedEvent] },
      { userId: 'own', name: '말오닷', events: [sharedEvent, { title: '내 일정' }] },
      { userId: 'last', name: '하늘', events: [] },
    ],
  };
  for (const type of ['study', 'work', 'event']) {
    const root = render({ type, appMode: true, userId: 'own', eventsByDate });
    assert.deepEqual(all(root, 'calendar-group-schedule__name').map(name => name.textContent), ['말', '우리', '다', '하']);
    const badges = all(root, 'calendar-group-schedule__badge').map(badge => badge.textContent);
    assert.deepEqual(badges, ['내 일정', '같이 하는 일정']);
  }
  const web = render({ userId: 'own', eventsByDate });
  assert.deepEqual(all(web, 'calendar-group-schedule__name').map(name => name.textContent), ['말', '우리', '다', '하']);
});

test('앱에서 내 일정이 없는 주도 로그인한 계정이 첫 줄에 나온다', () => {
  const dateItems = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(Date.UTC(2026, 10, index + 1));
    return { dateKey: date.toISOString().slice(0, 10), dateNumber: date.getUTCDate(), isCurrentMonth: true };
  });
  const root = render({
    appMode: true, userId: 'own', userNickname: '말오닷', dateItems,
    eventsByDate: { '2026-11-01': [{ userId: 'other', name: '다순이', events: [] }] },
  });
  const weeks = all(root, 'calendar-group-schedule__week');
  const names = weeks.map(week => all(week, 'calendar-group-schedule__name').map(name => name.textContent));
  assert.deepEqual(names, [['말', '다'], ['말']]);
});
