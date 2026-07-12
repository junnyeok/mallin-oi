// assets/js/modules/event-calendar.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';
import {
  appendCalendarGroupBoard,
  getVisiblePersonalTodos,
  initCalendarGroupBar,
  isCalendarGroupActive,
} from './calendar-groups.js';
import {
  createSharedPersonalControls,
  fetchSharedPersonalGroups,
  getCalendarLabel,
  getSharedPersonalGroupName,
} from './calendar-shared-personal.js';
import {
  renderSharedPersonalReadonlyDetail,
} from './calendar-shared-personal-readonly.js';
import { collectSharedPersonalReadonlyDetails } from './calendar-shared-personal-readonly-collector.js';
import { scheduleCalendarWidgetRefresh } from './calendar-native-widgets.js';

const TABLE_NAME = 'event_calendar_todos';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_TABLE_NAME = 'event_calendar_categories';

const DEFAULT_CATEGORIES = [
  {
    name: '약속',
    slug: 'appointment',
    color: '#ffe0ef',
    is_default: true,
    sort_order: 10,
  },
  {
    name: '일정',
    slug: 'schedule',
    color: '#eadfff',
    is_default: true,
    sort_order: 20,
  },
  {
    name: '기념일',
    slug: 'anniversary',
    color: '#fff6bf',
    is_default: true,
    sort_order: 30,
  },
];

const CATEGORY_COLOR_PRESETS = [
  '#ffe0ef',
  '#eadfff',
  '#fff6bf',
  '#ffe3c2',
  '#e7f6ff',
  '#d8fff2',
  '#eaffd7',
  '#eeeeee',
];

function normalizeCategoryName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 20);
}

function normalizeColor(color) {
  const nextColor = String(color || '').trim();

  if (/^#[0-9a-fA-F]{6}$/.test(nextColor)) {
    return nextColor.toLowerCase();
  }

  return '#eaffd7';
}

function getCategoryTextColor(bgColor) {
  const color = normalizeColor(bgColor).replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;

  return brightness > 170 ? '#111111' : '#ffffff';
}

function getFallbackCategory(categories = []) {
  return (
    categories.find((category) => category.slug === 'anniversary') ||
    categories[0] ||
    DEFAULT_CATEGORIES[2]
  );
}

function getCategoryByTodo(todo, categories = []) {
  return (
    categories.find((category) => category.id === todo.categoryId) ||
    categories.find((category) => category.slug === todo.type) ||
    getFallbackCategory(categories)
  );
}

function isSharedPersonalTodo(todo) {
  return Boolean(
    todo?.sharedGroupId || todo?.sharedOriginTodoId || todo?.isSharedCopy,
  );
}

function getTodoCategorySelectValue(todo, categories = []) {
  const category = getCategoryByTodo(todo, categories);
  return category?.id || getFallbackCategory(categories)?.id || '';
}

function getTypeLabel(type, categories = []) {
  const category = categories.find((item) => item.slug === type);
  return category?.name || '기념일';
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function getTodayKey() {
  return toDateKey(new Date());
}

function getMonthTitle(date) {
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
}

function getReadableDate(dateKey) {
  const [year, month, day] = String(dateKey).split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;

  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function normalizeEventTime(value) {
  const nextValue = String(value || '').trim();

  if (!nextValue) return '00:00';

  const matched = nextValue.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!matched) return '00:00';

  return `${matched[1]}:${matched[2]}`;
}

function normalizeOptionalEventTime(value) {
  const nextValue = String(value || '').trim();
  if (!nextValue) return '';

  const matched = nextValue.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!matched) return '';

  return `${matched[1]}:${matched[2]}`;
}

function formatEventTimeLabel(value) {
  const time = normalizeEventTime(value);

  const [hourText, minuteText] = time.split(':');
  const hour24 = Number(hourText);
  const minute = Number(minuteText);

  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 || 12;

  return `${period} ${hour12}:${pad(minute)}`;
}

function setTimeInputValue(input, value) {
  if (!input) return;

  const time = normalizeEventTime(value);

  input.dataset.time = time;
  input.value = formatEventTimeLabel(time);
}

function setOptionalTimeInputValue(input, value) {
  if (!input) return;

  const time = normalizeOptionalEventTime(value);

  input.dataset.time = time;
  input.value = time ? formatEventTimeLabel(time) : '';
}

function formatEventTimeRange(startTime, endTime) {
  const start = normalizeEventTime(startTime);
  const end = normalizeOptionalEventTime(endTime);

  return end ? `${start}~${end}` : start;
}

function getDateRangeKeys(startDateKey, endDateKey = '') {
  const start = String(startDateKey || '').trim();
  const end = String(endDateKey || '').trim() || start;

  if (!start || end < start) return [];

  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const cursor = new Date(startYear, startMonth - 1, startDay);
  const lastDate = new Date(endYear, endMonth - 1, endDay);
  const dateKeys = [];

  while (cursor <= lastDate) {
    dateKeys.push(toDateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return dateKeys;
}

function getTodoDateRange(todo, store = {}) {
  const dateKey = String(todo?.date || '').trim();
  const eventRangeId = String(todo?.eventRangeId || '').trim();

  if (!dateKey) return [];

  if (!eventRangeId) {
    return [{ dateKey, todo }];
  }

  return Object.values(store)
    .flat()
    .filter(
      (item) =>
        item.id === todo.id ||
        String(item?.eventRangeId || '').trim() === eventRangeId,
    )
    .sort((left, right) => String(left.date).localeCompare(String(right.date)))
    .map((item) => ({
      dateKey: item.date,
      todo: item,
    }));
}

function convertPickerTimeTo24Hour({ period, hour, minute }) {
  const safePeriod = period === 'PM' ? 'PM' : 'AM';
  const safeHour = Math.min(Math.max(Number(hour) || 12, 1), 12);
  const safeMinute = Math.min(Math.max(Number(minute) || 0, 0), 59);

  let hour24 = safeHour;

  if (safePeriod === 'AM' && safeHour === 12) {
    hour24 = 0;
  }

  if (safePeriod === 'PM' && safeHour !== 12) {
    hour24 = safeHour + 12;
  }

  return `${pad(hour24)}:${pad(safeMinute)}`;
}

function getPickerStateFromTime(value) {
  const time = normalizeEventTime(value);
  const [hourText, minuteText] = time.split(':');
  const hour24 = Number(hourText);

  return {
    period: hour24 < 12 ? 'AM' : 'PM',
    hour: hour24 % 12 || 12,
    minute: Number(minuteText) || 0,
  };
}

function createPickerSelect({ className, label, options, value }) {
  const wrap = document.createElement('label');
  wrap.className = 'event-time-picker__field';

  const labelText = document.createElement('span');
  labelText.className = 'event-time-picker__label';
  labelText.textContent = label;

  const select = document.createElement('select');
  select.className = className;

  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });

  select.value = String(value);

  wrap.append(labelText, select);

  return {
    wrap,
    select,
  };
}

function openEventTimePicker({
  anchorEl,
  initialTime,
  onChange,
  allowEmpty = false,
}) {
  if (!anchorEl) return;

  const previousPicker = document.querySelector('.event-time-picker');
  previousPicker?.remove();

  const state = getPickerStateFromTime(initialTime);

  const popover = document.createElement('div');
  popover.className = 'event-time-picker';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', '일정 시간 선택');

  const panel = document.createElement('div');
  panel.className = 'event-time-picker__panel';

  const title = document.createElement('strong');
  title.className = 'event-time-picker__title';
  title.textContent = '시간 선택';

  const fields = document.createElement('div');
  fields.className = 'event-time-picker__fields';

  const periodField = createPickerSelect({
    className: 'event-time-picker__select',
    label: '오전/오후',
    value: state.period,
    options: [
      { value: 'AM', label: '오전' },
      { value: 'PM', label: '오후' },
    ],
  });

  const hourField = createPickerSelect({
    className: 'event-time-picker__select',
    label: '시',
    value: state.hour,
    options: Array.from({ length: 12 }, (_, index) => {
      const hour = index + 1;

      return {
        value: String(hour),
        label: `${hour}시`,
      };
    }),
  });

  const minuteField = createPickerSelect({
    className: 'event-time-picker__select',
    label: '분',
    value: state.minute,
    options: Array.from({ length: 60 }, (_, index) => ({
      value: String(index),
      label: `${pad(index)}분`,
    })),
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'event-time-picker__close';
  closeButton.textContent = '닫기';

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'event-time-picker__clear';
  clearButton.textContent = '시간 없음';

  let isSaving = false;

  function positionPicker() {
    const rect = anchorEl.getBoundingClientRect();
    const pickerWidth = Math.min(360, window.innerWidth - 24);
    const left = Math.min(
      Math.max(rect.left, 12),
      window.innerWidth - pickerWidth - 12,
    );
    const pickerHeight = popover.offsetHeight || 260;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const top =
      spaceBelow >= pickerHeight || rect.top < pickerHeight + 12
        ? rect.bottom + 6
        : Math.max(12, rect.top - pickerHeight - 6);

    popover.style.width = `${pickerWidth}px`;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  function closePicker() {
    popover.remove();
    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('resize', positionPicker);
    window.removeEventListener('scroll', positionPicker, true);
  }

  function handleKeydown(event) {
    if (event.key !== 'Escape') return;

    closePicker();
  }

  function handlePointerDown(event) {
    if (popover.contains(event.target) || anchorEl.contains(event.target)) {
      return;
    }

    closePicker();
  }

  async function applySelectedTime() {
    if (isSaving) return;

    const nextTime = convertPickerTimeTo24Hour({
      period: periodField.select.value,
      hour: hourField.select.value,
      minute: minuteField.select.value,
    });

    isSaving = true;

    try {
      await onChange(nextTime);
    } finally {
      isSaving = false;
    }
  }

  periodField.select.addEventListener('change', applySelectedTime);
  hourField.select.addEventListener('change', applySelectedTime);
  minuteField.select.addEventListener('change', applySelectedTime);
  closeButton.addEventListener('click', () => {
    closePicker();
    anchorEl.focus();
  });

  clearButton.addEventListener('click', async () => {
    if (isSaving) return;

    isSaving = true;
    try {
      await onChange('');
      closePicker();
      anchorEl.focus();
    } finally {
      isSaving = false;
    }
  });

  fields.append(periodField.wrap, hourField.wrap, minuteField.wrap);
  panel.append(title, fields);
  if (allowEmpty) panel.append(clearButton);
  panel.append(closeButton);
  popover.append(panel);
  document.body.append(popover);

  positionPicker();

  window.setTimeout(() => {
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', positionPicker);
    window.addEventListener('scroll', positionPicker, true);
    periodField.select.focus();
  }, 0);
}

function getTodoDisplayText(todo) {
  return String(todo?.text || '').trim();
}

function compareTodosByTime(a, b) {
  const aTime = normalizeEventTime(a?.eventTime);
  const bTime = normalizeEventTime(b?.eventTime);

  return aTime.localeCompare(bTime);
}

function appendTypeBadges(root, todos = [], categories = []) {
  const wrap = document.createElement('div');
  wrap.className = 'event-calendar-day__badges';

  todos.forEach((todo) => {
    const title = String(todo.text || '').trim();
    const displayText = getTodoDisplayText(todo);

    if (!title || !displayText) return;

    const category = getCategoryByTodo(todo, categories);

    const badge = document.createElement('span');
    badge.className = 'event-calendar-day__badge';
    badge.style.setProperty('--todo-category-color', category.color);
    badge.style.setProperty(
      '--todo-category-text',
      getCategoryTextColor(category.color),
    );

    badge.textContent = displayText;
    badge.title = `${category.name} · ${displayText}`;

    wrap.append(badge);
  });

  if (wrap.children.length > 0) {
    root.append(wrap);
  }
}

function normalizeTodo(row) {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.event_text,
    memo: row.memo || '',
    done: Boolean(row.is_done),
    eventTime: normalizeEventTime(row.event_time),
    eventEndTime: normalizeOptionalEventTime(row.event_end_time),
    eventRangeId: row.event_range_id || null,
    type:
      row.event_type || row.event_calendar_categories?.slug || 'anniversary',
    categoryId: row.category_id || row.event_calendar_categories?.id || null,
    date: row.event_date,
    sharedOriginTodoId: row.shared_origin_todo_id || null,
    sharedOriginUserId: row.shared_origin_user_id || null,
    sharedGroupId: row.shared_group_id || null,
    sharedCreatedBy: row.shared_created_by || null,
    isSharedCopy: Boolean(row.is_shared_copy),
  };
}

function groupTodosByDate(rows = []) {
  const grouped = rows.reduce((acc, row) => {
    const todo = normalizeTodo(row);
    const dateKey = todo.date;

    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }

    acc[dateKey].push(todo);
    return acc;
  }, {});

  Object.keys(grouped).forEach((dateKey) => {
    grouped[dateKey].sort(compareTodosByTime);
  });

  return grouped;
}

async function fetchUserTodos(userId) {
  if (!userId) return {};

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      `
    id,
    user_id,
    event_date,
    event_type,
    category_id,
    event_text,
    memo,
    event_time,
    event_end_time,
    event_range_id,
    is_done,
    shared_origin_todo_id,
    shared_origin_user_id,
    shared_group_id,
    shared_created_by,
    is_shared_copy,
    created_at,
    event_calendar_categories (
      id,
      name,
      slug,
      color
    )
  `,
    )
    .eq('user_id', userId)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[event-calendar] fetchUserTodos error:', error.message);
    throw error;
  }

  return groupTodosByDate(data || []);
}

async function fetchUserCategories(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
    )
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[event-calendar] fetchUserCategories error:', error.message);
    throw error;
  }

  return data || [];
}

async function fetchCategoryById(userId, categoryId) {
  if (!userId || !categoryId) return null;

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
    )
    .eq('user_id', userId)
    .eq('id', categoryId)
    .maybeSingle();

  if (error) {
    console.error('[event-calendar] fetchCategoryById error:', error.message);
    throw error;
  }

  return data || null;
}

async function ensureDefaultCategories(userId) {
  if (!userId) return [];

  const { data: existing, error: fetchError } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select('slug')
    .eq('user_id', userId);

  if (fetchError) {
    console.error(
      '[event-calendar] ensureDefaultCategories fetch error:',
      fetchError.message,
    );
    throw fetchError;
  }

  const existingSlugs = new Set((existing || []).map((item) => item.slug));

  const rowsToInsert = DEFAULT_CATEGORIES.filter(
    (category) => !existingSlugs.has(category.slug),
  ).map((category) => ({
    user_id: userId,
    name: category.name,
    slug: category.slug,
    color: category.color,
    is_default: category.is_default,
    sort_order: category.sort_order,
  }));

  if (rowsToInsert.length > 0) {
    const { error: insertError } = await supabase
      .from(CATEGORY_TABLE_NAME)
      .insert(rowsToInsert);

    if (insertError) {
      console.error(
        '[event-calendar] ensureDefaultCategories insert error:',
        insertError.message,
      );
      throw insertError;
    }
  }

  return fetchUserCategories(userId);
}

async function insertCategory({ userId, name, color, sortOrder }) {
  const safeName = normalizeCategoryName(name);
  const safeColor = normalizeColor(color);

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .insert({
      user_id: userId,
      name: safeName,
      slug: `custom-${crypto.randomUUID()}`,
      color: safeColor,
      is_default: false,
      sort_order: sortOrder || 100,
      is_shared_personal: false,
      shared_group_id: null,
    })
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
    )
    .single();

  if (error) {
    console.error('[event-calendar] insertCategory error:', error.message);
    throw error;
  }

  return data;
}

async function updateCategory({
  categoryId,
  name,
  color,
  isSharedPersonal,
  sharedGroupId,
}) {
  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .update({
      name: normalizeCategoryName(name),
      color: normalizeColor(color),
      is_shared_personal: Boolean(isSharedPersonal),
      shared_group_id: isSharedPersonal ? sharedGroupId : null,
    })
    .eq('id', categoryId)
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
    )
    .single();

  if (error) {
    console.error('[event-calendar] updateCategory error:', error.message);
    throw error;
  }

  return data;
}

async function moveTodosToCategory({ userId, fromCategoryId, toCategory }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      category_id: toCategory.id,
      event_type: toCategory.slug,
    })
    .eq('user_id', userId)
    .eq('category_id', fromCategoryId);

  if (error) {
    console.error('[event-calendar] moveTodosToCategory error:', error.message);
    throw error;
  }
}

async function deleteCategoryById(categoryId) {
  const { error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .delete()
    .eq('id', categoryId)
    .eq('is_default', false);

  if (error) {
    console.error('[event-calendar] deleteCategoryById error:', error.message);
    throw error;
  }
}

async function createTodoRange({
  startDateKey,
  endDateKey,
  text,
  memo,
  eventTime,
  eventEndTime,
  category,
}) {
  const safeCategory = category || getFallbackCategory([]);

  const { error } = await supabase.rpc('create_event_calendar_todo_range', {
    p_start_date: startDateKey,
    p_end_date: endDateKey || startDateKey,
    p_category_id: safeCategory?.id || null,
    p_event_text: String(text || '').trim(),
    p_memo: String(memo || ''),
    p_event_time: normalizeEventTime(eventTime),
    p_event_end_time: normalizeOptionalEventTime(eventEndTime) || null,
  });

  if (error) {
    console.error('[event-calendar] createTodoRange error:', error.message);
    throw error;
  }
}

async function saveTodoRange({
  todoId,
  text,
  memo,
  eventTime,
  eventEndTime,
  startDateKey,
  endDateKey,
  category,
}) {
  const safeCategory = category || getFallbackCategory([]);

  const { error } = await supabase.rpc('save_event_calendar_todo_range', {
    p_todo_id: todoId,
    p_event_text: String(text || '').trim(),
    p_memo: String(memo || ''),
    p_event_time: normalizeEventTime(eventTime),
    p_event_end_time: normalizeOptionalEventTime(eventEndTime) || null,
    p_start_date: startDateKey,
    p_end_date: endDateKey || startDateKey,
    p_category_id: safeCategory?.id || null,
  });

  if (error) {
    console.error('[event-calendar] saveTodoRange error:', error.message);
    throw error;
  }
}

async function syncSharedPersonalCategory(categoryId) {
  const { error } = await supabase.rpc('sync_event_shared_personal_category', {
    p_category_id: categoryId,
  });

  if (error) {
    console.error(
      '[event-calendar] syncSharedPersonalCategory error:',
      error.message,
    );
    throw error;
  }
}

async function deleteTodoRange(todoId) {
  const { error } = await supabase.rpc('delete_event_calendar_todo_range', {
    p_todo_id: todoId,
  });

  if (error) {
    console.error('[event-calendar] deleteTodoRange error:', error.message);
    throw error;
  }
}

async function deleteSharedPersonalCategoryById(categoryId) {
  const { error } = await supabase.rpc(
    'delete_event_shared_personal_category',
    {
      p_category_id: categoryId,
    },
  );

  if (error) {
    console.error(
      '[event-calendar] deleteSharedPersonalCategoryById error:',
      error.message,
    );
    throw error;
  }
}

function getMonthDates(viewDate, options = {}) {
  const { includeOutside = true } = options;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDate = new Date(year, month, 1);
  const lastDate = new Date(year, month + 1, 0);

  const startDay = firstDate.getDay();
  const totalDays = lastDate.getDate();

  const dates = [];

  if (includeOutside) {
    for (let i = startDay; i > 0; i -= 1) {
      dates.push({
        date: new Date(year, month, 1 - i),
        isCurrentMonth: false,
      });
    }
  } else {
    for (let i = 0; i < startDay; i += 1) {
      dates.push(null);
    }
  }

  for (let day = 1; day <= totalDays; day += 1) {
    dates.push({
      date: new Date(year, month, day),
      isCurrentMonth: true,
    });
  }

  if (includeOutside) {
    const rest = dates.length % 7;
    const nextCount = rest === 0 ? 0 : 7 - rest;

    for (let day = 1; day <= nextCount; day += 1) {
      dates.push({
        date: new Date(year, month + 1, day),
        isCurrentMonth: false,
      });
    }
  }

  return dates;
}

function renderWeekdays(root) {
  WEEKDAYS.forEach((day) => {
    const weekday = document.createElement('div');
    weekday.className = 'event-calendar-weekday';
    weekday.textContent = day;
    root.append(weekday);
  });
}

function renderPreviewLoginMessage(root) {
  root.innerHTML = '';

  const empty = document.createElement('div');
  empty.className = 'event-calendar-mini__empty';
  empty.textContent =
    '로그인하면 내 계정 전용 자기개발 캘린더를 사용할 수 있습니다.';

  root.append(empty);
}

async function renderPreviewCalendar() {
  const root = document.getElementById('eventCalendarPreview');
  if (!root) return;

  const user = await getCurrentUser();

  if (!user?.id) {
    renderPreviewLoginMessage(root);
    return;
  }

  const categories = await ensureDefaultCategories(user.id);
  const store = await fetchUserTodos(user.id);
  const today = new Date();
  const todayKey = getTodayKey();

  root.innerHTML = '';

  const monthHead = document.createElement('div');
  monthHead.className = 'event-calendar-mini__month';

  const title = document.createElement('strong');
  title.className = 'event-calendar-mini__month-title';
  title.textContent = getMonthTitle(today);

  const hint = document.createElement('span');
  hint.className = 'event-calendar-mini__hint';
  hint.textContent = '내 계정에 저장된 기록만 표시됩니다.';

  monthHead.append(title, hint);

  const grid = document.createElement('div');
  grid.className = 'event-calendar-grid';

  renderWeekdays(grid);

  const dates = getMonthDates(today, { includeOutside: false });

  dates.forEach((item) => {
    const dayEl = document.createElement('div');
    dayEl.className = 'event-calendar-day';

    if (!item) {
      dayEl.classList.add('event-calendar-day--muted');
      grid.append(dayEl);
      return;
    }

    const dateKey = toDateKey(item.date);
    const todos = store[dateKey] || [];

    if (dateKey === todayKey) {
      dayEl.classList.add('event-calendar-day--today');
    }

    const number = document.createElement('span');
    number.className = 'event-calendar-day__number';
    number.textContent = String(item.date.getDate());

    dayEl.append(number);
    appendTypeBadges(dayEl, todos, categories);
    grid.append(dayEl);
  });

  root.append(monthHead, grid);
}

function createDayButton({
  date,
  isCurrentMonth,
  selectedDateKey,
  onSelect,
  store,
  categories,
  groupState,
}) {
  const dateKey = toDateKey(date);
  const todayKey = getTodayKey();
  const todos = getVisiblePersonalTodos(store[dateKey] || [], dateKey, groupState);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'event-calendar-day event-calendar-day--button';
  button.dataset.date = dateKey;

  if (!isCurrentMonth) {
    button.classList.add('event-calendar-day--muted');
  }

  if (dateKey === todayKey) {
    button.classList.add('event-calendar-day--today');
  }

  if (dateKey === selectedDateKey) {
    button.classList.add('event-calendar-day--selected');
  }

  const number = document.createElement('span');
  number.className = 'event-calendar-day__number';
  number.textContent = String(date.getDate());

  button.append(number);
  appendTypeBadges(button, todos, categories);

  button.addEventListener('click', () => {
    onSelect(dateKey);
  });

  return button;
}

function renderTodoList({
  selectedDateKey,
  store,
  categories,
  onDelete,
  onSaveEdit,
  readonlyDetails = [],
}) {
  const list = document.getElementById('eventTodoList');
  const empty = document.getElementById('eventTodoEmpty');
  const selectedDate = document.getElementById('eventSelectedDate');

  if (!list || !empty || !selectedDate) return;

  const todos = [...(store[selectedDateKey] || [])].sort(compareTodosByTime);

  selectedDate.textContent = getReadableDate(selectedDateKey);
  list.innerHTML = '';

  empty.hidden = todos.length > 0 || readonlyDetails.length > 0;

  todos.forEach((todo) => {
    const item = document.createElement('li');
    item.className = 'event-todo-item';

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'event-todo-item__delete';
    deleteButton.textContent = '삭제';
    deleteButton.setAttribute('aria-label', `${todo.text} 삭제`);

    deleteButton.addEventListener('click', () => {
      onDelete(todo.id);
    });

    const body = document.createElement('div');
    body.className = 'event-todo-item__body';

    const controls = document.createElement('div');
    controls.className = 'event-todo-item__controls';

    const categorySelect = document.createElement('select');
    const category = getCategoryByTodo(todo, categories);

    categorySelect.className = 'event-todo-item__category-select';
    categorySelect.setAttribute('aria-label', '일정 카테고리 수정');

    categories.forEach((categoryItem) => {
      const option = document.createElement('option');
      option.value = categoryItem.id;
      option.textContent = categoryItem.name;
      categorySelect.append(option);
    });

    categorySelect.value = getTodoCategorySelectValue(todo, categories);
    categorySelect.style.setProperty('--todo-category-color', category.color);
    categorySelect.style.setProperty(
      '--todo-category-text',
      getCategoryTextColor(category.color),
    );

    const todoDateRange = getTodoDateRange(todo, store);
    const savedStartDate = todoDateRange[0]?.dateKey || String(todo.date || '');
    const savedEndDate =
      todoDateRange.length > 1
        ? todoDateRange[todoDateRange.length - 1].dateKey
        : '';

    const dateRange = document.createElement('div');
    dateRange.className = 'event-todo-item__date-range';

    const startDateLabel = document.createElement('label');
    startDateLabel.className = 'event-todo-item__date-field';

    const startDateText = document.createElement('span');
    startDateText.className = 'event-todo-item__date-label';
    startDateText.textContent = '시작 날짜';

    const startDateInput = document.createElement('input');
    startDateInput.className = 'event-todo-item__date-input';
    startDateInput.type = 'date';
    startDateInput.value = savedStartDate;
    startDateInput.required = true;
    startDateInput.setAttribute('aria-label', '일정 시작 날짜 수정');

    startDateLabel.append(startDateText, startDateInput);

    const endDateLabel = document.createElement('label');
    endDateLabel.className = 'event-todo-item__date-field';

    const endDateText = document.createElement('span');
    endDateText.className = 'event-todo-item__date-label';
    endDateText.textContent = '종료 날짜';

    const endDateInput = document.createElement('input');
    endDateInput.className = 'event-todo-item__date-input';
    endDateInput.type = 'date';
    endDateInput.value = savedEndDate;
    endDateInput.min = savedStartDate;
    endDateInput.setAttribute('aria-label', '일정 종료 날짜 수정');

    endDateLabel.append(endDateText, endDateInput);

    const clearEndDateButton = document.createElement('button');
    clearEndDateButton.type = 'button';
    clearEndDateButton.className = 'event-todo-item__date-clear';
    clearEndDateButton.textContent = '종료 날짜 없음';

    dateRange.append(startDateLabel, endDateLabel, clearEndDateButton);

    const timeInput = document.createElement('input');
    timeInput.className = 'event-todo-item__time-input';
    timeInput.type = 'text';
    timeInput.placeholder = '시간 선택';
    timeInput.readOnly = true;
    timeInput.inputMode = 'none';
    timeInput.setAttribute('aria-label', '일정 시간 수정');

    setTimeInputValue(timeInput, todo.eventTime);

    const endTimeInput = document.createElement('input');
    endTimeInput.className = 'event-todo-item__time-input';
    endTimeInput.type = 'text';
    endTimeInput.placeholder = '종료 시간';
    endTimeInput.readOnly = true;
    endTimeInput.inputMode = 'none';
    endTimeInput.setAttribute('aria-label', '일정 종료 시간 수정');

    setOptionalTimeInputValue(endTimeInput, todo.eventEndTime);

    const timeRange = document.createElement('span');
    timeRange.className = 'event-todo-item__time-range';
    timeRange.textContent = formatEventTimeRange(
      todo.eventTime,
      todo.eventEndTime,
    );

    timeInput.addEventListener('click', () => {
      openEventTimePicker({
        anchorEl: timeInput,
        initialTime: timeInput.dataset.time,
        onChange: (nextTime) => {
          const safeNextTime = normalizeEventTime(nextTime);

          setTimeInputValue(timeInput, safeNextTime);
          timeRange.textContent = formatEventTimeRange(
            safeNextTime,
            endTimeInput.dataset.time,
          );
          syncDirtyState();
        },
      });
    });

    endTimeInput.addEventListener('click', () => {
      openEventTimePicker({
        anchorEl: endTimeInput,
        initialTime: endTimeInput.dataset.time || timeInput.dataset.time,
        allowEmpty: true,
        onChange: (nextTime) => {
          setOptionalTimeInputValue(endTimeInput, nextTime);
          timeRange.textContent = formatEventTimeRange(
            timeInput.dataset.time,
            nextTime,
          );
          syncDirtyState();
        },
      });
    });

    const text = document.createElement('input');
    text.className = 'event-todo-item__text-input';
    text.type = 'text';
    text.value = todo.text;
    text.setAttribute('aria-label', '일정 제목 수정');

    const memoToggle = document.createElement('button');
    memoToggle.type = 'button';
    memoToggle.className = 'event-todo-item__memo-toggle';
    memoToggle.textContent = '펼치기';
    memoToggle.setAttribute('aria-expanded', 'false');

    const memoBox = document.createElement('div');
    memoBox.className = 'event-todo-item__memo';
    memoBox.hidden = true;

    const memoLabel = document.createElement('label');
    memoLabel.className = 'event-todo-item__memo-label';
    memoLabel.setAttribute('for', `eventTodoMemo-${todo.id}`);
    memoLabel.textContent = '메모';

    const memoInput = document.createElement('textarea');
    memoInput.className = 'event-todo-item__memo-input';
    memoInput.id = `eventTodoMemo-${todo.id}`;
    memoInput.rows = 1;
    memoInput.placeholder = '이 항목의 메모를 입력하세요.';
    memoInput.value = todo.memo || '';
    autoResizeTextarea(memoInput);

    const memoStatus = document.createElement('span');
    memoStatus.className = 'event-todo-item__memo-status';
    memoStatus.setAttribute('aria-live', 'polite');

    const editActions = document.createElement('div');
    editActions.className = 'event-todo-item__edit-actions';

    const saveEditButton = document.createElement('button');
    saveEditButton.type = 'button';
    saveEditButton.className = 'event-todo-item__save';
    saveEditButton.textContent = '저장';
    saveEditButton.disabled = true;

    const savedCategoryId = getTodoCategorySelectValue(todo, categories);
    const savedText = String(todo.text || '');
    const savedMemo = String(todo.memo || '');
    const savedTime = normalizeEventTime(todo.eventTime);
    const savedEndTime = normalizeOptionalEventTime(todo.eventEndTime);

    const isDirty = () =>
      categorySelect.value !== savedCategoryId ||
      startDateInput.value !== savedStartDate ||
      endDateInput.value !== savedEndDate ||
      text.value !== savedText ||
      memoInput.value !== savedMemo ||
      normalizeEventTime(timeInput.dataset.time) !== savedTime ||
      normalizeOptionalEventTime(endTimeInput.dataset.time) !== savedEndTime;

    const syncDirtyState = () => {
      const dirty = isDirty();
      saveEditButton.disabled = !dirty;
      item.classList.toggle('is-editing', dirty);
      if (dirty) {
        memoStatus.textContent = '저장 전';
      } else if (memoStatus.textContent === '저장 전') {
        memoStatus.textContent = '';
      }
    };

    categorySelect.addEventListener('change', syncDirtyState);
    startDateInput.addEventListener('change', () => {
      endDateInput.min = startDateInput.value;

      if (endDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = startDateInput.value;
      }

      syncDirtyState();
    });
    endDateInput.addEventListener('change', syncDirtyState);
    clearEndDateButton.addEventListener('click', () => {
      endDateInput.value = '';
      syncDirtyState();
      startDateInput.focus();
    });
    text.addEventListener('input', syncDirtyState);

    memoToggle.addEventListener('click', () => {
      const willOpen = memoBox.hidden;

      memoBox.hidden = !willOpen;
      memoToggle.textContent = willOpen ? '접기' : '펼치기';
      memoToggle.setAttribute('aria-expanded', String(willOpen));

      if (willOpen) {
        window.requestAnimationFrame(() => {
          autoResizeTextarea(memoInput);
          memoInput.focus();
        });
      }
    });

    memoInput.addEventListener('input', () => {
      autoResizeTextarea(memoInput);
      syncDirtyState();
    });

    saveEditButton.addEventListener('click', async () => {
      const nextText = text.value.trim();
      const nextCategory =
        categories.find(
          (categoryItem) => categoryItem.id === categorySelect.value,
        ) || getFallbackCategory(categories);

      if (!nextText) {
        memoStatus.textContent = '제목을 입력해줘.';
        text.focus();
        return;
      }

      saveEditButton.disabled = true;
      saveEditButton.textContent = '저장 중';
      memoStatus.textContent = '저장 중...';

      try {
        await onSaveEdit(todo.id, {
          text: nextText,
          memo: memoInput.value,
          category: nextCategory,
          eventStartDate: startDateInput.value,
          eventEndDate: endDateInput.value,
          eventTime: timeInput.dataset.time,
          eventEndTime: endTimeInput.dataset.time,
        });
      } catch (error) {
        memoStatus.textContent = '저장 실패';
        saveEditButton.disabled = false;
        saveEditButton.textContent = '저장';
      }
    });

    controls.append(
      categorySelect,
      dateRange,
      timeRange,
      timeInput,
      endTimeInput,
    );
    editActions.append(memoStatus, saveEditButton);
    memoBox.append(memoLabel, memoInput);
    body.append(controls, text, memoToggle, memoBox, editActions);
    item.append(body, deleteButton);
    list.append(item);
  });

  readonlyDetails.forEach((detail) => {
    renderSharedPersonalReadonlyDetail({
      list,
      detail,
      itemClass: 'event-todo-item',
    });
  });
}

function renderCategorySelect(select, categories = [], preferredValue = '') {
  if (!select) return;

  const selectedValue = preferredValue || select.value;
  select.innerHTML = '';

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    select.append(option);
  });

  if (
    selectedValue &&
    categories.some((category) => category.id === selectedValue)
  ) {
    select.value = selectedValue;
    return;
  }

  const fallback = getFallbackCategory(categories);
  if (fallback?.id) {
    select.value = fallback.id;
  }
}

function renderCategoryPalette({ root, colorInput }) {
  if (!root || !colorInput) return;

  root.innerHTML = '';

  CATEGORY_COLOR_PRESETS.forEach((color) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'event-category-palette__button';
    button.style.setProperty('--category-color', color);
    button.setAttribute('aria-label', `${color} 색상 선택`);

    if (normalizeColor(colorInput.value) === color) {
      button.classList.add('is-selected');
    }

    button.addEventListener('click', () => {
      colorInput.value = color;
      renderCategoryPalette({ root, colorInput });
    });

    root.append(button);
  });
}

function renderCategoryList({
  root,
  categories,
  groups,
  onSave,
  onDelete,
}) {
  if (!root) return;

  root.innerHTML = '';

  categories.forEach((category) => {
    const item = document.createElement('li');
    item.className = 'event-category-item';

    const dot = document.createElement('span');
    dot.className = 'event-category-item__dot';
    dot.style.setProperty('--category-color', category.color);

    const nameInput = document.createElement('input');
    nameInput.className = 'event-category-item__name';
    nameInput.type = 'text';
    nameInput.maxLength = 20;
    nameInput.value = category.name;
    nameInput.setAttribute('aria-label', '카테고리 이름 수정');

    const colorInput = document.createElement('input');
    colorInput.className = 'event-category-item__color';
    colorInput.type = 'color';
    colorInput.value = normalizeColor(category.color);
    colorInput.setAttribute('aria-label', '카테고리 색상 수정');

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'event-category-item__button';
    saveButton.textContent = '저장';

    const sharedControls = createSharedPersonalControls({
      prefix: 'event',
      groups,
      category,
      selectLabel: `${getCalendarLabel('event')} 우리 일정 그룹 선택`,
    });
    const sharedGroupName = getSharedPersonalGroupName(category, groups);

    if (sharedGroupName) {
      sharedControls.element.title = `${sharedGroupName} 그룹 멤버 개인 캘린더에 함께 추가돼.`;
    }

    saveButton.addEventListener('click', () => {
      const sharedValue = sharedControls.getValue();

      if (sharedValue.isSharedPersonal && !sharedValue.sharedGroupId) {
        alert('우리 일정으로 쓸 그룹을 선택해줘.');
        return;
      }

      onSave({
        category,
        name: nameInput.value,
        color: colorInput.value,
        ...sharedValue,
      });
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'event-category-item__button';
    deleteButton.textContent = '삭제';

    if (category.is_default) {
      deleteButton.disabled = true;
      deleteButton.title = '기본 카테고리는 삭제할 수 없어.';
    }

    deleteButton.addEventListener('click', () => {
      onDelete(category);
    });

    item.append(dot, nameInput, colorInput, saveButton, deleteButton, sharedControls.element);
    root.append(item);
  });
}

function renderPageCalendar(state) {
  const grid = document.getElementById('eventCalendarGrid');
  const monthLabel = document.getElementById('eventCalendarMonthLabel');

  if (!grid || !monthLabel) return;

  grid.innerHTML = '';
  const isGroupMode = isCalendarGroupActive(state.group?.state);
  grid.classList.toggle('is-calendar-group-mode', isGroupMode);
  monthLabel.textContent = getMonthTitle(state.viewDate);

  const dates = getMonthDates(state.viewDate, { includeOutside: true });

  if (!isGroupMode) {
    renderWeekdays(grid);

    dates.forEach((item) => {
      const button = createDayButton({
        date: item.date,
        isCurrentMonth: item.isCurrentMonth,
        selectedDateKey: state.selectedDateKey,
        store: state.store,
        categories: state.categories,
        groupState: state.group?.state,
        onSelect: state.onSelect,
      });

      grid.append(button);
    });
  }

  if (isGroupMode) {
    appendCalendarGroupBoard(
      grid,
      dates.map((item) => ({
        dateKey: toDateKey(item.date),
        dateNumber: item.date.getDate(),
        weekday: WEEKDAYS[item.date.getDay()],
        isCurrentMonth: item.isCurrentMonth,
      })),
      state.group?.state,
      {
        selectedDateKey: state.selectedDateKey,
        onSelect: state.onSelect,
        onSelectEvent: state.onSelectGroupEvent,
      },
    );
  }
}

function renderPageLoginRequired() {
  const pageRoot = document.getElementById('eventCalendarPage');
  const todoForm = document.getElementById('eventTodoForm');
  const todoList = document.getElementById('eventTodoList');
  const todoEmpty = document.getElementById('eventTodoEmpty');
  const selectedDate = document.getElementById('eventSelectedDate');
  const grid = document.getElementById('eventCalendarGrid');
  const monthLabel = document.getElementById('eventCalendarMonthLabel');

  if (todoForm) {
    todoForm
      .querySelectorAll('input, select, textarea, button')
      .forEach((el) => {
        el.disabled = true;
      });
  }

  if (todoList) {
    todoList.innerHTML = '';
  }

  if (todoEmpty) {
    todoEmpty.hidden = false;
    todoEmpty.textContent =
      '로그인 후 내 계정 전용 자기개발 캘린더를 사용할 수 있습니다.';
  }

  if (selectedDate) {
    selectedDate.textContent = '로그인이 필요합니다';
  }

  if (grid) {
    grid.innerHTML = '';
  }

  if (monthLabel) {
    monthLabel.textContent = '자기개발 캘린더';
  }

  pageRoot?.classList.add('is-login-required');

  showLoginRequiredPopup({
    title: '로그인이 필요해',
    message:
      '자기개발 캘린더는 계정별로 저장되기 때문에 로그인 후 사용할 수 있어.',
    confirmText: '로그인하러 가기',
    cancelText: '닫기',
  });
}

async function initPageCalendar() {
  const pageRoot = document.getElementById('eventCalendarPage');
  if (!pageRoot) return;

  const user = await getCurrentUser();

  if (!user?.id) {
    renderPageLoginRequired();
    return;
  }

  const prevBtn = document.getElementById('eventCalendarPrevBtn');
  const nextBtn = document.getElementById('eventCalendarNextBtn');
  const form = document.getElementById('eventTodoForm');
  const input = document.getElementById('eventTodoInput');
  const typeSelect = document.getElementById('eventTodoType');
  const timeInput = document.getElementById('eventTodoTime');
  const endTimeInput = document.getElementById('eventTodoEndTime');
  const dateToggle = document.getElementById('eventDateToggle');
  const datePanel = document.getElementById('eventDatePanel');
  const dateClose = document.getElementById('eventDateClose');
  const startDateInput = document.getElementById('eventStartDate');
  const endDateInput = document.getElementById('eventEndDate');
  const memoInput = document.getElementById('eventTodoMemo');
  const categoryToggle = document.getElementById('eventCategoryToggle');
  const categoryPanel = document.getElementById('eventCategoryPanel');
  const categoryClose = document.getElementById('eventCategoryClose');
  const categoryForm = document.getElementById('eventCategoryForm');
  const categoryNameInput = document.getElementById('eventCategoryName');
  const categoryColorInput = document.getElementById('eventCategoryColor');
  const categoryPalette = document.getElementById('eventCategoryPalette');
  const categoryList = document.getElementById('eventCategoryList');

  if (
    !prevBtn ||
    !nextBtn ||
    !form ||
    !input ||
    !typeSelect ||
    !timeInput ||
    !endTimeInput ||
    !dateToggle ||
    !datePanel ||
    !dateClose ||
    !startDateInput ||
    !endDateInput ||
    !memoInput
  ) {
    return;
  }

  setTimeInputValue(timeInput, '00:00');
  setOptionalTimeInputValue(endTimeInput, '');

  timeInput.addEventListener('click', () => {
    openEventTimePicker({
      anchorEl: timeInput,
      initialTime: timeInput.dataset.time,
      onChange: (nextTime) => {
        setTimeInputValue(timeInput, nextTime);
      },
    });
  });

  endTimeInput.addEventListener('click', () => {
    openEventTimePicker({
      anchorEl: endTimeInput,
      initialTime: endTimeInput.dataset.time || timeInput.dataset.time,
      allowEmpty: true,
      onChange: (nextTime) => {
        setOptionalTimeInputValue(endTimeInput, nextTime);
      },
    });
  });

  function setDatePanelOpen(isOpen, { restoreFocus = false } = {}) {
    datePanel.hidden = !isOpen;
    datePanel.classList.toggle('is-open', isOpen);
    datePanel.setAttribute('aria-hidden', String(!isOpen));
    dateToggle.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      window.requestAnimationFrame(() => {
        startDateInput.focus();
      });
    } else if (restoreFocus) {
      dateToggle.focus();
    }
  }

  dateToggle.addEventListener('click', () => {
    setDatePanelOpen(datePanel.hidden);
  });

  dateClose.addEventListener('click', () => {
    setDatePanelOpen(false, { restoreFocus: true });
  });

  startDateInput.addEventListener('change', () => {
    endDateInput.min = startDateInput.value;
  });

  const mobileTodoFormQuery = window.matchMedia('(max-width: 640px)');

  const formToggleButton = document.createElement('button');
  formToggleButton.type = 'button';
  formToggleButton.className = 'event-todo-form-toggle';
  formToggleButton.textContent = '일정 추가';
  formToggleButton.setAttribute('aria-expanded', 'false');
  formToggleButton.setAttribute('aria-controls', 'eventTodoForm');

  form.before(formToggleButton);

  const formCloseButton = document.createElement('button');
  formCloseButton.type = 'button';
  formCloseButton.className = 'event-todo-form__close';
  formCloseButton.textContent = '접기';

  form.append(formCloseButton);

  function openMobileTodoForm() {
    form.classList.add('is-open');
    formToggleButton.setAttribute('aria-expanded', 'true');

    window.setTimeout(() => {
      input.focus();
    }, 0);
  }

  function closeMobileTodoForm() {
    form.classList.remove('is-open');
    formToggleButton.setAttribute('aria-expanded', 'false');
  }

  formToggleButton.addEventListener('click', () => {
    if (form.classList.contains('is-open')) {
      closeMobileTodoForm();
      return;
    }

    openMobileTodoForm();
  });

  formCloseButton.addEventListener('click', () => {
    closeMobileTodoForm();
  });

  const today = new Date();

  const state = {
    userId: user.id,
    viewDate: new Date(today.getFullYear(), today.getMonth(), 1),
    selectedDateKey: getTodayKey(),
    categories: await ensureDefaultCategories(user.id),
    sharedGroups: await fetchSharedPersonalGroups('event'),
    store: await fetchUserTodos(user.id),
    personalStore: null,
    onSelect: null,
    onSelectGroupEvent: null,
    group: null,
  };
  state.personalStore = state.store;
  async function handleGroupModeChange() {
    state.personalStore = await fetchUserTodos(state.userId); state.store = state.personalStore;
  }
  async function reloadStoreForMode() {
    state.personalStore = await fetchUserTodos(state.userId); state.store = state.personalStore;
  }

  startDateInput.value = state.selectedDateKey;
  endDateInput.min = state.selectedDateKey;

  function refreshGroupBackupNeeded() {
    void state.group?.refreshBackupNeeded?.();
  }

  function getLatestCategoryById(categoryId) {
    return (
      state.categories.find((item) => item.id === categoryId) ||
      getFallbackCategory(state.categories)
    );
  }

  async function refreshCategories(preferredValue = typeSelect.value) {
    state.categories = await fetchUserCategories(state.userId);
    renderCategorySelect(typeSelect, state.categories, preferredValue);
    return getLatestCategoryById(preferredValue);
  }

  function renderAll() {
    const readonlyDetails = isCalendarGroupActive(state.group?.state)
      ? collectSharedPersonalReadonlyDetails({
          groupState: state.group.state,
          dateKey: state.selectedDateKey,
          calendarType: 'event',
          currentUserId: state.userId,
        })
      : [];

    form.hidden = false;
    renderCategorySelect(typeSelect, state.categories);

    renderPageCalendar(state);

    renderTodoList({
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      categories: state.categories,
      onDelete: deleteTodo,
      onSaveEdit: saveTodoEdit,
      readonlyDetails,
    });

    renderCategoryList({
      root: categoryList,
      categories: state.categories,
      groups: state.sharedGroups,
      onSave: saveCategory,
      onDelete: removeCategory,
    });

    scheduleCalendarWidgetRefresh();
  }

  function selectDate(dateKey) {
    state.selectedDateKey = dateKey;
    startDateInput.value = dateKey;
    endDateInput.value = '';
    endDateInput.min = dateKey;

    const [year, month] = dateKey.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);

    renderAll();

    if (mobileTodoFormQuery.matches) {
      closeMobileTodoForm();
    }
  }

  function selectGroupEvent(event) {
    const dateKey = String(event?.event_date || '').slice(0, 10);
    if (dateKey) selectDate(dateKey);
  }

  async function deleteTodo(todoId) {
    const target = (state.store[state.selectedDateKey] || []).find(
      (todo) => todo.id === todoId,
    );

    if (!target) return;

    const isSharedTodo = isSharedPersonalTodo(target);
    const targetRange = getTodoDateRange(target, state.store);
    const isRangeTodo = targetRange.length > 1;

    let confirmMessage = '';

    if (isSharedTodo) {
      confirmMessage = isRangeTodo
        ? '이 기간 우리 일정 전체가 그룹 참여자 캘린더에서도 삭제돼. 삭제할까?'
        : '우리 일정이라 같은 그룹 참여자 캘린더에서도 함께 삭제돼. 삭제할까?';
    } else if (isRangeTodo) {
      confirmMessage = '이 기간 일정 전체를 삭제할까?';
    }

    if (confirmMessage && !window.confirm(confirmMessage)) {
      return;
    }

    try {
      await deleteTodoRange(todoId);
      await reloadStoreForMode();
      renderAll();
      refreshGroupBackupNeeded();
    } catch (error) {
      alert('일정 삭제에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function saveTodoEdit(
    todoId,
    {
      text,
      memo,
      category,
      eventStartDate,
      eventEndDate,
      eventTime,
      eventEndTime,
    },
  ) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);
    const fallback = getFallbackCategory(state.categories);
    const nextCategory = category || fallback;

    if (!target) return;

    const nextText = String(text || '').trim();
    const nextMemo = String(memo || '');
    const nextStartDate = String(eventStartDate || target.date || '').trim();
    const nextEndDate = String(eventEndDate || nextStartDate).trim();
    const nextDateKeys = getDateRangeKeys(nextStartDate, nextEndDate);
    const nextTime = normalizeEventTime(eventTime);
    const nextEndTime = normalizeOptionalEventTime(eventEndTime);

    if (!nextText || !nextStartDate || !nextCategory?.id) return;

    if (nextEndDate < nextStartDate || nextDateKeys.length === 0) {
      alert('종료 날짜는 시작 날짜보다 빠를 수 없어.');
      throw new Error('Invalid event date range');
    }

    await saveTodoRange({
      todoId,
      text: nextText,
      memo: nextMemo,
      startDateKey: nextStartDate,
      endDateKey: nextEndDate,
      eventTime: nextTime,
      eventEndTime: nextEndTime,
      category: nextCategory,
    });

    await reloadStoreForMode();

    if (!nextDateKeys.includes(state.selectedDateKey)) {
      state.selectedDateKey = nextStartDate;
      const [year, month] = nextStartDate.split('-').map(Number);
      state.viewDate = new Date(year, month - 1, 1);
    }

    renderAll();
    refreshGroupBackupNeeded();
  }

  state.onSelect = selectDate;
  state.onSelectGroupEvent = selectGroupEvent;

  state.group = await initCalendarGroupBar({
    calendarType: 'event',
    pageRoot,
    getViewDate: () => state.viewDate,
    renderAll,
    onModeChange: handleGroupModeChange,
  });
  renderAll();

  function openCategoryModal() {
    if (!categoryToggle || !categoryPanel) return;

    categoryPanel.hidden = false;
    categoryToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('event-category-modal-open');

    window.setTimeout(() => {
      if (categoryNameInput) {
        categoryNameInput.focus();
        return;
      }

      categoryClose?.focus();
    }, 0);
  }

  function closeCategoryModal() {
    if (!categoryToggle || !categoryPanel) return;

    categoryPanel.hidden = true;
    categoryToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('event-category-modal-open');

    categoryToggle.focus();
  }

  if (categoryToggle && categoryPanel) {
    categoryToggle.addEventListener('click', () => {
      if (categoryPanel.hidden) {
        openCategoryModal();
        return;
      }

      closeCategoryModal();
    });

    categoryPanel.addEventListener('click', (event) => {
      if (event.target !== categoryPanel) return;

      closeCategoryModal();
    });
  }

  if (categoryClose) {
    categoryClose.addEventListener('click', () => {
      closeCategoryModal();
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!categoryPanel || categoryPanel.hidden) return;

    closeCategoryModal();
  });

  if (categoryPalette && categoryColorInput) {
    renderCategoryPalette({
      root: categoryPalette,
      colorInput: categoryColorInput,
    });

    categoryColorInput.addEventListener('input', () => {
      renderCategoryPalette({
        root: categoryPalette,
        colorInput: categoryColorInput,
      });
    });
  }

  if (categoryForm && categoryNameInput && categoryColorInput) {
    categoryForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const name = normalizeCategoryName(categoryNameInput.value);
      const color = normalizeColor(categoryColorInput.value);

      if (!name) {
        categoryNameInput.focus();
        return;
      }

      const duplicated = state.categories.some(
        (category) => category.name.trim().toLowerCase() === name.toLowerCase(),
      );

      if (duplicated) {
        alert('이미 같은 이름의 카테고리가 있어.');
        categoryNameInput.focus();
        return;
      }

      try {
        const nextCategory = await insertCategory({
          userId: state.userId,
          name,
          color,
          sortOrder: 100 + state.categories.length,
        });

        state.categories = [...state.categories, nextCategory];

        categoryNameInput.value = '';
        categoryColorInput.value = '#eaffd7';

        renderAll();

        renderCategoryPalette({
          root: categoryPalette,
          colorInput: categoryColorInput,
        });
      } catch (error) {
        alert('카테고리 추가에 실패했어. 이름 중복 여부를 확인해줘.');
      }
    });
  }

  async function saveCategory({
    category,
    name,
    color,
    isSharedPersonal,
    sharedGroupId,
  }) {
    const safeName = normalizeCategoryName(name);
    const safeColor = normalizeColor(color);

    if (!safeName) {
      alert('카테고리 이름을 입력해줘.');
      return;
    }

    const duplicated = state.categories.some(
      (item) =>
        item.id !== category.id &&
        item.name.trim().toLowerCase() === safeName.toLowerCase(),
    );

    if (duplicated) {
      alert('이미 같은 이름의 카테고리가 있어.');
      return;
    }

    try {
      const updatedCategory = await updateCategory({
        categoryId: category.id,
        name: safeName,
        color: safeColor,
        isSharedPersonal,
        sharedGroupId,
      });

      const selectedCategoryId = typeSelect.value;

      state.categories = state.categories.map((item) =>
        item.id === updatedCategory.id ? updatedCategory : item,
      );

      if (
        updatedCategory.is_shared_personal &&
        updatedCategory.shared_group_id
      ) {
        await syncSharedPersonalCategory(updatedCategory.id);
      }

      await refreshCategories(selectedCategoryId);
      renderAll();
    } catch (error) {
      alert('카테고리 수정에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function removeCategory(category) {
    if (!category || category.is_default) {
      alert('기본 카테고리는 삭제할 수 없어.');
      return;
    }

    if (category.is_shared_personal && category.shared_group_id) {
      const ok = window.confirm(
        `"${category.name}" 카테고리는 우리 일정 카테고리라 같은 그룹 참여자 카테고리도 함께 삭제돼. 삭제할까?`,
      );

      if (!ok) return;

      try {
        await deleteSharedPersonalCategoryById(category.id);
        state.categories = await fetchUserCategories(state.userId);
        await reloadStoreForMode();
        renderAll();
      } catch (error) {
        alert('카테고리 삭제에 실패했어. 잠시 후 다시 시도해줘.');
      }

      return;
    }

    const fallback = getFallbackCategory(state.categories);

    if (!fallback?.id || fallback.id === category.id) {
      alert('삭제 후 이동할 기본 카테고리를 찾지 못했어.');
      return;
    }

    const ok = window.confirm(
      `"${category.name}" 카테고리를 삭제할까?\n이 카테고리를 쓰던 할 일은 "${fallback.name}" 카테고리로 이동돼.`,
    );

    if (!ok) return;

    try {
      await moveTodosToCategory({
        userId: state.userId,
        fromCategoryId: category.id,
        toCategory: fallback,
      });

      await deleteCategoryById(category.id);

      state.categories = state.categories.filter(
        (item) => item.id !== category.id,
      );

      Object.values(state.store).forEach((todos) => {
        todos.forEach((todo) => {
          if (todo.categoryId === category.id) {
            todo.categoryId = fallback.id;
            todo.type = fallback.slug;
          }
        });
      });

      renderAll();
    } catch (error) {
      alert('카테고리 삭제에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  prevBtn.addEventListener('click', () => {
    state.viewDate = new Date(
      state.viewDate.getFullYear(),
      state.viewDate.getMonth() - 1,
      1,
    );

    renderPageCalendar(state);
    state.group?.refresh?.();
  });

  nextBtn.addEventListener('click', () => {
    state.viewDate = new Date(
      state.viewDate.getFullYear(),
      state.viewDate.getMonth() + 1,
      1,
    );

    renderPageCalendar(state);
    state.group?.refresh?.();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const text = input.value.trim();
    const memo = memoInput.value.trim();
    const eventTime = normalizeEventTime(timeInput.dataset.time);
    const eventEndTime = normalizeOptionalEventTime(endTimeInput.dataset.time);
    const startDateKey = startDateInput.value || state.selectedDateKey;
    const endDateKey = endDateInput.value || startDateKey;
    const dateKeys = getDateRangeKeys(startDateKey, endDateKey);
    const selectedCategoryId = typeSelect.value;

    if (!text) {
      input.focus();
      return;
    }

    if (endDateKey < startDateKey || dateKeys.length === 0) {
      alert('종료 날짜는 시작 날짜보다 빠를 수 없어.');
      endDateInput.focus();
      return;
    }

    try {
      const category = await refreshCategories(selectedCategoryId);

      await createTodoRange({
        startDateKey,
        endDateKey,
        text,
        memo,
        eventTime,
        eventEndTime,
        category,
      });
      await reloadStoreForMode();

      input.value = '';
      setTimeInputValue(timeInput, '00:00');
      setOptionalTimeInputValue(endTimeInput, '');
      memoInput.value = '';
      startDateInput.value = state.selectedDateKey;
      endDateInput.value = '';
      endDateInput.min = state.selectedDateKey;
      autoResizeTextarea(memoInput);

      renderAll();
      refreshGroupBackupNeeded();

      if (mobileTodoFormQuery.matches) {
        closeMobileTodoForm();
      } else {
        input.focus();
      }
    } catch (error) {
      alert('일정 추가에 실패했어. 잠시 후 다시 시도해줘.');
    }
  });

  memoInput.addEventListener('input', () => {
    autoResizeTextarea(memoInput);
  });

  autoResizeTextarea(memoInput);

  renderAll();
}

function bindPreviewLinkLoginGuard() {
  const link = document.getElementById('eventCalendarPreviewLink');
  if (!link) return;

  link.addEventListener('click', async (event) => {
    const user = await getCurrentUser();

    if (user?.id) return;

    event.preventDefault();

    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message:
        '이벤트 캘린더는 계정별로 저장되기 때문에 로그인 후 사용할 수 있어.',
      confirmText: '로그인하러 가기',
      cancelText: '닫기',
    });

    saveRedirect(window.location.pathname + window.location.search);
    window.location.href = loginHref();
  });
}

export async function initEventCalendar() {
  const previewRoot = document.getElementById('eventCalendarPreview');
  const pageRoot = document.getElementById('eventCalendarPage');

  if (!previewRoot && !pageRoot) return;

  bindPreviewLinkLoginGuard();

  try {
    await renderPreviewCalendar();
    await initPageCalendar();
  } catch (error) {
    console.error('[event-calendar] init failed:', error);

    if (pageRoot) {
      alert('이벤트 캘린더를 불러오지 못했어. 잠시 후 다시 시도해줘.');
    }
  }
}
