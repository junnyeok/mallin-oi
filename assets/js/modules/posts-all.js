import { loadPosts, sortByDateDesc, formatMMDD } from './posts-repo.js';
import { getDisplayViews } from './post-views.js';

const PER_PAGE = 10;
const PAGE_GROUP_SIZE = 5;
const FEATURED_LIMIT = 10;

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

function getLikeCount(post) {
  return Number(post?.likesCount || 0);
}

function getFreshCount(post) {
  return Number(post?.dislikesCount || 0);
}

function getReactionCount(post) {
  const likeCount = getLikeCount(post);
  const freshCount = getFreshCount(post);

  if (likeCount || freshCount) {
    return likeCount + freshCount;
  }

  return Number(post?.totalReactionsCount || 0);
}

function getFeaturedScore(post) {
  return (
    getViews(post) +
    getLikeCount(post) +
    getFreshCount(post) +
    getCommentCount(post)
  );
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

function normalizeTab(raw) {
  const tab = String(raw || 'all')
    .trim()
    .toLowerCase();

  return ['all', 'study', 'work', 'event', 'career'].includes(tab)
    ? tab
    : 'all';
}

function normalizeFeatured(raw) {
  const value = String(raw || '')
    .trim()
    .toLowerCase();

  return ['best', 'month', 'week', 'day'].includes(value) ? value : '';
}

function getState() {
  const sp = new URLSearchParams(window.location.search);

  const tab = normalizeTab(sp.get('tab') || sp.get('category') || 'all');
  const q = (sp.get('q') || '').trim();
  const type = normalizeSearchType(sp.get('type') || 'title');
  const page = Math.max(1, Number(sp.get('page') || 1));
  const featured = normalizeFeatured(sp.get('rank') || '');

  return { tab, q, type, page, featured };
}

function setState(nextState) {
  const sp = new URLSearchParams(window.location.search);

  if (nextState.tab && nextState.tab !== 'all') sp.set('tab', nextState.tab);
  else sp.delete('tab');

  sp.delete('category');

  if (nextState.q) sp.set('q', nextState.q);
  else sp.delete('q');

  if (nextState.type && nextState.type !== 'title') {
    sp.set('type', nextState.type);
  } else {
    sp.delete('type');
  }

  if (nextState.featured) {
    sp.set('rank', nextState.featured);
    sp.delete('page');
  } else {
    sp.delete('rank');

    if (nextState.page > 1) sp.set('page', String(nextState.page));
    else sp.delete('page');
  }

  const query = sp.toString();
  const nextUrl = `${window.location.pathname}${query ? `?${query}` : ''}${
    window.location.hash || ''
  }`;

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

function getPostTime(post) {
  const time = new Date(post?.createdAt || post?.date || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getTodayRange() {
  const now = new Date();

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0,
    0,
  );

  const end = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  return { start, end };
}

function getMonthRange() {
  const now = new Date();

  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  const end = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
    23,
    59,
    59,
    999,
  );

  return { start, end };
}

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + diffToMonday,
    0,
    0,
    0,
    0,
  );

  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
    23,
    59,
    59,
    999,
  );

  return { start, end };
}

function isPostInRange(post, range) {
  const time = getPostTime(post);
  return time >= range.start.getTime() && time <= range.end.getTime();
}

function getFeaturedPosts(posts, featured) {
  let scoped = posts;

  if (featured === 'month') {
    const range = getMonthRange();
    scoped = scoped.filter((post) => isPostInRange(post, range));
  }

  if (featured === 'week') {
    const range = getWeekRange();
    scoped = scoped.filter((post) => isPostInRange(post, range));
  }

  if (featured === 'day') {
    const range = getTodayRange();
    scoped = scoped.filter((post) => isPostInRange(post, range));
  }

  return [...scoped]
    .sort((a, b) => {
      const scoreDiff = getFeaturedScore(b) - getFeaturedScore(a);
      if (scoreDiff !== 0) return scoreDiff;

      const timeDiff = getPostTime(b) - getPostTime(a);
      if (timeDiff !== 0) return timeDiff;

      return Number(b.id || 0) - Number(a.id || 0);
    })
    .slice(0, FEATURED_LIMIT);
}

function getFeaturedEmptyMessage(featured) {
  if (featured === 'month') return '해당 기간의 주요게시물이 아직 없어.';
  if (featured === 'week') return '이번 주 주요게시물이 아직 없어.';
  if (featured === 'day') return '오늘의 주요게시물이 아직 없어.';
  return '주요게시물이 아직 없어.';
}

function renderNoticeRow(post) {
  return `
    <a class="post-row post-row--pinned" href="${post.url}" data-id="${post.id}" data-views="${getViews(post)}">
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
    <a class="post-row" href="${post.url}" data-id="${post.id}" data-views="${getViews(post)}">
      <span class="post-row__title">
        ${escapeHtml(post.isPrivate ? `🔒 ${post.title}` : post.title)}
      </span>
      <span class="post-row__meta">
        ${formatMMDD(post.date)} · ${escapeHtml(getAuthorNickname(post))} · 👀 ${getViews(post)} · 👍 ${getReactionCount(post)} · 💬 ${getCommentCount(post)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

function renderFeaturedRow(post, index) {
  return `
    <a class="post-row post-row--featured" href="${post.url}" data-id="${post.id}" data-views="${getViews(post)}">
      <span class="post-row__title">
        <span class="post-row__rank">${index + 1}</span>
        ${escapeHtml(post.isPrivate ? `🔒 ${post.title}` : post.title)}
      </span>
      <span class="post-row__meta">
        ${formatMMDD(post.date)} · ${escapeHtml(getAuthorNickname(post))} · 👀 ${getViews(post)} · 👍 ${getReactionCount(post)} · 💬 ${getCommentCount(post)} · ⭐ ${getFeaturedScore(post)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

function syncTabs(activeTab) {
  document.querySelectorAll('[data-tab]').forEach((btn) => {
    const tab = normalizeTab(btn.dataset.tab);
    const active = tab === activeTab;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

function syncFeaturedTabs(activeFeatured) {
  document.querySelectorAll('[data-featured]').forEach((btn) => {
    const featured = normalizeFeatured(btn.dataset.featured);
    const active = !!activeFeatured && featured === activeFeatured;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
}

function getPageGroup(page) {
  const groupIndex = Math.floor((page - 1) / PAGE_GROUP_SIZE);
  const startPage = groupIndex * PAGE_GROUP_SIZE + 1;
  const endPage = startPage + PAGE_GROUP_SIZE - 1;

  return { startPage, endPage };
}

export async function initPostsAll() {
  const rowsEl = $('postsAllRows');
  const noticeListEl = $('postsAllNoticeList');
  const prevBtn = $('postsAllPrevBtn');
  const nextBtn = $('postsAllNextBtn');
  const pageNumbersEl = $('postsAllPageNumbers');
  const pagerEl = document.querySelector('.posts-all__pager');

  if (!rowsEl || !noticeListEl || !prevBtn || !nextBtn || !pageNumbersEl) {
    return;
  }

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

  function getFilteredPosts() {
    return sortByDateDesc(
      filterPosts(
        allPosts.filter((post) => !post.pinned),
        state,
      ),
    );
  }

  function renderPager(totalPages) {
    if (state.featured) {
      if (pagerEl) pagerEl.hidden = true;
      pageNumbersEl.innerHTML = '';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    if (pagerEl) pagerEl.hidden = false;

    const { startPage, endPage } = getPageGroup(state.page);
    const visibleEndPage = Math.min(endPage, totalPages);

    const pageButtons = [];

    for (let page = startPage; page <= visibleEndPage; page += 1) {
      const active = page === state.page;

      pageButtons.push(`
        <button
          type="button"
          class="posts-all__page-btn ${active ? 'is-active' : ''}"
          data-page="${page}"
          aria-label="${page}페이지로 이동"
          aria-current="${active ? 'page' : 'false'}"
        >
          ${page}
        </button>
      `);
    }

    pageNumbersEl.innerHTML = pageButtons.join('');

    prevBtn.disabled = startPage <= 1;
    nextBtn.disabled = visibleEndPage >= totalPages;

    pageNumbersEl.querySelectorAll('[data-page]').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.page = Number(btn.dataset.page || 1);
        render();
      });
    });
  }

  function renderFeatured() {
    const filtered = filterPosts(
      allPosts.filter((post) => !post.pinned),
      state,
    );

    const featuredPosts = getFeaturedPosts(filtered, state.featured);

    rowsEl.innerHTML = featuredPosts.length
      ? featuredPosts
          .map((post, index) => renderFeaturedRow(post, index))
          .join('')
      : `<div class="empty">${getFeaturedEmptyMessage(state.featured)}</div>`;

    renderPager(1);
  }

  function renderNormalList() {
    const filtered = getFilteredPosts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

    if (state.page > totalPages) state.page = totalPages;
    if (state.page < 1) state.page = 1;

    const start = (state.page - 1) * PER_PAGE;
    const pagePosts = filtered.slice(start, start + PER_PAGE);

    rowsEl.innerHTML = pagePosts.length
      ? pagePosts.map(renderRow).join('')
      : `<div class="empty">조건에 맞는 게시물이 없어.</div>`;

    renderPager(totalPages);
  }

  function render() {
    syncTabs(state.tab);
    syncFeaturedTabs(state.featured);

    if (state.featured) {
      renderFeatured();
    } else {
      renderNormalList();
    }

    setState(state);
  }

  document.querySelectorAll('[data-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = normalizeTab(btn.dataset.tab);
      state.featured = '';
      state.page = 1;
      render();
    });
  });

  document.querySelectorAll('[data-featured]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const selected = normalizeFeatured(btn.dataset.featured);

      state.featured = state.featured === selected ? '' : selected;
      state.page = 1;

      render();
    });
  });

  prevBtn.addEventListener('click', () => {
    if (state.featured) return;

    const { startPage } = getPageGroup(state.page);
    if (startPage <= 1) return;

    state.page = Math.max(1, startPage - 1);
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (state.featured) return;

    const filtered = getFilteredPosts();
    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const { endPage } = getPageGroup(state.page);

    if (endPage >= totalPages) return;

    state.page = Math.min(totalPages, endPage + 1);
    render();
  });

  window.addEventListener('popstate', () => {
    state = getState();
    render();
  });

  render();
}
