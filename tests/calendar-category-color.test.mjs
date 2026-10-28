import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeCategoryColor, readCategoryColor, setCategoryColor, initCategoryColorInput, createCategoryNoColorButton } from '../assets/js/modules/calendar-category-color.js';
import { normalizeCalendarPasteCategories } from '../assets/js/modules/calendar-copy-buffer.js';

test('색 없음과 검정색을 구분하고 잘못된 색상만 기본색으로 대체한다', () => {
  assert.equal(normalizeCategoryColor(' transparent '), 'transparent');
  assert.equal(normalizeCategoryColor('#000000'), '#000000');
  assert.equal(normalizeCategoryColor('#AABBCC'), '#aabbcc');
  assert.equal(normalizeCategoryColor('url(bad)'), '#eaffd7');
  assert.equal(normalizeCategoryColor('', '#ffe0ef'), '#ffe0ef');
});

test('네이티브 color 입력을 깨뜨리지 않고 투명 선택 후 일반 색상으로 돌아간다', () => {
  const input = { value: '#112233', dataset: {} };
  setCategoryColor(input, 'transparent');
  assert.equal(input.value, '#112233');
  assert.equal(readCategoryColor(input), 'transparent');
  assert.equal(input.title, '색 없음');
  setCategoryColor(input, '#000000');
  assert.equal(readCategoryColor(input), '#000000');
  assert.equal(input.dataset.noColor, 'false');
});

test('색상 버튼은 기본 선택창 동작을 막지 않고 색 없음 선택은 별도 버튼에서 처리한다', () => {
  class Element extends EventTarget {
    value = '#112233'; dataset = {}; attributes = {};
    setAttribute(key, value) { this.attributes[key] = value; }
  }
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  try {
    const input = new Element();
    initCategoryColorInput(input, '#112233');
    const button = createCategoryNoColorButton(input);
    const click = new Event('click', { cancelable: true });
    input.dispatchEvent(click);
    assert.equal(click.defaultPrevented, false);
    button.dispatchEvent(new Event('click'));
    assert.equal(readCategoryColor(input), 'transparent');
    assert.equal(button.attributes['aria-pressed'], 'true');
    // Cancelling a native picker does not emit input, so transparency stays selected.
    input.dispatchEvent(new Event('click'));
    assert.equal(readCategoryColor(input), 'transparent');
    // A native color selection clears transparency and synchronizes the button.
    input.value = '#000000';
    input.dispatchEvent(new Event('input'));
    assert.equal(readCategoryColor(input), '#000000');
    assert.equal(button.attributes['aria-pressed'], 'false');
    button.dispatchEvent(new Event('click'));
    button.dispatchEvent(new Event('click'));
    assert.equal(readCategoryColor(input), '#000000');
    assert.equal(button.attributes['aria-pressed'], 'false');
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test('개인 세 달력과 그룹 배지 모두 투명에서는 테마 본문 글자색을 사용한다', () => {
  for (const file of ['study-calendar', 'work-calendar', 'event-calendar', 'calendar-groups']) {
    const source = readFileSync(new URL(`../assets/js/modules/${file}.js`, import.meta.url), 'utf8');
    const name = file === 'calendar-groups' ? 'getTextColor' : 'getCategoryTextColor';
    const normalizer = source.match(/^function normalizeColor\([\s\S]*?^}/m)[0];
    const textColor = source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}`, 'm'))[0];
    const context = vm.createContext({ normalizeCategoryColor });
    vm.runInContext(normalizer + '\n' + textColor + `\nglobalThis.color = ${name};`, context);
    assert.equal(context.color('transparent'), 'var(--color-text)', file);
    assert.equal(context.color('#000000'), '#ffffff', file);
    assert.equal(context.color('#ffffff'), '#111111', file);
  }
});

test('그룹 복사 원본과 대상의 색 없음 설정을 정규화 과정에서도 보존한다', () => {
  const [category] = normalizeCalendarPasteCategories([{
    source_category_key: 'source', category_name: '휴무', color: 'transparent',
    target_category_id: 'existing', target_color: 'transparent', source_sort_order: 0,
  }]);
  assert.equal(category.color, 'transparent');
  assert.equal(category.targetColor, 'transparent');
  assert.throws(() => normalizeCalendarPasteCategories([{
    source_category_key: 'source', category_name: '휴무', color: 'url(bad)',
  }]), /color/);
});

test('위젯으로 전달하는 실제 payload 가공에서도 색 없음을 기본색으로 바꾸지 않는다', () => {
  const source = readFileSync(new URL('../assets/js/modules/calendar-widget-data.js', import.meta.url), 'utf8');
  const functions = ['getWidgetItemDisplayTitle', 'prepareWidgetItem'].map(name =>
    source.match(new RegExp(`^function ${name}\\([\\s\\S]*?^}\\s*$`, 'm'))[0]);
  const context = vm.createContext({ CALENDAR_WIDGET_FALLBACK_COLORS: { study: '#eeeeee', work: '#eeeeee', event: '#eeeeee' } });
  vm.runInContext(functions.join('\n') + '\nglobalThis.prepare = prepareWidgetItem;', context);
  for (const calendarType of ['study', 'work', 'event']) {
    assert.equal(context.prepare({ calendarType, categoryColor: 'transparent' }).displayColor, 'transparent');
    assert.equal(context.prepare({ calendarType, categoryColor: '#000000' }).displayColor, '#000000');
  }
});

test('원본과 생성본의 신규 공통 선택기 및 관련 변경 부분이 일치한다', () => {
  for (const file of ['assets/js/modules/calendar-category-color.js', 'assets/css/components/calendar-category-color.css']) {
    const original = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    for (const root of ['www', 'android/app/src/main/assets/public', 'ios/App/App/public']) {
      assert.equal(readFileSync(new URL(`../${root}/${file}`, import.meta.url), 'utf8'), original);
    }
  }
  const sql = readFileSync(new URL('../supabase-SQLEditor/20261028-calendar-category-no-color.sql', import.meta.url), 'utf8');
  assert.equal(readFileSync(new URL('../supabase/migrations/20261028000000_calendar_category_no_color.sql', import.meta.url), 'utf8'), sql);
  assert.ok(readFileSync(new URL('../supabase-SQLEditor/99_all_backup.sql', import.meta.url), 'utf8').includes(sql));
});
