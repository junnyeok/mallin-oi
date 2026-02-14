/* =================================================
   posts-all.js
   전체보기 페이지 전용
   - pinned(고정)
   - 탭 필터 (URL query)
   - 검색(q) + 검색타입(type=title|tag)
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

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .trim();
}

/**
 * GitHub Pages(프로젝트 페이지)에서도 안전하게 링크를 만들기 위한 보정
 */
function toRelativeUrl(url) {
  if (!url) return '#';
  const u = String(url).trim();

  if (/^(https?:)?\/\//i.test(u)) return u;
  if (/^(mailto:|tel:)/i.test(u)) return u;
  if (u.startsWith('#')) return u;

  if (u.startsWith('/')) return `.${u}`;
  return u;
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

  // 검색
  if (safeType !== 'title') sp.set('type', safeType); // 기본값이면 굳이 안 넣어도 되게
  if (safeQ) sp.set('q', safeQ);

  // 페이지
  if (safePage > 1) sp.set('page', String(safePage));

  history.pushState(null, '', `${location.pathname}?${sp.toString()}`);
}

/* ================= 검색 매칭 ================= */

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

/* ================= 데이터 로드 ================= */

async function loadPosts() {
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

  // ✅ 검색폼(있으면 연결)
  const searchForm =
    document.getElementById('searchForm') ||
    document.querySelector('form.search');
  const searchInput =
    document.getElementById('q') || document.querySelector('input[name="q"]');

  // ✅ 제목/태그 토글 버튼(있으면 연결)
  const typeBtns = document.querySelectorAll('[data-type]');

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

  function applyFilters(posts, { tab, q, type }) {
    let list = filterByTab(posts, tab);

    // 검색 타입
    if (type === 'tag') list = list.filter((p) => matchTag(p, q));
    else list = list.filter((p) => matchTitle(p, q));

    return list;
  }

  function render() {
    const state = getState();
    const { tab, page, q, type } = state;

    // 탭 UI
    tabBtns.forEach((btn) => {
      const active = btn.dataset.tab === tab;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', String(active));
    });

    // 검색창 값 유지
    if (searchInput) searchInput.value = q || '';

    // ✅ 검색타입 버튼 UI 동기화
    if (typeBtns && typeBtns.length) {
      typeBtns.forEach((b) => {
        const active = b.dataset.type === type;
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }

    // 🔒 고정(pinned)도 동일한 필터 규칙 적용 (탭 + 검색)
    const pinnedBase = allPosts.filter((p) => p.pinned);
    const pinnedFiltered = sortByDateDesc(applyFilters(pinnedBase, state));

    pinnedEl.innerHTML =
      pinnedFiltered.length === 0
        ? `<div class="empty">고정된 글이 없어.</div>`
        : pinnedFiltered.map(renderRow).join('');

    // 📚 일반 목록(비고정)도 동일한 필터 규칙 적용
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

    // page 보정이 생기면 URL도 맞춰줌
    if (safePage !== page) {
      setState({ tab, page: safePage, q, type });
    }
  }

  /* ================= 이벤트 ================= */

  // 탭 클릭
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const s = getState();
      setState({ tab: btn.dataset.tab, page: 1, q: s.q, type: s.type });
      render();
    });
  });

  // 페이지네이션
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

  // ✅ 검색타입(제목/태그) 토글
  if (typeBtns && typeBtns.length) {
    typeBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const s = getState();
        setState({ tab: s.tab, page: 1, q: s.q, type: b.dataset.type });
        render();
      });
    });
  }

  // 검색 submit → page 1로 리셋 + q 반영
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

  // 초기 URL 정리(기본값 보정)
  const init = getState();
  setState(init);

  render();
}
