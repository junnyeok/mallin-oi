const STYLE_ID = 'pickle-burst-style';
const ROOT_ID = 'pickleBurstRoot';

function ensureStyle() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #${ROOT_ID} {
      position: fixed;
      inset: 0;
      pointer-events: none;
      overflow: hidden;
      z-index: 9999;
    }

    .pickle-burst__item {
      position: fixed;
      left: 0;
      top: 0;
      pointer-events: none;
      user-select: none;
      will-change: transform, opacity;
      transform:
        translate3d(var(--start-x), var(--start-y), 0)
        scale(var(--scale, 1))
        rotate(var(--rotate-start, 0deg));
      opacity: 0;
      animation: pickleBurstUp var(--duration, 1400ms) cubic-bezier(0.18, 0.84, 0.22, 1) forwards;
      filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.18));
    }

    @keyframes pickleBurstUp {
      0% {
        opacity: 0;
        transform:
          translate3d(var(--start-x), calc(var(--start-y) + 10px), 0)
          scale(calc(var(--scale, 1) * 0.7))
          rotate(var(--rotate-start, 0deg));
      }

      12% {
        opacity: 1;
      }

      100% {
        opacity: 0;
        transform:
          translate3d(
            calc(var(--start-x) + var(--drift-x, 0px)),
            calc(var(--start-y) - var(--rise-y, 180px)),
            0
          )
          scale(calc(var(--scale, 1) * 1.08))
          rotate(var(--rotate-end, 0deg));
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .pickle-burst__item {
        animation-duration: 500ms;
      }
    }
  `;

  document.head.appendChild(style);
}

function ensureRoot() {
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  document.body.appendChild(root);
  return root;
}

function getViewportPoint(originEl = null) {
  if (originEl instanceof Element) {
    const rect = originEl.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  return {
    x: window.innerWidth / 2,
    y: window.innerHeight * 0.72,
  };
}

export function playPickleBurst({
  originEl = null,
  x = null,
  y = null,
  count = 10,
  emoji = '🥒',
  minSize = 22,
  maxSize = 34,
} = {}) {
  if (typeof document === 'undefined') return;

  ensureStyle();
  const root = ensureRoot();

  const origin =
    Number.isFinite(x) && Number.isFinite(y)
      ? { x, y }
      : getViewportPoint(originEl);

  const safeCount = Math.max(1, Math.min(20, Number(count || 10)));

  for (let i = 0; i < safeCount; i += 1) {
    const item = document.createElement('span');
    item.className = 'pickle-burst__item';
    item.textContent = emoji;
    item.setAttribute('aria-hidden', 'true');

    const size = Math.round(
      minSize + Math.random() * Math.max(0, maxSize - minSize),
    );
    const startJitterX = Math.round((Math.random() - 0.5) * 28);
    const startJitterY = Math.round((Math.random() - 0.5) * 14);
    const driftX = Math.round((Math.random() - 0.5) * 180);
    const riseY = Math.round(130 + Math.random() * 160);
    const rotateStart = Math.round((Math.random() - 0.5) * 50);
    const rotateEnd = rotateStart + Math.round((Math.random() - 0.5) * 140);
    const duration = Math.round(1000 + Math.random() * 500);
    const scale = (0.9 + Math.random() * 0.45).toFixed(2);
    const delay = Math.round(Math.random() * 120);

    item.style.fontSize = `${size}px`;
    item.style.setProperty(
      '--start-x',
      `${Math.round(origin.x + startJitterX)}px`,
    );
    item.style.setProperty(
      '--start-y',
      `${Math.round(origin.y + startJitterY)}px`,
    );
    item.style.setProperty('--drift-x', `${driftX}px`);
    item.style.setProperty('--rise-y', `${riseY}px`);
    item.style.setProperty('--rotate-start', `${rotateStart}deg`);
    item.style.setProperty('--rotate-end', `${rotateEnd}deg`);
    item.style.setProperty('--duration', `${duration}ms`);
    item.style.setProperty('--scale', scale);
    item.style.animationDelay = `${delay}ms`;

    root.appendChild(item);

    window.setTimeout(
      () => {
        item.remove();
      },
      duration + delay + 180,
    );
  }
}
