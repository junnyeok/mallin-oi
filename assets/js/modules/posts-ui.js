let postsRepoModule = null;
let postViewsModule = null;

function getRuntimeVersion() {
  return encodeURIComponent(String(window.__SITE_VERSION__ || 'dev').trim());
}

function importVersioned(path) {
  return import(`${path}?v=${getRuntimeVersion()}`);
}

async function ensurePostsUiDeps() {
  if (postsRepoModule && postViewsModule) return;

  [postsRepoModule, postViewsModule] = await Promise.all([
    importVersioned('./posts-repo.js'),
    importVersioned('./post-views.js'),
  ]);
}

function getPageCategory() {
  return document.body.dataset.page || 'home';
}

function scopePosts(posts, pageCategory) {
  if (pageCategory === 'home') return posts;
  if (pageCategory === 'post') return posts;
  return posts.filter((p) => p.category === pageCategory);
}

function getViews(post) {
  return postViewsModule.getDisplayViews(post);
}

function getTitle(post) {
  return `${post.isPrivate ? '🔒 ' : ''}${post.title}`;
}

function getAuthorNickname(post) {
  return String(post?.authorNickname || '익명').trim() || '익명';
}

function getCommentCount(post) {
  return Number(post?.commentCount || 0);
}

function getReactionCount(post) {
  return Number(post?.totalReactionsCount || 0);
}

function getCategoryLabel(category) {
  const map = {
    study: 'study',
    work: 'work',
    event: 'event',
    career: 'career',
  };

  return map[String(category || '').toLowerCase()] || 'study';
}

function renderLatestList(posts, listEl) {
  listEl.innerHTML = posts
    .map(
      (p) => `
      <a
        class="mini__row"
        href="${p.url}"
        data-id="${p.id}"
        data-views="${getViews(p)}"
      >
        <span class="mini__title">${getTitle(p)}</span>
        <span class="mini__meta">
          ${postsRepoModule.formatMMDD(p.date)} · ${getAuthorNickname(p)} · 👀 ${getViews(p)} · 👍 ${getReactionCount(p)} · 💬 ${getCommentCount(p)} · ${getCategoryLabel(p.category)}
        </span>
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
    await ensurePostsUiDeps();
    allPosts = await postsRepoModule.loadPosts();
  } catch (error) {
    console.error('[posts-ui] loadPosts failed:', error);
    latestEl.innerHTML = `<div class="empty">최신 업로드를 불러오지 못했어.</div>`;
    return;
  }

  const scoped = scopePosts(allPosts, pageCategory);
  const latest = postsRepoModule.sortByDateDesc(scoped).slice(0, 12);

  renderLatestList(latest, latestEl);
}
