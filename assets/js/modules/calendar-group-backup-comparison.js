const BACKUP_BOOLEAN_PAYLOAD_KEYS = new Set([
  'isDone',
  'is_shared_copy',
  'categoryEndsNextDay',
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

  return Object.keys(payload)
    .filter((key) => !comparableKeys || comparableKeys.has(key))
    .sort()
    .reduce((result, key) => {
      const value = payload[key];
      if (BACKUP_BOOLEAN_PAYLOAD_KEYS.has(key)) {
        result[key] =
          value === true || value === 'true' || value === 1 || value === '1';
        return result;
      }

      result[key] = value ?? null;
      return result;
    }, {});
}
