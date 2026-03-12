// assets/js/modules/scroll-buttons.js
/* =================================================
  scroll-buttons.js
  - 상단/댓글/하단 이동 플로팅 버튼
  - TOP: 맨 위에서는 비활성
  - COMMENT: 댓글 영역 있으면 생성
  - END: 바닥 근처에서는 비활성
================================================= */

export function initScrollButtons(options = {}) {
  const {
    topOffset = 60, // 상단에서 이 px 이내면 TOP 비활성
    bottomOffset = 240, // 바닥에서 이 px 이내면 END 비활성
    commentTarget = '#postCommentsSection', // 댓글 이동 대상
    commentActiveOffset = 120, // 댓글 영역 근처면 COMMENT 비활성
    scrollBehavior = 'smooth', // 'smooth' | 'auto'
  } = options;

  // 중복 생성 방지
  if (document.querySelector('[data-scroll-fab="wrap"]')) return;

  const prefersReduced =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const behavior = prefersReduced ? 'auto' : scrollBehavior;

  const wrap = document.createElement('div');
  wrap.className = 'scroll-fab';
  wrap.setAttribute('data-scroll-fab', 'wrap');

  const btnTop = document.createElement('button');
  btnTop.type = 'button';
  btnTop.className = 'scroll-fab__btn';
  btnTop.setAttribute('data-scroll-fab', 'top');
  btnTop.setAttribute('aria-label', '상단으로 이동');
  btnTop.innerHTML = `
    <span class="scroll-fab__icon" aria-hidden="true">↑</span>
    <span class="scroll-fab__text">TOP</span>
  `;

  const commentSection = document.querySelector(commentTarget);
  let btnComment = null;

  if (commentSection) {
    btnComment = document.createElement('button');
    btnComment.type = 'button';
    btnComment.className = 'scroll-fab__btn';
    btnComment.setAttribute('data-scroll-fab', 'comment');
    btnComment.setAttribute('aria-label', '댓글로 이동');
    btnComment.innerHTML = `
      <span class="scroll-fab__icon" aria-hidden="true">💬</span>
      <span class="scroll-fab__text">댓글</span>
    `;
  }

  const btnBottom = document.createElement('button');
  btnBottom.type = 'button';
  btnBottom.className = 'scroll-fab__btn';
  btnBottom.setAttribute('data-scroll-fab', 'bottom');
  btnBottom.setAttribute('aria-label', '하단으로 이동');
  btnBottom.innerHTML = `
    <span class="scroll-fab__icon" aria-hidden="true">↓</span>
    <span class="scroll-fab__text">END</span>
  `;

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

  function scrollToComments() {
    if (!btnComment || btnComment.disabled || !commentSection) return;

    const rect = commentSection.getBoundingClientRect();
    const absoluteTop = window.pageYOffset + rect.top - 16;

    window.scrollTo({
      top: Math.max(0, absoluteTop),
      behavior,
    });
  }

  function scrollToBottom() {
    if (btnBottom.disabled) return;
    const maxY = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );
    window.scrollTo({ top: maxY, behavior });
  }

  btnTop.addEventListener('click', scrollToTop);
  btnBottom.addEventListener('click', scrollToBottom);
  if (btnComment) {
    btnComment.addEventListener('click', scrollToComments);
  }

  function updateState() {
    const doc = document.documentElement;

    const scrollTop = doc.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = doc.scrollHeight || document.body.scrollHeight || 0;
    const clientHeight = doc.clientHeight || window.innerHeight || 0;

    const canScroll = scrollHeight > clientHeight + 10;

    const nearTop = scrollTop <= topOffset;
    const nearBottom = scrollHeight - (scrollTop + clientHeight) < bottomOffset;

    if (!canScroll) {
      btnTop.disabled = true;
      btnBottom.disabled = true;
      if (btnComment) btnComment.disabled = true;
      return;
    }

    btnTop.disabled = nearTop;
    btnBottom.disabled = nearBottom;

    if (btnComment && commentSection) {
      const rect = commentSection.getBoundingClientRect();

      // 댓글 섹션 상단 근처에 오면 비활성
      const isNearComment =
        rect.top <= commentActiveOffset && rect.bottom > commentActiveOffset;

      // 댓글 섹션이 화면에 이미 꽤 보이면 비활성
      const isVisible = rect.top < window.innerHeight * 0.75 && rect.bottom > 0;

      btnComment.disabled = isNearComment || isVisible;
    }
  }

  // 가벼운 rAF 스로틀
  let rafId = null;
  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateState();
    });
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);

  updateState();
}
