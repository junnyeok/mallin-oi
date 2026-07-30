import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CALENDAR_COPY_BUFFER_TTL_MS,
  CALENDAR_COPY_BUFFER_VERSION,
  buildCalendarPasteRpcArgs,
  classifyCalendarPasteError,
  createCalendarCopyBuffer,
  createSingleFlight,
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
    ...overrides,
  });
}

test('그룹 캘린더 복사는 버전·개수·식별자를 포함한 유효한 버퍼를 만든다', () => {
  const buffer = makeBuffer();
  assert.equal(buffer.version, CALENDAR_COPY_BUFFER_VERSION);
  assert.equal(buffer.backupCount, 2);
  assert.equal(buffer.operationId, ids.operation);
  assert.equal(buffer.calendarType, 'study');
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

test('손상된 JSON과 이전 버전 버퍼를 안전하게 거부한다', () => {
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
  const args = buildCalendarPasteRpcArgs(makeBuffer(), 'study');
  assert.deepEqual(args, {
    p_group_id: ids.group,
    p_calendar_type: 'study',
    p_source_user_id: ids.source,
    p_start_date: '2026-07-16',
    p_end_date: '2026-07-19',
    p_operation_id: ids.operation,
  });
  assert.equal('user_id' in args, false);
  assert.equal('owner_id' in args, false);
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
  assert.equal(classifyCalendarPasteError({ code: '23505' }).kind, 'conflict');
  assert.equal(classifyCalendarPasteError({ code: 'PGRST202' }).kind, 'schema');
});

test('SQL은 카테고리 이름/slug 충돌을 모두 무시하고 기존 카테고리를 재사용한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql'),
    'utf8',
  );
  assert.match(sql, /on conflict do nothing/i);
  assert.match(sql, /lower\(trim\(c\.name\)\)/i);
  assert.match(sql, /nullif\(trim\(e\.payload->>'categoryName'\), ''\)/i);
  assert.doesNotMatch(sql, /on conflict \(user_id, slug\) do nothing/i);
});

test('SQL은 개인 일정 삭제 없이 현재 인증 사용자 소유의 새 행만 추가한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql'),
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
    path.join(rootDir, 'supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql'),
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
    path.join(rootDir, 'supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql'),
    'utf8',
  );
  assert.match(sql, /calendar_paste_operations/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /p_operation_id uuid/i);
});

test('이벤트 종일·시간·종료시간과 기간 연결을 지원 범위에서 복제한다', () => {
  const sql = fs.readFileSync(
    path.join(rootDir, 'supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql'),
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
    path.join(rootDir, 'supabase-SQLEditor/20260730-calendar-copy-paste-fix.sql'),
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
