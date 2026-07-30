export const CALENDAR_COPY_BUFFER_KEY = 'mallin_calendar_copy_buffer';
export const CALENDAR_COPY_BUFFER_VERSION = 2;
export const CALENDAR_COPY_BUFFER_TTL_MS = 24 * 60 * 60 * 1000;

const CALENDAR_TYPES = new Set(['study', 'work', 'event']);
const COPY_MODES = new Set(['all', 'range']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

function isUuid(value) {
  return UUID_PATTERN.test(String(value || '').trim());
}

function isDateKey(value) {
  const dateKey = String(value || '').trim();
  if (!DATE_PATTERN.test(dateKey)) return false;

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function makeOperationId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function normalizeCopyBuffer(input = {}, { generateDefaults = false } = {}) {
  const calendarType = String(input.calendarType || '').trim();
  if (!CALENDAR_TYPES.has(calendarType)) {
    throw new TypeError('calendarType is invalid');
  }

  const mode = String(input.mode || '').trim();
  if (!COPY_MODES.has(mode)) throw new TypeError('copy mode is invalid');

  const groupId = String(input.groupId || '').trim();
  if (!isUuid(groupId)) throw new TypeError('groupId must be a UUID');

  const sourceUserId = String(input.sourceUserId || '').trim();
  if (!isUuid(sourceUserId)) throw new TypeError('sourceUserId must be a UUID');

  const operationId = String(
    input.operationId || (generateDefaults ? makeOperationId() : ''),
  ).trim();
  if (!isUuid(operationId)) throw new TypeError('operationId must be a UUID');

  const sourceNickname = String(input.sourceNickname || '').trim();
  if (!sourceNickname) throw new TypeError('sourceNickname is required');

  const backupCount = Number(input.backupCount ?? 0);
  if (!Number.isInteger(backupCount) || backupCount < 0) {
    throw new TypeError('backupCount must be a non-negative integer');
  }

  const copiedAt = String(
    input.copiedAt || (generateDefaults ? new Date().toISOString() : ''),
  ).trim();
  if (!Number.isFinite(Date.parse(copiedAt))) throw new TypeError('copiedAt is invalid');

  const buffer = {
    version: CALENDAR_COPY_BUFFER_VERSION,
    mode,
    calendarType,
    groupId,
    groupName: String(input.groupName || '').trim(),
    sourceUserId,
    sourceNickname,
    backupCount,
    operationId,
    copiedAt,
  };

  if (mode === 'range') {
    const startDate = String(input.startDate || '').trim();
    const endDate = String(input.endDate || '').trim();
    if (!isDateKey(startDate) || !isDateKey(endDate)) {
      throw new TypeError('copy date is invalid');
    }
    if (startDate > endDate) throw new TypeError('copy date range is invalid');
    buffer.startDate = startDate;
    buffer.endDate = endDate;
  }

  return buffer;
}

export function createCalendarCopyBuffer(input) {
  return normalizeCopyBuffer(input, { generateDefaults: true });
}

export function parseCalendarCopyBuffer(
  serialized,
  { calendarType = '', now = Date.now() } = {},
) {
  if (!serialized) return { buffer: null, reason: 'missing' };

  let parsed;
  try {
    parsed = typeof serialized === 'string' ? JSON.parse(serialized) : serialized;
  } catch {
    return { buffer: null, reason: 'corrupt' };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { buffer: null, reason: 'corrupt' };
  }
  if (parsed.version !== CALENDAR_COPY_BUFFER_VERSION) {
    return { buffer: null, reason: 'unsupported' };
  }

  let buffer;
  try {
    buffer = normalizeCopyBuffer(parsed);
  } catch {
    return { buffer: null, reason: 'corrupt' };
  }

  const copiedAt = Date.parse(buffer.copiedAt);
  if (
    copiedAt > now + FUTURE_CLOCK_TOLERANCE_MS ||
    now - copiedAt > CALENDAR_COPY_BUFFER_TTL_MS
  ) {
    return { buffer: null, reason: 'expired' };
  }

  if (calendarType && buffer.calendarType !== calendarType) {
    return { buffer: null, reason: 'calendar-mismatch' };
  }

  return { buffer, reason: null };
}

export function buildCalendarPasteRpcArgs(buffer, calendarType) {
  const normalized = normalizeCopyBuffer(buffer);
  if (normalized.calendarType !== calendarType) {
    throw new TypeError('calendarType does not match the copy buffer');
  }

  const isRange = normalized.mode === 'range';
  return {
    p_group_id: normalized.groupId,
    p_calendar_type: normalized.calendarType,
    p_source_user_id: normalized.sourceUserId,
    p_start_date: isRange ? normalized.startDate : null,
    p_end_date: isRange ? normalized.endDate : null,
    p_operation_id: normalized.operationId,
  };
}

export function validateCalendarPasteResult(data) {
  const row = Array.isArray(data) && data.length === 1 ? data[0] : null;
  const insertedCount = Number(row?.inserted_count);
  if (
    row?.success !== true ||
    !Number.isInteger(insertedCount) ||
    insertedCount < 0
  ) {
    const error = new Error('calendar paste result is invalid');
    error.code = 'INVALID_PASTE_RESULT';
    throw error;
  }

  return {
    insertedCount,
    message: String(row.message || ''),
  };
}

export function classifyCalendarPasteError(error = {}) {
  const code = String(error?.code || '').toUpperCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const message = String(error?.message || '').toLowerCase();

  if (
    status === 401 ||
    code === 'PGRST301' ||
    message.includes('jwt') ||
    message.includes('로그인')
  ) {
    return {
      kind: 'auth',
      message: '로그인이 만료됐어. 다시 로그인한 뒤 시도해줘.',
    };
  }

  if (
    status === 403 ||
    code === '42501' ||
    message.includes('권한') ||
    message.includes('참여자') ||
    message.includes('그룹원')
  ) {
    return {
      kind: 'permission',
      message: '이 그룹 캘린더를 복사할 권한이 없어.',
    };
  }

  if (
    error instanceof TypeError ||
    message.includes('fetch') ||
    message.includes('network')
  ) {
    return {
      kind: 'network',
      message: '네트워크 연결을 확인한 뒤 다시 시도해줘.',
    };
  }

  if (code === '23505') {
    return {
      kind: 'conflict',
      message: '같은 이름의 카테고리가 겹쳐서 붙여넣지 못했어. 다시 복사해줘.',
    };
  }

  if (code === 'PGRST202' || code === '42883') {
    return {
      kind: 'schema',
      message: '캘린더 붙여넣기 업데이트가 아직 적용되지 않았어.',
    };
  }

  if (message.includes('복사할') || message.includes('날짜 범위')) {
    return {
      kind: 'source',
      message: '복사할 일정이 없거나 백업이 오래됐어. 그룹 캘린더에서 다시 복사해줘.',
    };
  }

  return {
    kind: 'unknown',
    message: '캘린더를 붙여넣지 못했어. 잠시 후 다시 시도해줘.',
  };
}

export function createSingleFlight() {
  let active = false;

  return {
    isActive() {
      return active;
    },
    async run(task) {
      if (active) return { started: false, value: undefined };
      active = true;
      try {
        return { started: true, value: await task() };
      } finally {
        active = false;
      }
    },
  };
}
