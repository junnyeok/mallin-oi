// assets/js/modules/calendar-groups.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';
import { isCalendarAppMode } from './app-calendar-mode.js';
import { CALENDAR_MODES, commonGroupCalendarHasChanges, fetchCommonGroupEvents, getCalendarMode, isCommonCalendarGroup, publishCommonGroupCalendar } from './calendar-common-group.js';

const SELECTED_GROUP_KEY = 'mallin:calendar:selected-group';
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
const BACKUP_BOOLEAN_PAYLOAD_KEYS = new Set(['isDone', 'is_shared_copy']);
const BACKUP_SOURCE_CONFIG = {
  study: {
    table: 'study_calendar_todos',
    categoryRelation: 'study_calendar_categories',
    select: `
      id, todo_date, todo_type, todo_text, memo, is_done, shared_group_id,
      shared_origin_todo_id, shared_origin_user_id, shared_created_by, is_shared_copy,
      study_calendar_categories (name, slug, color)
    `,
  },
  work: {
    table: 'work_calendar_todos',
    categoryRelation: 'work_calendar_categories',
    select: `
      id, work_date, work_type, work_text, memo, is_done, shared_group_id,
      shared_origin_todo_id, shared_origin_user_id, shared_created_by, is_shared_copy,
      work_calendar_categories (name, slug, color)
    `,
  },
  event: {
    table: 'event_calendar_todos',
    categoryRelation: 'event_calendar_categories',
    select: `
      id, event_date, event_type, event_text, memo, event_time, event_end_time, is_done,
      shared_group_id, shared_origin_todo_id, shared_origin_user_id,
      shared_created_by, is_shared_copy,
      event_calendar_categories (name, slug, color)
    `,
  },
};

function normalizeColor(color, fallback = '#f54260') {
  const value = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function getTextColor(bgColor) {
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
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
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

function makeAppHref(path) {
  return isCalendarAppMode() ? `${path}?app=calendar` : path;
}

function getCalendarSelectHref() {
  return isCalendarAppMode()
    ? './app-calendar.html?app=calendar'
    : './calendar-study.html';
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

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

function getRelatedCategory(row, relation) {
  const category = row?.[relation];
  return Array.isArray(category) ? category[0] || null : category || null;
}

function normalizeBackupPayload(payload = {}) {
  return Object.keys(payload)
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

function makeBackupComparable(event) {
  return {
    sourceEventId: String(event.sourceEventId || ''),
    eventDate: String(event.eventDate || '').slice(0, 10),
    eventType: String(event.eventType || ''),
    title: String(event.title || ''),
    memo: String(event.memo || ''),
    color: event.color || null,
    payload: normalizeBackupPayload(event.payload),
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
        shared_group_id: row.shared_group_id || null,
        shared_origin_todo_id: row.shared_origin_todo_id || null,
        shared_origin_user_id: row.shared_origin_user_id || null,
        shared_created_by: row.shared_created_by || null,
        is_shared_copy: Boolean(row.is_shared_copy),
      },
    });
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
        shared_group_id: row.shared_group_id || null,
        shared_origin_todo_id: row.shared_origin_todo_id || null,
        shared_origin_user_id: row.shared_origin_user_id || null,
        shared_created_by: row.shared_created_by || null,
        is_shared_copy: Boolean(row.is_shared_copy),
      },
    });
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
      categoryName: category?.name || null,
      shared_group_id: row.shared_group_id || null,
      shared_origin_todo_id: row.shared_origin_todo_id || null,
      shared_origin_user_id: row.shared_origin_user_id || null,
      shared_created_by: row.shared_created_by || null,
      is_shared_copy: Boolean(row.is_shared_copy),
    },
  });
}

function makeStoredBackupEvent(row) {
  return makeBackupComparable({
    sourceEventId: row.source_event_id,
    eventDate: row.event_date,
    eventType: row.event_type,
    title: row.title,
    memo: row.memo,
    color: row.color,
    payload: row.payload || {},
  });
}

function serializeBackupEvents(events = []) {
  return JSON.stringify(
    [...events].sort((a, b) =>
      a.sourceEventId.localeCompare(b.sourceEventId),
    ),
  );
}

async function checkBackupNeeded({ userId, groupId, calendarType }) {
  const config = BACKUP_SOURCE_CONFIG[calendarType];
  if (!config || !userId || !groupId) return false;

  const [sourceResult, backupResult] = await Promise.all([
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
  ]);

  if (sourceResult.error) throw sourceResult.error;
  if (backupResult.error) throw backupResult.error;

  const sourceEvents = (sourceResult.data || [])
    .filter(
      (row) =>
        !row.is_shared_copy &&
        (!row.shared_group_id || row.shared_group_id === groupId),
    )
    .map((row) => makeSourceBackupEvent(row, calendarType));
  const backupEvents = (backupResult.data || []).map(makeStoredBackupEvent);

  return serializeBackupEvents(sourceEvents) !== serializeBackupEvents(backupEvents);
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

    if (item?.dateKey === selectedDateKey) {
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

    if (!hasSharedEvents && members.length === 0) return;

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
      if (!item?.isCurrentMonth) {
        head.classList.add('is-muted');
      }
      head.textContent = `${item?.weekday || ''} ${item?.dateNumber || ''}`.trim();
      header.append(head);
    });

    weekEl.append(header);

    if (hasSharedEvents) {
      appendScheduleRow({
        weekEl,
        week,
        rowMember: { name: '우리 일정' },
        groupState,
        selectedDateKey: options.selectedDateKey,
        onSelect: options.onSelect,
        onSelectEvent: options.onSelectEvent,
        getEvents: (dateKey) => sharedEventsByDate.get(dateKey) || [],
        isShared: true,
      });
    }

    members.forEach((member) => {
      appendScheduleRow({
        weekEl,
        week,
        rowMember: member,
        groupState,
        selectedDateKey: options.selectedDateKey,
        onSelect: options.onSelect,
        onSelectEvent: options.onSelectEvent,
        getEvents: (dateKey) =>
          personalEventsByDateAndUser.get(`${dateKey}|${member.userId}`) || [],
      });
    });

    wrap.append(weekEl);
  });

  if (wrap.children.length === 0) return;
  root.append(wrap);
}

export async function initCalendarGroupBar({
  calendarType,
  pageRoot,
  getViewDate,
  renderAll,
  onModeChange,
}) {
  if (!pageRoot || !CALENDAR_LABELS[calendarType]) return null;

  const user = await getCurrentUser();
  if (!user?.id) return null;

  const head = pageRoot.querySelector('[class$="-calendar-page__head"]');
  const state = {
    userId: user.id,
    calendarType,
    selectedGroup: null,
    groups: [],
    eventsByDate: {},
    lastBackupAt: '',
    backupNeeded: false,
    backupChecking: false,
    backupCheckId: 0,
    backupStatus: BACKUP_STATUS.IDLE,
    mode: CALENDAR_MODES.PERSONAL,
  };

  const bar = document.createElement('section');
  bar.className = 'calendar-group-bar';
  bar.setAttribute('aria-label', '캘린더 그룹 연동');
  const panelId = `${calendarType}CalendarGroupPanel`;
  bar.innerHTML = `
    <button
      class="calendar-group-bar__toggle"
      type="button"
      aria-expanded="false"
      aria-controls="${panelId}"
    >
      그룹
    </button>
    <div class="calendar-group-bar__panel" id="${panelId}" hidden>
    <div class="calendar-group-bar__main">
      <label class="calendar-group-bar__field">
        <span>그룹</span>
        <select class="calendar-group-bar__select" aria-label="연동 그룹 선택">
          <option value="">그룹 연동 OFF</option>
        </select>
      </label>
      <a class="calendar-group-bar__manage" href="${makeAppHref('./calendar-groups.html')}">그룹 관리</a>
      <button class="calendar-group-bar__backup" type="button">백업</button>
      <button class="calendar-group-bar__close" type="button">닫기</button>
    </div>
    <div class="calendar-group-bar__status" aria-live="polite">
      <span class="calendar-group-bar__status-main">그룹 일정을 함께 보려면 그룹을 선택해줘.</span>
      <span class="calendar-group-bar__status-guide" hidden></span>
    </div>
    </div>
  `;

  if (head) {
    head.append(bar);
  } else {
    pageRoot.prepend(bar);
  }

  const select = bar.querySelector('.calendar-group-bar__select');
  const backupButton = bar.querySelector('.calendar-group-bar__backup');
  const status = bar.querySelector('.calendar-group-bar__status-main');
  const statusGuide = bar.querySelector('.calendar-group-bar__status-guide');
  const toggleButton = bar.querySelector('.calendar-group-bar__toggle');
  const closeButton = bar.querySelector('.calendar-group-bar__close');
  const panel = bar.querySelector('.calendar-group-bar__panel');

  function setGroupPanelOpen(isOpen) {
    if (!panel || !toggleButton) return;
    panel.hidden = !isOpen;
    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  toggleButton?.addEventListener('click', () => {
    setGroupPanelOpen(Boolean(panel?.hidden));
  });

  closeButton?.addEventListener('click', () => {
    setGroupPanelOpen(false);
  });

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function setCommonGuide(group = state.selectedGroup) {
    if (!statusGuide) return;
    const isCommon = isCommonCalendarGroup(group);
    statusGuide.hidden = !isCommon;
    statusGuide.textContent = !isCommon
      ? ''
      : group?.role === 'owner'
        ? '그룹장이 일정을 관리하고 백업으로 공유 상태를 확인해요.'
        : '그룹장만 공통 캘린더를 수정할 수 있어요.';
  }

  function updateBackupButtonState() {
    const isCommon = isCommonCalendarGroup(state.selectedGroup);
    const commonOwner = isCommon && state.selectedGroup?.role === 'owner';
    if (isCommon) {
      backupButton.hidden = !commonOwner;
      const isChecking = state.backupStatus === BACKUP_STATUS.CHECKING;
      const isRunning = state.backupStatus === BACKUP_STATUS.RUNNING;
      const canBackup = commonOwner && state.backupNeeded && !isChecking && !isRunning;
      const label = isRunning ? '백업 중' : isChecking ? '백업 상태 확인 중' : canBackup ? '백업 필요: 공통 캘린더 공개' : '백업할 변경사항 없음';
      backupButton.disabled = !canBackup;
      backupButton.classList.toggle('is-backup-needed', canBackup);
      backupButton.dataset.backupNeeded = canBackup ? 'true' : 'false';
      backupButton.dataset.backupStatus = state.backupStatus;
      backupButton.setAttribute('aria-disabled', canBackup ? 'false' : 'true');
      backupButton.setAttribute('aria-label', label);
      backupButton.title = label;
      return;
    }
    backupButton.hidden = false;
    const isActive = isCalendarGroupActive(state);
    const isChecking = state.backupStatus === BACKUP_STATUS.CHECKING;
    const isRunning = state.backupStatus === BACKUP_STATUS.RUNNING;
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
              : '백업할 변경사항 없음';

    backupButton.disabled = !canBackup;
    backupButton.classList.toggle('is-backup-needed', isHighlighted);
    backupButton.dataset.backupNeeded = isHighlighted ? 'true' : 'false';
    backupButton.dataset.backupStatus = state.backupStatus;
    backupButton.setAttribute('aria-disabled', canBackup ? 'false' : 'true');
    backupButton.setAttribute('aria-label', label);
    backupButton.title = label;
  }

  function setBackupNeeded(isNeeded) {
    const commonOwner = isCommonCalendarGroup(state.selectedGroup) && state.selectedGroup?.role === 'owner';
    state.backupNeeded = Boolean(isNeeded && (isCalendarGroupActive(state) || commonOwner));
    state.backupStatus = state.backupNeeded
      ? BACKUP_STATUS.PENDING
      : BACKUP_STATUS.IDLE;
    updateBackupButtonState();
  }

  async function refreshBackupNeeded() {
    const checkId = ++state.backupCheckId;
    const groupId = state.selectedGroup?.id || '';

    const commonOwner = isCommonCalendarGroup(state.selectedGroup) && state.selectedGroup?.role === 'owner';
    if (!isCalendarGroupActive(state) && !commonOwner) {
      state.backupChecking = false;
      setBackupNeeded(false);
      return false;
    }

    state.backupChecking = true;
    state.backupStatus = BACKUP_STATUS.CHECKING;
    updateBackupButtonState();

    try {
      const isNeeded = commonOwner
        ? await commonGroupCalendarHasChanges(groupId, calendarType)
        : await checkBackupNeeded({ userId: state.userId, groupId, calendarType });

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

    state.groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.append(option);
    });

    select.value = selectedId;
    updateBackupButtonState();
  }

  async function loadGroupEvents() {
    state.eventsByDate = {};
    state.mode = getCalendarMode(state.selectedGroup);

    if (!state.selectedGroup?.id) {
      setCommonGuide(null);
      setStatus('그룹 연동 OFF 상태야.');
      state.backupChecking = false;
      setBackupNeeded(false);
      await onModeChange?.({ group: null, rows: [], mode: CALENDAR_MODES.PERSONAL });
      renderAll?.();
      return;
    }

    setCommonGuide(state.selectedGroup);

    if (!isAllowed(state.selectedGroup, calendarType)) {
      if (state.mode === CALENDAR_MODES.COMMON_GROUP) {
        await onModeChange?.({ group: state.selectedGroup, rows: [], mode: CALENDAR_MODES.COMMON_GROUP });
      }
      setStatus(`이 그룹은 ${CALENDAR_LABELS[calendarType]} 캘린더 연동이 꺼져 있어.`);
      state.backupChecking = false;
      setBackupNeeded(false);
      renderAll?.();
      return;
    }

    if (isCommonCalendarGroup(state.selectedGroup)) {
      state.eventsByDate = {};
      state.backupChecking = false;
      setStatus('공통 캘린더 일정을 불러오는 중...');
      await onModeChange?.({ group: state.selectedGroup, rows: [], mode: CALENDAR_MODES.COMMON_GROUP });
      renderAll?.();
      const rows = await fetchCommonGroupEvents(state.selectedGroup.id, calendarType);
      await onModeChange?.({ group: state.selectedGroup, rows, mode: CALENDAR_MODES.COMMON_GROUP });
      await refreshBackupNeeded();
      setStatus(`${state.selectedGroup.name} · ${CALENDAR_LABELS[calendarType]} 공통 캘린더 표시 중`);
      updateBackupButtonState();
      renderAll?.();
      return;
    }

    setCommonGuide(null);
    await onModeChange?.({ group: state.selectedGroup, rows: [], mode: CALENDAR_MODES.SHARED_GROUP });

    const { startDate, endDate } = getMonthRange(getViewDate());
    state.backupCheckId += 1;
    state.backupChecking = false;
    setBackupNeeded(false);
    setStatus('그룹 일정을 불러오는 중...');

    const rows = await rpc('get_group_calendar_view', {
      p_group_id: state.selectedGroup.id,
      p_calendar_type: calendarType,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    state.eventsByDate = groupEventsByDateAndUser(rows || []);
    await refreshBackupNeeded();
    setStatus(
      `${state.selectedGroup.name} · ${CALENDAR_LABELS[calendarType]} 그룹 일정 표시 중`,
    );
    renderAll?.();
  }

  async function loadGroups() {
    const groups = await rpc('get_my_calendar_groups');
    const groupIds = (groups || []).map((group) => group.id).filter(Boolean);
    let modeByGroupId = new Map();
    if (groupIds.length > 0) {
      const { data: modeRows, error: modeError } = await supabase
        .from('calendar_groups')
        .select('id, is_common_calendar')
        .in('id', groupIds);
      if (modeError) {
        console.warn('[calendar-groups] group mode enrichment failed:', modeError.message);
      } else {
        modeByGroupId = new Map(
          (modeRows || []).map((row) => [row.id, isCommonCalendarGroup(row)]),
        );
      }
    }
    state.groups = (groups || []).map((group) => ({
      ...group,
      is_common_calendar: modeByGroupId.has(group.id)
        ? modeByGroupId.get(group.id)
        : isCommonCalendarGroup(group),
    }));
    const selectedId = getSelectedGroupId();
    state.selectedGroup =
      state.groups.find((group) => group.id === selectedId) || null;

    renderSelect();
    await loadGroupEvents();
  }

  select.addEventListener('change', async () => {
    const groupId = select.value;
    state.selectedGroup = state.groups.find((group) => group.id === groupId) || null;
    setSelectedGroupId(groupId);
    state.backupCheckId += 1;
    state.backupChecking = false;
    setBackupNeeded(false);
    renderSelect();

    try {
      await loadGroupEvents();
    } catch (error) {
      console.error('[calendar-groups] load group events failed:', error);
      setStatus('그룹 일정을 불러오지 못했어. SQL 적용 여부를 확인해줘.');
    }
  });

  backupButton.addEventListener('click', async () => {
    if (isCommonCalendarGroup(state.selectedGroup)) {
      if (state.selectedGroup.role !== 'owner' || !state.backupNeeded || backupButton.disabled) return;
      state.backupStatus = BACKUP_STATUS.RUNNING;
      updateBackupButtonState();
      backupButton.textContent = '백업 중';
      setStatus('공통 캘린더 변경사항을 공개하는 중...');
      try {
        const result = await publishCommonGroupCalendar(state.selectedGroup.id, calendarType);
        state.backupNeeded = false;
        state.backupStatus = BACKUP_STATUS.IDLE;
        await loadGroupEvents();
        setStatus(`공통 캘린더 백업 완료 · ${Number(result.event_count || 0)}개 일정 공개`);
      } catch (error) {
        console.error('[calendar-groups] common calendar publish failed:', error);
        state.backupStatus = BACKUP_STATUS.PENDING;
        setStatus('공통 캘린더 백업에 실패했어. SQL 적용 여부를 확인해줘.');
      } finally {
        backupButton.textContent = '백업';
        updateBackupButtonState();
      }
      return;
    }
    if (
      !isCalendarGroupActive(state) ||
      !state.backupNeeded ||
      state.backupChecking ||
      backupButton.disabled
    ) {
      return;
    }

    let backupSucceeded = false;
    state.backupCheckId += 1;
    state.backupChecking = true;
    state.backupStatus = BACKUP_STATUS.RUNNING;
    updateBackupButtonState();
    backupButton.textContent = '백업 중';
    setStatus('내 일정을 그룹 공유 데이터로 백업하는 중...');

    try {
      const result = await rpc('backup_my_calendar_to_group', {
        p_group_id: state.selectedGroup.id,
        p_calendar_type: calendarType,
      });

      const backedUpAt = result?.[0]?.backed_up_at || new Date().toISOString();
      const count = Number(result?.[0]?.event_count || 0);
      state.lastBackupAt = backedUpAt;
      backupSucceeded = true;
      state.backupChecking = false;
      setBackupNeeded(false);
      setStatus(
        `${CALENDAR_LABELS[calendarType]} ${count}개 백업 완료 · ${new Date(
          backedUpAt,
        ).toLocaleString('ko-KR')}`,
      );
      await loadGroupEvents();
    } catch (error) {
      console.error('[calendar-groups] backup failed:', error);
      setStatus('백업에 실패했어. 그룹 권한과 SQL 적용 여부를 확인해줘.');
    } finally {
      backupButton.textContent = '백업';
      renderSelect();
      if (!backupSucceeded) await refreshBackupNeeded();
    }
  });

  try {
    await loadGroups();
  } catch (error) {
    console.error('[calendar-groups] init bar failed:', error);
    setStatus('그룹 기능을 불러오지 못했어. Supabase SQL 적용이 필요해.');
  }

  return {
    state,
    refresh: loadGroupEvents,
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

function createGroupCard(group, { myGroup = false, members = [] } = {}) {
  const isPrivate = group.visibility === 'private';
  const color = normalizeColor(group.color);
  const isOwner = group.role === 'owner';
  const transferTargets = members.filter((member) => !member.is_owner);
  const description = normalizeGroupDescription(group.description);
  const calendars = ['study', 'work', 'event']
    .filter((type) => group[`allow_${type}`])
    .map((type) => CALENDAR_LABELS[type])
    .join(', ');

  return `
    <article class="calendar-group-card" data-group-id="${escapeHtml(group.id)}">
      <div class="calendar-group-card__head">
        <span class="calendar-group-card__dot" style="--calendar-group-color:${color}"></span>
        <div>
          <h3 class="calendar-group-card__title">${escapeHtml(group.name)}</h3>
          ${
            description
              ? `<p class="calendar-group-card__description">${escapeHtml(description)}</p>`
              : ''
          }
          <p class="calendar-group-card__meta">${isPrivate ? '비공개' : '공개'} · ${
            calendars || '연동 꺼짐'
          }${group.is_common_calendar ? ' · 공통 그룹 캘린더' : ''}</p>
        </div>
      </div>
      <div class="calendar-group-card__actions">
        ${
          myGroup
            ? `<button type="button" data-action="leave">나가기</button>
              ${
                isOwner
                  ? `<button type="button" data-action="transfer-owner">그룹장 넘기기</button>
                    <button type="button" data-action="delete-group" class="calendar-group-card__danger">그룹 삭제</button>`
                  : ''
              }`
            : `<input type="password" data-password placeholder="비밀번호" ${
                isPrivate ? '' : 'hidden'
              } /><button type="button" data-action="join">참여</button>`
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
            <div class="calendar-group-card__members">
              <h4 class="calendar-group-card__section-title">참여자</h4>
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
              <label><input data-edit-common type="checkbox" ${group.is_common_calendar ? 'checked' : ''} /> 공통 그룹 캘린더</label>
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
  if (!page) return;

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
  const state = {
    myGroups: [],
  };

  renderColorChoices(colorRoot);

  const backLink = page.querySelector('.calendar-groups-page__back');
  if (backLink) {
    backLink.setAttribute('href', getCalendarSelectHref());
  }

  function setCreatePanelOpen(isOpen) {
    if (!createToggle || !createPanel) return;
    createPanel.hidden = !isOpen;
    createToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  createToggle?.addEventListener('click', () => {
    setCreatePanelOpen(Boolean(createPanel?.hidden));
  });

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  async function load() {
    const [myGroups, visibleGroups, hiddenGroups] = await Promise.all([
      rpc('get_my_calendar_groups'),
      rpc('get_visible_calendar_groups', { p_include_hidden: false }),
      rpc('get_visible_calendar_groups', { p_include_hidden: true }),
    ]);
    state.myGroups = myGroups || [];
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
    const membersByGroupId = Object.fromEntries(memberEntries);

    myList.innerHTML =
      myGroups?.length > 0
        ? myGroups
            .map((group) =>
              createGroupCard(group, {
                myGroup: true,
                members: membersByGroupId[group.id] || [],
              }),
            )
            .join('')
        : '<p class="calendar-groups-empty">아직 들어간 그룹이 없어.</p>';

    visibleList.innerHTML =
      visibleGroups?.length > 0
        ? visibleGroups.map((group) => createGroupCard(group)).join('')
        : '<p class="calendar-groups-empty">참여 가능한 그룹이 없어.</p>';

    const onlyHidden = (hiddenGroups || []).filter((group) => group.is_hidden);
    hiddenList.innerHTML =
      onlyHidden.length > 0
        ? onlyHidden.map((group) => createGroupCard(group)).join('')
        : '<p class="calendar-groups-empty">숨긴 그룹이 없어.</p>';
  }

  privateToggle?.addEventListener('change', () => {
    if (!passwordInput) return;
    passwordInput.disabled = !privateToggle.checked;
    passwordInput.required = privateToggle.checked;
  });
  privateToggle?.dispatchEvent(new Event('change'));

  hiddenToggle?.addEventListener('click', () => {
    const willShow = hiddenList.hidden;
    hiddenList.hidden = !willShow;
    hiddenToggle.setAttribute('aria-expanded', willShow ? 'true' : 'false');
    hiddenToggle.textContent = willShow ? '숨긴 그룹 접기' : '숨긴 그룹 보기';
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const description = normalizeGroupDescription(formData.get('description'));
    const color = String(formData.get('color') || '#f54260');
    const isPrivate = Boolean(formData.get('isPrivate'));
    const isHidden = Boolean(formData.get('isHidden'));
    const isCommonCalendar = Boolean(formData.get('isCommonCalendar'));
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
        p_is_common_calendar: isCommonCalendar,
      });

      form.reset();
      renderColorChoices(colorRoot);
      privateToggle?.dispatchEvent(new Event('change'));
      setCreatePanelOpen(false);
      setStatus('그룹을 만들었어.');
      await load();
    } catch (error) {
      console.error('[calendar-groups] create failed:', error);
      setStatus(error.message || '그룹 생성에 실패했어.');
    }
  });

  page.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const card = button.closest('[data-group-id]');
    const groupId = card?.dataset?.groupId || '';
    const action = button.dataset.action;
    if (!groupId) return;

    try {
      button.disabled = true;

      if (action === 'join') {
        const password = card.querySelector('[data-password]')?.value || null;
        await rpc('join_calendar_group', {
          p_group_id: groupId,
          p_password: password,
        });
        setStatus('그룹에 참여했어.');
      }

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
        const isCommonCalendar = Boolean(card.querySelector('[data-edit-common]')?.checked);

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
          p_is_common_calendar: isCommonCalendar,
        });
        setStatus('그룹 설정을 저장했어.');
      }

      await load();
    } catch (error) {
      console.error('[calendar-groups] action failed:', error);
      setStatus(error.message || '작업에 실패했어.');
    } finally {
      button.disabled = false;
    }
  });

  try {
    await load();
    setStatus('그룹 목록을 불러왔어.');
  } catch (error) {
    console.error('[calendar-groups] load failed:', error);
    setStatus('그룹 목록을 불러오지 못했어. Supabase SQL을 먼저 적용해줘.');
  }
}
