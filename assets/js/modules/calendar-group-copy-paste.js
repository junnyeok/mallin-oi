import { supabase } from './supabase-client.js';
import { refreshCalendarWidgets } from './calendar-native-widgets.js';
import {
  CALENDAR_COPY_BUFFER_KEY,
  buildCalendarCategoryPreviewRpcArgs,
  buildCalendarPasteRpcArgs,
  classifyCalendarPasteError,
  createCalendarCopyBuffer,
  createSingleFlight,
  getCalendarCategoryConflicts,
  normalizeCalendarPasteCategories,
  parseCalendarCopyBuffer,
  validateCalendarPasteResult,
} from './calendar-copy-buffer.js';

const LABELS = { study: '자기개발', work: '업무', event: '이벤트' };

function getCopyStorage() {
  for (const getStorage of [
    () => window.localStorage,
    () => window.sessionStorage,
  ]) {
    try {
      const storage = getStorage();
      const testKey = `${CALENDAR_COPY_BUFFER_KEY}:storage-test`;
      storage.setItem(testKey, '1');
      storage.removeItem(testKey);
      return storage;
    } catch {
      // Capacitor WebView와 브라우저 모두 다음 안전한 웹 저장소를 시도한다.
    }
  }
  return null;
}

function readBuffer(calendarType) {
  const storage = getCopyStorage();
  if (!storage) return { buffer: null, reason: 'storage' };

  const result = parseCalendarCopyBuffer(
    storage.getItem(CALENDAR_COPY_BUFFER_KEY),
    { calendarType },
  );
  if (['corrupt', 'unsupported', 'expired'].includes(result.reason)) {
    storage.removeItem(CALENDAR_COPY_BUFFER_KEY);
  }
  return result;
}

function saveBuffer(value) {
  const storage = getCopyStorage();
  if (!storage) throw new Error('calendar copy storage is unavailable');
  storage.setItem(CALENDAR_COPY_BUFFER_KEY, JSON.stringify(value));
}

function clearBuffer() {
  getCopyStorage()?.removeItem(CALENDAR_COPY_BUFFER_KEY);
}

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
  const backupButton = bar?.querySelector('.calendar-group-bar__backup');
  if (!backupButton) return null;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'calendar-group-bar__copy-paste';
  backupButton.insertAdjacentElement('beforebegin', button);
  let selectedGroup = null;
  const pasteFlight = createSingleFlight();

  function render() {
    button.textContent = selectedGroup ? '캘린더 복사' : '캘린더 붙여넣기';
    const { buffer, reason } = readBuffer(calendarType);
    button.disabled = pasteFlight.isActive() || (!selectedGroup && !buffer);
    button.title = pasteFlight.isActive()
      ? '캘린더를 붙여넣는 중이야.'
      : button.disabled
        ? reason === 'expired'
          ? '복사본이 만료됐어. 그룹 캘린더에서 다시 복사해줘.'
          : reason === 'storage'
            ? '복사본을 보관할 웹 저장소를 사용할 수 없어.'
            : '현재 캘린더에 붙여넣을 복사본이 없어.'
        : (!selectedGroup && buffer.mode === 'range')
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
      let settled = false;
      const finish = (confirmed) => {
        if (settled) return;
        settled = true;
        dialog.querySelectorAll('button').forEach((item) => { item.disabled = true; });
        closeDialog(dialog);
        resolve(confirmed);
      };
      dialog.querySelector('[data-cancel]').onclick = () => finish(false);
      dialog.querySelector('[data-confirm]').onclick = () => finish(true);
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); }, { once: true });
      dialog.showModal();
    });
  }

  function chooseCategoryResolutions(categories) {
    const conflicts = getCalendarCategoryConflicts(categories);
    if (conflicts.length === 0) return Promise.resolve([]);

    return new Promise((resolve) => {
      const dialog = makeDialog();
      const conflictRows = conflicts.map((category, index) => `
        <fieldset class="calendar-copy-dialog__conflict" data-conflict="${index}">
          <legend>‘${escapeHtml(category.name)}’</legend>
          <div class="calendar-copy-dialog__color-compare" aria-label="카테고리 색상 비교">
            <span><i style="--category-color: ${category.targetColor}"></i>기존 설정</span>
            <span><i style="--category-color: ${category.color}"></i>복사한 설정</span>
          </div>
          <label><input type="radio" name="category-resolution-${index}" value="overwrite"> 복사한 카테고리 설정으로 덮어쓰기</label>
          <label><input type="radio" name="category-resolution-${index}" value="keep"> 기존 카테고리 유지</label>
        </fieldset>
      `).join('');
      dialog.innerHTML = `
        <div class="calendar-copy-dialog__card">
          <h2>카테고리 덮어쓰기</h2>
          <p>같은 이름의 카테고리가 있습니다. 카테고리마다 적용할 설정을 선택해줘.</p>
          <div class="calendar-copy-dialog__conflicts">${conflictRows}</div>
          <div class="calendar-copy-dialog__actions">
            <button type="button" data-cancel>취소</button>
            <button type="button" data-resolve disabled>선택 완료</button>
          </div>
        </div>
      `;
      const resolveButton = dialog.querySelector('[data-resolve]');
      const updateResolveButton = () => {
        resolveButton.disabled = conflicts.some((_, index) =>
          !dialog.querySelector(`input[name="category-resolution-${index}"]:checked`));
      };
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        dialog.querySelectorAll('button, input').forEach((item) => {
          item.disabled = true;
        });
        closeDialog(dialog);
        resolve(value);
      };
      dialog.addEventListener('change', updateResolveButton);
      dialog.querySelector('[data-cancel]').onclick = () => finish(null);
      resolveButton.onclick = () => finish(conflicts.map((category, index) => ({
        sourceCategoryKey: category.sourceCategoryKey,
        action: dialog.querySelector(
          `input[name="category-resolution-${index}"]:checked`,
        ).value,
      })));
      dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
        finish(null);
      }, { once: true });
      dialog.showModal();
      dialog.querySelector('input[type="radio"]')?.focus();
    });
  }

  async function loadPasteCategories(buffer) {
    const rows = await rpc(
      'get_group_calendar_paste_categories',
      buildCalendarCategoryPreviewRpcArgs(buffer, calendarType),
    );
    return normalizeCalendarPasteCategories(rows);
  }

  async function storeCopy(source, mode, dates = {}) {
    const initialBuffer = createCalendarCopyBuffer({
      mode,
      calendarType,
      groupId: selectedGroup.id,
      groupName: selectedGroup.name,
      sourceUserId: source.source_user_id,
      sourceNickname: source.nickname,
      backupCount: Number(source.backup_count || 0),
      ...dates,
      copiedAt: new Date().toISOString(),
    });
    const categories = await loadPasteCategories(initialBuffer);
    const buffer = createCalendarCopyBuffer({ ...initialBuffer, categories });
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
    card.querySelector('[data-copy-all]').onclick = async () => {
      const actionButtons = card.querySelectorAll('button');
      actionButtons.forEach((item) => { item.disabled = true; });
      try {
        await storeCopy(source, 'all');
        window.alert(`${source.nickname}님의 ${LABELS[calendarType]} 캘린더 전체를 복사했어. 개인 ${LABELS[calendarType]} 캘린더에서 붙여넣을 수 있어.`);
        closeDialog(dialog);
      } catch (error) {
        console.error('[calendar-copy-paste] copy buffer save failed', {
          code: error?.code || null,
          status: error?.status || null,
        });
        window.alert(classifyCalendarPasteError(error).message);
        actionButtons.forEach((item) => { item.disabled = false; });
      }
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
    card.querySelector('[data-range-copy]').onclick = async () => {
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
      const actionButtons = card.querySelectorAll('button');
      actionButtons.forEach((item) => { item.disabled = true; });
      try {
        await storeCopy(source, 'range', { startDate, endDate });
        window.alert(`${source.nickname}님의 ${LABELS[calendarType]} 캘린더 중 ${formatDate(startDate)} ~ ${formatDate(endDate)} 범위를 복사했어. 개인 ${LABELS[calendarType]} 캘린더에서 붙여넣을 수 있어.`);
        closeDialog(dialog);
      } catch (saveError) {
        console.error('[calendar-copy-paste] copy buffer save failed', {
          code: saveError?.code || null,
          status: saveError?.status || null,
        });
        error.textContent = classifyCalendarPasteError(saveError).message;
        error.hidden = false;
        actionButtons.forEach((item) => { item.disabled = false; });
      }
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
      console.error('[calendar-copy-paste] copy sources load failed', {
        code: error?.code || null,
        status: error?.status || null,
      });
      dialog.querySelector('[data-list]').textContent = '복사 대상을 불러오지 못했어.';
    }
  }

  async function paste() {
    const run = await pasteFlight.run(async () => {
      render();
      const { buffer, reason } = readBuffer(calendarType);
      if (!buffer) {
        const message = reason === 'expired'
          ? '복사본이 만료됐어. 그룹 캘린더에서 다시 복사해줘.'
          : reason === 'storage'
            ? '복사본 저장소를 사용할 수 없어. 앱이나 브라우저 설정을 확인해줘.'
            : '붙여넣을 복사본이 없어. 그룹 캘린더에서 먼저 복사해줘.';
        window.alert(message);
        return;
      }

      const isRange = buffer.mode === 'range';
      const confirmed = await confirmPaste(isRange
        ? {
          title: '캘린더 범위 붙여넣기',
          message: `'${buffer.sourceNickname}'님의 ${formatDate(buffer.startDate)} ~ ${formatDate(buffer.endDate)} 일정을 내 ${LABELS[calendarType]} 캘린더에 새 일정으로 추가해. 계속할까?`,
        }
        : {
          title: '캘린더 붙여넣기',
          message: `'${buffer.sourceNickname}'님의 ${LABELS[calendarType]} 일정 ${buffer.backupCount}개를 내 캘린더에 새 일정으로 추가해. 계속할까?`,
        });
      if (!confirmed) return;

      try {
        const categories = await loadPasteCategories(buffer);
        const categoryResolutions = await chooseCategoryResolutions(categories);
        if (categoryResolutions === null) return;

        const data = await rpc(
          'paste_group_calendar_backup_to_my_calendar',
          buildCalendarPasteRpcArgs(
            buffer,
            calendarType,
            categoryResolutions,
          ),
        );
        const { insertedCount } = validateCalendarPasteResult(data);
        clearBuffer();
        await refreshCalendarWidgets({ force: true });

        try {
          await onPasted?.();
        } catch (refreshError) {
          console.warn('[calendar-copy-paste] calendar refresh callback failed');
        }

        window.alert(`붙여넣기 완료. 내 ${LABELS[calendarType]} 캘린더에 새 일정 ${insertedCount}개를 추가했어.`);
        window.location.reload();
      } catch (error) {
        console.error('[calendar-copy-paste] paste failed:', {
          code: error?.code || null,
          status: error?.status || null,
        });
        window.alert(classifyCalendarPasteError(error).message);
      }
    });

    if (run.started) render();
  }

  button.addEventListener('click', () => selectedGroup ? void openCopy() : void paste());
  render();
  return { setGroup(group) { selectedGroup = group?.id ? group : null; render(); } };
}
