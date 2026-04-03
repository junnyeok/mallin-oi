// assets/js/modules/site-version.js

const FALLBACK_SITE_VERSION = 'dev';

export const SITE_VERSION = String(
  window.__SITE_VERSION__ || FALLBACK_SITE_VERSION,
).trim();
const VERSION_STORAGE_KEY = 'mallin_site_version';

function isExternalPath(path = '') {
  return /^(https?:)?\/\//i.test(path);
}

function isSpecialPath(path = '') {
  return /^(data:|blob:|mailto:|tel:|javascript:)/i.test(path);
}

export function withAssetVersion(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return raw;
  if (isExternalPath(raw) || isSpecialPath(raw)) return raw;

  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const noHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;

  const url = new URL(noHash, window.location.href);
  url.searchParams.set('v', SITE_VERSION);

  return `${url.pathname}${url.search}${hash}`;
}

export function getVersionChangeInfo() {
  const prevVersion = localStorage.getItem(VERSION_STORAGE_KEY);
  const changed = prevVersion !== null && prevVersion !== SITE_VERSION;

  return {
    prevVersion,
    currentVersion: SITE_VERSION,
    changed,
    firstVisit: prevVersion === null,
  };
}

export async function clearOldStaticCaches() {
  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  } catch (error) {
    console.error('[site-version] cache delete failed:', error);
  }

  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((reg) => reg.unregister()));
    }
  } catch (error) {
    console.error('[site-version] service worker unregister failed:', error);
  }
}

export function markCurrentVersionApplied() {
  localStorage.setItem(VERSION_STORAGE_KEY, SITE_VERSION);
}

export async function applyVersionUpdateAndReload() {
  await clearOldStaticCaches();
  markCurrentVersionApplied();

  const url = new URL(window.location.href);
  url.searchParams.set('_updated', SITE_VERSION);
  window.location.replace(url.toString());
}
