import { refreshCalendarWidgets, scheduleCalendarWidgetRefresh } from './calendar-native-widgets.js';
import { enableCalendarListReorder, resetCalendarListReorder } from './calendar-category-order.js';
import { normalizeCategoryColor } from './calendar-category-color.js';
// assets/js/modules/calendar-groups.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';
import { isCalendarAppMode } from './app-calendar-mode.js';
import { normalizeBackupPayload } from './calendar-group-backup-comparison.js';
import { orderWidgetMembers, readWidgetMemberOrder, saveWidgetMemberOrder } from './calendar-widget-member-order.js';
import { appendKoreanHolidayBadge } from './calendar-holidays.js';
import { openCalendarManagePopup } from './service-menu.js';

let calendarCopyPasteModulePromise = null;

function loadCalendarCopyPasteModule() {
  if (!calendarCopyPasteModulePromise) {
    const moduleUrl = new URL('./calendar-group-copy-paste.js', import.meta.url);
    const siteVersion = String(window.__SITE_VERSION__ || 'dev').trim();
    moduleUrl.searchParams.set('v', siteVersion);
    calendarCopyPasteModulePromise = import(moduleUrl.href);
  }

  return calendarCopyPasteModulePromise;
}

const CALENDAR_MODES = Object.freeze({ PERSONAL: 'personal', SHARED_GROUP: 'shared-group' });
const getCalendarMode = (group) => group?.id ? CALENDAR_MODES.SHARED_GROUP : CALENDAR_MODES.PERSONAL;

const SELECTED_GROUP_KEY = 'mallin:calendar:selected-group';
let calendarManagePopupOpening = false;
const CALENDAR_LABELS = {
  study: '자기개발',
  work: '업무',
  event: '이벤트',
};

const GROUP_COLORS = [
  '#f54260',
  '#5fcbd6',
  '#3d63dd',
  '#f5c542',
  '#78d86f',
  '#b58cff',
  '#ff9a5c',
  '#eeeeee',
];
const GROUP_DESCRIPTION_MAX_LENGTH = 100;
const BACKUP_STATUS = {
  IDLE: 'idle',
  PENDING: 'pending',
  CHECKING: 'checking',
  RUNNING: 'running',
};
const BACKUP_SOURCE_CONFIG = {
  study: {
    table: 'study_calendar_todos',
    categoryRelation: 'study_calendar_categories',
    categoryTable: 'study_calendar_categories',
    categorySelect: 'id, name, slug, color, is_default, sort_order, is_shared_copy_category',
    select: `
      id, todo_date, todo_type, todo_text, memo, todo_time, todo_end_date, todo_end_time, is_done,
      study_calendar_categories (name, slug, color)
    `,
  },
  work: {
    table: 'work_calendar_todos',
    categoryRelation: 'work_calendar_categories',
    categoryTable: 'work_calendar_categories',
    categorySelect: 'id, name, slug, color, start_time, end_time, ends_next_day, is_default, sort_order, is_shared_copy_category',
    select: `
      id, work_date, work_type, work_text, memo, is_done,
      start_time, end_time, ends_next_day, has_time_override,
      work_calendar_categories (name, slug, color, start_time, end_time, ends_next_day)
    `,
  },
  event: {
    table: 'event_calendar_todos',
    categoryRelation: 'event_calendar_categories',
    categoryTable: 'event_calendar_categories',
    categorySelect: 'id, name, slug, color, is_default, sort_order, is_shared_copy_category',
    select: `
      id, event_date, event_type, event_text, memo, event_time, event_end_time, event_range_id, is_done,
      shared_group_id, shared_origin_todo_id, shared_origin_user_id,
      shared_created_by, is_shared_copy,
      event_calendar_categories (name, slug, color)
    `,
  },
};

function normalizeColor(color, fallback = '#f54260') {
  return normalizeCategoryColor(color, fallback);
}

function getTextColor(bgColor) {
  if (normalizeColor(bgColor) === 'transparent') return 'var(--color-text)';
  const color = normalizeColor(bgColor).replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111111' : '#ffffff';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function normalizeGroupDescription(value = '') {
  return String(value || '').trim().slice(0, GROUP_DESCRIPTION_MAX_LENGTH);
}

function toDateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function getMonthRange(viewDate) {
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1);
  const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 2, 0);
  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

function getSelectedGroupId() {
  try {
    return localStorage.getItem(SELECTED_GROUP_KEY) || '';
  } catch {
    return '';
  }
}

function setSelectedGroupId(groupId) {
  try {
    if (groupId) {
      localStorage.setItem(SELECTED_GROUP_KEY, groupId);
    } else {
      localStorage.removeItem(SELECTED_GROUP_KEY);
    }
  } catch {
    // localStorage가 막힌 환경이면 선택 상태만 메모리에 둠
  }
}

function isAllowed(group, calendarType) {
  return Boolean(group?.[`allow_${calendarType}`]);
}

function getAllowedGroups(groups, calendarType) {
  return (Array.isArray(groups) ? groups : []).filter((group) =>
    isAllowed(group, calendarType),
  );
}

function makeAppHref(path, params = {}) {
  const query = new URLSearchParams(isCalendarAppMode() ? { app: 'calendar', ...params } : params).toString();
  return query ? `${path}?${query}` : path;
}

function getCalendarSelectHref() {
  return isCalendarAppMode()
    ? './app-calendar.html?app=calendar'
    : './calendar-study.html';
}

function openCalendarManagePopupFromGroupPage() {
  const menu = document.getElementById('serviceMenu');
  if (calendarManagePopupOpening) return true;
  if (menu?.classList.contains('is-calendar-manage-open')) return true;

  calendarManagePopupOpening = true;

  if (openCalendarManagePopup() === true) {
    requestAnimationFrame(() => {
      calendarManagePopupOpening = false;
    });
    return true;
  }

  const panel = document.getElementById('calendarManagePanel');
  const backdrop = document.getElementById('calendarManageBackdrop');
  if (!menu || !panel || !backdrop) {
    calendarManagePopupOpening = false;
    return false;
  }

  panel.hidden = false;
  backdrop.hidden = false;

  requestAnimationFrame(() => {
    menu.classList.add('is-calendar-manage-open');
    document.body.classList.add('calendar-manage-open');
    document
      .getElementById('calendarManageBtn')
      ?.setAttribute('aria-expanded', 'true');
    document.getElementById('calendarManageCloseBtn')?.focus();
    calendarManagePopupOpening = false;
  });

  return true;
}

function normalizeComparable(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function getEventValue(event, ...keys) {
  for (const key of keys) {
    const directValue = event?.[key];
    if (directValue !== undefined && directValue !== null && directValue !== '') {
      return directValue;
    }

    const payloadValue = getEventPayloadValue(event, key);
    if (payloadValue !== undefined && payloadValue !== null && payloadValue !== '') {
      return payloadValue;
    }
  }

  return '';
}

function getEventTimeSortValue(event) {
  const value = String(
    getEventValue(
      event,
      'event_time',
      'eventTime',
      'time',
      'start_time',
      'startTime',
      'todo_time',
      'todoTime',
      'categoryStartTime',
    ) || '',
  ).trim();

  if (!value) return Number.POSITIVE_INFINITY;

  const compactValue = value.replace(/\s+/g, ' ');
  const meridiemMatch = compactValue.match(
    /^(오전|오후|AM|PM)\s*(\d{1,2})(?::(\d{1,2}))?/i,
  );

  if (meridiemMatch) {
    const period = meridiemMatch[1].toUpperCase();
    const hour = Number(meridiemMatch[2]);
    const minute = Number(meridiemMatch[3] || 0);

    if (hour >= 1 && hour <= 12 && minute >= 0 && minute <= 59) {
      const isPm = period === '오후' || period === 'PM';
      const hour24 = isPm ? (hour % 12) + 12 : hour % 12;
      return hour24 * 60 + minute;
    }
  }

  const hourMinuteMatch = compactValue.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);

  if (hourMinuteMatch) {
    return Number(hourMinuteMatch[1]) * 60 + Number(hourMinuteMatch[2]);
  }

  return Number.POSITIVE_INFINITY;
}

function getEventCreatedTime(event) {
  const value = getEventValue(event, 'created_at', 'createdAt', 'backed_up_at');
  const time = Date.parse(value);
  return Number.isNaN(time) ? 0 : time;
}

function compareEventsByTitle(a, b) {
  return String(a?.title || '').localeCompare(String(b?.title || ''), 'ko');
}

function compareGroupEvents(a, b, calendarType) {
  if (calendarType === 'event') {
    const aTime = getEventTimeSortValue(a);
    const bTime = getEventTimeSortValue(b);
    const hasATime = Number.isFinite(aTime);
    const hasBTime = Number.isFinite(bTime);

    if (hasATime && hasBTime && aTime !== bTime) return aTime - bTime;
    if (hasATime !== hasBTime) return hasATime ? -1 : 1;

    const createdDiff = getEventCreatedTime(a) - getEventCreatedTime(b);
    if (createdDiff !== 0) return createdDiff;
  }

  return compareEventsByTitle(a, b);
}

function getNicknameInitial(name) {
  const trimmed = String(name || '').trim();
  return Array.from(trimmed)[0] || '회';
}

function groupEventsByDateAndUser(rows = []) {
  const byDate = {};

  rows.forEach((row) => {
    const dateKey = String(row.event_date || '').slice(0, 10);
    if (!dateKey) return;
    const event = {
      ...row,
      event_date: dateKey,
      isDone: getGroupEventDone(row),
    };

    if (!byDate[dateKey]) byDate[dateKey] = [];

    let member = byDate[dateKey].find((item) => item.userId === event.user_id);
    if (!member) {
      member = {
        userId: event.user_id,
        name: event.user_nickname || '회원',
        events: [],
      };
      byDate[dateKey].push(member);
    }

    member.events.push(event);
  });

  Object.values(byDate).forEach((members) => {
    members.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    members.forEach((member) => {
      member.events.sort((a, b) =>
        compareGroupEvents(a, b, a?.calendar_type || b?.calendar_type),
      );
    });
  });

  return byDate;
}

function getEventPayloadValue(event, key) {
  const payload = event?.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  return payload[key];
}

function getGroupEventDone(event) {
  return normalizeSharedBoolean(
    event?.isDone ??
      getEventPayloadValue(event, 'isDone') ??
      getEventPayloadValue(event, 'is_done'),
  );
}

function getEventSharedValue(event, snakeKey, camelKey) {
  return (
    event?.[snakeKey] ??
    event?.[camelKey] ??
    getEventPayloadValue(event, snakeKey) ??
    getEventPayloadValue(event, camelKey)
  );
}

function normalizeSharedBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function getSharedOriginId(event) {
  return String(
    getEventSharedValue(event, 'shared_origin_todo_id', 'sharedOriginTodoId') ||
      '',
  ).trim();
}

function isExplicitSharedEvent(event, groupState) {
  const sharedGroupId = String(
    getEventSharedValue(event, 'shared_group_id', 'sharedGroupId') || '',
  ).trim();
  const originTodoId = String(
    getEventSharedValue(event, 'shared_origin_todo_id', 'sharedOriginTodoId') ||
      '',
  ).trim();
  const originUserId = String(
    getEventSharedValue(event, 'shared_origin_user_id', 'sharedOriginUserId') ||
      '',
  ).trim();
  const createdBy = String(
    getEventSharedValue(event, 'shared_created_by', 'sharedCreatedBy') || '',
  ).trim();
  const isSharedCopy = normalizeSharedBoolean(
    getEventSharedValue(event, 'is_shared_copy', 'isSharedCopy'),
  );
  const selectedGroupId = String(groupState?.selectedGroup?.id || '').trim();

  if (selectedGroupId && sharedGroupId === selectedGroupId) return true;
  return Boolean(originTodoId || originUserId || createdBy || isSharedCopy);
}

function getSharedDedupeKey(event, groupState) {
  const sharedGroupId =
    getEventSharedValue(event, 'shared_group_id', 'sharedGroupId') ||
    event?.group_id ||
    groupState?.selectedGroup?.id ||
    '';
  const eventId = String(
    getSharedOriginId(event) || event?.source_event_id || event?.id || '',
  ).trim();

  return [
    normalizeComparable(event?.calendar_type || groupState?.calendarType),
    normalizeComparable(sharedGroupId),
    normalizeComparable(eventId),
  ].join('|');
}

function isSharedEventForGroupBoard(event, groupState) {
  return isExplicitSharedEvent(event, groupState);
}

function collectWeekScheduleRows(week, groupState) {
  const memberMap = new Map();
  const personalEventsByDateAndUser = new Map();
  const sharedEventsByDate = new Map();
  const sharedEventKeys = new Set();

  week.forEach((item) => {
    const dateKey = item?.dateKey;
    if (!dateKey) return;

    (groupState.eventsByDate?.[dateKey] || []).forEach((member) => {
      if (!member?.userId) return;
      if (!memberMap.has(member.userId)) {
        memberMap.set(member.userId, {
          userId: member.userId,
          name: member.name || '회원',
        });
      }

      (member.events || []).forEach((event) => {
        if (isSharedEventForGroupBoard(event, groupState)) {
          const dedupeKey = getSharedDedupeKey(event, groupState);
          if (sharedEventKeys.has(dedupeKey)) return;
          sharedEventKeys.add(dedupeKey);

          if (!sharedEventsByDate.has(dateKey)) sharedEventsByDate.set(dateKey, []);
          sharedEventsByDate.get(dateKey).push(event);
          return;
        }

        const personalKey = `${dateKey}|${member.userId}`;
        if (!personalEventsByDateAndUser.has(personalKey)) {
          personalEventsByDateAndUser.set(personalKey, []);
        }
        personalEventsByDateAndUser.get(personalKey).push(event);
      });
    });
  });

  const members = [...memberMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name, 'ko'),
  );

  sharedEventsByDate.forEach((events) => {
    events.sort((a, b) => compareGroupEvents(a, b, groupState.calendarType));
  });

  return {
    hasSharedEvents: sharedEventsByDate.size > 0,
    members,
    personalEventsByDateAndUser,
    sharedEventsByDate,
  };
}

// Use the board's deduplicated events and send only display text to the widget.
export function buildGroupWidgetRows(group, calendarType, roster, events, dates, currentUserId, savedMemberIds) {
  const state = {
    selectedGroup: group, calendarType, eventsByDate: groupEventsByDateAndUser(events),
  };
  const board = collectWeekScheduleRows(dates.map(dateKey => ({ dateKey })), state);
  function makeRow(name, getEvents) {
    const days = {};
    for (const date of dates) {
      const items = getEvents(date);
      if (items?.length) days[date] = items.map(event => ({
        title: event.title || event.event_type || '일정',
        color: normalizeColor(event.color, group.color || '#eeeeee'),
        done: event.isDone,
      }));
    }
    return { name, days };
  }
  const members = orderWidgetMembers(roster, currentUserId, savedMemberIds);
  const rows = members.map(member => makeRow(getNicknameInitial(member.nickname),
    date => board.personalEventsByDateAndUser.get(`${date}|${member.user_id}`)));
  if (board.hasSharedEvents) {
    rows.push({ ...makeRow('우리', date => board.sharedEventsByDate.get(date)), shared: true });
  }
  return rows;
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export async function fetchCalendarGroups() {
  return (await rpc('get_my_calendar_groups')) || [];
}

function getRelatedCategory(row, relation) {
  const category = row?.[relation];
  return Array.isArray(category) ? category[0] || null : category || null;
}

function makeBackupComparable(event, calendarType = '') {
  return {
    sourceEventId: String(event.sourceEventId || ''),
    eventDate: String(event.eventDate || '').slice(0, 10),
    eventType: String(event.eventType || ''),
    title: String(event.title || ''),
    memo: String(event.memo || ''),
    color: event.color || null,
    payload: normalizeBackupPayload(event.payload, calendarType),
  };
}

function makeSourceBackupEvent(row, calendarType) {
  const config = BACKUP_SOURCE_CONFIG[calendarType];
  const category = getRelatedCategory(row, config.categoryRelation);

  if (calendarType === 'study') {
    return makeBackupComparable({
      sourceEventId: row.id,
      eventDate: row.todo_date,
      eventType: category?.slug || row.todo_type,
      title: row.todo_text,
      memo: row.memo || '',
      color: category?.color || null,
      payload: {
        isDone: Boolean(row.is_done),
        categoryName: category?.name || null,
        todoTime: row.todo_time || null,
        todoEndDate: row.todo_end_date || null,
        todoEndTime: row.todo_end_time || null,
      },
    }, calendarType);
  }

  if (calendarType === 'work') {
    return makeBackupComparable({
      sourceEventId: row.id,
      eventDate: row.work_date,
      eventType: category?.slug || row.work_type,
      title: category?.name || row.work_text,
      memo: row.memo || '',
      color: category?.color || null,
      payload: {
        isDone: Boolean(row.is_done),
        workText: row.work_text || null,
        categoryName: category?.name || null,
        categoryStartTime: category?.start_time || null,
        categoryEndTime: category?.end_time || null,
        categoryEndsNextDay: Boolean(category?.ends_next_day),
        startTime: row.start_time || null,
        endTime: row.end_time || null,
        endsNextDay: Boolean(row.ends_next_day),
        hasTimeOverride: Boolean(row.has_time_override),
      },
    }, calendarType);
  }

  return makeBackupComparable({
    sourceEventId: row.id,
    eventDate: row.event_date,
    eventType: category?.slug || row.event_type,
    title: row.event_text,
    memo: row.memo || '',
    color: category?.color || null,
    payload: {
      isDone: Boolean(row.is_done),
      eventTime: row.event_time || null,
      eventEndTime: row.event_end_time || null,
      eventRangeId: row.event_range_id || null,
      categoryName: category?.name || null,
      shared_group_id: row.shared_group_id || null,
      shared_origin_todo_id: row.shared_origin_todo_id || null,
      shared_origin_user_id: row.shared_origin_user_id || null,
      shared_created_by: row.shared_created_by || null,
      is_shared_copy: Boolean(row.is_shared_copy),
    },
  }, calendarType);
}

function makeStoredBackupEvent(row, calendarType) {
  return makeBackupComparable({
    sourceEventId: row.source_event_id,
    eventDate: row.event_date,
    eventType: row.event_type,
    title: row.title,
    memo: row.memo,
    color: row.color,
    payload: row.payload || {},
  }, calendarType);
}

function serializeBackupEvents(events = []) {
  return JSON.stringify(
    [...events].sort((a, b) =>
      a.sourceEventId.localeCompare(b.sourceEventId),
    ),
  );
}

function makeSourceBackupCategory(row, calendarType) {
  return {
    sourceCategoryId: String(row.id || ''),
    name: String(row.name || '').trim(),
    sourceSlug: String(row.slug || ''),
    color: normalizeColor(row.color, calendarType === 'work' ? '#e7f6ff' : calendarType === 'event' ? '#ffe0ef' : '#eaffd7'),
    sourceIsDefault: Boolean(row.is_default),
    sourceSortOrder: Number(row.sort_order ?? 100),
    settings: calendarType === 'work' ? {
      startTime: row.start_time || null,
      endTime: row.end_time || null,
      endsNextDay: Boolean(row.ends_next_day),
    } : {},
  };
}

function makeStoredBackupCategory(row) {
  const settings = row?.settings && typeof row.settings === 'object'
    ? row.settings
    : {};
  return {
    sourceCategoryId: String(row.source_category_id || ''),
    name: String(row.name || '').trim(),
    sourceSlug: String(row.source_slug || ''),
    color: normalizeColor(row.color, '#eaffd7'),
    sourceIsDefault: Boolean(row.source_is_default),
    sourceSortOrder: Number(row.source_sort_order ?? 100),
    settings: Object.keys(settings).sort().reduce((result, key) => {
      result[key] = settings[key] ?? null;
      return result;
    }, {}),
  };
}

function serializeBackupCategories(categories = []) {
  return JSON.stringify(
    [...categories]
      .map((category) => ({
        ...category,
        settings: Object.keys(category.settings || {}).sort().reduce((result, key) => {
          result[key] = category.settings[key] ?? null;
          return result;
        }, {}),
      }))
      .sort((a, b) => a.sourceCategoryId.localeCompare(b.sourceCategoryId)),
  );
}

async function checkBackupNeeded({ userId, groupId, calendarType }) {
  const config = BACKUP_SOURCE_CONFIG[calendarType];
  if (!config || !userId || !groupId) return false;

  const [sourceResult, backupResult, sourceCategoryResult, backupCategoryResult] = await Promise.all([
    supabase
      .from(config.table)
      .select(config.select)
      .eq('user_id', userId),
    supabase
      .from('calendar_group_shared_events')
      .select(
        'source_event_id, event_date, event_type, title, memo, color, payload',
      )
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('calendar_type', calendarType),
    supabase
      .from(config.categoryTable)
      .select(config.categorySelect)
      .eq('user_id', userId),
    supabase
      .from('calendar_group_shared_categories')
      .select(
        'source_category_id, name, source_slug, color, source_is_default, source_sort_order, settings',
      )
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .eq('calendar_type', calendarType),
  ]);

  if (sourceResult.error) throw sourceResult.error;
  if (backupResult.error) throw backupResult.error;
  if (sourceCategoryResult.error) throw sourceCategoryResult.error;
  if (backupCategoryResult.error) throw backupCategoryResult.error;

  const sourceEvents = (sourceResult.data || [])
    .filter(
      (row) =>
        calendarType !== 'event' ||
        (!row.is_shared_copy &&
          (!row.shared_group_id || row.shared_group_id === groupId)),
    )
    .map((row) => makeSourceBackupEvent(row, calendarType));
  const backupEvents = (backupResult.data || []).map((row) =>
    makeStoredBackupEvent(row, calendarType),
  );
  const sourceCategories = (sourceCategoryResult.data || [])
    .filter((row) => !row.is_shared_copy_category)
    .map((row) => makeSourceBackupCategory(row, calendarType));
  const backupCategories = (backupCategoryResult.data || [])
    .map(makeStoredBackupCategory);

  return (
    serializeBackupEvents(sourceEvents) !== serializeBackupEvents(backupEvents) ||
    serializeBackupCategories(sourceCategories) !== serializeBackupCategories(backupCategories)
  );
}

export function isCalendarGroupActive(groupState) {
  return Boolean(
    groupState?.selectedGroup?.id &&
      getCalendarMode(groupState.selectedGroup) === CALENDAR_MODES.SHARED_GROUP &&
      isAllowed(groupState.selectedGroup, groupState.calendarType),
  );
}

export function getVisiblePersonalTodos(todos = [], dateKey, groupState) {
  if (!Array.isArray(todos) || todos.length === 0) return todos;
  if (!dateKey || !groupState?.selectedGroup?.id || !groupState?.userId) {
    return todos;
  }
  if (!isAllowed(groupState.selectedGroup, groupState.calendarType)) return todos;

  const myGroupEvents = (groupState.eventsByDate?.[dateKey] || [])
    .filter((member) => member.userId === groupState.userId)
    .flatMap((member) => member.events || []);

  if (myGroupEvents.length === 0) return todos;

  const sourceIds = new Set(
    myGroupEvents
      .map((event) => String(event.source_event_id || '').trim())
      .filter(Boolean),
  );

  const fallbackKeys = new Set(
    myGroupEvents.map((event) =>
      [
        normalizeComparable(event.calendar_type || groupState.calendarType),
        normalizeComparable(event.event_date || dateKey),
        normalizeComparable(event.title || event.event_type),
        normalizeComparable(event.event_type),
      ].join('|'),
    ),
  );

  return todos.filter((todo) => {
    const todoId = String(todo.id || '').trim();
    if (todoId && sourceIds.has(todoId)) return false;

    const fallbackKey = [
      normalizeComparable(groupState.calendarType),
      normalizeComparable(todo.date || dateKey),
      normalizeComparable(todo.text || todo.type),
      normalizeComparable(todo.type),
    ].join('|');

    return !fallbackKeys.has(fallbackKey);
  });
}

function createGroupEventBadge(event, member, groupState, options = {}) {
  const badge = document.createElement(
    options.onSelectEvent ? 'button' : 'span',
  );
  const color = normalizeColor(
    event.color,
    groupState.selectedGroup?.color || '#eeeeee',
  );

  badge.className = 'calendar-group-schedule__badge';
  if (options.isShared) {
    badge.classList.add('calendar-group-schedule__badge--shared');
  }
  if (event?.isDone) {
    badge.classList.add('calendar-group-schedule__badge--completed');
  }
  badge.style.setProperty('--calendar-group-event-color', color);
  badge.style.setProperty('--calendar-group-event-text', getTextColor(color));
  badge.textContent = event.title || event.event_type || '일정';
  badge.title = options.isShared
    ? `우리 일정 · ${badge.textContent}`
    : `${member.name || '회원'} · ${badge.textContent}`;
  badge.setAttribute(
    'aria-label',
    options.isShared
      ? `우리 일정 ${badge.textContent}`
      : `${member.name || '회원'} 일정 ${badge.textContent}`,
  );

  if (options.onSelectEvent) {
    badge.type = 'button';
    badge.classList.add('calendar-group-schedule__badge--selectable');

    const selectEvent = (domEvent) => {
      domEvent.preventDefault();
      domEvent.stopPropagation();
      options.onSelectEvent(event, member, {
        isShared: Boolean(options.isShared),
      });
    };

    badge.addEventListener('click', selectEvent);
  }

  return badge;
}

function appendScheduleRow({
  weekEl,
  week,
  rowMember,
  groupState,
  selectedDateKey,
  todayKey,
  onSelect,
  onSelectEvent,
  getEvents,
  isShared = false,
}) {
  const row = document.createElement('div');
  row.className = 'calendar-group-schedule__row';
  if (isShared) {
    row.classList.add('calendar-group-schedule__row--shared');
  }

  const name = document.createElement('div');
  const fullName = rowMember.name || '회원';
  name.className = 'calendar-group-schedule__name';
  if (isShared) {
    name.classList.add('calendar-group-schedule__name--shared');
  }
  name.textContent = isShared ? '우리' : getNicknameInitial(fullName);
  name.title = isShared ? '우리 일정' : fullName;
  name.setAttribute('aria-label', isShared ? '우리 일정' : fullName);
  row.append(name);

  week.forEach((item) => {
    const cellButton = document.createElement('div');
    cellButton.className = 'calendar-group-schedule__cell';
    cellButton.dataset.date = item?.dateKey || '';
    cellButton.tabIndex = 0;
    cellButton.setAttribute('role', 'button');
    cellButton.setAttribute(
      'aria-label',
      `${isShared ? '우리 일정' : rowMember.name || '회원'} ${
        item?.dateKey || ''
      } 그룹 일정`,
    );

    if (!item?.isCurrentMonth) {
      cellButton.classList.add('is-muted');
    }

    if (item?.dateKey && item.dateKey === selectedDateKey && item.dateKey !== todayKey) {
      cellButton.classList.add('is-selected');
    }

    const events = getEvents(item?.dateKey) || [];
    events.forEach((event) => {
      cellButton.append(
        createGroupEventBadge(event, rowMember, groupState, {
          isShared,
          onSelectEvent,
        }),
      );
    });

    cellButton.addEventListener('click', () => {
      if (item?.dateKey) onSelect?.(item.dateKey);
    });
    cellButton.addEventListener('keydown', (keyboardEvent) => {
      if (
        keyboardEvent.target === cellButton &&
        (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ')
      ) {
        keyboardEvent.preventDefault();
        if (item?.dateKey) onSelect?.(item.dateKey);
      }
    });

    row.append(cellButton);
  });

  weekEl.append(row);
}

export function appendCalendarGroupBoard(
  root,
  dateItems = [],
  groupState,
  options = {},
) {
  if (!root || !Array.isArray(dateItems) || !groupState?.selectedGroup?.id) return;
  if (!isCalendarGroupActive(groupState)) return;

  const ownUserId = groupState.userId || null;
  const showSharedFirst = groupState.calendarType === 'event';
  const todayKey = toDateKey(new Date());
  const weeks = [];

  for (let index = 0; index < dateItems.length; index += 7) {
    weeks.push(dateItems.slice(index, index + 7));
  }

  const wrap = document.createElement('div');
  wrap.className = 'calendar-group-schedule';
  wrap.setAttribute('aria-label', '그룹 공유 일정');

  weeks.forEach((week) => {
    if (week.length === 0) return;

    const {
      hasSharedEvents,
      members,
      personalEventsByDateAndUser,
      sharedEventsByDate,
    } = collectWeekScheduleRows(week, groupState);
    const ownMember = ownUserId
      ? members.find(member => member.userId === ownUserId) ||
        { userId: ownUserId, name: groupState.userNickname || '나' }
      : null;
    const isEmptyWeek = !hasSharedEvents && members.length === 0 && !ownMember;

    const weekEl = document.createElement('section');
    weekEl.className = 'calendar-group-schedule__week';

    const header = document.createElement('div');
    header.className = 'calendar-group-schedule__header';

    const corner = document.createElement('div');
    corner.className = 'calendar-group-schedule__corner';
    corner.setAttribute('aria-hidden', 'true');
    header.append(corner);

    week.forEach((item) => {
      const head = document.createElement('div');
      head.className = 'calendar-group-schedule__date-head';
      head.dataset.date = item?.dateKey || '';
      if (item?.dateKey === todayKey) {
        head.classList.add('is-today');
        head.setAttribute('aria-current', 'date');
        head.setAttribute('aria-label', `${item.dateKey} 오늘`);
      }
      if (!item?.isCurrentMonth) {
        head.classList.add('is-muted');
      }
      const dateLabel = document.createElement('span');
      dateLabel.className = 'calendar-group-schedule__date-label';
      dateLabel.textContent = `${item?.weekday || ''} ${item?.dateNumber || ''}`.trim();
      head.append(dateLabel);
      appendKoreanHolidayBadge(head, item?.dateKey);
      header.append(head);
    });

    weekEl.append(header);

    const appendMemberRow = (member) => appendScheduleRow({
      weekEl,
      week,
      rowMember: member,
      groupState,
      selectedDateKey: options.selectedDateKey,
      todayKey,
      onSelect: options.onSelect,
      onSelectEvent: options.onSelectEvent,
      getEvents: (dateKey) =>
        personalEventsByDateAndUser.get(`${dateKey}|${member.userId}`) || [],
    });

    if (ownMember && !showSharedFirst) appendMemberRow(ownMember);

    if (hasSharedEvents || isEmptyWeek) {
      appendScheduleRow({
        weekEl,
        week,
        rowMember: { name: '우리 일정' },
        groupState,
        selectedDateKey: options.selectedDateKey,
        todayKey,
        onSelect: options.onSelect,
        onSelectEvent: options.onSelectEvent,
        getEvents: (dateKey) => sharedEventsByDate.get(dateKey) || [],
        isShared: true,
      });
    }

    if (ownMember && showSharedFirst) appendMemberRow(ownMember);

    for (const member of members) {
      if (member !== ownMember) appendMemberRow(member);
    }

    wrap.append(weekEl);
  });

  if (wrap.children.length === 0) return;
  root.append(wrap);
}

export async function initCalendarGroupBar({
  calendarType,
  userId,
  userNickname,
  groupsPromise,
  pageRoot,
  getViewDate,
  renderAll,
  onModeChange,
  runCalendarLoad,
  isCurrent: isInitialLoadCurrent = () => true,
}) {
  if (!pageRoot || !userId || !CALENDAR_LABELS[calendarType] || !isInitialLoadCurrent()) {
    return null;
  }

  const head = pageRoot.querySelector('[class$="-calendar-page__head"]');
  const state = {
    userId,
    userNickname,
    calendarType,
    selectedGroup: null,
    groups: [],
    eventsByDate: {},
    lastBackupAt: '',
    backupNeeded: false,
    backupChecking: false,
    backupRunning: false,
    backupCheckId: 0,
    groupLoadId: 0,
    backupStatus: BACKUP_STATUS.IDLE,
    mode: CALENDAR_MODES.PERSONAL,
  };

  const bar = document.createElement('section');
  bar.className = 'calendar-group-bar';
  bar.setAttribute('aria-label', '캘린더 그룹 연동');
  const panelId = `${calendarType}CalendarGroupPanel`;
  const panelTitleId = `${calendarType}CalendarGroupPanelTitle`;
  const panelStatusId = `${calendarType}CalendarGroupPanelStatus`;
  const widgetOrderId = `${calendarType}CalendarWidgetOrder`;
  bar.innerHTML = `
    <div class="calendar-group-bar__actions">
      <button
        class="calendar-group-bar__toggle"
        type="button"
        aria-expanded="false"
        aria-controls="${panelId}"
      >
        그룹 설정
      </button>
      <a class="calendar-group-bar__list" href="${escapeHtml(makeAppHref('./calendar-groups.html', { calendar: calendarType }))}">그룹 목록</a>
    </div>
  `;

  const backupButton = document.createElement('button');
  backupButton.type = 'button';
  backupButton.className =
    'calendar-group-bar__backup calendar-group-bar__backup--header';
  backupButton.textContent = '백업';
  backupButton.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'calendar-group-bar__panel';
  panel.id = panelId;
  panel.hidden = true;
  panel.innerHTML = `
    <div
      class="calendar-group-bar__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="${panelTitleId}"
      aria-describedby="${panelStatusId}"
      tabindex="-1"
    >
      <div class="calendar-group-bar__heading">
        <span class="calendar-group-bar__eyebrow">캘린더 그룹</span>
        <h2 class="calendar-group-bar__title" id="${panelTitleId}">그룹 설정</h2>
      </div>
      <div class="calendar-group-bar__main">
        <label class="calendar-group-bar__field">
          <span>그룹</span>
          <select class="calendar-group-bar__select" aria-label="연동 그룹 선택" disabled>
            <option value="">그룹 연동 OFF</option>
          </select>
        </label>
        <button class="calendar-group-bar__widget-order" type="button" aria-expanded="false" aria-controls="${widgetOrderId}" hidden>
          위젯 순서 편집
        </button>
        <section class="calendar-group-widget-order" id="${widgetOrderId}" aria-label="위젯 순서 편집" hidden>
          <p class="calendar-group-widget-order__status" role="status" hidden></p>
          <div class="calendar-group-widget-order__own calendar-group-widget-order__member" hidden></div>
          <ol class="calendar-group-widget-order__list"></ol>
        </section>
        <button class="calendar-group-bar__close" type="button">닫기</button>
      </div>
      <div class="calendar-group-bar__status" id="${panelStatusId}" aria-live="polite">
        <span class="calendar-group-bar__status-main">그룹 일정을 함께 보려면 그룹을 선택해줘.</span>
      </div>
    </div>
  `;

  if (head) {
    head.append(bar, backupButton);
  } else {
    pageRoot.prepend(bar);
    bar.querySelector('.calendar-group-bar__actions')?.append(backupButton);
  }
  bar.append(panel);

  let copyPaste = null;
  void loadCalendarCopyPasteModule().then(({ initCalendarCopyPaste }) => {
    if (!panel.isConnected) return;
    copyPaste = initCalendarCopyPaste({ bar: panel, calendarType });
    copyPaste?.setGroup(state.selectedGroup);
  }).catch((error) => {
    console.error('[calendar-groups] copy and paste controls failed:', error);
  });

  const dialog = panel.querySelector('.calendar-group-bar__dialog');
  const select = panel.querySelector('.calendar-group-bar__select');
  const status = panel.querySelector('.calendar-group-bar__status-main');
  const toggleButton = bar.querySelector('.calendar-group-bar__toggle');
  const closeButton = panel.querySelector('.calendar-group-bar__close');
  const widgetOrderButton = panel.querySelector('.calendar-group-bar__widget-order');
  const widgetOrderPanel = panel.querySelector('.calendar-group-widget-order');
  const widgetOrderStatus = panel.querySelector('.calendar-group-widget-order__status');
  const widgetOrderOwn = panel.querySelector('.calendar-group-widget-order__own');
  const widgetOrderList = panel.querySelector('.calendar-group-widget-order__list');
  const focusableSelector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');
  let lockedScrollX = 0;
  let lockedScrollY = 0;
  let previousBodyTop = '';
  let previousFocusedElement = null;
  let widgetOrderRequest = 0;

  function closeWidgetOrder() {
    widgetOrderRequest += 1;
    if (!widgetOrderPanel || widgetOrderPanel.hidden) return;
    resetCalendarListReorder(widgetOrderList);
    widgetOrderPanel.hidden = true;
    widgetOrderButton.setAttribute('aria-expanded', 'false');
    widgetOrderOwn.hidden = true;
    widgetOrderOwn.textContent = '';
    widgetOrderList.replaceChildren();
  }

  widgetOrderButton?.addEventListener('click', async () => {
    if (!widgetOrderPanel.hidden) {
      closeWidgetOrder();
      return;
    }
    const groupId = state.selectedGroup?.id;
    if (!groupId) return;
    const request = ++widgetOrderRequest;
    const scope = { userId, groupId, calendarType };
    const setOrderStatus = (message) => {
      widgetOrderStatus.hidden = !message;
      widgetOrderStatus.textContent = message;
    };
    widgetOrderButton.setAttribute('aria-expanded', 'true');
    widgetOrderPanel.hidden = false;
    setOrderStatus('그룹원을 불러오는 중…');
    try {
      const roster = await rpc('get_calendar_group_members', { p_group_id: groupId });
      if (request !== widgetOrderRequest || !widgetOrderPanel.isConnected) return;
      const members = orderWidgetMembers(roster || [], userId, readWidgetMemberOrder(scope));
      const own = members.find((member) => member.user_id === userId);
      const others = members.filter((member) => member.user_id !== userId);
      if (!own) {
        setOrderStatus('그룹원 목록을 불러오지 못했어요. 그룹을 다시 열어 주세요.');
        return;
      }
      widgetOrderOwn.textContent = `${own.nickname || '회원'} · 내 일정 (맨 위 고정)`;
      widgetOrderOwn.hidden = false;
      for (const member of others) {
        const row = document.createElement('li');
        row.className = 'calendar-group-widget-order__member';
        row.textContent = member.nickname || '회원';
        widgetOrderList.append(row);
      }
      if (others.length < 2) {
        setOrderStatus('다른 그룹원이 두 명 이상이면 순서를 바꿀 수 있어요.');
        return;
      }
      setOrderStatus('');
      enableCalendarListReorder({
        root: widgetOrderList,
        items: others.map((member) => ({ id: member.user_id, name: member.nickname || '회원' })),
        showMoveButtons: true,
        instructions: '손잡이를 끌거나 화살표를 누르면 순서가 저장돼요.',
        failureMessage: '이 기기에 순서를 저장하지 못했어요. 다시 시도해 주세요.',
        onReorder(ids) {
          saveWidgetMemberOrder(scope, ids);
          void refreshCalendarWidgets({ force: true });
        },
      });
    } catch (error) {
      if (request !== widgetOrderRequest) return;
      setOrderStatus('그룹원 목록을 불러오지 못했어요. 순서 편집을 다시 열어 주세요.');
      console.error('[calendar-groups] widget members failed:', error);
    }
  });

  function getFocusableElements() {
    if (!dialog) return [];
    return [...dialog.querySelectorAll(focusableSelector)].filter((element) => {
      if (element.hidden || element.closest('[hidden]')) return false;
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
  }

  function lockPageScroll() {
    lockedScrollX = window.scrollX || 0;
    lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    previousBodyTop = document.body.style.top;
    document.body.classList.add('calendar-group-modal-open');
    document.body.style.top = `-${lockedScrollY}px`;
  }

  function unlockPageScroll() {
    document.body.classList.remove('calendar-group-modal-open');
    document.body.style.top = previousBodyTop;
    window.scrollTo(lockedScrollX, lockedScrollY);
  }

  function handlePanelKeydown(event) {
    if (event.defaultPrevented || panel.hidden || document.querySelector('dialog[open]')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      setGroupPanelOpen(false);
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (focusable.length === 0) {
      event.preventDefault();
      dialog?.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (!dialog?.contains(document.activeElement)) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  }

  function setGroupPanelOpen(isOpen) {
    if (!dialog || !toggleButton || isOpen === !panel.hidden) return;

    if (isOpen) {
      previousFocusedElement =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : toggleButton;
      panel.hidden = false;
      lockPageScroll();
      document.addEventListener('keydown', handlePanelKeydown);
      window.requestAnimationFrame(() => {
        dialog.focus({ preventScroll: true });
      });
    } else {
      closeWidgetOrder();
      panel.hidden = true;
      document.removeEventListener('keydown', handlePanelKeydown);
      unlockPageScroll();
      const focusTarget = previousFocusedElement;
      previousFocusedElement = null;
      window.requestAnimationFrame(() => {
        focusTarget?.focus?.({ preventScroll: true });
      });
    }

    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  toggleButton?.addEventListener('click', () => {
    setGroupPanelOpen(Boolean(panel?.hidden));
  });

  closeButton?.addEventListener('click', () => {
    setGroupPanelOpen(false);
  });

  panel.addEventListener('click', (event) => {
    if (event.target === panel) setGroupPanelOpen(false);
  });

  window.addEventListener(
    'mallin:before-pjax-swap',
    () => setGroupPanelOpen(false),
    { once: true },
  );

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function updateBackupButtonState() {
    const isActive = isCalendarGroupActive(state);
    backupButton.hidden = !isActive;
    const isChecking = state.backupStatus === BACKUP_STATUS.CHECKING;
    const isRunning = state.backupRunning;
    const hasPendingPersonalCalendarChanges =
      state.backupStatus === BACKUP_STATUS.PENDING ||
      (state.backupNeeded && !isChecking && !isRunning);
    const canBackup =
      isActive &&
      hasPendingPersonalCalendarChanges &&
      !isChecking &&
      !isRunning;
    const isHighlighted = canBackup;
    const label =
      !isActive
        ? '백업할 변경사항 없음'
        : isRunning
          ? '백업 중'
          : isChecking
            ? '백업 상태 확인 중'
            : canBackup
              ? '백업 필요: 그룹 캘린더에 변경사항 반영'
              : '백업 완료';

    backupButton.disabled = !canBackup;
    backupButton.classList.toggle('is-backup-needed', isHighlighted);
    backupButton.dataset.backupNeeded = isHighlighted ? 'true' : 'false';
    backupButton.dataset.backupStatus = state.backupStatus;
    backupButton.setAttribute('aria-disabled', canBackup ? 'false' : 'true');
    backupButton.setAttribute('aria-label', label);
    backupButton.title = label;
  }

  function setBackupNeeded(isNeeded) {
    state.backupNeeded = Boolean(isNeeded && isCalendarGroupActive(state));
    state.backupStatus = state.backupNeeded
      ? BACKUP_STATUS.PENDING
      : BACKUP_STATUS.IDLE;
    updateBackupButtonState();
  }

  async function refreshBackupNeeded() {
    // A source edit or group refresh can arrive while the explicit backup RPC is
    // running. Keep it single-flight; the final comparison checks the latest data.
    if (state.backupRunning) return state.backupNeeded;

    const checkId = ++state.backupCheckId;
    const groupId = state.selectedGroup?.id || '';

    if (!isCalendarGroupActive(state)) {
      state.backupChecking = false;
      setBackupNeeded(false);
      return false;
    }

    state.backupChecking = true;
    state.backupStatus = BACKUP_STATUS.CHECKING;
    updateBackupButtonState();

    try {
      const isNeeded = await checkBackupNeeded({ userId: state.userId, groupId, calendarType });

      if (
        checkId !== state.backupCheckId ||
        groupId !== state.selectedGroup?.id
      ) {
        return state.backupNeeded;
      }

      state.backupChecking = false;
      setBackupNeeded(isNeeded);
      return isNeeded;
    } catch (error) {
      console.error('[calendar-groups] backup state check failed:', error);
      if (
        checkId === state.backupCheckId &&
        groupId === state.selectedGroup?.id
      ) {
        state.backupChecking = false;
        state.backupStatus = state.backupNeeded
          ? BACKUP_STATUS.PENDING
          : BACKUP_STATUS.IDLE;
        updateBackupButtonState();
      }
      return state.backupNeeded;
    }
  }

  function renderSelect() {
    const selectedId = state.selectedGroup?.id || '';
    select.innerHTML = '<option value="">그룹 연동 OFF</option>';

    getAllowedGroups(state.groups, calendarType).forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.append(option);
    });

    select.value = selectedId;
    if (widgetOrderButton) {
      widgetOrderButton.hidden = !selectedId || !window.Capacitor?.isNativePlatform?.();
    }
    updateBackupButtonState();
  }

  async function loadGroupEvents(reason, { isCurrent = () => true } = {}) {
    if (!isCurrent()) return;

    const loadId = ++state.groupLoadId;
    const selectedGroup = state.selectedGroup;
    const isInitialLoad = reason === 'initial-group';
    const isMonthNavigation = reason === 'month-navigation';
    const reloadPersonalStore = !isInitialLoad && !isMonthNavigation;
    if (!isMonthNavigation) state.eventsByDate = {};
    state.mode = getCalendarMode(selectedGroup);

    if (!state.selectedGroup?.id) {
      copyPaste?.setGroup(null);
      setStatus('그룹 연동 OFF 상태야.');
      state.backupChecking = false;
      setBackupNeeded(false);
      if (reloadPersonalStore) {
        await onModeChange?.({ group: null, rows: [], mode: CALENDAR_MODES.PERSONAL });
        if (!isCurrent() || loadId !== state.groupLoadId || state.selectedGroup) return;
        renderAll?.();
      }
      return;
    }

    copyPaste?.setGroup(state.selectedGroup);

    if (!isAllowed(state.selectedGroup, calendarType)) {
      setStatus(`이 그룹은 ${CALENDAR_LABELS[calendarType]} 캘린더 연동이 꺼져 있어.`);
      state.backupChecking = false;
      setBackupNeeded(false);
      renderAll?.();
      return;
    }

    if (reloadPersonalStore) {
      await onModeChange?.({ group: selectedGroup, rows: [], mode: CALENDAR_MODES.SHARED_GROUP });
    }

    if (
      !isCurrent() ||
      loadId !== state.groupLoadId ||
      selectedGroup?.id !== state.selectedGroup?.id
    ) {
      return;
    }

    if (!isMonthNavigation) {
      state.backupCheckId += 1;
      state.backupChecking = false;
      setBackupNeeded(false);
    }
    const { startDate, endDate } = getMonthRange(getViewDate());
    setStatus('그룹 일정을 불러오는 중...');
    if (reloadPersonalStore) renderAll?.();

    const rows = await rpc('get_group_calendar_view', {
      p_group_id: selectedGroup.id,
      p_calendar_type: calendarType,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    if (
      !isCurrent() ||
      loadId !== state.groupLoadId ||
      selectedGroup.id !== state.selectedGroup?.id
    ) {
      return;
    }

    state.eventsByDate = groupEventsByDateAndUser(rows || []);
    setStatus(
      `${selectedGroup.name} · ${CALENDAR_LABELS[calendarType]} 그룹 일정 표시 중`,
    );
    if (!isInitialLoad) renderAll?.();
    void refreshBackupNeeded();
  }

  function getCalendarLoadKey(reason) {
    const viewDate = getViewDate();
    const year = viewDate?.getFullYear?.() || 0;
    const month = String((viewDate?.getMonth?.() || 0) + 1).padStart(2, '0');
    return [
      calendarType,
      reason,
      state.selectedGroup?.id || 'personal',
      `${year}-${month}`,
    ].join(':');
  }

  function refreshCalendar({ reason = 'refresh' } = {}) {
    if (reason === 'month-navigation' && !isCalendarGroupActive(state)) return;

    const task = (loadContext) => loadGroupEvents(reason, loadContext);
    return typeof runCalendarLoad === 'function'
      ? runCalendarLoad(task, { key: getCalendarLoadKey(reason) })
      : task();
  }

  async function loadGroups() {
    const groups = await (groupsPromise ?? fetchCalendarGroups());
    if (!isInitialLoadCurrent()) return;

    state.groups = groups;
    const widgetUrl = new URL(window.location.href);
    const requestedGroup = widgetUrl.searchParams.get('widgetGroup');
    const selectedId = requestedGroup ?? getSelectedGroupId();
    // 선택 키는 세 캘린더가 공유하므로 저장값은 보존하고,
    // 현재 캘린더에서 허용되는 그룹만 이 화면의 선택으로 복원한다.
    state.selectedGroup = getAllowedGroups(state.groups, calendarType)
      .find((group) => group.id === selectedId) || null;

    if (requestedGroup !== null) {
      setSelectedGroupId(state.selectedGroup?.id || '');
      widgetUrl.searchParams.delete('widgetGroup');
      window.history.replaceState(window.history.state, '', widgetUrl);
    }
    renderSelect();
    await loadGroupEvents('initial-group', { isCurrent: isInitialLoadCurrent });
  }

  select.addEventListener('change', async () => {
    closeWidgetOrder();
    const groupId = select.value;
    state.selectedGroup = getAllowedGroups(state.groups, calendarType)
      .find((group) => group.id === groupId) || null;
    setSelectedGroupId(state.selectedGroup?.id || '');
    state.backupCheckId += 1;
    state.backupChecking = false;
    setBackupNeeded(false);
    renderSelect();

    try {
      await refreshCalendar({ reason: 'group-selection' });
    } catch (error) {
      console.error('[calendar-groups] load group events failed:', error);
      if ((state.selectedGroup?.id || '') === groupId) {
        setStatus('그룹 일정을 불러오지 못했어. SQL 적용 여부를 확인해줘.');
      }
    }
  });

  backupButton.addEventListener('click', async () => {
    if (
      !isCalendarGroupActive(state) ||
      !state.backupNeeded ||
      state.backupChecking ||
      state.backupRunning ||
      backupButton.disabled
    ) {
      return;
    }

    const backupGroupId = state.selectedGroup.id;
    state.backupCheckId += 1;
    state.backupRunning = true;
    state.backupChecking = true;
    state.backupStatus = BACKUP_STATUS.RUNNING;
    updateBackupButtonState();
    backupButton.textContent = '백업 중';
    setStatus('내 일정을 그룹 공유 데이터로 백업하는 중...');

    try {
      const result = await rpc('backup_my_calendar_to_group', {
        p_group_id: backupGroupId,
        p_calendar_type: calendarType,
      });

      const backedUpAt = result?.[0]?.backed_up_at || new Date().toISOString();
      const count = Number(result?.[0]?.event_count || 0);
      if (backupGroupId !== state.selectedGroup?.id) return;

      state.lastBackupAt = backedUpAt;

      state.backupChecking = false;
      setBackupNeeded(false);
      setStatus(
        `${CALENDAR_LABELS[calendarType]} ${count}개 백업 완료 · ${new Date(
          backedUpAt,
        ).toLocaleString('ko-KR')}`,
      );
      scheduleCalendarWidgetRefresh();
      await refreshCalendar({ reason: 'group-backup' });
    } catch (error) {
      console.error('[calendar-groups] backup failed:', error);
      if (backupGroupId === state.selectedGroup?.id) {
        setStatus('백업에 실패했어. 그룹 권한과 SQL 적용 여부를 확인해줘.');
      }
    } finally {
      state.backupRunning = false;
      state.backupChecking = false;
      backupButton.textContent = '백업';
      renderSelect();
      await refreshBackupNeeded();
    }
  });

  try {
    await loadGroups();
    scheduleCalendarWidgetRefresh();
  } catch (error) {
    console.error('[calendar-groups] init bar failed:', error);
    setStatus('그룹 기능을 불러오지 못했어. Supabase SQL 적용이 필요해.');
  } finally {
    select.disabled = false;
  }

  return {
    state,
    refresh: refreshCalendar,
    refreshBackupNeeded,
  };
}

function getCalendarTypeFlags(form) {
  return {
    allowStudy: Boolean(form.querySelector('[name="allowStudy"]')?.checked),
    allowWork: Boolean(form.querySelector('[name="allowWork"]')?.checked),
    allowEvent: Boolean(form.querySelector('[name="allowEvent"]')?.checked),
  };
}

function getGroupCalendarHref(group, preferredType) {
  const calendarType = isAllowed(group, preferredType)
    ? preferredType
    : Object.keys(CALENDAR_LABELS).find((type) => isAllowed(group, type));
  if (!calendarType) return '';

  return makeAppHref(`./calendar-${calendarType}.html`, { widgetGroup: group.id });
}

function normalizeGroupSearch(value) {
  return String(value || '').normalize('NFC').toLowerCase().trim();
}

function createGroupCard(group, { myGroup = false, members = [], preferredType } = {}) {
  const isPrivate = group.visibility === 'private';
  const color = normalizeColor(group.color);
  const isOwner = group.role === 'owner';
  const transferTargets = members.filter((member) => !member.is_owner);
  const description = normalizeGroupDescription(group.description);
  const name = escapeHtml(group.name);
  const calendars = Object.keys(CALENDAR_LABELS).filter((type) => isAllowed(group, type));
  const calendarHref = myGroup ? getGroupCalendarHref(group, preferredType) : '';
  const memberCount = Number(group.member_count ?? members.length);
  const memberLabel = Number.isFinite(memberCount) ? `참여자 ${memberCount}명` : '참여자';
  const searchText = normalizeGroupSearch(
    [group.name, description, ...calendars.map((type) => CALENDAR_LABELS[type])].join(' '),
  );

  return `
    <article class="calendar-group-card" data-group-id="${escapeHtml(group.id)}" data-group-search="${escapeHtml(searchText)}">
      <div class="calendar-group-card__head">
        <span class="calendar-group-card__dot" style="--calendar-group-color:${color}" aria-hidden="true"></span>
        <div class="calendar-group-card__body">
          <h3 class="calendar-group-card__title">${name}</h3>
          <div class="calendar-group-card__badges">
            <span class="calendar-group-card__badge calendar-group-card__badge--visibility">${isPrivate ? '비공개' : '공개'}</span>
            ${calendars.map((type) => `<span class="calendar-group-card__badge calendar-group-card__badge--type-${type}">${CALENDAR_LABELS[type]}</span>`).join('')}
            ${calendars.length ? '' : '<span class="calendar-group-card__badge">연동 꺼짐</span>'}
            ${group.is_hidden ? '<span class="calendar-group-card__badge">숨김</span>' : ''}
            ${isOwner ? '<span class="calendar-group-card__badge calendar-group-card__badge--role">그룹장</span>' : ''}
          </div>
          ${
            description
              ? `<p class="calendar-group-card__description">${escapeHtml(description)}</p>`
              : ''
          }
        </div>
      </div>
      <div class="calendar-group-card__actions">
        ${
          myGroup
            ? (calendarHref ? `<a class="calendar-group-card__open calendar-group-card__primary" aria-label="${name} 캘린더 열기" href="${escapeHtml(calendarHref)}">캘린더 열기 <span aria-hidden="true">›</span></a>` : '')
            : `<form class="calendar-group-card__join" data-join-group>
                <div class="calendar-group-card__join-fields">
                  ${isPrivate ? `<input type="password" data-password placeholder="그룹 비밀번호" aria-label="${name} 그룹 비밀번호" autocomplete="off" required />` : ''}
                  <button class="calendar-group-card__primary" type="submit" data-action="join" aria-label="${name} 그룹 참여">그룹 참여</button>
                </div>
                <p class="calendar-group-card__join-error" data-join-error role="alert" hidden></p>
              </form>`
        }
        ${
          group.can_manage
            ? `<button type="button" data-action="toggle-hidden">${
                group.is_hidden ? '다시 표시' : '숨기기'
              }</button>`
            : ''
        }
      </div>
      ${
        myGroup
          ? `
            <details class="calendar-group-card__members">
              <summary class="calendar-group-card__section-title">${memberLabel} · 관리</summary>
              ${
                members.length > 0
                  ? `<ul class="calendar-group-member-list">
                      ${members
                        .map(
                          (member) => `
                            <li class="calendar-group-member">
                              <span class="calendar-group-member__name">${escapeHtml(
                                member.nickname || '회원',
                              )}${member.is_owner ? ' · 방장' : ''}</span>
                              ${
                                member.can_remove
                                  ? `<button type="button" data-action="kick-member" data-target-user-id="${escapeHtml(
                                      member.user_id,
                                    )}" data-target-nickname="${escapeHtml(
                                      member.nickname || '회원',
                                    )}">강퇴</button>`
                                  : ''
                              }
                            </li>
                          `,
                        )
                        .join('')}
                    </ul>`
                  : '<p class="calendar-groups-empty">참여자 정보를 불러오지 못했어.</p>'
              }
              <div class="calendar-group-card__actions">
                ${isOwner ? `<button type="button" data-action="transfer-owner">그룹장 넘기기</button>
                  <button type="button" data-action="delete-group" class="calendar-group-card__danger">그룹 삭제</button>` : '<button type="button" data-action="leave">그룹 나가기</button>'}
              </div>
            ${
              isOwner
                ? `<div class="calendar-group-card__transfer" data-transfer-panel hidden>
                    ${
                      transferTargets.length > 0
                        ? `<label>
                            <span>넘겨받을 참여자</span>
                            <select data-transfer-user>
                              ${transferTargets
                                .map(
                                  (member) => `
                                    <option value="${escapeHtml(member.user_id)}">${escapeHtml(
                                      member.nickname || '회원',
                                    )}</option>
                                  `,
                                )
                                .join('')}
                            </select>
                          </label>
                          <div class="calendar-group-card__transfer-actions">
                            <button type="button" data-action="confirm-transfer-owner">확인</button>
                            <button type="button" data-action="cancel-transfer-owner">취소</button>
                          </div>`
                        : '<p class="calendar-groups-empty">넘겨줄 참여자가 없습니다. 그룹을 삭제할 수 있습니다.</p>'
                    }
                  </div>`
                : ''
            }
            </details>
          `
          : ''
      }
      ${
        group.can_manage
          ? `
            <details class="calendar-group-card__edit">
              <summary>편집</summary>
              <label>이름 <input data-edit-name value="${escapeHtml(group.name)}" maxlength="30" /></label>
              <label>그룹 소개 <textarea data-edit-description maxlength="100" rows="3" placeholder="그룹을 짧게 소개해줘.">${escapeHtml(
                description,
              )}</textarea></label>
              <label>색상 <input data-edit-color type="color" value="${color}" /></label>
              <fieldset class="calendar-group-card__checks">
                <legend>연동 캘린더 설정</legend>
                <label><input data-edit-allow="study" type="checkbox" ${group.allow_study ? 'checked' : ''} /> 자기개발</label>
                <label><input data-edit-allow="work" type="checkbox" ${group.allow_work ? 'checked' : ''} /> 업무</label>
                <label><input data-edit-allow="event" type="checkbox" ${group.allow_event ? 'checked' : ''} /> 이벤트</label>
              </fieldset>
              <fieldset class="calendar-group-card__checks">
                <legend>공개 설정</legend>
                <label><input data-edit-private type="checkbox" ${isPrivate ? 'checked' : ''} /> 비공개</label>
                <label><input data-edit-hidden type="checkbox" ${group.is_hidden ? 'checked' : ''} /> 숨기기</label>
              </fieldset>
              <input data-edit-password type="password" placeholder="새 비밀번호" />
              <button type="button" data-action="save-edit">저장</button>
            </details>
          `
          : ''
      }
    </article>
  `;
}

function renderColorChoices(root) {
  if (!root) return;

  root.innerHTML = GROUP_COLORS.map(
    (color, index) => `
      <label class="calendar-group-color">
        <input type="radio" name="color" value="${color}" ${
          index === 0 ? 'checked' : ''
        } />
        <span style="--calendar-group-color:${color}"></span>
      </label>
    `,
  ).join('');
}

export async function initCalendarGroupsPage() {
  const page = document.getElementById('calendarGroupsPage');
  if (!page || page.dataset.calendarGroupsInitialized === 'true') return;
  page.dataset.calendarGroupsInitialized = 'true';

  const user = await getCurrentUser();
  if (!user?.id) {
    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message: '캘린더 그룹은 로그인 후 만들고 참여할 수 있어.',
      confirmText: '로그인하러 가기',
      cancelText: '닫기',
    });
    saveRedirect(window.location.pathname + window.location.search);
    window.location.href = loginHref();
    return;
  }

  const form = document.getElementById('calendarGroupForm');
  const createToggle = document.getElementById('calendarGroupCreateToggle');
  const createPanel = document.getElementById('calendarGroupCreatePanel');
  const myList = document.getElementById('calendarMyGroups');
  const visibleList = document.getElementById('calendarVisibleGroups');
  const hiddenList = document.getElementById('calendarHiddenGroups');
  const status = document.getElementById('calendarGroupsStatus');
  const colorRoot = document.getElementById('calendarGroupColors');
  const privateToggle = document.getElementById('calendarGroupPrivate');
  const passwordInput = document.getElementById('calendarGroupPassword');
  const hiddenToggle = document.getElementById('calendarGroupHiddenToggle');
  const hiddenShortcut = document.getElementById('calendarGroupHiddenShortcut');
  const createShortcut = document.getElementById('calendarGroupCreateShortcut');
  const hiddenPanel = document.getElementById('calendarHiddenGroupsPanel');
  const createSection = document.getElementById('calendarGroupCreateSection');
  const tabs = {
    mine: document.getElementById('calendar-groups-mine-tab'),
    discover: document.getElementById('calendar-groups-discover-tab'),
  };
  const panels = {
    mine: document.getElementById('calendar-groups-mine-panel'),
    discover: document.getElementById('calendar-groups-discover-panel'),
  };
  const mineCount = document.getElementById('calendar-groups-mine-count');
  const discoverCount = document.getElementById('calendar-groups-discover-count');
  const search = document.getElementById('calendar-groups-search');
  const joinNotice = document.getElementById('calendar-groups-join-notice');
  const joinNoticeMessage = document.getElementById('calendar-groups-join-notice-message');
  const joinNoticeOpen = document.getElementById('calendar-groups-join-notice-open');
  const joinNoticeClose = document.getElementById('calendar-groups-join-notice-close');
  const joinAnnouncement = document.getElementById('calendar-groups-join-announcement');
  const preferredType = new URLSearchParams(window.location.search).get('calendar');
  const state = {
    myGroups: [],
    joinableGroups: new Map(),
  };
  let activeTab = 'mine';
  let loadRevision = 0;

  renderColorChoices(colorRoot);

  function selectTab(name) {
    activeTab = name;
    for (const [key, tab] of Object.entries(tabs)) {
      const isSelected = key === name;
      tab?.setAttribute('aria-selected', String(isSelected));
      if (tab) tab.tabIndex = isSelected ? 0 : -1;
      if (panels[key]) panels[key].hidden = !isSelected;
    }
  }

  for (const [name, tab] of Object.entries(tabs)) {
    tab?.addEventListener('click', () => selectTab(name));
    tab?.addEventListener('keydown', (event) => {
      const destinations = { Home: 'mine', End: 'discover' };
      const otherTab = name === 'mine' ? 'discover' : 'mine';
      const next = ['ArrowLeft', 'ArrowRight'].includes(event.key) ? otherTab : destinations[event.key];
      if (!next) return;
      event.preventDefault();
      selectTab(next);
      tabs[next]?.focus();
    });
  }

  function updateSearch() {
    const query = normalizeGroupSearch(search?.value);
    const results = visibleList.querySelectorAll('[data-group-search]');
    let matches = 0;
    for (const card of results) {
      card.hidden = !card.dataset.groupSearch.includes(query);
      if (!card.hidden) matches += 1;
    }
    const searchEmpty = visibleList.querySelector('[data-group-search-empty]');
    if (searchEmpty) searchEmpty.hidden = matches > 0 || !query;
  }

  search?.addEventListener('input', updateSearch);

  function showJoinNotice(group) {
    const href = getGroupCalendarHref(group, preferredType);
    joinNotice.dataset.groupId = group.id;
    joinNoticeMessage.textContent = group.name;
    joinAnnouncement.textContent = `‘${group.name}’ 그룹에 참여했습니다.`;
    joinNoticeOpen.hidden = !href;
    if (href) joinNoticeOpen.setAttribute('href', href);
    else joinNoticeOpen.removeAttribute('href');
    joinNotice.hidden = false;
  }

  function dismissJoinNotice() {
    if (joinNotice.contains(document.activeElement)) tabs[activeTab]?.focus({ preventScroll: true });
    joinNotice.hidden = true;
    delete joinNotice.dataset.groupId;
    joinAnnouncement.textContent = '';
  }

  joinNoticeClose?.addEventListener('click', dismissJoinNotice);

  const backLink = page.querySelector('.calendar-groups-page__back');
  if (backLink) {
    if (isCalendarAppMode()) {
      backLink.setAttribute('href', getCalendarSelectHref());
    } else {
      backLink.removeAttribute('href');
      backLink.setAttribute('role', 'button');
      backLink.setAttribute('tabindex', '0');
      backLink.setAttribute('aria-haspopup', 'dialog');
      backLink.setAttribute('aria-controls', 'calendarManagePanel');

      const openCalendarManage = (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openCalendarManagePopupFromGroupPage();
      };

      backLink.addEventListener('click', openCalendarManage, {
        capture: true,
      });
      backLink.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        openCalendarManage(event);
      }, { capture: true });
    }
  }

  function setCreatePanelOpen(isOpen) {
    if (!createToggle || !createPanel) return;
    createPanel.hidden = !isOpen;
    createToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    createShortcut?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  createToggle?.addEventListener('click', () => {
    setCreatePanelOpen(Boolean(createPanel?.hidden));
  });

  createShortcut?.addEventListener('click', () => {
    selectTab('mine');
    setCreatePanelOpen(true);
    createSection?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  async function load() {
    const revision = ++loadRevision;
    const [myGroups, visibleGroups, hiddenGroups] = await Promise.all([
      rpc('get_my_calendar_groups'),
      rpc('get_visible_calendar_groups', { p_include_hidden: false }),
      rpc('get_visible_calendar_groups', { p_include_hidden: true }),
    ]);
    const memberEntries = await Promise.all(
      (myGroups || []).map(async (group) => {
        try {
          const members = await rpc('get_calendar_group_members', {
            p_group_id: group.id,
          });
          return [group.id, members || []];
        } catch (error) {
          console.error('[calendar-groups] members load failed:', error);
          return [group.id, []];
        }
      }),
    );
    if (revision !== loadRevision) return;
    state.myGroups = myGroups || [];
    const myGroupIds = new Set(state.myGroups.map((group) => group.id));
    const canJoin = (group) => !myGroupIds.has(group.id) && !group.role;
    const openGroups = (visibleGroups || []).filter((group) => !group.is_hidden && canJoin(group));
    const onlyHidden = (hiddenGroups || []).filter((group) => group.is_hidden && canJoin(group));
    state.joinableGroups = new Map([...openGroups, ...onlyHidden].map((group) => [group.id, group]));
    if (mineCount) mineCount.textContent = String(state.myGroups.length);
    if (discoverCount) discoverCount.textContent = String(openGroups.length);
    const membersByGroupId = Object.fromEntries(memberEntries);

    myList.innerHTML =
      state.myGroups.length > 0
        ? state.myGroups
            .map((group) =>
              createGroupCard(group, {
                myGroup: true,
                members: membersByGroupId[group.id] || [],
                preferredType,
              }),
            )
            .join('')
        : `<div class="calendar-groups-empty"><p>참여한 그룹이 없어요.</p>
             <button type="button" class="calendar-groups-panel__ghost" data-show-discover>참여할 그룹 찾기</button></div>`;

    visibleList.innerHTML =
      openGroups.length > 0
        ? openGroups.map((group) => createGroupCard(group)).join('') +
          '<p class="calendar-groups-empty" data-group-search-empty role="status" hidden>검색 결과가 없어요.</p>'
        : '<p class="calendar-groups-empty">참여 가능한 그룹이 없어요.</p>';
    updateSearch();

    hiddenList.innerHTML =
      onlyHidden.length > 0
        ? onlyHidden.map((group) => createGroupCard(group)).join('')
        : '<p class="calendar-groups-empty">참여할 수 있는 숨긴 그룹이 없어요. 내가 참여한 숨긴 그룹은 내 그룹에서 볼 수 있어요.</p>';
  }

  myList.addEventListener('click', (event) => {
    if (!event.target.closest('[data-show-discover]')) return;
    selectTab('discover');
    tabs.discover?.focus();
  });

  privateToggle?.addEventListener('change', () => {
    if (!passwordInput) return;
    passwordInput.disabled = !privateToggle.checked;
    passwordInput.required = privateToggle.checked;
  });
  privateToggle?.dispatchEvent(new Event('change'));

  function setHiddenGroupsOpen(isOpen) {
    if (!hiddenToggle || !hiddenList) return;
    hiddenList.hidden = !isOpen;
    hiddenToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    hiddenShortcut?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    hiddenToggle.textContent = isOpen ? '숨긴 그룹 접기' : '숨긴 그룹 보기';
  }

  hiddenToggle?.addEventListener('click', () => {
    setHiddenGroupsOpen(Boolean(hiddenList?.hidden));
  });

  hiddenShortcut?.addEventListener('click', () => {
    selectTab('discover');
    setHiddenGroupsOpen(true);
    hiddenPanel?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const description = normalizeGroupDescription(formData.get('description'));
    const color = String(formData.get('color') || '#f54260');
    const isPrivate = Boolean(formData.get('isPrivate'));
    const isHidden = Boolean(formData.get('isHidden'));
    const password = String(formData.get('password') || '');
    const flags = getCalendarTypeFlags(form);

    if (!name) {
      setStatus('그룹 이름을 입력해줘.');
      return;
    }

    if (!flags.allowStudy && !flags.allowWork && !flags.allowEvent) {
      setStatus('연동할 캘린더를 하나 이상 선택해줘.');
      return;
    }

    try {
      setStatus('그룹을 만드는 중...');
      await rpc('create_calendar_group', {
        p_name: name,
        p_description: description,
        p_color: color,
        p_allow_study: flags.allowStudy,
        p_allow_work: flags.allowWork,
        p_allow_event: flags.allowEvent,
        p_visibility: isPrivate ? 'private' : 'public',
        p_password: isPrivate ? password : null,
        p_is_hidden: isHidden,
      });

      form.reset();
      renderColorChoices(colorRoot);
      privateToggle?.dispatchEvent(new Event('change'));
      setCreatePanelOpen(false);
      setStatus('그룹을 만들었어.');
      scheduleCalendarWidgetRefresh();
      await load();
    } catch (error) {
      console.error('[calendar-groups] create failed:', error);
      setStatus('그룹 생성에 실패했어. 잠시 후 다시 시도해줘.');
    }
  });

  function setJoinError(joinForm, message, invalidPassword = false) {
    const error = joinForm.querySelector('[data-join-error]');
    const password = joinForm.querySelector('[data-password]');
    error.hidden = !message;
    error.textContent = message;
    if (invalidPassword) password?.setAttribute('aria-invalid', 'true');
    else password?.removeAttribute('aria-invalid');
  }

  page.addEventListener('input', (event) => {
    if (!event.target.matches('[data-password]')) return;
    const joinForm = event.target.closest('[data-join-group]');
    if (joinForm) setJoinError(joinForm, '');
  });

  page.addEventListener('submit', async (event) => {
    const joinForm = event.target;
    if (!joinForm.matches('[data-join-group]')) return;
    event.preventDefault();

    const group = state.joinableGroups.get(joinForm.closest('[data-group-id]')?.dataset.groupId);
    const button = joinForm.querySelector('[data-action="join"]');
    if (!group || button.disabled) return;

    const password = joinForm.querySelector('[data-password]');
    setJoinError(joinForm, '');
    button.disabled = true;
    button.textContent = '참여 중…';

    try {
      await rpc('join_calendar_group', {
        p_group_id: group.id,
        p_password: password?.value || null,
      });
    } catch (error) {
      const invalidPassword = Boolean(password && error?.message?.includes('비밀번호'));
      if (!invalidPassword) console.error('[calendar-groups] join failed:', error);
      const message = invalidPassword
        ? '비밀번호가 올바르지 않아요.'
        : '그룹에 참여하지 못했어요. 다시 시도해 주세요.';
      setJoinError(joinForm, message, invalidPassword);
      button.disabled = false;
      button.textContent = '그룹 참여';
      return;
    }

    if (password) password.value = '';
    button.textContent = '참여 완료';
    showJoinNotice(group);
    if (joinForm.contains(document.activeElement) || document.activeElement === document.body) {
      (joinNoticeOpen.hidden ? joinNoticeClose : joinNoticeOpen)?.focus({ preventScroll: true });
    }
    setStatus('');
    scheduleCalendarWidgetRefresh();
    try {
      await load();
    } catch (error) {
      console.error('[calendar-groups] refresh after join failed:', error);
      if (joinNotice.dataset.groupId === group.id) {
        joinNoticeMessage.textContent = `${group.name} · 새로고침하면 내 그룹에서 볼 수 있어요.`;
      }
    }
  });

  page.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const card = button.closest('[data-group-id]');
    const groupId = card?.dataset?.groupId || '';
    const action = button.dataset.action;
    if (!groupId || action === 'join') return;

    try {
      button.disabled = true;

      if (action === 'leave') {
        const group = state.myGroups.find((item) => item.id === groupId);
        if (group?.role === 'owner') {
          if (Number(group.member_count || 0) > 1) {
            setStatus('먼저 그룹장을 넘긴 뒤 나갈 수 있습니다.');
          } else {
            setStatus('그룹장은 바로 나갈 수 없습니다. 그룹을 삭제해 주세요.');
          }
          return;
        }

        await rpc('leave_calendar_group', { p_group_id: groupId });
        if (getSelectedGroupId() === groupId) setSelectedGroupId('');
        if (joinNotice.dataset.groupId === groupId) dismissJoinNotice();
        setStatus('그룹에서 나왔어.');
      }

      if (action === 'transfer-owner') {
        const panel = card.querySelector('[data-transfer-panel]');
        if (!panel) return;
        const willShow = panel.hidden;
        panel.hidden = !willShow;
        if (willShow && !card.querySelector('[data-transfer-user]')) {
          setStatus('넘겨줄 참여자가 없습니다. 그룹을 삭제할 수 있습니다.');
        }
        return;
      }

      if (action === 'cancel-transfer-owner') {
        const panel = card.querySelector('[data-transfer-panel]');
        if (panel) panel.hidden = true;
        return;
      }

      if (action === 'confirm-transfer-owner') {
        const targetUserId = card.querySelector('[data-transfer-user]')?.value || '';
        if (!targetUserId) {
          setStatus('그룹장을 넘길 참여자를 선택해줘.');
          return;
        }
        if (!window.confirm('선택한 참여자에게 그룹장을 넘길까요?')) return;

        await rpc('calendar_transfer_group_owner', {
          p_group_id: groupId,
          p_new_owner_id: targetUserId,
        });
        setStatus('그룹장을 넘겼어. 이제 일반 멤버로 나갈 수 있어.');
      }

      if (action === 'delete-group') {
        const groupName =
          card.querySelector('.calendar-group-card__title')?.textContent?.trim() ||
          '이 그룹';
        if (!window.confirm(`${groupName} 그룹을 삭제할까요? 참여자와 공유 일정도 함께 정리됩니다.`)) {
          return;
        }

        await rpc('calendar_delete_group', { p_group_id: groupId });
        if (getSelectedGroupId() === groupId) setSelectedGroupId('');
        if (joinNotice.dataset.groupId === groupId) dismissJoinNotice();
        setStatus('그룹을 삭제했어.');
      }

      if (action === 'kick-member') {
        const targetUserId = button.dataset.targetUserId || '';
        const nickname = button.dataset.targetNickname || '회원';
        if (!targetUserId) return;
        if (!window.confirm(`${nickname} 님을 이 그룹에서 강퇴할까요?`)) return;

        await rpc('kick_calendar_group_member', {
          p_group_id: groupId,
          p_target_user_id: targetUserId,
        });
        setStatus('참여자를 강퇴했어.');
      }

      if (action === 'toggle-hidden') {
        const isHidden = button.textContent.trim() === '숨기기';
        await rpc('set_calendar_group_hidden', {
          p_group_id: groupId,
          p_is_hidden: isHidden,
        });
        setStatus(isHidden ? '그룹을 숨겼어.' : '그룹을 다시 표시했어.');
      }

      if (action === 'save-edit') {
        const name = String(card.querySelector('[data-edit-name]')?.value || '').trim();
        const description = normalizeGroupDescription(
          card.querySelector('[data-edit-description]')?.value,
        );
        const color = card.querySelector('[data-edit-color]')?.value || '#f54260';
        const allowStudy = Boolean(
          card.querySelector('[data-edit-allow="study"]')?.checked,
        );
        const allowWork = Boolean(
          card.querySelector('[data-edit-allow="work"]')?.checked,
        );
        const allowEvent = Boolean(
          card.querySelector('[data-edit-allow="event"]')?.checked,
        );
        const isPrivate = Boolean(card.querySelector('[data-edit-private]')?.checked);
        const isHidden = Boolean(card.querySelector('[data-edit-hidden]')?.checked);
        const password = card.querySelector('[data-edit-password]')?.value || null;

        await rpc('update_calendar_group', {
          p_group_id: groupId,
          p_name: name,
          p_description: description,
          p_color: color,
          p_allow_study: allowStudy,
          p_allow_work: allowWork,
          p_allow_event: allowEvent,
          p_visibility: isPrivate ? 'private' : 'public',
          p_password: password,
          p_is_hidden: isHidden,
        });
        setStatus('그룹 설정을 저장했어.');
      }

      scheduleCalendarWidgetRefresh();
      await load();
    } catch (error) {
      console.error('[calendar-groups] action failed:', error);
      setStatus('작업에 실패했어. 잠시 후 다시 시도해줘.');
    } finally {
      button.disabled = false;
    }
  });

  try {
    await load();
    setStatus('');
  } catch (error) {
    console.error('[calendar-groups] load failed:', error);
    setStatus('그룹 목록을 불러오지 못했어요. 새로고침해서 다시 시도해 주세요.');
  }
}
