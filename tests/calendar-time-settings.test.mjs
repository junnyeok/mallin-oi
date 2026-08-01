import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  formatCalendarTimeLabel,
  isOvernightTimeRange,
  joinLocalDateTimeValue,
  normalizeCalendarTime,
  resolveWorkCalendarTimeRange,
  splitLocalDateTimeValue,
} from '../assets/js/modules/calendar-time.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('시간 값은 브라우저 로케일이나 Date 파싱 없이 분 단위 문자열로 정규화한다', () => {
  assert.equal(normalizeCalendarTime('09:05:30'), '09:05');
  assert.equal(normalizeCalendarTime('24:00'), '');
  assert.equal(formatCalendarTimeLabel('00:00'), '오전 12:00');
  assert.deepEqual(splitLocalDateTimeValue('2026-07-30T22:15'), {
    date: '2026-07-30',
    time: '22:15',
  });
  assert.equal(joinLocalDateTimeValue('2026-07-30', ''), '2026-07-30');
  assert.equal(joinLocalDateTimeValue('2026-07-30', '06:30'), '2026-07-30T06:30');
  assert.deepEqual(
    splitLocalDateTimeValue('2026-07-30', {
      date: '2026-07-29',
      time: '06:30',
    }),
    {
      date: '2026-07-30',
      time: '',
    },
  );
});

test('업무 야간 범위는 종료가 시작보다 이르면 익일 종료로 해석한다', () => {
  assert.equal(isOvernightTimeRange('22:00', '06:00'), true);
  assert.equal(isOvernightTimeRange('09:00', '18:00'), false);
  assert.equal(isOvernightTimeRange('', '06:00'), false);
});

test('업무 일정별 시간이 있으면 카테고리 기본 시간보다 우선한다', () => {
  const category = { start_time: '09:00:00', end_time: '18:00:00' };

  assert.deepEqual(resolveWorkCalendarTimeRange({
    todo: { has_time_override: false },
    category,
  }), {
    startTime: '09:00',
    endTime: '18:00',
    endsNextDay: false,
    hasTimeOverride: false,
  });
  assert.deepEqual(resolveWorkCalendarTimeRange({
    todo: {
      has_time_override: true,
      start_time: '22:00:00',
      end_time: '06:00:00',
    },
    category,
  }), {
    startTime: '22:00',
    endTime: '06:00',
    endsNextDay: true,
    hasTimeOverride: true,
  });
  assert.deepEqual(resolveWorkCalendarTimeRange({
    todo: { has_time_override: true, start_time: null, end_time: null },
    category,
  }), {
    startTime: '',
    endTime: '',
    endsNextDay: false,
    hasTimeOverride: true,
  });
});

test('자기개발 생성·조회·수정은 nullable 시작/종료 필드를 모두 전달한다', () => {
  const source = read('assets/js/modules/study-calendar.js');
  assert.match(source, /todo_time,\s*todo_end_date,\s*todo_end_time/s);
  assert.match(source, /todo_time:\s*normalizeCalendarTime\(todoTime\)\s*\|\|\s*null/);
  assert.match(source, /p_todo_time:/);
  assert.match(source, /p_todo_end_date:/);
  assert.match(source, /p_todo_end_time:/);
  assert.doesNotMatch(source, /requireStartTime/);
  assert.match(source, /allowEmptyTime:\s*true/);
  assert.match(
    source,
    /todoEndDate:\s*nextEnd\.time\s*\?\s*nextEnd\.date\s*:\s*null/,
  );
  assert.match(source, /type:\s*'calendar-datetime'/);
  assert.doesNotMatch(source, /new Date\([^\n]*studyStart/);
});

test('이벤트 생성·수정은 빈 시작시간을 null로 전달하고 00:00을 만들지 않는다', () => {
  const source = read('assets/js/modules/event-calendar.js');
  assert.doesNotMatch(source, /normalizeRequiredCalendarTime/);
  assert.match(
    source,
    /p_event_time:\s*normalizeEventTime\(eventTime\)\s*\|\|\s*null/,
  );
  assert.match(source, /allowEmptyTime:\s*true/);
  assert.match(source, /timePlaceholder:\s*'시작시간 지정'/);
  assert.match(source, /timePlaceholder:\s*'종료시간 지정'/);
  assert.doesNotMatch(source, /setTimeInputValue\(timeInput,\s*'00:00'\)/);
});

test('시작·종료 행은 한 줄 공통 컨트롤을 사용하고 시간 해제는 선택창 안에만 둔다', () => {
  const sheetSource = read('assets/js/modules/calendar-entry-sheet.js');
  const studySource = read('assets/js/modules/study-calendar.js');
  const eventSource = read('assets/js/modules/event-calendar.js');
  const css = read('assets/css/components/calendar-entry-sheet.css');

  assert.match(sheetSource, /clearLabel:\s*`\$\{field\.label\}시간 해제`/);
  assert.match(
    studySource,
    /value:\s*joinLocalDateTimeValue\(endDate \|\| startDate, endTime\)/,
  );
  assert.match(
    eventSource,
    /value:\s*joinLocalDateTimeValue\(endDate, endTime\)/,
  );
  assert.doesNotMatch(studySource, /optionalLabel:\s*'종료시간 지정'/);
  assert.doesNotMatch(eventSource, /optionalLabel:\s*'종료시간 지정'/);
  assert.match(
    css,
    /\.calendar-entry-sheet__datetime\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*minmax\(104px,\s*0\.82fr\)/s,
  );
  assert.match(
    css,
    /@media \(max-width:\s*767px\)[\s\S]*?\.calendar-entry-sheet__field\s*\{[^}]*grid-template-columns:\s*52px\s+minmax\(0,\s*1fr\)/s,
  );
  assert.doesNotMatch(
    css,
    /@media \(max-width:\s*767px\)[\s\S]*?\.calendar-entry-sheet__datetime\s*\{[^}]*grid-template-columns:\s*1fr/s,
  );
  assert.match(
    css,
    /\.calendar-entry-sheet__textarea-field\s*\{[^}]*padding-top:\s*var\(--space-12\)/s,
  );
});

test('업무 시간은 새 일정과 개별 수정 일정에 스냅샷으로 저장한다', () => {
  const source = read('assets/js/modules/work-calendar.js');
  assert.match(source, /start_time:\s*times\.startTime\s*\|\|\s*null/);
  assert.match(source, /end_time:\s*times\.endTime\s*\|\|\s*null/);
  assert.match(source, /ends_next_day:\s*times\.endsNextDay/);
  assert.match(source, /isOvernightTimeRange\(start, end\)/);
  assert.match(source, /start_time:\s*times\.startTime\s*\|\|\s*null/);
  assert.match(source, /end_time:\s*times\.endTime\s*\|\|\s*null/);
  assert.match(source, /has_time_override:\s*true/);
  assert.match(source, /p_start_time:/);
  assert.match(source, /p_end_time:/);
  assert.match(source, /key:\s*'workStart'[\s\S]*?type:\s*'calendar-datetime'/);
  assert.match(source, /key:\s*'workEnd'[\s\S]*?type:\s*'calendar-datetime'/);
  assert.match(source, /useCategoryTimeDefaults:\s*true/);
});

test('일정·카테고리 저장은 연속 요청을 막고 실패 시 입력 UI를 유지한다', () => {
  const sheetSource = read('assets/js/modules/calendar-entry-sheet.js');
  const studySource = read('assets/js/modules/study-calendar.js');
  const workSource = read('assets/js/modules/work-calendar.js');

  assert.match(
    sheetSource,
    /if \(isSubmitting \|\| submitButton\.disabled\) return;[\s\S]*?setSubmitting\(true\);[\s\S]*?await onSave\?\.\(values\);[\s\S]*?catch \{[\s\S]*?setSubmitting\(false\);/,
  );
  assert.match(sheetSource, /aria-busy/);
  assert.match(sheetSource, /aria-disabled/);
  assert.match(studySource, /if \(state\.isAddingTodo\) throw new Error/);
  assert.match(
    studySource,
    /state\.isAddingTodo = true;[\s\S]*?finally \{\s*state\.isAddingTodo = false;/,
  );
  assert.match(workSource, /if \(isAddingCategory\) return;/);
  assert.match(
    workSource,
    /isAddingCategory = true;[\s\S]*?finally \{\s*isAddingCategory = false;/,
  );
  assert.match(workSource, /if \(saveButton\.disabled\) return;/);
  assert.match(
    workSource,
    /const updatedCategory = await updateCategory\([\s\S]*?state\.categories = state\.categories\.map/,
  );
});

test('날짜 직접 선택만 렌더 후 일정 목록 스크롤을 예약한다', () => {
  const scrollSource = read('assets/js/modules/calendar-selection-scroll.js');

  assert.match(scrollSource, /requestAnimationFrame[\s\S]*requestAnimationFrame/);
  assert.match(scrollSource, /hasRenderedItems\?\.\(\)/);
  assert.match(scrollSource, /prefers-reduced-motion:\s*reduce/);
  assert.match(scrollSource, /scrollIntoView/);

  for (const calendarType of ['study', 'work', 'event']) {
    const source = read(`assets/js/modules/${calendarType}-calendar.js`);
    const selectDateBody = source.match(
      /function selectDate\(dateKey\) \{([\s\S]*?)\n  \}/,
    )?.[1] || '';
    assert.match(selectDateBody, /renderAll\(\)/);
    assert.match(selectDateBody, /scheduleCalendarSelectionScroll/);
  }
});

test('시간 선택기는 닫기 전에 포커스를 해제하고 iOS 자동 확대를 피한다', () => {
  const timeSource = read('assets/js/modules/calendar-time.js');
  const sheetSource = read('assets/js/modules/calendar-entry-sheet.js');
  const css = read('assets/css/components/calendar-entry-sheet.css');

  assert.match(timeSource, /popover\.contains\(activeElement\)[\s\S]*activeElement\.blur\(\)/);
  assert.match(timeSource, /activeCalendarTimePicker\?\.close/);
  assert.match(sheetSource, /closeActiveCalendarTimePicker\(\{ restoreFocus: false \}\)/);
  assert.match(sheetSource, /blurFocusedControl\(dialog\)/);
  assert.match(
    css,
    /@media \(max-width:\s*767px\)[\s\S]*?\.calendar-entry-sheet__datetime > input\[readonly\] \{[^}]*font-size:\s*var\(--text-body\)/s,
  );
  assert.match(
    css,
    /\.calendar-time-picker__select \{[^}]*font-size:\s*16px/s,
  );
});

test('운영 마이그레이션은 기존 데이터를 채우지 않고 검증된 nullable 시간 필드를 추가한다', () => {
  const sql = read('supabase-SQLEditor/20260730-study-work-calendar-times.sql');
  assert.match(sql, /todo_time time without time zone/);
  assert.match(sql, /todo_end_date date/);
  assert.match(sql, /start_time time without time zone/);
  assert.match(sql, /ends_next_day boolean not null default false/);
  assert.match(sql, /todo_end_time >= todo_time/);
  assert.match(sql, /ends_next_day = \(end_time < start_time\)/);
  assert.doesNotMatch(sql, /update\s+public\.study_calendar_todos\s+set\s+todo_time\s*=\s*['"]?00:00/i);
  assert.doesNotMatch(sql, /update\s+public\.work_calendar_categories\s+set\s+start_time/i);
  assert.match(sql, /from public, anon/);
  assert.match(sql, /to authenticated/);
});

test('업무 일정별 시간 마이그레이션은 기존 행을 수정하지 않고 재정의 우선순위를 저장한다', () => {
  const sql = read('supabase-SQLEditor/20260801-work-calendar-todo-times.sql');
  assert.match(sql, /start_time time without time zone/);
  assert.match(sql, /end_time time without time zone/);
  assert.match(sql, /has_time_override boolean not null default false/);
  assert.match(sql, /has_time_override = false[\s\S]*start_time is null/);
  assert.match(sql, /has_time_override = true/);
  assert.match(sql, /p_start_time time without time zone/);
  assert.match(sql, /p_end_time time without time zone/);
  assert.match(sql, /has_time_override = true/);
  assert.doesNotMatch(sql, /update\s+public\.work_calendar_todos\s+set\s+start_time\s*=\s*[^p]/i);
  assert.match(sql, /from public, anon/);
  assert.match(sql, /to authenticated/);
});

test('이벤트 시작시간 마이그레이션은 기존 함수의 00:00 강제값만 제거한다', () => {
  const sql = read(
    'supabase-SQLEditor/20260731-event-calendar-optional-start-time.sql',
  );
  assert.match(sql, /pg_get_functiondef/);
  assert.match(sql, /create_event_calendar_todo_range/);
  assert.match(sql, /save_event_calendar_todo_range/);
  assert.match(sql, /DEFAULT NULL::time without time zone/);
  assert.match(sql, /'p_event_time'/);
  assert.doesNotMatch(sql, /update\s+public\.event_calendar_todos/i);
});

test('그룹 백업·붙여넣기는 자기개발 및 업무 카테고리 시간 정보를 포함한다', () => {
  const sql = read('supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql');
  for (const key of [
    'todoTime',
    'todoEndDate',
    'todoEndTime',
    'categoryStartTime',
    'categoryEndTime',
    'categoryEndsNextDay',
  ]) {
    assert.match(sql, new RegExp(key));
  }
  assert.match(sql, /ends_next_day/);
  assert.doesNotMatch(sql, /coalesce\([^\n]*(todoTime|categoryStartTime)[^\n]*'00:00'/i);
});

test('루트·www·Android·iOS 시간 기능 자산은 바이트 단위로 일치한다', () => {
  const syncedFiles = [
    'calendar-work.html',
    'assets/css/components/calendar-entry-sheet.css',
    'assets/css/components/calendar-loading.css',
    'assets/css/main/calendar-event-main.css',
    'assets/css/main/calendar-work-main.css',
    'assets/js/modules/calendar-time.js',
    'assets/js/modules/calendar-selection-scroll.js',
    'assets/js/modules/calendar-entry-sheet.js',
    'assets/js/modules/event-calendar.js',
    'assets/js/modules/study-calendar.js',
    'assets/js/modules/work-calendar.js',
    'assets/js/modules/calendar-groups.js',
    'assets/js/modules/calendar-shared-personal-readonly.js',
    'assets/js/modules/calendar-widget-data.js',
  ];

  for (const file of syncedFiles) {
    const expected = read(file);
    for (const prefix of ['www/', 'android/app/src/main/assets/public/', 'ios/App/App/public/']) {
      assert.equal(read(`${prefix}${file}`), expected, `${prefix}${file} is out of sync`);
    }
  }
});
