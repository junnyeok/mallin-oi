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
    work: `${base}images/logo-work.png`,
    event: `${base}images/logo-event.png`,
    career: `${base}images/logo-career.png`,
    login: `${base}images/logo-home.png`,
    signup: `${base}images/logo-home.png`,
    profile: `${base}images/logo-home.png`,
    mypage: `${base}images/logo-home.png`,
    write: `${base}images/logo-home.png`,
    post: `${base}images/logo-home.png`,
    'posts-all': `${base}images/logo-home.png`,
    'prev-mypage': `${base}images/logo-home.png`,
    'find-id': `${base}images/logo-home.png`,
    'find-password': `${base}images/logo-home.png`,
    'reset-password': `${base}images/logo-home.png`,
    'profile-history': `${base}images/logo-home.png`,
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

/* ================= nav 활성화 ================= */

function getNavHrefByPage(page, base) {
  const map = {
    home: `${base}index.html`,
    index: `${base}index.html`,
    study: `${base}study.html`,
    work: `${base}work.html`,
    event: `${base}event.html`,
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

/* ================= init ================= */

export async function initLayoutIncludes() {
  const base = detectBasePath();

  if (document.body) {
    document.body.dataset.base = base;
  }

  const headerHost = document.querySelector('[data-include="header"]');
  const footerHost = document.querySelector('[data-include="footer"]');

  if (!headerHost && !footerHost) return;

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

  applyPageLogos(base);
  applyCurrentNav(base);

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
}
