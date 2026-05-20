// assets/js/modules/inquiry-board.js
import {
  getCurrentUser,
  getDisplayName,
  loginHref,
  saveRedirect,
} from './auth-store.js';
import { supabase } from './supabase-client.js';
import {
  loadBoardThreads,
  loadBoardReplies,
  createBoardThread,
  deleteBoardThread,
  unlockBoardThread,
  createBoardReply,
  deleteBoardReply,
  groupRepliesByThread,
} from './inquiry-board-repo.js';

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
  if (error) return { isAdmin: false };
  const row = Array.isArray(data) ? data[0] : data;
  return { isAdmin: toBoolean(row?.is_admin) };
}

export async function initInquiryBoard(config) {
  const form = $('suggestionForm');
  const textarea = $('suggestionBody');
  const listEl = $('suggestionList');
  const pagerEl = $('suggestionPager');
  const prevBtn = $('suggestionPrevBtn');
  const nextBtn = $('suggestionNextBtn');
  const pageInfoEl = $('suggestionPageInfo');
  const userBox = $('suggestionUserBox');
  const hintEl = $('suggestionLoginHint');
  const msgEl = $('suggestionFormMsg');
  const submitBtn = $('suggestionSubmitBtn');
  const secretToggle = $('suggestionSecretToggle');
  const secretPassword = $('suggestionSecretPassword');
  const exampleRoot = config.exampleRootId
    ? document.getElementById(config.exampleRootId)
    : null;

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
    user: null,
    isAdmin: false,
    threads: [],
    repliesMap: new Map(),
    unlockedMap: new Map(),
  };

  function setFormMessage(text, type = '') {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className = type
      ? `suggestion-form__msg ${type}`
      : 'suggestion-form__msg';
  }

  function syncSecretUi() {
    if (!secretToggle || !secretPassword) return;
    secretPassword.hidden = !secretToggle.checked;
    secretPassword.disabled = !secretToggle.checked;
    if (!secretToggle.checked) secretPassword.value = '';
  }

  async function syncUserState() {
    const [user, role] = await Promise.all([getCurrentUser(), getMyRole()]);
    state.user = user;
    state.isAdmin = !!role?.isAdmin;

    if (user) {
      if (userBox) userBox.textContent = `작성자: ${getDisplayName(user)}`;
      if (hintEl) hintEl.textContent = config.loginHintLoggedIn;
      textarea.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
    } else {
      if (userBox) userBox.textContent = '작성자: 게스트';
      if (hintEl) hintEl.textContent = config.loginHintLoggedOut;
      textarea.disabled = true;
    }
  }

  async function refreshData() {
    const threads = await loadBoardThreads(config.boardType);
    const visibleIds = threads
      .filter(
        (item) =>
          !item.is_secret ||
          item.can_view_full ||
          state.unlockedMap.has(Number(item.id)),
      )
      .map((item) => Number(item.id));

    const replies = await loadBoardReplies(config.boardType, visibleIds);
    state.threads = threads;
    state.repliesMap = groupRepliesByThread(replies);
  }

  function renderReply(reply, canDelete = false) {
    return `
      <div class="suggestion-reply" data-reply-id="${reply.id}">
        <div class="suggestion-reply__head">
          <div class="suggestion-reply__meta">
            <span class="suggestion-reply__badge">관리자</span>
            <span class="suggestion-reply__date">${formatDateTime(reply.created_at)}</span>
          </div>
          ${
            canDelete
              ? `
            <div class="suggestion-reply__actions">
              <button type="button" class="suggestion-action-btn is-danger" data-action="delete-reply" data-reply-id="${reply.id}">
                삭제
              </button>
            </div>
          `
              : ''
          }
        </div>
        <div class="suggestion-reply__view">
          <div class="suggestion-reply__body">${nl2brSafe(reply.body || '')}</div>
        </div>
      </div>
    `;
  }

  function renderUnlockForm(item) {
    return `
      <form class="suggestion-secret-unlock" data-action-form="unlock-secret" data-thread-id="${item.id}">
        <div class="suggestion-secret-locktext">${config.secretLockedText}</div>
        <div class="suggestion-secret-unlock-row">
          <input
            type="password"
            class="suggestion-secret-unlock-input"
            data-role="unlock-password"
            maxlength="100"
            placeholder="${escapeHtml(config.unlockPlaceholderText)}"
          />
          <button type="submit" class="suggestion-action-btn is-primary">${escapeHtml(config.unlockButtonText)}</button>
        </div>
        <p class="suggestion-edit-form__msg" data-role="unlock-msg"></p>
      </form>
    `;
  }

  function renderThread(item) {
    const unlocked = state.unlockedMap.get(Number(item.id));
    const canViewFull = !!item.can_view_full || !!unlocked;
    const isMine = !!item.is_mine;
    const canDelete = !!item.can_delete;
    const replies = canViewFull
      ? unlocked?.replies || state.repliesMap.get(Number(item.id)) || []
      : [];

    const bodyHtml = canViewFull
      ? nl2brSafe(unlocked?.body || item.body || '')
      : renderUnlockForm(item);

    return `
      <article class="suggestion-item" data-thread-id="${item.id}">
        <div class="suggestion-item__head">
          <div class="suggestion-item__meta">
            <strong class="suggestion-item__author">${escapeHtml(item.author_nickname || '익명')}</strong>
            <span class="suggestion-item__date">${formatDateTime(item.created_at)}</span>
            ${
              item.is_secret
                ? `<span class="suggestion-secret-badge">${escapeHtml(config.secretToggleLabel)}</span>`
                : ''
            }
          </div>

          ${
            canDelete
              ? `
  <div class="suggestion-item__actions">
    <button
      type="button"
      class="suggestion-action-btn is-danger"
      data-action="delete-thread"
      data-thread-id="${item.id}"
    >
      삭제
    </button>
  </div>
`
              : ''
          }
        </div>

        <div class="suggestion-item__view">
          <div class="suggestion-item__body">${bodyHtml}</div>
        </div>

        ${
          canViewFull && replies.length
            ? `<div class="suggestion-replies">${replies
                .map((reply) => renderReply(reply, state.isAdmin))
                .join('')}</div>`
            : ''
        }

        ${
          state.isAdmin && canViewFull
            ? `
          <form class="suggestion-admin-form" data-action-form="admin-reply" data-thread-id="${item.id}">
            <textarea class="suggestion-admin-form__textarea" data-role="reply-body" rows="1" maxlength="500" placeholder="${escapeHtml(config.adminReplyPlaceholderText)}"></textarea>
            <div class="suggestion-admin-form__bottom">
              <p class="suggestion-admin-form__msg" data-role="reply-msg"></p>
              <button type="submit" class="suggestion-btn suggestion-btn--primary" data-role="reply-submit">등록</button>
            </div>
          </form>
        `
            : ''
        }
      </article>
    `;
  }

  function renderPager(totalPages) {
    pagerEl.hidden = totalPages <= 1;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;
    pageInfoEl.textContent = `${state.page} / ${totalPages}`;
  }

  function render() {
    const total = state.threads.length;
    const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

    if (!total) {
      listEl.innerHTML = `<div class="suggestion-empty">${escapeHtml(config.emptyText)}</div>`;
      pagerEl.hidden = true;
      return;
    }

    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    const start = (state.page - 1) * PER_PAGE;
    const pageItems = state.threads.slice(start, start + PER_PAGE);

    listEl.innerHTML = pageItems.map(renderThread).join('');
    renderPager(totalPages);
  }

  async function refreshAll({ keepPage = true } = {}) {
    const oldPage = state.page;
    await syncUserState();
    await refreshData();
    state.page = keepPage ? oldPage : 1;
    render();
  }

  if (secretToggle) {
    secretToggle.addEventListener('change', syncSecretUi);
    syncSecretUi();
  }

  if (exampleRoot) {
    exampleRoot.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-example]');
      if (!btn) return;
      const text = String(btn.dataset.example || '').trim();
      if (!text) return;

      if (!textarea.value.trim()) {
        textarea.value = text;
      } else if (!textarea.value.includes(text)) {
        textarea.value = `${textarea.value.trim()}\n${text}`;
      }
      textarea.focus();
    });
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
    const isSecret = !!secretToggle?.checked;
    const password = String(secretPassword?.value || '').trim();

    if (!body) {
      setFormMessage(config.bodyRequiredText, 'is-error');
      textarea.focus();
      return;
    }

    if (body.length > 1000) {
      setFormMessage(config.bodyTooLongText, 'is-error');
      textarea.focus();
      return;
    }

    if (isSecret && !password) {
      setFormMessage('비밀글 비밀번호를 입력해줘.', 'is-error');
      secretPassword?.focus();
      return;
    }

    setFormMessage('등록 중...');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await createBoardThread(config.boardType, {
        body,
        is_secret: isSecret,
        secret_password: password,
      });

      textarea.value = '';
      if (secretToggle) secretToggle.checked = false;
      syncSecretUi();
      setFormMessage(config.submitSuccessText, 'is-success');
      await refreshAll({ keepPage: false });
    } catch (error) {
      console.error(`[${config.boardType}] create failed`, error);
      setFormMessage(config.submitFailText, 'is-error');
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  listEl.addEventListener('submit', async (e) => {
    const unlockForm = e.target.closest('[data-action-form="unlock-secret"]');
    if (unlockForm) {
      e.preventDefault();
      const threadId = Number(unlockForm.dataset.threadId || 0);
      const pwInput = unlockForm.querySelector('[data-role="unlock-password"]');
      const msgEl = unlockForm.querySelector('[data-role="unlock-msg"]');
      const password = String(pwInput?.value || '').trim();

      if (!threadId || !password) {
        if (msgEl) msgEl.textContent = '비밀번호를 입력해줘.';
        return;
      }

      try {
        const result = await unlockBoardThread(
          config.boardType,
          threadId,
          password,
        );
        if (!result?.success) {
          if (msgEl) msgEl.textContent = config.unlockFailText;
          return;
        }

        state.unlockedMap.set(threadId, {
          body: result.body || '',
          replies: Array.isArray(result.replies) ? result.replies : [],
        });

        render();
      } catch (error) {
        console.error(`[${config.boardType}] unlock failed`, error);
        if (msgEl) msgEl.textContent = config.unlockFailText;
      }
      return;
    }

    const replyForm = e.target.closest('[data-action-form="admin-reply"]');
    if (replyForm) {
      e.preventDefault();

      if (!state.isAdmin) return;

      const threadId = Number(replyForm.dataset.threadId || 0);
      const textareaEl = replyForm.querySelector('[data-role="reply-body"]');
      const msg = replyForm.querySelector('[data-role="reply-msg"]');
      const body = String(textareaEl?.value || '').trim();

      if (!threadId || !body) {
        if (msg) msg.textContent = '댓글 내용을 입력해줘.';
        return;
      }

      try {
        await createBoardReply(config.boardType, threadId, body);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error(`[${config.boardType}] reply failed`, error);
        if (msg) msg.textContent = '댓글 등록에 실패했어.';
      }
    }
  });

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const threadId = Number(btn.dataset.threadId || 0);
    const replyId = Number(btn.dataset.replyId || 0);

    if (action === 'delete-thread' && threadId) {
      const ok = window.confirm('이 글을 삭제할까?');
      if (!ok) return;

      try {
        await deleteBoardThread(config.boardType, threadId);
        state.unlockedMap.delete(threadId);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error(`[${config.boardType}] delete failed`, error);
        alert('삭제에 실패했어.');
      }
      return;
    }

    if (action === 'delete-reply' && replyId) {
      const ok = window.confirm('이 관리자 답변을 삭제할까?');
      if (!ok) return;

      try {
        await deleteBoardReply(config.boardType, replyId);
        await refreshAll({ keepPage: true });
      } catch (error) {
        console.error(`[${config.boardType}] delete reply failed`, error);
        alert('답변 삭제에 실패했어.');
      }
    }
  });

  prevBtn.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(state.threads.length / PER_PAGE));
    if (state.page >= totalPages) return;
    state.page += 1;
    render();
  });

  await refreshAll({ keepPage: false });
}
