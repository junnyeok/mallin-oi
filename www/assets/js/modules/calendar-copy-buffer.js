export const CALENDAR_COPY_BUFFER_KEY = 'mallin_calendar_copy_buffer';
export const CALENDAR_COPY_BUFFER_VERSION = 3;
export const CALENDAR_COPY_BUFFER_TTL_MS = 24 * 60 * 60 * 1000;

const CALENDAR_TYPES = new Set(['study', 'work', 'event']);
const COPY_MODES = new Set(['all', 'range']);
const SUPPORTED_BUFFER_VERSIONS = new Set([2, CALENDAR_COPY_BUFFER_VERSION]);
const CATEGORY_RESOLUTION_ACTIONS = new Set(['overwrite', 'keep']);
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

function normalizeOptionalTime(value) {
  const time = String(value || '').trim();
  if (!time) return null;
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]{1,6})?)?$/.test(time)) {
    throw new TypeError('category time is invalid');
  }
  return time;
}

function normalizeCategoryRow(input = {}) {
  const sourceCategoryKey = String(
    input.sourceCategoryKey || input.source_category_key || '',
  ).trim();
  const name = String(input.name || input.category_name || '').trim();
  const color = String(input.color || '').trim();
  const sourceSortOrder = Number(
    input.sourceSortOrder ?? input.source_sort_order ?? 100,
  );

  if (!sourceCategoryKey) throw new TypeError('source category key is required');
  if (!name || name.length > 20) throw new TypeError('category name is invalid');
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) throw new TypeError('category color is invalid');
  if (!Number.isInteger(sourceSortOrder)) {
    throw new TypeError('category sort order is invalid');
  }

  const targetCategoryId = String(
    input.targetCategoryId || input.target_category_id || '',
  ).trim() || null;
  const targetColor = String(
    input.targetColor || input.target_color || '',
  ).trim() || null;

  if (targetColor && !/^#[0-9A-Fa-f]{6}$/.test(targetColor)) {
    throw new TypeError('target category color is invalid');
  }

  return {
    sourceCategoryKey,
    sourceCategoryId: String(
      input.sourceCategoryId || input.source_category_id || '',
    ).trim() || null,
    name,
    color: color.toLowerCase(),
    startTime: normalizeOptionalTime(input.startTime ?? input.start_time),
    endTime: normalizeOptionalTime(input.endTime ?? input.end_time),
    endsNextDay: Boolean(input.endsNextDay ?? input.ends_next_day),
    sourceIsDefault: Boolean(
      input.sourceIsDefault ?? input.source_is_default,
    ),
    sourceSortOrder,
    targetCategoryId,
    targetColor: targetColor?.toLowerCase() || null,
    targetStartTime: normalizeOptionalTime(
      input.targetStartTime ?? input.target_start_time,
    ),
    targetEndTime: normalizeOptionalTime(
      input.targetEndTime ?? input.target_end_time,
    ),
    targetEndsNextDay: Boolean(
      input.targetEndsNextDay ?? input.target_ends_next_day,
    ),
    hasNameConflict: Boolean(
      input.hasNameConflict ?? input.has_name_conflict ?? targetCategoryId,
    ),
  };
}

export function normalizeCalendarPasteCategories(rows) {
  if (!Array.isArray(rows)) throw new TypeError('calendar categories are invalid');

  const seen = new Set();
  return rows.map(normalizeCategoryRow).filter((category) => {
    if (seen.has(category.sourceCategoryKey)) return false;
    seen.add(category.sourceCategoryKey);
    return true;
  });
}

export function getCalendarCategoryConflicts(categories = []) {
  return normalizeCalendarPasteCategories(categories)
    .filter((category) => category.hasNameConflict && category.targetCategoryId);
}

export function normalizeCalendarCategoryResolutions(resolutions = []) {
  if (!Array.isArray(resolutions)) {
    throw new TypeError('category resolutions are invalid');
  }

  const seen = new Set();
  return resolutions.map((resolution) => {
    const sourceCategoryKey = String(
      resolution?.sourceCategoryKey || resolution?.source_category_key || '',
    ).trim();
    const action = String(resolution?.action || '').trim();
    if (!sourceCategoryKey || seen.has(sourceCategoryKey)) {
      throw new TypeError('category resolution key is invalid');
    }
    if (!CATEGORY_RESOLUTION_ACTIONS.has(action)) {
      throw new TypeError('category resolution action is invalid');
    }
    seen.add(sourceCategoryKey);
    return { sourceCategoryKey, action };
  });
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

  const inputVersion = Number(input.version || CALENDAR_COPY_BUFFER_VERSION);
  if (!SUPPORTED_BUFFER_VERSIONS.has(inputVersion)) {
    throw new TypeError('calendar copy buffer version is invalid');
  }

  const buffer = {
    version: generateDefaults ? CALENDAR_COPY_BUFFER_VERSION : inputVersion,
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

  if (buffer.version >= 3) {
    buffer.categories = normalizeCalendarPasteCategories(input.categories || [])
      .map(({ targetCategoryId, targetColor, targetStartTime, targetEndTime,
        targetEndsNextDay, hasNameConflict, ...category }) => category);
  }

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
  if (!SUPPORTED_BUFFER_VERSIONS.has(parsed.version)) {
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

export function buildCalendarCategoryPreviewRpcArgs(buffer, calendarType) {
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
  };
}

export function buildCalendarPasteRpcArgs(
  buffer,
  calendarType,
  categoryResolutions = [],
) {
  const normalized = normalizeCopyBuffer(buffer);
  return {
    ...buildCalendarCategoryPreviewRpcArgs(normalized, calendarType),
    p_operation_id: normalized.operationId,
    p_category_resolutions: normalizeCalendarCategoryResolutions(
      categoryResolutions,
    ),
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
  const details = String(error?.details || '').toLowerCase();

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

  if (
    code === '23505' &&
    `${message} ${details}`.includes('work_calendar_todos_user_date_uidx')
  ) {
    return {
      kind: 'duplicate-schedule',
      message: '같은 날짜에 이미 업무 일정이 있어 붙여넣지 못했어. 기존 일정을 확인해줘.',
    };
  }

  if (code === '23505') {
    return {
      kind: 'conflict',
      message: '카테고리 상태가 바뀌어 병합하지 못했어. 붙여넣기를 다시 시도해줘.',
    };
  }

  if (message.includes('카테고리 충돌 선택')) {
    return {
      kind: 'category-resolution',
      message: '카테고리 상태가 바뀌었어. 덮어쓰기 여부를 다시 선택해줘.',
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
