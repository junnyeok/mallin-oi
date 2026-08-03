// assets/js/modules/work-calendar.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';
import { scheduleCalendarWidgetRefresh } from './calendar-native-widgets.js';
import {
  openCalendarDetailSheet,
} from './calendar-entry-sheet.js';
import {
  createCalendarScheduleListContent,
  getEditableCalendarScheduleSource,
  isReadonlySharedPersonalDetail,
  renderSharedPersonalReadonlyDetail,
} from './calendar-shared-personal-readonly.js';
import { collectSharedPersonalReadonlyDetails } from './calendar-shared-personal-readonly-collector.js';
import { createCalendarLoadingController } from './calendar-loading.js';
import { scheduleCalendarSelectionScroll } from './calendar-selection-scroll.js';
import {
  formatCalendarTimeLabel,
  isOvernightTimeRange,
  joinLocalDateTimeValue,
  normalizeCalendarTime,
  openCalendarTimePicker,
  resolveWorkCalendarTimeRange,
  setCalendarTimeInputValue,
  splitLocalDateTimeValue,
} from './calendar-time.js';

let appendCalendarGroupBoard;
let getVisiblePersonalTodos;
let initCalendarGroupBar;
let isCalendarGroupActive;
let calendarGroupsModulePromise = null;

async function loadCalendarGroupsModule() {
  if (!calendarGroupsModulePromise) {
    const moduleUrl = new URL('./calendar-groups.js', import.meta.url);
    const siteVersion = String(window.__SITE_VERSION__ || 'dev').trim();
    moduleUrl.searchParams.set('v', siteVersion);
    calendarGroupsModulePromise = import(moduleUrl.href);
  }

  const module = await calendarGroupsModulePromise;
  appendCalendarGroupBoard = module.appendCalendarGroupBoard;
  getVisiblePersonalTodos = module.getVisiblePersonalTodos;
  initCalendarGroupBar = module.initCalendarGroupBar;
  isCalendarGroupActive = module.isCalendarGroupActive;
}

const TABLE_NAME = 'work_calendar_todos';
const CATEGORY_TABLE_NAME = 'work_calendar_categories';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const DEFAULT_CATEGORIES = [
  {
    name: '근무',
    slug: 'workday',
    color: '#e7f6ff',
    is_default: true,
    sort_order: 10,
  },
  {
    name: '휴무',
    slug: 'dayoff',
    color: '#eaffd7',
    is_default: true,
    sort_order: 20,
  },
  {
    name: '야간',
    slug: 'night',
    color: '#eadfff',
    is_default: true,
    sort_order: 30,
  },
  {
    name: '연차',
    slug: 'leave',
    color: '#fff6bf',
    is_default: true,
    sort_order: 40,
  },
  {
    name: '기타',
    slug: 'etc',
    color: '#eeeeee',
    is_default: true,
    sort_order: 50,
  },
];

const CATEGORY_COLOR_PRESETS = [
  '#eaffd7',
  '#d8fff2',
  '#e7f6ff',
  '#fff6bf',
  '#ffe3c2',
  '#ffe0ef',
  '#eadfff',
  '#eeeeee',
];

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function isValidDateKey(value) {
  const matched = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) return false;
  const date = new Date(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]));
  return !Number.isNaN(date.getTime()) && toDateKey(date) === value;
}

function getCalendarErrorText(error) {
  return [error?.code, error?.message, error?.details, error?.hint]
    .filter(Boolean)
    .join(' ');
}

function isWorkDateUniqueConflict(error) {
  const errorText = getCalendarErrorText(error);
  return (
    error?.code === '23505' ||
    errorText.includes('work_calendar_todos_user_date_uidx') ||
    errorText.includes('duplicate key value violates unique constraint')
  );
}

function isWorkDateConflict(error) {
  return (
    getCalendarErrorText(error).includes('WORK_DATE_CONFLICT') ||
    isWorkDateUniqueConflict(error)
  );
}

function isWorkDateForeignConflict(error) {
  return getCalendarErrorText(error).includes('WORK_DATE_FOREIGN_CONFLICT');
}

function createHandledCalendarError(message) {
  const error = new Error(message);
  error.calendarUserHandled = true;
  return error;
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

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function addDays(dateKey, days) {
  const date = parseDateKey(dateKey);

  if (!date) return '';

  date.setDate(date.getDate() + Number(days || 0));
  return toDateKey(date);
}

function diffDays(startDateKey, endDateKey) {
  const start = parseDateKey(startDateKey);
  const end = parseDateKey(endDateKey);

  if (!start || !end) return 0;

  const oneDay = 24 * 60 * 60 * 1000;
  return Math.round((end - start) / oneDay);
}

function getDateKeysBetween(startDateKey, endDateKey) {
  const totalDays = diffDays(startDateKey, endDateKey);

  if (totalDays < 0) return [];

  return Array.from({ length: totalDays + 1 }, (_, index) =>
    addDays(startDateKey, index),
  );
}

function getMonthRange(date) {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);

  return {
    startKey: toDateKey(start),
    endKey: toDateKey(end),
  };
}

function getCalendarCells(viewDate) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDate = new Date(year, month, 1);
  const firstDay = firstDate.getDay();
  const startDate = new Date(year, month, 1 - firstDay);
  const cells = [];

  for (let index = 0; index < 42; index += 1) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    cells.push({
      date,
      dateKey: toDateKey(date),
      isCurrentMonth: date.getMonth() === month,
    });
  }

  return cells;
}

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

function setWorkCategoryTimeInputValue(input, value, options = {}) {
  setCalendarTimeInputValue(input, value, {
    emptyLabel: options.emptyLabel,
  });

  if (
    options.isEnd &&
    isOvernightTimeRange(options.startTime, input?.dataset.time)
  ) {
    input.value = `${input.value} · 익일`;
    input.title = '다음 날 종료';
    return;
  }

  if (input) input.title = '';
}

function validateWorkCategoryTimes(startTime, endTime) {
  const start = normalizeCalendarTime(startTime);
  const end = normalizeCalendarTime(endTime);

  if (end && !start) {
    alert('종료시간을 지정하려면 시작시간을 먼저 지정해줘.');
    return null;
  }

  return {
    startTime: start,
    endTime: end,
    endsNextDay: isOvernightTimeRange(start, end),
  };
}

function formatWorkTimeRange(todo, category) {
  const { startTime, endTime, endsNextDay } = resolveWorkCalendarTimeRange({
    todo,
    category,
  });
  if (!startTime) return '시간 미지정';

  const endLabel = endTime
    ? ` ~ ${formatCalendarTimeLabel(endTime)}${endsNextDay ? ' (익일)' : ''}`
    : '';
  return `${formatCalendarTimeLabel(startTime)}${endLabel}`;
}

function bindWorkCategoryTimeInput({
  input,
  getStartTime,
  onChange,
  isEnd = false,
  emptyLabel,
  ariaLabel,
}) {
  if (!input) return;

  input.addEventListener('click', () => {
    const startTime = normalizeCalendarTime(getStartTime?.());
    if (isEnd && !startTime) {
      alert('종료시간을 지정하려면 시작시간을 먼저 지정해줘.');
      return;
    }

    openCalendarTimePicker({
      anchorEl: input,
      initialTime: input.dataset.time,
      allowEmpty: true,
      ariaLabel,
      clearLabel: isEnd ? '종료시간 해제' : '시작시간 해제',
      onChange: (nextTime) => {
        onChange?.(normalizeCalendarTime(nextTime));
        setWorkCategoryTimeInputValue(input, nextTime, {
          emptyLabel,
          isEnd,
          startTime: getStartTime?.(),
        });
      },
    });
  });
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
    categories.find((category) => category.slug === 'etc') ||
    categories[0] ||
    DEFAULT_CATEGORIES[4]
  );
}

function getTodoCategorySelectValue(todo, categories = []) {
  const category = getCategoryByTodo(todo, categories);
  return category?.id || getFallbackCategory(categories)?.id || '';
}

function getCategoryByTodo(todo, categories = []) {
  return (
    categories.find((category) => category.id === todo.categoryId) ||
    categories.find((category) => category.slug === todo.type) ||
    getFallbackCategory(categories)
  );
}

function normalizeTodo(row) {
  return {
    id: row.id,
    userId: row.user_id,
    text: row.work_text,
    memo: row.memo || row.note || '',
    done: Boolean(row.is_done),
    type: row.work_type || row.work_calendar_categories?.slug || 'etc',
    categoryId: row.category_id || row.work_calendar_categories?.id || null,
    date: row.work_date,
    startTime: normalizeCalendarTime(row.start_time),
    endTime: normalizeCalendarTime(row.end_time),
    endsNextDay: Boolean(row.ends_next_day),
    hasTimeOverride: Boolean(row.has_time_override),
  };
}

function groupTodosByDate(rows = []) {
  return rows.reduce((acc, row) => {
    const todo = normalizeTodo(row);

    if (!acc[todo.date]) {
      acc[todo.date] = [];
    }

    acc[todo.date].push(todo);
    return acc;
  }, {});
}

function sortCategories(categories = []) {
  return [...categories].sort((a, b) => {
    const sortA = Number(a.sort_order || 100);
    const sortB = Number(b.sort_order || 100);

    if (sortA !== sortB) return sortA - sortB;

    return String(a.created_at || '').localeCompare(String(b.created_at || ''));
  });
}

function makeEl(tag, className, text) {
  const el = document.createElement(tag);

  if (className) {
    el.className = className;
  }

  if (typeof text === 'string') {
    el.textContent = text;
  }

  return el;
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;

  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function appendTypeBadges(root, todos = [], categories = []) {
  const wrap = makeEl('div', 'work-calendar-day__badges');

  todos.forEach((todo) => {
    const category = getCategoryByTodo(todo, categories);
    const categoryName = String(category?.name || todo.text || '기타').trim();
    const memo = String(todo.memo || todo.note || '').trim();

    const badge = makeEl('span', 'work-calendar-day__badge', categoryName);

    badge.style.setProperty('--todo-category-color', category.color);
    badge.style.setProperty(
      '--todo-category-text',
      getCategoryTextColor(category.color),
    );
    badge.title = categoryName;

    wrap.append(badge);

    if (memo) {
      const memoText = makeEl('span', 'work-calendar-day__memo', memo);
      memoText.title = memo;
      wrap.append(memoText);
    }
  });

  if (wrap.children.length > 0) {
    root.append(wrap);
  }
}

async function fetchUserCategories(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select(
      'id, user_id, name, slug, color, start_time, end_time, ends_next_day, is_default, sort_order, created_at',
    )
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[work-calendar] fetchUserCategories error:', error.message);
    throw error;
  }

  return sortCategories(data || []);
}

async function fetchCategoryById(userId, categoryId) {
  if (!userId || !categoryId) return null;

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select(
      'id, user_id, name, slug, color, start_time, end_time, ends_next_day, is_default, sort_order, created_at',
    )
    .eq('user_id', userId)
    .eq('id', categoryId)
    .maybeSingle();

  if (error) {
    console.error('[work-calendar] fetchCategoryById error:', error.message);
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
      '[work-calendar] ensureDefaultCategories fetch error:',
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
        '[work-calendar] ensureDefaultCategories insert error:',
        insertError.message,
      );
      throw insertError;
    }
  }

  return fetchUserCategories(userId);
}

async function fetchUserTodos(userId) {
  if (!userId) return {};

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      `
      id,
      user_id,
      work_date,
      work_type,
      category_id,
      work_text,
      memo,
      start_time,
      end_time,
      ends_next_day,
      has_time_override,
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color,
        start_time,
        end_time,
        ends_next_day
      )
    `,
    )
    .eq('user_id', userId)
    .order('work_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[work-calendar] fetchUserTodos error:', error.message);
    throw error;
  }

  return groupTodosByDate(data || []);
}

async function fetchUserTodosInMonth(userId, viewDate) {
  if (!userId) return {};

  const { startKey, endKey } = getMonthRange(viewDate);

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(
      `
      id,
      user_id,
      work_date,
      work_type,
      category_id,
      work_text,
      memo,
      start_time,
      end_time,
      ends_next_day,
      has_time_override,
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color,
        start_time,
        end_time,
        ends_next_day
      )
    `,
    )
    .eq('user_id', userId)
    .gte('work_date', startKey)
    .lte('work_date', endKey)
    .order('work_date', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error(
      '[work-calendar] fetchUserTodosInMonth error:',
      error.message,
    );
    throw error;
  }

  return groupTodosByDate(data || []);
}

async function insertTodo({
  userId,
  dateKey,
  memo,
  startTime,
  endTime,
  category,
}) {
  const times = validateWorkCategoryTimes(startTime, endTime);
  if (!times) throw createHandledCalendarError('Invalid work todo times.');
  const latestCategory = category?.id
    ? await fetchCategoryById(userId, category.id)
    : null;
  const safeCategory = latestCategory || category || DEFAULT_CATEGORIES[4];
  const workText = String(safeCategory.name || '기타').trim();
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      work_date: dateKey,
      work_type: safeCategory.slug || 'etc',
      category_id: safeCategory.id || null,
      work_text: workText,
      memo: memo || '',
      start_time: times.startTime || null,
      end_time: times.endTime || null,
      ends_next_day: times.endsNextDay,
      has_time_override: true,
      is_done: false,
    })
    .select(
      `
      id,
      user_id,
      work_date,
      work_type,
      category_id,
      work_text,
      memo,
      start_time,
      end_time,
      ends_next_day,
      has_time_override,
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color,
        start_time,
        end_time,
        ends_next_day
      )
    `,
    )
    .single();

  if (error) {
    console.error('[work-calendar] insertTodo error:', error.message);
    throw error;
  }

  return normalizeTodo(data);
}

function buildWorkPatternFromRange(store, startDateKey, endDateKey) {
  const dateKeys = getDateKeysBetween(startDateKey, endDateKey);

  return dateKeys.map((dateKey) => ({
    sourceDateKey: dateKey,
    todos: [...(store[dateKey] || [])],
  }));
}

async function insertRepeatTodos(rows = []) {
  if (rows.length === 0) return [];

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert(rows)
    .select(
      `
      id,
      user_id,
      work_date,
      work_type,
      category_id,
      work_text,
      memo,
      start_time,
      end_time,
      ends_next_day,
      has_time_override,
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color,
        start_time,
        end_time,
        ends_next_day
      )
    `,
    );

  if (error) {
    console.error('[work-calendar] insertRepeatTodos error:', error.message);
    throw error;
  }

  return data || [];
}

async function deleteTodosByDateKeys({ userId, dateKeys }) {
  if (!userId || dateKeys.length === 0) return;

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq('user_id', userId)
    .in('work_date', dateKeys);

  if (error) {
    console.error(
      '[work-calendar] deleteTodosByDateKeys error:',
      error.message,
    );
    throw error;
  }
}

async function saveTodoAtomic({
  todoId,
  workText,
  memo,
  dateKey,
  startTime,
  endTime,
  categoryId,
  overwrite = false,
}) {
  const times = validateWorkCategoryTimes(startTime, endTime);
  if (!times) throw createHandledCalendarError('Invalid work todo times.');

  const { error } = await supabase.rpc('save_work_calendar_todo', {
    p_todo_id: todoId,
    p_work_text: workText,
    p_memo: memo || '',
    p_work_date: dateKey,
    p_start_time: times.startTime || null,
    p_end_time: times.endTime || null,
    p_category_id: categoryId,
    p_overwrite: overwrite,
  });

  if (error) {
    console.error('[work-calendar] saveTodoAtomic error:', error.message);
    throw error;
  }
}

async function deleteTodoById(todoId) {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', todoId);

  if (error) {
    console.error('[work-calendar] deleteTodoById error:', error.message);
    throw error;
  }
}

async function insertCategory({
  userId,
  name,
  color,
  startTime,
  endTime,
  sortOrder,
}) {
  const times = validateWorkCategoryTimes(startTime, endTime);
  if (!times) throw new Error('Invalid work category time range.');

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .insert({
      user_id: userId,
      name: normalizeCategoryName(name),
      slug: `custom-${crypto.randomUUID()}`,
      color: normalizeColor(color),
      start_time: times.startTime || null,
      end_time: times.endTime || null,
      ends_next_day: times.endsNextDay,
      is_default: false,
      sort_order: sortOrder || 100,
    })
    .select(
      'id, user_id, name, slug, color, start_time, end_time, ends_next_day, is_default, sort_order, created_at',
    )
    .single();

  if (error) {
    console.error('[work-calendar] insertCategory error:', error.message);
    throw error;
  }

  return data;
}

async function updateCategory({ categoryId, name, color, startTime, endTime }) {
  const times = validateWorkCategoryTimes(startTime, endTime);
  if (!times) throw new Error('Invalid work category time range.');

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .update({
      name: normalizeCategoryName(name),
      color: normalizeColor(color),
      start_time: times.startTime || null,
      end_time: times.endTime || null,
      ends_next_day: times.endsNextDay,
    })
    .eq('id', categoryId)
    .select(
      'id, user_id, name, slug, color, start_time, end_time, ends_next_day, is_default, sort_order, created_at',
    )
    .single();

  if (error) {
    console.error('[work-calendar] updateCategory error:', error.message);
    throw error;
  }

  return data;
}

async function moveTodosToCategory({ userId, fromCategoryId, toCategory }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      category_id: toCategory.id,
      work_type: toCategory.slug,
    })
    .eq('user_id', userId)
    .eq('category_id', fromCategoryId);

  if (error) {
    console.error('[work-calendar] moveTodosToCategory error:', error.message);
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
    console.error('[work-calendar] deleteCategoryById error:', error.message);
    throw error;
  }
}

function renderCategorySelect(select, categories = [], preferredValue = '') {
  if (!select) return;

  const currentValue = preferredValue || select.value;
  select.innerHTML = '';

  categories.forEach((category) => {
    const option = document.createElement('option');
    option.value = category.id;
    option.textContent = category.name;
    select.append(option);
  });

  if (categories.some((category) => category.id === currentValue)) {
    select.value = currentValue;
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
    button.className = 'work-category-palette__button';
    button.style.setProperty('--category-color', color);
    button.setAttribute('aria-label', `${color} 색상 선택`);

    if (normalizeColor(colorInput.value) === normalizeColor(color)) {
      button.classList.add('is-active');
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
  onSave,
  onDelete,
}) {
  if (!root) return;

  root.innerHTML = '';

  categories.forEach((category) => {
    const item = makeEl('li', 'work-category-list__item');
    const dot = makeEl('span', 'work-category-list__dot');
    const input = document.createElement('input');
    const times = makeEl('div', 'work-category-list__times');
    const startTimeInput = document.createElement('input');
    const endTimeInput = document.createElement('input');
    const color = document.createElement('input');
    const saveButton = makeEl('button', 'work-category-list__save', '저장');
    const deleteButton = makeEl('button', 'work-category-list__delete', '삭제');

    dot.style.setProperty('--category-color', category.color);

    input.className = 'work-category-list__input';
    input.type = 'text';
    input.maxLength = 20;
    input.value = category.name;
    input.setAttribute('aria-label', `${category.name} 이름`);

    startTimeInput.className = 'work-category-time-input';
    startTimeInput.type = 'text';
    startTimeInput.readOnly = true;
    startTimeInput.inputMode = 'none';
    startTimeInput.setAttribute('aria-label', `${category.name} 시작시간`);
    setWorkCategoryTimeInputValue(startTimeInput, category.start_time, {
      emptyLabel: '시작시간 지정',
    });

    endTimeInput.className = 'work-category-time-input';
    endTimeInput.type = 'text';
    endTimeInput.readOnly = true;
    endTimeInput.inputMode = 'none';
    endTimeInput.setAttribute('aria-label', `${category.name} 종료시간`);
    setWorkCategoryTimeInputValue(endTimeInput, category.end_time, {
      emptyLabel: '종료시간 지정',
      isEnd: true,
      startTime: category.start_time,
    });

    bindWorkCategoryTimeInput({
      input: startTimeInput,
      getStartTime: () => startTimeInput.dataset.time,
      emptyLabel: '시작시간 지정',
      ariaLabel: `${category.name} 시작시간 선택`,
      onChange: (nextTime) => {
        if (!nextTime) {
          setWorkCategoryTimeInputValue(endTimeInput, '', {
            emptyLabel: '종료시간 지정',
            isEnd: true,
          });
          return;
        }
        setWorkCategoryTimeInputValue(
          endTimeInput,
          endTimeInput.dataset.time,
          {
            emptyLabel: '종료시간 지정',
            isEnd: true,
            startTime: nextTime,
          },
        );
      },
    });
    bindWorkCategoryTimeInput({
      input: endTimeInput,
      getStartTime: () => startTimeInput.dataset.time,
      isEnd: true,
      emptyLabel: '종료시간 지정',
      ariaLabel: `${category.name} 종료시간 선택`,
    });
    times.append(startTimeInput, endTimeInput);

    color.className = 'work-category-list__color';
    color.type = 'color';
    color.value = normalizeColor(category.color);
    color.setAttribute('aria-label', `${category.name} 색상`);

    saveButton.type = 'button';
    deleteButton.type = 'button';
    deleteButton.disabled = Boolean(category.is_default);

    saveButton.addEventListener('click', async () => {
      if (saveButton.disabled) return;
      saveButton.disabled = true;
      saveButton.textContent = '저장 중';
      try {
        await onSave?.({
          category,
          name: input.value,
          color: color.value,
          startTime: startTimeInput.dataset.time,
          endTime: endTimeInput.dataset.time,
        });
      } finally {
        if (saveButton.isConnected) {
          saveButton.disabled = false;
          saveButton.textContent = '저장';
        }
      }
    });

    deleteButton.addEventListener('click', () => {
      onDelete?.(category);
    });

    item.append(dot, input, times, color, saveButton, deleteButton);
    root.append(item);
  });
}

function renderCalendarGrid({
  root,
  viewDate,
  selectedDateKey,
  store,
  categories,
  groupState,
  onSelect,
  onSelectEvent,
  isMini = false,
}) {
  if (!root) return;

  root.innerHTML = '';
  const isGroupMode = !isMini && isCalendarGroupActive(groupState);
  root.classList.toggle('is-calendar-group-mode', isGroupMode);

  const todayKey = getTodayKey();
  const cells = getCalendarCells(viewDate);

  if (!isGroupMode) {
    WEEKDAYS.forEach((weekday) => {
      root.append(makeEl('div', 'work-calendar-weekday', weekday));
    });

    cells.forEach((cell) => {
      const dateNumber = cell.date.getDate();
      const todos = getVisiblePersonalTodos(
        store[cell.dateKey] || [],
        cell.dateKey,
        groupState,
      );
      const dayButton = document.createElement('button');
      const number = makeEl(
        'span',
        'work-calendar-day__number',
        String(dateNumber),
      );

      dayButton.type = 'button';
      dayButton.className = 'work-calendar-day work-calendar-day--button';
      dayButton.dataset.date = cell.dateKey;
      dayButton.setAttribute(
        'aria-label',
        `${getReadableDate(cell.dateKey)} 선택`,
      );

      if (isMini) {
        dayButton.classList.add('work-calendar-day--mini');
      }

      if (!cell.isCurrentMonth) {
        dayButton.classList.add('is-muted');
      }

      if (cell.dateKey === todayKey) {
        dayButton.classList.add('work-calendar-day--today');
      }

      if (cell.dateKey === selectedDateKey) {
        dayButton.classList.add('work-calendar-day--selected');
      }

      dayButton.append(number);
      appendTypeBadges(dayButton, todos, categories);

      dayButton.addEventListener('click', () => {
        onSelect?.(cell.dateKey);
      });

      root.append(dayButton);
    });
  }

  if (!isMini && isGroupMode) {
    appendCalendarGroupBoard(
      root,
      cells.map((cell) => ({
        dateKey: cell.dateKey,
        dateNumber: cell.date.getDate(),
        weekday: WEEKDAYS[cell.date.getDay()],
        isCurrentMonth: cell.isCurrentMonth,
      })),
      groupState,
      {
        selectedDateKey,
        onSelect,
        onSelectEvent,
      },
    );
  }
}

function renderTodoList({
  root,
  empty,
  selectedDateKey,
  store,
  categories,
  onDelete,
  onSaveEdit,
  onOpenDetail,
  readonlyDetails = [],
  groupActive = false,
  selectedGroupId = '',
}) {
  if (!root) return;

  const todos = store[selectedDateKey] || [];
  root.innerHTML = '';

  if (empty) empty.hidden = todos.length > 0 || readonlyDetails.length > 0;

  todos.forEach((todo) => {
    const category = getCategoryByTodo(todo, categories);
    const item = makeEl('li', 'work-todo-item');
    const openButton = makeEl('button', 'work-todo-item__open');
    openButton.type = 'button';
    openButton.setAttribute('aria-label', `${category.name || '업무 일정'} 상세보기`);
    const body = createCalendarScheduleListContent({
      bodyClass: 'work-todo-item__body',
      categoryClass: 'work-todo-item__type',
      categoryName: category.name || todo.text || '업무',
      categoryColor: category.color,
      categoryTextColor: getCategoryTextColor(category.color),
      source: getEditableCalendarScheduleSource({
        todo,
        category,
        groupActive,
        selectedGroupId,
      }),
      timeLabel: formatWorkTimeRange(todo, category),
      title: todo.text || category.name || '업무',
      memo: todo.memo || todo.note,
    });
    openButton.append(body);
    openButton.addEventListener('click', () => onOpenDetail?.(todo, openButton));
    item.append(openButton);
    root.append(item);
  });

  readonlyDetails.forEach((detail) => {
    renderSharedPersonalReadonlyDetail({
      list: root,
      detail,
      itemClass: 'work-todo-item',
    });
  });
}

function renderPageCalendar(state) {
  const monthLabel = document.getElementById('workCalendarMonthLabel');
  const grid = document.getElementById('workCalendarGrid');
  const selectedDate = document.getElementById('workSelectedDate');

  if (monthLabel) {
    monthLabel.textContent = getMonthTitle(state.viewDate);
  }

  if (selectedDate) {
    selectedDate.textContent = getReadableDate(state.selectedDateKey);
  }

  renderCalendarGrid({
    root: grid,
    viewDate: state.viewDate,
    selectedDateKey: state.selectedDateKey,
    store: state.store,
    categories: state.categories,
    groupState: state.group?.state,
    onSelect: state.onSelect,
    onSelectEvent: state.onSelectGroupEvent,
  });
}

function renderPreviewSkeleton(root, message) {
  if (!root) return;

  root.innerHTML = '';
  root.append(makeEl('div', 'work-calendar-mini__empty', message));
}

async function renderPreviewCalendar() {
  const root = document.getElementById('workCalendarPreview');
  if (!root) return;

  const user = await getCurrentUser();

  if (!user?.id) {
    renderPreviewSkeleton(
      root,
      '로그인하면 내 계정 전용 업무 캘린더를 사용할 수 있습니다.',
    );
    return;
  }

  const viewDate = new Date();
  const categories = await ensureDefaultCategories(user.id);
  const store = await fetchUserTodosInMonth(user.id, viewDate);
  const header = makeEl('div', 'work-calendar-mini__month');
  const title = makeEl('strong', '', getMonthTitle(viewDate));
  const desc = makeEl('span', '', '내 계정에 저장된 업무 일정만 표시됩니다.');
  const grid = makeEl('div', 'work-calendar-grid work-calendar-grid--mini');

  root.innerHTML = '';
  header.append(title, desc);
  root.append(header, grid);

  renderCalendarGrid({
    root: grid,
    viewDate,
    selectedDateKey: getTodayKey(),
    store,
    categories,
    onSelect: () => {
      window.location.href = './calendar-work.html';
    },
    isMini: true,
  });
}

function bindPreviewLinkLoginGuard() {
  const link = document.getElementById('workCalendarPreviewLink');
  if (!link) return;

  link.addEventListener('click', async (event) => {
    const user = await getCurrentUser();

    if (user?.id) return;

    event.preventDefault();

    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message:
        '업무 캘린더는 계정별로 저장되기 때문에 로그인 후 사용할 수 있어.',
      confirmText: '로그인하러 가기',
      cancelText: '닫기',
    });

    saveRedirect(window.location.pathname + window.location.search);
    window.location.href = loginHref();
  });
}

async function initPageCalendar(loadingController) {
  const pageRoot = document.getElementById('workCalendarPage');
  if (!pageRoot) return;

  const user = await getCurrentUser();

  if (!user?.id) {
    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message:
        '업무 캘린더는 계정별로 저장되기 때문에 로그인 후 사용할 수 있어.',
      confirmText: '로그인하러 가기',
      cancelText: '닫기',
    });

    saveRedirect(window.location.pathname + window.location.search);
    window.location.href = loginHref();
    return;
  }

  const prevBtn = document.getElementById('workCalendarPrevBtn');
  const nextBtn = document.getElementById('workCalendarNextBtn');
  const form = document.getElementById('workTodoForm');
  const typeSelect = document.getElementById('workTodoType');
  const memoInput = document.getElementById('workTodoMemo');
  const addButton = document.getElementById('workTodoAddButton');
  const entrySheetOpen = document.getElementById('workEntrySheetOpen');
  const limitMessage = document.getElementById('workTodoLimitMessage');
  const todoList = document.getElementById('workTodoList');
  const todoEmpty = document.getElementById('workTodoEmpty');

  const categoryToggle = document.getElementById('workCategoryToggle');
  const categoryPanel = document.getElementById('workCategoryPanel');
  const categoryClose = document.getElementById('workCategoryClose');
  const categoryForm = document.getElementById('workCategoryForm');
  const categoryNameInput = document.getElementById('workCategoryName');
  const categoryStartTimeInput = document.getElementById(
    'workCategoryStartTime',
  );
  const categoryEndTimeInput = document.getElementById('workCategoryEndTime');
  const categoryColorInput = document.getElementById('workCategoryColor');
  const categoryPalette = document.getElementById('workCategoryPalette');
  const categoryList = document.getElementById('workCategoryList');

  const repeatToggle = document.getElementById('workRepeatToggle');
  const repeatPanel = document.getElementById('workRepeatPanel');
  const repeatClose = document.getElementById('workRepeatClose');
  const repeatCancel = document.getElementById('workRepeatCancel');
  const repeatForm = document.getElementById('workRepeatForm');
  const repeatStartInput = document.getElementById('workRepeatStart');
  const repeatEndInput = document.getElementById('workRepeatEnd');
  const repeatUntilInput = document.getElementById('workRepeatUntil');
  const repeatButton = document.getElementById('workRepeatButton');
  const repeatMessage = document.getElementById('workRepeatMessage');

  if (!prevBtn || !nextBtn || !form || !typeSelect || !memoInput) {
    return;
  }

  const repeatSection = repeatToggle?.closest('.work-repeat');
  const pageHead = pageRoot.querySelector('.work-calendar-page__head');
  if (repeatSection && pageHead) {
    pageHead.append(repeatSection);
  }

  const todayKey = getTodayKey();

  const state = {
    userId: user.id,
    viewDate: new Date(),
    selectedDateKey: todayKey,
    categories: await ensureDefaultCategories(user.id),
    store: await fetchUserTodos(user.id),
    personalStore: null,
    isAddingTodo: false,
    onSelect: null,
    onSelectGroupEvent: null,
    group: null,
  };
  state.personalStore = state.store;

  async function handleGroupModeChange() {
    state.personalStore = await fetchUserTodos(state.userId);
    state.store = state.personalStore;
  }

  async function reloadStoreForMode() {
    state.personalStore = await fetchUserTodos(state.userId);
    state.store = state.personalStore;
  }

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
    const groupActive = isCalendarGroupActive(state.group?.state);
    const readonlyDetails = groupActive
      ? collectSharedPersonalReadonlyDetails({
          groupState: state.group.state,
          dateKey: state.selectedDateKey,
          calendarType: 'work',
          currentUserId: state.userId,
        })
      : [];

    form.hidden = false;
    const hasTodoForSelectedDate =
      (state.store[state.selectedDateKey] || []).length > 0;
    if (addButton) {
      addButton.disabled = hasTodoForSelectedDate || state.isAddingTodo;
    }
    if (limitMessage) limitMessage.hidden = !hasTodoForSelectedDate;
    renderCategorySelect(typeSelect, state.categories);
    renderPageCalendar(state);

    renderTodoList({
      root: todoList,
      empty: todoEmpty,
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      categories: state.categories,
      onDelete: deleteTodo,
      onSaveEdit: saveTodoEdit,
      onOpenDetail: openTodoDetail,
      readonlyDetails,
      groupActive,
      selectedGroupId: state.group?.state?.selectedGroup?.id || '',
    });

    renderCategoryList({
      root: categoryList,
      categories: state.categories,
      onSave: saveCategory,
      onDelete: removeCategory,
    });

    scheduleCalendarWidgetRefresh();
  }

  function selectDate(dateKey) {
    state.selectedDateKey = dateKey;

    if (repeatStartInput && !repeatStartInput.value) {
      repeatStartInput.value = dateKey;
    }

    if (repeatEndInput && !repeatEndInput.value) {
      repeatEndInput.value = dateKey;
    }

    const [year, month] = dateKey.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);

    renderAll();
    scheduleCalendarSelectionScroll({
      target: document.querySelector('.work-calendar-todo-panel'),
      hasRenderedItems: () => Boolean(
        document.getElementById('workTodoList')?.children.length,
      ),
    });
  }

  function selectGroupEvent(event) {
    const dateKey = String(event?.event_date || '').slice(0, 10);
    if (!dateKey) return;
    selectDate(dateKey);
  }

  function setRepeatMessage(message = '') {
    if (!repeatMessage) return;

    repeatMessage.textContent = message;
  }

  function setRepeatLoading(isLoading) {
    if (!repeatButton) return;

    repeatButton.disabled = isLoading;
    repeatButton.textContent = isLoading ? '적용 중' : '반복 적용';
  }

  async function applyWorkRepeatPattern({
    patternStartKey,
    patternEndKey,
    repeatUntilKey,
  }) {
    if (!patternStartKey || !patternEndKey || !repeatUntilKey) {
      alert('반복근무 날짜를 모두 선택해줘.');
      return;
    }

    if (diffDays(patternStartKey, patternEndKey) < 0) {
      alert('패턴 종료일은 패턴 시작일보다 뒤여야 해.');
      return;
    }

    if (diffDays(patternEndKey, repeatUntilKey) <= 0) {
      alert('반복 적용 종료일은 패턴 종료일보다 뒤여야 해.');
      return;
    }

    const pattern = buildWorkPatternFromRange(
      state.store,
      patternStartKey,
      patternEndKey,
    );

    const hasPatternTodo = pattern.some(
      (patternDay) => patternDay.todos.length > 0,
    );

    if (!hasPatternTodo) {
      alert('패턴 구간에 등록된 근무가 없어. 먼저 근무를 입력해줘.');
      return;
    }

    const repeatDateKeys = getDateKeysBetween(
      addDays(patternEndKey, 1),
      repeatUntilKey,
    );

    const patternLength = pattern.length;
    const rowsToInsert = [];
    const targetDateKeys = new Set(repeatDateKeys);

    repeatDateKeys.forEach((targetDateKey, index) => {
      const patternDay = pattern[index % patternLength];

      if (!patternDay || patternDay.todos.length === 0) return;

      const todo = patternDay.todos[0];
      const category = getCategoryByTodo(todo, state.categories);
      const times = resolveWorkCalendarTimeRange({ todo, category });

      rowsToInsert.push({
        user_id: state.userId,
        work_date: targetDateKey,
        work_type: todo.type || category?.slug || 'etc',
        category_id: todo.categoryId || category?.id || null,
        work_text: String(category?.name || todo.text || '기타').trim(),
        memo: String(todo.memo || '').trim(),
        start_time: times.startTime || null,
        end_time: times.endTime || null,
        ends_next_day: times.endsNextDay,
        has_time_override: true,
        is_done: false,
      });
    });

    if (rowsToInsert.length === 0) {
      alert('반복 적용할 근무가 없어.');
      return;
    }

    const ok = window.confirm(
      `기존 일정이 있는 날짜는 삭제하고 반복근무 ${rowsToInsert.length}개를 적용할까?`,
    );

    if (!ok) return;

    setRepeatLoading(true);
    setRepeatMessage('반복근무를 적용하는 중이야.');

    try {
      await deleteTodosByDateKeys({ userId: state.userId, dateKeys: [...targetDateKeys] });
      await insertRepeatTodos(rowsToInsert);
      await reloadStoreForMode();
      renderAll();
      refreshGroupBackupNeeded();

      const message = '반복근무를 덮어쓰기 방식으로 적용했어.';

      setRepeatMessage(message);
      alert(message);
    } catch (error) {
      console.error('[work-calendar] applyWorkRepeatPattern error:', error);
      setRepeatMessage('반복 적용 중 오류가 발생했어.');
      alert('반복 적용 중 오류가 발생했어. 잠시 후 다시 시도해줘.');
    } finally {
      setRepeatLoading(false);
    }
  }

  async function deleteTodo(todoId) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target || isReadonlySharedPersonalDetail(target, state.userId)) {
      return false;
    }

    try {
      await deleteTodoById(todoId);

      state.store[state.selectedDateKey] = todos.filter(
        (todo) => todo.id !== todoId,
      );

      if (state.store[state.selectedDateKey].length === 0) {
        delete state.store[state.selectedDateKey];
      }

      renderAll();
      refreshGroupBackupNeeded();
      return true;
    } catch (error) {
      alert('업무 일정 삭제에 실패했어. 잠시 후 다시 시도해줘.');
      throw error;
    }
  }

  async function saveTodoEdit(
    todoId,
    { memo, category, dateKey, startTime, endTime },
  ) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);
    const fallback = getFallbackCategory(state.categories);
    const nextCategory = category || fallback;

    if (
      !target ||
      isReadonlySharedPersonalDetail(target, state.userId) ||
      !nextCategory?.id
    ) {
      return;
    }

    const nextMemo = String(memo || '').trim();
    const nextDateKey = String(dateKey || target.date || state.selectedDateKey);
    if (!isValidDateKey(nextDateKey)) {
      alert('올바른 날짜를 선택해줘.');
      throw new Error('Invalid work calendar date.');
    }
    const times = validateWorkCategoryTimes(startTime, endTime);
    if (!times) {
      throw createHandledCalendarError('Invalid work todo times.');
    }

    const payload = {
      todoId,
      workText: nextCategory.name || target.text || '',
      memo: nextMemo,
      dateKey: nextDateKey,
      startTime: times.startTime,
      endTime: times.endTime,
      categoryId: nextCategory.id,
    };
    try {
      await saveTodoAtomic(payload);
    } catch (error) {
      if (!isWorkDateConflict(error)) {
        alert('일정 저장에 실패했어. 잠시 후 다시 시도해줘.');
        throw createHandledCalendarError('Work calendar save failed.');
      }
      const overwrite = window.confirm(
        '변경하려는 날짜에 이미 일정이 있습니다.\n기존 일정을 덮어쓰시겠습니까?',
      );
      if (!overwrite) {
        throw createHandledCalendarError('Work date overwrite cancelled.');
      }
      try {
        await saveTodoAtomic({ ...payload, overwrite: true });
      } catch (overwriteError) {
        if (isWorkDateForeignConflict(overwriteError)) {
          alert('다른 사용자의 일정이 있어 이 날짜로 변경할 수 없습니다.');
        } else {
          alert('일정 저장에 실패했어. 잠시 후 다시 시도해줘.');
        }
        throw createHandledCalendarError('Work calendar overwrite failed.');
      }
    }
    await reloadStoreForMode();
    state.selectedDateKey = nextDateKey;
    const [year, month] = nextDateKey.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);
    renderAll();
    state.group?.refresh?.();
    scheduleCalendarWidgetRefresh();
    refreshGroupBackupNeeded();
  }

  function openTodoDetail(todo, opener) {
    if (isReadonlySharedPersonalDetail(todo, state.userId)) return;
    const category = getCategoryByTodo(todo, state.categories);
    const times = resolveWorkCalendarTimeRange({ todo, category });
    openCalendarDetailSheet({
      calendarType: 'work',
      mode: 'edit',
      title: '업무 일정',
      opener,
      fields: getWorkEntryFields({
        categoryId: getTodoCategorySelectValue(todo, state.categories),
        memo: todo.memo || '',
        dateKey: todo.date || state.selectedDateKey,
        startTime: times.startTime,
        endTime: times.endTime,
      }),
      onSave: async (values) => {
        const nextCategory =
          state.categories.find((item) => item.id === values.categoryId) ||
          category ||
          getFallbackCategory(state.categories);
        await saveTodoEdit(todo.id, {
          memo: values.memo,
          category: nextCategory,
          dateKey: values.date,
          startTime: splitLocalDateTimeValue(values.workStart).time,
          endTime: splitLocalDateTimeValue(values.workEnd).time,
        });
      },
      onDelete: async () => {
        return deleteTodo(todo.id);
      },
      characterImage: document.getElementById('cukeBuddy')?.src || '',
    });
  }

  function getWorkEntryFields({
    categoryId = '',
    memo = '',
    dateKey = state.selectedDateKey,
    startTime = '',
    endTime = '',
    useCategoryTimeDefaults = false,
  } = {}) {
    const normalizedStartTime = normalizeCalendarTime(startTime);
    const normalizedEndTime = normalizeCalendarTime(endTime);
    const fields = [];

    function syncTimeDates(nextDateKey = '') {
      const dateField = fields.find((field) => field.key === 'date');
      const startField = fields.find((field) => field.key === 'workStart');
      const endField = fields.find((field) => field.key === 'workEnd');
      const effectiveDateKey = String(
        nextDateKey || dateField?.input?.value || dateKey,
      );
      const nextStartTime = splitLocalDateTimeValue(
        startField?.input?.value,
      ).time;
      const nextEndTime = splitLocalDateTimeValue(endField?.input?.value).time;

      if (startField?.input) {
        startField.input.value = joinLocalDateTimeValue(
          effectiveDateKey,
          nextStartTime,
        );
      }
      if (endField?.input) {
        const endDateKey = isOvernightTimeRange(nextStartTime, nextEndTime)
          ? addDays(effectiveDateKey, 1)
          : effectiveDateKey;
        endField.input.value = joinLocalDateTimeValue(endDateKey, nextEndTime);
      }
    }

    fields.push(
      {
        key: 'categoryId',
        label: '카테고리',
        type: 'select',
        value: categoryId,
        options: state.categories.map((item) => ({
          value: item.id,
          label: item.name,
        })),
        onSettings: openCategoryModal,
        onChange: (nextCategoryId) => {
          if (!useCategoryTimeDefaults) return;

          const nextCategory = state.categories.find(
            (item) => item.id === nextCategoryId,
          );
          const startField = fields.find((field) => field.key === 'workStart');
          const endField = fields.find((field) => field.key === 'workEnd');
          const nextStartTime = normalizeCalendarTime(nextCategory?.start_time);
          const nextEndTime = normalizeCalendarTime(nextCategory?.end_time);
          const effectiveDateKey =
            fields.find((field) => field.key === 'date')?.input?.value || dateKey;

          if (startField?.input) {
            startField.input.value = joinLocalDateTimeValue(
              effectiveDateKey,
              nextStartTime,
            );
          }
          if (endField?.input) {
            endField.input.value = joinLocalDateTimeValue(
              isOvernightTimeRange(nextStartTime, nextEndTime)
                ? addDays(effectiveDateKey, 1)
                : effectiveDateKey,
              nextEndTime,
            );
          }
        },
      },
      {
        key: 'date',
        label: '날짜',
        type: 'date',
        value: dateKey,
        onChange: (nextDateKey) => syncTimeDates(nextDateKey),
      },
      {
        key: 'workStart',
        label: '시작',
        type: 'calendar-datetime',
        value: joinLocalDateTimeValue(dateKey, normalizedStartTime),
        required: true,
        dateReadonly: true,
        allowEmptyTime: true,
        timePlaceholder: '시작시간 지정',
        onChange: () => syncTimeDates(),
      },
      {
        key: 'workEnd',
        label: '종료',
        type: 'calendar-datetime',
        value: joinLocalDateTimeValue(
          isOvernightTimeRange(normalizedStartTime, normalizedEndTime)
            ? addDays(dateKey, 1)
            : dateKey,
          normalizedEndTime,
        ),
        required: true,
        dateReadonly: true,
        allowEmptyTime: true,
        timePlaceholder: '종료시간 지정',
        onChange: () => syncTimeDates(),
      },
      {
        key: 'memo',
        label: '메모',
        type: 'textarea',
        value: memo,
      },
    );

    return fields;
  }

  function openTodoCreate(opener) {
    const defaultCategory = getFallbackCategory(state.categories);
    const defaultTimes = resolveWorkCalendarTimeRange({
      category: defaultCategory,
    });

    openCalendarDetailSheet({
      calendarType: 'work',
      mode: 'create',
      title: '업무 일정 추가',
      submitLabel: '추가',
      submitDisabled: !defaultCategory?.id,
      opener,
      fields: getWorkEntryFields({
        categoryId: defaultCategory?.id || '',
        startTime: defaultTimes.startTime,
        endTime: defaultTimes.endTime,
        useCategoryTimeDefaults: true,
      }),
      helpText: '업무 캘린더에는 날짜별로 하나의 근무형태만 추가할 수 있습니다.',
      characterImage: document.getElementById('cukeBuddy')?.src || '',
      onSave: async (values) => {
        await addTodo({
          categoryId: values.categoryId,
          memo: values.memo,
          dateKey: values.date,
          startTime: splitLocalDateTimeValue(values.workStart).time,
          endTime: splitLocalDateTimeValue(values.workEnd).time,
        });
      },
    });
  }

  function syncOpenCategorySelect(preferredValue = '') {
    const select = document.querySelector(
      ".calendar-entry-sheet[data-calendar-type='work'].is-open " +
        '.calendar-entry-sheet__category-actions select',
    );
    if (!select) return;

    renderCategorySelect(
      select,
      state.categories,
      preferredValue || select.value,
    );
  }

  async function saveCategory({
    category,
    name,
    color,
    startTime,
    endTime,
  }) {
    const safeName = normalizeCategoryName(name);
    const safeColor = normalizeColor(color);

    if (!safeName) {
      alert('카테고리 이름을 입력해줘.');
      throw createHandledCalendarError('Missing work category name.');
    }

    const duplicated = state.categories.some(
      (item) =>
        item.id !== category.id &&
        item.name.trim().toLowerCase() === safeName.toLowerCase(),
    );

    if (duplicated) {
      alert('이미 같은 이름의 카테고리가 있어.');
      throw createHandledCalendarError('Duplicated work category name.');
    }

    const times = validateWorkCategoryTimes(startTime, endTime);
    if (!times) {
      throw createHandledCalendarError('Invalid work category times.');
    }

    try {
      const updatedCategory = await updateCategory({
        categoryId: category.id,
        name: safeName,
        color: safeColor,
        startTime: times.startTime,
        endTime: times.endTime,
      });

      const selectedCategoryId = typeSelect.value;

      state.categories = state.categories.map((item) =>
        item.id === updatedCategory.id ? updatedCategory : item,
      );

      await refreshCategories(selectedCategoryId);
      renderAll();
    } catch (error) {
      alert('카테고리 수정에 실패했어. 잠시 후 다시 시도해줘.');
      throw error;
    }
  }

  async function removeCategory(category) {
    if (!category || category.is_default) {
      alert('기본 카테고리는 삭제할 수 없어.');
      return;
    }

    const fallback = getFallbackCategory(state.categories);

    if (!fallback?.id || fallback.id === category.id) {
      alert('삭제 후 이동할 기본 카테고리를 찾지 못했어.');
      return;
    }

    const ok = window.confirm(
      `"${category.name}" 카테고리를 삭제할까?\n이 카테고리를 쓰던 업무 일정은 "${fallback.name}" 카테고리로 이동돼.`,
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

  function openRepeatModal() {
    if (!repeatToggle || !repeatPanel) return;

    if (categoryPanel && !categoryPanel.hidden) {
      closeCategoryModal();
    }

    repeatPanel.hidden = false;
    repeatToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('work-repeat-modal-open');

    window.setTimeout(() => {
      repeatStartInput?.focus();
    }, 0);
  }

  function closeRepeatModal({ restoreFocus = true } = {}) {
    if (!repeatToggle || !repeatPanel) return;

    repeatPanel.hidden = true;
    repeatToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('work-repeat-modal-open');

    if (restoreFocus) {
      repeatToggle.focus();
    }
  }

  function openCategoryModal() {
    if (!categoryToggle || !categoryPanel) return;

    if (repeatPanel && !repeatPanel.hidden) {
      closeRepeatModal({ restoreFocus: false });
    }

    categoryPanel.hidden = false;
    categoryToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('work-category-modal-open');

    window.setTimeout(() => {
      categoryNameInput?.focus();
    }, 0);
  }

  function closeCategoryModal() {
    if (!categoryToggle || !categoryPanel) return;

    categoryPanel.hidden = true;
    categoryToggle.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('work-category-modal-open');
    categoryToggle.focus();
  }

  state.onSelect = selectDate;
  state.onSelectGroupEvent = selectGroupEvent;

  state.group = await initCalendarGroupBar({
    calendarType: 'work',
    pageRoot,
    getViewDate: () => state.viewDate,
    renderAll,
    onModeChange: handleGroupModeChange,
    runCalendarLoad: loadingController?.runLatest,
  });
  renderAll();

  async function changeMonth(offset) {
    state.viewDate = new Date(
      state.viewDate.getFullYear(),
      state.viewDate.getMonth() + offset,
      1,
    );

    renderPageCalendar(state);
    try {
      await state.group?.refresh?.({ reason: 'month-navigation' });
    } catch (error) {
      console.error('[work-calendar] month load failed:', error);
    }
  }

  prevBtn.addEventListener('click', () => {
    void changeMonth(-1);
  });

  nextBtn.addEventListener('click', () => {
    void changeMonth(1);
  });

  async function addTodo({
    categoryId = '',
    memo = '',
    dateKey = state.selectedDateKey,
    startTime,
    endTime,
  } = {}) {
    if (!isValidDateKey(dateKey)) {
      alert('올바른 날짜를 선택해줘.');
      throw new Error('Invalid work calendar date.');
    }
    const requestedTimes =
      typeof startTime === 'undefined' && typeof endTime === 'undefined'
        ? null
        : validateWorkCategoryTimes(startTime, endTime);
    if (
      (typeof startTime !== 'undefined' || typeof endTime !== 'undefined') &&
      !requestedTimes
    ) {
      throw createHandledCalendarError('Invalid work todo times.');
    }
    if (
      state.isAddingTodo ||
      (state.store[dateKey] || []).length > 0
    ) {
      renderAll();
      alert('선택한 날짜에는 이미 업무 일정이 있어.');
      throw createHandledCalendarError(
        'Selected date already has a work todo.',
      );
    }

    const safeMemo = String(memo || '').trim();
    state.isAddingTodo = true;
    renderAll();

    try {
      const category = await refreshCategories(categoryId);

      if (!category?.id) {
        state.isAddingTodo = false;
        renderAll();
        alert('근무형태를 선택해줘.');
        throw new Error('A work category is required.');
      }
      const times = requestedTimes || resolveWorkCalendarTimeRange({ category });

      const nextTodo = await insertTodo({
        userId: state.userId,
        dateKey,
        memo: safeMemo,
        startTime: times.startTime,
        endTime: times.endTime,
        category,
      });

      state.selectedDateKey = dateKey;
      const [year, month] = dateKey.split('-').map(Number);
      state.viewDate = new Date(year, month - 1, 1);
      await reloadStoreForMode();
      state.isAddingTodo = false;

      memoInput.value = '';
      autoResizeTextarea(memoInput);

      renderAll();
      state.group?.refresh?.();
      scheduleCalendarWidgetRefresh();
      refreshGroupBackupNeeded();
      return nextTodo;
    } catch (error) {
      state.isAddingTodo = false;
      renderAll();
      if (isWorkDateUniqueConflict(error)) {
        alert('선택한 날짜에는 이미 업무 일정이 있어.');
        throw createHandledCalendarError('Work date unique conflict.');
      }
      if (
        error?.message !== 'A work category is required.' &&
        !error?.calendarUserHandled
      ) {
        alert('업무 일정 추가에 실패했어. 잠시 후 다시 시도해줘.');
      }
      throw error;
    }
  }

  entrySheetOpen?.addEventListener('click', () => {
    openTodoCreate(entrySheetOpen);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    try {
      await addTodo({
        categoryId: typeSelect.value,
        memo: memoInput.value,
      });
    } catch {
      // addTodo에서 사용자 안내와 상태 복원을 처리한다.
    }
  });

  memoInput.addEventListener('input', () => {
    autoResizeTextarea(memoInput);
  });

  repeatForm?.addEventListener('submit', async (event) => {
    event.preventDefault();

    await applyWorkRepeatPattern({
      patternStartKey: repeatStartInput?.value || '',
      patternEndKey: repeatEndInput?.value || '',
      repeatUntilKey: repeatUntilInput?.value || '',
    });
  });

  if (repeatToggle && repeatPanel) {
    repeatToggle.addEventListener('click', () => {
      if (repeatPanel.hidden) {
        openRepeatModal();
        return;
      }

      closeRepeatModal();
    });

    repeatPanel.addEventListener('click', (event) => {
      if (event.target !== repeatPanel) return;
      closeRepeatModal();
    });
  }

  repeatClose?.addEventListener('click', () => {
    closeRepeatModal();
  });

  repeatCancel?.addEventListener('click', () => {
    closeRepeatModal();
  });

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

  categoryClose?.addEventListener('click', () => {
    closeCategoryModal();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (repeatPanel && !repeatPanel.hidden) {
      closeRepeatModal();
      return;
    }

    if (categoryPanel && !categoryPanel.hidden) {
      closeCategoryModal();
    }
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

  if (categoryStartTimeInput && categoryEndTimeInput) {
    setWorkCategoryTimeInputValue(categoryStartTimeInput, '', {
      emptyLabel: '시작시간 지정',
    });
    setWorkCategoryTimeInputValue(categoryEndTimeInput, '', {
      emptyLabel: '종료시간 지정',
      isEnd: true,
    });

    bindWorkCategoryTimeInput({
      input: categoryStartTimeInput,
      getStartTime: () => categoryStartTimeInput.dataset.time,
      emptyLabel: '시작시간 지정',
      ariaLabel: '새 업무 카테고리 시작시간 선택',
      onChange: (nextTime) => {
        if (!nextTime) {
          setWorkCategoryTimeInputValue(categoryEndTimeInput, '', {
            emptyLabel: '종료시간 지정',
            isEnd: true,
          });
          return;
        }
        setWorkCategoryTimeInputValue(
          categoryEndTimeInput,
          categoryEndTimeInput.dataset.time,
          {
            emptyLabel: '종료시간 지정',
            isEnd: true,
            startTime: nextTime,
          },
        );
      },
    });
    bindWorkCategoryTimeInput({
      input: categoryEndTimeInput,
      getStartTime: () => categoryStartTimeInput.dataset.time,
      isEnd: true,
      emptyLabel: '종료시간 지정',
      ariaLabel: '새 업무 카테고리 종료시간 선택',
    });
  }

  if (categoryForm && categoryNameInput && categoryColorInput) {
    let isAddingCategory = false;
    categoryForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (isAddingCategory) return;

      const name = normalizeCategoryName(categoryNameInput.value);
      const color = normalizeColor(categoryColorInput.value);
      const times = validateWorkCategoryTimes(
        categoryStartTimeInput?.dataset.time,
        categoryEndTimeInput?.dataset.time,
      );

      if (!name) {
        categoryNameInput.focus();
        return;
      }
      if (!times) return;

      const duplicated = state.categories.some(
        (category) => category.name.trim().toLowerCase() === name.toLowerCase(),
      );

      if (duplicated) {
        alert('이미 같은 이름의 카테고리가 있어.');
        categoryNameInput.focus();
        return;
      }

      const submitButton = categoryForm.querySelector('[type="submit"]');
      isAddingCategory = true;
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '추가 중';
      }

      try {
        const nextCategory = await insertCategory({
          userId: state.userId,
          name,
          color,
          startTime: times.startTime,
          endTime: times.endTime,
          sortOrder: 100 + state.categories.length,
        });

        state.categories = sortCategories([...state.categories, nextCategory]);
        typeSelect.value = nextCategory.id;
        categoryNameInput.value = '';
        categoryColorInput.value = '#eaffd7';
        setWorkCategoryTimeInputValue(categoryStartTimeInput, '', {
          emptyLabel: '시작시간 지정',
        });
        setWorkCategoryTimeInputValue(categoryEndTimeInput, '', {
          emptyLabel: '종료시간 지정',
          isEnd: true,
        });

        renderAll();
        syncOpenCategorySelect(nextCategory.id);

        renderCategoryPalette({
          root: categoryPalette,
          colorInput: categoryColorInput,
        });
      } catch (error) {
        alert('카테고리 추가에 실패했어. 이름 중복 여부를 확인해줘.');
      } finally {
        isAddingCategory = false;
        if (submitButton?.isConnected) {
          submitButton.disabled = false;
          submitButton.textContent = '추가';
        }
      }
    });
  }

  renderAll();
}

export async function initWorkCalendar() {
  const previewRoot = document.getElementById('workCalendarPreview');
  const pageRoot = document.getElementById('workCalendarPage');
  const loadingRegion = document.getElementById('workCalendarLoadingRegion');

  if (!previewRoot && !pageRoot) return;

  bindPreviewLinkLoginGuard();
  const loadingController = loadingRegion
    ? createCalendarLoadingController({ root: loadingRegion })
    : null;

  const initialize = async () => {
    await loadCalendarGroupsModule();
    await renderPreviewCalendar();
    await initPageCalendar(loadingController);
  };

  try {
    if (loadingController) {
      await loadingController.runLatest(initialize, {
        key: 'work:initial-load',
      });
    } else {
      await initialize();
    }
  } catch (error) {
    console.error('[work-calendar] init failed:', error);

    if (pageRoot) {
      alert('업무 캘린더를 불러오지 못했어. 잠시 후 다시 시도해줘.');
    }
  }
}
