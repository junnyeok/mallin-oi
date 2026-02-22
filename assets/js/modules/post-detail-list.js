// assets/js/modules/post-detail-list.js
/* =================================================
  post-detail-list.js
  상세 게시물 하단: 다른 게시물 목록(10개) + 페이지네이션
  - posts-all.js 스타일/로직 느낌 유지
  - detailPostList 컨테이너는 <div class="posts-all__rows" id="detailPostList"></div> 기준
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

function getIdNum(id) {
  const m = String(id || '').match(/(\d+)/);
  return m ? Number(m[1]) : -1;
}

// ✅ pinned 먼저 + date 최신순 + (date 같으면) id 큰 게 먼저
function sortPinnedThenDateDesc(posts) {
  return [...posts].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (bp !== ap) return bp - ap;

    const bt = new Date(b.date).getTime();
    const at = new Date(a.date).getTime();
    if (bt !== at) return bt - at;

    const bn = getIdNum(b.id);
    const an = getIdNum(a.id);
    if (bn !== an) return bn - an;

    return String(b.title || '').localeCompare(String(a.title || ''), 'ko');
  });
}

/**
 * 상세페이지(/posts/...)에서 posts.json url을 안전하게 읽기
 */
function getPostsJsonUrl() {
  const inPostsFolder = location.pathname.includes('/posts/');
  return inPostsFolder
    ? '../assets/data/posts.json'
    : './assets/data/posts.json';
}

/**
 * 상세페이지에서 "다른 글" 링크를 안전하게 만들기
 */
function toDetailHref(url) {
  if (!url) return '#';
  const u = String(url).trim();

  if (/^(https?:)?\/\//i.test(u)) return u;
  if (/^(mailto:|tel:)/i.test(u)) return u;
  if (u.startsWith('#')) return u;

  if (u.startsWith('/posts/')) return `.${u.replace('/posts/', '/')}`;
  if (u.startsWith('posts/')) return `./${u.replace(/^posts\//, '')}`;
  if (u.startsWith('/')) return `..${u}`;

  return u;
}

/* ================= 렌더 ================= */

function renderRow(p) {
  const href = toDetailHref(p.url);
  const pinnedBadge = p.pinned
    ? `<span class="post-row__badge" aria-label="고정">고정</span>`
    : '';

  return `
    <a class="post-row" href="${href}">
      <span class="post-row__title">${pinnedBadge}${p.title}</span>
      <span class="post-row__meta">
        ${formatMMDD(p.date)} · 👀 ${getCombinedViews(p)} · ${p.category}
      </span>
    </a>
  `;
}

/* ================= 초기화 ================= */

export async function initPostDetailList() {
  const listEl = document.getElementById('detailPostList');
  const btnPrev = document.getElementById('detailPrevBtn');
  const btnNext = document.getElementById('detailNextBtn');
  const pageInfo = document.getElementById('detailPageInfo');

  if (!listEl || !btnPrev || !btnNext || !pageInfo) return;

  const PER_PAGE = 10;

  const currentId =
    document.body?.dataset?.postId ||
    (location.pathname.split('/').pop() || '').replace('.html', '');

  let allPosts = [];
  try {
    const res = await fetch(getPostsJsonUrl(), { cache: 'no-store' });
    if (!res.ok) throw new Error('posts.json load fail');
    allPosts = await res.json();
  } catch (e) {
    console.error(e);
    listEl.innerHTML = `<div class="post-detail-list__empty">posts.json을 불러오지 못했어.</div>`;
    pageInfo.textContent = `1 / 1`;
    btnPrev.disabled = true;
    btnNext.disabled = true;
    return;
  }

  const filtered = sortPinnedThenDateDesc(
    allPosts.filter((p) => (p.id || '') !== currentId)
  );

  let currentPage = 1;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));

  function render() {
    const safePage = Math.min(Math.max(1, currentPage), totalPages);
    currentPage = safePage;

    const start = (safePage - 1) * PER_PAGE;
    const pagePosts = filtered.slice(start, start + PER_PAGE);

    listEl.innerHTML =
      pagePosts.length === 0
        ? `<div class="post-detail-list__empty">표시할 게시물이 없어.</div>`
        : pagePosts.map(renderRow).join('');

    pageInfo.textContent = `${safePage} / ${totalPages}`;
    btnPrev.disabled = safePage <= 1;
    btnNext.disabled = safePage >= totalPages;
  }

  btnPrev.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      render();
    }
  });

  btnNext.addEventListener('click', () => {
    if (currentPage < totalPages) {
      currentPage++;
      render();
    }
  });

  render();
}
