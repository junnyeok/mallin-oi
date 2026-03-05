// assets/js/modules/layout-includes.js
/* =================================================
  layout-includes.js
  - header/footer를 partials에서 fetch해서 주입
  - __BASE__ 토큰을 현재 페이지 깊이에 맞게 치환
  - body data-base 가 있으면 그 값을 최우선으로 사용
  - ✅ 페이지(data-page)에 따라 header/footer 로고 자동 교체
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

/** ✅ 페이지별 로고 매핑 (파일명은 네 프로젝트에 맞게 수정 가능) */
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
  };

  return map[page] || `${base}images/logo-home.png`;
}

function applyPageLogos(base) {
  const page = document.body?.dataset?.page || '';
  const src = getLogoSrcByPage(page, base);

  // header logo
  const headerLogo = document.getElementById('siteLogoImg');
  if (headerLogo) headerLogo.src = src;

  // footer logo
  const footerLogo = document.getElementById('footerLogoImg');
  if (footerLogo) footerLogo.src = src;
}

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

    // ✅ header/footer 둘 다 주입된 뒤 로고 교체
    applyPageLogos(base);

    // footer year
    const year = document.getElementById('year');
    if (year) year.textContent = String(new Date().getFullYear());
  } catch (err) {
    console.error('[layout-includes] error:', err);
  }
}
