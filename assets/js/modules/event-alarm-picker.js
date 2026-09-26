import {
  EVENT_ALARM_PRESETS, alarmOptionLabel, getEventAlarmPlugin, makeEventAlarmSet,
  makeAlarmCalendarFile, normalizeAlarmSelection, parseAlarmDateTime,
} from './event-alarm.js';

let activePicker = null;
const consentKey = 'mallinoi.event-alarm-consent.v2';
const webKey = (key) => `mallinoi.event-alarm.v2:${key}`;

function createPopover(opener, label) {
  activePicker?.close();
  const parent = opener.closest('[role="dialog"]');
  const wasInert = parent?.inert;
  const overlay = document.createElement('div');
  overlay.className = 'event-alarm-picker';
  const dialog = document.createElement('section');
  dialog.className = 'event-alarm-picker__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', label);
  dialog.tabIndex = -1;
  overlay.append(dialog);
  document.body.append(overlay);
  if (parent) parent.inert = true;
  let closed = false;
  let busy = false;
  function close({ force = false, restoreFocus = true } = {}) {
    if (closed || (busy && !force)) return;
    closed = true;
    document.removeEventListener('keydown', keydown, true);
    window.removeEventListener('mallin:before-pjax-swap', pageExit);
    overlay.remove();
    if (parent) parent.inert = Boolean(wasInert);
    if (restoreFocus && opener.isConnected) opener.focus({ preventScroll: true });
    if (activePicker === api) activePicker = null;
  }
  function pageExit() { close({ force: true, restoreFocus: false }); }
  function keydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopImmediatePropagation(); close();
    } else if (event.key === 'Tab') {
      event.stopImmediatePropagation();
      const targets = [...dialog.querySelectorAll('button:not(:disabled)')].filter((item) => item.getClientRects().length);
      const first = targets[0], last = targets.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); }
      else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
        event.preventDefault(); (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }
  const api = { dialog, close, isClosed: () => closed, setBusy(value) { busy = value; } };
  activePicker = api;
  document.addEventListener('keydown', keydown, true);
  window.addEventListener('mallin:before-pjax-swap', pageExit);
  overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
  dialog.focus({ preventScroll: true });
  return api;
}

// A scrollable single-selection menu, matching the Calendar alert options.
export function openEventAlarmPicker({ opener, value = null, onChange, label = '알람 설정' }) {
  const api = createPopover(opener, label);
  api.dialog.classList.add('event-alarm-picker__menu');
  const list = document.createElement('div');
  list.className = 'event-alarm-picker__list';
  list.setAttribute('role', 'menu');
  list.setAttribute('aria-label', label);
  for (const option of [{ minutes: null, label: '없음' }, ...EVENT_ALARM_PRESETS]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('role', 'menuitemradio');
    button.setAttribute('aria-checked', String(value === option.minutes));
    button.className = 'event-alarm-picker__option';
    const check = document.createElement('span');
    check.setAttribute('aria-hidden', 'true'); check.textContent = value === option.minutes ? '✓' : '';
    const text = document.createElement('span'); text.textContent = option.label;
    button.append(check, text);
    button.addEventListener('click', () => { onChange(option.minutes); api.close(); });
    list.append(button);
  }
  api.dialog.append(list);
  list.addEventListener('keydown', (event) => {
    const buttons = [...list.querySelectorAll('button')];
    const index = buttons.indexOf(document.activeElement);
    let next;
    if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
    if (event.key === 'ArrowUp') next = (index + buttons.length - 1) % buttons.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
  });
  const selected = list.querySelector('[aria-checked="true"]');
  selected?.focus({ preventScroll: true });
  selected?.scrollIntoView({ block: 'nearest' });
  return api;
}

function openPermissionPrompt({ opener, plugin, onAllowed }) {
  const api = createPopover(opener, '알람 허용');
  api.dialog.innerHTML = '<h3>알람을 허용할까요?</h3><p>말린오이 캘린더가 선택한 시간에 일정을 알려드려요. 허용을 누르면 휴대폰 설정으로 이동합니다. 알람을 허용한 뒤 앱으로 돌아와 주세요.</p><p role="status"></p><div class="event-alarm-picker__actions"><button type="button" data-action="cancel">취소</button><button type="button" data-action="allow">허용</button></div>';
  const buttons = [...api.dialog.querySelectorAll('button')];
  api.dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => api.close());
  api.dialog.querySelector('[data-action="allow"]').addEventListener('click', async () => {
    api.setBusy(true); buttons.forEach((button) => { button.disabled = true; });
    try {
      await plugin.requestPermission();
      await plugin.openSettings();
      try { localStorage.setItem(consentKey, 'true'); } catch { /* consent can be asked again */ }
      if (api.isClosed()) return;
      api.close({ force: true, restoreFocus: false });
      onAllowed();
    } catch (error) {
      if (api.isClosed()) return;
      api.dialog.querySelector('[role="status"]').textContent = error?.message || '설정을 열지 못했어요. 다시 시도해 주세요.';
      api.setBusy(false); buttons.forEach((button) => { button.disabled = false; }); buttons[1].focus();
    }
  });
  buttons[0].focus({ preventScroll: true });
  return api;
}

export function createEventAlarmEditor({ key = null, getEvent }) {
  const plugin = getEventAlarmPlugin();
  const element = document.createElement('div');
  element.className = 'event-alarm-fields';
  let selection = [];
  let existing = null;
  let closed = false;
  let popover = null;
  let locked = true;
  const buttons = [], rows = [];
  const status = document.createElement('p');
  status.className = 'event-alarm-fields__status';
  status.setAttribute('role', 'status');
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function render() {
    buttons[0].textContent = selection.length ? `${alarmOptionLabel(selection[0])} ⌃⌄` : '알람 설정';
    buttons[1].textContent = selection.length > 1 ? `${alarmOptionLabel(selection[1])} ⌃⌄` : '없음 ⌃⌄';
    rows[1].hidden = !selection.length;
    buttons.forEach((button) => { button.disabled = locked; });
  }
  function choose(index) {
    popover = openEventAlarmPicker({ opener: buttons[index], value: selection[index] ?? null,
      label: index ? '두 번째 알람 설정' : '알람 설정', onChange(value) {
        const draft = [...selection]; draft[index] = value;
        selection = normalizeAlarmSelection(draft);
        render();
        message('일정을 저장하면 알람 설정이 반영돼요.');
      } });
  }
  for (let index = 0; index < 2; index++) {
    const row = document.createElement('div'); row.className = 'calendar-entry-sheet__field';
    const label = document.createElement('span'); label.className = 'calendar-entry-sheet__label';
    label.textContent = index ? '두 번째 알람' : '알람';
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-label', index ? '두 번째 알람 설정' : '알람 설정');
    button.setAttribute('aria-haspopup', 'menu');
    button.addEventListener('click', async () => {
      if (locked) return;
      try {
        if (plugin) {
          const permissions = await plugin.getPermission();
          let consent = false;
          try { consent = localStorage.getItem(consentKey) === 'true'; } catch { /* ask */ }
          if (closed) return;
          if (!consent || !permissions.allowed) {
            popover = openPermissionPrompt({ opener: button, plugin, onAllowed: () => { if (!closed) choose(index); } });
            return;
          }
        }
        choose(index);
      } catch (error) { message(error.message || '알람 권한을 확인하지 못했어요.', true); }
    });
    row.append(label, button); rows.push(row); buttons.push(button); element.append(row);
  }
  element.append(status);
  if (!plugin) {
    const note = document.createElement('p'); note.className = 'event-alarm-fields__note';
    note.textContent = '웹에서는 저장 후 알림 파일을 캘린더 앱으로 가져와 주세요. 휴대폰 앱에서는 기기에 알람을 등록해요.';
    element.append(note);
  }
  render();
  const ready = (async () => {
    if (key) {
      existing = plugin ? await plugin.getSettings({ key }) : JSON.parse(localStorage.getItem(webKey(key)) || 'null');
      if (existing?.selection) selection = normalizeAlarmSelection(existing.selection);
      else if (existing?.legacyAlarm) {
        try {
          const minutes = (parseAlarmDateTime(getEvent().startValue).getTime() - existing.legacyAlarm.fireAt) / 60_000;
          selection = normalizeAlarmSelection([minutes]);
        } catch { message('기존 알람이 있어요. 사용할 시간을 다시 선택하고 저장해 주세요.'); }
      }
    }
    if (!closed) { locked = false; render(); }
  })();
  ready.catch(() => { if (!closed) message('기존 알람 정보를 불러오지 못했어요. 일정을 다시 열어 주세요.', true); });
  return {
    element, ready,
    close() { closed = true; popover?.close({ force: true, restoreFocus: false }); },
    setLocked(value) { locked = value; render(); },
    async prepare(event) {
      await ready;
      const prepared = makeEventAlarmSet(event, selection);
      if (plugin && prepared.alarms.length) {
        const permission = await plugin.getPermission();
        if (!permission.allowed) throw new Error('알람 설정을 눌러 휴대폰에서 알람을 허용해 주세요.');
      }
      return prepared;
    },
    async commit(savedKey, event, prepared) {
      if (plugin) {
        const result = await plugin.replace({ key: savedKey, previousKey: key || savedKey, ...prepared,
          title: event.title, startAt: prepared.alarms[0]?.startAt || 0 });
        if (!result?.scheduled) throw new Error('알람 등록을 확인하지 못했어요. 저장을 눌러 다시 시도해 주세요.');
      } else {
        const uid = existing?.uid || crypto.randomUUID();
        if (prepared.selection.length || existing?.selection?.length) {
          const base = makeEventAlarmSet(event, [0], -Infinity).alarms[0];
          const content = makeAlarmCalendarFile(base, { uid, alarms: prepared.alarms });
          const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }));
          const link = document.createElement('a'); link.href = url; link.download = '말린오이-일정알림.ics';
          document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
        }
        localStorage.setItem(webKey(savedKey), JSON.stringify({ selection: prepared.selection, uid }));
        if (key && key !== savedKey) localStorage.removeItem(webKey(key));
      }
      key = savedKey;
      existing = { ...existing, selection: prepared.selection };
      return { skipped: prepared.skipped, web: !plugin && Boolean(prepared.selection.length) };
    },
    showError(error) { message(error.message || String(error), true); },
  };
}

export async function cancelEventAlarms(key) {
  const plugin = getEventAlarmPlugin();
  if (plugin) await plugin.replace({ key, previousKey: key, alarms: [], selection: [], title: '', startAt: 0 });
  else localStorage.removeItem(webKey(key));
}
