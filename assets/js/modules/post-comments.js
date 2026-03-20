// assets/js/modules/post-comments.js
import { supabase } from './supabase-client.js';
import {
  getCurrentUser,
  getDisplayName,
  loginHref,
  saveRedirect,
} from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str)
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

function setFormMessage(text, type = '') {
  const el = $('commentFormMsg');
  if (!el) return;
  el.textContent = text;
  el.className = type ? `comment-form__msg ${type}` : 'comment-form__msg';
}

function getPostIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  const postId = Number(sp.get('id') || 0);
  return Number.isFinite(postId) && postId > 0 ? postId : null;
}

function nl2brSafe(text) {
  return escapeHtml(text || '').replaceAll('\n', '<br />');
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = String(value ?? '')
    .trim()
    .toLowerCase();

  return text === 'true' || text === 't' || text === '1';
}

function syncTopCommentMeta(count) {
  const topMetaEl = $('postCommentMeta');
  if (!topMetaEl) return;
  topMetaEl.textContent = `💬 ${Number(count || 0)}`;
}

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[post-comments] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

function renderCommentItem(comment, currentUserId = '', isAdmin = false) {
  const isMine =
    currentUserId &&
    comment.author_id &&
    String(currentUserId) === String(comment.author_id);

  const canEdit = !!isMine;
  const canDelete = !!isMine || !!isAdmin;

  return `
    <article class="comment-item" data-comment-id="${comment.id}">
      <div class="comment-item__head">
        <div class="comment-item__meta">
          <strong class="comment-item__author">${escapeHtml(
            comment.author_nickname || '익명',
          )}</strong>
          <span class="comment-item__date">${formatDateTime(
            comment.created_at,
          )}</span>
        </div>

        ${
          canDelete || canEdit
            ? `
          <div class="comment-item__actions">
            ${
              canEdit
                ? `
              <button
                type="button"
                class="comment-action-btn"
                data-action="edit"
                data-comment-id="${comment.id}"
              >
                수정
              </button>
            `
                : ''
            }

            ${
              canDelete
                ? `
              <button
                type="button"
                class="comment-action-btn is-danger"
                data-action="delete"
                data-comment-id="${comment.id}"
                data-is-mine="${isMine ? 'true' : 'false'}"
              >
                삭제
              </button>
            `
                : ''
            }
          </div>
        `
            : ''
        }
      </div>

      <div class="comment-item__view" data-role="comment-view">
        <div class="comment-item__body">${nl2brSafe(comment.body || '')}</div>
      </div>

      ${
        canEdit
          ? `
        <form class="comment-edit-form" data-role="comment-edit-form" hidden>
          <textarea
            class="comment-edit-form__textarea"
            maxlength="500"
            rows="4"
            data-role="comment-edit-textarea"
          >${escapeHtml(comment.body || '')}</textarea>

          <div class="comment-edit-form__bottom">
            <p class="comment-edit-form__msg" data-role="comment-edit-msg"></p>

            <div class="comment-edit-form__actions">
              <button
                type="button"
                class="comment-action-btn"
                data-action="cancel-edit"
                data-comment-id="${comment.id}"
              >
                취소
              </button>
              <button
                type="submit"
                class="comment-action-btn is-primary"
                data-comment-id="${comment.id}"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      `
          : ''
      }
    </article>
  `;
}

async function loadComments(postId) {
  const { data, error } = await supabase
    .from('post_comments')
    .select('id, post_id, body, author_id, author_nickname, created_at')
    .eq('post_id', postId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function renderComments(postId) {
  const listEl = $('commentList');
  const countEl = $('commentCount');

  if (!listEl || !countEl) return;

  listEl.innerHTML = `<div class="comment-empty">댓글을 불러오는 중이야.</div>`;

  try {
    const [comments, user, role] = await Promise.all([
      loadComments(postId),
      getCurrentUser(),
      getMyRole(),
    ]);

    const currentUserId = user?.id || '';
    const isAdmin = !!role?.isAdmin;
    const nextCount = comments.length;

    countEl.textContent = String(nextCount);
    syncTopCommentMeta(nextCount);

    if (!comments.length) {
      listEl.innerHTML = `<div class="comment-empty">아직 댓글이 없어. 첫 댓글을 남겨봐.</div>`;
      return;
    }

    listEl.innerHTML = comments
      .map((comment) => renderCommentItem(comment, currentUserId, isAdmin))
      .join('');
  } catch (error) {
    console.error('[post-comments] render failed:', error);
    countEl.textContent = '0';
    syncTopCommentMeta(0);
    listEl.innerHTML = `<div class="comment-empty">댓글을 불러오지 못했어.</div>`;
  }
}

async function syncCommentFormUser() {
  const userBox = $('commentUserBox');
  const hint = $('commentLoginHint');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');

  if (!userBox || !hint || !textarea || !submitBtn) return;

  const user = await getCurrentUser();

  if (user) {
    userBox.textContent = `작성자: ${getDisplayName(user)}`;
    hint.textContent = '로그인 상태야. 댓글을 남길 수 있어.';
    textarea.disabled = false;
    submitBtn.disabled = false;
    return;
  }

  userBox.textContent = '작성자: 게스트';
  hint.textContent = '댓글 작성은 로그인 후 가능해.';
  textarea.disabled = true;
  submitBtn.disabled = false;
}

function findCommentItemById(commentId) {
  return document.querySelector(
    `.comment-item[data-comment-id="${commentId}"]`,
  );
}

function setEditMode(commentId, isEditing) {
  const item = findCommentItemById(commentId);
  if (!item) return;

  const viewEl = item.querySelector('[data-role="comment-view"]');
  const formEl = item.querySelector('[data-role="comment-edit-form"]');

  if (!viewEl || !formEl) return;

  if (isEditing) {
    viewEl.hidden = true;
    formEl.hidden = false;

    const textarea = formEl.querySelector(
      '[data-role="comment-edit-textarea"]',
    );
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    return;
  }

  viewEl.hidden = false;
  formEl.hidden = true;

  const msg = formEl.querySelector('[data-role="comment-edit-msg"]');
  if (msg) msg.textContent = '';
}

function setEditMessage(commentId, text, type = '') {
  const item = findCommentItemById(commentId);
  if (!item) return;

  const msg = item.querySelector('[data-role="comment-edit-msg"]');
  if (!msg) return;

  msg.textContent = text;
  msg.className = type
    ? `comment-edit-form__msg ${type}`
    : 'comment-edit-form__msg';
}

async function handleCreateComment(postId) {
  const form = $('commentForm');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');

  if (!form || !textarea || !submitBtn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const user = await getCurrentUser();

    if (!user) {
      saveRedirect();
      window.location.href = loginHref();
      return;
    }

    const body = textarea.value.trim();

    if (!body) {
      setFormMessage('댓글 내용을 입력해줘.', 'is-error');
      textarea.focus();
      return;
    }

    if (body.length > 500) {
      setFormMessage('댓글은 500자 이하로 입력해줘.', 'is-error');
      textarea.focus();
      return;
    }

    setFormMessage('댓글 등록 중...');
    submitBtn.disabled = true;

    const payload = {
      post_id: postId,
      body,
      author_id: user.id,
      author_nickname: getDisplayName(user),
    };

    const { error } = await supabase.from('post_comments').insert(payload);

    submitBtn.disabled = false;

    if (error) {
      console.error('[post-comments] insert failed:', error);
      setFormMessage(
        '댓글 등록에 실패했어. 잠시 후 다시 시도해줘.',
        'is-error',
      );
      return;
    }

    textarea.value = '';
    setFormMessage('댓글이 등록됐어.', 'is-success');

    await syncCommentFormUser();
    await renderComments(postId);
  });
}

async function handleDeleteComment(commentId, postId, isMine = true) {
  const ok = window.confirm(
    isMine ? '이 댓글을 삭제할까?' : '관리자 권한으로 이 댓글을 삭제할까?',
  );
  if (!ok) return;

  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    console.error('[post-comments] delete failed:', error);
    alert('댓글 삭제에 실패했어.');
    return;
  }

  await renderComments(postId);
}

async function handleSaveEdit(commentId, postId) {
  const item = findCommentItemById(commentId);
  if (!item) return;

  const textarea = item.querySelector('[data-role="comment-edit-textarea"]');
  if (!textarea) return;

  const nextBody = textarea.value.trim();

  if (!nextBody) {
    setEditMessage(commentId, '댓글 내용을 입력해줘.', 'is-error');
    textarea.focus();
    return;
  }

  if (nextBody.length > 500) {
    setEditMessage(commentId, '댓글은 500자 이하로 입력해줘.', 'is-error');
    textarea.focus();
    return;
  }

  setEditMessage(commentId, '수정 중...');

  const { error } = await supabase
    .from('post_comments')
    .update({ body: nextBody })
    .eq('id', commentId);

  if (error) {
    console.error('[post-comments] update failed:', error);
    setEditMessage(commentId, '댓글 수정에 실패했어.', 'is-error');
    return;
  }

  await renderComments(postId);
}

function bindCommentListEvents(postId) {
  const listEl = $('commentList');
  if (!listEl || listEl.dataset.bound === '1') return;

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const commentId = Number(btn.dataset.commentId || 0);
    if (!Number.isFinite(commentId) || commentId <= 0) return;

    if (action === 'edit') {
      setEditMode(commentId, true);
      return;
    }

    if (action === 'cancel-edit') {
      setEditMode(commentId, false);
      return;
    }

    if (action === 'delete') {
      const isMine = btn.dataset.isMine === 'true';
      await handleDeleteComment(commentId, postId, isMine);
    }
  });

  listEl.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-role="comment-edit-form"]');
    if (!form) return;

    e.preventDefault();

    const submitBtn = form.querySelector(
      'button[type="submit"][data-comment-id]',
    );
    const commentId = Number(submitBtn?.dataset?.commentId || 0);

    if (!Number.isFinite(commentId) || commentId <= 0) return;

    await handleSaveEdit(commentId, postId);
  });

  listEl.dataset.bound = '1';
}

export async function initPostComments() {
  const form = $('commentForm');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');
  const postId = getPostIdFromUrl();

  if (!form || !textarea || !submitBtn || !postId) return;

  await syncCommentFormUser();
  await renderComments(postId);
  bindCommentListEvents(postId);
  await handleCreateComment(postId);
}
