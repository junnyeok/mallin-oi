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
  let swipeGesture = null;
  let suppressClickUntil = 0;

  const SWIPE_DIRECTION_LOCK_PX = 10;
  const SWIPE_DIRECTION_RATIO = 1.25;
  const SWIPE_MIN_FLICK_PX = 48;
  const SWIPE_MIN_FLICK_VELOCITY = 0.5;
  const SWIPE_CLICK_SUPPRESSION_MS = 500;
  // iOS의 화면 왼쪽 가장자리 시스템 뒤로가기 영역과 경쟁하지 않는다.
  const BROWSER_EDGE_GUARD_PX = 32;

  const clearSwipePresentation = () => {
    panel.classList.remove('is-swipe-dragging');
    panel.style.removeProperty('transform');
  };

  const resetSwipeGesture = () => {
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
    resetSwipeGesture();

    panel.hidden = false;

    if (backdrop) {
      backdrop.hidden = false;
    }

    requestAnimationFrame(() => {
      menu.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
      button.setAttribute('aria-label', '전체서비스 닫기');
      document.body.classList.add('service-menu-open');
      closeBtn.focus();
    });
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    clearCloseTimer();

    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', '전체서비스 열기');
    document.body.classList.remove('service-menu-open');

    if (backdrop) {
      backdrop.hidden = true;
    }

    closeTimer = window.setTimeout(() => {
      if (!menu.classList.contains('is-open')) {
        panel.hidden = true;
      }
    }, 230);

    if (restoreFocus) {
      button.focus();
    }
  };

  const settleSwipe = ({ shouldClose = false } = {}) => {
    if (!swipeGesture) return;

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
    if (
      event.pointerType !== 'touch' ||
      !event.isPrimary ||
      !menu.classList.contains('is-open') ||
      event.clientX < BROWSER_EDGE_GUARD_PX
    ) {
      return;
    }

    swipeGesture = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: performance.now(),
      direction: 'pending',
    };
  };

  const handleSwipePointerMove = (event) => {
    if (!swipeGesture || event.pointerId !== swipeGesture.pointerId) return;

    const deltaX = event.clientX - swipeGesture.startX;
    const deltaY = event.clientY - swipeGesture.startY;
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);

    if (swipeGesture.direction === 'pending') {
      if (Math.hypot(deltaX, deltaY) < SWIPE_DIRECTION_LOCK_PX) return;

      if (deltaX > 0 && absX > absY * SWIPE_DIRECTION_RATIO) {
        swipeGesture.direction = 'right';
        suppressClickUntil = Date.now() + SWIPE_CLICK_SUPPRESSION_MS;
        panel.classList.add('is-swipe-dragging');
      } else if (absY > absX || deltaX <= 0) {
        swipeGesture.direction = 'ignored';
      } else {
        return;
      }
    }

    if (swipeGesture.direction !== 'right') return;

    if (event.cancelable) {
      event.preventDefault();
    }

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
  panel.addEventListener('pointerup', handleSwipePointerEnd);
  panel.addEventListener('pointercancel', handleSwipePointerCancel);
  panel.addEventListener(
    'click',
    (event) => {
      if (Date.now() > suppressClickUntil) return;

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

  window.addEventListener('resize', () => {
    if (menu.classList.contains('is-open')) return;
    document.body.classList.remove('service-menu-open');
  });
}
