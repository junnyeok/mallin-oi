// assets/js/modules/service-menu.js

const MOBILE_QUERY = '(max-width: 700px)';

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
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

  const clearCloseTimer = () => {
    if (!closeTimer) return;
    clearTimeout(closeTimer);
    closeTimer = null;
  };

  const clearMobilePanelPosition = () => {
    panel.style.removeProperty('--service-menu-panel-top');
    panel.style.removeProperty('--service-menu-panel-right');
  };

  const updateMobilePanelPosition = () => {
    if (!isMobileViewport()) {
      clearMobilePanelPosition();
      return;
    }

    const buttonRect = button.getBoundingClientRect();

    const viewportWidth =
      window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 0;

    if (!viewportWidth || !viewportHeight) return;

    const safeGap = 8;

    const panelWidth = Math.min(350, viewportWidth - 24);
    const panelRect = panel.getBoundingClientRect();
    const panelHeight = panelRect.height || 0;

    const closeSize = 36;
    const panelPadding = 16;

    const closeCenterOffsetX = panelPadding + closeSize / 2;
    const closeCenterOffsetY = panelPadding + closeSize / 2;

    const buttonCenterX = buttonRect.left + buttonRect.width / 2;
    const buttonCenterY = buttonRect.top + buttonRect.height / 2;

    let panelRight = viewportWidth - buttonCenterX - closeCenterOffsetX;
    let panelTop = buttonCenterY - closeCenterOffsetY;

    const maxRight = Math.max(safeGap, viewportWidth - panelWidth - safeGap);
    panelRight = clampNumber(panelRight, safeGap, maxRight);

    if (panelHeight > 0) {
      const maxTop = Math.max(safeGap, viewportHeight - panelHeight - safeGap);
      panelTop = clampNumber(panelTop, safeGap, maxTop);
    } else {
      panelTop = Math.max(panelTop, safeGap);
    }

    panel.style.setProperty(
      '--service-menu-panel-top',
      `${Math.round(panelTop)}px`,
    );
    panel.style.setProperty(
      '--service-menu-panel-right',
      `${Math.round(panelRight)}px`,
    );
  };

  const openMenu = () => {
    clearCloseTimer();

    panel.hidden = false;
    updateMobilePanelPosition();

    if (backdrop) {
      backdrop.hidden = !isMobileViewport();
    }

    requestAnimationFrame(() => {
      updateMobilePanelPosition();

      menu.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');

      if (isMobileViewport()) {
        document.body.classList.add('service-menu-open');
      } else {
        document.body.classList.remove('service-menu-open');
      }

      closeBtn.focus();
    });
  };

  const closeMenu = ({ restoreFocus = false } = {}) => {
    clearCloseTimer();

    menu.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('service-menu-open');

    if (backdrop) {
      backdrop.hidden = true;
    }

    closeTimer = window.setTimeout(() => {
      if (!menu.classList.contains('is-open')) {
        panel.hidden = true;
        clearMobilePanelPosition();
      }
    }, 230);

    if (restoreFocus) {
      button.focus();
    }
  };

  const isCalendarManageOpen = () => {
    return menu.classList.contains('is-calendar-manage-open');
  };

  const openCalendarManage = () => {
    if (!calendarManagePanel || !calendarManageBackdrop) return;

    closeMenu();

    calendarManagePanel.hidden = false;
    calendarManageBackdrop.hidden = false;

    requestAnimationFrame(() => {
      menu.classList.add('is-calendar-manage-open');
      document.body.classList.add('calendar-manage-open');
      calendarManageBtn?.setAttribute('aria-expanded', 'true');
      calendarManageCloseBtn?.focus();
    });
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
    if (!menu.classList.contains('is-open')) {
      document.body.classList.remove('service-menu-open');
      clearMobilePanelPosition();
      return;
    }

    updateMobilePanelPosition();

    if (isMobileViewport()) {
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add('service-menu-open');
      return;
    }

    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('service-menu-open');
  });

  window.addEventListener(
    'scroll',
    () => {
      if (!menu.classList.contains('is-open')) return;
      updateMobilePanelPosition();
    },
    { passive: true },
  );
}
