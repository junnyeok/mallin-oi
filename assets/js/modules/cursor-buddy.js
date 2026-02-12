// assets/js/modules/cursor-buddy.js
export function initCursorBuddy(options = {}) {
  const {
    selector = '#cukeBuddy',
    offsetX = 18,
    offsetY = 18,
    maxRotate = 12,
  } = options;

  const buddy = document.querySelector(selector);
  if (!buddy) return;

  let lastX = null; // 첫 움직임 처리용

  function onMove(e) {
    const x = e.clientX;
    const y = e.clientY;

    if (lastX === null) lastX = x; // 첫 프레임 튐 방지

    const deltaX = x - lastX;
    lastX = x;

    const strength = 1.6; // ← 0.4 대신 이걸로 조절 (1.2~2.5 사이 추천)
    const targetRotate = deltaX * strength;
    const rotate = Math.max(-maxRotate, Math.min(maxRotate, targetRotate));

    buddy.style.transform = `translate(${x + offsetX}px, ${
      y + offsetY
    }px) rotate(${rotate}deg)`;
  }

  window.addEventListener('mousemove', onMove);
}
