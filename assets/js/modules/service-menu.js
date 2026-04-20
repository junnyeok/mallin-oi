// assets/js/modules/service-menu.js

const MOBILE_QUERY = '(max-width: 700px)';

function isMobileViewport() {
  return window.matchMedia(MOBILE_QUERY).matches;
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
  const links = menu.querySelectorAll('.service-menu__link');

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
      backdrop.hidden = !isMobileViewport();
    }

    requestAnimationFrame(() => {
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
      }
    }, 230);

    if (restoreFocus) {
      button.focus();
    }
  };

  const toggleMenu = () => {
    if (menu.classList.contains('is-open')) {
      closeMenu({ restoreFocus: true });
      return;
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

  document.addEventListener('click', (event) => {
    if (!menu.classList.contains('is-open')) return;

    const target = event.target;
    if (!(target instanceof Node)) return;

    if (!menu.contains(target)) {
      closeMenu();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!menu.classList.contains('is-open')) return;

    closeMenu({ restoreFocus: true });
  });

  window.addEventListener('resize', () => {
    if (!menu.classList.contains('is-open')) {
      document.body.classList.remove('service-menu-open');
      return;
    }

    if (isMobileViewport()) {
      if (backdrop) backdrop.hidden = false;
      document.body.classList.add('service-menu-open');
      return;
    }

    if (backdrop) backdrop.hidden = true;
    document.body.classList.remove('service-menu-open');
  });
}
