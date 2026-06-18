import { supabase } from './supabase-client.js';

const CALENDAR_LABELS = {
  study: '자기개발',
  work: '업무',
  event: '이벤트',
};

function isAllowed(group, calendarType) {
  return Boolean(group?.[`allow_${calendarType}`]);
}

export async function fetchSharedPersonalGroups(calendarType) {
  const { data, error } = await supabase.rpc('get_my_calendar_groups');

  if (error) {
    console.error('[calendar-shared-personal] groups load failed:', error.message);
    throw error;
  }

  return (data || []).filter((group) => isAllowed(group, calendarType));
}

export function getSharedPersonalValue({ enabled, groupId }) {
  const isSharedPersonal = Boolean(enabled && groupId);

  return {
    isSharedPersonal,
    sharedGroupId: isSharedPersonal ? groupId : null,
  };
}

export function createSharedPersonalControls({
  prefix,
  groups = [],
  category = {},
  selectLabel = '우리 일정 그룹 선택',
}) {
  const wrap = document.createElement('div');
  wrap.className = `${prefix}-category-shared calendar-category-shared`;

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'calendar-category-shared__toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(category.is_shared_personal);

  const labelText = document.createElement('span');
  labelText.textContent = '우리 일정';

  toggleLabel.append(checkbox, labelText);

  const select = document.createElement('select');
  select.className = 'calendar-category-shared__select';
  select.setAttribute('aria-label', selectLabel);

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = groups.length > 0 ? '그룹 선택' : '선택 가능한 그룹 없음';
  select.append(placeholder);

  groups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    select.append(option);
  });

  if (groups.some((group) => group.id === category.shared_group_id)) {
    select.value = category.shared_group_id;
  }

  function syncSelectState() {
    select.hidden = !checkbox.checked;
    select.disabled = !checkbox.checked || groups.length === 0;
  }

  checkbox.addEventListener('change', syncSelectState);
  syncSelectState();

  wrap.append(toggleLabel, select);

  return {
    element: wrap,
    getValue() {
      return getSharedPersonalValue({
        enabled: checkbox.checked,
        groupId: select.value,
      });
    },
    reset() {
      checkbox.checked = false;
      select.value = '';
      syncSelectState();
    },
  };
}

export function getSharedPersonalGroupName(category, groups = []) {
  if (!category?.is_shared_personal || !category.shared_group_id) return '';

  return groups.find((group) => group.id === category.shared_group_id)?.name || '';
}

export function getCalendarLabel(calendarType) {
  return CALENDAR_LABELS[calendarType] || '캘린더';
}

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
  const time = String(value || '').trim();
  const matched = time.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!matched) return time;

  const hour24 = Number(matched[1]);
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 || 12;
  return `${period} ${hour12}:${matched[2]}`;
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
  const rawTitle = String(event.title || event.event_type || '일정').trim();
  const workText = String(
    getEventValue(event, 'workText', 'work_text') || '',
  ).trim();
  const categoryName = String(
    getEventValue(event, 'categoryName', 'category_name') ||
      (safeCalendarType === 'work' ? rawTitle : event.event_type) ||
      '기타',
  ).trim();

  return {
    id: event.id || event.source_event_id || '',
    sourceEventId: event.source_event_id || '',
    ownerUserId,
    ownerName: String(ownerName || event.user_nickname || '회원').trim(),
    groupId: groupId || event.group_id || '',
    calendarType: safeCalendarType,
    date: String(event.event_date || '').slice(0, 10),
    title: safeCalendarType === 'work' && workText ? workText : rawTitle,
    memo: String(event.memo || '').trim(),
    eventTime: formatReadonlyTime(
      getEventValue(
        event,
        'event_time',
        'eventTime',
        'start_time',
        'startTime',
        'time',
      ),
    ),
    categoryName,
    type: String(event.event_type || '').trim(),
    color: String(event.color || '').trim(),
    readonly: true,
    isSharedPersonal: true,
    isOtherUserPersonal: Boolean(
      ownerUserId && ownerUserId !== String(currentUserId || '').trim(),
    ),
  };
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

  const body = document.createElement('div');
  body.className = 'calendar-shared-personal-detail__body';

  const head = document.createElement('div');
  head.className = 'calendar-shared-personal-detail__head';

  const label = document.createElement('span');
  label.className = 'calendar-shared-personal-detail__label';
  label.textContent = '공유된 개인일정';

  const owner = document.createElement('span');
  owner.className = 'calendar-shared-personal-detail__owner';
  owner.textContent = `${detail.ownerName || '회원'} · 읽기 전용`;
  head.append(label, owner);

  const meta = document.createElement('div');
  meta.className = 'calendar-shared-personal-detail__meta';

  if (detail.categoryName || detail.type) {
    const category = document.createElement('span');
    category.className = 'calendar-shared-personal-detail__chip';
    category.textContent = detail.categoryName || detail.type;
    if (detail.color) {
      category.style.setProperty('--shared-personal-color', detail.color);
    }
    meta.append(category);
  }

  if (detail.eventTime) {
    const time = document.createElement('span');
    time.className = 'calendar-shared-personal-detail__chip';
    time.textContent = detail.eventTime;
    meta.append(time);
  }

  const title = document.createElement('strong');
  title.className = 'calendar-shared-personal-detail__title';
  title.textContent = detail.title || '일정';

  const memoWrap = document.createElement('div');
  memoWrap.className = 'calendar-shared-personal-detail__memo';

  const memoLabel = document.createElement('span');
  memoLabel.className = 'calendar-shared-personal-detail__memo-label';
  memoLabel.textContent = '메모';

  const memo = document.createElement('p');
  memo.className = 'calendar-shared-personal-detail__memo-text';
  if (!detail.memo) memo.classList.add('is-empty');
  memo.textContent = detail.memo || '메모 없음';
  memoWrap.append(memoLabel, memo);

  body.append(head);
  if (meta.children.length > 0) body.append(meta);
  body.append(title, memoWrap);
  item.append(body);
  list.append(item);

  return true;
}
