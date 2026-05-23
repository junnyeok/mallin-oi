import { loadPosts, sortByDateDesc } from './posts-repo.js';

function truncateText(text, maxLength) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function getTitleLimit() {
  return window.innerWidth <= 768 ? 10 : 26;
}

function setDisabledLink(el, label) {
  if (!el) return;

  el.href = '#';
  el.setAttribute('aria-disabled', 'true');
  el.removeAttribute('title');

  el.innerHTML = `
    <span class="pager-label">${label}</span>
  `;
}

function setEnabledLink(el, href, label, post) {
  if (!el) return;

  const title = truncateText(post?.title, getTitleLimit());

  el.href = href;
  el.setAttribute('aria-disabled', 'false');
  el.title = post?.title || '';

  el.innerHTML = `
    <span class="pager-label">${label}</span>
    <span class="pager-sep" aria-hidden="true"> | </span>
    <span class="pager-title">${title}</span>
  `;

  el.onclick = null;
}

export async function initPostPrevNext() {
  const prevBtn = document.getElementById('postPrevBtn');
  const nextBtn = document.getElementById('postNextBtn');

  if (!prevBtn || !nextBtn) return;

  const sp = new URLSearchParams(window.location.search);
  const currentId = Number(sp.get('id') || 0);
  if (!currentId) return;

  let posts = [];
  try {
    posts = await loadPosts();
  } catch (e) {
    console.error('[post-prev-next] load failed:', e);
    return;
  }

  const ordered = sortByDateDesc(posts);
  const idx = ordered.findIndex((p) => Number(p.id) === currentId);
  if (idx < 0) return;

  const prevPost = ordered[idx - 1] || null;
  const nextPost = ordered[idx + 1] || null;

  function render() {
    if (prevPost) {
      setEnabledLink(prevBtn, prevPost.url, '← 이전글', prevPost);
    } else {
      setDisabledLink(prevBtn, '← 이전글');
    }

    if (nextPost) {
      setEnabledLink(nextBtn, nextPost.url, '다음글 →', nextPost);
    } else {
      setDisabledLink(nextBtn, '다음글 →');
    }
  }

  render();
  window.addEventListener('resize', render);
}
