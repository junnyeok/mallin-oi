// assets/js/modules/mobile-stability.js
import { supabase } from './supabase-client.js';
import { recoverAuthSession, updateAuthUI } from './auth-store.js';

const STABILITY_INITIALIZED_KEY = '__mallinMobileStabilityInitialized';
const STABILITY_OBSERVER_KEY = '__mallinMobileStabilityObserver';
const AUTH_REFRESH_GUARD_KEY = '__mallinNativeAuthRefreshGuard';

const RECOVERABLE_BUTTON_SELECTOR = [
  '#writeSubmitBtn',
  '#commentSubmitBtn',
  '#storeItemBuyBtn',
  '#historyDeleteSelectedBtn',
  '#suggestionSubmitBtn',
  '#attendanceClaimBtn',
  'button[type="submit"]',
].join(',');

function isMobileLike() {
  return (
    window.matchMedia?.('(max-width: 700px)').matches ||
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  );
}

function isNativeCapacitor() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

function startAuthAutoRefresh() {
  try {
    supabase.auth.startAutoRefresh?.();
  } catch (error) {
    console.warn('[mobile-stability] auth auto refresh start failed:', error);
  }
}

function markStabilityMode() {
  document.documentElement.classList.toggle(
    'is-mobile-stability-mode',
    isMobileLike(),
  );
}

function shouldSkipLazyImage(img) {
  if (!img) return true;

  if (img.hasAttribute('data-no-lazy')) return true;

  const inHeader = !!img.closest('header, .site-header, .nav, .global-nav');
  if (inHeader) return true;

  const src = String(img.getAttribute('src') || '').trim();

  if (!src) return true;
  if (src.includes('favicon')) return true;
  if (src.includes('logo-word')) return true;
  if (src.includes('logo-home')) return true;

  return false;
}

function applyImageLoading(root = document) {
  const images = root.querySelectorAll?.('img') || [];

  images.forEach((img) => {
    if (shouldSkipLazyImage(img)) return;

    if (!img.hasAttribute('loading')) {
      img.setAttribute('loading', 'lazy');
    }

    if (!img.hasAttribute('decoding')) {
      img.setAttribute('decoding', 'async');
    }

    img.addEventListener(
      'error',
      () => {
        img.classList.add('is-image-load-failed');
      },
      { once: true },
    );
  });
}

function restoreButton(button) {
  if (!button) return;

  const keepDisabled =
    button.hasAttribute('data-keep-disabled') ||
    button.getAttribute('aria-disabled') === 'true';

  if (keepDisabled) return;

  button.disabled = false;
  button.removeAttribute('disabled');
  button.classList.remove('is-disabled', 'is-loading');
  button.removeAttribute('aria-busy');
}

function recoverStuckButtons() {
  document.querySelectorAll(RECOVERABLE_BUTTON_SELECTOR).forEach((button) => {
    const isBusy = button.getAttribute('aria-busy') === 'true';
    const shouldRecover = button.dataset.mobileRecover === 'true';

    if (!button.disabled) {
      button.dataset.mobileRecover = 'true';
      return;
    }

    if (isBusy && !shouldRecover) return;

    restoreButton(button);
  });
}

function installGlobalErrorHandlers() {
  window.addEventListener('error', (event) => {
    console.error('[mobile-stability] window error:', event.error || event);
    recoverStuckButtons();
  });

  window.addEventListener('unhandledrejection', (event) => {
    console.error('[mobile-stability] unhandled rejection:', event.reason);
    recoverStuckButtons();
  });
}

function installLifecycleRecovery() {
  window.addEventListener('pageshow', (event) => {
    markStabilityMode();
    applyImageLoading(document);
    startAuthAutoRefresh();

    if (event.persisted) {
      recoverStuckButtons();
    }
  });

  window.addEventListener('focus', () => {
    recoverStuckButtons();
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      markStabilityMode();
      recoverStuckButtons();
      applyImageLoading(document);
      startAuthAutoRefresh();
    }
  });
}

function installNativeAuthRefreshGuard() {
  if (!isNativeCapacitor()) return;
  if (window[AUTH_REFRESH_GUARD_KEY]) return;

  window[AUTH_REFRESH_GUARD_KEY] = true;
  startAuthAutoRefresh();

  window.Capacitor?.Plugins?.App?.addListener?.('appStateChange', (state) => {
    if (state?.isActive) {
      startAuthAutoRefresh();
      recoverAuthSession()
        .then(() => updateAuthUI())
        .catch((error) => {
          console.warn('[mobile-stability] auth recovery deferred:', error);
        });
    }
  });
}

function installMutationObserver() {
  if (window[STABILITY_OBSERVER_KEY]) return;

  const observer = new MutationObserver((mutations) => {
    let needsImageScan = false;

    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;

        if (node.matches?.('img') || node.querySelector?.('img')) {
          needsImageScan = true;
        }
      });
    });

    if (needsImageScan) {
      applyImageLoading(document);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window[STABILITY_OBSERVER_KEY] = observer;
}

function installRecoverableButtonMarker() {
  document.addEventListener(
    'click',
    (event) => {
      const button = event.target.closest?.(RECOVERABLE_BUTTON_SELECTOR);
      if (!button) return;

      button.dataset.mobileRecover = 'true';

      window.setTimeout(() => {
        if (!document.contains(button)) return;
        if (!button.disabled) return;

        const isStillBusy = button.getAttribute('aria-busy') === 'true';

        if (!isStillBusy) {
          restoreButton(button);
        }
      }, 20000);
    },
    true,
  );
}

export function initMobileStability() {
  markStabilityMode();
  applyImageLoading(document);
  recoverStuckButtons();

  if (window[STABILITY_INITIALIZED_KEY]) return;

  window[STABILITY_INITIALIZED_KEY] = true;

  installGlobalErrorHandlers();
  installLifecycleRecovery();
  installNativeAuthRefreshGuard();
  installMutationObserver();
  installRecoverableButtonMarker();
}
