// assets/js/boot.js

const FALLBACK_SITE_VERSION = 'dev';

function isInAccountFolder() {
  return window.location.pathname.includes('/account/');
}

function getVersionJsonPath() {
  return isInAccountFolder()
    ? '../assets/version.json'
    : './assets/version.json';
}

function getMainJsPath() {
  return isInAccountFolder() ? '../assets/js/main.js' : './assets/js/main.js';
}

async function loadSiteVersion() {
  const versionUrl = new URL(getVersionJsonPath(), window.location.href);

  try {
    const response = await fetch(versionUrl.href, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error(`version.json load failed: ${response.status}`);
    }

    const data = await response.json();
    const siteVersion = String(data?.siteVersion || '').trim();

    if (!siteVersion) {
      throw new Error('siteVersion is empty');
    }

    return siteVersion;
  } catch (error) {
    console.warn('[boot] version load fallback:', error);
    return FALLBACK_SITE_VERSION;
  }
}

(async () => {
  try {
    const siteVersion = await loadSiteVersion();
    window.__SITE_VERSION__ = siteVersion;

    const mainUrl = new URL(getMainJsPath(), window.location.href);
    mainUrl.searchParams.set('v', siteVersion);

    await import(mainUrl.href);
  } catch (error) {
    console.error('[boot] main load failed:', error);
  }
})();
