// assets/js/modules/refresh-control.js

const INDICATOR_ID = 'pullRefreshIndicator';
const STYLE_ID = 'refreshControlStylesheet';
const REFRESH_PARAM = '_updated';
const PULL_THRESHOLD = 76;
const PULL_MAX = 104;

let clickBound = false;
let touchBound = false;
let pulling = false;
let refreshing = false;
let startX = 0;
let startY = 0;
let pullDistance = 0;
let gestureLocked = '';

function getBasePath() {
  const forced = document.body?.dataset?.base;
  if (forced) return forced.endsWith('/') ? forced : `${forced}/`;

  return window.location.pathname.includes('/account/') ? '../' : './';
}

function ensureStylesheet() {
  if (document.getElementById(STYLE_ID)) return;

  const link = document.createElement('link');
  link.id = STYLE_ID;
  link.rel = 'stylesheet';
  link.href = `${getBasePath()}assets/css/components/refresh-control.css`;
  document.head.appendChild(link);
}

function getRefreshToken(currentValue = '') {
  const version = String(window.__SITE_VERSION__ || '').trim();

  if (version && version !== currentValue) return version;

  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('');

  return `${date}-${String(Date.now()).slice(-6)}`;
}

export function getRefreshUrl() {
  const url = new URL(window.location.href);
  const currentValue = url.searchParams.get(REFRESH_PARAM) || '';

  url.searchParams.set(REFRESH_PARAM, getRefreshToken(currentValue));
  return url.toString();
}

export function refreshCurrentPage() {
  window.location.assign(getRefreshUrl());
}

function ensureIndicator() {
  let indicator = document.getElementById(INDICATOR_ID);
  if (indicator) return indicator;

  indicator = document.createElement('div');
  indicator.id = INDICATOR_ID;
  indicator.className = 'pull-refresh-indicator';
  indicator.setAttribute('aria-live', 'polite');
  indicator.setAttribute('aria-hidden', 'true');
  indicator.innerHTML = `
    <span class="pull-refresh-indicator__icon" aria-hidden="true">↻</span>
    <span class="pull-refresh-indicator__text">당겨서 새로고침</span>
  `;

  document.body.appendChild(indicator);
  return indicator;
}

function setIndicatorState(state, distance = 0) {
  const indicator = ensureIndicator();
  const text = indicator.querySelector('.pull-refresh-indicator__text');
  const visibleDistance = Math.min(distance, PULL_MAX);

  indicator.classList.toggle('is-ready', state === 'ready');
  indicator.classList.toggle('is-refreshing', state === 'refreshing');
  indicator.style.setProperty('--pull-refresh-distance', `${visibleDistance}px`);
  indicator.setAttribute('aria-hidden', state === 'idle' ? 'true' : 'false');

  if (!text) return;

  if (state === 'refreshing') {
    text.textContent = '새로고침 중';
  } else if (state === 'ready') {
    text.textContent = '놓으면 새로고침';
  } else {
    text.textContent = '당겨서 새로고침';
  }
}

function getScrollTop() {
  return (
    window.scrollY ||
    document.scrollingElement?.scrollTop ||
    document.documentElement.scrollTop ||
    0
  );
}

function isTouchTargetExcluded(target) {
  return !!target?.closest?.(
    [
      'input',
      'textarea',
      'select',
      '[contenteditable="true"]',
      '[contenteditable=""]',
      '[role="dialog"]',
      '.service-menu__panel',
      '.calendar-manage__panel',
      '.notification-panel',
      '.bgm-panel',
      '.pickle-panel',
      '.study-category-manager__modal',
      '.work-category-manager__modal',
      '.work-repeat__modal',
      '.event-category-manager__modal',
      '.event-time-picker',
    ].join(', '),
  );
}

function hasScrollableAncestor(target) {
  let el = target?.parentElement;

  while (el && el !== document.body && el !== document.documentElement) {
    const style = window.getComputedStyle(el);
    const canScroll = /(auto|scroll)/.test(
      `${style.overflowY} ${style.overflow}`,
    );

    if (canScroll && el.scrollHeight > el.clientHeight) {
      return true;
    }

    el = el.parentElement;
  }

  return false;
}

function isOverlayOpen() {
  if (
    document.body?.className
      ?.toString()
      .split(/\s+/)
      .some((name) => /(?:modal|popup)-open$/.test(name))
  ) {
    return true;
  }

  return !!document.querySelector(
    [
      '.service-menu.is-open',
      '.attendance-popup.is-open',
      '.login-required-popup.is-open',
      '[role="dialog"]:not([hidden])',
      '[aria-modal="true"]:not([hidden])',
    ].join(', '),
  );
}

function canStartPull(event) {
  if (refreshing || event.touches.length !== 1) return false;
  if (getScrollTop() > 0) return false;
  if (isOverlayOpen()) return false;
  if (isTouchTargetExcluded(event.target)) return false;
  if (hasScrollableAncestor(event.target)) return false;

  return true;
}

function resetPull() {
  pulling = false;
  pullDistance = 0;
  gestureLocked = '';
  document.documentElement.classList.remove('is-pull-refreshing');

  if (!refreshing) {
    setIndicatorState('idle', 0);
  }
}

function handleTouchStart(event) {
  if (!canStartPull(event)) return;

  const touch = event.touches[0];
  startX = touch.clientX;
  startY = touch.clientY;
  pullDistance = 0;
  gestureLocked = '';
  pulling = true;
}

function handleTouchMove(event) {
  if (!pulling || refreshing || event.touches.length !== 1) return;

  const touch = event.touches[0];
  const deltaX = touch.clientX - startX;
  const deltaY = touch.clientY - startY;
  const absX = Math.abs(deltaX);
  const absY = Math.abs(deltaY);

  if (!gestureLocked && (absX > 8 || absY > 8)) {
    gestureLocked = absX > absY ? 'x' : 'y';
  }

  if (gestureLocked === 'x' || deltaY <= 0 || getScrollTop() > 0) {
    resetPull();
    return;
  }

  pullDistance = Math.min(deltaY * 0.55, PULL_MAX);

  if (pullDistance > 8) {
    event.preventDefault();
    document.documentElement.classList.add('is-pull-refreshing');
    setIndicatorState(
      pullDistance >= PULL_THRESHOLD ? 'ready' : 'pulling',
      pullDistance,
    );
  }
}

function handleTouchEnd() {
  if (!pulling) return;

  const shouldRefresh = pullDistance >= PULL_THRESHOLD;

  if (!shouldRefresh) {
    resetPull();
    return;
  }

  refreshing = true;
  pulling = false;
  document.documentElement.classList.add('is-pull-refreshing');
  setIndicatorState('refreshing', PULL_THRESHOLD);

  window.setTimeout(() => {
    refreshCurrentPage();
  }, 120);
}

function handleTouchCancel() {
  resetPull();
}

function bindRefreshButtons() {
  if (clickBound) return;
  clickBound = true;

  document.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-refresh-control]');
    if (!button) return;

    event.preventDefault();
    refreshCurrentPage();
  });
}

function bindPullToRefresh() {
  if (touchBound) return;
  if (!('ontouchstart' in window) && navigator.maxTouchPoints < 1) return;

  touchBound = true;
  document.addEventListener('touchstart', handleTouchStart, { passive: true });
  document.addEventListener('touchmove', handleTouchMove, { passive: false });
  document.addEventListener('touchend', handleTouchEnd, { passive: true });
  document.addEventListener('touchcancel', handleTouchCancel, {
    passive: true,
  });
}

export function initRefreshControls() {
  if (!document.body) return;

  ensureStylesheet();
  ensureIndicator();
  bindRefreshButtons();
  bindPullToRefresh();
}
