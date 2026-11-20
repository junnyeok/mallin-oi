// assets/js/modules/site-version.js

const FALLBACK_SITE_VERSION = 'dev';

export const SITE_VERSION = String(
  window.__SITE_VERSION__ || FALLBACK_SITE_VERSION,
).trim();
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

const versionManifest = new URL('../../version.json?check', import.meta.url);
const updateInterval = 60_000;
let updatesInitialized = false;

function hasPendingEdits() {
  // These flows can hold attachments, an in-flight login, or a one-time code.
  if (
    document.querySelector('#writeForm, #loginForm, .mfa-form') ||
    window.location.pathname.includes('/account/')
  ) return true;
  if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return true;

  // Rich comment editors also mirror sticker-only drafts into their source textareas.
  return [...document.querySelectorAll(
    '#commentBody, [data-role="reply-textarea"], [data-role="comment-edit-textarea"]',
  )].some(field => field.value !== field.defaultValue);
}

export function initSiteAutoUpdates() {
  if (updatesInitialized) return;
  updatesInitialized = true;

  let checking = false;
  let reloading = false;
  const editedFields = new Set();
  const trackEdit = ({ target }) => {
    if (target.matches?.('input, textarea, select, [contenteditable="true"]')) {
      editedFields.add(target);
    }
  };
  document.addEventListener('input', trackEdit, true);
  document.addEventListener('change', trackEdit, true);

  function hasEditedFields() {
    for (const field of editedFields) {
      if (!field.isConnected || field.closest('[hidden]')) {
        editedFields.delete(field);
        continue;
      }
      if (field.isContentEditable) {
        if (field.textContent.trim() || field.querySelector('img')) return true;
      } else if (field.type === 'checkbox' || field.type === 'radio') {
        if (field.checked !== field.defaultChecked) return true;
      } else if (field.tagName === 'SELECT') {
        const options = [...field.options];
        const hasDefault = options.some(option => option.defaultSelected);
        if (options.some((option, index) => option.selected !==
            (option.defaultSelected || (!hasDefault && !field.multiple && index === 0)))) return true;
      } else if (field.value !== field.defaultValue) {
        return true;
      }
      editedFields.delete(field);
    }
    return false;
  }

  async function check() {
    if (checking || reloading || document.hidden || navigator.onLine === false) return;
    checking = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(versionManifest, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) return;
      const { siteVersion } = await response.json();
      if (typeof siteVersion !== 'string' || !siteVersion.trim()) return;
      const latest = siteVersion.trim();
      if (latest === SITE_VERSION || document.hidden || hasPendingEdits() || hasEditedFields()) return;

      const url = new URL(window.location.href);
      // If the host serves a stale bundle after the reload, don't loop on this release.
      if (url.searchParams.get('_updated') === latest) return;
      url.searchParams.set('_updated', latest);
      reloading = true;
      window.location.replace(url.href);
    } catch {
      // A failed check leaves the current page usable and is retried on the next check.
    } finally {
      clearTimeout(timeout);
      checking = false;
    }
  }

  window.setInterval(check, updateInterval);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('online', check);
  window.addEventListener('pageshow', event => { if (event.persisted) void check(); });
  void check();
}
