import { normalizeSharedPersonalDetail } from './calendar-shared-personal-readonly.js';

function getPayloadValue(event, ...keys) {
  const payload = event?.payload;
  if (!payload || typeof payload !== 'object') return '';

  for (const key of keys) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return '';
}

function getEventValue(event, ...keys) {
  for (const key of keys) {
    const value = event?.[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }

  return getPayloadValue(event, ...keys);
}

function normalizeSharedBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function isExplicitSharedEvent(event, selectedGroupId) {
  const sharedGroupId = String(
    getEventValue(event, 'shared_group_id', 'sharedGroupId') || '',
  ).trim();
  const originTodoId = String(
    getEventValue(event, 'shared_origin_todo_id', 'sharedOriginTodoId') || '',
  ).trim();
  const originUserId = String(
    getEventValue(event, 'shared_origin_user_id', 'sharedOriginUserId') || '',
  ).trim();
  const createdBy = String(
    getEventValue(event, 'shared_created_by', 'sharedCreatedBy') || '',
  ).trim();
  const isSharedCopy = normalizeSharedBoolean(
    getEventValue(event, 'is_shared_copy', 'isSharedCopy'),
  );

  if (selectedGroupId && sharedGroupId === selectedGroupId) return true;
  return Boolean(originTodoId || originUserId || createdBy || isSharedCopy);
}

export function collectSharedPersonalReadonlyDetails({
  groupState,
  dateKey,
  calendarType,
  currentUserId,
}) {
  const selectedGroupId = String(groupState?.selectedGroup?.id || '').trim();
  const safeCurrentUserId = String(currentUserId || '').trim();

  if (!selectedGroupId || !dateKey || !safeCurrentUserId) return [];

  const seen = new Set();
  const readonlyDetails = [];

  (groupState.eventsByDate?.[dateKey] || []).forEach((member) => {
    const memberUserId = String(member?.userId || '').trim();
    if (!memberUserId || memberUserId === safeCurrentUserId) return;

    (member.events || []).forEach((event) => {
      if (String(event?.event_date || '').slice(0, 10) !== dateKey) return;
      if (isExplicitSharedEvent(event, selectedGroupId)) return;

      const normalizedEvent = {
        ...event,
        user_id: event?.user_id || memberUserId,
      };
      const detail = normalizeSharedPersonalDetail(normalizedEvent, {
        calendarType,
        currentUserId: safeCurrentUserId,
        ownerName: member.name,
        groupId: selectedGroupId,
      });

      if (!detail?.isOtherUserPersonal) return;

      const dedupeKey = [
        detail.ownerUserId,
        detail.sourceEventId || detail.id,
        detail.date,
      ].join('|');

      if (seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      readonlyDetails.push(detail);
    });
  });

  return readonlyDetails;
}
