// assets/js/modules/cursor-buddy.js
export function initCursorBuddy(options = {}) {
  const {
    selector = '#cukeBuddy',
    offsetX = 18,
    offsetY = 18,
    maxRotate = 12,

    // ✅ 모바일 페이드 설정
    mobileFadeOutDelay = 650, // 마지막 터치/이동 후 이 시간 지나면 숨김
  } = options;

  const buddy = document.querySelector(selector);
  if (!buddy) return;

  // ✅ PC(마우스)인지 모바일(터치)인지 판별
  const isDesktopLike = window.matchMedia(
    '(hover: hover) and (pointer: fine)'
  ).matches;

  let lastX = null;
  let hideTimer = null;

  // 모바일에서 “누르고 있는 동안만” 따라오게 할지 여부
  let activePointerId = null;

  function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
  }

  function setVisible(v) {
    if (v) buddy.classList.add('is-visible');
    else buddy.classList.remove('is-visible');
  }

  function moveTo(x, y, rotateDeg = 0) {
    buddy.style.transform = `translate(${x + offsetX}px, ${
      y + offsetY
    }px) rotate(${rotateDeg}deg)`;
  }

  function clearHideTimer() {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function scheduleHide() {
    clearHideTimer();
    hideTimer = setTimeout(() => {
      setVisible(false);
    }, mobileFadeOutDelay);
  }

  /* =========================
     1) 데스크탑(마우스): 기존대로
  ========================= */
  if (isDesktopLike) {
    function onMouseMove(e) {
      const x = e.clientX;
      const y = e.clientY;

      if (lastX === null) lastX = x;

      const deltaX = x - lastX;
      lastX = x;

      const strength = 1.6;
      const targetRotate = deltaX * strength;
      const rotate = clamp(targetRotate, -maxRotate, maxRotate);

      // 처음 움직이는 순간부터 보여주기
      setVisible(true);
      moveTo(x, y, rotate);
    }

    window.addEventListener('mousemove', onMouseMove, { passive: true });
    return;
  }

  /* =========================
     2) 모바일(터치): 터치 시 페이드 인, 놓으면 페이드 아웃
     - pointer 이벤트로 통일 (터치/펜 포함)
  ========================= */

  // 모바일은 기본 숨김 상태로 시작(이미 CSS에서 opacity 0)
  setVisible(false);

  function onPointerDown(e) {
    // 터치 시작 지점에 나타남
    activePointerId = e.pointerId;

    // lastX 초기화(회전 계산 깔끔)
    lastX = e.clientX;

    setVisible(true);
    clearHideTimer();
    moveTo(e.clientX, e.clientY, 0);
  }

  function onPointerMove(e) {
    // “누르고 있는 손가락”만 추적
    if (activePointerId !== e.pointerId) return;

    const x = e.clientX;
    const y = e.clientY;

    if (lastX === null) lastX = x;
    const deltaX = x - lastX;
    lastX = x;

    const strength = 1.2; // 모바일은 회전 조금 덜
    const targetRotate = deltaX * strength;
    const rotate = clamp(targetRotate, -maxRotate, maxRotate);

    setVisible(true);
    clearHideTimer();
    moveTo(x, y, rotate);
  }

  function endPointer() {
    activePointerId = null;
    lastX = null;

    // ✅ 바로 사라지면 “툭” 느낌이라, 약간 딜레이 후 페이드아웃
    scheduleHide();
  }

  window.addEventListener('pointerdown', onPointerDown, { passive: true });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', endPointer, { passive: true });
  window.addEventListener('pointercancel', endPointer, { passive: true });

  // ✅ 혹시 포커스 전환/화면 숨김 등으로 up이 안 들어와도 안전하게 숨김
  window.addEventListener(
    'blur',
    () => {
      activePointerId = null;
      setVisible(false);
    },
    { passive: true }
  );

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.hidden) {
        activePointerId = null;
        setVisible(false);
      }
    },
    { passive: true }
  );
}
