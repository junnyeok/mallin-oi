import { supabase } from './supabase-client.js';

const TABLE = 'calendar_common_group_events';

export const CALENDAR_MODES = Object.freeze({
  PERSONAL: 'personal',
  SHARED_GROUP: 'shared-group',
  COMMON_GROUP: 'common-group',
});

export function isCommonCalendarGroup(group) {
  const value = group?.is_common_calendar;
  return value === true || value === 1 || value === 'true' || value === '1';
}

export function getCalendarMode(group) {
  if (!group?.id) return CALENDAR_MODES.PERSONAL;
  return isCommonCalendarGroup(group)
    ? CALENDAR_MODES.COMMON_GROUP
    : CALENDAR_MODES.SHARED_GROUP;
}

export function isCommonGroupMode(groupState) {
  return getCalendarMode(groupState?.selectedGroup) === CALENDAR_MODES.COMMON_GROUP;
}

export function canEditCommonGroup(groupState) {
  return isCommonGroupMode(groupState) && groupState.selectedGroup?.role === 'owner';
}

export async function fetchCommonGroupEvents(groupId, calendarType) {
  if (!groupId || !calendarType) return [];
  const { data, error } = await supabase.rpc('get_common_group_calendar_events', {
    p_group_id: groupId,
    p_calendar_type: calendarType,
  });
  if (error) throw error;
  return data || [];
}

export async function createCommonGroupEvent({ groupId, calendarType, dateKey, scheduleType, title, memo = '', color = null, payload = {} }) {
  const { data, error } = await supabase.from(TABLE).insert({
    group_id: groupId,
    calendar_type: calendarType,
    date_key: dateKey,
    schedule_type: scheduleType || 'etc',
    title: String(title || '').trim(),
    memo: String(memo || ''),
    color,
    payload,
  }).select().single();
  if (error) throw error;
  return data;
}

export async function updateCommonGroupEvent(id, values) {
  const { data, error } = await supabase.from(TABLE).update({ ...values, is_deleted: false }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

export async function deleteCommonGroupEvent(id) {
  const { error } = await supabase.from(TABLE).update({ is_deleted: true }).eq('id', id);
  if (error) throw error;
}

export async function deleteCommonGroupEventsByDates(groupId, calendarType, dateKeys) {
  if (!groupId || !calendarType || !dateKeys?.length) return;
  const { error } = await supabase.from(TABLE).update({ is_deleted: true })
    .eq('group_id', groupId).eq('calendar_type', calendarType).in('date_key', dateKeys);
  if (error) throw error;
}

export function commonRowToTodo(row, calendarType) {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const category = {
    id: payload.categoryId || `common-${payload.categorySlug || row.schedule_type}`,
    name: payload.categoryName || row.title,
    slug: payload.categorySlug || row.schedule_type,
    color: payload.categoryColor || row.color,
  };
  return {
    id: row.id,
    userId: row.created_by,
    date: row.date_key,
    type: row.schedule_type,
    categoryId: category.id,
    text: row.title,
    memo: row.memo || '',
    done: Boolean(payload.done),
    time: payload.time || '',
    endTime: payload.endTime || '',
    eventTime: payload.time || '',
    eventEndTime: payload.endTime || '',
    category,
    [`${calendarType}_calendar_categories`]: category,
    isCommonGroupEvent: true,
  };
}

export function groupCommonRows(rows, calendarType) {
  return (rows || []).reduce((store, row) => {
    const todo = commonRowToTodo(row, calendarType);
    (store[todo.date] ||= []).push(todo);
    return store;
  }, {});
}

export function makeCommonCategoryPayload(category, extra = {}) {
  return {
    categoryId: category?.id || null,
    categoryName: String(category?.name || '기타').trim(),
    categorySlug: String(category?.slug || 'etc').trim(),
    categoryColor: category?.color || null,
    ...extra,
  };
}

export function setCommonGroupReadonlyUi(pageRoot, { active, canEdit }) {
  if (!pageRoot) return;
  pageRoot.classList.toggle('is-common-group-calendar', active);
  pageRoot.classList.toggle('is-common-group-readonly', active && !canEdit);
  pageRoot.querySelectorAll('form, [id$="CategoryToggle"], [id$="RepeatToggle"]').forEach((element) => {
    if (!active) {
      element.removeAttribute('aria-disabled');
      element.inert = false;
      return;
    }
    if (!canEdit) {
      element.setAttribute('aria-disabled', 'true');
      element.inert = true;
    } else {
      element.removeAttribute('aria-disabled');
      element.inert = false;
    }
  });
}

export async function commonGroupCalendarHasChanges(groupId, calendarType) {
  const { data, error } = await supabase.rpc('common_group_calendar_has_changes', {
    p_group_id: groupId,
    p_calendar_type: calendarType,
  });
  if (error) throw error;
  return Boolean(data);
}

export async function publishCommonGroupCalendar(groupId, calendarType) {
  const { data, error } = await supabase.rpc('publish_common_group_calendar', {
    p_group_id: groupId,
    p_calendar_type: calendarType,
  });
  if (error) throw error;
  return data?.[0] || { event_count: 0, backed_up_at: new Date().toISOString() };
}
