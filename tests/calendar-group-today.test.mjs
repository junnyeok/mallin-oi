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
  append(...nodes) { this.children.push(...nodes); }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener() {}
}
function all(root, cls) { return [root, ...root.children.flatMap(n => all(n, cls))].filter(n => n.className.split(' ').includes(cls)); }
function render({ type = 'study', date = '2026-10-28', selected = '2026-10-29', members = false } = {}) {
  const context = vm.createContext({ console, URL,
    Date: class extends Date { constructor(...args) { super(...(args.length ? args : [2026, 9, 28, 12, 0, 0])); } },
    document: { createElement: () => new Element() },
    appendKoreanHolidayBadge: head => { const badge = new Element(); badge.className = 'holiday-test'; head.append(badge); },
  });
  vm.runInContext(source + '\nglobalThis.render = appendCalendarGroupBoard;', context);
  const root = new Element();
  context.render(root, [
    { dateKey: date, dateNumber: 28, weekday: '수', isCurrentMonth: true },
    { dateKey: '2026-10-29', dateNumber: 29, weekday: '목', isCurrentMonth: true },
  ], { calendarType: type, selectedGroup: { id: 'group', [`allow_${type}`]: true },
    eventsByDate: members ? { [date]: [{ userId: 'a', name: '테스트 가', events: [] }, { userId: 'b', name: '테스트 나', events: [] }] } : {},
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
