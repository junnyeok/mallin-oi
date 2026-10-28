import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { normalizeCategoryColor } from '../assets/js/modules/calendar-category-color.js';
import { fileURLToPath } from 'node:url';

import { normalizeBackupPayload } from '../assets/js/modules/calendar-group-backup-comparison.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const eventSourcePayload = {
  isDone: false,
  eventTime: null,
  eventEndTime: null,
  eventRangeId: 'range-1',
  categoryName: '일정',
  shared_group_id: null,
  shared_origin_todo_id: null,
  shared_origin_user_id: null,
  shared_created_by: null,
  is_shared_copy: false,
};

test('이벤트 백업 비교는 서버가 추가한 카테고리 메타데이터를 변경으로 오인하지 않는다', () => {
  const storedPayload = {
    ...eventSourcePayload,
    categoryId: 'category-1',
    categoryIsDefault: true,
    categorySortOrder: 100,
  };

  assert.deepEqual(
    normalizeBackupPayload(eventSourcePayload, 'event'),
    normalizeBackupPayload(storedPayload, 'event'),
  );
});

test('이벤트 일정의 실제 내용이 바뀌면 새 백업이 필요하다고 구분한다', () => {
  const storedPayload = {
    ...eventSourcePayload,
    eventTime: '10:00:00',
  };

  assert.notDeepEqual(
    normalizeBackupPayload(eventSourcePayload, 'event'),
    normalizeBackupPayload(storedPayload, 'event'),
  );
});

test('이벤트 boolean 문자열은 원본 boolean과 동일하게 비교한다', () => {
  assert.deepEqual(
    normalizeBackupPayload(eventSourcePayload, 'event'),
    normalizeBackupPayload(
      {
        ...eventSourcePayload,
        isDone: 'false',
        is_shared_copy: 'false',
      },
      'event',
    ),
  );
});

test('캘린더 그룹 코드와 배포 번들이 순수 비교 모듈을 함께 사용한다', () => {
  const relativePaths = [
    'assets/js/modules/calendar-groups.js',
    'assets/js/modules/calendar-group-backup-comparison.js',
  ];
  const targets = [
    'www',
    'android/app/src/main/assets/public',
    'ios/App/App/public',
  ];

  const groupsSource = fs.readFileSync(
    path.join(rootDir, relativePaths[0]),
    'utf8',
  );
  assert.match(
    groupsSource,
    /import \{ normalizeBackupPayload \} from '\.\/calendar-group-backup-comparison\.js';/,
  );

  for (const relativePath of relativePaths) {
    const expected = fs.readFileSync(path.join(rootDir, relativePath));
    for (const target of targets) {
      assert.deepEqual(
        fs.readFileSync(path.join(rootDir, target, relativePath)),
        expected,
        `${target}/${relativePath} mismatch`,
      );
    }
  }
});

test('백업 버튼은 그룹 팝업 밖의 캘린더 상단에 두고 그룹 연동 중에만 표시한다', () => {
  const groupsSource = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/calendar-groups.js'),
    'utf8',
  );
  const copyPasteSource = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/calendar-group-copy-paste.js'),
    'utf8',
  );
  const entrySheetCss = fs.readFileSync(
    path.join(rootDir, 'assets/css/components/calendar-entry-sheet.css'),
    'utf8',
  );
  const groupsCss = fs.readFileSync(
    path.join(rootDir, 'assets/css/main/calendar-groups-main.css'),
    'utf8',
  );

  assert.match(
    groupsSource,
    /head\.append\(bar, backupButton\)/,
  );
  assert.match(
    groupsSource,
    /backupButton\.hidden = !isActive/,
  );
  assert.doesNotMatch(
    groupsSource,
    /<button class="calendar-group-bar__backup" type="button">백업<\/button>/,
  );
  assert.match(
    copyPasteSource,
    /closeButton\.insertAdjacentElement\('beforebegin', button\)/,
  );
  assert.match(
    entrySheetCss,
    /calendar-group-bar__backup--header[\s\S]*order: 4;[\s\S]*margin-left: auto;/,
  );
  assert.match(
    groupsCss,
    /calendar-group-bar__backup--header \{[\s\S]*min-height: 40px;[\s\S]*padding: 0 var\(--space-16\);[\s\S]*border-radius: var\(--radius-pill\);[\s\S]*font-weight: 900;/,
  );
  assert.match(
    groupsCss,
    /calendar-group-bar__backup\.is-backup-needed:not\(:disabled\) \{[\s\S]*animation: calendar-group-backup-needed 1\.8s ease-in-out infinite;/,
  );
});


const groupsSource = fs.readFileSync(
  path.join(rootDir, 'assets/js/modules/calendar-groups.js'), 'utf8',
);

function functionSource(name, indent = '') {
  return groupsSource.match(new RegExp(`^${indent}(?:async )?function ${name}\\([\\s\\S]*?^${indent}}`, 'm'))[0];
}

function comparisonHarness(calendarType) {
  const rows = {};
  const supabase = { from(table) {
    return { select() { return this; }, eq() { return this; },
      then(resolve, reject) { return Promise.resolve({ data: rows[table] || [] }).then(resolve, reject); } };
  } };
  const context = vm.createContext({ supabase, normalizeBackupPayload, normalizeCategoryColor });
  const config = groupsSource.match(/const BACKUP_SOURCE_CONFIG = [\s\S]*?^};/m)[0];
  vm.runInContext(config + '\n' + [
    'normalizeColor', 'getRelatedCategory', 'makeBackupComparable',
    'makeSourceBackupEvent', 'makeStoredBackupEvent', 'serializeBackupEvents',
    'makeSourceBackupCategory', 'makeStoredBackupCategory', 'serializeBackupCategories',
    'checkBackupNeeded',
  ].map(name => functionSource(name)).join('\n'), context);
  const categoryTable = `${calendarType}_calendar_categories`;
  const sourceTable = `${calendarType}_calendar_todos`;
  const category = { id: 'category', name: '카테고리', slug: 'custom', color: '#abcdef', is_default: false, sort_order: 0,
    ...(calendarType === 'work' ? { start_time: '09:00:00', end_time: '18:00:00', ends_next_day: false } : {}) };
  const event = { id: 'todo', memo: '메모', is_done: false,
    ...(calendarType === 'study' ? { todo_date: '2026-10-28', todo_type: 'custom', todo_text: '일정', todo_time: '09:00:00', todo_end_date: '2026-10-28', todo_end_time: '10:00:00' }
      : calendarType === 'work' ? { work_date: '2026-10-28', work_type: 'custom', work_text: '근무' }
        : { event_date: '2026-10-28', event_type: 'custom', event_text: '약속', event_time: '09:00:00', event_end_time: '10:00:00', event_range_id: 'range', is_shared_copy: false }),
    [categoryTable]: category };
  rows[sourceTable] = [event];
  rows[categoryTable] = [category];
  const comparable = context.makeSourceBackupEvent(event, calendarType);
  const backup = { source_event_id: comparable.sourceEventId, event_date: comparable.eventDate,
    event_type: comparable.eventType, title: comparable.title, memo: comparable.memo,
    color: comparable.color, payload: comparable.payload };
  const categoryComparable = context.makeSourceBackupCategory(category, calendarType);
  const backupCategory = { source_category_id: categoryComparable.sourceCategoryId, name: categoryComparable.name,
    source_slug: categoryComparable.sourceSlug, color: categoryComparable.color,
    source_is_default: categoryComparable.sourceIsDefault, source_sort_order: categoryComparable.sourceSortOrder,
    settings: categoryComparable.settings };
  rows.calendar_group_shared_events = [structuredClone(backup)];
  rows.calendar_group_shared_categories = [structuredClone(backupCategory)];
  return { context, event, category, rows, check: () => context.checkBackupNeeded({ userId: 'user', groupId: 'group', calendarType }) };
}

test('세 캘린더에서 일정·메모·완료·색상·순서·시간 변경은 모두 백업 대기로 비교한다', async () => {
  for (const type of ['study', 'work', 'event']) {
    const fixture = comparisonHarness(type);
    assert.equal(await fixture.check(), false, `${type}: baseline`);
    const changes = [
      [fixture.event, 'memo', '새 메모'], [fixture.event, 'is_done', true],
      [fixture.category, 'name', '새 이름'], [fixture.category, 'color', 'transparent'],
      [fixture.category, 'sort_order', 100],
      ...(type === 'study' ? [[fixture.event, 'todo_text', '새 일정'], [fixture.event, 'todo_time', '11:00:00'], [fixture.event, 'todo_end_time', '12:00:00'], [fixture.event, 'todo_end_date', '2026-10-29']]
        : type === 'event' ? [[fixture.event, 'event_text', '새 일정'], [fixture.event, 'event_time', '11:00:00'], [fixture.event, 'event_end_time', '12:00:00']]
          : [[fixture.event, 'work_text', '새 근무'], [fixture.category, 'start_time', '11:00:00'], [fixture.category, 'end_time', '12:00:00'], [fixture.category, 'ends_next_day', true]]),
    ];
    const snapshots = JSON.stringify([fixture.rows.calendar_group_shared_events, fixture.rows.calendar_group_shared_categories]);
    for (const [row, key, changed] of changes) {
      const before = row[key]; row[key] = changed;
      assert.equal(await fixture.check(), true, `${type}: ${key}`);
      assert.equal(JSON.stringify([fixture.rows.calendar_group_shared_events, fixture.rows.calendar_group_shared_categories]), snapshots,
        '상태 확인은 저장된 그룹 스냅샷을 변경하지 않는다');
      row[key] = before;
      assert.equal(await fixture.check(), false, `${type}: restored ${key}`);
    }
    fixture.rows[`${type}_calendar_todos`] = [];
    assert.equal(await fixture.check(), true, `${type}: deleted event`);
  }
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function backupControllerHarness({ check = async () => false, rpc = async () => [] } = {}) {
  const state = { selectedGroup: { id: 'group' }, userId: 'user', calendarType: 'study',
    backupNeeded: false, backupChecking: false, backupRunning: false, backupCheckId: 0, backupStatus: 'idle' };
  const backupButton = { dataset: {}, attributes: {}, classList: { toggle() {} },
    setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(_, listener) { this.click = listener; } };
  const context = vm.createContext({ state, backupButton,
    BACKUP_STATUS: { IDLE: 'idle', PENDING: 'pending', CHECKING: 'checking', RUNNING: 'running' },
    isCalendarGroupActive: value => Boolean(value.selectedGroup?.id), calendarType: 'study',
    CALENDAR_LABELS: { study: '자기개발' }, checkBackupNeeded: check, rpc,
    console: { error() {} }, setStatus() {}, refreshCalendar: async () => {},
  });
  const listener = groupsSource.slice(groupsSource.indexOf("  backupButton.addEventListener('click', async () => {"),
    groupsSource.indexOf('\n\n  try {\n    await loadGroups();'));
  vm.runInContext(['updateBackupButtonState', 'setBackupNeeded', 'refreshBackupNeeded']
    .map(name => functionSource(name, '  ')).join('\n') +
    '\nfunction renderSelect() { updateBackupButtonState(); }\n' + listener, context);
  return { state, backupButton, refresh: () => context.refreshBackupNeeded(), setNeeded: value => context.setBackupNeeded(value) };
}

test('그룹 화면에서 상태 재확인은 즉시 버튼을 갱신하고 백업 RPC를 호출하지 않는다', async () => {
  let needed = false;
  let writes = 0;
  const fixture = backupControllerHarness({ check: async () => needed, rpc: async () => { writes++; return []; } });
  await fixture.refresh();
  assert.equal(fixture.backupButton.disabled, true);
  needed = true;
  await fixture.refresh();
  assert.equal(fixture.backupButton.disabled, false);
  assert.equal(fixture.backupButton.dataset.backupNeeded, 'true');
  assert.equal(writes, 0);
  needed = false;
  await fixture.backupButton.click();
  assert.equal(writes, 1);
  assert.equal(fixture.backupButton.disabled, true);
});

test('늦게 완료된 비교가 새 변경 또는 새 그룹의 백업 상태를 덮어쓰지 않는다', async () => {
  const first = deferred();
  let calls = 0;
  const fixture = backupControllerHarness({ check: () => ++calls === 1 ? first.promise : Promise.resolve(true) });
  const stale = fixture.refresh();
  await fixture.refresh();
  first.resolve(false);
  await stale;
  assert.equal(fixture.state.backupNeeded, true);
  const next = deferred();
  const switched = backupControllerHarness({ check: () => next.promise });
  const oldGroup = switched.refresh();
  switched.state.selectedGroup = { id: 'another-group' };
  switched.setNeeded(true);
  next.resolve(false);
  await oldGroup;
  assert.equal(switched.state.backupNeeded, true);
});

test('백업 중 수정·새로고침은 중복 백업을 열지 않으며 완료 뒤 새 변경을 다시 비교한다', async () => {
  const write = deferred();
  let writes = 0, reads = 0;
  const fixture = backupControllerHarness({ check: async () => { reads++; return true; },
    rpc: () => { writes++; return write.promise; } });
  fixture.setNeeded(true);
  const running = fixture.backupButton.click();
  assert.equal(fixture.state.backupRunning, true);
  await fixture.refresh();
  assert.equal(reads, 0);
  assert.equal(fixture.backupButton.disabled, true);
  await fixture.backupButton.click();
  assert.equal(writes, 1);
  write.resolve([{ event_count: 1 }]);
  await running;
  assert.equal(reads, 1);
  assert.equal(fixture.state.backupRunning, false);
  assert.equal(fixture.state.backupNeeded, true);
  assert.equal(fixture.backupButton.disabled, false);
});

test('백업 실패 뒤에도 변경은 남아 다시 시도할 수 있다', async () => {
  const fixture = backupControllerHarness({ check: async () => true, rpc: async () => { throw new Error('offline'); } });
  fixture.setNeeded(true);
  await fixture.backupButton.click();
  assert.equal(fixture.state.backupRunning, false);
  assert.equal(fixture.state.backupNeeded, true);
  assert.equal(fixture.backupButton.disabled, false);
});

test('업무 개별 시간 지정·변경·익일·해제는 백업 버튼으로만 반영할 변경이다', async () => {
  const fixture = comparisonHarness('work');
  // Legacy snapshots omit the override fields; a default-time entry is equal.
  fixture.event.has_time_override = false;
  fixture.event.start_time = null;
  fixture.event.end_time = null;
  fixture.event.ends_next_day = false;
  assert.equal(await fixture.check(), false);
  const snapshot = fixture.rows.calendar_group_shared_events[0];
  delete snapshot.payload.hasTimeOverride;
  delete snapshot.payload.startTime;
  delete snapshot.payload.endTime;
  delete snapshot.payload.endsNextDay;
  assert.equal(await fixture.check(), false);
  fixture.event.has_time_override = true;
  fixture.event.start_time = '22:00:00';
  fixture.event.end_time = '07:00:00';
  fixture.event.ends_next_day = true;
  assert.equal(await fixture.check(), true, '새 개별 시간 지정');
  // Simulate the explicit backup result, then mutate each meaningful field.
  snapshot.payload = structuredClone(fixture.context.makeSourceBackupEvent(fixture.event, 'work').payload);
  assert.equal(await fixture.check(), false);
  for (const [key, changed] of [['start_time', '21:00:00'], ['end_time', '08:00:00'], ['ends_next_day', false], ['has_time_override', false]]) {
    const before = fixture.event[key];
    fixture.event[key] = changed;
    assert.equal(await fixture.check(), true, key);
    fixture.event[key] = before;
  }
});

test('업무 개별 시간 비교는 구형 누락값·boolean 문자열·사용하지 않는 값을 정규화한다', () => {
  const defaults = { categoryName: '주간', categoryStartTime: '09:00:00', categoryEndTime: '18:00:00', categoryEndsNextDay: false };
  assert.deepEqual(normalizeBackupPayload(defaults, 'work'), normalizeBackupPayload({ ...defaults,
    hasTimeOverride: false, startTime: 'unused', endTime: 'unused', endsNextDay: true,
  }, 'work'));
  assert.deepEqual(normalizeBackupPayload({ ...defaults, hasTimeOverride: true, startTime: '22:00:00', endTime: '07:00:00', endsNextDay: true }, 'work'),
    normalizeBackupPayload({ ...defaults, hasTimeOverride: 'true', startTime: '22:00:00', endTime: '07:00:00', endsNextDay: 'true' }, 'work'));
});

function categoryMutationHarness(type, { failAfterWrite = false } = {}) {
  const source = fs.readFileSync(path.join(rootDir, `assets/js/modules/${type}-calendar.js`), 'utf8');
  const category = { id: 'category', name: '기존', slug: 'custom', color: '#abcdef' };
  const fallback = { id: 'default', name: '기본', slug: 'etc', color: '#eeeeee', is_default: true };
  let notifications = 0, writes = 0;
  const group = { state: { selectedGroup: { id: 'active-group' } }, refreshBackupNeeded() { notifications++; } };
  const state = { userId: 'user', categories: [category, fallback], store: {}, group };
  const context = vm.createContext({ state, typeSelect: { value: category.id },
    normalizeCategoryName: value => value.trim(), normalizeColor: normalizeCategoryColor,
    updateCategory: async values => { writes++; return { ...category, ...values, id: category.id }; },
    insertCategory: async values => { writes++; return { ...values, id: 'new' }; },
    moveTodosToCategory: async () => { writes++; }, deleteCategoryById: async () => { writes++; },
    deleteSharedPersonalCategoryById: async () => { writes++; },
    getFallbackCategory: () => fallback, fetchUserCategories: async () => state.categories,
    reloadStoreForMode: async () => {}, refreshCategories: async () => { if (failAfterWrite) throw new Error('late refresh failed'); },
    validateWorkCategoryTimes: () => ({ startTime: '09:00', endTime: '18:00' }),
    createHandledCalendarError: message => new Error(message), syncSharedPersonalCategory: async () => {},
    renderAll() {}, alert() {}, window: { confirm: () => true },
    categoryForm: { querySelector: () => null }, categoryNameInput: { value: '새 분류', focus() {} },
    categoryColorInput: { value: '#abcdef', dataset: {} }, categoryPalette: {},
    categoryStartTimeInput: { dataset: {} }, categoryEndTimeInput: { dataset: {} }, isAddingCategory: false,
    readCategoryColor: () => 'transparent', setCategoryColor() {}, setWorkCategoryTimeInputValue() {},
    renderCategoryPalette() {}, nextCategorySortOrder: () => 100, sortCategories: values => values,
    syncOpenCategorySelect() {},
  });
  const functions = ['refreshGroupBackupNeeded', 'saveCategory', 'removeCategory'].map(name => {
    const match = source.match(new RegExp(`^  (?:async )?function ${name}\\([\\s\\S]*?^  }\\n`, 'm'));
    assert.ok(match, `${type} ${name}`);
    return match[0];
  }).join('\n');
  const start = source.indexOf("categoryForm.addEventListener('submit', async (event) => {");
  const callbackStart = source.indexOf('async (event) => {', start);
  const callbackEnd = source.indexOf('\n    });', callbackStart);
  vm.runInContext(functions + '\nglobalThis.submitCategory = ' + source.slice(callbackStart, callbackEnd) + '\n};', context);
  return { context, category, state, get notifications() { return notifications; }, get writes() { return writes; } };
}

test('그룹을 연 채 세 달력의 카테고리 추가·색/시간 저장·삭제가 즉시 백업 재확인을 요청한다', async () => {
  for (const type of ['study', 'work', 'event']) {
    for (const operation of ['save', 'add', 'delete', ...(type === 'event' ? ['sharedDelete'] : [])]) {
      const fixture = categoryMutationHarness(type);
      if (operation === 'save') await fixture.context.saveCategory({ category: fixture.category, name: '새 이름', color: 'transparent', startTime: '09:00', endTime: '18:00' });
      if (operation === 'add') await fixture.context.submitCategory({ preventDefault() {} });
      if (operation === 'delete') await fixture.context.removeCategory(fixture.category);
      if (operation === 'sharedDelete') await fixture.context.removeCategory({ ...fixture.category, is_shared_personal: true, shared_group_id: 'active-group' });
      assert.ok(fixture.writes > 0, `${type} ${operation}: persisted`);
      assert.equal(fixture.notifications, 1, `${type} ${operation}: notified without switching group`);
      assert.equal(fixture.state.group.state.selectedGroup.id, 'active-group');
    }
  }
});

test('카테고리 저장 후 화면 재조회가 실패해도 백업 대기 상태 재확인은 누락하지 않는다', async () => {
  for (const type of ['study', 'work', 'event']) {
    const fixture = categoryMutationHarness(type, { failAfterWrite: true });
    try { await fixture.context.saveCategory({ category: fixture.category, name: '새 이름', color: 'transparent' }); }
    catch (error) { assert.equal(type, 'work'); assert.equal(error.message, 'late refresh failed'); }
    assert.equal(fixture.writes, 1);
    assert.equal(fixture.notifications, 1);
  }
});
