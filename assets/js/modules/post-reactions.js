import { supabase } from './supabase-client.js';
import { getCurrentUser, loginHref, saveRedirect } from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

function getPostIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  const value = Number(sp.get('id') || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function normalizeReaction(value) {
  const safe = String(value || '')
    .trim()
    .toLowerCase();
  return safe === 'like' || safe === 'dislike' ? safe : '';
}

function setMessage(text = '', type = '') {
  const el = $('postReactionMsg');
  if (!el) return;

  el.textContent = text;
  el.className = type ? `post-reactions__msg ${type}` : 'post-reactions__msg';
}

function setButtonsDisabled(disabled) {
  const likeBtn = $('postLikeBtn');
  const dislikeBtn = $('postDislikeBtn');

  if (likeBtn) likeBtn.disabled = !!disabled;
  if (dislikeBtn) dislikeBtn.disabled = !!disabled;
}

function applyActiveState(myReaction) {
  const likeBtn = $('postLikeBtn');
  const dislikeBtn = $('postDislikeBtn');

  if (likeBtn) {
    const active = myReaction === 'like';
    likeBtn.classList.toggle('is-active', active);
    likeBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  if (dislikeBtn) {
    const active = myReaction === 'dislike';
    dislikeBtn.classList.toggle('is-active', active);
    dislikeBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  }
}

function renderSummary(summary) {
  const likeCountEl = $('postLikeCount');
  const dislikeCountEl = $('postDislikeCount');

  const likesCount = Number(summary?.likesCount || 0);
  const dislikesCount = Number(summary?.dislikesCount || 0);
  const myReaction = normalizeReaction(summary?.myReaction);

  if (likeCountEl) likeCountEl.textContent = String(likesCount);
  if (dislikeCountEl) dislikeCountEl.textContent = String(dislikesCount);

  applyActiveState(myReaction);
}

function normalizeSummaryRow(row) {
  return {
    likesCount: Number(row?.likes_count || 0),
    dislikesCount: Number(row?.dislikes_count || 0),
    myReaction: normalizeReaction(row?.my_reaction),
  };
}

async function fetchSummary(postId, userId = null) {
  const { data, error } = await supabase.rpc('get_post_reaction_summary', {
    p_post_id: postId,
    p_user_id: userId || null,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return normalizeSummaryRow(row || {});
}

async function requireReactionUser() {
  const user = await getCurrentUser();

  if (user) return user;

  saveRedirect();
  window.location.href = loginHref();
  return null;
}

async function handleReactionClick(type, postId) {
  const safeType = normalizeReaction(type);
  if (!safeType || !postId) return;

  const user = await requireReactionUser();
  if (!user) return;

  setButtonsDisabled(true);
  setMessage('처리 중...');

  try {
    const { data, error } = await supabase.rpc('toggle_post_reaction', {
      p_post_id: postId,
      p_reaction_type: safeType,
    });

    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    const summary = normalizeSummaryRow(row || {});
    renderSummary(summary);

    if (summary.myReaction === safeType) {
      setMessage(
        safeType === 'like' ? '좋아요를 눌렀어.' : '싫어요를 눌렀어.',
        'is-success',
      );
    } else {
      setMessage(
        safeType === 'like' ? '좋아요를 취소했어.' : '싫어요를 취소했어.',
        'is-success',
      );
    }
  } catch (error) {
    console.error('[post-reactions] toggle failed:', error);
    setMessage('처리 중 오류가 발생했어. 잠시 후 다시 시도해줘.', 'is-error');
  } finally {
    setButtonsDisabled(false);
  }
}

export async function initPostReactions() {
  const section = $('postReactionsSection');
  const likeBtn = $('postLikeBtn');
  const dislikeBtn = $('postDislikeBtn');
  const postId = getPostIdFromUrl();

  if (!section || !likeBtn || !dislikeBtn || !postId) return;

  try {
    const user = await getCurrentUser();
    const summary = await fetchSummary(postId, user?.id || null);
    renderSummary(summary);
  } catch (error) {
    console.error('[post-reactions] init failed:', error);
    setMessage('좋아요/싫어요 정보를 불러오지 못했어.', 'is-error');
  }

  likeBtn.addEventListener('click', async () => {
    await handleReactionClick('like', postId);
  });

  dislikeBtn.addEventListener('click', async () => {
    await handleReactionClick('dislike', postId);
  });
}
