import { loadPosts, formatMMDD, sortByDateDesc } from './posts-repo.js';
import { getDisplayViews } from './post-views.js';

function getPageCategory() {
  return document.body.dataset.page || 'home';
}

function scopePosts(posts, pageCategory) {
  if (pageCategory === 'home') return posts;
  if (pageCategory === 'post') return posts;
  return posts.filter((p) => p.category === pageCategory);
}

function getViews(post) {
  return getDisplayViews(post);
}

function getTitle(post) {
  return `${post.isPrivate ? '🔒 ' : ''}${post.title}`;
}

function renderLatestList(posts, listEl) {
  listEl.innerHTML = posts
    .map(
      (p) => `
      <a class="mini__row" href="${p.url}" data-id="${p.id}" data-views="${getViews(p)}">
        <span class="mini__title">${getTitle(p)}</span>
        <span class="mini__date">${formatMMDD(p.date)}</span>
      </a>
    `,
    )
    .join('');
}

export async function initPostsUI() {
  const latestEl = document.querySelector('#latestList');

  if (!latestEl) return;

  const pageCategory = getPageCategory();

  let allPosts = [];
  try {
    allPosts = await loadPosts();
  } catch (error) {
    console.error('[posts-ui] loadPosts failed:', error);
    latestEl.innerHTML = `<div class="empty">최신 업로드를 불러오지 못했어.</div>`;
    return;
  }

  const scoped = scopePosts(allPosts, pageCategory);
  const latest = sortByDateDesc(scoped).slice(0, 12);

  renderLatestList(latest, latestEl);
}
