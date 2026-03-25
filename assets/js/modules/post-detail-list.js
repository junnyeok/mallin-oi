import { loadPosts, sortByDateDesc, formatMMDD } from './posts-repo.js';
import { getDisplayViews } from './post-views.js';

function getViews(post) {
  return getDisplayViews(post);
}

function getCommentCount(post) {
  return Number(post?.commentCount || 0);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderRow(post, currentId) {
  const isCurrent = Number(post?.id) === Number(currentId);

  return `
    <a
      class="post-row post-detail-row ${isCurrent ? 'is-current' : ''}"
      href="${post.url}"
      data-id="${post.id}"
      data-views="${getViews(post)}"
      ${isCurrent ? 'aria-current="page"' : ''}
    >
      <span class="post-detail-row__left">
        <span class="post-row__title post-detail-row__title">
          ${escapeHtml(post.isPrivate ? `🔒 ${post.title}` : post.title)}
          ${isCurrent ? '<span class="post-detail-row__badge">현재글</span>' : ''}
        </span>
      </span>

      <span class="post-row__meta post-detail-row__meta">
        ${formatMMDD(post.date)} · 👀 ${getViews(post)} · 💬 ${getCommentCount(post)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

export async function initPostDetailList() {
  const listEl = document.getElementById('detailPostList');
  const prevBtn = document.getElementById('detailPrevBtn');
  const nextBtn = document.getElementById('detailNextBtn');
  const pageInfo = document.getElementById('detailPageInfo');

  if (!listEl || !prevBtn || !nextBtn || !pageInfo) return;

  const sp = new URLSearchParams(window.location.search);
  const currentId = Number(sp.get('id') || 0);

  let posts = [];
  try {
    posts = await loadPosts();
  } catch (e) {
    console.error('[post-detail-list] load failed:', e);
    listEl.innerHTML = `<div class="empty">다른 게시물을 불러오지 못했어.</div>`;
    return;
  }

  const source = sortByDateDesc(posts);
  const PER_PAGE = 5;

  const currentIndex = source.findIndex((p) => Number(p.id) === currentId);
  let page = currentIndex >= 0 ? Math.floor(currentIndex / PER_PAGE) + 1 : 1;

  function render() {
    const safeTotalPages = Math.max(1, Math.ceil(source.length / PER_PAGE));

    if (page > safeTotalPages) page = safeTotalPages;
    if (page < 1) page = 1;

    const start = (page - 1) * PER_PAGE;
    const pagePosts = source.slice(start, start + PER_PAGE);

    listEl.innerHTML =
      pagePosts.length === 0
        ? `<div class="empty">게시물이 없어.</div>`
        : pagePosts.map((post) => renderRow(post, currentId)).join('');

    pageInfo.textContent = `${page} / ${safeTotalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= safeTotalPages;
  }

  prevBtn.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const safeTotalPages = Math.max(1, Math.ceil(source.length / PER_PAGE));
    if (page >= safeTotalPages) return;
    page += 1;
    render();
  });

  render();
}
