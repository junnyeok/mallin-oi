// assets/js/modules/post-prev-next.js

export async function initPostPrevNext() {
  const body = document.body;
  const currentId = body.dataset.postId;

  // 상세페이지가 아니면 종료
  if (!currentId) return;

  const prevBtn = document.getElementById('postPrevBtn');
  const nextBtn = document.getElementById('postNextBtn');

  if (!prevBtn || !nextBtn) return;

  try {
    const res = await fetch('../assets/data/posts.json');
    const posts = await res.json();

    if (!Array.isArray(posts) || posts.length === 0) return;

    // 🔹 pinned 우선 + date 최신순 정렬
    const sorted = [...posts].sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      const dateA = new Date(a.date).getTime();
      const dateB = new Date(b.date).getTime();
      return dateB - dateA; // 최신순
    });

    const currentIndex = sorted.findIndex((p) => p.id === currentId);
    if (currentIndex === -1) return;

    const prevPost = sorted[currentIndex - 1];
    const nextPost = sorted[currentIndex + 1];

    // 🔹 이전글
    if (prevPost) {
      prevBtn.href = `../${prevPost.url}`;
      prevBtn.removeAttribute('aria-disabled');
      prevBtn.title = prevPost.title;
    }

    // 🔹 다음글
    if (nextPost) {
      nextBtn.href = `../${nextPost.url}`;
      nextBtn.removeAttribute('aria-disabled');
      nextBtn.title = nextPost.title;
    }
  } catch (err) {
    console.error('prev/next 로딩 실패:', err);
  }
}
