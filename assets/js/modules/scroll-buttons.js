// assets/js/modules/scroll-buttons.js
/* =================================================
  scroll-buttons.js
  - 상단/하단 이동 플로팅 버튼 (항상 노출)
  - TOP: 맨 위에서는 비활성
  - END: 바닥 근처에서는 비활성
================================================= */

export function initScrollButtons(options = {}) {
  const {
    topOffset = 60, // ✅ 상단에서 이 px 이내면 TOP 비활성
    bottomOffset = 240, // 바닥에서 이 px 이내면 END 비활성
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

  const btnBottom = document.createElement('button');
  btnBottom.type = 'button';
  btnBottom.className = 'scroll-fab__btn';
  btnBottom.setAttribute('data-scroll-fab', 'bottom');
  btnBottom.setAttribute('aria-label', '하단으로 이동');
  btnBottom.innerHTML = `
    <span class="scroll-fab__icon" aria-hidden="true">↓</span>
    <span class="scroll-fab__text">END</span>
  `;

  wrap.append(btnTop, btnBottom);
  document.body.appendChild(wrap);

  function scrollToTop() {
    if (btnTop.disabled) return;
    window.scrollTo({ top: 0, behavior });
  }

  function scrollToBottom() {
    if (btnBottom.disabled) return;
    const maxY = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight
    );
    window.scrollTo({ top: maxY, behavior });
  }

  btnTop.addEventListener('click', scrollToTop);
  btnBottom.addEventListener('click', scrollToBottom);

  function updateState() {
    const doc = document.documentElement;

    const scrollTop = doc.scrollTop || document.body.scrollTop || 0;
    const scrollHeight = doc.scrollHeight || document.body.scrollHeight || 0;
    const clientHeight = doc.clientHeight || window.innerHeight || 0;

    const canScroll = scrollHeight > clientHeight + 10;

    const nearTop = scrollTop <= topOffset; // ✅ 맨 위 근처
    const nearBottom = scrollHeight - (scrollTop + clientHeight) < bottomOffset;

    // 스크롤할 게 없으면 둘 다 비활성
    if (!canScroll) {
      btnTop.disabled = true;
      btnBottom.disabled = true;
      return;
    }

    // ✅ TOP: 위에 있으면 비활성
    btnTop.disabled = nearTop;

    // ✅ END: 아래에 있으면 비활성
    btnBottom.disabled = nearBottom;
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
