import { fillPostCommentCounts } from './posts-repo.js';

export function renderPostListCommentCount(post) {
  return `<span data-post-comment-count="${Number(post.id)}">${post.commentCount ?? '–'}</span>`;
}

export async function updatePostListCommentCounts(posts, ...containers) {
  if (!posts.some((post) => post.commentCount === null)) return;
  try {
    await fillPostCommentCounts(posts);
    const counts = new Map(posts.map((post) => [String(Number(post.id)), post.commentCount]));

    for (const container of containers) {
      if (!container.isConnected) continue;
      container.querySelectorAll('[data-post-comment-count]').forEach((element) => {
        const count = counts.get(element.dataset.postCommentCount);
        if (count != null) element.textContent = String(count);
      });
    }
  } catch (error) {
    console.warn('[post-list-counts] comment counts unavailable:', error);
  }
}
