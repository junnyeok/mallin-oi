const pendingScrolls = new WeakMap();
const DEFAULT_MONTH_SWIPE_DISTANCE = 48;
const DEFAULT_MONTH_SWIPE_DIRECTION_RATIO = 1.25;
const MONTH_SWIPE_AXIS_LOCK_DISTANCE = 8;
const MONTH_SWIPE_HORIZONTAL_BIAS = 0.75;
const MONTH_SWIPE_VERTICAL_LOCK_RATIO = 1.4;
const SWIPE_CLICK_SUPPRESSION_MS = 500;
const MONTH_EXIT_DURATION_MS = 170;
const MONTH_SNAP_BACK_DURATION_MS = 180;
const MONTH_SWIPE_EASING = 'cubic-bezier(0.22, 1, 0.36, 1)';

function prefersReducedMotion() {
  return Boolean(
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );
}

export function scheduleCalendarSelectionScroll({ target } = {}) {
  if (!target) return;

  const requestToken = Symbol('calendar-selection-scroll');
  pendingScrolls.set(target, requestToken);

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      if (pendingScrolls.get(target) !== requestToken) return;
      pendingScrolls.delete(target);

      target.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    });
  });
}

export function getCalendarMonthSwipeOffset(
  deltaX,
  deltaY,
  {
    minimumDistance = DEFAULT_MONTH_SWIPE_DISTANCE,
    directionRatio = DEFAULT_MONTH_SWIPE_DIRECTION_RATIO,
  } = {},
) {
  const horizontalDistance = Number(deltaX);
  const verticalDistance = Number(deltaY);
  const threshold = Math.max(0, Number(minimumDistance) || 0);
  const ratio = Math.max(1, Number(directionRatio) || 1);

  if (
    !Number.isFinite(horizontalDistance) ||
    !Number.isFinite(verticalDistance)
  ) {
    return 0;
  }

  const absoluteHorizontal = Math.abs(horizontalDistance);
  const absoluteVertical = Math.abs(verticalDistance);
  if (
    absoluteHorizontal < threshold ||
    absoluteHorizontal < absoluteVertical * ratio
  ) {
    return 0;
  }

  return horizontalDistance < 0 ? 1 : -1;
}

export function getCalendarMonthSwipeAxis(
  deltaX,
  deltaY,
  {
    lockDistance = MONTH_SWIPE_AXIS_LOCK_DISTANCE,
    horizontalBias = MONTH_SWIPE_HORIZONTAL_BIAS,
    verticalLockRatio = MONTH_SWIPE_VERTICAL_LOCK_RATIO,
  } = {},
) {
  const horizontalDistance = Math.abs(Number(deltaX));
  const verticalDistance = Math.abs(Number(deltaY));
  const threshold = Math.max(0, Number(lockDistance) || 0);
  const horizontalRatio = Math.max(0.5, Number(horizontalBias) || 0.5);
  const verticalRatio = Math.max(1, Number(verticalLockRatio) || 1);

  if (
    !Number.isFinite(horizontalDistance) ||
    !Number.isFinite(verticalDistance) ||
    Math.max(horizontalDistance, verticalDistance) < threshold
  ) {
    return null;
  }

  if (
    horizontalDistance >= threshold &&
    horizontalDistance >= verticalDistance * horizontalRatio
  ) {
    return 'horizontal';
  }

  if (
    verticalDistance >= threshold * 1.5 &&
    verticalDistance > horizontalDistance * verticalRatio
  ) {
    return 'vertical';
  }

  return null;
}

export function enableCalendarMonthSwipe({
  target,
  onNavigate,
  createMonthPreview,
  minimumDistance = DEFAULT_MONTH_SWIPE_DISTANCE,
} = {}) {
  if (!target?.addEventListener || typeof onNavigate !== 'function') {
    return {
      navigate: async () => false,
      refreshPreviews: () => {},
      destroy: () => {},
    };
  }

  let gesture = null;
  let touchScrollGuard = null;
  let suppressClickUntil = 0;
  let activeAnimations = [];
  let isTransitioning = false;
  let previewWidth = 0;
  const monthPreviews = new Map();

  function getTargetWidth() {
    return Math.max(
      1,
      Number(target.getBoundingClientRect?.().width) ||
        Number(window.innerWidth) ||
        320,
    );
  }

  function clampDragOffset(offset) {
    const width = getTargetWidth();
    return Math.max(-width, Math.min(width, Number(offset) || 0));
  }

  function getTrackEntries(width = getTargetWidth()) {
    return [
      { element: target, baseOffset: 0 },
      ...Array.from(monthPreviews, ([monthOffset, element]) => ({
        element,
        baseOffset: monthOffset * width,
      })),
    ];
  }

  function setTrackOffset(offset) {
    const width = getTargetWidth();
    getTrackEntries(width).forEach(({ element, baseOffset }) => {
      element.style.transform = `translate3d(${baseOffset + offset}px, 0, 0)`;
    });
  }

  function cancelActiveAnimations() {
    activeAnimations.forEach((animation) => animation?.cancel?.());
    activeAnimations = [];
  }

  function clearPreviews() {
    monthPreviews.forEach((preview) => preview.remove?.());
    monthPreviews.clear();
  }

  function sanitizePreview(preview, monthOffset) {
    preview.removeAttribute?.('id');
    preview.querySelectorAll?.('[id]').forEach((element) => {
      element.removeAttribute('id');
    });
    preview.classList?.remove(
      'is-calendar-month-swipe-enabled',
      'is-calendar-month-dragging',
      'is-calendar-month-transitioning',
    );
    preview.classList?.add('calendar-month-preview');
    preview.setAttribute?.('aria-hidden', 'true');
    preview.setAttribute?.('data-calendar-month-offset', String(monthOffset));
    try {
      preview.inert = true;
    } catch {
      // inert를 지원하지 않는 구형 WebView에서는 aria-hidden으로 대체한다.
    }
    return preview;
  }

  function refreshPreviews() {
    if (isTransitioning || typeof createMonthPreview !== 'function') return;

    clearPreviews();
    const parent = target.parentElement;
    if (!parent?.insertBefore) return;

    [-1, 1].forEach((monthOffset) => {
      let preview = null;
      try {
        preview = createMonthPreview(monthOffset);
      } catch (error) {
        console.error('[calendar] adjacent month preview failed:', error);
      }
      if (!preview?.style) return;

      sanitizePreview(preview, monthOffset);
      const loadingOverlay = parent.querySelector?.('.calendar-loading-overlay');
      parent.insertBefore(preview, loadingOverlay || null);
      monthPreviews.set(monthOffset, preview);
    });

    previewWidth = getTargetWidth();
    setTrackOffset(0);
    target.style.removeProperty('transform');
  }

  function handleViewportResize() {
    if (
      gesture ||
      isTransitioning ||
      Math.abs(getTargetWidth() - previewWidth) < 1
    ) {
      return;
    }
    refreshPreviews();
  }

  function resetVisualState() {
    cancelActiveAnimations();
    setTrackOffset(0);
    target.style.removeProperty('transform');
    target.style.removeProperty('opacity');
    target.classList.remove(
      'is-calendar-month-dragging',
      'is-calendar-month-transitioning',
    );
  }

  async function playTrackAnimation(fromOffset, toOffset, options) {
    cancelActiveAnimations();
    const width = getTargetWidth();
    const entries = getTrackEntries(width);

    if (
      prefersReducedMotion() ||
      entries.some(({ element }) => typeof element.animate !== 'function')
    ) {
      setTrackOffset(toOffset);
      return;
    }

    activeAnimations = entries.map(({ element, baseOffset }) =>
      element.animate(
        [
          {
            transform: `translate3d(${baseOffset + fromOffset}px, 0, 0)`,
          },
          {
            transform: `translate3d(${baseOffset + toOffset}px, 0, 0)`,
          },
        ],
        {
          fill: 'forwards',
          easing: MONTH_SWIPE_EASING,
          ...options,
        },
      ),
    );

    try {
      await Promise.all(activeAnimations.map((animation) => animation.finished));
    } catch {
      // 새 제스처나 정리 과정에서 취소된 애니메이션은 무시한다.
    }
  }

  async function settleBack(offset) {
    const startOffset = clampDragOffset(offset);
    if (!startOffset || prefersReducedMotion()) {
      resetVisualState();
      return;
    }

    isTransitioning = true;
    target.classList.remove('is-calendar-month-dragging');
    target.classList.add('is-calendar-month-transitioning');
    setTrackOffset(startOffset);

    await playTrackAnimation(
      startOffset,
      0,
      { duration: MONTH_SNAP_BACK_DURATION_MS },
    );

    resetVisualState();
    isTransitioning = false;
  }

  async function navigate(offset, { fromOffset = 0 } = {}) {
    const normalizedOffset = Math.sign(Number(offset) || 0);
    if (!normalizedOffset || isTransitioning) return false;

    if (fromOffset) {
      if (monthPreviews.size === 0) refreshPreviews();
    } else {
      refreshPreviews();
    }
    isTransitioning = true;
    target.classList.remove('is-calendar-month-dragging');
    target.classList.add('is-calendar-month-transitioning');

    const width = getTargetWidth();
    const startOffset = clampDragOffset(fromOffset);
    const exitOffset = normalizedOffset > 0 ? -width : width;
    const remainingProgress = 1 - Math.min(Math.abs(startOffset) / width, 1);
    const exitDuration = Math.max(
      80,
      Math.round(MONTH_EXIT_DURATION_MS * remainingProgress),
    );

    if (!prefersReducedMotion()) {
      setTrackOffset(startOffset);
      await playTrackAnimation(
        startOffset,
        exitOffset,
        { duration: exitDuration },
      );
    } else {
      setTrackOffset(exitOffset);
    }

    try {
      await Promise.resolve(onNavigate(normalizedOffset));
    } catch (error) {
      resetVisualState();
      isTransitioning = false;
      throw error;
    }

    clearPreviews();
    resetVisualState();
    isTransitioning = false;
    refreshPreviews();
    return true;
  }

  function releasePointer(pointerId) {
    try {
      if (target.hasPointerCapture?.(pointerId)) {
        target.releasePointerCapture(pointerId);
      }
    } catch {
      // 이미 해제된 포인터 캡처는 별도 처리하지 않는다.
    }
  }

  function handlePointerDown(event) {
    if (isTransitioning) return;
    if (event.isPrimary === false) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    suppressClickUntil = 0;
    gesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      axis: null,
      visualOffset: 0,
      hasCapturedPointer: false,
      hasPreparedTrack: false,
    };
  }

  function handlePointerMove(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;

    const deltaX = gesture.lastX - gesture.startX;
    const deltaY = gesture.lastY - gesture.startY;
    const absoluteHorizontal = Math.abs(deltaX);
    const absoluteVertical = Math.abs(deltaY);

    if (!gesture.axis) {
      gesture.axis = getCalendarMonthSwipeAxis(
        absoluteHorizontal,
        absoluteVertical,
      );
    }

    if (gesture.axis !== 'horizontal') return;

    if (!gesture.hasPreparedTrack) {
      refreshPreviews();
      gesture.hasPreparedTrack = true;
    }

    if (!gesture.hasCapturedPointer) {
      try {
        target.setPointerCapture?.(event.pointerId);
        gesture.hasCapturedPointer = true;
      } catch {
        // 포인터가 이미 해제된 경우에도 현재 이동 계산은 계속한다.
      }
    }

    if (event.cancelable) event.preventDefault();
    gesture.visualOffset = clampDragOffset(deltaX);
    target.classList.add('is-calendar-month-dragging');
    setTrackOffset(gesture.visualOffset);
  }

  function handlePointerUp(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;

    const currentGesture = gesture;
    currentGesture.lastX = event.clientX;
    currentGesture.lastY = event.clientY;
    gesture = null;
    releasePointer(event.pointerId);

    if (!currentGesture.axis) {
      currentGesture.axis = getCalendarMonthSwipeAxis(
        currentGesture.lastX - currentGesture.startX,
        currentGesture.lastY - currentGesture.startY,
      );
      if (currentGesture.axis === 'horizontal') {
        refreshPreviews();
        currentGesture.hasPreparedTrack = true;
      }
    }

    if (currentGesture.axis === 'horizontal') {
      suppressClickUntil = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
    }

    if (currentGesture.axis === 'vertical') {
      return;
    }

    if (!currentGesture.axis) return;

    const offset = getCalendarMonthSwipeOffset(
      currentGesture.lastX - currentGesture.startX,
      currentGesture.lastY - currentGesture.startY,
      { minimumDistance },
    );
    if (!offset) {
      void settleBack(currentGesture.visualOffset);
      return;
    }

    void navigate(offset, { fromOffset: currentGesture.visualOffset });
  }

  function handlePointerCancel(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    const currentGesture = gesture;
    gesture = null;
    releasePointer(event.pointerId);
    if (currentGesture.axis === 'horizontal') {
      void settleBack(currentGesture.visualOffset);
    }
  }

  function getPrimaryTouch(event) {
    return event.touches?.length === 1 ? event.touches[0] : null;
  }

  function handleTouchStart(event) {
    const touch = getPrimaryTouch(event);
    touchScrollGuard = touch
      ? {
          startX: touch.clientX,
          startY: touch.clientY,
          axis: null,
        }
      : null;
  }

  function handleTouchMove(event) {
    if (!touchScrollGuard) return;
    const touch = getPrimaryTouch(event);
    if (!touch) {
      touchScrollGuard = null;
      return;
    }

    if (!touchScrollGuard.axis) {
      touchScrollGuard.axis = getCalendarMonthSwipeAxis(
        touch.clientX - touchScrollGuard.startX,
        touch.clientY - touchScrollGuard.startY,
      );
    }

    if (touchScrollGuard.axis === 'horizontal' && event.cancelable) {
      event.preventDefault();
    }
  }

  function handleTouchEnd() {
    touchScrollGuard = null;
  }

  function suppressSwipeClick(event) {
    if (Date.now() > suppressClickUntil) return;
    suppressClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
  }

  target.classList.add('is-calendar-month-swipe-enabled');
  target.addEventListener('pointerdown', handlePointerDown);
  target.addEventListener('pointermove', handlePointerMove);
  target.addEventListener('pointerup', handlePointerUp);
  target.addEventListener('pointercancel', handlePointerCancel);
  target.addEventListener('touchstart', handleTouchStart, { passive: true });
  target.addEventListener('touchmove', handleTouchMove, { passive: false });
  target.addEventListener('touchend', handleTouchEnd, { passive: true });
  target.addEventListener('touchcancel', handleTouchEnd, { passive: true });
  target.addEventListener('click', suppressSwipeClick, true);
  window.addEventListener?.('resize', handleViewportResize);
  refreshPreviews();

  return {
    navigate,
    refreshPreviews,
    destroy() {
      gesture = null;
      touchScrollGuard = null;
      suppressClickUntil = 0;
      isTransitioning = false;
      resetVisualState();
      clearPreviews();
      target.classList.remove('is-calendar-month-swipe-enabled');
      target.removeEventListener('pointerdown', handlePointerDown);
      target.removeEventListener('pointermove', handlePointerMove);
      target.removeEventListener('pointerup', handlePointerUp);
      target.removeEventListener('pointercancel', handlePointerCancel);
      target.removeEventListener('touchstart', handleTouchStart);
      target.removeEventListener('touchmove', handleTouchMove);
      target.removeEventListener('touchend', handleTouchEnd);
      target.removeEventListener('touchcancel', handleTouchEnd);
      target.removeEventListener('click', suppressSwipeClick, true);
      window.removeEventListener?.('resize', handleViewportResize);
    },
  };
}
