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

function sortForFeatured(posts) {
  return [...posts].sort((a, b) => {
    if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    }

    const bv = getViews(b);
    const av = getViews(a);
    if (bv !== av) return bv - av;

    const bt = new Date(b.createdAt || b.date || 0).getTime();
    const at = new Date(a.createdAt || a.date || 0).getTime();
    if (bt !== at) return bt - at;

    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function renderCardGrid(posts, gridEl) {
  gridEl.innerHTML = posts
    .map(
      (p) => `
      <a href="${p.url}" class="card" data-id="${p.id}" data-views="${getViews(p)}">
        <article class="card__body">
          ${p.pinned ? `<span class="badge">📌</span>` : ''}

          <h3 class="card__title">${getTitle(p)}</h3>

          <p class="card__desc">${p.excerpt ?? ''}</p>

          <div class="card__meta">
            <span class="chip chip--muted">${formatMMDD(p.date)}</span>
            <span class="chip chip--muted">👀 ${getViews(p)}</span>
            <span class="chip">${p.category}</span>
          </div>
        </article>
      </a>
    `,
    )
    .join('');
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
  const gridEl = document.querySelector('#cardGrid');
  const latestEl = document.querySelector('#latestList');

  if (!gridEl && !latestEl) return;

  const pageCategory = getPageCategory();

  let allPosts = [];
  try {
    allPosts = await loadPosts();
  } catch (error) {
    console.error('[posts-ui] loadPosts failed:', error);

    if (gridEl) {
      gridEl.innerHTML = `<div class="empty">주요 업데이트를 불러오지 못했어.</div>`;
    }

    if (latestEl) {
      latestEl.innerHTML = `<div class="empty">최신 업로드를 불러오지 못했어.</div>`;
    }

    return;
  }

  const scoped = scopePosts(allPosts, pageCategory);
  const featured = sortForFeatured(scoped).slice(0, 8);
  const latest = sortByDateDesc(scoped).slice(0, 8);

  if (gridEl) {
    renderCardGrid(featured, gridEl);
  }

  if (latestEl) {
    renderLatestList(latest, latestEl);
  }
}
