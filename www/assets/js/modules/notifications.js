import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  resolveSitePath,
  showLoginRequiredPopup,
} from './auth-store.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { renderTextWithEmoticons } = await import(
  `./emoticons.js?v=${MODULE_VERSION}`
);

const POPUP_NOTIFICATION_LIMIT = 10;

const NOTIFICATION_TYPE_META = Object.freeze({
  post_reaction_like: { icon: '♥', label: '좋아요' },
  post_reaction_dislike: { icon: '💡', label: '참신해요' },
  post_comment: { icon: '💬', label: '댓글·답글' },
  post_participant_comment: { icon: '↩', label: '댓글·답글' },
  store_new_item: { icon: '🛍', label: '새 상품' },
  admin_announcement: { icon: '📢', label: '안내' },
});

let currentUserId = '';
let notificationChannel = null;
let notificationChannelUserId = '';
let panelOpen = false;

function $(id) {
  return document.getElementById(id);
}

export function escapeNotificationHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatNotificationDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');

  return `${year}.${month}.${day} ${hour}:${minute}`;
}

export function getNotificationTypeMeta(type = '') {
  return (
    NOTIFICATION_TYPE_META[String(type || '').trim()] || {
      icon: '🔔',
      label: '알림',
    }
  );
}

export function buildNotificationHref(item = {}) {
  if (item.action_url) {
    const url = new URL(item.action_url, window.location.origin);
    return `${url.pathname}${url.search}${url.hash}`;
  }

  if (item.item_id) {
    const base = resolveSitePath('store-item.html');
    const url = new URL(base, window.location.origin);
    url.searchParams.set('id', String(item.item_id));
    return `${url.pathname}${url.search}`;
  }

  const base = resolveSitePath('post.html');
  const url = new URL(base, window.location.origin);

  if (item.post_id) url.searchParams.set('id', String(item.post_id));
  if (item.comment_id) {
    url.searchParams.set('comment', String(item.comment_id));
  }

  return `${url.pathname}${url.search}`;
}

export function getNotificationPresentation(item = {}) {
  const type = getNotificationTypeMeta(item.notification_type);

  return {
    id: String(item.id ?? '').trim(),
    actorNickname: String(item.actor_nickname || '').trim(),
    createdAt: String(item.created_at || '').trim(),
    dateText: formatNotificationDateTime(item.created_at),
    href: buildNotificationHref(item),
    icon: type.icon,
    isRead: item.is_read === true,
    label: type.label,
    messageHtml: renderTextWithEmoticons(item.message || '', {
      imageClass: 'inline-emoticon inline-emoticon--compact',
    }),
    title: String(item.title || '새 알림'),
  };
}

export async function fetchNotificationItems({
  userId,
  offset = 0,
  limit = POPUP_NOTIFICATION_LIMIT,
  includeLookahead = false,
  includeCount = false,
  unreadOnly = false,
} = {}) {
  const recipientUserId = String(userId || '').trim();
  const safeOffset = Math.max(0, Number(offset) || 0);
  const safeLimit = Math.max(1, Number(limit) || POPUP_NOTIFICATION_LIMIT);

  if (!recipientUserId) {
    return { count: includeCount ? 0 : null, hasMore: false, items: [] };
  }

  const requestedCount = safeLimit + (includeLookahead ? 1 : 0);
  const { data, error } = await supabase.rpc(
    'get_my_notifications_current',
    {
      p_limit: requestedCount,
      p_offset: safeOffset,
      p_unread_only: unreadOnly === true,
    },
  );

  if (error) throw error;

  const payload = data && typeof data === 'object' ? data : {};
  const rows = Array.isArray(payload.items) ? payload.items : [];

  return {
    count: includeCount ? Number(payload.count || 0) : null,
    hasMore: includeLookahead && rows.length > safeLimit,
    items: rows.slice(0, safeLimit),
  };
}

export async function fetchUnreadNotificationCount(userId) {
  const recipientUserId = String(userId || '').trim();
  if (!recipientUserId) return 0;

  const { count, error } = await supabase
    .from('user_notifications')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_user_id', recipientUserId)
    .eq('is_read', false);

  if (error) throw error;
  return Number(count || 0);
}

export function closeNotificationPanel() {
  const button = $('notificationBtn');
  const panel = $('notificationPanel');
  if (!button || !panel) return;

  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
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

export function adjustNotificationBadge(delta = 0) {
  const badge = $('notificationBadge');
  if (!badge || badge.textContent === '99+') return;

  const currentCount = badge.hidden ? 0 : Number(badge.textContent || 0);
  setBadge(Math.max(0, currentCount + Number(delta || 0)));
}

function renderEmpty(text) {
  const list = $('notificationList');
  if (!list) return;

  list.innerHTML = `<div class="notification-empty">${escapeNotificationHtml(
    text,
  )}</div>`;
}

function cleanupSubscription() {
  if (notificationChannel) {
    supabase.removeChannel(notificationChannel);
  }

  notificationChannel = null;
  notificationChannelUserId = '';
}

function ensureSubscription(userId) {
  if (!userId) {
    cleanupSubscription();
    return;
  }

  if (notificationChannel && notificationChannelUserId === userId) {
    return;
  }

  cleanupSubscription();
  notificationChannelUserId = userId;

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

export async function markNotificationsRead(ids = [], userId = currentUserId) {
  const recipientUserId = String(userId || '').trim();
  const safeIds = [...new Set(ids.map((id) => String(id || '').trim()))].filter(
    Boolean,
  );

  if (!recipientUserId || !safeIds.length) return true;

  const { error } = await supabase
    .from('user_notifications')
    .update({
      is_read: true,
      read_at: new Date().toISOString(),
    })
    .in('id', safeIds)
    .eq('recipient_user_id', recipientUserId)
    .eq('is_read', false);

  if (error) {
    console.error('[notifications] mark read failed:', error);
    return false;
  }

  window.dispatchEvent(
    new CustomEvent('mallin:notifications-read', {
      detail: { ids: safeIds },
    }),
  );

  return true;
}

async function openPanel() {
  const button = $('notificationBtn');
  const panel = $('notificationPanel');
  if (!button || !panel) return;

  panel.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  panelOpen = true;

  const unreadIds = [...panel.querySelectorAll('.notification-item.is-unread')]
    .map((item) => String(item.dataset.notificationId || '').trim())
    .filter(Boolean);

  if (unreadIds.length) {
    await markNotificationsRead(unreadIds);
    await refreshNotifications({ keepPanelOpen: true });
  }
}

function renderLoggedOut() {
  currentUserId = '';
  cleanupSubscription();
  setBadge(0);

  const description = $('notificationPanelDesc');
  if (description) {
    description.textContent = '로그인하면 댓글·답글 알림을 확인할 수 있어.';
  }

  renderEmpty('아직 확인할 알림이 없어.');
}

function renderNotifications(items = [], unreadCount = 0) {
  const description = $('notificationPanelDesc');
  const list = $('notificationList');
  if (!list) return;

  setBadge(unreadCount);

  if (description) {
    description.textContent = unreadCount
      ? `읽지 않은 알림 ${unreadCount}개`
      : '새 알림이 없어.';
  }

  if (!items.length) {
    renderEmpty('아직 알림이 없어.');
    return;
  }

  list.innerHTML = items
    .map((item) => {
      const presentation = getNotificationPresentation(item);
      const unreadClass = presentation.isRead ? '' : ' is-unread';

      return `
        <a
          class="notification-item${unreadClass}"
          data-notification-id="${escapeNotificationHtml(presentation.id)}"
          href="${escapeNotificationHtml(presentation.href)}"
        >
          <div class="notification-item__top">
            <strong class="notification-item__title">${escapeNotificationHtml(
              presentation.title,
            )}</strong>
            <span class="notification-item__date">${escapeNotificationHtml(
              presentation.dateText,
            )}</span>
          </div>
          <p class="notification-item__message">${presentation.messageHtml}</p>
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
    if (!keepPanelOpen) closeNotificationPanel();
    return;
  }

  currentUserId = String(user.id || '').trim();
  ensureSubscription(currentUserId);

  const [countResult, listResult] = await Promise.allSettled([
    fetchUnreadNotificationCount(currentUserId),
    fetchNotificationItems({
      userId: currentUserId,
      limit: POPUP_NOTIFICATION_LIMIT,
    }),
  ]);

  let unreadCount = 0;

  if (countResult.status === 'fulfilled') {
    unreadCount = countResult.value;
  } else {
    console.error('[notifications] unread count failed:', countResult.reason);
    setBadge(0);
  }

  if (listResult.status === 'rejected') {
    console.error('[notifications] list fetch failed:', listResult.reason);
    renderEmpty('알림을 불러오지 못했어.');
    return;
  }

  renderNotifications(listResult.value.items, unreadCount);

  if (keepPanelOpen) {
    panel.hidden = false;
    panelOpen = true;
    const button = $('notificationBtn');
    if (button) button.setAttribute('aria-expanded', 'true');
  }
}

export async function initNotifications() {
  const menu = $('notificationMenu');
  const button = $('notificationBtn');
  const panel = $('notificationPanel');
  const refreshButton = $('notificationRefreshBtn');

  if (!menu || !button || !panel) return;

  if (menu.dataset.notificationsBound === 'true') {
    await refreshNotifications({ keepPanelOpen: panelOpen });
    return;
  }

  menu.dataset.notificationsBound = 'true';

  button.addEventListener('click', async () => {
    const user = await getCurrentUser();

    if (!user) {
      showLoginRequiredPopup({
        title: '로그인이 필요해',
        message: '알림은 로그인 후 확인할 수 있어.',
      });
      return;
    }

    if (panel.hidden) {
      await openPanel();
      return;
    }

    closeNotificationPanel();
  });

  refreshButton?.addEventListener('click', async () => {
    if (refreshButton.disabled) return;

    refreshButton.disabled = true;
    try {
      await refreshNotifications({ keepPanelOpen: true });
    } finally {
      refreshButton.disabled = false;
    }
  });

  panel.addEventListener('click', (event) => {
    const navigationLink = event.target.closest(
      '.notification-item[href], [data-notifications-page-link][href]',
    );
    if (!navigationLink) return;

    closeNotificationPanel();
  });

  document.addEventListener('click', (event) => {
    if (!panelOpen) return;
    if (menu.contains(event.target)) return;
    closeNotificationPanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeNotificationPanel();
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
