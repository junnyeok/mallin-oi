import { loadPosts, sortByDateDesc } from './posts-repo.js';

function setDisabledLink(el, text) {
  if (!el) return;
  el.href = '#';
  el.setAttribute('aria-disabled', 'true');
  el.textContent = text;
}

function setEnabledLink(el, href, text, id) {
  if (!el) return;
  el.href = href;
  el.setAttribute('aria-disabled', 'false');
  el.textContent = text;

  el.addEventListener(
    'click',
    () => {
      try {
        sessionStorage.setItem(`viewFromList:${id}`, '1');
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

  const prevPost = ordered[idx + 1] || null;
  const nextPost = ordered[idx - 1] || null;

  if (prevPost) {
    setEnabledLink(prevBtn, prevPost.url, `← 이전글`, prevPost.id);
  } else {
    setDisabledLink(prevBtn, '← 이전글');
  }

  if (nextPost) {
    setEnabledLink(nextBtn, nextPost.url, `다음글 →`, nextPost.id);
  } else {
    setDisabledLink(nextBtn, '다음글 →');
  }
}
