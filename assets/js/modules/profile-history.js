import { supabase } from './supabase-client.js';
import { loadPostsByAuthorId } from './posts-repo.js';
import { getCurrentUser, loginHref } from './auth-store.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { renderTextWithEmoticons } = await import(
  `./emoticons.js?v=${MODULE_VERSION}`
);

const PAGE_SIZE = 5;

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

function formatDateTime(dateStr) {
  if (!dateStr) return '-';

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';

  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(
    2,
    '0',
  )}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function trimCommentPreview(text, max = 100) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '(내용 없음)';

  const parts = clean.split(/(\[emo:[a-z0-9-]+\])/gi).filter(Boolean);

  let result = '';
  let length = 0;
  let truncated = false;

  for (const part of parts) {
    const isToken = /^\[emo:[a-z0-9-]+\]$/i.test(part);
    const unitLength = isToken ? 2 : part.length;

    if (length + unitLength > max) {
      if (!isToken) {
        const remain = Math.max(0, max - length);
        if (remain > 0) {
          result += part.slice(0, remain);
        }
      }
      truncated = true;
      break;
    }

    result += part;
    length += unitLength;
  }

  return truncated ? `${result}...` : result;
}

function getQueryTab() {
  const sp = new URLSearchParams(window.location.search);
  const tab = String(sp.get('tab') || 'all')
    .trim()
    .toLowerCase();
  return ['all', 'pickle', 'post', 'comment'].includes(tab) ? tab : 'all';
}

function renderPickleRow(entry) {
  const amount = Number(entry?.amount || 0);
  const amountText = amount > 0 ? `+${amount} 피클` : `${amount} 피클`;
  const reasonLabel = entry?.reason_label || '피클 내역';
  const description = entry?.description || '피클 내역이야.';

  return `
    <div class="history-row">
      <div class="history-row__main">
        <div class="history-row__title">${escapeHtml(reasonLabel)}</div>
        <div class="history-row__body">${escapeHtml(description)}</div>
      </div>
      <div class="history-row__side">
        <span class="history-row__amount">${escapeHtml(amountText)}</span>
        <span class="history-row__meta">${formatDateTime(entry?.created_at)}</span>
      </div>
    </div>
  `;
}

function renderPostRow(post) {
  return `
    <a class="history-row" href="${post.url}">
      <div class="history-row__main">
        <div class="history-row__title">${escapeHtml(post.title)}</div>
        <div class="history-row__body">${escapeHtml(post.excerpt || '(요약 없음)')}</div>
      </div>
      <span class="history-row__meta">
        ${formatDateTime(post.createdAt || post.date)}<br />
        ${escapeHtml(post.category || '-')}
      </span>
    </a>
  `;
}

function renderCommentRow(comment, postMap) {
  const post = postMap.get(Number(comment.post_id));
  const postTitle = post?.title || `게시물 #${comment.post_id}`;
  const postCategory = post?.category || '-';
  const postUrl = `./post.html?id=${encodeURIComponent(comment.post_id)}`;
  const isPrivatePost = !!post?.is_private;

  const preview = isPrivatePost
    ? '비밀 게시글의 댓글은 프로필에서 내용이 표시되지 않아.'
    : trimCommentPreview(comment.body);

  return `
    <a class="history-row" href="${postUrl}">
      <div class="history-row__main">
        <div class="history-row__title">${escapeHtml(postTitle)}</div>
        <div class="history-row__body">
          ${renderTextWithEmoticons(preview, {
            imageClass: 'inline-emoticon inline-emoticon--compact',
          })}
        </div>
      </div>
      <span class="history-row__meta">
        ${formatDateTime(comment.created_at)}<br />
        ${escapeHtml(postCategory)}
      </span>
    </a>
  `;
}

async function loadPickleLedger(userId) {
  const { data, error } = await supabase
    .from('pickle_ledger')
    .select(
      'id, amount, reason_code, reason_label, description, source_post_id, source_comment_id, awarded_on, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function loadCommentsWithPostsByAuthorId(userId) {
  const { data: comments, error } = await supabase
    .from('post_comments')
    .select('id, post_id, body, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const postIds = Array.from(
    new Set(
      (comments || []).map((item) => Number(item.post_id)).filter(Boolean),
    ),
  );

  let postRows = [];
  if (postIds.length) {
    const { data, error: postError } = await supabase
      .from('posts')
      .select('id, title, category, is_private')
      .in('id', postIds);

    if (postError) throw postError;
    postRows = data || [];
  }

  return {
    comments: comments || [],
    postMap: new Map(postRows.map((post) => [Number(post.id), post])),
  };
}

function applyTab(tab) {
  const tabs = document.querySelectorAll('[data-history-tab]');
  const panels = document.querySelectorAll('[data-history-panel]');

  tabs.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.historyTab === tab);
  });

  panels.forEach((panel) => {
    const panelTab = panel.dataset.historyPanel;
    const isVisible = tab === 'all' || panelTab === tab;
    panel.classList.toggle('is-hidden', !isVisible);
  });
}

function getSelectedDateValue(dateInput) {
  return String(dateInput?.value || '').trim();
}

function filterByDate(items, getDateValue, selectedDate) {
  if (!selectedDate) return items;

  return items.filter(
    (item) => formatDateOnly(getDateValue(item)) === selectedDate,
  );
}

function paginateItems(items, page, pageSize = PAGE_SIZE) {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const end = start + pageSize;

  return {
    totalPages,
    currentPage,
    pagedItems: items.slice(start, end),
  };
}

function getPagerNumbers(totalPages, currentPage) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5];
  }

  if (currentPage >= totalPages - 3) {
    return [
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    currentPage - 2,
    currentPage - 1,
    currentPage,
    currentPage + 1,
    currentPage + 2,
  ];
}

function getOrCreatePager(listEl, type) {
  if (!listEl) return null;

  let pagerEl = listEl.nextElementSibling;
  if (pagerEl && pagerEl.classList.contains('history-pager')) {
    return pagerEl;
  }

  pagerEl = document.createElement('nav');
  pagerEl.className = 'history-pager';
  pagerEl.setAttribute('aria-label', `${type} 페이지 이동`);
  listEl.insertAdjacentElement('afterend', pagerEl);
  return pagerEl;
}

function renderEmpty(listEl, pagerEl, emptyText) {
  if (listEl) {
    listEl.innerHTML = `<div class="history-empty">${emptyText}</div>`;
  }
  if (pagerEl) {
    pagerEl.innerHTML = '';
    pagerEl.hidden = true;
  }
}

function renderPager(pagerEl, currentPage, totalPages, onPageChange) {
  if (!pagerEl) return;

  if (totalPages <= 1) {
    pagerEl.innerHTML = '';
    pagerEl.hidden = true;
    return;
  }

  const pageNumbers = getPagerNumbers(totalPages, currentPage);

  pagerEl.hidden = false;
  pagerEl.innerHTML = `
    <button
      type="button"
      class="history-pager__btn"
      data-history-page-action="prev"
      ${currentPage <= 1 ? 'disabled' : ''}
    >
      이전
    </button>

    <div class="history-pager__pages">
      ${pageNumbers
        .map(
          (pageNo) => `
            <button
              type="button"
              class="history-pager__btn history-pager__btn--page ${
                pageNo === currentPage ? 'is-active' : ''
              }"
              data-history-page-no="${pageNo}"
              aria-current="${pageNo === currentPage ? 'page' : 'false'}"
            >
              ${pageNo}
            </button>
          `,
        )
        .join('')}
    </div>

    <button
      type="button"
      class="history-pager__btn"
      data-history-page-action="next"
      ${currentPage >= totalPages ? 'disabled' : ''}
    >
      다음
    </button>
  `;

  pagerEl
    .querySelector('[data-history-page-action="prev"]')
    ?.addEventListener('click', () => onPageChange(currentPage - 1));

  pagerEl
    .querySelector('[data-history-page-action="next"]')
    ?.addEventListener('click', () => onPageChange(currentPage + 1));

  pagerEl.querySelectorAll('[data-history-page-no]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const pageNo = Number(btn.dataset.historyPageNo || 1);
      onPageChange(pageNo);
    });
  });
}

function renderSection({
  listEl,
  countEl,
  items,
  renderItem,
  emptyText,
  type,
  pageState,
  onPageChange,
}) {
  if (!listEl) return;

  const pagerEl = getOrCreatePager(listEl, type);

  if (countEl) {
    countEl.textContent = `${items.length}건`;
  }

  if (!items.length) {
    renderEmpty(listEl, pagerEl, emptyText);
    pageState[type] = 1;
    return;
  }

  const { totalPages, currentPage, pagedItems } = paginateItems(
    items,
    pageState[type] || 1,
  );

  pageState[type] = currentPage;

  listEl.innerHTML = pagedItems.map(renderItem).join('');

  renderPager(pagerEl, currentPage, totalPages, (nextPage) => {
    pageState[type] = nextPage;
    onPageChange();
  });
}

export async function initProfileHistory() {
  if (document.body?.dataset?.page !== 'profile-history') return;

  const currentUser = await getCurrentUser();

  if (!currentUser) {
    window.location.href = loginHref();
    return;
  }

  const dateInput = $('historyDate');
  const searchBtn = $('historySearchBtn');
  const resetBtn = $('historyResetBtn');
  const resultEl = $('historySearchResult');

  const pickleListEl = $('historyPickleList');
  const postListEl = $('historyPostList');
  const commentListEl = $('historyCommentList');

  const pickleCountEl = $('historyPickleCount');
  const postCountEl = $('historyPostCount');
  const commentCountEl = $('historyCommentCount');

  let activeTab = getQueryTab();
  let allPickles = [];
  let allPosts = [];
  let allComments = [];
  let commentPostMap = new Map();

  const pageState = {
    pickle: 1,
    post: 1,
    comment: 1,
  };

  function resetAllPages() {
    pageState.pickle = 1;
    pageState.post = 1;
    pageState.comment = 1;
  }

  function renderAll() {
    const selectedDate = getSelectedDateValue(dateInput);

    const filteredPickles = filterByDate(
      allPickles,
      (item) => item.created_at,
      selectedDate,
    );
    const filteredPosts = filterByDate(
      allPosts,
      (item) => item.createdAt || item.date,
      selectedDate,
    );
    const filteredComments = filterByDate(
      allComments,
      (item) => item.created_at,
      selectedDate,
    );

    renderSection({
      listEl: pickleListEl,
      countEl: pickleCountEl,
      items: filteredPickles,
      renderItem: renderPickleRow,
      emptyText: '해당 조건의 피클 내역이 없어.',
      type: 'pickle',
      pageState,
      onPageChange: renderAll,
    });

    renderSection({
      listEl: postListEl,
      countEl: postCountEl,
      items: filteredPosts,
      renderItem: renderPostRow,
      emptyText: '해당 조건의 글이 없어.',
      type: 'post',
      pageState,
      onPageChange: renderAll,
    });

    renderSection({
      listEl: commentListEl,
      countEl: commentCountEl,
      items: filteredComments,
      renderItem: (comment) => renderCommentRow(comment, commentPostMap),
      emptyText: '해당 조건의 댓글/답글이 없어.',
      type: 'comment',
      pageState,
      onPageChange: renderAll,
    });

    if (resultEl) {
      resultEl.textContent = selectedDate
        ? `${selectedDate} 기준으로 검색한 결과를 보여주고 있어.`
        : '전체 내역을 보여주고 있어.';
    }

    applyTab(activeTab);
  }

  try {
    const [pickles, posts, commentBundle] = await Promise.all([
      loadPickleLedger(currentUser.id),
      loadPostsByAuthorId(currentUser.id),
      loadCommentsWithPostsByAuthorId(currentUser.id),
    ]);

    allPickles = pickles;
    allPosts = posts;
    allComments = commentBundle.comments;
    commentPostMap = commentBundle.postMap;

    renderAll();
  } catch (error) {
    console.error('[profile-history] load failed:', error);

    if (resultEl) {
      resultEl.textContent = '내역을 불러오는 중 오류가 발생했어.';
    }

    renderEmpty(
      pickleListEl,
      getOrCreatePager(pickleListEl, 'pickle'),
      '피클 내역을 불러오지 못했어.',
    );
    renderEmpty(
      postListEl,
      getOrCreatePager(postListEl, 'post'),
      '글 내역을 불러오지 못했어.',
    );
    renderEmpty(
      commentListEl,
      getOrCreatePager(commentListEl, 'comment'),
      '댓글/답글 내역을 불러오지 못했어.',
    );
    return;
  }

  searchBtn?.addEventListener('click', () => {
    resetAllPages();
    renderAll();
  });

  resetBtn?.addEventListener('click', () => {
    if (dateInput) dateInput.value = '';
    resetAllPages();
    renderAll();
  });

  dateInput?.addEventListener('change', () => {
    resetAllPages();
    renderAll();
  });

  document.querySelectorAll('[data-history-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.historyTab || 'all';
      applyTab(activeTab);
    });
  });
}
