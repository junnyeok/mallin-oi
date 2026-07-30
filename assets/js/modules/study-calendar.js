// assets/js/modules/study-calendar.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';
import { scheduleCalendarWidgetRefresh } from './calendar-native-widgets.js';
import { openCalendarDetailSheet } from './calendar-entry-sheet.js';
import { createCalendarLoadingController } from './calendar-loading.js';
import {
  formatCalendarTimeLabel,
  joinLocalDateTimeValue,
  normalizeCalendarTime,
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

const TABLE_NAME = 'study_calendar_todos';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const CATEGORY_TABLE_NAME = 'study_calendar_categories';

const DEFAULT_CATEGORIES = [
  {
    name: '공부',
    slug: 'study',
    color: '#e7f6ff',
    is_default: true,
    sort_order: 10,
  },
  {
    name: '운동',
    slug: 'workout',
    color: '#eaffd7',
    is_default: true,
    sort_order: 20,
  },
  {
    name: '기타',
    slug: 'etc',
    color: '#fff1d1',
    is_default: true,
    sort_order: 30,
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
    categories.find((category) => category.slug === 'etc') ||
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

function getTodoCategorySelectValue(todo, categories = []) {
  const category = getCategoryByTodo(todo, categories);
  return category?.id || getFallbackCategory(categories)?.id || '';
}

function getTypeLabel(type, categories = []) {
  const category = categories.find((item) => item.slug === type);
  return category?.name || '기타';
}

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

function appendTypeBadges(root, todos = [], categories = []) {
  const wrap = document.createElement('div');
  wrap.className = 'study-calendar-day__badges';

  todos.forEach((todo) => {
    const title = String(todo.text || '').trim();
    if (!title) return;

    const category = getCategoryByTodo(todo, categories);

    const badge = document.createElement('span');
    badge.className = 'study-calendar-day__badge';
    badge.style.setProperty('--todo-category-color', category.color);
    badge.style.setProperty(
      '--todo-category-text',
      getCategoryTextColor(category.color),
    );

    if (todo.done) {
      badge.classList.add('is-done');
    }

    badge.textContent = title;
    const timeLabel = todo.todoTime
      ? ` · ${formatCalendarTimeLabel(todo.todoTime)}`
      : '';
    badge.title = `${category.name} · ${title}${timeLabel}`;

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
    text: row.todo_text,
    memo: row.memo || '',
    done: Boolean(row.is_done),
    todoTime: normalizeCalendarTime(row.todo_time),
    todoEndDate: row.todo_end_date || null,
    todoEndTime: normalizeCalendarTime(row.todo_end_time),
    type: row.todo_type || row.study_calendar_categories?.slug || 'etc',
    categoryId: row.category_id || row.study_calendar_categories?.id || null,
    date: row.todo_date,
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

  Object.values(grouped).forEach((todos) => {
    todos.sort((left, right) => {
      const leftTime = left.todoTime || '99:99';
      const rightTime = right.todoTime || '99:99';
      return leftTime.localeCompare(rightTime);
    });
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
      todo_date,
      todo_type,
      category_id,
      todo_text,
      memo,
      todo_time,
      todo_end_date,
      todo_end_time,
      is_done,
      created_at,
      study_calendar_categories (
        id,
        name,
        slug,
        color
      )
    `,
    )
    .eq('user_id', userId)
    .order('todo_date', { ascending: true })
    .order('todo_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[study-calendar] fetchUserTodos error:', error.message);
    throw error;
  }

  return groupTodosByDate(data || []);
}

async function fetchUserCategories(userId) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, created_at',
    )
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[study-calendar] fetchUserCategories error:', error.message);
    throw error;
  }

  return data || [];
}

async function fetchCategoryById(userId, categoryId) {
  if (!userId || !categoryId) return null;

  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, created_at',
    )
    .eq('user_id', userId)
    .eq('id', categoryId)
    .maybeSingle();

  if (error) {
    console.error('[study-calendar] fetchCategoryById error:', error.message);
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
      '[study-calendar] ensureDefaultCategories fetch error:',
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
        '[study-calendar] ensureDefaultCategories insert error:',
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
    })
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, created_at',
    )
    .single();

  if (error) {
    console.error('[study-calendar] insertCategory error:', error.message);
    throw error;
  }

  return data;
}

async function updateCategory({ categoryId, name, color }) {
  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .update({
      name: normalizeCategoryName(name),
      color: normalizeColor(color),
    })
    .eq('id', categoryId)
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, created_at',
    )
    .single();

  if (error) {
    console.error('[study-calendar] updateCategory error:', error.message);
    throw error;
  }

  return data;
}

async function moveTodosToCategory({ userId, fromCategoryId, toCategory }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      category_id: toCategory.id,
      todo_type: toCategory.slug,
    })
    .eq('user_id', userId)
    .eq('category_id', fromCategoryId);

  if (error) {
    console.error('[study-calendar] moveTodosToCategory error:', error.message);
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
    console.error('[study-calendar] deleteCategoryById error:', error.message);
    throw error;
  }
}

async function insertTodo({
  userId,
  dateKey,
  text,
  memo,
  todoTime,
  todoEndDate,
  todoEndTime,
  category,
}) {
  const latestCategory = category?.id
    ? await fetchCategoryById(userId, category.id)
    : null;
  const safeCategory = latestCategory || category || DEFAULT_CATEGORIES[2];
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      todo_date: dateKey,
      todo_type: safeCategory.slug || 'etc',
      category_id: safeCategory.id || null,
      todo_text: text,
      memo: memo || '',
      todo_time: normalizeCalendarTime(todoTime) || null,
      todo_end_date: todoEndDate || null,
      todo_end_time: normalizeCalendarTime(todoEndTime) || null,
      is_done: false,
    })
    .select(
      `
      id,
      user_id,
      todo_date,
      todo_type,
      category_id,
      todo_text,
      memo,
      todo_time,
      todo_end_date,
      todo_end_time,
      is_done,
      created_at,
      study_calendar_categories (
        id,
        name,
        slug,
        color
      )
    `,
    )
    .single();

  if (error) {
    console.error('[study-calendar] insertTodo error:', error.message);
    throw error;
  }

  return normalizeTodo(data);
}

async function updateTodoDone({ todoId, done }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ is_done: done })
    .eq('id', todoId);

  if (error) {
    console.error('[study-calendar] updateTodoDone error:', error.message);
    throw error;
  }
}

async function saveTodoAtomic({
  todoId,
  text,
  memo,
  dateKey,
  todoTime,
  todoEndDate,
  todoEndTime,
  categoryId,
}) {
  const { error } = await supabase.rpc('save_study_calendar_todo', {
    p_todo_id: todoId,
    p_todo_text: text,
    p_memo: memo || '',
    p_todo_date: dateKey,
    p_todo_time: normalizeCalendarTime(todoTime) || null,
    p_todo_end_date: todoEndDate || null,
    p_todo_end_time: normalizeCalendarTime(todoEndTime) || null,
    p_category_id: categoryId,
  });

  if (error) {
    console.error('[study-calendar] saveTodoAtomic error:', error.message);
    throw error;
  }
}

async function deleteTodoById(todoId) {
  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', todoId);

  if (error) {
    console.error('[study-calendar] deleteTodoById error:', error.message);
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
    weekday.className = 'study-calendar-weekday';
    weekday.textContent = day;
    root.append(weekday);
  });
}

function renderPreviewLoginMessage(root) {
  root.innerHTML = '';

  const empty = document.createElement('div');
  empty.className = 'study-calendar-mini__empty';
  empty.textContent =
    '로그인하면 내 계정 전용 자기개발 캘린더를 사용할 수 있습니다.';

  root.append(empty);
}

async function renderPreviewCalendar() {
  const root = document.getElementById('studyCalendarPreview');
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
  monthHead.className = 'study-calendar-mini__month';

  const title = document.createElement('strong');
  title.className = 'study-calendar-mini__month-title';
  title.textContent = getMonthTitle(today);

  const hint = document.createElement('span');
  hint.className = 'study-calendar-mini__hint';
  hint.textContent = '내 계정에 저장된 기록만 표시됩니다.';

  monthHead.append(title, hint);

  const grid = document.createElement('div');
  grid.className = 'study-calendar-grid';

  renderWeekdays(grid);

  const dates = getMonthDates(today, { includeOutside: false });

  dates.forEach((item) => {
    const dayEl = document.createElement('div');
    dayEl.className = 'study-calendar-day';

    if (!item) {
      dayEl.classList.add('study-calendar-day--muted');
      grid.append(dayEl);
      return;
    }

    const dateKey = toDateKey(item.date);
    const todos = store[dateKey] || [];

    if (dateKey === todayKey) {
      dayEl.classList.add('study-calendar-day--today');
    }

    const number = document.createElement('span');
    number.className = 'study-calendar-day__number';
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
  button.className = 'study-calendar-day study-calendar-day--button';
  button.dataset.date = dateKey;

  if (!isCurrentMonth) {
    button.classList.add('study-calendar-day--muted');
  }

  if (dateKey === todayKey) {
    button.classList.add('study-calendar-day--today');
  }

  if (dateKey === selectedDateKey) {
    button.classList.add('study-calendar-day--selected');
  }

  const number = document.createElement('span');
  number.className = 'study-calendar-day__number';
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
  onToggle,
  onDelete,
  onSaveEdit,
  onOpenDetail,
}) {
  const list = document.getElementById('studyTodoList');
  const empty = document.getElementById('studyTodoEmpty');
  const selectedDate = document.getElementById('studySelectedDate');

  if (!list || !empty || !selectedDate) return;

  const todos = store[selectedDateKey] || [];

  selectedDate.textContent = getReadableDate(selectedDateKey);
  list.innerHTML = '';

  empty.hidden = todos.length > 0;

  todos.forEach((todo) => {
    const item = document.createElement('li');
    item.className = 'study-todo-item';

    if (todo.done) {
      item.classList.add('is-done');
    }

    const checkbox = document.createElement('input');
    checkbox.className = 'study-todo-item__check';
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(todo.done);
    checkbox.setAttribute('aria-label', `${todo.text} 완료 처리`);

    checkbox.addEventListener('change', () => {
      onToggle(todo.id);
    });

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'study-todo-item__open';
    openButton.setAttribute('aria-label', `${todo.text} 상세보기`);
    const body = document.createElement('div');
    body.className = 'study-todo-item__body';
    const category = getCategoryByTodo(todo, categories);

    const type = document.createElement('span');
    type.className = 'study-todo-item__type';
    type.textContent = category.name || todo.type || '기타';
    type.style.setProperty('--todo-category-color', category.color);
    type.style.setProperty('--todo-category-text', getCategoryTextColor(category.color));

    const text = document.createElement('strong');
    text.className = 'study-todo-item__text';
    text.textContent = todo.text || '할 일';

    const memo = document.createElement('p');
    memo.className = 'study-todo-item__summary';
    const timeSummary = todo.todoTime
      ? `${formatCalendarTimeLabel(todo.todoTime)}${
          todo.todoEndTime
            ? ` ~ ${formatCalendarTimeLabel(todo.todoEndTime)}`
            : ''
        }`
      : '시간 미지정';
    const memoText = String(todo.memo || '').trim();
    memo.textContent = memoText ? `${timeSummary} · ${memoText}` : timeSummary;

    openButton.addEventListener('click', () => onOpenDetail?.(todo, openButton));
    body.append(type, text, memo);
    openButton.append(body);
    item.append(checkbox, openButton);
    list.append(item);
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
    button.className = 'study-category-palette__button';
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
  onSave,
  onDelete,
}) {
  if (!root) return;

  root.innerHTML = '';

  categories.forEach((category) => {
    const item = document.createElement('li');
    item.className = 'study-category-item';

    const dot = document.createElement('span');
    dot.className = 'study-category-item__dot';
    dot.style.setProperty('--category-color', category.color);

    const nameInput = document.createElement('input');
    nameInput.className = 'study-category-item__name';
    nameInput.type = 'text';
    nameInput.maxLength = 20;
    nameInput.value = category.name;
    nameInput.setAttribute('aria-label', '카테고리 이름 수정');

    const colorInput = document.createElement('input');
    colorInput.className = 'study-category-item__color';
    colorInput.type = 'color';
    colorInput.value = normalizeColor(category.color);
    colorInput.setAttribute('aria-label', '카테고리 색상 수정');

    const saveButton = document.createElement('button');
    saveButton.type = 'button';
    saveButton.className = 'study-category-item__button';
    saveButton.textContent = '저장';

    saveButton.addEventListener('click', () => {
      onSave({
        category,
        name: nameInput.value,
        color: colorInput.value,
      });
    });

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'study-category-item__button';
    deleteButton.textContent = '삭제';

    if (category.is_default) {
      deleteButton.disabled = true;
      deleteButton.title = '기본 카테고리는 삭제할 수 없어.';
    }

    deleteButton.addEventListener('click', () => {
      onDelete(category);
    });

    item.append(dot, nameInput, colorInput, saveButton, deleteButton);
    root.append(item);
  });
}

function renderPageCalendar(state) {
  const grid = document.getElementById('studyCalendarGrid');
  const monthLabel = document.getElementById('studyCalendarMonthLabel');

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
  const pageRoot = document.getElementById('studyCalendarPage');
  const todoForm = document.getElementById('studyTodoForm');
  const todoList = document.getElementById('studyTodoList');
  const todoEmpty = document.getElementById('studyTodoEmpty');
  const selectedDate = document.getElementById('studySelectedDate');
  const grid = document.getElementById('studyCalendarGrid');
  const monthLabel = document.getElementById('studyCalendarMonthLabel');

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

async function initPageCalendar(loadingController) {
  const pageRoot = document.getElementById('studyCalendarPage');
  if (!pageRoot) return;

  const user = await getCurrentUser();

  if (!user?.id) {
    renderPageLoginRequired();
    return;
  }

  const prevBtn = document.getElementById('studyCalendarPrevBtn');
  const nextBtn = document.getElementById('studyCalendarNextBtn');
  const form = document.getElementById('studyTodoForm');
  const input = document.getElementById('studyTodoInput');
  const typeSelect = document.getElementById('studyTodoType');
  const memoInput = document.getElementById('studyTodoMemo');
  const entrySheetOpen = document.getElementById('studyEntrySheetOpen');
  const categoryToggle = document.getElementById('studyCategoryToggle');
  const categoryPanel = document.getElementById('studyCategoryPanel');
  const categoryClose = document.getElementById('studyCategoryClose');
  const categoryForm = document.getElementById('studyCategoryForm');
  const categoryNameInput = document.getElementById('studyCategoryName');
  const categoryColorInput = document.getElementById('studyCategoryColor');
  const categoryPalette = document.getElementById('studyCategoryPalette');
  const categoryList = document.getElementById('studyCategoryList');

  if (!prevBtn || !nextBtn || !form || !input || !typeSelect || !memoInput) {
    return;
  }

  const today = new Date();

  const state = {
    userId: user.id,
    viewDate: new Date(today.getFullYear(), today.getMonth(), 1),
    selectedDateKey: getTodayKey(),
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
    state.personalStore = await fetchUserTodos(state.userId); state.store = state.personalStore;
  }
  async function reloadStoreForMode() {
    state.personalStore = await fetchUserTodos(state.userId); state.store = state.personalStore;
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
    form.hidden = false;
    renderCategorySelect(typeSelect, state.categories);

    renderPageCalendar(state);

    renderTodoList({
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      categories: state.categories,
      onToggle: toggleTodo,
      onDelete: deleteTodo,
      onSaveEdit: saveTodoEdit,
      onOpenDetail: openTodoDetail,
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

    const [year, month] = dateKey.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);

    renderAll();

  }

  function selectGroupEvent(event) {
    const dateKey = String(event?.event_date || '').slice(0, 10);
    if (dateKey) selectDate(dateKey);
  }

  async function toggleTodo(todoId) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target) return;

    const nextDone = !target.done;

    try {
      await updateTodoDone({
        todoId,
        done: nextDone,
      });

      target.done = nextDone;
      renderAll();
      refreshGroupBackupNeeded();
    } catch (error) {
      alert('완료 상태 변경에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function deleteTodo(todoId) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target) return false;

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
      alert('할 일 삭제에 실패했어. 잠시 후 다시 시도해줘.');
      throw error;
    }
  }

  function validateTimeRange({
    startDate,
    startTime,
    endDate,
    endTime,
    requireStartTime = false,
  }) {
    if (!isValidDateKey(startDate)) {
      alert('올바른 시작 날짜를 선택해줘.');
      return false;
    }
    if (requireStartTime && !startTime) {
      alert('시작시간을 지정해줘.');
      return false;
    }
    if (!endDate && !endTime) return true;
    if (!startTime) {
      alert('종료시간을 지정하려면 시작시간을 먼저 지정해줘.');
      return false;
    }
    if (!isValidDateKey(endDate) || !endTime) {
      alert('종료 날짜와 시간을 모두 지정해줘.');
      return false;
    }
    if (endDate < startDate) {
      alert('종료 날짜는 시작 날짜보다 빠를 수 없어.');
      return false;
    }
    if (endDate === startDate && endTime < startTime) {
      alert('같은 날 종료시간은 시작시간보다 빠를 수 없어.');
      return false;
    }
    return true;
  }

  async function saveTodoEdit(
    todoId,
    { text, memo, category, dateKey, todoTime, todoEndDate, todoEndTime },
  ) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);
    const fallback = getFallbackCategory(state.categories);
    const nextCategory = category || fallback;

    if (!target) return;

    const nextText = String(text || '').trim();
    const nextMemo = String(memo || '');
    const nextDateKey = String(dateKey || target.date || state.selectedDateKey);
    const nextTime = normalizeCalendarTime(todoTime);
    const nextEndDate = String(todoEndDate || '');
    const nextEndTime = normalizeCalendarTime(todoEndTime);

    if (!nextText || !nextCategory?.id || !isValidDateKey(nextDateKey)) {
      alert('올바른 날짜와 제목을 입력해줘.');
      throw new Error('Invalid study calendar values.');
    }
    if (
      !validateTimeRange({
        startDate: nextDateKey,
        startTime: nextTime,
        endDate: nextEndDate,
        endTime: nextEndTime,
      })
    ) {
      throw new Error('Invalid study calendar time range.');
    }

    await saveTodoAtomic({
      todoId,
      text: nextText,
      memo: nextMemo,
      dateKey: nextDateKey,
      todoTime: nextTime,
      todoEndDate: nextEndDate || null,
      todoEndTime: nextEndTime,
      categoryId: nextCategory.id,
    });
    await reloadStoreForMode();
    state.selectedDateKey = nextDateKey;
    const [year, month] = nextDateKey.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);
    renderAll();
    scheduleCalendarWidgetRefresh();
    refreshGroupBackupNeeded();
  }

  function openStudyDetailSheet({ todo = null, opener = entrySheetOpen } = {}) {
    const isEdit = Boolean(todo?.id);
    const category = isEdit
      ? getCategoryByTodo(todo, state.categories)
      : getFallbackCategory(state.categories);
    const startDate = isEdit
      ? todo.date || state.selectedDateKey
      : state.selectedDateKey;
    const startTime = isEdit ? normalizeCalendarTime(todo.todoTime) : '';
    const endDate = isEdit ? String(todo.todoEndDate || '') : '';
    const endTime = isEdit ? normalizeCalendarTime(todo.todoEndTime) : '';

    openCalendarDetailSheet({
      calendarType: 'study',
      mode: isEdit ? 'edit' : 'create',
      title: isEdit ? '할 일' : '할 일 추가',
      submitLabel: isEdit ? '저장' : '완료',
      opener,
      fields: [
        { key: 'title', label: '제목', value: isEdit ? todo.text || '' : '' },
        {
          key: 'categoryId',
          label: '카테고리',
          type: 'select',
          value: isEdit
            ? getTodoCategorySelectValue(todo, state.categories)
            : category?.id || '',
          options: state.categories.map((item) => ({
            value: item.id,
            label: item.name,
          })),
          onSettings: openCategoryModal,
        },
        {
          key: 'studyStart',
          label: '시작',
          type: 'calendar-datetime',
          value: joinLocalDateTimeValue(startDate, startTime),
          required: true,
          allowEmptyTime: true,
          timePlaceholder: '시작시간 지정',
        },
        {
          key: 'studyEnd',
          label: '종료',
          type: 'calendar-datetime',
          value: endDate && endTime
            ? joinLocalDateTimeValue(endDate, endTime)
            : '',
          optional: true,
          optionalLabel: '종료시간 지정',
          clearLabel: '해제',
          getDefaultValue: ({ getValue }) => getValue('studyStart'),
        },
        {
          key: 'memo',
          label: '메모',
          type: 'textarea',
          value: isEdit ? todo.memo || '' : '',
        },
      ],
      onSave: async (values) => {
        const nextCategory =
          state.categories.find((item) => item.id === values.categoryId) ||
          category ||
          getFallbackCategory(state.categories);
        const nextStart = splitLocalDateTimeValue(values.studyStart, {
          date: startDate,
          time: startTime,
        });
        const nextEnd = splitLocalDateTimeValue(values.studyEnd);
        const nextText = String(values.title || '').trim();

        if (!nextText) {
          alert('제목을 입력해줘.');
          throw new Error('Missing study title.');
        }
        if (
          !validateTimeRange({
            startDate: nextStart.date,
            startTime: nextStart.time,
            endDate: nextEnd.date,
            endTime: nextEnd.time,
            requireStartTime: !isEdit,
          })
        ) {
          throw new Error('Invalid study calendar time range.');
        }

        if (isEdit) {
          await saveTodoEdit(todo.id, {
            text: nextText,
            memo: values.memo,
            category: nextCategory,
            dateKey: nextStart.date,
            todoTime: nextStart.time,
            todoEndDate: nextEnd.date || null,
            todoEndTime: nextEnd.time,
          });
          return;
        }

        if (state.isAddingTodo) throw new Error('Study todo save in progress.');
        state.isAddingTodo = true;
        try {
          const latestCategory = await refreshCategories(nextCategory?.id || '');
          const nextTodo = await insertTodo({
            userId: state.userId,
            dateKey: nextStart.date,
            text: nextText,
            memo: String(values.memo || ''),
            todoTime: nextStart.time,
            todoEndDate: nextEnd.date || null,
            todoEndTime: nextEnd.time,
            category: latestCategory,
          });
          state.selectedDateKey = nextStart.date;
          const [year, month] = nextStart.date.split('-').map(Number);
          state.viewDate = new Date(year, month - 1, 1);
          await reloadStoreForMode();
          renderAll();
          state.group?.refresh?.();
          scheduleCalendarWidgetRefresh();
          refreshGroupBackupNeeded();
          return nextTodo;
        } catch (error) {
          alert('할 일 추가에 실패했어. 잠시 후 다시 시도해줘.');
          throw error;
        } finally {
          state.isAddingTodo = false;
        }
      },
      onDelete: isEdit
        ? async () => deleteTodo(todo.id)
        : undefined,
    });
  }

  function openTodoDetail(todo, opener) {
    openStudyDetailSheet({ todo, opener });
  }

  state.onSelect = selectDate;
  state.onSelectGroupEvent = selectGroupEvent;

  state.group = await initCalendarGroupBar({
    calendarType: 'study',
    pageRoot,
    getViewDate: () => state.viewDate,
    renderAll,
    onModeChange: handleGroupModeChange,
    runCalendarLoad: loadingController?.runLatest,
  });
  renderAll();

  function openCategoryModal() {
    if (!categoryToggle || !categoryPanel) return;

    categoryPanel.hidden = false;
    categoryToggle.setAttribute('aria-expanded', 'true');
    document.body.classList.add('study-category-modal-open');

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
    document.body.classList.remove('study-category-modal-open');

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

  async function saveCategory({ category, name, color }) {
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
      });

      const selectedCategoryId = typeSelect.value;

      state.categories = state.categories.map((item) =>
        item.id === updatedCategory.id ? updatedCategory : item,
      );

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
      console.error('[study-calendar] month load failed:', error);
    }
  }

  prevBtn.addEventListener('click', () => {
    void changeMonth(-1);
  });

  nextBtn.addEventListener('click', () => {
    void changeMonth(1);
  });

  entrySheetOpen?.addEventListener('click', () => {
    openStudyDetailSheet({ opener: entrySheetOpen });
  });

  memoInput.addEventListener('input', () => {
    autoResizeTextarea(memoInput);
  });

  autoResizeTextarea(memoInput);

  renderAll();
}

function bindPreviewLinkLoginGuard() {
  const link = document.getElementById('studyCalendarPreviewLink');
  if (!link) return;

  link.addEventListener('click', async (event) => {
    const user = await getCurrentUser();

    if (user?.id) return;

    event.preventDefault();

    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message:
        '자기개발 캘린더는 계정별로 저장되기 때문에 로그인 후 사용할 수 있어.',
      confirmText: '로그인하러 가기',
      cancelText: '닫기',
    });

    saveRedirect(window.location.pathname + window.location.search);
    window.location.href = loginHref();
  });
}

export async function initStudyCalendar() {
  const previewRoot = document.getElementById('studyCalendarPreview');
  const pageRoot = document.getElementById('studyCalendarPage');
  const loadingRegion = document.getElementById('studyCalendarLoadingRegion');

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
        key: 'study:initial-load',
      });
    } else {
      await initialize();
    }
  } catch (error) {
    console.error('[study-calendar] init failed:', error);

    if (pageRoot) {
      alert('자기개발 캘린더를 불러오지 못했어. 잠시 후 다시 시도해줘.');
    }
  }
}
