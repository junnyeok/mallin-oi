// assets/js/modules/calendar-groups.js

import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  saveRedirect,
  showLoginRequiredPopup,
} from './auth-store.js';
import { isCalendarAppMode } from './app-calendar-mode.js';

const SELECTED_GROUP_KEY = 'mallin:calendar:selected-group';
const CALENDAR_LABELS = {
  study: '자기개발',
  work: '업무',
  event: '이벤트',
};

const GROUP_COLORS = [
  '#f54260',
  '#5fcbd6',
  '#3d63dd',
  '#f5c542',
  '#78d86f',
  '#b58cff',
  '#ff9a5c',
  '#eeeeee',
];

function normalizeColor(color, fallback = '#f54260') {
  const value = String(color || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : fallback;
}

function getTextColor(bgColor) {
  const color = normalizeColor(bgColor).replace('#', '');
  const r = parseInt(color.slice(0, 2), 16);
  const g = parseInt(color.slice(2, 4), 16);
  const b = parseInt(color.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#111111' : '#ffffff';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function toDateKey(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}`;
}

function getMonthRange(viewDate) {
  const start = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const end = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
  return {
    startDate: toDateKey(start),
    endDate: toDateKey(end),
  };
}

function getSelectedGroupId() {
  try {
    return localStorage.getItem(SELECTED_GROUP_KEY) || '';
  } catch {
    return '';
  }
}

function setSelectedGroupId(groupId) {
  try {
    if (groupId) {
      localStorage.setItem(SELECTED_GROUP_KEY, groupId);
    } else {
      localStorage.removeItem(SELECTED_GROUP_KEY);
    }
  } catch {
    // localStorage가 막힌 환경이면 선택 상태만 메모리에 둠
  }
}

function isAllowed(group, calendarType) {
  return Boolean(group?.[`allow_${calendarType}`]);
}

function makeAppHref(path) {
  return isCalendarAppMode() ? `${path}?app=calendar` : path;
}

function getCalendarSelectHref() {
  return isCalendarAppMode()
    ? './app-calendar.html?app=calendar'
    : './calendar-study.html';
}

function normalizeComparable(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function groupEventsByDateAndUser(rows = []) {
  const byDate = {};

  rows.forEach((row) => {
    const dateKey = row.event_date;
    if (!dateKey) return;

    if (!byDate[dateKey]) byDate[dateKey] = [];

    let member = byDate[dateKey].find((item) => item.userId === row.user_id);
    if (!member) {
      member = {
        userId: row.user_id,
        name: row.user_nickname || '회원',
        events: [],
      };
      byDate[dateKey].push(member);
    }

    member.events.push(row);
  });

  Object.values(byDate).forEach((members) => {
    members.sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    members.forEach((member) => {
      member.events.sort((a, b) =>
        String(a.title || '').localeCompare(String(b.title || ''), 'ko'),
      );
    });
  });

  return byDate;
}

async function rpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export function getVisiblePersonalTodos(todos = [], dateKey, groupState) {
  if (!Array.isArray(todos) || todos.length === 0) return todos;
  if (!dateKey || !groupState?.selectedGroup?.id || !groupState?.userId) {
    return todos;
  }
  if (!isAllowed(groupState.selectedGroup, groupState.calendarType)) return todos;

  const myGroupEvents = (groupState.eventsByDate?.[dateKey] || [])
    .filter((member) => member.userId === groupState.userId)
    .flatMap((member) => member.events || []);

  if (myGroupEvents.length === 0) return todos;

  const sourceIds = new Set(
    myGroupEvents
      .map((event) => String(event.source_event_id || '').trim())
      .filter(Boolean),
  );

  const fallbackKeys = new Set(
    myGroupEvents.map((event) =>
      [
        normalizeComparable(event.calendar_type || groupState.calendarType),
        normalizeComparable(event.event_date || dateKey),
        normalizeComparable(event.title || event.event_type),
        normalizeComparable(event.event_type),
      ].join('|'),
    ),
  );

  return todos.filter((todo) => {
    const todoId = String(todo.id || '').trim();
    if (todoId && sourceIds.has(todoId)) return false;

    const fallbackKey = [
      normalizeComparable(groupState.calendarType),
      normalizeComparable(todo.date || dateKey),
      normalizeComparable(todo.text || todo.type),
      normalizeComparable(todo.type),
    ].join('|');

    return !fallbackKeys.has(fallbackKey);
  });
}

export function appendCalendarGroupRows(root, dateKey, groupState) {
  if (!root || !dateKey || !groupState?.selectedGroup?.id) return;
  if (!isAllowed(groupState.selectedGroup, groupState.calendarType)) return;

  const members = groupState.eventsByDate?.[dateKey] || [];
  if (members.length === 0) return;

  const wrap = document.createElement('div');
  wrap.className = 'calendar-group-day-rows';

  members.forEach((member) => {
    const row = document.createElement('div');
    row.className = 'calendar-group-day-row';

    const name = document.createElement('span');
    name.className = 'calendar-group-day-row__name';
    name.textContent = member.name;

    const events = document.createElement('span');
    events.className = 'calendar-group-day-row__events';

    member.events.forEach((event) => {
      const badge = document.createElement('span');
      const color = normalizeColor(
        event.color,
        groupState.selectedGroup?.color || '#eeeeee',
      );

      badge.className = 'calendar-group-day-row__badge';
      badge.style.setProperty('--calendar-group-event-color', color);
      badge.style.setProperty('--calendar-group-event-text', getTextColor(color));
      badge.textContent = event.title || event.event_type || '일정';
      badge.title = `${member.name} · ${badge.textContent}`;
      events.append(badge);
    });

    row.append(name, events);
    wrap.append(row);
  });

  root.append(wrap);
}

export async function initCalendarGroupBar({
  calendarType,
  pageRoot,
  getViewDate,
  renderAll,
}) {
  if (!pageRoot || !CALENDAR_LABELS[calendarType]) return null;

  const user = await getCurrentUser();
  if (!user?.id) return null;

  const head = pageRoot.querySelector('[class$="-calendar-page__head"]');
  const state = {
    userId: user.id,
    calendarType,
    selectedGroup: null,
    groups: [],
    eventsByDate: {},
    lastBackupAt: '',
  };

  const bar = document.createElement('section');
  bar.className = 'calendar-group-bar';
  bar.setAttribute('aria-label', '캘린더 그룹 연동');
  const panelId = `${calendarType}CalendarGroupPanel`;
  bar.innerHTML = `
    <button
      class="calendar-group-bar__toggle"
      type="button"
      aria-expanded="false"
      aria-controls="${panelId}"
    >
      그룹
    </button>
    <div class="calendar-group-bar__panel" id="${panelId}" hidden>
    <div class="calendar-group-bar__main">
      <label class="calendar-group-bar__field">
        <span>그룹</span>
        <select class="calendar-group-bar__select" aria-label="연동 그룹 선택">
          <option value="">그룹 연동 OFF</option>
        </select>
      </label>
      <a class="calendar-group-bar__manage" href="${makeAppHref('./calendar-groups.html')}">그룹 관리</a>
      <button class="calendar-group-bar__backup" type="button">백업</button>
      <button class="calendar-group-bar__close" type="button">닫기</button>
    </div>
    <p class="calendar-group-bar__status" aria-live="polite">그룹 일정을 함께 보려면 그룹을 선택해줘.</p>
    </div>
  `;

  if (head) {
    head.append(bar);
  } else {
    pageRoot.prepend(bar);
  }

  const select = bar.querySelector('.calendar-group-bar__select');
  const backupButton = bar.querySelector('.calendar-group-bar__backup');
  const status = bar.querySelector('.calendar-group-bar__status');
  const toggleButton = bar.querySelector('.calendar-group-bar__toggle');
  const closeButton = bar.querySelector('.calendar-group-bar__close');
  const panel = bar.querySelector('.calendar-group-bar__panel');

  function setGroupPanelOpen(isOpen) {
    if (!panel || !toggleButton) return;
    panel.hidden = !isOpen;
    toggleButton.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  toggleButton?.addEventListener('click', () => {
    setGroupPanelOpen(Boolean(panel?.hidden));
  });

  closeButton?.addEventListener('click', () => {
    setGroupPanelOpen(false);
  });

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  function renderSelect() {
    const selectedId = state.selectedGroup?.id || '';
    select.innerHTML = '<option value="">그룹 연동 OFF</option>';

    state.groups.forEach((group) => {
      const option = document.createElement('option');
      option.value = group.id;
      option.textContent = group.name;
      select.append(option);
    });

    select.value = selectedId;
    backupButton.disabled = !selectedId || !isAllowed(state.selectedGroup, calendarType);
  }

  async function loadGroupEvents() {
    state.eventsByDate = {};

    if (!state.selectedGroup?.id) {
      setStatus('그룹 연동 OFF 상태야.');
      backupButton.disabled = true;
      renderAll?.();
      return;
    }

    if (!isAllowed(state.selectedGroup, calendarType)) {
      setStatus(`이 그룹은 ${CALENDAR_LABELS[calendarType]} 캘린더 연동이 꺼져 있어.`);
      backupButton.disabled = true;
      renderAll?.();
      return;
    }

    const { startDate, endDate } = getMonthRange(getViewDate());
    setStatus('그룹 일정을 불러오는 중...');

    const rows = await rpc('get_group_calendar_view', {
      p_group_id: state.selectedGroup.id,
      p_calendar_type: calendarType,
      p_start_date: startDate,
      p_end_date: endDate,
    });

    state.eventsByDate = groupEventsByDateAndUser(rows || []);
    backupButton.disabled = false;
    setStatus(
      `${state.selectedGroup.name} · ${CALENDAR_LABELS[calendarType]} 그룹 일정 표시 중`,
    );
    renderAll?.();
  }

  async function loadGroups() {
    state.groups = await rpc('get_my_calendar_groups');
    const selectedId = getSelectedGroupId();
    state.selectedGroup =
      state.groups.find((group) => group.id === selectedId) || null;

    renderSelect();
    await loadGroupEvents();
  }

  select.addEventListener('change', async () => {
    const groupId = select.value;
    state.selectedGroup = state.groups.find((group) => group.id === groupId) || null;
    setSelectedGroupId(groupId);
    renderSelect();

    try {
      await loadGroupEvents();
    } catch (error) {
      console.error('[calendar-groups] load group events failed:', error);
      setStatus('그룹 일정을 불러오지 못했어. SQL 적용 여부를 확인해줘.');
    }
  });

  backupButton.addEventListener('click', async () => {
    if (!state.selectedGroup?.id) return;

    backupButton.disabled = true;
    backupButton.textContent = '백업 중';
    setStatus('내 일정을 그룹 공유 데이터로 백업하는 중...');

    try {
      const result = await rpc('backup_my_calendar_to_group', {
        p_group_id: state.selectedGroup.id,
        p_calendar_type: calendarType,
      });

      const backedUpAt = result?.[0]?.backed_up_at || new Date().toISOString();
      const count = Number(result?.[0]?.event_count || 0);
      state.lastBackupAt = backedUpAt;
      setStatus(
        `${CALENDAR_LABELS[calendarType]} ${count}개 백업 완료 · ${new Date(
          backedUpAt,
        ).toLocaleString('ko-KR')}`,
      );
      await loadGroupEvents();
    } catch (error) {
      console.error('[calendar-groups] backup failed:', error);
      setStatus('백업에 실패했어. 그룹 권한과 SQL 적용 여부를 확인해줘.');
    } finally {
      backupButton.textContent = '백업';
      renderSelect();
    }
  });

  try {
    await loadGroups();
  } catch (error) {
    console.error('[calendar-groups] init bar failed:', error);
    setStatus('그룹 기능을 불러오지 못했어. Supabase SQL 적용이 필요해.');
  }

  return {
    state,
    refresh: loadGroupEvents,
  };
}

function getCalendarTypeFlags(form) {
  return {
    allowStudy: Boolean(form.querySelector('[name="allowStudy"]')?.checked),
    allowWork: Boolean(form.querySelector('[name="allowWork"]')?.checked),
    allowEvent: Boolean(form.querySelector('[name="allowEvent"]')?.checked),
  };
}

function createGroupCard(group, { myGroup = false, members = [] } = {}) {
  const isPrivate = group.visibility === 'private';
  const color = normalizeColor(group.color);
  const calendars = ['study', 'work', 'event']
    .filter((type) => group[`allow_${type}`])
    .map((type) => CALENDAR_LABELS[type])
    .join(', ');

  return `
    <article class="calendar-group-card" data-group-id="${escapeHtml(group.id)}">
      <div class="calendar-group-card__head">
        <span class="calendar-group-card__dot" style="--calendar-group-color:${color}"></span>
        <div>
          <h3 class="calendar-group-card__title">${escapeHtml(group.name)}</h3>
          <p class="calendar-group-card__meta">${isPrivate ? '비공개' : '공개'} · ${
            calendars || '연동 꺼짐'
          }</p>
        </div>
      </div>
      <div class="calendar-group-card__actions">
        ${
          myGroup
            ? `<button type="button" data-action="leave">나가기</button>`
            : `<input type="password" data-password placeholder="비밀번호" ${
                isPrivate ? '' : 'hidden'
              } /><button type="button" data-action="join">참여</button>`
        }
        ${
          group.can_manage
            ? `<button type="button" data-action="toggle-hidden">${
                group.is_hidden ? '다시 표시' : '숨기기'
              }</button>`
            : ''
        }
      </div>
      ${
        myGroup
          ? `
            <div class="calendar-group-card__members">
              <h4 class="calendar-group-card__section-title">참여자</h4>
              ${
                members.length > 0
                  ? `<ul class="calendar-group-member-list">
                      ${members
                        .map(
                          (member) => `
                            <li class="calendar-group-member">
                              <span class="calendar-group-member__name">${escapeHtml(
                                member.nickname || '회원',
                              )}${member.is_owner ? ' · 방장' : ''}</span>
                              ${
                                member.can_remove
                                  ? `<button type="button" data-action="kick-member" data-target-user-id="${escapeHtml(
                                      member.user_id,
                                    )}" data-target-nickname="${escapeHtml(
                                      member.nickname || '회원',
                                    )}">강퇴</button>`
                                  : ''
                              }
                            </li>
                          `,
                        )
                        .join('')}
                    </ul>`
                  : '<p class="calendar-groups-empty">참여자 정보를 불러오지 못했어.</p>'
              }
            </div>
          `
          : ''
      }
      ${
        group.can_manage
          ? `
            <details class="calendar-group-card__edit">
              <summary>편집</summary>
              <label>이름 <input data-edit-name value="${escapeHtml(group.name)}" maxlength="30" /></label>
              <label>색상 <input data-edit-color type="color" value="${color}" /></label>
              <fieldset class="calendar-group-card__checks">
                <legend>연동 캘린더 설정</legend>
                <label><input data-edit-allow="study" type="checkbox" ${group.allow_study ? 'checked' : ''} /> 자기개발</label>
                <label><input data-edit-allow="work" type="checkbox" ${group.allow_work ? 'checked' : ''} /> 업무</label>
                <label><input data-edit-allow="event" type="checkbox" ${group.allow_event ? 'checked' : ''} /> 이벤트</label>
              </fieldset>
              <fieldset class="calendar-group-card__checks">
                <legend>공개 설정</legend>
                <label><input data-edit-private type="checkbox" ${isPrivate ? 'checked' : ''} /> 비공개</label>
                <label><input data-edit-hidden type="checkbox" ${group.is_hidden ? 'checked' : ''} /> 숨기기</label>
              </fieldset>
              <input data-edit-password type="password" placeholder="새 비밀번호" />
              <button type="button" data-action="save-edit">저장</button>
            </details>
          `
          : ''
      }
    </article>
  `;
}

function renderColorChoices(root) {
  if (!root) return;

  root.innerHTML = GROUP_COLORS.map(
    (color, index) => `
      <label class="calendar-group-color">
        <input type="radio" name="color" value="${color}" ${
          index === 0 ? 'checked' : ''
        } />
        <span style="--calendar-group-color:${color}"></span>
      </label>
    `,
  ).join('');
}

export async function initCalendarGroupsPage() {
  const page = document.getElementById('calendarGroupsPage');
  if (!page) return;

  const user = await getCurrentUser();
  if (!user?.id) {
    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message: '캘린더 그룹은 로그인 후 만들고 참여할 수 있어.',
      confirmText: '로그인하러 가기',
      cancelText: '닫기',
    });
    saveRedirect(window.location.pathname + window.location.search);
    window.location.href = loginHref();
    return;
  }

  const form = document.getElementById('calendarGroupForm');
  const createToggle = document.getElementById('calendarGroupCreateToggle');
  const createPanel = document.getElementById('calendarGroupCreatePanel');
  const myList = document.getElementById('calendarMyGroups');
  const visibleList = document.getElementById('calendarVisibleGroups');
  const hiddenList = document.getElementById('calendarHiddenGroups');
  const status = document.getElementById('calendarGroupsStatus');
  const colorRoot = document.getElementById('calendarGroupColors');
  const privateToggle = document.getElementById('calendarGroupPrivate');
  const passwordInput = document.getElementById('calendarGroupPassword');
  const hiddenToggle = document.getElementById('calendarGroupHiddenToggle');

  renderColorChoices(colorRoot);

  const backLink = page.querySelector('.calendar-groups-page__back');
  if (backLink) {
    backLink.setAttribute('href', getCalendarSelectHref());
  }

  function setCreatePanelOpen(isOpen) {
    if (!createToggle || !createPanel) return;
    createPanel.hidden = !isOpen;
    createToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }

  createToggle?.addEventListener('click', () => {
    setCreatePanelOpen(Boolean(createPanel?.hidden));
  });

  function setStatus(message) {
    if (status) status.textContent = message;
  }

  async function load() {
    const [myGroups, visibleGroups, hiddenGroups] = await Promise.all([
      rpc('get_my_calendar_groups'),
      rpc('get_visible_calendar_groups', { p_include_hidden: false }),
      rpc('get_visible_calendar_groups', { p_include_hidden: true }),
    ]);
    const memberEntries = await Promise.all(
      (myGroups || []).map(async (group) => {
        try {
          const members = await rpc('get_calendar_group_members', {
            p_group_id: group.id,
          });
          return [group.id, members || []];
        } catch (error) {
          console.error('[calendar-groups] members load failed:', error);
          return [group.id, []];
        }
      }),
    );
    const membersByGroupId = Object.fromEntries(memberEntries);

    myList.innerHTML =
      myGroups?.length > 0
        ? myGroups
            .map((group) =>
              createGroupCard(group, {
                myGroup: true,
                members: membersByGroupId[group.id] || [],
              }),
            )
            .join('')
        : '<p class="calendar-groups-empty">아직 들어간 그룹이 없어.</p>';

    visibleList.innerHTML =
      visibleGroups?.length > 0
        ? visibleGroups.map((group) => createGroupCard(group)).join('')
        : '<p class="calendar-groups-empty">참여 가능한 그룹이 없어.</p>';

    const onlyHidden = (hiddenGroups || []).filter((group) => group.is_hidden);
    hiddenList.innerHTML =
      onlyHidden.length > 0
        ? onlyHidden.map((group) => createGroupCard(group)).join('')
        : '<p class="calendar-groups-empty">숨긴 그룹이 없어.</p>';
  }

  privateToggle?.addEventListener('change', () => {
    if (!passwordInput) return;
    passwordInput.disabled = !privateToggle.checked;
    passwordInput.required = privateToggle.checked;
  });
  privateToggle?.dispatchEvent(new Event('change'));

  hiddenToggle?.addEventListener('click', () => {
    const willShow = hiddenList.hidden;
    hiddenList.hidden = !willShow;
    hiddenToggle.setAttribute('aria-expanded', willShow ? 'true' : 'false');
    hiddenToggle.textContent = willShow ? '숨긴 그룹 접기' : '숨긴 그룹 보기';
  });

  form?.addEventListener('submit', async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const name = String(formData.get('name') || '').trim();
    const color = String(formData.get('color') || '#f54260');
    const isPrivate = Boolean(formData.get('isPrivate'));
    const isHidden = Boolean(formData.get('isHidden'));
    const password = String(formData.get('password') || '');
    const flags = getCalendarTypeFlags(form);

    if (!name) {
      setStatus('그룹 이름을 입력해줘.');
      return;
    }

    if (!flags.allowStudy && !flags.allowWork && !flags.allowEvent) {
      setStatus('연동할 캘린더를 하나 이상 선택해줘.');
      return;
    }

    try {
      setStatus('그룹을 만드는 중...');
      await rpc('create_calendar_group', {
        p_name: name,
        p_color: color,
        p_allow_study: flags.allowStudy,
        p_allow_work: flags.allowWork,
        p_allow_event: flags.allowEvent,
        p_visibility: isPrivate ? 'private' : 'public',
        p_password: isPrivate ? password : null,
        p_is_hidden: isHidden,
      });

      form.reset();
      renderColorChoices(colorRoot);
      privateToggle?.dispatchEvent(new Event('change'));
      setCreatePanelOpen(false);
      setStatus('그룹을 만들었어.');
      await load();
    } catch (error) {
      console.error('[calendar-groups] create failed:', error);
      setStatus(error.message || '그룹 생성에 실패했어.');
    }
  });

  page.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button) return;

    const card = button.closest('[data-group-id]');
    const groupId = card?.dataset?.groupId || '';
    const action = button.dataset.action;
    if (!groupId) return;

    try {
      button.disabled = true;

      if (action === 'join') {
        const password = card.querySelector('[data-password]')?.value || null;
        await rpc('join_calendar_group', {
          p_group_id: groupId,
          p_password: password,
        });
        setStatus('그룹에 참여했어.');
      }

      if (action === 'leave') {
        await rpc('leave_calendar_group', { p_group_id: groupId });
        if (getSelectedGroupId() === groupId) setSelectedGroupId('');
        setStatus('그룹에서 나왔어.');
      }

      if (action === 'kick-member') {
        const targetUserId = button.dataset.targetUserId || '';
        const nickname = button.dataset.targetNickname || '회원';
        if (!targetUserId) return;
        if (!window.confirm(`${nickname} 님을 이 그룹에서 강퇴할까요?`)) return;

        await rpc('kick_calendar_group_member', {
          p_group_id: groupId,
          p_target_user_id: targetUserId,
        });
        setStatus('참여자를 강퇴했어.');
      }

      if (action === 'toggle-hidden') {
        const isHidden = button.textContent.trim() === '숨기기';
        await rpc('set_calendar_group_hidden', {
          p_group_id: groupId,
          p_is_hidden: isHidden,
        });
        setStatus(isHidden ? '그룹을 숨겼어.' : '그룹을 다시 표시했어.');
      }

      if (action === 'save-edit') {
        const name = card.querySelector('[data-edit-name]')?.value || '';
        const color = card.querySelector('[data-edit-color]')?.value || '#f54260';
        const allowStudy = Boolean(
          card.querySelector('[data-edit-allow="study"]')?.checked,
        );
        const allowWork = Boolean(
          card.querySelector('[data-edit-allow="work"]')?.checked,
        );
        const allowEvent = Boolean(
          card.querySelector('[data-edit-allow="event"]')?.checked,
        );
        const isPrivate = Boolean(card.querySelector('[data-edit-private]')?.checked);
        const isHidden = Boolean(card.querySelector('[data-edit-hidden]')?.checked);
        const password = card.querySelector('[data-edit-password]')?.value || null;

        await rpc('update_calendar_group', {
          p_group_id: groupId,
          p_name: name,
          p_color: color,
          p_allow_study: allowStudy,
          p_allow_work: allowWork,
          p_allow_event: allowEvent,
          p_visibility: isPrivate ? 'private' : 'public',
          p_password: password,
          p_is_hidden: isHidden,
        });
        setStatus('그룹 설정을 저장했어.');
      }

      await load();
    } catch (error) {
      console.error('[calendar-groups] action failed:', error);
      setStatus(error.message || '작업에 실패했어.');
    } finally {
      button.disabled = false;
    }
  });

  try {
    await load();
    setStatus('그룹 목록을 불러왔어.');
  } catch (error) {
    console.error('[calendar-groups] load failed:', error);
    setStatus('그룹 목록을 불러오지 못했어. Supabase SQL을 먼저 적용해줘.');
  }
}
