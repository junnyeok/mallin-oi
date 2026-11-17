// Match the side strip's horizontal scale to its actual vertical scale.
// A single copy keeps the vine continuous instead of introducing tiled seams.
const observers = new WeakMap();
export function syncLeafFrameSize(target, enabled) {
  observers.get(target)?.();
  observers.delete(target);
  for (const name of ['--leaf-cap-top', '--leaf-cap-bottom', '--leaf-side']) {
    target.style.removeProperty(name);
  }
  if (!enabled) return;
  const update = () => {
    const { width, height } = target.getBoundingClientRect();
    if (!width || !height) return;
    const mobile = window.matchMedia('(max-width: 700px)').matches;
    const scale = mobile ? (width + 48) / 393 : (width + 56) / 816;
    const top = (mobile ? 88 : 94) * scale;
    const bottom = (mobile ? 112 : 94) * scale;
    const edgeHeight = height + (mobile ? 124 : 94) - top - bottom;
    const side = Math.max(1, edgeHeight) * 180 / (mobile ? 1143 : 700);
    target.style.setProperty('--leaf-cap-top', top + 'px');
    target.style.setProperty('--leaf-cap-bottom', bottom + 'px');
    target.style.setProperty('--leaf-side', side + 'px');
  };
  const observer = new ResizeObserver(update);
  observer.observe(target);
  window.addEventListener('resize', update, { passive: true });
  const dispose = () => {
    observer.disconnect();
    window.removeEventListener('resize', update);
    window.removeEventListener('mallin:before-pjax-swap', dispose);
  };
  observers.set(target, dispose);
  window.addEventListener('mallin:before-pjax-swap', dispose, { once: true });
  update();
}
