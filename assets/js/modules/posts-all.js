import { loadPosts, sortByDateDesc, formatMMDD } from './posts-repo.js';
import { getDisplayViews } from './post-views.js';

const PER_PAGE = 10;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getViews(post) {
  return getDisplayViews(post);
}

function getCommentCount(post) {
  return Number(post?.commentCount || 0);
}

function getReactionCount(post) {
  return Number(post?.totalReactionsCount || 0);
}

function getAuthorNickname(post) {
  return String(post?.authorNickname || '익명').trim() || '익명';
}

function normalizeSearchType(raw) {
  const type = String(raw || 'title')
    .trim()
    .toLowerCase();
  if (type === 'tag') return 'tag';
  if (type === 'author') return 'author';
  return 'title';
}

function getState() {
  const sp = new URLSearchParams(window.location.search);
  const tab = (sp.get('tab') || 'all').toLowerCase();
  const q = (sp.get('q') || '').trim();
  const type = normalizeSearchType(sp.get('type') || 'title');
  const page = Math.max(1, Number(sp.get('page') || 1));

  return { tab, q, type, page };
}

function setState(nextState) {
  const sp = new URLSearchParams(window.location.search);

  if (nextState.tab && nextState.tab !== 'all') sp.set('tab', nextState.tab);
  else sp.delete('tab');

  if (nextState.q) sp.set('q', nextState.q);
  else sp.delete('q');

  if (nextState.type && nextState.type !== 'title') {
    sp.set('type', nextState.type);
  } else {
    sp.delete('type');
  }

  if (nextState.page > 1) sp.set('page', String(nextState.page));
  else sp.delete('page');

  const query = sp.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash || ''}`;
  window.history.replaceState({}, '', nextUrl);
}

function filterPosts(posts, { tab, q, type }) {
  let scoped = posts;

  if (tab && tab !== 'all') {
    scoped = scoped.filter((post) => post.category === tab);
  }

  if (!q) return scoped;

  const query = q.toLowerCase();

  if (type === 'tag') {
    return scoped.filter((post) =>
      (post.tags || []).some((tag) =>
        String(tag || '')
          .toLowerCase()
          .includes(query),
      ),
    );
  }

  if (type === 'author') {
    return scoped.filter((post) =>
      getAuthorNickname(post).toLowerCase().includes(query),
    );
  }

  return scoped.filter((post) => {
    const title = String(post.title || '').toLowerCase();
    const excerpt = String(post.excerpt || '').toLowerCase();
    return title.includes(query) || excerpt.includes(query);
  });
}

function renderNoticeRow(post) {
  return `
    <a
      class="post-row post-row--pinned"
      href="${post.url}"
      data-id="${post.id}"
      data-views="${getViews(post)}"
    >
      <span class="post-row__title">
        ${escapeHtml(post.isPrivate ? `🔒 ${post.title}` : post.title)}
      </span>
      <span class="post-row__meta">
        ${formatMMDD(post.date)} · ${escapeHtml(getAuthorNickname(post))} · 👀 ${getViews(post)} · 👍 ${getReactionCount(post)} · 💬 ${getCommentCount(post)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

function renderRow(post) {
  return `
    <a
      class="post-row"
      href="${post.url}"
      data-id="${post.id}"
      data-views="${getViews(post)}"
    >
      <span class="post-row__title">
        ${escapeHtml(post.isPrivate ? `🔒 ${post.title}` : post.title)}
      </span>
      <span class="post-row__meta">
        ${formatMMDD(post.date)} · ${escapeHtml(getAuthorNickname(post))} · 👀 ${getViews(post)} · 👍 ${getReactionCount(post)} · 💬 ${getCommentCount(post)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

function syncTabs(activeTab) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    const tab = (btn.dataset.tab || 'all').toLowerCase();
    const active = tab === activeTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

export async function initPostsAll() {
  const rowsEl = $('postsAllRows');
  const noticeListEl = $('postsAllNoticeList');
  const prevBtn = $('postsAllPrevBtn');
  const nextBtn = $('postsAllNextBtn');
  const pageInfoEl = $('postsAllPageInfo');

  if (!rowsEl || !noticeListEl || !prevBtn || !nextBtn || !pageInfoEl) return;

  let allPosts = [];
  try {
    allPosts = await loadPosts();
  } catch (error) {
    console.error('[posts-all] loadPosts failed:', error);
    rowsEl.innerHTML = `<div class="empty">게시물을 불러오지 못했어.</div>`;
    noticeListEl.innerHTML = `<div class="empty">고정 게시물을 불러오지 못했어.</div>`;
    return;
  }

  const pinnedPosts = sortByDateDesc(allPosts.filter((post) => post.pinned));
  noticeListEl.innerHTML = pinnedPosts.length
    ? pinnedPosts.map(renderNoticeRow).join('')
    : `<div class="empty">고정 게시물이 없어.</div>`;

  let state = getState();

  function render() {
    syncTabs(state.tab);

    const filtered = sortByDateDesc(
      filterPosts(
        allPosts.filter((post) => !post.pinned),
        state,
      ),
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    const start = (state.page - 1) * PER_PAGE;
    const pagePosts = filtered.slice(start, start + PER_PAGE);

    rowsEl.innerHTML = pagePosts.length
      ? pagePosts.map(renderRow).join('')
      : `<div class="empty">조건에 맞는 게시물이 없어.</div>`;

    pageInfoEl.textContent = `${state.page} / ${totalPages}`;
    prevBtn.disabled = state.page <= 1;
    nextBtn.disabled = state.page >= totalPages;

    setState(state);
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = (btn.dataset.tab || 'all').toLowerCase();
      state.page = 1;
      render();
    });
  });

  prevBtn.addEventListener('click', () => {
    if (state.page <= 1) return;
    state.page -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const filtered = filterPosts(
      allPosts.filter((post) => !post.pinned),
      state,
    );
    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    if (state.page >= totalPages) return;
    state.page += 1;
    render();
  });

  window.addEventListener('popstate', () => {
    state = getState();
    render();
  });

  render();
}
