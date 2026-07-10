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

  const clearCloseTimer = () => {
    if (!closeTimer) return;
    clearTimeout(closeTimer);
    closeTimer = null;
  };

  const openMenu = () => {
    clearCloseTimer();

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
