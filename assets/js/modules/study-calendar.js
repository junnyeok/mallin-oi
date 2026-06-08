// assets/js/modules/study-calendar.js

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
    badge.title = `${category.name} · ${title}`;

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
    type: row.todo_type || row.study_calendar_categories?.slug || 'etc',
    categoryId: row.category_id || row.study_calendar_categories?.id || null,
    date: row.todo_date,
    sharedOriginTodoId: row.shared_origin_todo_id || null,
    sharedOriginUserId: row.shared_origin_user_id || null,
    sharedGroupId: row.shared_group_id || null,
    sharedCreatedBy: row.shared_created_by || null,
    isSharedCopy: Boolean(row.is_shared_copy),
  };
}

function groupTodosByDate(rows = []) {
  return rows.reduce((acc, row) => {
    const todo = normalizeTodo(row);
    const dateKey = todo.date;

    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }

    acc[dateKey].push(todo);
    return acc;
  }, {});
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
      is_done,
      shared_origin_todo_id,
      shared_origin_user_id,
      shared_group_id,
      shared_created_by,
      is_shared_copy,
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
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
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
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
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
      is_shared_personal: false,
      shared_group_id: null,
    })
    .select(
      'id, user_id, name, slug, color, is_default, sort_order, is_shared_personal, shared_group_id, shared_origin_category_id, shared_origin_user_id, is_shared_copy_category, created_at',
    )
    .single();

  if (error) {
    console.error('[study-calendar] insertCategory error:', error.message);
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

async function insertTodo({ userId, dateKey, text, memo, category }) {
  const latestCategory = category?.id
    ? await fetchCategoryById(userId, category.id)
    : null;
  const safeCategory = latestCategory || category || DEFAULT_CATEGORIES[2];
  const shouldShare = Boolean(
    safeCategory.is_shared_personal && safeCategory.shared_group_id,
  );

  if (shouldShare) {
    const { data, error } = await supabase
      .rpc('create_study_calendar_todo_with_shared_personal', {
        p_todo_date: dateKey,
        p_category_id: safeCategory.id || null,
        p_todo_text: text,
        p_memo: memo || '',
      })
      .single();

    if (error) {
      console.error('[study-calendar] shared insertTodo error:', error.message);
      throw error;
    }

    return {
      ...normalizeTodo(data),
      sharedGroupId: safeCategory.shared_group_id || null,
      sharedCreatedBy: userId,
      isSharedCopy: false,
    };
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      todo_date: dateKey,
      todo_type: safeCategory.slug || 'etc',
      category_id: safeCategory.id || null,
      todo_text: text,
      memo: memo || '',
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
      is_done,
      shared_origin_todo_id,
      shared_origin_user_id,
      shared_group_id,
      shared_created_by,
      is_shared_copy,
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

async function updateTodoMemo({ todoId, memo }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ memo: memo || '' })
    .eq('id', todoId);

  if (error) {
    console.error('[study-calendar] updateTodoMemo error:', error.message);
    throw error;
  }
}

async function updateTodoText({ todoId, text }) {
  const { error } = await supabase
    .from(TABLE_NAME)
    .update({ todo_text: text })
    .eq('id', todoId);

  if (error) {
    console.error('[study-calendar] updateTodoText error:', error.message);
    throw error;
  }
}

async function updateTodoCategory({ todoId, category }) {
  const safeCategory = category || getFallbackCategory([]);

  const { error } = await supabase.rpc(
    'update_study_calendar_todo_category_with_shared_personal',
    {
      p_todo_id: todoId,
      p_category_id: safeCategory?.id || null,
    },
  );

  if (error) {
    console.error('[study-calendar] updateTodoCategory error:', error.message);
    throw error;
  }
}

async function syncSharedPersonalCategory(categoryId) {
  const { error } = await supabase.rpc('sync_study_shared_personal_category', {
    p_category_id: categoryId,
  });

  if (error) {
    console.error(
      '[study-calendar] syncSharedPersonalCategory error:',
      error.message,
    );
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

async function deleteSharedPersonalTodoById(todoId) {
  const { error } = await supabase.rpc('delete_study_shared_personal_todo', {
    p_todo_id: todoId,
  });

  if (error) {
    console.error(
      '[study-calendar] deleteSharedPersonalTodoById error:',
      error.message,
    );
    throw error;
  }
}

async function deleteSharedPersonalCategoryById(categoryId) {
  const { error } = await supabase.rpc(
    'delete_study_shared_personal_category',
    {
      p_category_id: categoryId,
    },
  );

  if (error) {
    console.error(
      '[study-calendar] deleteSharedPersonalCategoryById error:',
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
  onTextChange,
  onMemoChange,
  onCategoryChange,
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

    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'study-todo-item__delete';
    deleteButton.textContent = '삭제';
    deleteButton.setAttribute('aria-label', `${todo.text} 삭제`);

    deleteButton.addEventListener('click', () => {
      onDelete(todo.id);
    });

    const body = document.createElement('div');
    body.className = 'study-todo-item__body';

    const categorySelect = document.createElement('select');
    const category = getCategoryByTodo(todo, categories);

    categorySelect.className = 'study-todo-item__category-select';
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
        await onCategoryChange(todo.id, nextCategory);
      } catch (error) {
        alert('카테고리 변경에 실패했어. 잠시 후 다시 시도해줘.');
        categorySelect.value = previousValue;
      }
    });

    const text = document.createElement('input');
    text.className = 'study-todo-item__text-input';
    text.type = 'text';
    text.value = todo.text;
    text.setAttribute('aria-label', '할 일 제목 수정');

    let textSaveTimer = null;
    let lastSavedText = todo.text;

    text.addEventListener('input', () => {
      const nextText = text.value.trim();

      window.clearTimeout(textSaveTimer);

      textSaveTimer = window.setTimeout(async () => {
        if (!nextText || nextText === lastSavedText) return;

        try {
          await onTextChange(todo.id, nextText);

          lastSavedText = nextText;
          todo.text = nextText;

          checkbox.setAttribute('aria-label', `${nextText} 완료 처리`);
          deleteButton.setAttribute('aria-label', `${nextText} 삭제`);
        } catch (error) {
          alert('제목 수정에 실패했어. 잠시 후 다시 시도해줘.');
          text.value = lastSavedText;
        }
      }, 500);
    });

    text.addEventListener('blur', async () => {
      window.clearTimeout(textSaveTimer);

      const nextText = text.value.trim();

      if (!nextText) {
        text.value = lastSavedText;
        return;
      }

      if (nextText === lastSavedText) return;

      try {
        await onTextChange(todo.id, nextText);

        lastSavedText = nextText;
        todo.text = nextText;

        checkbox.setAttribute('aria-label', `${nextText} 완료 처리`);
        deleteButton.setAttribute('aria-label', `${nextText} 삭제`);
      } catch (error) {
        alert('제목 수정에 실패했어. 잠시 후 다시 시도해줘.');
        text.value = lastSavedText;
      }
    });

    const memoToggle = document.createElement('button');
    memoToggle.type = 'button';
    memoToggle.className = 'study-todo-item__memo-toggle';
    memoToggle.textContent = '펼치기';
    memoToggle.setAttribute('aria-expanded', 'false');

    const memoBox = document.createElement('div');
    memoBox.className = 'study-todo-item__memo';
    memoBox.hidden = true;

    const memoLabel = document.createElement('label');
    memoLabel.className = 'study-todo-item__memo-label';
    memoLabel.setAttribute('for', `studyTodoMemo-${todo.id}`);
    memoLabel.textContent = '메모';

    const memoInput = document.createElement('textarea');
    memoInput.className = 'study-todo-item__memo-input';
    memoInput.id = `studyTodoMemo-${todo.id}`;
    memoInput.rows = 1;
    memoInput.placeholder = '이 항목의 메모를 입력하세요.';
    memoInput.value = todo.memo || '';
    autoResizeTextarea(memoInput);

    const memoStatus = document.createElement('span');
    memoStatus.className = 'study-todo-item__memo-status';
    memoStatus.setAttribute('aria-live', 'polite');

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

    let memoSaveTimer = null;

    memoInput.addEventListener('input', () => {
      autoResizeTextarea(memoInput);

      const nextMemo = memoInput.value;

      todo.memo = nextMemo;
      memoStatus.textContent = '저장 중...';

      window.clearTimeout(memoSaveTimer);

      memoSaveTimer = window.setTimeout(async () => {
        try {
          await onMemoChange(todo.id, nextMemo);
          memoStatus.textContent = '저장됨';

          window.setTimeout(() => {
            if (memoStatus.textContent === '저장됨') {
              memoStatus.textContent = '';
            }
          }, 1200);
        } catch (error) {
          memoStatus.textContent = '저장 실패';
        }
      }, 500);
    });

    memoInput.addEventListener('blur', async () => {
      window.clearTimeout(memoSaveTimer);
      autoResizeTextarea(memoInput);

      const nextMemo = memoInput.value;

      try {
        await onMemoChange(todo.id, nextMemo);
        memoStatus.textContent = nextMemo.trim() ? '저장됨' : '';

        window.setTimeout(() => {
          if (memoStatus.textContent === '저장됨') {
            memoStatus.textContent = '';
          }
        }, 1200);
      } catch (error) {
        memoStatus.textContent = '저장 실패';
      }
    });

    memoBox.append(memoLabel, memoInput, memoStatus);
    body.append(categorySelect, text, memoToggle, memoBox);
    item.append(checkbox, body, deleteButton);
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
  groups,
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

    const sharedControls = createSharedPersonalControls({
      prefix: 'study',
      groups,
      category,
      selectLabel: `${getCalendarLabel('study')} 우리 일정 그룹 선택`,
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
    deleteButton.className = 'study-category-item__button';
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
    },
  );
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

async function initPageCalendar() {
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

  const mobileTodoFormQuery = window.matchMedia('(max-width: 640px)');

  const formToggleButton = document.createElement('button');
  formToggleButton.type = 'button';
  formToggleButton.className = 'study-todo-form-toggle';
  formToggleButton.textContent = '할 일 추가';
  formToggleButton.setAttribute('aria-expanded', 'false');
  formToggleButton.setAttribute('aria-controls', 'studyTodoForm');

  form.before(formToggleButton);

  const formCloseButton = document.createElement('button');
  formCloseButton.type = 'button';
  formCloseButton.className = 'study-todo-form__close';
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
    sharedGroups: await fetchSharedPersonalGroups('study'),
    store: await fetchUserTodos(user.id),
    onSelect: null,
    group: null,
  };

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
    renderCategorySelect(typeSelect, state.categories);

    renderPageCalendar(state);

    renderTodoList({
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      categories: state.categories,
      onToggle: toggleTodo,
      onDelete: deleteTodo,
      onTextChange: changeTodoText,
      onMemoChange: changeTodoMemo,
      onCategoryChange: changeTodoCategory,
    });

    renderCategoryList({
      root: categoryList,
      categories: state.categories,
      groups: state.sharedGroups,
      onSave: saveCategory,
      onDelete: removeCategory,
    });
  }

  function selectDate(dateKey) {
    state.selectedDateKey = dateKey;

    const [year, month] = dateKey.split('-').map(Number);
    state.viewDate = new Date(year, month - 1, 1);

    renderAll();

    if (mobileTodoFormQuery.matches) {
      closeMobileTodoForm();
    }
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
    } catch (error) {
      alert('완료 상태 변경에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function deleteTodo(todoId) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target) return;

    const isSharedTodo = Boolean(
      target.sharedGroupId || target.sharedOriginTodoId || target.isSharedCopy,
    );

    if (isSharedTodo) {
      const ok = window.confirm(
        '우리 일정이라 같은 그룹 참여자 캘린더에서도 함께 삭제돼. 삭제할까?',
      );

      if (!ok) return;
    }

    try {
      if (isSharedTodo) {
        await deleteSharedPersonalTodoById(todoId);
        state.store = await fetchUserTodos(state.userId);
      } else {
        await deleteTodoById(todoId);

        state.store[state.selectedDateKey] = todos.filter(
          (todo) => todo.id !== todoId,
        );

        if (state.store[state.selectedDateKey].length === 0) {
          delete state.store[state.selectedDateKey];
        }
      }

      renderAll();
    } catch (error) {
      alert('할 일 삭제에 실패했어. 잠시 후 다시 시도해줘.');
    }
  }

  async function changeTodoText(todoId, text) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target) return;

    const nextText = String(text || '').trim();

    if (!nextText) return;

    await updateTodoText({
      todoId,
      text: nextText,
    });

    target.text = nextText;

    renderPageCalendar(state);
  }

  async function changeTodoMemo(todoId, memo) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);

    if (!target) return;

    const nextMemo = String(memo || '');

    await updateTodoMemo({
      todoId,
      memo: nextMemo,
    });

    target.memo = nextMemo;
  }

  async function changeTodoCategory(todoId, category) {
    const todos = state.store[state.selectedDateKey] || [];
    const target = todos.find((todo) => todo.id === todoId);
    const fallback = getFallbackCategory(state.categories);
    const nextCategory = category || fallback;

    if (!target || !nextCategory?.id) return;

    await updateTodoCategory({
      todoId,
      category: nextCategory,
    });

    state.store = await fetchUserTodos(state.userId);

    renderAll();
  }

  state.onSelect = selectDate;

  state.group = await initCalendarGroupBar({
    calendarType: 'study',
    pageRoot,
    getViewDate: () => state.viewDate,
    renderAll,
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
        state.store = await fetchUserTodos(state.userId);
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
    const selectedCategoryId = typeSelect.value;

    if (!text) {
      input.focus();
      return;
    }

    try {
      const category = await refreshCategories(selectedCategoryId);

      const nextTodo = await insertTodo({
        userId: state.userId,
        dateKey: state.selectedDateKey,
        text,
        memo,
        category,
      });

      const currentTodos = state.store[state.selectedDateKey] || [];
      state.store[state.selectedDateKey] = [...currentTodos, nextTodo];

      input.value = '';
      memoInput.value = '';
      autoResizeTextarea(memoInput);

      renderAll();

      if (mobileTodoFormQuery.matches) {
        closeMobileTodoForm();
      } else {
        input.focus();
      }
    } catch (error) {
      alert('할 일 추가에 실패했어. 잠시 후 다시 시도해줘.');
    }
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

  if (!previewRoot && !pageRoot) return;

  bindPreviewLinkLoginGuard();

  try {
    await renderPreviewCalendar();
    await initPageCalendar();
  } catch (error) {
    console.error('[study-calendar] init failed:', error);

    if (pageRoot) {
      alert('자기개발 캘린더를 불러오지 못했어. 잠시 후 다시 시도해줘.');
    }
  }
}
