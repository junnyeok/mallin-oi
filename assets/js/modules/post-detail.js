// assets/js/modules/post-detail.js

/* ================= 조회수(localStorage) - posts-ui.js와 동일 ================= */

const VIEWS_KEY = 'viewsMap_v1';

function readViewsMap() {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeViewsMap(map) {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(map));
}

function bumpLocalView(id) {
  if (!id) return;
  const map = readViewsMap();
  map[id] = (map[id] || 0) + 1;
  writeViewsMap(map);
}

function getCombinedViews(post) {
  const base = post.views || 0;
  const map = readViewsMap();
  const extra = map[post.id] || 0;
  return base + extra;
}

/* ================= 상세페이지 중복 bump 방지(목록 클릭과 호환) ================= */

function wasViewFromList(id) {
  try {
    return sessionStorage.getItem(`viewFromList:${id}`) === '1';
  } catch {
    return false;
  }
}

function consumeViewFromList(id) {
  try {
    sessionStorage.removeItem(`viewFromList:${id}`);
  } catch {}
}

/* ================= 데이터 로드 ================= */

const DATA_BASE = new URL('../../data/', import.meta.url);

async function loadPosts() {
  const url = new URL('posts.json', DATA_BASE);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to load posts.json');
  return res.json();
}

/* ================= 렌더링 ================= */

function $(id) {
  return document.getElementById(id);
}

function renderTags(tags = []) {
  const wrap = $('postTags');
  if (!wrap) return;

  wrap.innerHTML = (tags || [])
    .map((t) => `<span class="tag">#${t}</span>`)
    .join('');
}

function renderAuthor(post) {
  const authorEl = $('postAuthor');
  if (!authorEl) return;

  const nickname = String(post.authorNickname || '').trim();
  const userId = String(post.authorId || '').trim();

  if (nickname) {
    authorEl.textContent = `작성자 : ${nickname}`;
    return;
  }

  if (userId) {
    authorEl.textContent = `작성자 : ${userId}`;
    return;
  }

  authorEl.textContent = '작성자 : 관리자';
}

/**
 * ✅ 상세 페이지 초기화
 * - body[data-post-id] 없으면 아무것도 안 하고 종료
 */
export async function initPostDetail() {
  const postId = document.body.dataset.postId;
  if (!postId) return;

  const posts = await loadPosts();
  const post = posts.find((p) => p.id === postId);

  if (!post) {
    const titleEl = $('postTitle');
    if (titleEl) titleEl.textContent = '게시물을 찾을 수 없음';
    return;
  }

  if (wasViewFromList(postId)) {
    consumeViewFromList(postId);
  } else {
    bumpLocalView(postId);
  }

  const titleEl = $('postTitle');
  const excerptEl = $('postExcerpt');
  const categoryEl = $('postCategory');
  const viewsEl = $('postViews');

  if (titleEl) titleEl.textContent = post.title || '';
  if (excerptEl) excerptEl.textContent = post.excerpt || '';
  if (categoryEl) categoryEl.textContent = post.category || '';
  if (viewsEl) viewsEl.textContent = `👀 ${getCombinedViews(post)}`;

  renderAuthor(post);
  renderTags(post.tags);

  document.title = `${post.title} | 말린오이닷컴`;
}

/**
 * ✅ 목록으로 / 뒤로가기 버튼
 */
export function initBackLink() {
  const backBtn = document.getElementById('postBack');
  if (!backBtn) return;

  backBtn.addEventListener('click', (e) => {
    e.preventDefault();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = '../index.html';
  });
}
