// assets/js/modules/pwa-install.js

const DISMISS_KEY = 'mallin:pwa-install-dismissed-at';
const INSTALLED_KEY = 'mallin:pwa-installed';
const DISMISS_DAYS = 7;

let deferredInstallPrompt = null;
let initialized = false;

function isInAccountFolder() {
  return window.location.pathname.includes('/account/');
}

function getAssetBasePath() {
  return isInAccountFolder() ? '../' : './';
}

function getSiteVersion() {
  return String(window.__SITE_VERSION__ || 'dev').trim();
}

function withVersion(path) {
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}v=${encodeURIComponent(getSiteVersion())}`;
}

function isStandaloneMode() {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIosSafari() {
  const ua = window.navigator.userAgent || '';
  const isIos = /iphone|ipad|ipod/i.test(ua);
  const isSafari = /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);

  return isIos && isSafari;
}

function isMobileLike() {
  return (
    window.matchMedia?.('(max-width: 760px)').matches ||
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  );
}

function wasDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;

  const dismissedAt = Number(raw);
  if (!Number.isFinite(dismissedAt)) return false;

  const elapsed = Date.now() - dismissedAt;
  return elapsed < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

function markDismissed() {
  localStorage.setItem(DISMISS_KEY, String(Date.now()));
}

function markInstalled() {
  localStorage.setItem(INSTALLED_KEY, 'true');
}

function hasInstalledBefore() {
  return localStorage.getItem(INSTALLED_KEY) === 'true';
}

function loadPwaCss() {
  const id = 'pwa-install-css';
  if (document.getElementById(id)) return;

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = withVersion(
    `${getAssetBasePath()}assets/css/components/pwa-install.css`,
  );

  document.head.append(link);
}

function removeInstallBanner() {
  document.getElementById('pwaInstallBanner')?.remove();
}

function shouldHideInstallUi() {
  return isStandaloneMode() || hasInstalledBefore() || wasDismissedRecently();
}

function createInstallBanner({ mode }) {
  removeInstallBanner();

  if (shouldHideInstallUi()) return;
  if (!isMobileLike()) return;

  const isIos = mode === 'ios';

  const wrap = document.createElement('div');
  wrap.className = 'pwa-install';
  wrap.id = 'pwaInstallBanner';

  const card = document.createElement('section');
  card.className = 'pwa-install__card';
  card.setAttribute('aria-label', '앱 설치 안내');

  const icon = document.createElement('img');
  icon.className = 'pwa-install__icon';
  icon.src = `${getAssetBasePath()}images/android-chrome-192x192.png`;
  icon.alt = '';

  const body = document.createElement('div');
  body.className = 'pwa-install__body';

  const title = document.createElement('p');
  title.className = 'pwa-install__title';
  title.textContent = isIos
    ? '홈 화면에 추가해서 앱처럼 써봐'
    : '말린오이닷컴을 앱으로 설치해봐';

  const desc = document.createElement('p');
  desc.className = 'pwa-install__desc';
  desc.textContent = isIos
    ? 'Safari 공유 버튼을 누른 뒤 “홈 화면에 추가”를 선택하면 돼.'
    : '설치하면 홈 화면에서 바로 열 수 있어.';

  body.append(title, desc);

  const actions = document.createElement('div');
  actions.className = 'pwa-install__actions';

  const primaryButton = document.createElement('button');
  primaryButton.type = 'button';
  primaryButton.className = 'pwa-install__button';
  primaryButton.textContent = isIos ? '확인' : '앱 설치';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'pwa-install__button pwa-install__button--ghost';
  closeButton.setAttribute('aria-label', '앱 설치 안내 닫기');
  closeButton.textContent = '×';

  primaryButton.addEventListener('click', async () => {
    if (isIos) {
      markDismissed();
      removeInstallBanner();
      return;
    }

    if (!deferredInstallPrompt) {
      markDismissed();
      removeInstallBanner();
      return;
    }

    deferredInstallPrompt.prompt();

    const choice = await deferredInstallPrompt.userChoice.catch(() => null);

    if (choice?.outcome === 'accepted') {
      markInstalled();
    } else {
      markDismissed();
    }

    deferredInstallPrompt = null;
    removeInstallBanner();
  });

  closeButton.addEventListener('click', () => {
    markDismissed();
    removeInstallBanner();
  });

  actions.append(primaryButton, closeButton);
  card.append(icon, body, actions);
  wrap.append(card);

  document.body.append(wrap);
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  const base = getAssetBasePath();
  const swUrl = new URL(`${base}sw.js`, window.location.href);
  const scopeUrl = new URL(base, window.location.href);

  try {
    const registration = await navigator.serviceWorker.register(swUrl.href, {
      scope: scopeUrl.pathname,
    });

    if (registration.waiting) {
      registration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (
          newWorker.state === 'installed' &&
          navigator.serviceWorker.controller
        ) {
          console.info('[pwa] new service worker installed');
        }
      });
    });
  } catch (error) {
    console.warn('[pwa] service worker register failed:', error);
  }
}

function installBeforeInstallPromptListener() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();

    deferredInstallPrompt = event;

    loadPwaCss();
    createInstallBanner({ mode: 'browser' });
  });

  window.addEventListener('appinstalled', () => {
    markInstalled();
    deferredInstallPrompt = null;
    removeInstallBanner();
  });
}

function maybeShowIosGuide() {
  if (!isIosSafari()) return;
  if (shouldHideInstallUi()) return;

  loadPwaCss();

  window.setTimeout(() => {
    createInstallBanner({ mode: 'ios' });
  }, 1200);
}

function markStandaloneClass() {
  document.documentElement.classList.toggle(
    'is-pwa-standalone',
    isStandaloneMode(),
  );
}

export async function initPwaInstall() {
  if (initialized) return;
  initialized = true;

  markStandaloneClass();
  loadPwaCss();

  await registerServiceWorker();

  installBeforeInstallPromptListener();
  maybeShowIosGuide();

  window
    .matchMedia?.('(display-mode: standalone)')
    .addEventListener?.('change', markStandaloneClass);
}
