import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-store.js';

let initialized = false;
let authSubscription = null;

function $(id) {
  return document.getElementById(id);
}

function getBadgeEl() {
  return $('allPostsBadge');
}

function getPostIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const raw = Number(params.get('id'));
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

function isPostPage() {
  return String(document.body?.dataset?.page || '').trim() === 'post';
}

function renderBadge(count = 0) {
  const badge = getBadgeEl();
  if (!badge) return;

  const safeCount = Number(count || 0);

  if (!Number.isFinite(safeCount) || safeCount <= 0) {
    badge.hidden = true;
    badge.textContent = '0';
    return;
  }

  badge.hidden = false;
  badge.textContent = safeCount > 99 ? '99+' : String(safeCount);
}

function normalizeRpcNumber(data) {
  if (typeof data === 'number') return data;

  if (Array.isArray(data) && data.length) {
    const first = data[0];

    if (typeof first === 'number') return first;

    if (first && typeof first === 'object') {
      const value = Object.values(first)[0];
      const num = Number(value);
      return Number.isFinite(num) ? num : 0;
    }
  }

  const num = Number(data);
  return Number.isFinite(num) ? num : 0;
}

async function markCurrentPostAsRead() {
  if (!isPostPage()) return;

  const postId = getPostIdFromUrl();
  if (!postId) return;

  const { error } = await supabase.rpc('mark_post_as_read', {
    p_post_id: postId,
  });

  if (error) {
    console.error('[new-post-badge] mark_post_as_read failed:', error);
  }
}

async function fetchUnreadCount() {
  const { data, error } = await supabase.rpc('get_unread_post_count');

  if (error) {
    console.error('[new-post-badge] get_unread_post_count failed:', error);
    return 0;
  }

  return normalizeRpcNumber(data);
}

export async function refreshNewPostBadge() {
  const badge = getBadgeEl();
  if (!badge) return;

  let user = null;

  try {
    user = await getCurrentUser();
  } catch (error) {
    console.error('[new-post-badge] getCurrentUser failed:', error);
    renderBadge(0);
    return;
  }

  if (!user?.id) {
    renderBadge(0);
    return;
  }

  await markCurrentPostAsRead();

  const unreadCount = await fetchUnreadCount();
  renderBadge(unreadCount);
}

function bindRefreshEvents() {
  if (initialized) return;

  window.addEventListener('focus', () => {
    refreshNewPostBadge().catch((error) => {
      console.error('[new-post-badge] focus refresh failed:', error);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;

    refreshNewPostBadge().catch((error) => {
      console.error('[new-post-badge] visibility refresh failed:', error);
    });
  });

  const { data } = supabase.auth.onAuthStateChange(() => {
    refreshNewPostBadge().catch((error) => {
      console.error('[new-post-badge] auth refresh failed:', error);
    });
  });

  authSubscription = data?.subscription || null;
  initialized = true;
}

export async function initNewPostBadge() {
  bindRefreshEvents();
  await refreshNewPostBadge();
}
