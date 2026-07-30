import {
  joinLocalDateTimeValue,
  openCalendarTimePicker,
  setCalendarTimeInputValue,
  splitLocalDateTimeValue,
} from './calendar-time.js';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

let activeSheet = null;
let activeDeleteConfirmation = null;
let lockCount = 0;
let lockedScrollY = 0;

function lockBodyScroll() {
  lockCount += 1;
  if (lockCount > 1) return;

  lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.body.style.setProperty(
    '--calendar-entry-sheet-scroll-offset',
    `${lockedScrollY}px`,
  );
  document.body.classList.add('calendar-entry-sheet-open');
  document.body.style.top = `-${lockedScrollY}px`;
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount > 0) return;

  document.body.classList.remove('calendar-entry-sheet-open');
  document.body.style.top = '';
  document.body.style.removeProperty('--calendar-entry-sheet-scroll-offset');
  window.scrollTo(0, lockedScrollY);
}

function getFocusable(root) {
  return [...root.querySelectorAll(FOCUSABLE_SELECTOR)].filter((el) => {
    if (el.hidden) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
}

function makeId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function openDeleteConfirmation({
  opener,
  description,
  onConfirm,
  onConfirmed,
  onClose,
} = {}) {
  activeDeleteConfirmation?.close?.({
    restoreFocus: false,
    force: true,
  });

  const titleId = makeId('calendarDeleteConfirmTitle');
  const descriptionId = makeId('calendarDeleteConfirmDescription');
  const overlay = document.createElement('div');
  overlay.className = 'calendar-entry-delete-confirm';

  const dialog = document.createElement('section');
  dialog.className = 'calendar-entry-delete-confirm__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('aria-describedby', descriptionId);
  dialog.setAttribute('tabindex', '-1');

  const heading = document.createElement('h3');
  heading.id = titleId;
  heading.className = 'calendar-entry-delete-confirm__title';
  heading.textContent = '일정 삭제';

  const message = document.createElement('p');
  message.id = descriptionId;
  message.className = 'calendar-entry-delete-confirm__description';
  message.textContent =
    description ||
    '정말 이 일정을 삭제하시겠습니까? 삭제한 일정은 복구할 수 없습니다.';

  const actions = document.createElement('div');
  actions.className = 'calendar-entry-delete-confirm__actions';

  const cancelButton = document.createElement('button');
  cancelButton.type = 'button';
  cancelButton.className =
    'calendar-entry-delete-confirm__button calendar-entry-delete-confirm__cancel';
  cancelButton.textContent = '아니오';

  const confirmButton = document.createElement('button');
  confirmButton.type = 'button';
  confirmButton.className =
    'calendar-entry-delete-confirm__button calendar-entry-delete-confirm__confirm';
  confirmButton.textContent = '예, 삭제';

  actions.append(cancelButton, confirmButton);
  dialog.append(heading, message, actions);
  overlay.append(dialog);

  let isOpen = true;
  let isSubmitting = false;

  function close({ restoreFocus = true, force = false } = {}) {
    if (!isOpen || (isSubmitting && !force)) return;

    isOpen = false;
    document.removeEventListener('keydown', handleKeydown, true);
    overlay.remove();
    unlockBodyScroll();

    if (activeDeleteConfirmation === api) {
      activeDeleteConfirmation = null;
    }
    onClose?.();

    if (restoreFocus) {
      requestAnimationFrame(() => opener?.focus?.({ preventScroll: true }));
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      if (!isSubmitting) close();
      return;
    }

    if (event.key !== 'Tab') return;
    event.stopPropagation();

    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
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

  cancelButton.addEventListener('click', () => close());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  confirmButton.addEventListener('click', async () => {
    if (isSubmitting) return;

    isSubmitting = true;
    dialog.setAttribute('aria-busy', 'true');
    cancelButton.disabled = true;
    confirmButton.disabled = true;
    confirmButton.textContent = '삭제 중';

    let didDelete;
    try {
      didDelete = await onConfirm?.();
    } catch {
      isSubmitting = false;
      dialog.removeAttribute('aria-busy');
      cancelButton.disabled = false;
      confirmButton.disabled = false;
      confirmButton.textContent = '예, 삭제';
      cancelButton.focus({ preventScroll: true });
      return;
    }

    close({ restoreFocus: didDelete === false, force: true });
    if (didDelete !== false) onConfirmed?.();
  });

  const api = {
    close,
    isOpen: () => isOpen,
  };

  document.body.append(overlay);
  lockBodyScroll();
  document.addEventListener('keydown', handleKeydown, true);
  activeDeleteConfirmation = api;
  requestAnimationFrame(() => cancelButton.focus({ preventScroll: true }));

  return api;
}

function wrapField(control, label) {
  if (!control || control.closest('.calendar-entry-sheet__field')) return;

  const field = document.createElement('label');
  field.className = 'calendar-entry-sheet__field';

  const labelEl = document.createElement('span');
  labelEl.className = 'calendar-entry-sheet__label';
  labelEl.textContent = label;

  control.before(field);
  field.append(labelEl, control);
}

function createCalendarDateTimeControl(field) {
  const control = document.createElement('div');
  control.className = 'calendar-entry-sheet__datetime';

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.required = Boolean(field.required);
  dateInput.setAttribute('aria-label', `${field.label} 날짜`);

  const timeInput = document.createElement('input');
  timeInput.type = 'text';
  timeInput.readOnly = true;
  timeInput.inputMode = 'none';
  timeInput.setAttribute('aria-label', `${field.label} 시간`);
  timeInput.placeholder = field.timePlaceholder || `${field.label}시간 지정`;

  function setValue(value) {
    const parsed = splitLocalDateTimeValue(value);
    dateInput.value = parsed.date;
    setCalendarTimeInputValue(timeInput, parsed.time, {
      emptyLabel: field.timePlaceholder || `${field.label}시간 지정`,
    });
  }

  Object.defineProperty(control, 'value', {
    configurable: true,
    get() {
      return joinLocalDateTimeValue(dateInput.value, timeInput.dataset.time);
    },
    set: setValue,
  });
  control.focus = () => dateInput.focus();
  control.append(dateInput, timeInput);
  setValue(field.value || '');

  timeInput.addEventListener('click', () => {
    openCalendarTimePicker({
      anchorEl: timeInput,
      initialTime: timeInput.dataset.time,
      allowEmpty: Boolean(field.allowEmptyTime),
      ariaLabel: `${field.label} 시간 선택`,
      clearLabel: `${field.label}시간 해제`,
      onChange: (nextTime) => {
        setCalendarTimeInputValue(timeInput, nextTime, {
          emptyLabel: field.timePlaceholder || `${field.label}시간 지정`,
        });
      },
    });
  });

  field.dateInput = dateInput;
  field.timeInput = timeInput;
  field.input = control;
  return control;
}

function enhanceCategoryField(form, selectSelector, settingsSelector) {
  const select = form.querySelector(selectSelector);
  const settingsButton = form.querySelector(settingsSelector);
  if (!select || !settingsButton || select.closest('.calendar-entry-sheet__field')) return;

  const field = document.createElement('div');
  field.className = 'calendar-entry-sheet__field calendar-entry-sheet__category-field';

  const labelEl = document.createElement('span');
  labelEl.className = 'calendar-entry-sheet__label';
  labelEl.textContent = '카테고리';

  const actions = document.createElement('div');
  actions.className = 'calendar-entry-sheet__category-actions';

  select.before(field);
  field.append(labelEl, actions);
  actions.append(select, settingsButton);

  settingsButton.classList.add('calendar-entry-sheet__category-settings');
  settingsButton.addEventListener('click', (event) => {
    event.stopPropagation();
  });
}

function enhanceCreateForm(form) {
  if (!form || form.dataset.entrySheetEnhanced === 'true') return;
  form.dataset.entrySheetEnhanced = 'true';

  const title =
    form.querySelector('#studyTodoInput') ||
    form.querySelector('#eventTodoInput');
  if (title) {
    title.classList.add('calendar-entry-sheet__form-title');
    title.placeholder = '제목을 입력해주세요.';
    form.prepend(title);
  }

  enhanceCategoryField(form, '#studyTodoType', '#studyCategoryToggle');
  enhanceCategoryField(form, '#workTodoType', '#workCategoryToggle');
  enhanceCategoryField(form, '#eventTodoType', '#eventCategoryToggle');

  const labelMap = [
    ['#studyTodoType', '카테고리'],
    ['#workTodoType', '카테고리'],
    ['#eventTodoType', '카테고리'],
    ['#workRepeatToggle', '반복근무'],
    ['#studyTodoMemo', '메모'],
    ['#workTodoMemo', '메모'],
    ['#eventTodoMemo', '메모'],
    ['#eventDateToggle', '날짜'],
    ['#eventTodoTime', '시작'],
    ['#eventTodoEndTime', '종료'],
  ];

  labelMap.forEach(([selector, label]) => {
    wrapField(form.querySelector(selector), label);
  });
}

export function initCalendarEntrySheet({
  calendarType = '',
  openButton,
  form,
  title,
  submitLabel = '저장',
  closeLabel = '닫기',
  contentElements = [],
  initialFocus,
  onBeforeOpen,
  onAfterClose,
  readonlyFields = [],
  editableFields = [],
  syncSubmitButton,
} = {}) {
  if (!openButton || !form || !title) return null;

  const titleId = makeId('calendarEntrySheetTitle');
  const overlay = document.createElement('div');
  overlay.className = 'calendar-entry-sheet';
  overlay.dataset.calendarType = calendarType;
  overlay.dataset.mode = 'create';
  overlay.hidden = true;

  const dialog = document.createElement('section');
  dialog.className = 'calendar-entry-sheet__panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('tabindex', '-1');

  const header = document.createElement('div');
  header.className = 'calendar-entry-sheet__header';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'calendar-entry-sheet__close';
  closeButton.setAttribute('aria-label', closeLabel);
  closeButton.textContent = '×';

  const heading = document.createElement('h2');
  heading.className = 'calendar-entry-sheet__title';
  heading.id = titleId;
  heading.textContent = title;

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'calendar-entry-sheet__submit';
  submitButton.textContent = submitLabel;

  const body = document.createElement('div');
  body.className = 'calendar-entry-sheet__body';

  header.append(closeButton, heading, submitButton);
  dialog.append(header, body);
  overlay.append(dialog);
  document.body.append(overlay);

  [form, ...contentElements.filter(Boolean)].forEach((el) => {
    body.append(el);
  });
  enhanceCreateForm(form);

  const readonlyFieldValues = new Map();
  const firstTextareaField = form
    .querySelector('textarea')
    ?.closest('.calendar-entry-sheet__field');
  readonlyFields.forEach((field) => {
    const row = document.createElement('div');
    row.className = 'calendar-entry-sheet__field';

    const label = document.createElement('span');
    label.className = 'calendar-entry-sheet__label';
    label.textContent = field.label;

    const value = document.createElement('span');
    value.className = 'calendar-entry-sheet__value';
    row.append(label, value);
    form.insertBefore(row, firstTextareaField);
    readonlyFieldValues.set(field.key, { field, value });
  });

  const editableFieldValues = new Map();
  editableFields.forEach((field) => {
    const row = document.createElement('label');
    row.className = 'calendar-entry-sheet__field';

    const label = document.createElement('span');
    label.className = 'calendar-entry-sheet__label';
    label.textContent = field.label;

    const input = document.createElement('input');
    input.type = field.type || 'text';
    input.id = field.id || makeId('calendarEntrySheetField');
    input.name = field.name || field.key;
    input.required = Boolean(field.required);
    row.htmlFor = input.id;
    row.append(label, input);
    form.insertBefore(row, firstTextareaField);
    editableFieldValues.set(field.key, { field, input });
  });

  function updateReadonlyFields() {
    readonlyFieldValues.forEach(({ field, value }) => {
      const nextValue =
        typeof field.value === 'function' ? field.value() : field.value;
      value.textContent = field.display || nextValue || '없음';
    });
  }

  function updateEditableFields() {
    editableFieldValues.forEach(({ field, input }) => {
      const nextValue =
        typeof field.value === 'function' ? field.value() : field.value;
      input.value = String(nextValue || '');
    });
  }

  let isOpen = false;
  let closeTimer = 0;
  let opener = null;

  function setSubmitState() {
    if (syncSubmitButton) {
      submitButton.disabled = Boolean(syncSubmitButton.disabled);
      submitButton.textContent = syncSubmitButton.disabled
        ? syncSubmitButton.textContent || submitLabel
        : submitLabel;
    }
  }

  const observer = syncSubmitButton
    ? new MutationObserver(setSubmitState)
    : null;
  observer?.observe(syncSubmitButton, {
    attributes: true,
    attributeFilter: ['disabled'],
    childList: true,
    subtree: true,
  });

  function focusInitial() {
    const target =
      (typeof initialFocus === 'function' ? initialFocus() : initialFocus) ||
      getFocusable(dialog).find((el) => el !== submitButton) ||
      dialog;

    window.setTimeout(() => {
      target?.focus?.({ preventScroll: true });
    }, 0);
  }

  function open() {
    if (isOpen) return;

    activeSheet?.close({ restoreFocus: false });
    activeSheet = api;
    opener = document.activeElement || openButton;
    onBeforeOpen?.();
    updateReadonlyFields();
    updateEditableFields();
    setSubmitState();

    window.clearTimeout(closeTimer);
    overlay.hidden = false;
    overlay.classList.remove('is-closing');
    lockBodyScroll();
    window.requestAnimationFrame(() => {
      overlay.classList.add('is-open');
    });

    isOpen = true;
    openButton.setAttribute('aria-expanded', 'true');
    focusInitial();
  }

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;

    isOpen = false;
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    openButton.setAttribute('aria-expanded', 'false');
    unlockBodyScroll();

    closeTimer = window.setTimeout(() => {
      overlay.hidden = true;
      overlay.classList.remove('is-closing');
      if (activeSheet === api) activeSheet = null;
      onAfterClose?.();
      if (restoreFocus) {
        (opener || openButton).focus?.();
      }
    }, 220);
  }

  function handleKeydown(event) {
    if (!isOpen) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
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

  openButton.type = openButton.type || 'button';
  openButton.setAttribute('aria-expanded', 'false');
  openButton.addEventListener('click', open);
  closeButton.addEventListener('click', () => close());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  submitButton.addEventListener('click', () => {
    setSubmitState();
    if (submitButton.disabled) return;
    form.requestSubmit();
  });
  document.addEventListener('keydown', handleKeydown);

  const api = {
    open,
    close,
    isOpen: () => isOpen,
    setSubmitState,
    destroy() {
      observer?.disconnect();
      document.removeEventListener('keydown', handleKeydown);
      overlay.remove();
    },
  };

  return api;
}

export function openCalendarDetailSheet({
  calendarType = '',
  mode = 'edit',
  title = '',
  submitLabel = '저장',
  submitDisabled = false,
  opener,
  fields = [],
  helpText = '',
  characterImage = '',
  deleteDescription = '',
  onSave,
  onDelete,
} = {}) {
  const isReadonly = mode === 'readonly';
  const overlay = document.createElement('div');
  overlay.className = 'calendar-entry-sheet';
  overlay.dataset.calendarType = calendarType;
  overlay.dataset.mode = mode;
  overlay.hidden = true;

  const titleId = makeId('calendarDetailSheetTitle');
  const dialog = document.createElement('section');
  dialog.className = 'calendar-entry-sheet__panel';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', titleId);
  dialog.setAttribute('tabindex', '-1');

  const header = document.createElement('div');
  header.className = 'calendar-entry-sheet__header';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'calendar-entry-sheet__close';
  closeButton.setAttribute('aria-label', '닫기');
  closeButton.textContent = '×';

  const heading = document.createElement('h2');
  heading.className = 'calendar-entry-sheet__title';
  heading.id = titleId;
  heading.textContent =
    isReadonly ? title : title || (calendarType === 'work' ? '업무 일정' : calendarType === 'study' ? '할 일' : '일정');

  const submitButton = document.createElement('button');
  submitButton.type = 'button';
  submitButton.className = 'calendar-entry-sheet__submit';
  submitButton.textContent = isReadonly ? '닫기' : submitLabel;
  submitButton.disabled = !isReadonly && Boolean(submitDisabled);
  if (isReadonly) {
    submitButton.hidden = true;
  }

  const body = document.createElement('div');
  body.className = 'calendar-entry-sheet__body';
  let deleteConfirmation = null;

  const titleField = fields.find((field) => field.key === 'title');
  if (titleField) {
    if (isReadonly) {
      const titleText = document.createElement('div');
      titleText.className = 'calendar-entry-sheet__form-title';
      titleText.textContent = titleField.value || '제목 없음';
      body.append(titleText);
    } else {
      const input = document.createElement('input');
      input.className = 'calendar-entry-sheet__form-title';
      input.value = titleField.value || '';
      input.placeholder = '제목을 입력해주세요.';
      titleField.input = input;
      body.append(input);
    }
  }

  fields
    .filter((field) => field.key !== 'title')
    .forEach((field) => {
      const isOptional = !isReadonly && Boolean(field.optional);
      const row = document.createElement(isOptional ? 'div' : 'label');
      row.className = 'calendar-entry-sheet__field';

      const label = document.createElement(isOptional ? 'label' : 'span');
      label.className = 'calendar-entry-sheet__label';
      label.textContent = field.label;

      let control;
      if (isReadonly || field.readonly) {
        control = document.createElement('span');
        control.className = 'calendar-entry-sheet__value';
        control.textContent = field.display || field.value || '없음';
      } else if (field.type === 'calendar-datetime') {
        control = createCalendarDateTimeControl(field);
      } else if (field.type === 'textarea') {
        control = document.createElement('textarea');
        control.rows = 3;
        control.value = field.value || '';
        control.placeholder = field.placeholder || '메모를 입력하세요.';
        field.input = control;
      } else if (field.type === 'select') {
        control = document.createElement('select');
        (field.options || []).forEach((optionData) => {
          const option = document.createElement('option');
          option.value = optionData.value;
          option.textContent = optionData.label;
          control.append(option);
        });
        control.value = field.value || '';
        field.input = control;
      } else {
        control = document.createElement('input');
        control.type = field.type || 'text';
        control.value = field.value || '';
        field.input = control;
      }

      if (isOptional) {
        row.classList.add('calendar-entry-sheet__optional-row');

        const optionalValue = document.createElement('div');
        optionalValue.className = 'calendar-entry-sheet__optional-value';

        const enableButton = document.createElement('button');
        enableButton.type = 'button';
        enableButton.className = 'calendar-entry-sheet__optional-enable';
        enableButton.textContent = field.optionalLabel || '지정';

        const optionalControl = document.createElement('div');
        optionalControl.className = 'calendar-entry-sheet__optional-control';
        optionalControl.id = makeId('calendarEntrySheetOptional');

        const clearButton = document.createElement('button');
        clearButton.type = 'button';
        clearButton.className = 'calendar-entry-sheet__optional-clear';
        clearButton.textContent = field.clearLabel || '취소';
        clearButton.setAttribute(
          'aria-label',
          field.clearAriaLabel || `${field.label} 지정 취소`,
        );

        control.id = control.id || makeId('calendarEntrySheetField');
        label.htmlFor = control.id;
        enableButton.setAttribute('aria-controls', optionalControl.id);

        function getFieldValue(key) {
          const targetField = fields.find((item) => item.key === key);
          return targetField?.input
            ? targetField.input.value
            : targetField?.value || '';
        }

        function setOptionalEnabled(isEnabled, { focus = false } = {}) {
          const enabled = Boolean(isEnabled);
          enableButton.hidden = enabled;
          optionalControl.hidden = !enabled;
          enableButton.setAttribute('aria-expanded', String(enabled));

          if (enabled) {
            if (!control.value) {
              const defaultValue =
                typeof field.getDefaultValue === 'function'
                  ? field.getDefaultValue({
                      field,
                      fields,
                      getValue: getFieldValue,
                    })
                  : field.defaultValue;
              control.value = String(defaultValue || '');
            }

            if (focus) control.focus();
            return;
          }

          control.value = '';
          if (focus) enableButton.focus();
        }

        enableButton.addEventListener('click', (event) => {
          event.preventDefault();
          setOptionalEnabled(true, { focus: true });
        });
        clearButton.addEventListener('click', (event) => {
          event.preventDefault();
          setOptionalEnabled(false, { focus: true });
        });

        optionalControl.append(control, clearButton);
        optionalValue.append(enableButton, optionalControl);
        row.append(label, optionalValue);
        setOptionalEnabled(Boolean(control.value));
      } else if (!isReadonly && field.type === 'select' && field.onSettings) {
        row.classList.add('calendar-entry-sheet__category-field');

        const actions = document.createElement('div');
        actions.className = 'calendar-entry-sheet__category-actions';

        const settingsButton = document.createElement('button');
        settingsButton.type = 'button';
        settingsButton.className = 'calendar-entry-sheet__category-settings';
        settingsButton.textContent = field.settingsLabel || '설정';
        settingsButton.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          field.onSettings?.({ field, control });
        });

        actions.append(control, settingsButton);
        row.append(label, actions);
      } else {
        row.append(label, control);
      }
      body.append(row);
    });

  if (!isReadonly && helpText) {
    const help = document.createElement('p');
    help.className = 'calendar-entry-sheet__help';
    help.textContent = helpText;
    body.append(help);
  }

  if (!isReadonly && onDelete) {
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'calendar-entry-sheet__danger';
    deleteButton.textContent = '삭제';
    deleteButton.addEventListener('click', () => {
      if (deleteConfirmation?.isOpen?.()) return;

      deleteConfirmation = openDeleteConfirmation({
        opener: deleteButton,
        description: deleteDescription,
        onConfirm: onDelete,
        onConfirmed: () => close(),
        onClose: () => {
          deleteConfirmation = null;
        },
      });
    });
    body.append(deleteButton);
  }

  if (calendarType === 'work' && characterImage) {
    const character = document.createElement('div');
    character.className = 'calendar-entry-sheet__character';
    character.setAttribute('aria-hidden', 'true');

    const image = document.createElement('img');
    image.className = 'calendar-entry-sheet__character-image';
    image.src = characterImage;
    image.alt = '';
    character.append(image);
    body.append(character);
  }

  header.append(closeButton, heading, submitButton);
  dialog.append(header, body);
  overlay.append(dialog);
  document.body.append(overlay);

  let isOpen = false;
  let closeTimer = 0;

  function close({ restoreFocus = true } = {}) {
    if (!isOpen) return;
    isOpen = false;
    deleteConfirmation?.close?.({ restoreFocus: false, force: true });
    deleteConfirmation = null;
    overlay.classList.remove('is-open');
    overlay.classList.add('is-closing');
    unlockBodyScroll();
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('mallin:before-pjax-swap', handlePageExit);
    window.removeEventListener('pagehide', handlePageExit);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      overlay.remove();
      if (activeSheet === api) activeSheet = null;
      if (restoreFocus) opener?.focus?.();
    }, 220);
  }

  closeButton.addEventListener('click', () => close());
  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) close();
  });
  submitButton.addEventListener('click', async () => {
    if (isReadonly) {
      close();
      return;
    }

    const values = fields.reduce((acc, field) => {
      acc[field.key] = field.input ? field.input.value : field.value;
      return acc;
    }, {});

    submitButton.disabled = true;
    submitButton.textContent = '저장 중';
    try {
      await onSave?.(values);
      close();
    } catch {
      submitButton.disabled = false;
      submitButton.textContent = submitLabel;
    }
  });

  function handleKeydown(event) {
    if (deleteConfirmation?.isOpen?.()) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusable(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
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

  function handlePageExit() {
    close({ restoreFocus: false });
  }

  const api = {
    close,
    isOpen: () => isOpen,
  };

  activeSheet?.close?.({ restoreFocus: false });
  activeSheet = api;
  isOpen = true;
  overlay.hidden = false;
  lockBodyScroll();
  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('mallin:before-pjax-swap', handlePageExit);
  window.addEventListener('pagehide', handlePageExit);
  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
    const initialFocusTarget =
      calendarType === 'study' || calendarType === 'event'
        ? closeButton
        : fields.find((field) => field.key === 'title')?.input || dialog;
    initialFocusTarget.focus({ preventScroll: true });
  });

  return api;
}
