import { openCalendarDetailSheet } from './calendar-entry-sheet.js';
import {
  formatCalendarTimeLabel,
  normalizeCalendarTime,
} from './calendar-time.js';

const CALENDAR_SCHEDULE_SOURCE_LABELS = {
  member: '그룹원 일정',
  own: '내 일정',
  group: '우리 일정',
};

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

function formatReadonlyTime(value) {
  return formatCalendarTimeLabel(normalizeCalendarTime(value));
}

function normalizeReadonlyBoolean(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function formatCalendarScheduleListTime({
  calendarType = '',
  startTime = '',
  endTime = '',
  date = '',
  endDate = '',
  endsNextDay = false,
  isAllDay = false,
} = {}) {
  if (isAllDay) return '종일';

  const normalizedStartTime = normalizeCalendarTime(startTime);
  const normalizedEndTime = normalizeCalendarTime(endTime);
  if (!normalizedStartTime) return '시간 미지정';

  const startLabel = formatCalendarTimeLabel(normalizedStartTime);
  if (!normalizedEndTime) return startLabel;

  const isNextDay = Boolean(
    endsNextDay || (date && endDate && endDate > date),
  );
  const endLabel = formatCalendarTimeLabel(normalizedEndTime);

  if (!isNextDay) return `${startLabel} ~ ${endLabel}`;
  if (calendarType === 'work') return `${startLabel} ~ ${endLabel} (익일)`;
  return `${startLabel} ~ 다음 날 ${endLabel}`;
}

function getScheduleSourceValue(value, ...keys) {
  for (const key of keys) {
    const directValue = value?.[key];
    if (directValue !== undefined && directValue !== null && directValue !== '') {
      return directValue;
    }
  }
  return '';
}

function hasScheduleSourceMarker(value, ...keys) {
  return keys.some((key) => {
    const marker = value?.[key];
    if (marker === true || marker === 1 || marker === '1') return true;
    if (typeof marker !== 'string') return false;

    const normalizedMarker = marker.trim().toLowerCase();
    return Boolean(
      normalizedMarker &&
        normalizedMarker !== 'false' &&
        normalizedMarker !== '0',
    );
  });
}

export function getEditableCalendarScheduleSource({
  todo,
  category,
  groupActive = false,
  selectedGroupId = '',
} = {}) {
  if (!groupActive) return '';

  const safeSelectedGroupId = String(selectedGroupId || '').trim();
  const todoGroupId = String(
    getScheduleSourceValue(todo, 'sharedGroupId', 'shared_group_id'),
  ).trim();
  const categoryGroupId = String(
    getScheduleSourceValue(category, 'sharedGroupId', 'shared_group_id'),
  ).trim();
  const hasSharedMarker = Boolean(
    todoGroupId ||
      categoryGroupId ||
      hasScheduleSourceMarker(
        todo,
        'sharedOriginTodoId',
        'shared_origin_todo_id',
        'sharedOriginUserId',
        'shared_origin_user_id',
        'sharedCreatedBy',
        'shared_created_by',
        'isSharedCopy',
        'is_shared_copy',
      ) ||
      hasScheduleSourceMarker(
        category,
        'is_shared_personal',
        'isSharedPersonal',
        'is_shared_copy_category',
        'isSharedCopyCategory',
      ),
  );
  const belongsToSelectedGroup = Boolean(
    safeSelectedGroupId &&
      [todoGroupId, categoryGroupId]
        .filter(Boolean)
        .includes(safeSelectedGroupId),
  );

  return hasSharedMarker && belongsToSelectedGroup ? 'group' : 'own';
}

export function isReadonlySharedPersonalDetail(value, currentUserId = '') {
  if (!value) return false;
  if (value.readonly || value.isSharedPersonal || value.isOtherUserPersonal) {
    return true;
  }

  const ownerUserId = String(
    value.ownerUserId || value.userId || value.user_id || '',
  ).trim();
  const safeCurrentUserId = String(currentUserId || '').trim();
  return Boolean(
    ownerUserId && safeCurrentUserId && ownerUserId !== safeCurrentUserId,
  );
}

export function normalizeSharedPersonalDetail(
  event,
  {
    calendarType,
    currentUserId,
    ownerName,
    groupId,
  } = {},
) {
  if (!event) return null;

  const ownerUserId = String(event.user_id || event.userId || '').trim();
  const safeCalendarType = calendarType || event.calendar_type || '';
  const rawTitle = String(
    event.title || event.text || event.event_type || '일정',
  ).trim();
  const workText = String(
    getEventValue(event, 'workText', 'work_text') || '',
  ).trim();
  const categoryName = String(
    getEventValue(event, 'categoryName', 'category_name') ||
      (safeCalendarType === 'work' ? rawTitle : event.event_type) ||
      '기타',
  ).trim();

  const date = String(
    event.event_date || event.date || event.todo_date || event.work_date || '',
  ).slice(0, 10);
  const rawEventTime = getEventValue(
    event,
    'event_time',
    'eventTime',
    'start_time',
    'startTime',
    'todo_time',
    'todoTime',
    'categoryStartTime',
    'time',
  );
  const rawEventEndTime = getEventValue(
    event,
    'event_end_time',
    'eventEndTime',
    'end_time',
    'endTime',
    'todo_end_time',
    'todoEndTime',
    'categoryEndTime',
  );
  const eventTime = formatReadonlyTime(rawEventTime);
  const eventEndTime = formatReadonlyTime(rawEventEndTime);
  const eventEndDate = String(
    getEventValue(event, 'event_end_date', 'eventEndDate', 'todoEndDate') || '',
  ).slice(0, 10);
  const endsNextDay = normalizeReadonlyBoolean(
    getEventValue(
      event,
      'ends_next_day',
      'endsNextDay',
      'categoryEndsNextDay',
    ),
  );
  const isAllDay = normalizeReadonlyBoolean(
    getEventValue(event, 'is_all_day', 'isAllDay', 'all_day', 'allDay'),
  );
  const safeOwnerName = String(
    ownerName || event.user_nickname || '회원',
  ).trim() || '회원';

  return {
    id: event.id || event.source_event_id || event.sourceEventId || '',
    sourceEventId: event.source_event_id || event.sourceEventId || '',
    ownerUserId,
    ownerName: safeOwnerName,
    groupId: groupId || event.group_id || '',
    calendarType: safeCalendarType,
    date,
    title: safeCalendarType === 'work' && workText ? workText : rawTitle,
    memo: String(event.memo || '').trim(),
    eventTime,
    eventEndTime,
    eventEndDate,
    endsNextDay,
    isAllDay,
    timeLabel: formatCalendarScheduleListTime({
      calendarType: safeCalendarType,
      startTime: rawEventTime,
      endTime: rawEventEndTime,
      date,
      endDate: eventEndDate,
      endsNextDay,
      isAllDay,
    }),
    categoryName,
    type: String(event.event_type || '').trim(),
    color: String(event.color || '').trim(),
    isDone: normalizeReadonlyBoolean(getEventValue(event, 'isDone', 'is_done')),
    readonly: true,
    isSharedPersonal: true,
    isOtherUserPersonal: Boolean(
      ownerUserId && ownerUserId !== String(currentUserId || '').trim(),
    ),
  };
}

export function createCalendarScheduleListContent({
  bodyClass = '',
  categoryClass = '',
  categoryName = '기타',
  categoryColor = '',
  categoryTextColor = '',
  source = '',
  ownerName = '',
  timeLabel = '시간 미지정',
  title = '일정',
  memo = '',
} = {}) {
  const safeSource = CALENDAR_SCHEDULE_SOURCE_LABELS[source] ? source : '';
  const safeOwnerName = String(ownerName || '회원').trim() || '회원';

  const body = document.createElement('div');
  body.className = [bodyClass, 'calendar-schedule-list__body']
    .filter(Boolean)
    .join(' ');

  const meta = document.createElement('div');
  meta.className = 'calendar-schedule-list__meta';

  const category = document.createElement('span');
  category.className = [categoryClass, 'calendar-schedule-list__category']
    .filter(Boolean)
    .join(' ');
  category.textContent = categoryName || '기타';
  category.title = category.textContent;
  if (categoryColor) {
    category.style.setProperty('--todo-category-color', categoryColor);
    category.style.setProperty('--shared-personal-color', categoryColor);
  }
  if (categoryTextColor) {
    category.style.setProperty('--todo-category-text', categoryTextColor);
  }
  meta.append(category);

  if (safeSource) {
    const sourceMeta = document.createElement('span');
    sourceMeta.className = `calendar-schedule-list__source calendar-schedule-list__source--${safeSource}`;

    if (safeSource === 'member') {
      const owner = document.createElement('span');
      owner.className = 'calendar-schedule-list__owner';
      owner.textContent = safeOwnerName;
      owner.title = safeOwnerName;
      owner.setAttribute('aria-label', `${safeOwnerName}, 그룹원 일정 작성자`);
      sourceMeta.append(owner);
    }

    const badge = document.createElement('span');
    badge.className = `calendar-schedule-list__source-badge calendar-schedule-list__source-badge--${safeSource}`;
    badge.textContent = CALENDAR_SCHEDULE_SOURCE_LABELS[safeSource];
    sourceMeta.setAttribute(
      'aria-label',
      safeSource === 'member'
        ? `${safeOwnerName}, ${badge.textContent}`
        : badge.textContent,
    );
    sourceMeta.append(badge);
    meta.append(sourceMeta);
  }

  const summary = document.createElement('p');
  summary.className = 'calendar-schedule-list__summary';

  const time = document.createElement('span');
  time.className = 'calendar-schedule-list__time';
  time.textContent = timeLabel || '시간 미지정';

  const separator = document.createElement('span');
  separator.className = 'calendar-schedule-list__separator';
  separator.textContent = '·';
  separator.setAttribute('aria-hidden', 'true');

  const titleElement = document.createElement('strong');
  titleElement.className = 'calendar-schedule-list__title';
  titleElement.textContent = title || '일정';
  summary.append(time, separator, titleElement);

  const memoElement = document.createElement('p');
  memoElement.className = 'calendar-schedule-list__memo';
  if (!String(memo || '').trim()) memoElement.classList.add('is-empty');
  memoElement.textContent = String(memo || '').trim() || '메모 없음';

  body.append(meta, summary, memoElement);
  return body;
}

export function openSharedPersonalReadonlyDetail({ detail, opener } = {}) {
  if (!detail?.isOtherUserPersonal || !isReadonlySharedPersonalDetail(detail)) {
    return null;
  }

  return openCalendarDetailSheet({
    calendarType: detail.calendarType,
    mode: 'readonly',
    title:
      detail.calendarType === 'work'
        ? '업무 일정'
        : detail.calendarType === 'study'
          ? '할 일'
          : '일정',
    opener,
    fields: [
      { key: 'title', label: '제목', value: detail.title || '일정' },
      {
        key: 'owner',
        label: '작성자',
        value: detail.ownerName || '회원',
      },
      {
        key: 'category',
        label: '카테고리',
        value: detail.categoryName || detail.type || '기타',
      },
      { key: 'date', label: '날짜', value: detail.date || '' },
      {
        key: 'time',
        label: '시간',
        value: detail.timeLabel || '시간 미지정',
      },
      { key: 'memo', label: '메모', value: detail.memo || '메모 없음' },
    ],
  });
}

export function renderSharedPersonalReadonlyDetail({
  list,
  detail,
  itemClass,
}) {
  if (!list || !detail?.isOtherUserPersonal) return false;

  const item = document.createElement('li');
  item.className = `${itemClass} calendar-shared-personal-detail`;
  item.dataset.readonly = 'true';
  item.dataset.ownerUserId = detail.ownerUserId || '';
  item.draggable = false;
  if (detail.isDone) {
    item.classList.add('is-done');
  }

  const body = createCalendarScheduleListContent({
    bodyClass: 'calendar-shared-personal-detail__body',
    categoryClass: 'calendar-shared-personal-detail__chip',
    categoryName: detail.categoryName || detail.type || '기타',
    categoryColor: detail.color,
    source: 'member',
    ownerName: detail.ownerName,
    timeLabel: detail.timeLabel,
    title: detail.title,
    memo: detail.memo,
  });
  const openButton = document.createElement('button');
  openButton.type = 'button';
  openButton.className = 'calendar-shared-personal-detail__open';
  openButton.setAttribute(
    'aria-label',
    `${detail.ownerName || '회원'}의 ${detail.title || '일정'} 상세보기`,
  );
  openButton.draggable = false;
  openButton.append(body);
  openButton.addEventListener('click', () => {
    openSharedPersonalReadonlyDetail({ detail, opener: openButton });
  });
  item.append(openButton);
  list.append(item);

  return true;
}
