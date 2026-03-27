// assets/js/modules/post-views.js
import { supabase } from './supabase-client.js';

function safeId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? n : null;
}

export function getDisplayViews(post) {
  const views = Number(post?.views || 0);
  return Number.isFinite(views) ? views : 0;
}

export async function incrementPostView(id) {
  const postId = safeId(id);
  if (!postId) return null;

  const { data, error } = await supabase.rpc('increment_post_views', {
    p_post_id: postId,
  });

  if (error) {
    console.error('[post-views] increment failed:', error);
    return null;
  }

  const nextViews = Number(data || 0);
  return Number.isFinite(nextViews) ? nextViews : null;
}

/* ------------------------------------------------------------------
  아래 함수들은 기존 다른 모듈과의 호환용이야.
  이제 DB 단일 기준으로 갈 거라 session/localStorage는 사용하지 않음.
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
  // 이제 리스트 클릭 시 조회수를 올리지 않음.
  // 조회수는 상세페이지 진입 시 DB 기준으로만 증가.
}

export function initPostViews() {
  // no-op
}
