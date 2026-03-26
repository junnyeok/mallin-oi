// assets/js/modules/scroll-buttons.js
/* =================================================
  scroll-buttons.js

  공통 플로팅 스크롤 버튼
  -----------------------------------------------
  [상세페이지 post.html]
  - TOP: 맨 위
  - COMMENT: 이전글/목록/다음글(.post-pager) 위치
  - END: 다른 게시물(#postOtherPostsSection) 위치
  - 댓글 버튼 비활성 판단은 #postCommentsSection 기준

  [index / study / work / event / career]
  - PC: TOP / END만 표시
    - TOP: 맨 위
    - END: 맨 아래
  - 모바일: TOP / COMMENT / END 표시
    - TOP: 맨 위
    - COMMENT: 건의사항(.suggestion-panel) 위치
    - END: 최신 업로드(#latestList가 들어있는 패널) 위치

  [posts-all.html]
  - TOP: 맨 위
  - END: 카테고리 목록 버튼(.posts-all__tabs) 위치

  [write.html]
  - TOP: 맨 위
  - COMMENT: 본문 입력칸(#body) 위치
  - END: 등록 버튼(#writeSubmitBtn) 위치
================================================= */

function isMobileViewport() {
  return window.innerWidth <= 700;
}

function getPageType() {
  const path = window.location.pathname.toLowerCase();

  // ✅ 상세/전체보기/글쓰기 페이지는 pathname 우선 판별
  // body.dataset.page가 카테고리(study/work 등)로 바뀌어도 흔들리지 않게
  if (path.includes('post.html')) return 'post';
  if (path.includes('posts-all.html')) return 'posts-all';
  if (path.includes('write.html')) return 'write';
  if (path.includes('mypage.html')) return 'mypage';

  const page = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  if (page === 'post') return 'post';
  if (page === 'write') return 'write';
  if (page === 'mypage') return 'mypage';
  if (page === 'posts-all' || page === 'postsall' || page === 'all') {
    return 'posts-all';
  }

  if (
    page === 'home' ||
    page === 'index' ||
    page === 'study' ||
    page === 'work' ||
    page === 'event' ||
    page === 'career'
  ) {
    return 'home-like';
  }

  return 'other';
}

function findLatestPanel() {
  const latestList = document.getElementById('latestList');
  if (!latestList) return null;
  return latestList.closest('.panel') || latestList;
}

function getHomeLikeTargets() {
  const suggestionSection = document.querySelector('.suggestion-panel');
  const latestPanel = findLatestPanel();

  return {
    commentSection: suggestionSection,
    commentScrollEl: suggestionSection,
    commentStateEl: suggestionSection,
    bottomScrollEl: latestPanel,
  };
}

function getPostTargets() {
  const commentSection = document.querySelector('#postCommentsSection');
  const commentScrollEl =
    document.querySelector('.post-pager') || commentSection;
  const commentStateEl = commentSection || commentScrollEl;
  const bottomScrollEl =
    document.querySelector('#postOtherPostsSection') || null;

  return {
    commentSection,
    commentScrollEl,
    commentStateEl,
    bottomScrollEl,
  };
}

function getPostsAllTargets() {
  const bottomScrollEl =
    document.querySelector('.posts-all__tabs') ||
    document.querySelector('.posts-all-tabs') ||
    document.querySelector('[data-posts-all-tabs]') ||
    document.querySelector('.posts-tabs') ||
    document.querySelector('.category-tabs') ||
    null;

  return {
    bottomScrollEl,
  };
}

function getWriteTargets() {
  const bodyField = document.getElementById('body');
  const bodyRow = bodyField?.closest('.write-row') || bodyField || null;

  const submitBtn = document.getElementById('writeSubmitBtn');
  const submitArea =
    submitBtn?.closest('.write-actions') ||
    submitBtn?.closest('.write-form__bottom') ||
    submitBtn?.closest('.write-row') ||
    submitBtn?.parentElement ||
    submitBtn ||
    null;

  return {
    commentSection: bodyRow,
    commentScrollEl: bodyRow,
    commentStateEl: bodyRow,
    bottomScrollEl: submitArea,
  };
}

function getMypageTargets() {
  const myPostsSection =
    document.getElementById('mypageMyPostsSection') ||
    document.querySelector('[data-mypage-my-posts]') ||
    null;

  return {
    commentSection: myPostsSection,
    commentScrollEl: myPostsSection,
    commentStateEl: myPostsSection,
  };
}

function createFabButton(type, text, icon, ariaLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'scroll-fab__btn';
  btn.setAttribute('data-scroll-fab', type);
  btn.setAttribute('aria-label', ariaLabel);
  btn.innerHTML = `
    <span class="scroll-fab__icon" aria-hidden="true">${icon}</span>
    <span class="scroll-fab__text">${text}</span>
  `;
  return btn;
}

function getAbsoluteTop(el, extraOffset = 16) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return Math.max(0, window.pageYOffset + rect.top - extraOffset);
}

export function initScrollButtons(options = {}) {
  const {
    topOffset = 60,
    bottomOffset = 240,
    commentActiveOffset = 120,
    bottomActiveOffset = 160,
    scrollBehavior = 'smooth',
  } = options;

  const existingWrap = document.querySelector('[data-scroll-fab="wrap"]');
  if (existingWrap) existingWrap.remove();

  const pageType = getPageType();
  if (pageType === 'other') return;

  const prefersReduced =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const behavior = prefersReduced ? 'auto' : scrollBehavior;

  const wrap = document.createElement('div');
  wrap.className = 'scroll-fab';
  wrap.setAttribute('data-scroll-fab', 'wrap');

  const btnTop = createFabButton('top', 'TOP', '↑', '상단으로 이동');
  const btnBottom = createFabButton('bottom', 'END', '↓', '하단으로 이동');

  let btnComment = null;
  let commentSection = null;
  let commentScrollEl = null;
  let commentStateEl = null;
  let bottomScrollEl = null;

  if (pageType === 'post') {
    const postTargets = getPostTargets();
    commentSection = postTargets.commentSection;
    commentScrollEl = postTargets.commentScrollEl;
    commentStateEl = postTargets.commentStateEl;
    bottomScrollEl = postTargets.bottomScrollEl;

    if (commentSection && commentScrollEl) {
      btnComment = createFabButton(
        'comment',
        '댓글',
        '💬',
        '댓글 영역으로 이동',
      );
    }

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '다른 게시물로 이동');
    }
  }

  if (pageType === 'home-like') {
    const mobile = isMobileViewport();
    const homeTargets = getHomeLikeTargets();

    commentSection = homeTargets.commentSection;
    commentScrollEl = homeTargets.commentScrollEl;
    commentStateEl = homeTargets.commentStateEl;
    bottomScrollEl = homeTargets.bottomScrollEl;

    if (mobile && commentSection && commentScrollEl) {
      btnComment = createFabButton(
        'comment',
        '건의',
        '💬',
        '건의사항으로 이동',
      );
    }

    if (mobile && bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '최신 업로드로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'posts-all') {
    const postsAllTargets = getPostsAllTargets();
    bottomScrollEl = postsAllTargets.bottomScrollEl;

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '카테고리 목록으로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'write') {
    const writeTargets = getWriteTargets();
    commentSection = writeTargets.commentSection;
    commentScrollEl = writeTargets.commentScrollEl;
    commentStateEl = writeTargets.commentStateEl;
    bottomScrollEl = writeTargets.bottomScrollEl;

    if (commentSection && commentScrollEl) {
      btnComment = createFabButton(
        'comment',
        '본문',
        '💬',
        '본문 입력칸으로 이동',
      );
    }

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '등록 버튼으로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'mypage') {
    const mypageTargets = getMypageTargets();
    commentSection = mypageTargets.commentSection;
    commentScrollEl = mypageTargets.commentScrollEl;
    commentStateEl = mypageTargets.commentStateEl;

    if (commentSection && commentScrollEl) {
      btnComment = createFabButton(
        'comment',
        'POST',
        '📝',
        '내가 쓴 글 영역으로 이동',
      );
    }

    btnBottom.setAttribute('aria-label', '하단으로 이동');
  }

  if (btnComment) {
    wrap.append(btnTop, btnComment, btnBottom);
  } else {
    wrap.append(btnTop, btnBottom);
  }

  document.body.appendChild(wrap);

  function scrollToTop() {
    if (btnTop.disabled) return;
    window.scrollTo({ top: 0, behavior });
  }

  function scrollToCommentTarget() {
    if (!btnComment || btnComment.disabled || !commentScrollEl) return;

    const targetTop = getAbsoluteTop(commentScrollEl, 16);
    window.scrollTo({
      top: targetTop,
      behavior,
    });
  }

  function scrollToBottomTarget() {
    if (btnBottom.disabled) return;

    const pageTypeNow = getPageType();
    const mobile = isMobileViewport();

    if (pageTypeNow === 'post' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({
        top: targetTop,
        behavior,
      });
      return;
    }

    if (pageTypeNow === 'home-like' && mobile && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({
        top: targetTop,
        behavior,
      });
      return;
    }

    if (pageTypeNow === 'posts-all' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({
        top: targetTop,
        behavior,
      });
      return;
    }

    if (pageTypeNow === 'write' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({
        top: targetTop,
        behavior,
      });
      return;
    }

    const maxY = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );

    window.scrollTo({
      top: maxY,
      behavior,
    });
  }

  btnTop.addEventListener('click', scrollToTop);
  btnBottom.addEventListener('click', scrollToBottomTarget);

  if (btnComment) {
    btnComment.addEventListener('click', scrollToCommentTarget);
  }

  function updateCommentButtonState() {
    if (!btnComment || !commentStateEl) return;

    const rect = commentStateEl.getBoundingClientRect();
    const pageTypeNow = getPageType();

    if (pageTypeNow === 'post') {
      const isNearComment =
        rect.top <= 80 &&
        rect.bottom > Math.min(window.innerHeight * 0.25, 180);

      const isInsideCommentArea =
        rect.top < window.innerHeight * 0.35 &&
        rect.bottom > Math.max(window.innerHeight * 0.2, 120);

      btnComment.disabled = isNearComment || isInsideCommentArea;
      return;
    }

    const isNearComment =
      rect.top <= commentActiveOffset && rect.bottom > commentActiveOffset;

    const isVisible = rect.top < window.innerHeight * 0.75 && rect.bottom > 0;

    btnComment.disabled = isNearComment || isVisible;
  }

  function updateState() {
    const doc = document.documentElement;

    const scrollTop = doc.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = doc.scrollHeight || document.body.scrollHeight || 0;
    const clientHeight = doc.clientHeight || window.innerHeight || 0;

    const canScroll = scrollHeight > clientHeight + 10;
    const nearTop = scrollTop <= topOffset;

    btnTop.disabled = !canScroll || nearTop;

    if (!canScroll) {
      if (btnComment) btnComment.disabled = true;
      btnBottom.disabled = true;
      return;
    }

    if (btnComment) {
      updateCommentButtonState();
    }

    const pageTypeNow = getPageType();
    const mobile = isMobileViewport();

    if (
      (pageTypeNow === 'post' && bottomScrollEl) ||
      (pageTypeNow === 'home-like' && mobile && bottomScrollEl) ||
      (pageTypeNow === 'posts-all' && bottomScrollEl) ||
      (pageTypeNow === 'write' && bottomScrollEl)
    ) {
      const bottomRect = bottomScrollEl.getBoundingClientRect();

      const isNearBottomTarget =
        bottomRect.top <= bottomActiveOffset &&
        bottomRect.bottom > bottomActiveOffset;

      const isBottomTargetVisible =
        bottomRect.top < window.innerHeight * 0.85 && bottomRect.bottom > 0;

      btnBottom.disabled = isNearBottomTarget || isBottomTargetVisible;
      return;
    }

    const nearBottom = scrollHeight - (scrollTop + clientHeight) < bottomOffset;
    btnBottom.disabled = nearBottom;
  }

  let rafId = null;
  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateState();
    });
  }

  let resizeTimer = null;
  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      initScrollButtons(options);
    }, 80);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize);

  updateState();
}
