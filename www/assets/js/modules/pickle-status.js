// assets/js/modules/pickle-status.js
import { supabase } from './supabase-client.js';
import { getCurrentUser, showLoginRequiredPopup } from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

function getSeoulDateKey() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
}

function formatPickleAmount(value) {
  return `${Number(value || 0)} 🥒`;
}

function getTodayPicklePopupStats(entries = []) {
  const todayKey = getSeoulDateKey();

  const todayEntries = (entries || []).filter(
    (entry) => String(entry?.awarded_on || '') === todayKey,
  );

  const attendanceDone = todayEntries.some(
    (entry) =>
      entry?.reason_code === 'attendance' && Number(entry?.amount || 0) > 0,
  );

  const postCount = todayEntries.filter(
    (entry) =>
      entry?.reason_code === 'post_create' && Number(entry?.amount || 0) > 0,
  ).length;

  const commentCount = todayEntries.filter(
    (entry) =>
      entry?.reason_code === 'comment_post' && Number(entry?.amount || 0) > 0,
  ).length;

  return {
    attendanceDone,
    postCount,
    commentCount,
  };
}

async function loadMyPickleStatus(userId) {
  const [
    { data: profileRow, error: profileError },
    { data: ledgerRows, error: ledgerError },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, pickles')
      .eq('id', userId)
      .maybeSingle(),
    supabase
      .from('pickle_ledger')
      .select('amount, reason_code, awarded_on, created_at, id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
  ]);

  if (profileError) throw profileError;
  if (ledgerError) throw ledgerError;

  return {
    balance: Number(profileRow?.pickles || 0),
    entries: ledgerRows || [],
  };
}

function closePicklePanel() {
  const btn = $('pickleBtn');
  const panel = $('picklePanel');

  if (!btn || !panel) return;

  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function openPicklePanel() {
  const btn = $('pickleBtn');
  const panel = $('picklePanel');

  if (!btn || !panel) return;

  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

function renderPickleStatus({ balance = 0, entries = [] } = {}) {
  const balanceEl = $('pickleBalanceValue');
  const attendanceEl = $('pickleAttendanceStatus');
  const postEl = $('picklePostStatus');
  const commentEl = $('pickleCommentStatus');

  const { attendanceDone, postCount, commentCount } =
    getTodayPicklePopupStats(entries);

  if (balanceEl) {
    balanceEl.textContent = formatPickleAmount(balance);
  }

  if (attendanceEl) {
    attendanceEl.textContent = attendanceDone ? '완료 ✅' : '미완료 ❌';
  }

  if (postEl) {
    postEl.textContent = `${postCount} / 5`;
  }

  if (commentEl) {
    commentEl.textContent = `${commentCount} / 20`;
  }
}

function renderLoggedOutState() {
  renderPickleStatus({
    balance: 0,
    entries: [],
  });
  closePicklePanel();
}

let initialized = false;
let panelBound = false;

function bindGlobalPanelEvents() {
  if (panelBound) return;
  panelBound = true;

  const menu = $('pickleMenu');
  const panel = $('picklePanel');
  const closeBtn = $('pickleCloseBtn');

  closeBtn?.addEventListener('click', () => {
    closePicklePanel();
  });

  panel?.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', (event) => {
    if (!panel || panel.hidden) return;
    if (menu?.contains(event.target)) return;
    closePicklePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePicklePanel();
    }
  });
}

export async function refreshPickleStatus({ keepPanelOpen = false } = {}) {
  const menu = $('pickleMenu');
  const btn = $('pickleBtn');

  if (!menu || !btn) return;

  menu.hidden = false;

  const user = await getCurrentUser();

  if (!user?.id) {
    renderLoggedOutState();
    return;
  }

  try {
    const status = await loadMyPickleStatus(user.id);
    renderPickleStatus(status);

    if (keepPanelOpen) {
      openPicklePanel();
    }
  } catch (error) {
    console.error('[pickle-status] refresh failed:', error);
  }
}

export async function initPickleStatus() {
  const menu = $('pickleMenu');
  const btn = $('pickleBtn');
  const panel = $('picklePanel');

  if (!menu || !btn || !panel) return;

  menu.hidden = false;
  bindGlobalPanelEvents();

  if (initialized) {
    await refreshPickleStatus({ keepPanelOpen: !panel.hidden });
    return;
  }

  initialized = true;

  btn.addEventListener('click', async (event) => {
    event.preventDefault();

    const user = await getCurrentUser();

    if (!user?.id) {
      showLoginRequiredPopup({
        title: '로그인이 필요해',
        message: '피클 현황은 로그인 후 확인할 수 있어.',
      });
      return;
    }

    if (panel.hidden) {
      await refreshPickleStatus({ keepPanelOpen: true });
      return;
    }

    closePicklePanel();
  });

  window.addEventListener('focus', () => {
    refreshPickleStatus({ keepPanelOpen: !panel.hidden }).catch((error) => {
      console.error('[pickle-status] focus refresh failed:', error);
    });
  });

  window.addEventListener('auth-changed', () => {
    refreshPickleStatus({ keepPanelOpen: false }).catch((error) => {
      console.error('[pickle-status] auth refresh failed:', error);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;

    refreshPickleStatus({ keepPanelOpen: !panel.hidden }).catch((error) => {
      console.error('[pickle-status] visibility refresh failed:', error);
    });
  });

  await refreshPickleStatus({ keepPanelOpen: false });
}
