// assets/js/modules/layout-includes.js

function normalizeBase(base) {
  const value = String(base || './').trim();
  if (!value) return './';
  return value.endsWith('/') ? value : `${value}/`;
}

function detectBasePath() {
  const forced = document.body?.dataset?.base;
  if (forced) return normalizeBase(forced);

  const path = window.location.pathname || '';
  const isSubDir =
    path.includes('/account/') ||
    path.includes('/menu/') ||
    path.includes('/account') ||
    path.includes('/menu');

  return isSubDir ? '../' : './';
}

async function fetchPartial(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) {
    throw new Error(`Failed to fetch: ${url} (${res.status})`);
  }
  return res.text();
}

async function injectPartial(whereEl, fileName, base) {
  if (!whereEl) return;

  const url = new URL(
    `${base}partials/${fileName}`,
    window.location.href,
  ).toString();

  let html = await fetchPartial(url);
  html = html.replaceAll('__BASE__', base);
  whereEl.innerHTML = html;
}

/* ================= 로고 ================= */

function getLogoSrcByPage(page, base) {
  const map = {
    home: `${base}images/logo-home.png`,
    index: `${base}images/logo-home.png`,
    study: `${base}images/logo-study.png`,
    'calendar-study': `${base}images/logo-study.png`,
    work: `${base}images/logo-work.png`,
    'calendar-work': `${base}images/logo-work.png`,
    event: `${base}images/logo-event.png`,
    'calendar-event': `${base}images/logo-event.png`,
    career: `${base}images/logo-career.png`,
    login: `${base}images/logo-home.png`,
    signup: `${base}images/logo-home.png`,
    profile: `${base}images/logo-home.png`,
    mypage: `${base}images/logo-home.png`,
    write: `${base}images/logo-home.png`,
    post: `${base}images/logo-home.png`,
    'posts-all': `${base}images/logo-home.png`,
    'prev-mypage': `${base}images/logo-home.png`,
    'find-password': `${base}images/logo-home.png`,
    'reset-password': `${base}images/logo-home.png`,
    'profile-history': `${base}images/logo-home.png`,
    store: `${base}images/logo-home.png`,
    'store-item': `${base}images/logo-home.png`,
  };

  return map[page] || `${base}images/logo-home.png`;
}

function applyPageLogos(base) {
  const page = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  const src = getLogoSrcByPage(page, base);

  const headerLogo = document.getElementById('siteLogoImg');
  if (headerLogo) headerLogo.src = src;

  const footerLogo = document.getElementById('footerLogoImg');
  if (footerLogo) footerLogo.src = src;
}

function applyLayoutBase(base) {
  const setHref = (selector, href) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.setAttribute('href', href);
    });
  };

  const setSrc = (selector, src) => {
    document.querySelectorAll(selector).forEach((el) => {
      el.setAttribute('src', src);
    });
  };

  // header
  setHref('.site-header .logo', `${base}index.html`);
  setHref('.site-header .write-btn--all', `${base}posts-all.html`);
  setHref('.site-header .write-btn[href*="write.html"]', `${base}write.html`);
  setHref('.site-header [data-profile-btn]', `${base}login.html`);
  setHref('.site-header [data-auth-link]', `${base}login.html`);
  setHref('.site-header [data-mypage-link]', `${base}prev-mypage.html`);

  setHref(
    '.site-header .site-nav__link[href*="index.html"]',
    `${base}index.html`,
  );
  setHref(
    '.site-header .site-nav__link[href*="study.html"]',
    `${base}study.html`,
  );
  setHref(
    '.site-header .site-nav__link[href*="work.html"]',
    `${base}work.html`,
  );
  setHref(
    '.site-header .site-nav__link[href*="event.html"]',
    `${base}event.html`,
  );
  setHref(
    '.site-header .site-nav__link[href*="career.html"]',
    `${base}career.html`,
  );

  setSrc('#siteLogoImg', `${base}images/logo-home.png`);
  setSrc('#siteLogoWord', `${base}images/logo-word.png`);

  // footer
  setHref('.site-footer .footer-brand__logo', `${base}index.html`);
  setHref('.site-footer .footer-link[href*="study.html"]', `${base}study.html`);
  setHref('.site-footer .footer-link[href*="work.html"]', `${base}work.html`);
  setHref('.site-footer .footer-link[href*="event.html"]', `${base}event.html`);
  setHref(
    '.site-footer .footer-link[href*="career.html"]',
    `${base}career.html`,
  );

  setSrc('#footerLogoImg', `${base}images/logo-home.png`);
}

/* ================= nav 활성화 ================= */

function getNavHrefByPage(page, base) {
  const map = {
    home: `${base}index.html`,
    index: `${base}index.html`,
    study: `${base}study.html`,
    'calendar-study': `${base}study.html`,
    work: `${base}work.html`,
    'calendar-work': `${base}work.html`,
    event: `${base}event.html`,
    'calendar-event': `${base}event.html`,
    career: `${base}career.html`,
  };

  return map[page] || '';
}

function applyCurrentNav(base) {
  const page = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  const currentHref = getNavHrefByPage(page, base);
  const links = document.querySelectorAll('.site-nav__link');

  if (!links.length) return;

  links.forEach((link) => {
    link.removeAttribute('aria-current');
    link.classList.remove('is-active');
  });

  if (!currentHref) return;

  links.forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (href === currentHref) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('is-active');
    }
  });
}

function applyYear() {
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}

const GLOBAL_FLOATING_MODAL_CLASS = 'has-global-floating-modal';
const MODAL_STATE_CLASSES = [
  'attendance-popup-open',
  'study-category-modal-open',
  'work-category-modal-open',
  'event-category-modal-open',
  'work-repeat-modal-open',
];
const GLOBAL_FLOATING_MENU_IDS = [
  'notificationMenu',
  'bgmMenu',
  'pickleMenu',
];
const OPEN_MODAL_SELECTORS = [
  '.attendance-popup',
  '.login-required-popup.is-open',
  '.study-category-manager__modal:not([hidden])',
  '.work-category-manager__modal:not([hidden])',
  '.event-category-manager__modal:not([hidden])',
  '.work-repeat__modal:not([hidden])',
  '[role="dialog"][aria-modal="true"]:not([hidden])',
].join(',');

let globalFloatingObserver = null;
let globalFloatingRaf = null;
let globalFloatingLifecycleBound = false;

function isVisibleModalElement(el) {
  if (!el || el.hidden || el.closest('[hidden]')) return false;

  const style = window.getComputedStyle?.(el);
  if (!style) return true;

  return style.display !== 'none' && style.visibility !== 'hidden';
}

function hasOpenModalState() {
  const hasModalStateClass = MODAL_STATE_CLASSES.some(
    (className) =>
      document.body?.classList.contains(className) ||
      document.documentElement?.classList.contains(className),
  );
  const hasVisibleModal = Array.from(
    document.querySelectorAll(OPEN_MODAL_SELECTORS),
  ).some(isVisibleModalElement);

  return hasVisibleModal || (hasModalStateClass && hasVisibleModal);
}

function setGlobalFloatingMenusHidden(isHidden) {
  GLOBAL_FLOATING_MENU_IDS.forEach((id) => {
    const menu = document.getElementById(id);
    if (!menu) return;

    if (isHidden) {
      menu.setAttribute('aria-hidden', 'true');
      menu.setAttribute('inert', '');
      menu.inert = true;

      if (menu.contains(document.activeElement)) {
        document.activeElement?.blur?.();
      }
      return;
    }

    if (menu.getAttribute('aria-hidden') === 'true') {
      menu.removeAttribute('aria-hidden');
    }
    menu.removeAttribute('inert');
    menu.inert = false;
  });
}

function updateGlobalFloatingState() {
  globalFloatingRaf = null;

  const isHidden = hasOpenModalState();
  document.body?.classList.toggle(GLOBAL_FLOATING_MODAL_CLASS, isHidden);
  setGlobalFloatingMenusHidden(isHidden);
}

function scheduleGlobalFloatingStateUpdate() {
  if (globalFloatingRaf) return;
  globalFloatingRaf = window.requestAnimationFrame(updateGlobalFloatingState);
}

function clearGlobalFloatingModalState() {
  if (globalFloatingRaf) {
    window.cancelAnimationFrame(globalFloatingRaf);
    globalFloatingRaf = null;
  }

  MODAL_STATE_CLASSES.forEach((className) => {
    document.body?.classList.remove(className);
    document.documentElement?.classList.remove(className);
  });
  document.body?.classList.remove(GLOBAL_FLOATING_MODAL_CLASS);
  setGlobalFloatingMenusHidden(false);
}

function initGlobalFloatingModalState() {
  if (!document.body) return;

  if (!globalFloatingObserver) {
    globalFloatingObserver = new MutationObserver(
      scheduleGlobalFloatingStateUpdate,
    );
    globalFloatingObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    globalFloatingObserver.observe(document.body, {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: ['class', 'hidden', 'style'],
    });
  }

  if (!globalFloatingLifecycleBound) {
    globalFloatingLifecycleBound = true;
    window.addEventListener(
      'mallin:before-pjax-swap',
      clearGlobalFloatingModalState,
    );
    window.addEventListener('pagehide', clearGlobalFloatingModalState);
  }

  scheduleGlobalFloatingStateUpdate();
}

export async function refreshLayoutState() {
  const base = detectBasePath();

  if (document.body) {
    document.body.dataset.base = base;
  }

  applyLayoutBase(base);
  applyPageLogos(base);
  applyCurrentNav(base);
  applyYear();
  initGlobalFloatingModalState();
}

let layoutInjected = false;

export async function initLayoutIncludes() {
  const base = detectBasePath();

  if (document.body) {
    document.body.dataset.base = base;
  }

  const headerHost = document.querySelector('[data-include="header"]');
  const footerHost = document.querySelector('[data-include="footer"]');

  if (!headerHost && !footerHost) {
    await refreshLayoutState();
    return;
  }

  if (!layoutInjected) {
    if (headerHost) {
      try {
        await injectPartial(headerHost, 'header.html', base);
      } catch (err) {
        console.error('[layout-includes] header inject error:', err);
        headerHost.innerHTML = '';
      }
    }

    if (footerHost) {
      try {
        await injectPartial(footerHost, 'footer.html', base);
      } catch (err) {
        console.error('[layout-includes] footer inject error:', err);
        footerHost.innerHTML = '';
      }
    }

    layoutInjected = true;
  }

  await refreshLayoutState();
}
