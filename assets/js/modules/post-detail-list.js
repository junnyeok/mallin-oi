// assets/js/modules/post-detail-list.js
import { loadPosts, sortByDateDesc, formatMMDD } from './posts-repo.js';
import { getDisplayViews } from './post-views.js';

function getViews(post) {
  return getDisplayViews(post);
}

function getCommentCount(post) {
  return Number(post?.commentCount || 0);
}

function renderRow(p) {
  return `
    <a
      class="post-row"
      href="${p.url}"
      data-id="${p.id}"
      data-views="${getViews(p)}"
    >
      <span class="post-row__title">${p.title}</span>
      <span class="post-row__meta">
        ${formatMMDD(p.date)} · 👀 ${getViews(p)} · 💬 ${getCommentCount(p)} · ${p.category}
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

  const source = sortByDateDesc(posts).filter(
    (p) => Number(p.id) !== currentId,
  );

  const PER_PAGE = 5;
  let page = 1;

  function render() {
    const totalPages = Math.max(1, Math.ceil(source.length / PER_PAGE));
    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    const start = (page - 1) * PER_PAGE;
    const pagePosts = source.slice(start, start + PER_PAGE);

    listEl.innerHTML =
      pagePosts.length === 0
        ? `<div class="empty">다른 게시물이 없어.</div>`
        : pagePosts.map(renderRow).join('');

    pageInfo.textContent = `${page} / ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  }

  prevBtn.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(source.length / PER_PAGE));
    if (page >= totalPages) return;
    page += 1;
    render();
  });

  render();
}
