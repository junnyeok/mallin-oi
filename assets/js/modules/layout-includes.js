// assets/js/modules/layout-includes.js
/* =================================================
  layout-includes.js
  - header/footer를 partials에서 fetch해서 주입
  - __BASE__ 토큰을 현재 페이지 깊이에 맞게 치환
  - body data-base 가 있으면 그 값을 최우선으로 사용
  - 페이지(data-page)에 따라 header/footer 로고 자동 교체
  - 현재 페이지에 맞는 nav 활성화 처리
================================================= */

function detectBasePath() {
  const body = document.body;
  const forced = body?.dataset?.base;
  if (forced) return forced;

  const path = window.location.pathname || '';
  const isSubDir = path.includes('/account/') || path.includes('/menu/');
  return isSubDir ? '../' : './';
}

async function injectPartial(whereEl, url, base) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch: ${url} (${res.status})`);

  let html = await res.text();
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
    mypage: `${base}images/logo-home.png`,
    write: `${base}images/logo-home.png`,
    post: `${base}images/logo-home.png`, // 상세페이지는 post-detail.js에서 카테고리별 재적용
  };

  return map[page] || `${base}images/logo-home.png`;
}

function applyPageLogos(base) {
  const page = (document.body?.dataset?.page || '').trim().toLowerCase();
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
  const page = (document.body?.dataset?.page || '').trim().toLowerCase();
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

  const headerHost = document.querySelector('[data-include="header"]');
  const footerHost = document.querySelector('[data-include="footer"]');

  if (!headerHost && !footerHost) return;

  try {
    if (headerHost) {
      await injectPartial(headerHost, `${base}partials/header.html`, base);
    }

    if (footerHost) {
      await injectPartial(footerHost, `${base}partials/footer.html`, base);
    }

    applyPageLogos(base);
    applyCurrentNav(base);

    const year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  } catch (err) {
    console.error('[layout-includes] error:', err);
  }
}
