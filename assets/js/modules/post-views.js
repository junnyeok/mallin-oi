// assets/js/modules/post-views.js
import { supabase } from './supabase-client.js';

const OPTIMISTIC_VIEWS_KEY = 'optimisticViewsMap_v1';

function sessionKey(id) {
  return `viewCounted:${id}`;
}

function listKey(id) {
  return `viewFromList:${id}`;
}

function safeId(id) {
  const n = Number(id);
  return Number.isFinite(n) ? String(n) : '';
}

function readOptimisticMap() {
  try {
    return JSON.parse(sessionStorage.getItem(OPTIMISTIC_VIEWS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeOptimisticMap(map) {
  try {
    sessionStorage.setItem(OPTIMISTIC_VIEWS_KEY, JSON.stringify(map));
  } catch {}
}

export function getOptimisticViews(id) {
  const sid = safeId(id);
  if (!sid) return null;

  const map = readOptimisticMap();
  const value = Number(map[sid]);

  return Number.isFinite(value) ? value : null;
}

export function setOptimisticViews(id, views) {
  const sid = safeId(id);
  const n = Number(views);

  if (!sid || !Number.isFinite(n)) return;

  const map = readOptimisticMap();
  map[sid] = n;
  writeOptimisticMap(map);
}

export function getDisplayViews(post) {
  const base = Number(post?.views || 0);
  const optimistic = getOptimisticViews(post?.id);

  if (Number.isFinite(optimistic)) {
    return Math.max(base, optimistic);
  }

  return base;
}

export function markViewFromList(id) {
  const sid = safeId(id);
  if (!sid) return;

  try {
    sessionStorage.setItem(listKey(sid), '1');
  } catch {}
}

export function wasViewFromList(id) {
  const sid = safeId(id);
  if (!sid) return false;

  try {
    return sessionStorage.getItem(listKey(sid)) === '1';
  } catch {
    return false;
  }
}

export function consumeViewFromList(id) {
  const sid = safeId(id);
  if (!sid) return;

  try {
    sessionStorage.removeItem(listKey(sid));
  } catch {}
}

export function hasCountedViewInSession(id) {
  const sid = safeId(id);
  if (!sid) return false;

  try {
    return sessionStorage.getItem(sessionKey(sid)) === '1';
  } catch {
    return false;
  }
}

export function markCountedViewInSession(id) {
  const sid = safeId(id);
  if (!sid) return;

  try {
    sessionStorage.setItem(sessionKey(sid), '1');
  } catch {}
}

export function bumpOptimisticView(id, baseViews = 0) {
  const sid = safeId(id);
  if (!sid) return null;

  const current = getOptimisticViews(sid);
  const safeBase = Number.isFinite(Number(baseViews)) ? Number(baseViews) : 0;
  const next = Number.isFinite(current) ? current + 1 : safeBase + 1;

  setOptimisticViews(sid, next);
  return next;
}

export async function incrementPostView(id) {
  const postId = Number(id);
  if (!Number.isFinite(postId)) return null;

  const { data, error } = await supabase.rpc('increment_post_views', {
    p_post_id: postId,
  });

  if (error) {
    console.error('[post-views] increment failed:', error);
    return null;
  }

  const nextViews = Number(data || 0);
  if (Number.isFinite(nextViews)) {
    setOptimisticViews(postId, nextViews);
  }

  markCountedViewInSession(postId);
  return nextViews;
}

export async function countPostViewOnce(id, baseViews = 0) {
  const postId = Number(id);
  if (!Number.isFinite(postId)) return null;

  if (hasCountedViewInSession(postId)) {
    return getOptimisticViews(postId) ?? Number(baseViews || 0);
  }

  bumpOptimisticView(postId, baseViews);
  markCountedViewInSession(postId);

  const newViews = await incrementPostView(postId);
  return Number.isFinite(newViews)
    ? newViews
    : (getOptimisticViews(postId) ?? Number(baseViews || 0));
}

function updateSingleViewsText(el, nextViews) {
  if (!el) return;
  el.textContent = `👀 ${nextViews}`;
}

function replaceViewsNumber(text, nextViews) {
  const src = String(text || '');
  if (!src.includes('👀')) return src;
  return src.replace(/👀\s*\d+/, `👀 ${nextViews}`);
}

export function updateViewsInLink(linkEl, nextViews) {
  if (!linkEl || !Number.isFinite(Number(nextViews))) return;

  const metaEl =
    linkEl.querySelector('.post-row__meta') ||
    linkEl.querySelector('.card__meta .chip--muted:nth-child(2)') ||
    linkEl.querySelector('[data-role="post-views"]');

  if (metaEl) {
    metaEl.textContent = replaceViewsNumber(
      metaEl.textContent,
      Number(nextViews),
    );
    return;
  }

  const chips = linkEl.querySelectorAll('.card__meta .chip--muted');
  if (chips.length >= 2) {
    updateSingleViewsText(chips[1], Number(nextViews));
  }
}

export function attachImmediateViewTracking(rootEl = document) {
  if (!rootEl || rootEl.dataset.viewTrackingBound === '1') return;

  rootEl.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-id]');
    if (!link) return;

    const id = link.dataset.id;
    if (!id) return;

    const rawBase = Number(link.dataset.views || 0);
    const nextViews = bumpOptimisticView(id, rawBase);

    markViewFromList(id);
    markCountedViewInSession(id);

    if (Number.isFinite(nextViews)) {
      link.dataset.views = String(nextViews);
      updateViewsInLink(link, nextViews);
    }

    incrementPostView(id).then((serverViews) => {
      if (!Number.isFinite(serverViews)) return;
      link.dataset.views = String(serverViews);
      updateViewsInLink(link, serverViews);
    });
  });

  rootEl.dataset.viewTrackingBound = '1';
}

export function initPostViews() {
  attachImmediateViewTracking(document);
}
