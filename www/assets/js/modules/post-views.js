// assets/js/modules/post-views.js
import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-store.js';

const VIEWER_KEY_STORAGE = 'mallinViewerKey_v1';
const VIEW_COOLDOWN_SECONDS = 1800; // 30분, 필요하면 600(10분) / 3600(1시간) 등으로 조절 가능

function safeId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

function createRandomKey() {
  try {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }
  } catch (error) {
    console.error('[post-views] randomUUID error:', error);
  }

  return `viewer_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function getGuestViewerKey() {
  try {
    let key = localStorage.getItem(VIEWER_KEY_STORAGE);

    if (!key) {
      key = createRandomKey();
      localStorage.setItem(VIEWER_KEY_STORAGE, key);
    }

    return `guest:${key}`;
  } catch (error) {
    console.error('[post-views] localStorage viewer key error:', error);
    return `guest:fallback_${createRandomKey()}`;
  }
}

async function getViewerKey() {
  try {
    const user = await getCurrentUser();

    if (user?.id) {
      return `user:${user.id}`;
    }
  } catch (error) {
    console.error('[post-views] getCurrentUser error:', error);
  }

  return getGuestViewerKey();
}

export function getDisplayViews(post) {
  const views = Number(post?.views || 0);
  return Number.isFinite(views) ? views : 0;
}

export async function incrementPostView(id) {
  const postId = safeId(id);
  if (!postId) return null;

  const viewerKey = await getViewerKey();

  const { data, error } = await supabase.rpc('increment_post_views', {
    p_post_id: postId,
    p_viewer_key: viewerKey,
    p_cooldown_seconds: VIEW_COOLDOWN_SECONDS,
  });

  if (error) {
    console.error('[post-views] increment failed:', error);
    return null;
  }

  const payload = Array.isArray(data) ? data[0] : data;
  const nextViews = Number(payload?.views ?? payload?.new_views ?? 0);

  return Number.isFinite(nextViews) ? nextViews : null;
}

/* ------------------------------------------------------------------
  아래 함수들은 기존 다른 모듈과의 호환용
------------------------------------------------------------------ */

export function getOptimisticViews() {
  return null;
}

export function setOptimisticViews() {}

export function markViewFromList() {}

export function wasViewFromList() {
  return false;
}

export function consumeViewFromList() {}

export function hasCountedViewInSession() {
  return false;
}

export function markCountedViewInSession() {}

export function bumpOptimisticView(id, baseViews = 0) {
  const views = Number(baseViews || 0);
  return Number.isFinite(views) ? views : 0;
}

export async function countPostViewOnce(id) {
  return incrementPostView(id);
}

export function updateViewsInLink(linkEl, nextViews) {
  if (!linkEl || !Number.isFinite(Number(nextViews))) return;

  const metaEl =
    linkEl.querySelector('.post-row__meta') ||
    linkEl.querySelector('.card__meta .chip--muted:nth-child(2)') ||
    linkEl.querySelector('[data-role="post-views"]');

  if (!metaEl) return;

  const src = String(metaEl.textContent || '');
  if (!src.includes('👀')) return;

  metaEl.textContent = src.replace(/👀\s*\d+/, `👀 ${Number(nextViews)}`);
}

export function attachImmediateViewTracking() {
  // 조회수는 상세페이지 진입 시 DB 기준으로만 증가
}

export function initPostViews() {
  // no-op
}
