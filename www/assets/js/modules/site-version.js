// assets/js/modules/site-version.js

const FALLBACK_SITE_VERSION = 'dev';

export const SITE_VERSION = String(
  window.__SITE_VERSION__ || FALLBACK_SITE_VERSION,
).trim();
const VERSION_STORAGE_KEY = 'mallin_site_version';
const ACKNOWLEDGED_VERSION_STORAGE_KEY = 'mallin_site_acknowledged_version';
const PENDING_VERSION_STORAGE_KEY = 'mallin_site_pending_update_version';

function getStoredVersion(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn('[site-version] storage read failed:', error);
    return null;
  }
}

function setStoredVersion(key, version) {
  const normalizedVersion = String(version || '').trim();
  if (!normalizedVersion) return;

  try {
    localStorage.setItem(key, normalizedVersion);
  } catch (error) {
    console.warn('[site-version] storage write failed:', error);
  }
}

function removeStoredVersion(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn('[site-version] storage remove failed:', error);
  }
}

function isExternalPath(path = '') {
  return /^(https?:)?\/\//i.test(path);
}

function isSpecialPath(path = '') {
  return /^(data:|blob:|mailto:|tel:|javascript:)/i.test(path);
}

function isSiteRootAssetPath(path = '') {
  return /^(?:\.\/)?(?:images|assets|partials)\//i.test(
    String(path || '').trim(),
  );
}

function normalizePath(path = '') {
  return String(path || '').replace(/^\.?\//, '');
}

function getSiteBasePath() {
  const parts = window.location.pathname.split('/').filter(Boolean);

  if (window.location.hostname.endsWith('github.io') && parts.length > 0) {
    return `/${parts[0]}/`;
  }

  return '/';
}

function toSiteAbsolutePath(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return raw;
  if (isExternalPath(raw) || isSpecialPath(raw)) return raw;

  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const noHash = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;

  if (isSiteRootAssetPath(noHash)) {
    const queryIndex = noHash.indexOf('?');
    const pathname = queryIndex >= 0 ? noHash.slice(0, queryIndex) : noHash;
    const search = queryIndex >= 0 ? noHash.slice(queryIndex) : '';

    return `${getSiteBasePath()}${normalizePath(pathname)}${search}${hash}`;
  }

  const url = new URL(noHash, window.location.href);

  if (url.origin !== window.location.origin) {
    return `${url.toString()}${hash}`;
  }

  const siteBase = getSiteBasePath();

  let relativePath = url.pathname;

  if (relativePath.startsWith(siteBase)) {
    relativePath = relativePath.slice(siteBase.length);
  } else if (relativePath.startsWith('/')) {
    relativePath = relativePath.slice(1);
  }

  const normalized = normalizePath(relativePath);

  return `${siteBase}${normalized}${url.search}${hash}`;
}

export function withAssetVersion(path = '') {
  const absolutePath = toSiteAbsolutePath(path);
  if (!absolutePath) return absolutePath;
  if (isExternalPath(absolutePath) || isSpecialPath(absolutePath)) {
    return absolutePath;
  }

  const hashIndex = absolutePath.indexOf('#');
  const hash = hashIndex >= 0 ? absolutePath.slice(hashIndex) : '';
  const noHash =
    hashIndex >= 0 ? absolutePath.slice(0, hashIndex) : absolutePath;

  const url = new URL(noHash, window.location.origin);
  url.searchParams.set('v', SITE_VERSION);

  return `${url.pathname}${url.search}${hash}`;
}

export function getVersionChangeInfo() {
  const prevVersion = getStoredVersion(VERSION_STORAGE_KEY);
  const acknowledgedVersion = getStoredVersion(ACKNOWLEDGED_VERSION_STORAGE_KEY);
  const pendingVersion = getStoredVersion(PENDING_VERSION_STORAGE_KEY);
  const changed = prevVersion !== null && prevVersion !== SITE_VERSION;
  const alreadyAcknowledged =
    acknowledgedVersion === SITE_VERSION || pendingVersion === SITE_VERSION;

  return {
    prevVersion,
    currentVersion: SITE_VERSION,
    acknowledgedVersion,
    pendingVersion,
    changed,
    shouldShowUpdate: changed && !alreadyAcknowledged,
    firstVisit: prevVersion === null,
  };
}

export async function clearOldStaticCaches() {
  // Supabase 세션과 자동로그인 정책은 localStorage에 있으므로
  // 버전 갱신에서는 Cache Storage와 service worker만 정리한다.
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

export function markVersionUpdateAcknowledged(version = SITE_VERSION) {
  const targetVersion = String(version || SITE_VERSION).trim();
  setStoredVersion(ACKNOWLEDGED_VERSION_STORAGE_KEY, targetVersion);
  setStoredVersion(PENDING_VERSION_STORAGE_KEY, targetVersion);
}

export function markCurrentVersionApplied(version = SITE_VERSION) {
  const targetVersion = String(version || SITE_VERSION).trim();
  setStoredVersion(VERSION_STORAGE_KEY, targetVersion);

  if (getStoredVersion(PENDING_VERSION_STORAGE_KEY) === targetVersion) {
    removeStoredVersion(PENDING_VERSION_STORAGE_KEY);
  }
}

export async function applyVersionUpdateAndReload(version = SITE_VERSION) {
  const targetVersion = String(version || SITE_VERSION).trim();
  markVersionUpdateAcknowledged(targetVersion);

  await clearOldStaticCaches();
  markCurrentVersionApplied(targetVersion);

  const url = new URL(window.location.href);
  url.searchParams.set('_updated', targetVersion);
  window.location.replace(url.toString());
}
