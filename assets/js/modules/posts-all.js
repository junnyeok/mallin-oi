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

/**
 * GitHub Pages(프로젝트 페이지)에서도 안전하게 링크를 만들기 위한 보정
 * - p.url이 "/posts/p001.html" 같이 슬래시로 시작하면,
 *   현재 origin 기준 절대경로로 만들어진다(프로젝트 repo에서 깨짐)
 * - 그래서 "./posts/p001.html" 형태로 바꿔준다.
 */
function toRelativeUrl(url) {
  if (!url) return '#';
  const u = String(url).trim();

  // 이미 http(s) / mailto / tel / hash면 그대로
  if (/^(https?:)?\/\//i.test(u)) return u;
  if (/^(mailto:|tel:)/i.test(u)) return u;
  if (u.startsWith('#')) return u;

  // "/posts/..." -> "./posts/..."
  if (u.startsWith('/')) return `.${u}`;

  // 그 외("posts/...", "./posts/...")는 그대로
  return u;
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

  if (safePage > 1) sp.set('page', String(safePage));

  history.pushState(null, '', `${location.pathname}?${sp.toString()}`);
}

/* ================= 데이터 로드 ================= */

async function loadPosts() {
  // ✅ GitHub Pages에서도 안전한 상대경로 fetch
  // posts-all.html이 루트에 있으니 "./assets/..."가 가장 안전함
  const res = await fetch('./assets/data/posts.json', { cache: 'no-store' });
  if (!res.ok) throw new Error('posts.json load fail');
  return res.json();
}

/* ================= 렌더 ================= */

function renderRow(p) {
  const href = toRelativeUrl(p.url);

  return `
    <a class="post-row" href="${href}">
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

  let allPosts = [];
  try {
    allPosts = await loadPosts();
  } catch (e) {
    console.error(e);
    pinnedEl.innerHTML = `<div class="empty">posts.json을 불러오지 못했어.</div>`;
    listEl.innerHTML = `<div class="empty">경로(상대/절대)나 파일 위치를 확인해줘.</div>`;
    return;
  }

  function render() {
    const { tab, page } = getState();
    const category = tab === 'all' ? null : tab;

    // 탭 UI
    tabBtns.forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
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

  const init = getState();
  setState(init.tab, init.page);

  render();
}
