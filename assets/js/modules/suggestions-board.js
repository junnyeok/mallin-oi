// assets/js/modules/suggestions-board.js
import {
  getCurrentUser,
  getDisplayName,
  loginHref,
  saveRedirect,
} from './auth-store.js';
import { supabase } from './supabase-client.js';
import {
  loadSuggestions,
  insertSuggestion,
  updateSuggestion,
  deleteSuggestion,
  loadSuggestionReplies,
  insertSuggestionReply,
  updateSuggestionReply,
  deleteSuggestionReply,
  groupRepliesBySuggestion,
} from './suggestions-repo.js';

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function nl2brSafe(text) {
  return escapeHtml(text || '').replaceAll('\n', '<br />');
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

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = String(value ?? '')
    .trim()
    .toLowerCase();

  return text === 'true' || text === 't' || text === '1';
}

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[suggestions-board] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

function setFormMessage(text, type = '') {
  const el = $('suggestionFormMsg');
  if (!el) return;
  el.textContent = text;
  el.className = type ? `suggestion-form__msg ${type}` : 'suggestion-form__msg';
}

function setSuggestionEditMessage(itemEl, text, type = '') {
  if (!itemEl) return;
  const el = itemEl.querySelector('[data-role="suggestion-edit-msg"]');
  if (!el) return;

  el.textContent = text;
  el.className = type
    ? `suggestion-edit-form__msg ${type}`
    : 'suggestion-edit-form__msg';
}

function setReplyFormMessage(formEl, text, type = '') {
  if (!formEl) return;
  const el = formEl.querySelector('[data-role="reply-msg"]');
  if (!el) return;

  el.textContent = text;
  el.className = type
    ? `suggestion-admin-form__msg ${type}`
    : 'suggestion-admin-form__msg';
}

function setReplyEditMessage(replyEl, text, type = '') {
  if (!replyEl) return;
  const el = replyEl.querySelector('[data-role="reply-edit-msg"]');
  if (!el) return;

  el.textContent = text;
  el.className = type
    ? `suggestion-reply-edit-form__msg ${type}`
    : 'suggestion-reply-edit-form__msg';
}

async function syncSuggestionFormUser() {
  const userBox = $('suggestionUserBox');
  const hint = $('suggestionLoginHint');
  const textarea = $('suggestionBody');
  const submitBtn = $('suggestionSubmitBtn');

  if (!userBox || !hint || !textarea || !submitBtn) return;

  const user = await getCurrentUser();

  if (user) {
    userBox.textContent = `작성자: ${getDisplayName(user)}`;
    hint.textContent = '로그인 상태야. 건의사항을 남길 수 있어.';
    textarea.disabled = false;
    submitBtn.disabled = false;
    return;
  }

  userBox.textContent = '작성자: 게스트';
  hint.textContent = '로그인 후 건의사항 작성이 가능해.';
  textarea.disabled = true;
  submitBtn.disabled = false;
}

function renderReply(reply, currentUserId = '', isAdmin = false) {
  const isMine =
    currentUserId &&
    reply.author_id &&
    String(currentUserId) === String(reply.author_id);

  const canEdit = !!isAdmin && !!isMine;
  const canDelete = !!isAdmin;

  return `
    <div class="suggestion-reply" data-reply-id="${reply.id}">
      <div class="suggestion-reply__head">
        <div class="suggestion-reply__meta">
          <span class="suggestion-reply__badge">관리자</span>
          <span class="suggestion-reply__date">${formatDateTime(
            reply.created_at,
          )}</span>
        </div>

        ${
          canEdit || canDelete
            ? `
          <div class="suggestion-reply__actions">
            ${
              canEdit
                ? `
              <button
                type="button"
                class="suggestion-action-btn"
                data-action="edit-reply"
                data-reply-id="${reply.id}"
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
                class="suggestion-action-btn is-danger"
                data-action="delete-reply"
                data-reply-id="${reply.id}"
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

      <div class="suggestion-reply__view" data-role="reply-view">
        <div class="suggestion-reply__body">${nl2brSafe(reply.body || '')}</div>
      </div>

      ${
        canEdit
          ? `
        <form class="suggestion-reply-edit-form" data-role="reply-edit-form" hidden>
          <textarea
            class="suggestion-reply-edit-form__textarea"
            data-role="reply-edit-textarea"
            rows="2"
            maxlength="500"
          >${escapeHtml(reply.body || '')}</textarea>

          <div class="suggestion-reply-edit-form__bottom">
            <p class="suggestion-reply-edit-form__msg" data-role="reply-edit-msg"></p>

            <div class="suggestion-reply-edit-form__actions">
              <button
                type="button"
                class="suggestion-action-btn"
                data-action="cancel-edit-reply"
                data-reply-id="${reply.id}"
              >
                취소
              </button>
              <button
                type="submit"
                class="suggestion-action-btn is-primary"
                data-reply-id="${reply.id}"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      `
          : ''
      }
    </div>
  `;
}

function renderSuggestionItem(
  item,
  replies = [],
  currentUserId = '',
  isAdmin = false,
) {
  const isMine =
    currentUserId &&
    item.author_id &&
    String(currentUserId) === String(item.author_id);

  const canEdit = !!isMine;
  const canDelete = !!isMine || !!isAdmin;

  return `
    <article class="suggestion-item" data-suggestion-id="${item.id}">
      <div class="suggestion-item__head">
        <div class="suggestion-item__meta">
          <strong class="suggestion-item__author">${escapeHtml(
            item.author_nickname || '익명',
          )}</strong>
          <span class="suggestion-item__date">${formatDateTime(
            item.created_at,
          )}</span>
        </div>

        ${
          canEdit || canDelete
            ? `
          <div class="suggestion-item__actions">
            ${
              canEdit
                ? `
              <button
                type="button"
                class="suggestion-action-btn"
                data-action="edit-suggestion"
                data-suggestion-id="${item.id}"
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
                class="suggestion-action-btn is-danger"
                data-action="delete-suggestion"
                data-suggestion-id="${item.id}"
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

      <div class="suggestion-item__view" data-role="suggestion-view">
        <div class="suggestion-item__body">${nl2brSafe(item.body || '')}</div>
      </div>

      ${
        canEdit
          ? `
        <form class="suggestion-edit-form" data-role="suggestion-edit-form" hidden>
          <textarea
            class="suggestion-edit-form__textarea"
            data-role="suggestion-edit-textarea"
            rows="2"
            maxlength="1000"
          >${escapeHtml(item.body || '')}</textarea>

          <div class="suggestion-edit-form__bottom">
            <p class="suggestion-edit-form__msg" data-role="suggestion-edit-msg"></p>

            <div class="suggestion-edit-form__actions">
              <button
                type="button"
                class="suggestion-action-btn"
                data-action="cancel-edit-suggestion"
                data-suggestion-id="${item.id}"
              >
                취소
              </button>
              <button
                type="submit"
                class="suggestion-action-btn is-primary"
                data-suggestion-id="${item.id}"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      `
          : ''
      }

      <div class="suggestion-replies">
        ${replies
          .map((reply) => renderReply(reply, currentUserId, isAdmin))
          .join('')}
      </div>

      ${
        isAdmin
          ? `
        <form class="suggestion-admin-form" data-role="admin-reply-form">
          <textarea
            class="suggestion-admin-form__textarea"
            data-role="reply-body"
            rows="1"
            maxlength="500"
            placeholder="관리자 댓글을 입력해줘."
          ></textarea>

          <div class="suggestion-admin-form__bottom">
            <p class="suggestion-admin-form__msg" data-role="reply-msg"></p>
            <button
              type="submit"
              class="suggestion-btn suggestion-btn--primary"
              data-role="reply-submit"
            >
              댓글 등록
            </button>
          </div>
        </form>
      `
          : ''
      }
    </article>
  `;
}

function findSuggestionItemById(suggestionId) {
  return document.querySelector(
    `.suggestion-item[data-suggestion-id="${suggestionId}"]`,
  );
}

function findReplyElById(replyId) {
  return document.querySelector(
    `.suggestion-reply[data-reply-id="${replyId}"]`,
  );
}

function setSuggestionEditMode(suggestionId, isEditing) {
  const itemEl = findSuggestionItemById(suggestionId);
  if (!itemEl) return;

  const viewEl = itemEl.querySelector('[data-role="suggestion-view"]');
  const formEl = itemEl.querySelector('[data-role="suggestion-edit-form"]');

  if (!viewEl || !formEl) return;

  if (isEditing) {
    viewEl.hidden = true;
    formEl.hidden = false;

    const textarea = formEl.querySelector(
      '[data-role="suggestion-edit-textarea"]',
    );
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    return;
  }

  viewEl.hidden = false;
  formEl.hidden = true;
  setSuggestionEditMessage(itemEl, '');
}

function setReplyEditMode(replyId, isEditing) {
  const replyEl = findReplyElById(replyId);
  if (!replyEl) return;

  const viewEl = replyEl.querySelector('[data-role="reply-view"]');
  const formEl = replyEl.querySelector('[data-role="reply-edit-form"]');

  if (!viewEl || !formEl) return;

  if (isEditing) {
    viewEl.hidden = true;
    formEl.hidden = false;

    const textarea = formEl.querySelector('[data-role="reply-edit-textarea"]');
    if (textarea) {
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    }
    return;
  }

  viewEl.hidden = false;
  formEl.hidden = true;
  setReplyEditMessage(replyEl, '');
}

export async function initSuggestionsBoard() {
  const form = $('suggestionForm');
  const textarea = $('suggestionBody');
  const listEl = $('suggestionList');
  const pagerEl = $('suggestionPager');
  const prevBtn = $('suggestionPrevBtn');
  const nextBtn = $('suggestionNextBtn');
  const pageInfoEl = $('suggestionPageInfo');

  if (
    !form ||
    !textarea ||
    !listEl ||
    !pagerEl ||
    !prevBtn ||
    !nextBtn ||
    !pageInfoEl
  ) {
    return;
  }

  const PER_PAGE = 3;

  const state = {
    page: 1,
    suggestions: [],
    repliesMap: new Map(),
    user: null,
    isAdmin: false,
  };

  async function refreshUserState() {
    const [user, role] = await Promise.all([getCurrentUser(), getMyRole()]);
    state.user = user;
    state.isAdmin = !!role?.isAdmin;
    await syncSuggestionFormUser();
  }

  async function refreshData() {
    const suggestions = await loadSuggestions();
    const ids = suggestions.map((item) => Number(item.id));
    const replies = await loadSuggestionReplies(ids);

    state.suggestions = suggestions;
    state.repliesMap = groupRepliesBySuggestion(replies);
  }

  function renderPager(totalPages) {
    pagerEl.hidden = totalPages <= 1;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    pageInfoEl.textContent = `${state.page} / ${totalPages}`;
  }

  function render() {
    const total = state.suggestions.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    if (!total) {
      listEl.innerHTML = `<div class="suggestion-empty">아직 등록된 건의사항이 없어. 첫 번째 건의사항을 남겨봐.</div>`;
      pagerEl.hidden = true;
      return;
    }

    const start = (state.page - 1) * PER_PAGE;
    const pageItems = state.suggestions.slice(start, start + PER_PAGE);

    listEl.innerHTML = pageItems
      .map((item) =>
        renderSuggestionItem(
          item,
          state.repliesMap.get(Number(item.id)) || [],
          state.user?.id || '',
          state.isAdmin,
        ),
      )
      .join('');

    renderPager(totalPages);
  }

  async function refreshAll({ keepPage = true } = {}) {
    const oldPage = state.page;

    await refreshUserState();
    await refreshData();

    state.page = keepPage ? oldPage : 1;
    render();
  }

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
      setFormMessage('건의사항 내용을 입력해줘.', 'is-error');
      textarea.focus();
      return;
    }

    if (body.length > 1000) {
      setFormMessage('건의사항은 1000자 이하로 입력해줘.', 'is-error');
      textarea.focus();
      return;
    }

    const submitBtn = $('suggestionSubmitBtn');
    setFormMessage('등록 중...');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await insertSuggestion({
        body,
        author_id: user.id,
        author_nickname: getDisplayName(user),
      });

      textarea.value = '';
      setFormMessage('건의사항이 등록됐어.', 'is-success');
      await refreshAll({ keepPage: false });
    } catch (error) {
      console.error('[suggestions-board] insert suggestion failed:', error);
      setFormMessage(
        '건의사항 등록에 실패했어. 잠시 후 다시 시도해줘.',
        'is-error',
      );
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  prevBtn.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(
      1,
      Math.ceil(state.suggestions.length / PER_PAGE),
    );
    if (state.page >= totalPages) return;
    state.page += 1;
    render();
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;

    if (action === 'edit-suggestion') {
      const suggestionId = Number(btn.dataset.suggestionId || 0);
      if (!suggestionId) return;
      setSuggestionEditMode(suggestionId, true);
      return;
    }

    if (action === 'cancel-edit-suggestion') {
      const suggestionId = Number(btn.dataset.suggestionId || 0);
      if (!suggestionId) return;
      setSuggestionEditMode(suggestionId, false);
      return;
    }

    if (action === 'delete-suggestion') {
      const suggestionId = Number(btn.dataset.suggestionId || 0);
      const isMine = btn.dataset.isMine === 'true';
      if (!suggestionId) return;

      const ok = window.confirm(
        isMine
          ? '이 건의사항을 삭제할까?'
          : '관리자 권한으로 이 건의사항을 삭제할까?',
      );
      if (!ok) return;

      try {
        await deleteSuggestion(suggestionId);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error('[suggestions-board] delete suggestion failed:', error);
        alert('건의사항 삭제에 실패했어.');
      }
      return;
    }

    if (action === 'edit-reply') {
      const replyId = Number(btn.dataset.replyId || 0);
      if (!replyId) return;
      setReplyEditMode(replyId, true);
      return;
    }

    if (action === 'cancel-edit-reply') {
      const replyId = Number(btn.dataset.replyId || 0);
      if (!replyId) return;
      setReplyEditMode(replyId, false);
      return;
    }

    if (action === 'delete-reply') {
      const replyId = Number(btn.dataset.replyId || 0);
      if (!replyId) return;

      const ok = window.confirm('이 관리자 댓글을 삭제할까?');
      if (!ok) return;

      try {
        await deleteSuggestionReply(replyId);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error('[suggestions-board] delete reply failed:', error);
        alert('관리자 댓글 삭제에 실패했어.');
      }
    }
  });

  listEl.addEventListener('submit', async (e) => {
    const suggestionEditForm = e.target.closest(
      '[data-role="suggestion-edit-form"]',
    );
    if (suggestionEditForm) {
      e.preventDefault();

      const itemEl = suggestionEditForm.closest('.suggestion-item');
      const suggestionId = Number(itemEl?.dataset?.suggestionId || 0);
      const textareaEl = suggestionEditForm.querySelector(
        '[data-role="suggestion-edit-textarea"]',
      );

      if (!itemEl || !suggestionId || !textareaEl) return;

      const nextBody = textareaEl.value.trim();

      if (!nextBody) {
        setSuggestionEditMessage(
          itemEl,
          '건의사항 내용을 입력해줘.',
          'is-error',
        );
        textareaEl.focus();
        return;
      }

      if (nextBody.length > 1000) {
        setSuggestionEditMessage(
          itemEl,
          '건의사항은 1000자 이하로 입력해줘.',
          'is-error',
        );
        textareaEl.focus();
        return;
      }

      setSuggestionEditMessage(itemEl, '수정 중...');

      try {
        await updateSuggestion(suggestionId, nextBody);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error('[suggestions-board] update suggestion failed:', error);
        setSuggestionEditMessage(
          itemEl,
          '건의사항 수정에 실패했어.',
          'is-error',
        );
      }

      return;
    }

    const adminReplyForm = e.target.closest('[data-role="admin-reply-form"]');
    if (adminReplyForm) {
      e.preventDefault();

      if (!state.isAdmin) {
        alert('관리자만 댓글을 등록할 수 있어.');
        return;
      }

      const itemEl = adminReplyForm.closest('.suggestion-item');
      const suggestionId = Number(itemEl?.dataset?.suggestionId || 0);
      const textareaEl = adminReplyForm.querySelector(
        '[data-role="reply-body"]',
      );
      const submitBtn = adminReplyForm.querySelector(
        '[data-role="reply-submit"]',
      );

      if (!suggestionId || !textareaEl) return;

      const body = textareaEl.value.trim();

      if (!body) {
        setReplyFormMessage(
          adminReplyForm,
          '댓글 내용을 입력해줘.',
          'is-error',
        );
        textareaEl.focus();
        return;
      }

      if (body.length > 500) {
        setReplyFormMessage(
          adminReplyForm,
          '댓글은 500자 이하로 입력해줘.',
          'is-error',
        );
        textareaEl.focus();
        return;
      }

      const user = await getCurrentUser();
      if (!user) {
        alert('로그인이 필요해.');
        return;
      }

      setReplyFormMessage(adminReplyForm, '댓글 등록 중...');
      if (submitBtn) submitBtn.disabled = true;

      try {
        await insertSuggestionReply({
          suggestion_id: suggestionId,
          body,
          author_id: user.id,
          author_nickname: getDisplayName(user),
        });

        textareaEl.value = '';
        setReplyFormMessage(adminReplyForm, '댓글이 등록됐어.', 'is-success');
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error('[suggestions-board] insert reply failed:', error);
        setReplyFormMessage(
          adminReplyForm,
          '댓글 등록에 실패했어.',
          'is-error',
        );
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }

      return;
    }

    const replyEditForm = e.target.closest('[data-role="reply-edit-form"]');
    if (replyEditForm) {
      e.preventDefault();

      const replyEl = replyEditForm.closest('.suggestion-reply');
      const replyId = Number(replyEl?.dataset?.replyId || 0);
      const textareaEl = replyEditForm.querySelector(
        '[data-role="reply-edit-textarea"]',
      );

      if (!replyEl || !replyId || !textareaEl) return;

      const nextBody = textareaEl.value.trim();

      if (!nextBody) {
        setReplyEditMessage(replyEl, '댓글 내용을 입력해줘.', 'is-error');
        textareaEl.focus();
        return;
      }

      if (nextBody.length > 500) {
        setReplyEditMessage(
          replyEl,
          '댓글은 500자 이하로 입력해줘.',
          'is-error',
        );
        textareaEl.focus();
        return;
      }

      setReplyEditMessage(replyEl, '수정 중...');

      try {
        await updateSuggestionReply(replyId, nextBody);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error('[suggestions-board] update reply failed:', error);
        setReplyEditMessage(replyEl, '댓글 수정에 실패했어.', 'is-error');
      }
    }
  });

  await refreshAll({ keepPage: false });
}
