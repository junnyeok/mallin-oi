// assets/js/modules/service-menu.js

let calendarManageController = null;

export function openCalendarManagePopup() {
  return calendarManageController?.open() === true;
}

export function initServiceMenu() {
  const menu = document.getElementById('serviceMenu');
  if (!menu) return;
  if (menu.dataset.bound === 'true') return;

  menu.dataset.bound = 'true';

  const button = document.getElementById('serviceMenuBtn');
  const panel = document.getElementById('serviceMenuPanel');
  const closeBtn = document.getElementById('serviceMenuCloseBtn');
  const backdrop = document.getElementById('serviceMenuBackdrop');
  const links = menu.querySelectorAll('.service-menu__link[href]');

  const calendarManageBtn = document.getElementById('calendarManageBtn');
  const calendarManagePanel = document.getElementById('calendarManagePanel');
  const calendarManageBackdrop = document.getElementById(
    'calendarManageBackdrop',
  );
  const calendarManageCloseBtn = document.getElementById(
    'calendarManageCloseBtn',
  );
  const calendarManageLinks = menu.querySelectorAll('.calendar-manage__link');

  if (!button || !panel || !closeBtn) return;

  let closeTimer = null;
  let openFrame = null;
  let pageScrollLock = null;
  let swipeGesture = null;
  let suppressClickUntil = 0;

  const SWIPE_DIRECTION_LOCK_PX = 10;
  const SWIPE_MIN_FLICK_PX = 48;
  const SWIPE_MIN_FLICK_VELOCITY = 0.5;
  const SWIPE_CLICK_SUPPRESSION_MS = 500;
  // iOS의 화면 왼쪽 가장자리 시스템 뒤로가기 영역과 경쟁하지 않는다.
  const BROWSER_EDGE_GUARD_PX = 32;

  const lockPageScroll = () => {
    if (pageScrollLock) return;
    pageScrollLock = { x: window.scrollX, y: window.scrollY };
    document.body.style.setProperty('--service-menu-scroll-y', `${-pageScrollLock.y}px`);
    document.documentElement.classList.add('service-menu-scroll-locked');
    document.body.classList.add('service-menu-open');
  };

  const unlockPageScroll = () => {
    if (!pageScrollLock) return;
    const { x, y } = pageScrollLock;
    pageScrollLock = null;
    document.body.classList.remove('service-menu-open');
    document.documentElement.classList.remove('service-menu-scroll-locked');
    document.body.style.removeProperty('--service-menu-scroll-y');
    window.scrollTo({ left: x, top: y, behavior: 'instant' });
  };

  const releaseSwipeCapture = () => {
    const pointerId = swipeGesture?.pointerId;
    if (pointerId !== undefined && panel.hasPointerCapture(pointerId)) {
      panel.releasePointerCapture(pointerId);
    }
  };

  const clearSwipePresentation = () => {
    panel.classList.remove('is-swipe-dragging');
    panel.style.removeProperty('transform');
  };

  const resetSwipeGesture = () => {
    releaseSwipeCapture();
    swipeGesture = null;
    clearSwipePresentation();
  };

  const clearCloseTimer = () => {
    if (!closeTimer) return;
    clearTimeout(closeTimer);
    closeTimer = null;
  };

  const openMenu = () => {
    clearCloseTimer();
    if (openFrame !== null) cancelAnimationFrame(openFrame);
    resetSwipeGesture();
    suppressClickUntil = 0;
    lockPageScroll();

    panel.hidden = false;

    if (backdrop) {
      backdrop.hidden = false;
    }

    openFrame = requestAnimationFrame(() => {
      openFrame = null;
      menu.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', '전체서비스 닫기');
      closeBtn.focus({ preventScroll: true });
    });
  };

  const closeMenu = ({ restoreFocus = false, immediate = false } = {}) => {
    clearCloseTimer();
    if (openFrame !== null) cancelAnimationFrame(openFrame);
    openFrame = null;
    resetSwipeGesture();

    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '전체서비스 열기');

    if (backdrop) {
      backdrop.hidden = true;
    }

    const finishClose = () => {
      closeTimer = null;
      if (!menu.classList.contains('is-open')) {
        panel.hidden = true;
        // 닫히는 애니메이션이 끝날 때까지 배경을 고정한다.
        unlockPageScroll();
      }
    };
    if (immediate) finishClose();
    else closeTimer = window.setTimeout(finishClose, 230);

    if (restoreFocus) {
      button.focus({ preventScroll: true });
    }
  };

  const settleSwipe = ({ shouldClose = false } = {}) => {
    if (!swipeGesture) return;

    releaseSwipeCapture();
    swipeGesture = null;
    panel.classList.remove('is-swipe-dragging');

    // 드래그 중의 위치를 한 프레임 확정한 뒤 기존 전환 효과로 이어 간다.
    panel.getBoundingClientRect();

    if (shouldClose) {
      closeMenu({ restoreFocus: true });
    }

    panel.style.removeProperty('transform');
  };

  const handleSwipePointerDown = (event) => {
    if (event.pointerType === 'touch' && !event.isPrimary) {
      resetSwipeGesture();
      return;
    }
    if (
      event.pointerType !== 'touch' ||
      !event.isPrimary ||
      !menu.classList.contains('is-open') ||
      event.clientX < BROWSER_EDGE_GUARD_PX
    ) {
      return;
    }

    suppressClickUntil = 0;
    swipeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      direction: 'pending',
    };
  };

  const lockSwipeDirection = (deltaX, deltaY, threshold = SWIPE_DIRECTION_LOCK_PX) => {
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (swipeGesture.direction === 'pending') {
      if (Math.hypot(deltaX, deltaY) < threshold) return;

      if (deltaX > 0 && absX > absY) {
        swipeGesture.direction = 'right';
        suppressClickUntil = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
        panel.classList.add('is-swipe-dragging');
        panel.setPointerCapture(swipeGesture.pointerId);
      } else if (absY > absX || deltaX <= 0) {
        swipeGesture.direction = 'ignored';
      } else {
        return;
      }
    }
  };

  const handleSwipePointerMove = (event) => {
    if (!swipeGesture || event.pointerId !== swipeGesture.pointerId) return;

    const deltaX = event.clientX - swipeGesture.startX;
    const deltaY = event.clientY - swipeGesture.startY;
    lockSwipeDirection(deltaX, deltaY);

    if (swipeGesture.direction !== 'right') return;

    if (event.cancelable) {
      event.preventDefault();
    }

    panel.style.transform = `translate3d(${Math.max(0, deltaX)}px, 0, 0)`;
  };

  const handleSwipeTouchMove = (event) => {
    if (!swipeGesture) return;
    if (event.touches.length !== 1) {
      resetSwipeGesture();
      return;
    }
    const touch = event.touches[0];
    const deltaX = touch.clientX - swipeGesture.startX;
    const deltaY = touch.clientY - swipeGesture.startY;
    if (!deltaX && !deltaY) return;

    // pointermove 취소만으로는 네이티브 스크롤을 막을 수 없다.
    // 첫 touchmove에서 방향을 정해 iOS의 세로 팬/pointercancel을 방지한다.
    lockSwipeDirection(deltaX, deltaY, 0);
    if (swipeGesture.direction !== 'right') return;
    if (event.cancelable) event.preventDefault();
    event.stopPropagation();
    panel.style.transform = `translate3d(${Math.max(0, deltaX)}px, 0, 0)`;
  };

  const handleSwipePointerEnd = (event) => {
    if (!swipeGesture || event.pointerId !== swipeGesture.pointerId) return;

    if (swipeGesture.direction !== 'right') {
      resetSwipeGesture();
      return;
    }

    const deltaX = Math.max(0, event.clientX - swipeGesture.startX);
    const elapsed = Math.max(1, performance.now() - swipeGesture.startTime);
    const velocity = deltaX / elapsed;
    const distanceThreshold = Math.min(
      120,
      Math.max(72, panel.getBoundingClientRect().width * 0.28),
    );
    const isFlick =
      deltaX >= SWIPE_MIN_FLICK_PX &&
      velocity >= SWIPE_MIN_FLICK_VELOCITY;

    suppressClickUntil = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
    settleSwipe({ shouldClose: deltaX >= distanceThreshold || isFlick });
  };

  const handleSwipePointerCancel = (event) => {
    if (!swipeGesture || event.pointerId !== swipeGesture.pointerId) return;

    if (swipeGesture.direction === 'right') {
      suppressClickUntil = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
      settleSwipe();
      return;
    }

    resetSwipeGesture();
  };

  const isCalendarManageOpen = () => {
    return menu.classList.contains('is-calendar-manage-open');
  };

  const openCalendarManage = () => {
    if (!calendarManagePanel || !calendarManageBackdrop) return false;

    closeMenu();

    calendarManagePanel.hidden = false;
    calendarManageBackdrop.hidden = false;

    requestAnimationFrame(() => {
      menu.classList.add('is-calendar-manage-open');
      document.body.classList.add('calendar-manage-open');
      calendarManageBtn?.setAttribute('aria-expanded', 'true');
      calendarManageCloseBtn?.focus();
    });

    return true;
  };

  const closeCalendarManage = ({ restoreFocus = false } = {}) => {
    if (!calendarManagePanel || !calendarManageBackdrop) return;

    menu.classList.remove('is-calendar-manage-open');
    document.body.classList.remove('calendar-manage-open');
    calendarManageBtn?.setAttribute('aria-expanded', 'false');

    window.setTimeout(() => {
      if (!isCalendarManageOpen()) {
        calendarManagePanel.hidden = true;
        calendarManageBackdrop.hidden = true;
      }
    }, 180);

    if (restoreFocus) {
      calendarManageBtn?.focus();
    }
  };

  calendarManageController = {
    open: openCalendarManage,
  };

  const toggleMenu = () => {
    if (menu.classList.contains('is-open')) {
      closeMenu({ restoreFocus: true });
      return;
    }

    if (isCalendarManageOpen()) {
      closeCalendarManage();
    }

    openMenu();
  };

  button.addEventListener('click', toggleMenu);

  panel.addEventListener('pointerdown', handleSwipePointerDown);
  panel.addEventListener('pointermove', handleSwipePointerMove, {
    passive: false,
  });
  panel.addEventListener('touchmove', handleSwipeTouchMove, {
    passive: false,
    capture: true,
  });
  panel.addEventListener('pointerup', handleSwipePointerEnd);
  panel.addEventListener('pointercancel', handleSwipePointerCancel);
  panel.addEventListener('lostpointercapture', (event) => {
    // 자식 링크의 암묵적 캡처를 패널로 옮길 때 버블링하는 이벤트는 무시한다.
    if (event.target === panel) handleSwipePointerCancel(event);
  });
  panel.addEventListener(
    'click',
    (event) => {
      if (event.detail === 0 || Date.now() > suppressClickUntil) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    },
    true,
  );

  closeBtn.addEventListener('click', () => {
    closeMenu({ restoreFocus: true });
  });

  if (backdrop) {
    backdrop.addEventListener('click', () => {
      closeMenu();
    });
  }

  links.forEach((link) => {
    link.addEventListener('click', () => {
      closeMenu();
    });
  });

  calendarManageBtn?.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    openCalendarManage();
  });

  calendarManageCloseBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeCalendarManage({ restoreFocus: true });
  });

  calendarManageBackdrop?.addEventListener('click', (event) => {
    event.stopPropagation();
    closeCalendarManage();
  });

  calendarManageLinks.forEach((link) => {
    link.addEventListener('click', () => {
      closeCalendarManage();
    });
  });

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!(target instanceof Node)) return;

    if (menu.classList.contains('is-open') && !menu.contains(target)) {
      closeMenu();
      return;
    }

    if (
      isCalendarManageOpen() &&
      calendarManagePanel &&
      !calendarManagePanel.contains(target) &&
      target !== calendarManageBackdrop
    ) {
      closeCalendarManage();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;

    if (isCalendarManageOpen()) {
      closeCalendarManage({ restoreFocus: true });
      return;
    }

    if (!menu.classList.contains('is-open')) return;

    closeMenu({ restoreFocus: true });
  });

  // 다음 페이지의 스크롤 위치를 닫기 타이머가 뒤늦게 덮어쓰지 않게 정리한다.
  window.addEventListener('mallin:before-pjax-swap', () => closeMenu({ immediate: true }));
  window.addEventListener('pagehide', () => closeMenu({ immediate: true }));
}
