// assets/js/modules/work-calendar.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';

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
    text: row.work_text,
    memo: row.memo || row.note || '',
    done: Boolean(row.is_done),
    type: row.work_type || row.work_calendar_categories?.slug || 'etc',
    categoryId: row.category_id || row.work_calendar_categories?.id || null,
    date: row.work_date,
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
      'id, user_id, name, slug, color, is_default, sort_order, created_at',
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
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color
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
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color
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

async function insertTodo({ userId, dateKey, memo, category }) {
  const safeCategory = category || DEFAULT_CATEGORIES[4];
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
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color
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
      is_done,
      created_at,
      work_calendar_categories (
        id,
        name,
        slug,
        color
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

async function updateTodoMemo({ todoId, memo }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ memo: memo || '' })
    .eq('id', todoId);

  if (error) {
    console.error('[work-calendar] updateTodoMemo error:', error.message);
    throw error;
  }
}

async function updateTodoCategory({ todoId, category }) {
  const fallback = getFallbackCategory([]);
  const safeCategory = category || fallback;

  const { error } = await supabase
    .from(TABLE_NAME)
    .update({
      category_id: safeCategory?.id || null,
      work_type: safeCategory?.slug || 'etc',
    })
    .eq('id', todoId);

  if (error) {
    console.error('[work-calendar] updateTodoCategory error:', error.message);
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

async function insertCategory({ userId, name, color, sortOrder }) {
  const { data, error } = await supabase
    .from(CATEGORY_TABLE_NAME)
    .insert({
      user_id: userId,
      name: normalizeCategoryName(name),
      slug: `custom-${crypto.randomUUID()}`,
      color: normalizeColor(color),
      is_default: false,
      sort_order: sortOrder || 100,
    })
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, created_at',
    )
    .single();

  if (error) {
    console.error('[work-calendar] insertCategory error:', error.message);
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

function renderCategorySelect(select, categories = []) {
  if (!select) return;

  const currentValue = select.value;
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

function renderCategoryList({ root, categories, onSave, onDelete }) {
  if (!root) return;

  root.innerHTML = '';

  categories.forEach((category) => {
    const item = makeEl('li', 'work-category-list__item');
    const dot = makeEl('span', 'work-category-list__dot');
    const input = document.createElement('input');
    const color = document.createElement('input');
    const saveButton = makeEl('button', 'work-category-list__save', '저장');
    const deleteButton = makeEl('button', 'work-category-list__delete', '삭제');

    dot.style.setProperty('--category-color', category.color);

    input.className = 'work-category-list__input';
    input.type = 'text';
    input.maxLength = 20;
    input.value = category.name;

    color.className = 'work-category-list__color';
    color.type = 'color';
    color.value = normalizeColor(category.color);
    color.setAttribute('aria-label', `${category.name} 색상`);

    saveButton.type = 'button';
    deleteButton.type = 'button';
    deleteButton.disabled = Boolean(category.is_default);

    saveButton.addEventListener('click', () => {
      onSave?.({
        category,
        name: input.value,
        color: color.value,
      });
    });

    deleteButton.addEventListener('click', () => {
      onDelete?.(category);
    });

    item.append(dot, input, color, saveButton, deleteButton);
    root.append(item);
  });
}

function renderCalendarGrid({
  root,
  viewDate,
  selectedDateKey,
  store,
  categories,
  onSelect,
  isMini = false,
}) {
  if (!root) return;

  root.innerHTML = '';

  WEEKDAYS.forEach((weekday) => {
    root.append(makeEl('div', 'work-calendar-weekday', weekday));
  });

  const todayKey = getTodayKey();
  const cells = getCalendarCells(viewDate);

  cells.forEach((cell) => {
    const dateNumber = cell.date.getDate();
    const todos = store[cell.dateKey] || [];
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

function renderTodoList({
  root,
  empty,
  selectedDateKey,
  store,
  categories,
  onDelete,
  onMemoChange,
  onCategoryChange,
}) {
  if (!root) return;

  const todos = store[selectedDateKey] || [];
  root.innerHTML = '';

  if (empty) {
    empty.hidden = todos.length > 0;
  }

  todos.forEach((todo) => {
    const category = getCategoryByTodo(todo, categories);
    const memo = String(todo.memo || '').trim();

    const item = makeEl('li', 'work-todo-item');
    const top = makeEl('div', 'work-todo-item__top');
    const categorySelect = document.createElement('select');
    const summary = makeEl(
      'span',
      'work-todo-item__summary',
      memo || '메모 없음',
    );
    const actions = makeEl('div', 'work-todo-item__actions');
    const editButton = makeEl('button', 'work-todo-item__edit', '펼치기');
    const saveMemoButton = makeEl('button', 'work-todo-item__save', '저장');
    const deleteButton = makeEl('button', 'work-todo-item__delete', '삭제');
    const detail = makeEl('div', 'work-todo-item__detail');
    const detailActions = makeEl('div', 'work-todo-item__detail-actions');
    const memoInput = document.createElement('textarea');

    categorySelect.className = 'work-todo-item__category-select';
    categorySelect.setAttribute('aria-label', '근무형태 수정');

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

    categorySelect.addEventListener('change', async () => {
      const previousValue = getTodoCategorySelectValue(todo, categories);
      const nextCategory =
        categories.find(
          (categoryItem) => categoryItem.id === categorySelect.value,
        ) || getFallbackCategory(categories);

      if (!nextCategory?.id || nextCategory.id === previousValue) {
        categorySelect.value = previousValue;
        return;
      }

      try {
        await onCategoryChange?.(todo.id, nextCategory);
      } catch (error) {
        alert('근무형태 변경에 실패했어. 잠시 후 다시 시도해줘.');
        categorySelect.value = previousValue;
      }
    });

    editButton.type = 'button';
    saveMemoButton.type = 'button';
    deleteButton.type = 'button';

    memoInput.className = 'work-todo-item__memo';
    memoInput.rows = 3;
    memoInput.value = todo.memo || '';
    memoInput.placeholder = '메모를 입력하세요.';
    memoInput.setAttribute('aria-label', '업무 캘린더 메모 수정');

    detail.hidden = true;
    detailActions.append(saveMemoButton);
    detail.append(memoInput, detailActions);

    editButton.addEventListener('click', () => {
      detail.hidden = !detail.hidden;
      editButton.textContent = detail.hidden ? '펼치기' : '접기';

      if (!detail.hidden) {
        autoResizeTextarea(memoInput);
        memoInput.focus();
      }
    });

    deleteButton.addEventListener('click', () => {
      onDelete?.(todo.id);
    });

    memoInput.addEventListener('input', () => {
      autoResizeTextarea(memoInput);
    });

    saveMemoButton.addEventListener('click', async () => {
      saveMemoButton.disabled = true;
      saveMemoButton.textContent = '저장 중';

      try {
        await onMemoChange?.(todo.id, memoInput.value);
      } finally {
        saveMemoButton.disabled = false;
        saveMemoButton.textContent = '저장';
      }
    });

    memoInput.addEventListener('blur', () => {
      if (String(memoInput.value || '') !== String(todo.memo || '')) {
        onMemoChange?.(todo.id, memoInput.value);
      }
    });

    actions.append(editButton, deleteButton);
    top.append(categorySelect, summary, actions);
    item.append(top, detail);
    root.append(item);
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
    onSelect: state.onSelect,
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

function openMobileTodoForm() {
  document.body.classList.add('work-todo-mobile-open');
}

function closeMobileTodoForm() {
  document.body.classList.remove('work-todo-mobile-open');
}

async function initPageCalendar() {
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
  const todoList = document.getElementById('workTodoList');
  const todoEmpty = document.getElementById('workTodoEmpty');

  const categoryToggle = document.getElementById('workCategoryToggle');
  const categoryPanel = document.getElementById('workCategoryPanel');
  const categoryClose = document.getElementById('workCategoryClose');
  const categoryForm = document.getElementById('workCategoryForm');
  const categoryNameInput = document.getElementById('workCategoryName');
  const categoryColorInput = document.getElementById('workCategoryColor');
  const categoryPalette = document.getElementById('workCategoryPalette');
  const categoryList = document.getElementById('workCategoryList');

  const repeatForm = document.getElementById('workRepeatForm');
  const repeatStartInput = document.getElementById('workRepeatStart');
  const repeatEndInput = document.getElementById('workRepeatEnd');
  const repeatUntilInput = document.getElementById('workRepeatUntil');
  const repeatSkipInput = document.getElementById('workRepeatSkipExisting');
  const repeatButton = document.getElementById('workRepeatButton');
  const repeatMessage = document.getElementById('workRepeatMessage');

  const mobileTodoFormQuery = window.matchMedia('(max-width: 720px)');

  if (!prevBtn || !nextBtn || !form || !typeSelect || !memoInput) {
    return;
  }

  const todayKey = getTodayKey();

  const state = {
    userId: user.id,
    viewDate: new Date(),
    selectedDateKey: todayKey,
    categories: await ensureDefaultCategories(user.id),
    store: await fetchUserTodos(user.id),
    onSelect: null,
  };

  function renderAll() {
    renderCategorySelect(typeSelect, state.categories);
    renderPageCalendar(state);

    renderTodoList({
      root: todoList,
      empty: todoEmpty,
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      categories: state.categories,
      onDelete: deleteTodo,
      onMemoChange: changeTodoMemo,
      onCategoryChange: changeTodoCategory,
    });

    renderCategoryList({
      root: categoryList,
      categories: state.categories,
      onSave: saveCategory,
      onDelete: removeCategory,
    });
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

    if (mobileTodoFormQuery.matches) {
      openMobileTodoForm();
    }
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
    overwrite,
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
    const targetDateKeys = overwrite ? new Set(repeatDateKeys) : new Set();
    let skippedCount = 0;

    repeatDateKeys.forEach((targetDateKey, index) => {
      const patternDay = pattern[index % patternLength];

      if (!patternDay || patternDay.todos.length === 0) return;

      const hasExistingTodos = (state.store[targetDateKey] || []).length > 0;

      if (!overwrite && hasExistingTodos) {
        skippedCount += 1;
        return;
      }

      targetDateKeys.add(targetDateKey);

      patternDay.todos.forEach((todo) => {
        const category = getCategoryByTodo(todo, state.categories);

        rowsToInsert.push({
          user_id: state.userId,
          work_date: targetDateKey,
          work_type: todo.type || category?.slug || 'etc',
          category_id: todo.categoryId || category?.id || null,
          work_text: String(category?.name || todo.text || '기타').trim(),
          memo: String(todo.memo || '').trim(),
          is_done: false,
        });
      });
    });

    if (rowsToInsert.length === 0) {
      alert(
        skippedCount > 0
          ? '이미 일정이 있어서 새로 추가된 반복근무가 없어.'
          : '반복 적용할 근무가 없어.',
      );
      return;
    }

    const ok = window.confirm(
      overwrite
        ? `기존 일정이 있는 날짜는 삭제하고 반복근무 ${rowsToInsert.length}개를 적용할까?`
        : `반복근무 ${rowsToInsert.length}개를 적용할까?`,
    );

    if (!ok) return;

    setRepeatLoading(true);
    setRepeatMessage('반복근무를 적용하는 중이야.');

    try {
      if (overwrite) {
        await deleteTodosByDateKeys({
          userId: state.userId,
          dateKeys: [...targetDateKeys],
        });
      }

      await insertRepeatTodos(rowsToInsert);

      state.store = await fetchUserTodos(state.userId);
      renderAll();

      const message =
        skippedCount > 0
          ? `반복근무가 적용됐어. 기존 일정 ${skippedCount}일은 건너뛰었어.`
          : '반복근무가 적용됐어.';

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

    if (!target) return;

    try {
      await deleteTodoById(todoId);

      state.store[state.selectedDateKey] = todos.filter(
        (todo) => todo.id !== todoId,
      );

      if (state.store[state.selectedDateKey].length === 0) {
        delete state.store[state.selectedDateKey];
      }

      renderAll();
    } catch (error) {
      alert('업무 일정 삭제에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function changeTodoCategory(todoId, category) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);
    const fallback = getFallbackCategory(state.categories);
    const nextCategory = category || fallback;

    if (!target || !nextCategory?.id) return;

    try {
      await updateTodoCategory({
        todoId,
        category: nextCategory,
      });

      target.categoryId = nextCategory.id;
      target.type = nextCategory.slug;
      renderAll();
    } catch (error) {
      alert('업무 일정 카테고리 변경에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function changeTodoMemo(todoId, memo) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target) return;

    const nextMemo = String(memo || '').trim();

    try {
      await updateTodoMemo({
        todoId,
        memo: nextMemo,
      });

      target.memo = nextMemo;
      renderAll();
    } catch (error) {
      alert('메모 수정에 실패했어. 잠시 후 다시 시도해줘.');
    }
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

      state.categories = state.categories.map((item) =>
        item.id === updatedCategory.id ? updatedCategory : item,
      );

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

  function openCategoryModal() {
    if (!categoryToggle || !categoryPanel) return;

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

  prevBtn.addEventListener('click', () => {
    state.viewDate = new Date(
      state.viewDate.getFullYear(),
      state.viewDate.getMonth() - 1,
      1,
    );

    renderPageCalendar(state);
  });

  nextBtn.addEventListener('click', () => {
    state.viewDate = new Date(
      state.viewDate.getFullYear(),
      state.viewDate.getMonth() + 1,
      1,
    );

    renderPageCalendar(state);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const memo = memoInput.value.trim();
    const category =
      state.categories.find((item) => item.id === typeSelect.value) ||
      getFallbackCategory(state.categories);

    if (!category?.id) {
      alert('근무형태를 선택해줘.');
      typeSelect.focus();
      return;
    }

    try {
      const nextTodo = await insertTodo({
        userId: state.userId,
        dateKey: state.selectedDateKey,
        memo,
        category,
      });

      const currentTodos = state.store[state.selectedDateKey] || [];
      state.store[state.selectedDateKey] = [...currentTodos, nextTodo];

      memoInput.value = '';
      autoResizeTextarea(memoInput);

      renderAll();
      typeSelect.focus();

      if (mobileTodoFormQuery.matches) {
        closeMobileTodoForm();
      }
    } catch (error) {
      alert('업무 일정 추가에 실패했어. 잠시 후 다시 시도해줘.');
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
      overwrite: !Boolean(repeatSkipInput?.checked),
    });
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

        state.categories = sortCategories([...state.categories, nextCategory]);
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

  renderAll();
}

export async function initWorkCalendar() {
  const previewRoot = document.getElementById('workCalendarPreview');
  const pageRoot = document.getElementById('workCalendarPage');

  if (!previewRoot && !pageRoot) return;

  bindPreviewLinkLoginGuard();

  try {
    await renderPreviewCalendar();
    await initPageCalendar();
  } catch (error) {
    console.error('[work-calendar] init failed:', error);

    if (pageRoot) {
      alert('업무 캘린더를 불러오지 못했어. 잠시 후 다시 시도해줘.');
    }
  }
}
