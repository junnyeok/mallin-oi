import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  loginHref,
  resolveSitePath,
  saveRedirect,
} from './auth-store.js';

const MAX_NOTIFICATIONS = 20;
let currentUserId = '';
let notificationChannel = null;
let panelOpen = false;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';

  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');

  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function buildNotificationHref(postId, commentId) {
  const base = resolveSitePath('post.html');
  const url = new URL(base, window.location.origin);

  if (postId) url.searchParams.set('id', String(postId));
  if (commentId) url.searchParams.set('comment', String(commentId));

  return `${url.pathname}${url.search}`;
}

function closePanel() {
  const btn = $('notificationBtn');
  const panel = $('notificationPanel');
  if (!btn || !panel) return;

  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  panelOpen = false;
}

function setBadge(count = 0) {
  const badge = $('notificationBadge');
  if (!badge) return;

  const safeCount = Number(count || 0);

  if (safeCount <= 0) {
    badge.hidden = true;
    badge.textContent = '0';
    return;
  }

  badge.hidden = false;
  badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
}

function renderEmpty(text) {
  const list = $('notificationList');
  if (!list) return;

  list.innerHTML = `<div class="notification-empty">${escapeHtml(text)}</div>`;
}

function cleanupSubscription() {
  if (!notificationChannel) return;
  supabase.removeChannel(notificationChannel);
  notificationChannel = null;
}

function ensureSubscription(userId) {
  if (!userId) {
    cleanupSubscription();
    return;
  }

  if (notificationChannel && currentUserId === userId) {
    return;
  }

  cleanupSubscription();

  notificationChannel = supabase
    .channel(`user-notifications-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'user_notifications',
        filter: `recipient_user_id=eq.${userId}`,
      },
      () => {
        refreshNotifications({ keepPanelOpen: panelOpen }).catch((error) => {
          console.error('[notifications] realtime refresh failed:', error);
        });
      },
    )
    .subscribe();
}

async function markNotificationsRead(ids = []) {
  if (!currentUserId || !ids.length) return;

  const { error } = await supabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .in('id', ids)
    .eq('recipient_user_id', currentUserId)
    .eq('is_read', false);

  if (error) {
    console.error('[notifications] mark read failed:', error);
  }
}

async function openPanel() {
  const btn = $('notificationBtn');
  const panel = $('notificationPanel');
  if (!btn || !panel) return;

  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  panelOpen = true;

  const unreadIds = [...panel.querySelectorAll('.notification-item.is-unread')]
    .map((item) => Number(item.dataset.notificationId || 0))
    .filter((id) => Number.isFinite(id) && id > 0);

  if (unreadIds.length) {
    await markNotificationsRead(unreadIds);
    await refreshNotifications({ keepPanelOpen: true });
  }
}

function renderLoggedOut() {
  currentUserId = '';
  cleanupSubscription();
  setBadge(0);

  const desc = $('notificationPanelDesc');
  if (desc) {
    desc.textContent = '로그인하면 댓글·답글 알림을 확인할 수 있어.';
  }

  renderEmpty('아직 확인할 알림이 없어.');
}

function renderNotifications(items = [], unreadCount = 0) {
  const desc = $('notificationPanelDesc');
  const list = $('notificationList');
  if (!list) return;

  setBadge(unreadCount);

  if (desc) {
    desc.textContent = unreadCount
      ? `읽지 않은 알림 ${unreadCount}개`
      : '새 알림이 없어.';
  }

  if (!items.length) {
    renderEmpty('아직 알림이 없어.');
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const href = buildNotificationHref(item.post_id, item.comment_id);
      const unreadClass = item.is_read ? '' : ' is-unread';

      return `
        <a
          class="notification-item${unreadClass}"
          data-notification-id="${Number(item.id || 0)}"
          href="${href}"
        >
          <div class="notification-item__top">
            <strong class="notification-item__title">${escapeHtml(item.title || '새 알림')}</strong>
            <span class="notification-item__date">${escapeHtml(formatDateTime(item.created_at))}</span>
          </div>
          <p class="notification-item__message">${escapeHtml(item.message || '')}</p>
        </a>
      `;
    })
    .join('');
}

export async function refreshNotifications({ keepPanelOpen = false } = {}) {
  const panel = $('notificationPanel');
  if (!panel) return;

  const user = await getCurrentUser();

  if (!user) {
    renderLoggedOut();
    if (!keepPanelOpen) closePanel();
    return;
  }

  currentUserId = String(user.id || '').trim();
  ensureSubscription(currentUserId);

  const [countRes, listRes] = await Promise.all([
    supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_user_id', currentUserId)
      .eq('is_read', false),

    supabase
      .from('user_notifications')
      .select('id, post_id, comment_id, title, message, is_read, created_at')
      .eq('recipient_user_id', currentUserId)
      .order('created_at', { ascending: false })
      .limit(MAX_NOTIFICATIONS),
  ]);

  if (countRes.error) {
    console.error('[notifications] unread count failed:', countRes.error);
    setBadge(0);
  }

  if (listRes.error) {
    console.error('[notifications] list fetch failed:', listRes.error);
    renderEmpty('알림을 불러오지 못했어.');
    return;
  }

  renderNotifications(listRes.data || [], Number(countRes.count || 0));

  if (keepPanelOpen) {
    panel.hidden = false;
    panelOpen = true;
    const btn = $('notificationBtn');
    if (btn) btn.setAttribute('aria-expanded', 'true');
  }
}

export async function initNotifications() {
  const menu = $('notificationMenu');
  const btn = $('notificationBtn');
  const panel = $('notificationPanel');
  const refreshBtn = $('notificationRefreshBtn');

  if (!menu || !btn || !panel) return;

  btn.addEventListener('click', async () => {
    const user = await getCurrentUser();

    if (!user) {
      saveRedirect();
      window.location.href = loginHref();
      return;
    }

    if (panel.hidden) {
      await openPanel();
      return;
    }

    closePanel();
  });

  refreshBtn?.addEventListener('click', async () => {
    await refreshNotifications({ keepPanelOpen: true });
  });

  document.addEventListener('click', (event) => {
    if (!panelOpen) return;
    if (menu.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel();
    }
  });

  window.addEventListener('focus', () => {
    refreshNotifications({ keepPanelOpen: panelOpen }).catch((error) => {
      console.error('[notifications] focus refresh failed:', error);
    });
  });

  window.addEventListener('auth-changed', () => {
    refreshNotifications({ keepPanelOpen: false }).catch((error) => {
      console.error('[notifications] auth refresh failed:', error);
    });
  });

  await refreshNotifications({ keepPanelOpen: false });
}
