const pendingScrolls = new WeakMap();

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
}

export function scheduleCalendarSelectionScroll({
  target,
  hasRenderedItems,
} = {}) {
  if (!target) return;

  const requestToken = Symbol('calendar-selection-scroll');
  pendingScrolls.set(target, requestToken);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (pendingScrolls.get(target) !== requestToken) return;
      pendingScrolls.delete(target);

      if (!hasRenderedItems?.()) return;

      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  });
}
