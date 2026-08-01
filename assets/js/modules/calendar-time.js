function pad(value) {
  return String(value).padStart(2, '0');
}

let activeCalendarTimePicker = null;

export function normalizeCalendarTime(value, fallback = '') {
  const matched = String(value || '')
    .trim()
    .match(/^([01]\d|2[0-3]):([0-5]\d)/);

  return matched ? `${matched[1]}:${matched[2]}` : fallback;
}

export function normalizeRequiredCalendarTime(value) {
  return normalizeCalendarTime(value, '00:00');
}

export function formatCalendarTimeLabel(value) {
  const time = normalizeCalendarTime(value);
  if (!time) return '';

  const [hourText, minuteText] = time.split(':');
  const hour24 = Number(hourText);
  const period = hour24 < 12 ? '오전' : '오후';
  const hour12 = hour24 % 12 || 12;

  return `${period} ${hour12}:${minuteText}`;
}

export function setCalendarTimeInputValue(input, value, options = {}) {
  if (!input) return;

  const time = normalizeCalendarTime(value);
  input.dataset.time = time;
  input.value = time ? formatCalendarTimeLabel(time) : '';
  if (options.emptyLabel) input.placeholder = options.emptyLabel;
}

export function isOvernightTimeRange(startTime, endTime) {
  const start = normalizeCalendarTime(startTime);
  const end = normalizeCalendarTime(endTime);
  return Boolean(start && end && end < start);
}

export function resolveWorkCalendarTimeRange({ todo = {}, category = {} } = {}) {
  const hasTimeOverride = Boolean(
    todo.hasTimeOverride ?? todo.has_time_override,
  );
  const startTime = normalizeCalendarTime(
    hasTimeOverride
      ? todo.startTime ?? todo.start_time
      : category.start_time ?? category.startTime,
  );
  const endTime = normalizeCalendarTime(
    hasTimeOverride
      ? todo.endTime ?? todo.end_time
      : category.end_time ?? category.endTime,
  );

  return {
    startTime,
    endTime: startTime ? endTime : '',
    endsNextDay: isOvernightTimeRange(startTime, endTime),
    hasTimeOverride,
  };
}

export function splitLocalDateTimeValue(value, fallback = {}) {
  const rawValue = String(value || '').trim();
  const [rawDate = '', rawTime = ''] = rawValue.split('T');
  const hasValidDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
  const date = hasValidDate
    ? rawDate
    : String(fallback.date || '');
  const time = hasValidDate
    ? normalizeCalendarTime(rawTime)
    : normalizeCalendarTime(fallback.time);

  return { date, time };
}

export function joinLocalDateTimeValue(date, time = '') {
  const safeDate = /^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))
    ? String(date)
    : '';
  const safeTime = normalizeCalendarTime(time);

  if (!safeDate) return '';
  return safeTime ? `${safeDate}T${safeTime}` : safeDate;
}

function convertPickerTimeTo24Hour({ period, hour, minute }) {
  const safePeriod = period === 'PM' ? 'PM' : 'AM';
  const safeHour = Math.min(Math.max(Number(hour) || 12, 1), 12);
  const safeMinute = Math.min(Math.max(Number(minute) || 0, 0), 59);
  let hour24 = safeHour;

  if (safePeriod === 'AM' && safeHour === 12) hour24 = 0;
  if (safePeriod === 'PM' && safeHour !== 12) hour24 = safeHour + 12;

  return `${pad(hour24)}:${pad(safeMinute)}`;
}

function getPickerStateFromTime(value) {
  const time = normalizeRequiredCalendarTime(value);
  const [hourText, minuteText] = time.split(':');
  const hour24 = Number(hourText);

  return {
    period: hour24 < 12 ? 'AM' : 'PM',
    hour: hour24 % 12 || 12,
    minute: Number(minuteText) || 0,
  };
}

function createPickerSelect({ label, options, value }) {
  const wrap = document.createElement('label');
  wrap.className = 'calendar-time-picker__field';

  const labelText = document.createElement('span');
  labelText.className = 'calendar-time-picker__label';
  labelText.textContent = label;

  const select = document.createElement('select');
  select.className = 'calendar-time-picker__select';

  options.forEach((item) => {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    select.append(option);
  });

  select.value = String(value);
  wrap.append(labelText, select);
  return { wrap, select };
}

export function openCalendarTimePicker({
  anchorEl,
  initialTime,
  onChange,
  allowEmpty = false,
  ariaLabel = '일정 시간 선택',
  clearLabel = '시간 없음',
} = {}) {
  if (!anchorEl) return null;

  activeCalendarTimePicker?.close({ restoreFocus: false });
  const state = getPickerStateFromTime(initialTime);
  const popover = document.createElement('div');
  popover.className = 'calendar-time-picker';
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', ariaLabel);

  const panel = document.createElement('div');
  panel.className = 'calendar-time-picker__panel';
  const title = document.createElement('strong');
  title.className = 'calendar-time-picker__title';
  title.textContent = '시간 선택';
  const fields = document.createElement('div');
  fields.className = 'calendar-time-picker__fields';

  const periodField = createPickerSelect({
    label: '오전/오후',
    value: state.period,
    options: [
      { value: 'AM', label: '오전' },
      { value: 'PM', label: '오후' },
    ],
  });
  const hourField = createPickerSelect({
    label: '시',
    value: state.hour,
    options: Array.from({ length: 12 }, (_, index) => ({
      value: String(index + 1),
      label: `${index + 1}시`,
    })),
  });
  const minuteField = createPickerSelect({
    label: '분',
    value: state.minute,
    options: Array.from({ length: 60 }, (_, index) => ({
      value: String(index),
      label: `${pad(index)}분`,
    })),
  });

  const clearButton = document.createElement('button');
  clearButton.type = 'button';
  clearButton.className = 'calendar-time-picker__clear';
  clearButton.textContent = clearLabel;
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'calendar-time-picker__close';
  closeButton.textContent = '닫기';
  let isSaving = false;
  let isOpen = true;
  let api = null;

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

  function closePicker({ restoreFocus = false } = {}) {
    if (!isOpen) return;
    isOpen = false;

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && popover.contains(activeElement)) {
      activeElement.blur();
    }

    document.removeEventListener('keydown', handleKeydown);
    document.removeEventListener('pointerdown', handlePointerDown);
    window.removeEventListener('resize', positionPicker);
    window.removeEventListener('scroll', positionPicker, true);
    popover.remove();

    if (activeCalendarTimePicker === api) {
      activeCalendarTimePicker = null;
    }

    if (restoreFocus && anchorEl.isConnected) {
      window.requestAnimationFrame(() => {
        anchorEl.focus({ preventScroll: true });
      });
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closePicker({ restoreFocus: true });
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = [
      ...popover.querySelectorAll('select, button:not([disabled])'),
    ];
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handlePointerDown(event) {
    if (popover.contains(event.target) || anchorEl.contains(event.target)) return;
    closePicker();
  }

  async function applySelectedTime() {
    if (isSaving) return;
    isSaving = true;
    try {
      await onChange?.(
        convertPickerTimeTo24Hour({
          period: periodField.select.value,
          hour: hourField.select.value,
          minute: minuteField.select.value,
        }),
      );
    } finally {
      isSaving = false;
    }
  }

  periodField.select.addEventListener('change', applySelectedTime);
  hourField.select.addEventListener('change', applySelectedTime);
  minuteField.select.addEventListener('change', applySelectedTime);
  closeButton.addEventListener('click', () => closePicker({ restoreFocus: true }));
  clearButton.addEventListener('click', async () => {
    if (isSaving) return;
    isSaving = true;
    try {
      await onChange?.('');
      closePicker({ restoreFocus: true });
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

  api = {
    close: closePicker,
    isOpen: () => isOpen,
  };
  activeCalendarTimePicker = api;

  window.setTimeout(() => {
    if (!isOpen) return;
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('resize', positionPicker);
    window.addEventListener('scroll', positionPicker, true);
    anchorEl.blur();
    periodField.select.focus({ preventScroll: true });
  }, 0);

  return api;
}

export function closeActiveCalendarTimePicker(options = {}) {
  activeCalendarTimePicker?.close(options);
}
