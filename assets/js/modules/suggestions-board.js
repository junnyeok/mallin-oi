// assets/js/modules/suggestions-board.js
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

function setFormMessage(text, type = '') {
  const el = $('suggestionFormMsg');
  if (!el) return;
  el.textContent = text;
  el.className = type ? `suggestion-form__msg ${type}` : 'suggestion-form__msg';
}

function setReplyMessage(formEl, text, type = '') {
  if (!formEl) return;
  const msgEl = formEl.querySelector('[data-role="reply-msg"]');
  if (!msgEl) return;

  msgEl.textContent = text;
  msgEl.className = type
    ? `suggestion-admin-form__msg ${type}`
    : 'suggestion-admin-form__msg';
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

async function loadSuggestions() {
  const { data, error } = await supabase
    .from('suggestions')
    .select('id, body, author_id, author_nickname, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadSuggestionReplies(suggestionIds = []) {
  if (!suggestionIds.length) return [];

  const { data, error } = await supabase
    .from('suggestion_admin_comments')
    .select('id, suggestion_id, body, author_id, author_nickname, created_at')
    .in('suggestion_id', suggestionIds)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

function groupRepliesBySuggestion(replyRows = []) {
  const map = new Map();

  replyRows.forEach((row) => {
    const key = Number(row.suggestion_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });

  return map;
}

function renderReply(reply) {
  return `
    <div class="suggestion-reply">
      <div class="suggestion-reply__head">
        <span class="suggestion-reply__badge">관리자</span>
        <span class="suggestion-reply__date">${formatDateTime(
          reply.created_at,
        )}</span>
      </div>
      <div class="suggestion-reply__body">${nl2brSafe(reply.body || '')}</div>
    </div>
  `;
}

function renderSuggestionItem(item, replies = [], isAdmin = false) {
  return `
    <article class="suggestion-item" data-suggestion-id="${item.id}">
      <div class="suggestion-item__head">
        <strong class="suggestion-item__author">${escapeHtml(
          item.author_nickname || '익명',
        )}</strong>
        <span class="suggestion-item__date">${formatDateTime(
          item.created_at,
        )}</span>
      </div>

      <div class="suggestion-item__body">${nl2brSafe(item.body || '')}</div>

      <div class="suggestion-replies">
        ${replies.length ? replies.map(renderReply).join('') : ''}
      </div>

      ${
        isAdmin
          ? `
        <form class="suggestion-admin-form" data-role="admin-reply-form">
          <textarea
            class="suggestion-admin-form__textarea"
            data-role="reply-body"
            rows="3"
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

function renderPageNumbers({ totalPages, currentPage, numbersEl }) {
  if (!numbersEl) return;

  if (totalPages <= 1) {
    numbersEl.innerHTML = '';
    return;
  }

  let html = '';

  for (let i = 1; i <= totalPages; i += 1) {
    html += `
      <button
        type="button"
        class="suggestion-page-btn ${i === currentPage ? 'is-active' : ''}"
        data-page="${i}"
        aria-label="${i}페이지"
        aria-current="${i === currentPage ? 'page' : 'false'}"
      >
        ${i}
      </button>
    `;
  }

  numbersEl.innerHTML = html;
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

export async function initSuggestionsBoard() {
  const form = $('suggestionForm');
  const textarea = $('suggestionBody');
  const listEl = $('suggestionList');
  const pagerEl = $('suggestionPager');
  const prevBtn = $('suggestionPrevBtn');
  const nextBtn = $('suggestionNextBtn');
  const numbersEl = $('suggestionPageNumbers');

  if (
    !form ||
    !textarea ||
    !listEl ||
    !pagerEl ||
    !prevBtn ||
    !nextBtn ||
    !numbersEl
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
          state.isAdmin,
        ),
      )
      .join('');

    pagerEl.hidden = totalPages <= 1;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;

    renderPageNumbers({
      totalPages,
      currentPage: state.page,
      numbersEl,
    });
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

    setFormMessage('등록 중...');
    const submitBtn = $('suggestionSubmitBtn');
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      body,
      author_id: user.id,
      author_nickname: getDisplayName(user),
    };

    const { error } = await supabase.from('suggestions').insert(payload);

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      console.error('[suggestions-board] insert suggestion failed:', error);
      setFormMessage(
        '건의사항 등록에 실패했어. 잠시 후 다시 시도해줘.',
        'is-error',
      );
      return;
    }

    textarea.value = '';
    setFormMessage('건의사항이 등록됐어.', 'is-success');
    await refreshAll({ keepPage: false });
  });

  listEl.addEventListener('submit', async (e) => {
    const replyForm = e.target.closest('[data-role="admin-reply-form"]');
    if (!replyForm) return;

    e.preventDefault();

    if (!state.isAdmin) {
      alert('관리자만 댓글을 등록할 수 있어.');
      return;
    }

    const itemEl = replyForm.closest('.suggestion-item');
    const suggestionId = Number(itemEl?.dataset?.suggestionId || 0);
    const textareaEl = replyForm.querySelector('[data-role="reply-body"]');
    const submitBtn = replyForm.querySelector('[data-role="reply-submit"]');

    if (!Number.isFinite(suggestionId) || suggestionId <= 0 || !textareaEl) {
      return;
    }

    const body = textareaEl.value.trim();

    if (!body) {
      setReplyMessage(replyForm, '댓글 내용을 입력해줘.', 'is-error');
      textareaEl.focus();
      return;
    }

    if (body.length > 500) {
      setReplyMessage(replyForm, '댓글은 500자 이하로 입력해줘.', 'is-error');
      textareaEl.focus();
      return;
    }

    const user = await getCurrentUser();
    if (!user) {
      alert('로그인이 필요해.');
      return;
    }

    setReplyMessage(replyForm, '댓글 등록 중...');
    if (submitBtn) submitBtn.disabled = true;

    const payload = {
      suggestion_id: suggestionId,
      body,
      author_id: user.id,
      author_nickname: getDisplayName(user),
    };

    const { error } = await supabase
      .from('suggestion_admin_comments')
      .insert(payload);

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      console.error('[suggestions-board] insert admin reply failed:', error);
      setReplyMessage(replyForm, '댓글 등록에 실패했어.', 'is-error');
      return;
    }

    textareaEl.value = '';
    setReplyMessage(replyForm, '댓글이 등록됐어.', 'is-success');
    await refreshAll({ keepPage: true });
  });

  pagerEl.addEventListener('click', (e) => {
    const pageBtn = e.target.closest('[data-page]');
    if (pageBtn) {
      const nextPage = Number(pageBtn.dataset.page || 1);
      if (Number.isFinite(nextPage) && nextPage > 0) {
        state.page = nextPage;
        render();
      }
      return;
    }

    if (e.target.closest('#suggestionPrevBtn')) {
      if (state.page > 1) {
        state.page -= 1;
        render();
      }
      return;
    }

    if (e.target.closest('#suggestionNextBtn')) {
      const totalPages = Math.max(
        1,
        Math.ceil(state.suggestions.length / PER_PAGE),
      );

      if (state.page < totalPages) {
        state.page += 1;
        render();
      }
    }
  });

  await refreshAll({ keepPage: false });
}
