import { loadPosts, formatMMDD, sortByDateDesc } from './posts-repo.js';
import { getDisplayViews } from './post-views.js';

/* ================= 유틸 ================= */

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .trim();
}

function getViews(post) {
  return getDisplayViews(post);
}

/* ================= URL 상태 ================= */

const ALLOWED_TABS = new Set(['all', 'study', 'work', 'event', 'career']);
const ALLOWED_TYPES = new Set(['title', 'tag']);

function normalizeTab(tab) {
  if (!tab) return 'all';
  const t = normalize(tab);
  return ALLOWED_TABS.has(t) ? t : 'all';
}

function normalizeType(type) {
  if (!type) return 'title';
  const t = normalize(type);
  return ALLOWED_TYPES.has(t) ? t : 'title';
}

function normalizePage(page) {
  const n = Number(page);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.floor(n));
}

function getState() {
  const sp = new URLSearchParams(location.search);
  return {
    tab: normalizeTab(sp.get('tab')),
    page: normalizePage(sp.get('page') || 1),
    q: (sp.get('q') || '').trim(),
    type: normalizeType(sp.get('type')),
  };
}

function setState({ tab, page, q, type }) {
  const safeTab = normalizeTab(tab);
  const safeType = normalizeType(type);
  const safePage = normalizePage(page);
  const safeQ = (q || '').trim();

  const sp = new URLSearchParams();
  sp.set('tab', safeTab);

  if (safeType !== 'title') sp.set('type', safeType);
  if (safeQ) sp.set('q', safeQ);
  if (safePage > 1) sp.set('page', String(safePage));

  history.pushState(null, '', `${location.pathname}?${sp.toString()}`);
}

/* ================= 검색 ================= */

function matchTitle(post, q) {
  if (!q) return true;
  return normalize(post.title).includes(normalize(q));
}

function matchTag(post, q) {
  if (!q) return true;
  const needle = normalize(q);
  const tags = Array.isArray(post.tags) ? post.tags : [];
  return tags.some((t) => normalize(t).includes(needle));
}

function filterByTab(posts, tab) {
  if (tab === 'all') return posts;
  return posts.filter((p) => (p.category || '') === tab);
}

/* ================= 렌더 ================= */

function renderRow(p) {
  return `
    <a class="post-row" href="${p.url}" data-id="${p.id}" data-views="${getViews(p)}">
      <span class="post-row__title">${p.title}</span>
      <span class="post-row__meta">
        ${formatMMDD(p.date)} · 👀 ${getViews(p)} · ${p.category}
      </span>
    </a>
  `;
}

/* ================= 초기화 ================= */

export async function initPostsAll() {
  const pinnedEl = document.getElementById('pinnedList');
  const listEl = document.getElementById('postsAllList');

  const tabBtns = document.querySelectorAll('[data-tab]');
  const btnPrev = document.getElementById('pagerPrev');
  const btnNext = document.getElementById('pagerNext');
  const pagerInfo = document.getElementById('pagerInfo');

  const searchForm =
    document.getElementById('searchForm') ||
    document.querySelector('form.search');
  const searchInput =
    document.getElementById('q') || document.querySelector('input[name="q"]');

  const typeBtns = document.querySelectorAll('[data-type]');

  if (!pinnedEl || !listEl) return;

  const PER_PAGE = 10;

  let allPosts = [];
  try {
    allPosts = await loadPosts();
  } catch (e) {
    console.error(e);
    pinnedEl.innerHTML = `<div class="empty">게시글을 불러오지 못했어.</div>`;
    listEl.innerHTML = `<div class="empty">Supabase 연결값과 RLS를 확인해줘.</div>`;
    return;
  }

  function applyFilters(posts, { tab, q, type }) {
    let list = filterByTab(posts, tab);

    if (type === 'tag') list = list.filter((p) => matchTag(p, q));
    else list = list.filter((p) => matchTitle(p, q));

    return list;
  }

  function render() {
    const state = getState();
    const { tab, page, q, type } = state;

    tabBtns.forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    if (searchInput) searchInput.value = q || '';

    if (typeBtns && typeBtns.length) {
      typeBtns.forEach((b) => {
        const active = b.dataset.type === type;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }

    const pinnedBase = allPosts.filter((p) => p.pinned);
    const pinnedFiltered = sortByDateDesc(applyFilters(pinnedBase, state));

    pinnedEl.innerHTML =
      pinnedFiltered.length === 0
        ? `<div class="empty">고정된 글이 없어.</div>`
        : pinnedFiltered.map(renderRow).join('');

    const normalBase = allPosts.filter((p) => !p.pinned);
    const filtered = sortByDateDesc(applyFilters(normalBase, state));

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const safePage = Math.min(page, totalPages);

    const start = (safePage - 1) * PER_PAGE;
    const pagePosts = filtered.slice(start, start + PER_PAGE);

    listEl.innerHTML =
      pagePosts.length === 0
        ? `<div class="empty">검색 결과가 없어.</div>`
        : pagePosts.map(renderRow).join('');

    pagerInfo.textContent = `${safePage} / ${totalPages}`;
    if (btnPrev) btnPrev.disabled = safePage <= 1;
    if (btnNext) btnNext.disabled = safePage >= totalPages;

    if (safePage !== page) {
      setState({ tab, page: safePage, q, type });
    }
  }

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = getState();
      setState({ tab: btn.dataset.tab, page: 1, q: s.q, type: s.type });
      render();
    });
  });

  if (btnPrev) {
    btnPrev.addEventListener('click', () => {
      const s = getState();
      if (s.page > 1) {
        setState({ tab: s.tab, page: s.page - 1, q: s.q, type: s.type });
        render();
      }
    });
  }

  if (btnNext) {
    btnNext.addEventListener('click', () => {
      const s = getState();
      setState({ tab: s.tab, page: s.page + 1, q: s.q, type: s.type });
      render();
    });
  }

  if (typeBtns && typeBtns.length) {
    typeBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const s = getState();
        setState({ tab: s.tab, page: 1, q: s.q, type: b.dataset.type });
        render();
      });
    });
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const s = getState();
      setState({
        tab: s.tab,
        page: 1,
        q: (searchInput.value || '').trim(),
        type: s.type,
      });
      render();
    });
  }

  window.addEventListener('popstate', render);

  const init = getState();
  setState(init);

  render();
}
