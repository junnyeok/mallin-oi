const BACKUP_BOOLEAN_PAYLOAD_KEYS = new Set([
  'isDone',
  'is_shared_copy',
  'categoryEndsNextDay',
  'hasTimeOverride',
  'endsNextDay',
]);

const BACKUP_COMPARABLE_PAYLOAD_KEYS = {
  study: new Set([
    'isDone',
    'categoryName',
    'todoTime',
    'todoEndDate',
    'todoEndTime',
  ]),
  work: new Set([
    'isDone',
    'workText',
    'categoryName',
    'categoryStartTime',
    'categoryEndTime',
    'categoryEndsNextDay',
    'startTime',
    'endTime',
    'endsNextDay',
    'hasTimeOverride',
  ]),
  event: new Set([
    'isDone',
    'eventTime',
    'eventEndTime',
    'eventRangeId',
    'categoryName',
    'shared_group_id',
    'shared_origin_todo_id',
    'shared_origin_user_id',
    'shared_created_by',
    'is_shared_copy',
  ]),
};

export function normalizeBackupPayload(payload = {}, calendarType = '') {
  const comparableKeys = BACKUP_COMPARABLE_PAYLOAD_KEYS[calendarType];
  const hasTimeOverride = payload.hasTimeOverride === true ||
    payload.hasTimeOverride === 'true' || payload.hasTimeOverride === 1 ||
    payload.hasTimeOverride === '1';
  // Older work snapshots have no per-entry override fields. They represent the
  // category's default time, exactly like a source entry with override disabled.
  const values = calendarType === 'work' ? {
    ...payload,
    hasTimeOverride,
    startTime: hasTimeOverride ? payload.startTime || null : null,
    endTime: hasTimeOverride ? payload.endTime || null : null,
    endsNextDay: hasTimeOverride ? payload.endsNextDay ?? false : false,
  } : payload;

  return Object.keys(values)
    .filter((key) => !comparableKeys || comparableKeys.has(key))
    .sort()
    .reduce((result, key) => {
      const value = values[key];
      if (BACKUP_BOOLEAN_PAYLOAD_KEYS.has(key)) {
        result[key] =
          value === true || value === 'true' || value === 1 || value === '1';
        return result;
      }

      result[key] = value ?? null;
      return result;
    }, {});
}
