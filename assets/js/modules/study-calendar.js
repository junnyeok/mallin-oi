// assets/js/modules/study-calendar.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';

const TABLE_NAME = 'study_calendar_todos';
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

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

function getTypeLabel(type) {
  const map = {
    study: '공부',
    workout: '운동',
    etc: '기타',
  };

  return map[type] || '기타';
}

function autoResizeTextarea(textarea) {
  if (!textarea) return;

  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function appendTypeBadges(root, todos = []) {
  const wrap = document.createElement('div');
  wrap.className = 'study-calendar-day__badges';

  todos.forEach((todo) => {
    const type = todo.type || 'etc';
    const title = String(todo.text || '').trim();

    if (!title) return;

    const badge = document.createElement('span');
    badge.className = `study-calendar-day__badge study-calendar-day__badge--${type}`;

    if (todo.done) {
      badge.classList.add('is-done');
    }

    badge.textContent = title;
    badge.title = title;

    wrap.append(badge);
  });

  if (wrap.children.length > 0) {
    root.append(wrap);
  }
}

function normalizeTodo(row) {
  return {
    id: row.id,
    text: row.todo_text,
    memo: row.memo || '',
    done: Boolean(row.is_done),
    type: row.todo_type || 'etc',
    date: row.todo_date,
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
      'id, user_id, todo_date, todo_type, todo_text, memo, is_done, created_at',
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

async function insertTodo({ userId, dateKey, text, memo, type }) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      user_id: userId,
      todo_date: dateKey,
      todo_type: type,
      todo_text: text,
      memo: memo || '',
      is_done: false,
    })
    .select(
      'id, user_id, todo_date, todo_type, todo_text, memo, is_done, created_at',
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
    appendTypeBadges(dayEl, todos);

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
}) {
  const dateKey = toDateKey(date);
  const todayKey = getTodayKey();
  const todos = store[dateKey] || [];

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
  appendTypeBadges(button, todos);

  button.addEventListener('click', () => {
    onSelect(dateKey);
  });

  return button;
}

function renderTodoList({
  selectedDateKey,
  store,
  onToggle,
  onDelete,
  onTextChange,
  onMemoChange,
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

    const type = document.createElement('span');
    type.className = 'study-todo-item__type';
    type.textContent = getTypeLabel(todo.type);

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
    memoInput.rows = 2;
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
    body.append(type, text, memoToggle, memoBox);

    item.append(checkbox, body, deleteButton);
    list.append(item);
  });
}

function renderPageCalendar(state) {
  const grid = document.getElementById('studyCalendarGrid');
  const monthLabel = document.getElementById('studyCalendarMonthLabel');

  if (!grid || !monthLabel) return;

  grid.innerHTML = '';
  monthLabel.textContent = getMonthTitle(state.viewDate);

  renderWeekdays(grid);

  const dates = getMonthDates(state.viewDate, { includeOutside: true });

  dates.forEach((item) => {
    const button = createDayButton({
      date: item.date,
      isCurrentMonth: item.isCurrentMonth,
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      onSelect: state.onSelect,
    });

    grid.append(button);
  });
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
    store: await fetchUserTodos(user.id),
    onSelect: null,
  };

  function renderAll() {
    renderPageCalendar(state);
    renderTodoList({
      selectedDateKey: state.selectedDateKey,
      store: state.store,
      onToggle: toggleTodo,
      onDelete: deleteTodo,
      onTextChange: changeTodoText,
      onMemoChange: changeTodoMemo,
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

    const text = input.value.trim();
    const memo = memoInput.value.trim();
    const type = typeSelect.value || 'etc';

    if (!text) {
      input.focus();
      return;
    }

    try {
      const nextTodo = await insertTodo({
        userId: state.userId,
        dateKey: state.selectedDateKey,
        text,
        memo,
        type,
      });

      const currentTodos = state.store[state.selectedDateKey] || [];
      state.store[state.selectedDateKey] = [...currentTodos, nextTodo];

      input.value = '';
      memoInput.value = '';

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
