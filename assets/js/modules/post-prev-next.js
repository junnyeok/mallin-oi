import { loadPosts, sortByDateDesc } from './posts-repo.js';

function isMobile() {
  return window.innerWidth <= 768;
}

function truncateText(text, maxLength) {
  const value = String(text || '').trim();
  if (!value) return '';
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}…`;
}

function setDisabledLink(el, label) {
  if (!el) return;

  el.href = '#';
  el.setAttribute('aria-disabled', 'true');

  el.innerHTML = `
    <span class="pager-label">${label}</span>
  `;

  el.removeAttribute('title');
}

function setEnabledLink(el, href, label, post) {
  if (!el) return;

  const mobile = isMobile();

  const title = mobile
    ? truncateText(post?.title, 18)
    : truncateText(post?.title, 26);

  el.href = href;
  el.setAttribute('aria-disabled', 'false');
  el.title = post?.title || '';

  // ✅ 모바일: 2줄 / PC: 1줄
  if (mobile) {
    el.innerHTML = `
      <span class="pager-label">${label}</span>
      <span class="pager-title">${title}</span>
    `;
  } else {
    el.innerHTML = `
      <span class="pager-label">${label}</span>
      <span class="pager-title-inline"> | ${title}</span>
    `;
  }

  el.addEventListener(
    'click',
    () => {
      try {
        sessionStorage.setItem(`viewFromList:${post.id}`, '1');
      } catch {}
    },
    { once: true },
  );
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

  // 🔥 리사이즈 대응
  window.addEventListener('resize', render);
}
