import { supabase } from './supabase-client.js';
import { refreshCalendarWidgets } from './calendar-native-widgets.js';

const BUFFER_KEY = 'mallin_calendar_copy_buffer';
const LABELS = { study: '자기개발', work: '업무', event: '이벤트' };

function readBuffer() {
  try { return JSON.parse(localStorage.getItem(BUFFER_KEY) || 'null'); } catch { return null; }
}

function saveBuffer(value) { localStorage.setItem(BUFFER_KEY, JSON.stringify(value)); }

function getBufferMode(buffer) { return buffer?.mode === 'range' ? 'range' : 'all'; }

function formatDate(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ''))) return '';
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'numeric', day: 'numeric' })
    .format(new Date(year, month - 1, day));
}

async function rpc(name, args) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data || [];
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function makeDialog() {
  const dialog = document.createElement('dialog');
  dialog.className = 'calendar-copy-dialog';
  document.body.append(dialog);
  return dialog;
}

export function initCalendarCopyPaste({ bar, calendarType, onPasted }) {
  const toggle = bar?.querySelector('.calendar-group-bar__toggle');
  if (!toggle) return null;
  toggle.textContent = '그룹 설정';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'calendar-group-bar__copy-paste';
  toggle.insertAdjacentElement('afterend', button);
  let selectedGroup = null;

  function render() {
    button.textContent = selectedGroup ? '캘린더 복사' : '캘린더 붙여넣기';
    const buffer = readBuffer();
    button.disabled = !selectedGroup && buffer?.calendarType !== calendarType;
    button.title = button.disabled
      ? '현재 캘린더에 붙여넣을 복사본이 없어.'
      : (!selectedGroup && getBufferMode(buffer) === 'range')
        ? `${formatDate(buffer.startDate)} ~ ${formatDate(buffer.endDate)} 범위 붙여넣기`
        : '';
  }

  function closeDialog(dialog) {
    dialog.close();
    dialog.remove();
  }

  function confirmPaste({ title, message }) {
    return new Promise((resolve) => {
      const dialog = makeDialog();
      dialog.innerHTML = `
        <div class="calendar-copy-dialog__card">
          <h2>${escapeHtml(title)}</h2>
          <p>${escapeHtml(message)}</p>
          <div class="calendar-copy-dialog__actions">
            <button type="button" data-cancel>취소</button>
            <button type="button" data-confirm>붙여넣기</button>
          </div>
        </div>
      `;
      const finish = (confirmed) => { closeDialog(dialog); resolve(confirmed); };
      dialog.querySelector('[data-cancel]').onclick = () => finish(false);
      dialog.querySelector('[data-confirm]').onclick = () => finish(true);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); }, { once: true });
      dialog.showModal();
    });
  }

  function storeCopy(source, mode, dates = {}) {
    const buffer = {
      mode,
      calendarType,
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      sourceUserId: source.source_user_id,
      sourceNickname: source.nickname,
      ...dates,
      copiedAt: new Date().toISOString(),
    };
    saveBuffer(buffer);
    render();
    return buffer;
  }

  function renderCopyMode(dialog, source) {
    const card = dialog.querySelector('.calendar-copy-dialog__card');
    card.innerHTML = `
      <h2>복사 방식 선택</h2>
      <p><strong>${escapeHtml(source.nickname)}</strong>님의 ${LABELS[calendarType]} 캘린더를 어떻게 복사할까요?</p>
      <div class="calendar-copy-dialog__mode-actions">
        <button type="button" data-copy-all>전체복사</button>
        <button type="button" data-copy-range>날짜지정복사</button>
      </div>
      <div class="calendar-copy-dialog__actions"><button type="button" data-cancel>취소</button></div>
    `;
    card.querySelector('[data-cancel]').onclick = () => closeDialog(dialog);
    card.querySelector('[data-copy-all]').onclick = () => {
      storeCopy(source, 'all');
      window.alert(`${source.nickname}님의 ${LABELS[calendarType]} 캘린더 전체를 복사했어. 개인 ${LABELS[calendarType]} 캘린더에서 붙여넣을 수 있어.`);
      closeDialog(dialog);
    };
    card.querySelector('[data-copy-range]').onclick = () => renderDateRange(dialog, source);
  }

  function renderDateRange(dialog, source) {
    const today = new Date().toLocaleDateString('en-CA');
    const card = dialog.querySelector('.calendar-copy-dialog__card');
    card.innerHTML = `
      <h2>날짜 범위 선택</h2>
      <p><strong>${escapeHtml(source.nickname)}</strong>님의 ${LABELS[calendarType]} 캘린더에서 복사할 범위를 선택해줘.</p>
      <div class="calendar-copy-dialog__dates">
        <label><span>시작일</span><input type="date" data-start-date value="${today}" required></label>
        <label><span>종료일</span><input type="date" data-end-date value="${today}" required></label>
      </div>
      <p class="calendar-copy-dialog__error" data-error hidden></p>
      <div class="calendar-copy-dialog__actions">
        <button type="button" data-back>뒤로</button>
        <button type="button" data-range-copy>날짜지정복사</button>
      </div>
    `;
    const startInput = card.querySelector('[data-start-date]');
    const endInput = card.querySelector('[data-end-date]');
    const error = card.querySelector('[data-error]');
    endInput.min = startInput.value;
    startInput.addEventListener('change', () => { endInput.min = startInput.value; });
    card.querySelector('[data-back]').onclick = () => renderCopyMode(dialog, source);
    card.querySelector('[data-range-copy]').onclick = () => {
      const startDate = startInput.value;
      const endDate = endInput.value;
      let message = '';
      if (!startDate || !endDate) message = '시작일과 종료일을 모두 선택해줘.';
      else if (startDate > endDate) message = '시작일은 종료일보다 늦을 수 없어.';
      if (message) {
        error.textContent = message;
        error.hidden = false;
        return;
      }
      storeCopy(source, 'range', { startDate, endDate });
      window.alert(`${source.nickname}님의 ${LABELS[calendarType]} 캘린더 중 ${formatDate(startDate)} ~ ${formatDate(endDate)} 범위를 복사했어. 개인 ${LABELS[calendarType]} 캘린더에서 붙여넣을 수 있어.`);
      closeDialog(dialog);
    };
  }

  async function openCopy() {
    const dialog = makeDialog();
    dialog.innerHTML = '<div class="calendar-copy-dialog__card"><h2>캘린더 복사</h2><p>그룹에 백업된 캘린더 중 내 개인 캘린더로 복사할 대상을 선택해줘.</p><div data-list>불러오는 중…</div><div class="calendar-copy-dialog__actions"><button data-close>닫기</button><button data-copy disabled>복사</button></div></div>';
    dialog.showModal();
    dialog.querySelector('[data-close]').onclick = () => closeDialog(dialog);
    try {
      const sources = await rpc('get_group_calendar_copy_sources', { p_group_id: selectedGroup.id, p_calendar_type: calendarType });
      const list = dialog.querySelector('[data-list]');
      list.innerHTML = sources.length ? sources.map((source, index) => `<label class="calendar-copy-dialog__source"><input type="radio" name="calendarCopySource" value="${escapeHtml(source.source_user_id)}" ${index === 0 ? 'checked' : ''}><span><strong>${escapeHtml(source.nickname)}</strong><small>${Number(source.backup_count || 0)}개 · ${source.last_backed_up_at ? new Date(source.last_backed_up_at).toLocaleString('ko-KR') : '백업 시간 없음'}</small></span></label>`).join('') : '<p>이 캘린더 타입으로 백업한 그룹원이 아직 없어.</p>';
      const copyButton = dialog.querySelector('[data-copy]');
      copyButton.disabled = !sources.length;
      copyButton.onclick = () => {
        const sourceId = dialog.querySelector('input[name="calendarCopySource"]:checked')?.value;
        const source = sources.find((item) => item.source_user_id === sourceId);
        if (!source) return;
        renderCopyMode(dialog, source);
      };
    } catch (error) {
      dialog.querySelector('[data-list]').textContent = error.message || '복사 대상을 불러오지 못했어.';
    }
  }

  async function paste() {
    const buffer = readBuffer();
    if (!buffer || buffer.calendarType !== calendarType) return;
    const mode = getBufferMode(buffer);
    const isRange = mode === 'range';
    const confirmed = await confirmPaste(isRange
      ? {
        title: '캘린더 범위 붙여넣기',
        message: `내 ${LABELS[calendarType]} 캘린더의 ${formatDate(buffer.startDate)} ~ ${formatDate(buffer.endDate)} 일정만 '${buffer.sourceNickname}'님의 백업 캘린더로 덮어쓰기 돼. 계속할까?`,
      }
      : {
        title: '캘린더 붙여넣기',
        message: `내 ${LABELS[calendarType]} 캘린더 전체가 '${buffer.sourceNickname}'님의 백업 캘린더로 덮어쓰기 돼. 계속할까?`,
      });
    if (!confirmed) return;
    button.disabled = true;
    try {
      await rpc('paste_group_calendar_backup_to_my_calendar', {
        p_group_id: buffer.groupId,
        p_calendar_type: calendarType,
        p_source_user_id: buffer.sourceUserId,
        p_start_date: isRange ? buffer.startDate : null,
        p_end_date: isRange ? buffer.endDate : null,
      });
      await refreshCalendarWidgets({ force: true });
      window.alert(isRange
        ? `붙여넣기 완료. 내 ${LABELS[calendarType]} 캘린더의 선택한 날짜 범위가 업데이트됐어.`
        : `붙여넣기 완료. 내 ${LABELS[calendarType]} 캘린더가 업데이트됐어.`);
      await onPasted?.();
      window.location.reload();
    } catch (error) {
      window.alert(error.message || '캘린더를 붙여넣지 못했어.');
      render();
    }
  }

  button.addEventListener('click', () => selectedGroup ? void openCopy() : void paste());
  render();
  return { setGroup(group) { selectedGroup = group?.id ? group : null; render(); } };
}
