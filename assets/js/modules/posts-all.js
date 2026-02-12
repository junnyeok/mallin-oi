/* =================================================
   posts-all.js
   전체보기 페이지 전용
   - pinned(고정)
   - 탭 필터 (URL query)
   - 페이지네이션
================================================= */

/* ================= 조회수(localStorage) ================= */

const VIEWS_KEY = 'viewsMap_v1';

function readViewsMap() {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY)) || {};
  } catch {
    return {};
  }
}

function getCombinedViews(post) {
  const base = post.views || 0;
  const map = readViewsMap();
  const extra = map[post.id] || 0;
  return base + extra;
}

/* ================= 유틸 ================= */

function formatMMDD(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

function sortByDateDesc(posts) {
  return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
}

/* ================= URL 상태 ================= */

const ALLOWED_TABS = new Set(['all', 'study', 'work', 'event', 'career']);

function normalizeTab(tab) {
  if (!tab) return 'all';
  const t = String(tab).trim().toLowerCase();
  return ALLOWED_TABS.has(t) ? t : 'all';
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
  };
}

function setState(tab, page) {
  const safeTab = normalizeTab(tab);
  const safePage = normalizePage(page);

  const sp = new URLSearchParams();
  sp.set('tab', safeTab);

  // page=1은 굳이 URL에 안남겨도 깔끔해서 제거(원하면 이 블록 통째로 지워도 됨)
  if (safePage > 1) sp.set('page', String(safePage));

  history.pushState(null, '', `${location.pathname}?${sp.toString()}`);
}

/* ================= 데이터 로드 ================= */

async function loadPosts() {
  const res = await fetch('/assets/data/posts.json');
  if (!res.ok) throw new Error('posts.json load fail');
  return res.json();
}

/* ================= 렌더 ================= */

function renderRow(p) {
  return `
    <a class="post-row" href="${p.url}">
      <span class="post-row__title">${p.title}</span>
      <span class="post-row__meta">
        ${formatMMDD(p.date)} · 👀 ${getCombinedViews(p)} · ${p.category}
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

  // ❗ 이 페이지가 아니면 조용히 종료
  if (!pinnedEl || !listEl) return;

  const PER_PAGE = 10;
  const allPosts = await loadPosts();

  function render() {
    const { tab, page } = getState();
    const category = tab === 'all' ? null : tab;

    // 탭 UI
    tabBtns.forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active);
    });

    // 🔒 고정(pinned)
    const pinnedPosts = sortByDateDesc(
      allPosts.filter((p) => p.pinned && (!category || p.category === category))
    );

    pinnedEl.innerHTML =
      pinnedPosts.length === 0
        ? `<div class="empty">고정된 글이 없어.</div>`
        : pinnedPosts.map(renderRow).join('');

    // 📚 일반 목록
    const filtered = sortByDateDesc(
      allPosts.filter((p) => !category || p.category === category)
    );

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const safePage = Math.min(page, totalPages);

    const start = (safePage - 1) * PER_PAGE;
    const pagePosts = filtered.slice(start, start + PER_PAGE);

    listEl.innerHTML =
      pagePosts.length === 0
        ? `<div class="empty">게시물이 없어.</div>`
        : pagePosts.map(renderRow).join('');

    pagerInfo.textContent = `${safePage} / ${totalPages}`;
    btnPrev.disabled = safePage <= 1;
    btnNext.disabled = safePage >= totalPages;

    // 주소창 page가 범위 밖이면 바로 정리
    if (safePage !== page) {
      setState(tab, safePage);
    }
  }

  /* ================= 이벤트 ================= */

  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      setState(btn.dataset.tab, 1);
      render();
    });
  });

  btnPrev.addEventListener('click', () => {
    const { tab, page } = getState();
    if (page > 1) {
      setState(tab, page - 1);
      render();
    }
  });

  btnNext.addEventListener('click', () => {
    const { tab, page } = getState();
    setState(tab, page + 1);
    render();
  });

  window.addEventListener('popstate', render);

  // ✅ 처음 진입 시 tab/page가 이상하면 URL도 한 번 정리해주기(선택사항인데 꽤 유용함)
  const init = getState();
  setState(init.tab, init.page);

  render();
}
