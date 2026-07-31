import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CALENDAR_COPY_BUFFER_TTL_MS,
  CALENDAR_COPY_BUFFER_VERSION,
  buildCalendarCategoryPreviewRpcArgs,
  buildCalendarPasteRpcArgs,
  classifyCalendarPasteError,
  createCalendarCopyBuffer,
  createSingleFlight,
  getCalendarCategoryConflicts,
  normalizeCalendarCategoryResolutions,
  normalizeCalendarPasteCategories,
  parseCalendarCopyBuffer,
  validateCalendarPasteResult,
} from '../assets/js/modules/calendar-copy-buffer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ids = {
  group: '11111111-1111-4111-8111-111111111111',
  source: '22222222-2222-4222-8222-222222222222',
  operation: '33333333-3333-4333-8333-333333333333',
};
const now = Date.parse('2026-07-30T03:00:00.000Z');
const categoryRows = [
  {
    source_category_key: '44444444-4444-4444-8444-444444444444',
    source_category_id: '44444444-4444-4444-8444-444444444444',
    category_name: '주간',
    color: '#AABBCC',
    source_sort_order: 10,
    target_category_id: '55555555-5555-4555-8555-555555555555',
    target_color: '#112233',
    has_name_conflict: true,
  },
  {
    source_category_key: '66666666-6666-4666-8666-666666666666',
    source_category_id: '66666666-6666-4666-8666-666666666666',
    category_name: '철야',
    color: '#334455',
    source_sort_order: 20,
    target_category_id: null,
    has_name_conflict: false,
  },
];

function makeBuffer(overrides = {}) {
  return createCalendarCopyBuffer({
    calendarType: 'study',
    groupId: ids.group,
    groupName: '테스트 그룹',
    sourceUserId: ids.source,
    sourceNickname: '테스트 사용자',
    backupCount: 2,
    mode: 'range',
    startDate: '2026-07-16',
    endDate: '2026-07-19',
    copiedAt: new Date(now).toISOString(),
    operationId: ids.operation,
    categories: categoryRows,
    ...overrides,
  });
}

test('그룹 캘린더 복사는 버전·개수·식별자를 포함한 유효한 버퍼를 만든다', () => {
  const buffer = makeBuffer();
  assert.equal(buffer.version, CALENDAR_COPY_BUFFER_VERSION);
  assert.equal(buffer.backupCount, 2);
  assert.equal(buffer.operationId, ids.operation);
  assert.equal(buffer.calendarType, 'study');
  assert.deepEqual(buffer.categories.map((category) => category.name), ['주간', '철야']);
  assert.equal(buffer.categories[0].targetCategoryId, undefined);
});

test('직렬화한 복사 버퍼는 페이지 이동 뒤 같은 형식으로 복원된다', () => {
  const serialized = JSON.stringify(makeBuffer());
  const parsed = parseCalendarCopyBuffer(serialized, { calendarType: 'study', now });
  assert.equal(parsed.reason, null);
  assert.deepEqual(parsed.buffer, JSON.parse(serialized));
});

test('복사 데이터가 없으면 붙여넣기 가능 상태가 되지 않는다', () => {
  assert.deepEqual(parseCalendarCopyBuffer(null, { calendarType: 'study', now }), {
    buffer: null,
    reason: 'missing',
  });
});

test('손상된 JSON과 지원하지 않는 버퍼를 거부하고 버전 2 복사본은 호환한다', () => {
  assert.equal(
    parseCalendarCopyBuffer('{broken', { calendarType: 'study', now }).reason,
    'corrupt',
  );
  assert.equal(
    parseCalendarCopyBuffer(JSON.stringify({ ...makeBuffer(), version: 1 }), {
      calendarType: 'study',
      now,
    }).reason,
    'unsupported',
  );
  const { categories, ...withoutCategories } = makeBuffer();
  const version2 = { ...withoutCategories, version: 2 };
  const parsedVersion2 = parseCalendarCopyBuffer(JSON.stringify(version2), {
    calendarType: 'study',
    now,
  });
  assert.equal(parsedVersion2.reason, null);
  assert.equal('categories' in parsedVersion2.buffer, false);
  const { operationId, ...missingOperationId } = makeBuffer();
  assert.equal(
    parseCalendarCopyBuffer(JSON.stringify(missingOperationId), {
      calendarType: 'study',
      now,
    }).reason,
    'corrupt',
  );
});

test('만료된 버퍼와 다른 캘린더 종류의 버퍼를 구분한다', () => {
  const expired = makeBuffer({
    copiedAt: new Date(now - CALENDAR_COPY_BUFFER_TTL_MS - 1).toISOString(),
  });
  assert.equal(
    parseCalendarCopyBuffer(JSON.stringify(expired), { calendarType: 'study', now })
      .reason,
    'expired',
  );
  assert.equal(
    parseCalendarCopyBuffer(JSON.stringify(makeBuffer()), {
      calendarType: 'work',
      now,
    }).reason,
    'calendar-mismatch',
  );
});

test('전체·날짜 범위와 세 캘린더 종류를 공용 형식으로 검증한다', () => {
  for (const calendarType of ['study', 'work', 'event']) {
    const all = makeBuffer({ calendarType, mode: 'all', startDate: undefined, endDate: undefined });
    assert.equal(all.mode, 'all');
    const range = makeBuffer({ calendarType });
    assert.equal(range.startDate, '2026-07-16');
    assert.equal(range.endDate, '2026-07-19');
  }
});

test('잘못된 날짜 범위와 UUID는 버퍼 생성 단계에서 거부한다', () => {
  assert.throws(() => makeBuffer({ startDate: '2026-02-30' }), /date/i);
  assert.throws(() => makeBuffer({ groupId: 'not-a-uuid' }), /groupId/i);
  assert.throws(() => makeBuffer({ startDate: '2026-07-20', endDate: '2026-07-19' }), /range/i);
});

test('붙여넣기 RPC 인자는 서버가 소유자를 auth.uid()로 정하도록 구성한다', () => {
  const resolutions = [
    { sourceCategoryKey: categoryRows[0].source_category_key, action: 'keep' },
  ];
  const args = buildCalendarPasteRpcArgs(makeBuffer(), 'study', resolutions);
  assert.deepEqual(args, {
    p_group_id: ids.group,
    p_calendar_type: 'study',
    p_source_user_id: ids.source,
    p_start_date: '2026-07-16',
    p_end_date: '2026-07-19',
    p_operation_id: ids.operation,
    p_category_resolutions: resolutions,
  });
  assert.equal('user_id' in args, false);
  assert.equal('owner_id' in args, false);
});

test('카테고리 미리보기 인자는 저장 소유자나 원본 설정을 클라이언트에서 보내지 않는다', () => {
  const args = buildCalendarCategoryPreviewRpcArgs(makeBuffer(), 'study');
  assert.deepEqual(args, {
    p_group_id: ids.group,
    p_calendar_type: 'study',
    p_source_user_id: ids.source,
    p_start_date: '2026-07-16',
    p_end_date: '2026-07-19',
  });
  assert.equal('categories' in args, false);
  assert.equal('user_id' in args, false);
});

test('같은 이름 충돌을 골라내고 카테고리별 서로 다른 결정을 만든다', () => {
  const categories = normalizeCalendarPasteCategories(categoryRows);
  assert.deepEqual(getCalendarCategoryConflicts(categories).map((item) => item.name), ['주간']);
  assert.deepEqual(normalizeCalendarCategoryResolutions([
    { sourceCategoryKey: 'weekly', action: 'overwrite' },
    { sourceCategoryKey: 'holiday', action: 'keep' },
  ]), [
    { sourceCategoryKey: 'weekly', action: 'overwrite' },
    { sourceCategoryKey: 'holiday', action: 'keep' },
  ]);
  assert.throws(() => normalizeCalendarCategoryResolutions([
    { sourceCategoryKey: 'weekly', action: 'overwrite' },
    { sourceCategoryKey: 'weekly', action: 'keep' },
  ]), /key/i);
});

test('그룹 연동 OFF 여부는 붙여넣기 RPC 인자나 버퍼 유효성에 포함되지 않는다', () => {
  const parsed = parseCalendarCopyBuffer(JSON.stringify(makeBuffer()), {
    calendarType: 'study',
    now,
  });
  assert.equal(parsed.reason, null);
  assert.equal('selectedGroup' in buildCalendarPasteRpcArgs(parsed.buffer, 'study'), false);
});

test('성공 응답의 저장 개수를 검증하고 실패·부분 성공 모양을 거부한다', () => {
  assert.equal(
    validateCalendarPasteResult([{ success: true, inserted_count: 2 }]).insertedCount,
    2,
  );
  assert.throws(
    () => validateCalendarPasteResult([{ success: false, inserted_count: 1 }]),
    /result/i,
  );
  assert.throws(() => validateCalendarPasteResult([]), /result/i);
});

test('단일 실행 잠금은 빠른 연속 붙여넣기를 한 번만 수행하고 상태를 복구한다', async () => {
  const flight = createSingleFlight();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let runs = 0;
  const first = flight.run(async () => {
    runs += 1;
    await gate;
    return 'ok';
  });
  const second = await flight.run(async () => {
    runs += 1;
    return 'duplicate';
  });
  assert.deepEqual(second, { started: false, value: undefined });
  assert.equal(flight.isActive(), true);
  release();
  assert.deepEqual(await first, { started: true, value: 'ok' });
  assert.equal(flight.isActive(), false);
  assert.equal(runs, 1);
});

test('인증·권한·네트워크·카테고리 충돌 오류를 사용자용 말투로 분류한다', () => {
  assert.equal(classifyCalendarPasteError({ status: 401 }).kind, 'auth');
  assert.equal(classifyCalendarPasteError({ code: '42501' }).kind, 'permission');
  assert.equal(classifyCalendarPasteError(new TypeError('Failed to fetch')).kind, 'network');
  assert.equal(classifyCalendarPasteError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "work_calendar_todos_user_date_uidx"',
  }).kind, 'duplicate-schedule');
  assert.equal(classifyCalendarPasteError({ code: '23505' }).kind, 'conflict');
  assert.equal(classifyCalendarPasteError({ code: 'PGRST202' }).kind, 'schema');
});

test('SQL은 새 카테고리를 새 ID로 만들고 원본 상대 순서대로 기존 목록 뒤에 추가한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.match(sql, /gen_random_uuid\(\) as new_category_id/i);
  assert.match(sql, /'custom-' \|\| m\.new_category_id::text/i);
  assert.match(sql, /max_sort_order \+ \(row_number\(\) over/i);
  assert.match(sql, /order by m\.source_sort_order, m\.category_name/i);
  assert.match(sql, /lower\(trim\(c\.name\)\) = lower\(trim\(s\.category_name\)\)/i);
});

test('SQL은 덮어쓰기와 기존 유지 결정을 분리하고 기존 카테고리 ID를 일정에 재사용한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.match(sql, /not in \('overwrite', 'keep'\)/i);
  assert.match(sql, /trim\(item->>'action'\) = 'overwrite'/i);
  assert.match(sql, /calendar_group_copy_category_targets/i);
  assert.match(sql, /category\.target_category_id/i);
  assert.doesNotMatch(sql, /set\s+id\s*=/i);
});

test('SQL은 덮어쓰기 시 색상·업무시간만 갱신하고 기존 개인 일정 연결을 건드리지 않는다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.match(sql, /update public\.work_calendar_categories c[\s\S]*color = m\.color,[\s\S]*start_time = m\.start_time,[\s\S]*end_time =/i);
  assert.doesNotMatch(sql, /update public\.(study|work|event)_calendar_todos/i);
  assert.doesNotMatch(sql, /delete from public\.(study|work|event)_calendar_todos/i);
});

test('SQL은 개인 일정 삭제 없이 현재 인증 사용자 소유의 새 행만 추가한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.doesNotMatch(sql, /delete from public\.(study|work|event)_calendar_todos/i);
  assert.match(sql, /insert into public\.study_calendar_todos/i);
  assert.match(sql, /insert into public\.work_calendar_todos/i);
  assert.match(sql, /insert into public\.event_calendar_todos/i);
  assert.match(sql, /v_user_id/i);
});

test('SQL은 소유자·그룹 공유 식별자를 새 일정 컬럼에 복제하지 않는다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  const todoInsertColumns = [...sql.matchAll(/insert into public\.(?:study|work|event)_calendar_todos\s*\(([^)]+)\)/gi)]
    .map((match) => match[1]);
  assert.equal(todoInsertColumns.length, 3);
  for (const columns of todoInsertColumns) {
    assert.doesNotMatch(columns, /\bid\b/i);
    assert.doesNotMatch(columns, /shared_|source_|group_id/i);
    assert.doesNotMatch(columns, /created_at|updated_at/i);
  }
});

test('SQL은 RPC 한 트랜잭션과 operation ID 잠금/영수증으로 재시도 중복을 막는다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.match(sql, /calendar_paste_operations/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /p_operation_id uuid/i);
  assert.match(sql, /calendar_group_copy_category_targets/i);
  assert.doesNotMatch(sql, /create temporary table/i);
  assert.match(sql, /카테고리 충돌 선택이 필요해요/i);
});

test('SQL은 붙여넣기 중 그룹 원본을 수정하지 않고 실패 시 RPC 전체를 롤백할 수 있게 구성한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  const pasteBody = sql.slice(
    sql.indexOf('create function public.paste_group_calendar_backup_to_my_calendar'),
    sql.indexOf('create or replace function public.backup_my_calendar_to_group'),
  );
  assert.doesNotMatch(pasteBody, /(update|delete from) public\.calendar_group_shared_(events|categories)/i);
  assert.match(pasteBody, /security definer[\s\S]*set search_path = public, pg_temp/i);
  assert.match(pasteBody, /raise exception '복사 일정의 카테고리 매핑/i);
});

test('SQL 백업은 전체 카테고리 설정과 원본 카테고리 ID를 별도 스냅샷으로 보존한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.match(sql, /create table if not exists public\.calendar_group_shared_categories/i);
  assert.match(sql, /source_category_id uuid not null/i);
  assert.match(sql, /source_sort_order integer/i);
  assert.match(sql, /'startTime', c\.start_time/i);
  assert.match(sql, /'categoryId', c\.id/i);
  assert.match(sql, /coalesce\(c\.is_shared_copy_category, false\) = false/i);
});

test('이벤트 종일·시간·종료시간과 기간 연결을 지원 범위에서 복제한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
  assert.match(sql, /event_time/i);
  assert.match(sql, /event_end_time/i);
  assert.match(sql, /event_range_id/i);
  assert.match(sql, /eventRangeId/i);
  assert.doesNotMatch(sql, /coalesce\([^\n]*eventTime[^\n]*'00:00'/i);
});

test('자기개발 일정 및 업무 카테고리 시간은 빈 값에 기본시간을 넣지 않고 복제한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260731-calendar-category-merge-paste.sql'),
    'utf8',
  );
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
  assert.doesNotMatch(sql, /coalesce\([^\n]*(todoTime|categoryStartTime)[^\n]*'00:00'/i);
});

test('루트·www·Android·iOS가 같은 버퍼 및 붙여넣기 구현을 사용한다', () => {
  const pairs = [
    ['assets/js/modules/calendar-copy-buffer.js', 'www/assets/js/modules/calendar-copy-buffer.js'],
    ['assets/js/modules/calendar-copy-buffer.js', 'android/app/src/main/assets/public/assets/js/modules/calendar-copy-buffer.js'],
    ['assets/js/modules/calendar-copy-buffer.js', 'ios/App/App/public/assets/js/modules/calendar-copy-buffer.js'],
    ['assets/js/modules/calendar-group-copy-paste.js', 'www/assets/js/modules/calendar-group-copy-paste.js'],
    ['assets/js/modules/calendar-group-copy-paste.js', 'android/app/src/main/assets/public/assets/js/modules/calendar-group-copy-paste.js'],
    ['assets/js/modules/calendar-group-copy-paste.js', 'ios/App/App/public/assets/js/modules/calendar-group-copy-paste.js'],
    ['assets/js/modules/calendar-groups.js', 'www/assets/js/modules/calendar-groups.js'],
    ['assets/js/modules/calendar-groups.js', 'android/app/src/main/assets/public/assets/js/modules/calendar-groups.js'],
    ['assets/js/modules/calendar-groups.js', 'ios/App/App/public/assets/js/modules/calendar-groups.js'],
  ];
  for (const [left, right] of pairs) {
    assert.equal(
      fs.readFileSync(path.join(rootDir, left), 'utf8'),
      fs.readFileSync(path.join(rootDir, right), 'utf8'),
      `${left} !== ${right}`,
    );
  }
});
