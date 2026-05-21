// assets/js/modules/app-calendar-mode.js

const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';
const APP_MODE_PARAM = 'app';
const APP_MODE_VALUE = 'calendar';

const CALENDAR_PAGES = new Set([
  'app-calendar',
  'calendar-study',
  'calendar-work',
  'calendar-event',
  'login',
  'signup',
  'find-id',
  'find-password',
  'reset-password',
]);

function getPageName() {
  return String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();
}

function getSearchParams() {
  return new URLSearchParams(window.location.search || '');
}

function toAppModeHref(href) {
  const url = new URL(href, window.location.href);
  url.searchParams.set(APP_MODE_PARAM, APP_MODE_VALUE);

  return `${url.pathname}${url.search}${url.hash}`;
}

function isNativeCapacitor() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

function hasCalendarAppQuery() {
  return getSearchParams().get(APP_MODE_PARAM) === APP_MODE_VALUE;
}

function hasStoredCalendarAppMode() {
  try {
    return sessionStorage.getItem(CALENDAR_APP_MODE_KEY) === APP_MODE_VALUE;
  } catch {
    return false;
  }
}

function storeCalendarAppMode() {
  try {
    sessionStorage.setItem(CALENDAR_APP_MODE_KEY, APP_MODE_VALUE);
  } catch {
    // sessionStorage가 막힌 환경이면 무시
  }
}

export function isCalendarAppMode() {
  const page = getPageName();

  if (!CALENDAR_PAGES.has(page)) return false;

  if (hasCalendarAppQuery()) {
    storeCalendarAppMode();
    return true;
  }

  return isNativeCapacitor() || hasStoredCalendarAppMode();
}

function removeWebsiteShellHosts() {
  document
    .querySelectorAll('[data-include="header"], [data-include="footer"]')
    .forEach((el) => {
      el.remove();
    });

  document.getElementById('cukeBuddy')?.remove();
}

function getActiveCalendarType() {
  const page = getPageName();

  if (page === 'calendar-study') return 'study';
  if (page === 'calendar-work') return 'work';
  if (page === 'calendar-event') return 'event';

  return '';
}

function createCalendarAppShell() {
  if (document.getElementById('calendarAppShell')) return;

  const active = getActiveCalendarType();
  if (!active) return;

  const shell = document.createElement('nav');
  shell.className = 'calendar-app-shell';
  shell.id = 'calendarAppShell';
  shell.setAttribute('aria-label', '캘린더 앱 메뉴');

  shell.innerHTML = `
    <div class="calendar-app-shell__inner">
      <div class="calendar-app-shell__top">
        <a class="calendar-app-shell__home" href="./app-calendar.html?app=calendar">
          <span aria-hidden="true">‹</span>
          캘린더 선택
        </a>
        <p class="calendar-app-shell__title">말린오이 캘린더</p>
      </div>

      <div class="calendar-app-shell__tabs" role="list">
        <a
          class="calendar-app-shell__tab ${active === 'study' ? 'is-active' : ''}"
          href="./calendar-study.html?app=calendar"
          ${active === 'study' ? 'aria-current="page"' : ''}
        >
          자기개발
        </a>
        <a
          class="calendar-app-shell__tab ${active === 'work' ? 'is-active' : ''}"
          href="./calendar-work.html?app=calendar"
          ${active === 'work' ? 'aria-current="page"' : ''}
        >
          업무
        </a>
        <a
          class="calendar-app-shell__tab ${active === 'event' ? 'is-active' : ''}"
          href="./calendar-event.html?app=calendar"
          ${active === 'event' ? 'aria-current="page"' : ''}
        >
          이벤트
        </a>
      </div>
    </div>
  `;

  document.body.prepend(shell);
}

function keepCalendarLinksInAppMode() {
  document
    .querySelectorAll(
      [
        'a[href*="app-calendar.html"]',
        'a[href*="calendar-"]',
        'a[href*="login.html"]',
        'a[href*="account/signup.html"]',
        'a[href*="account/find-id.html"]',
        'a[href*="account/find-password.html"]',
        'a[href*="account/reset-password.html"]',
        'a[href*="signup.html"]',
        'a[href*="find-id.html"]',
        'a[href*="find-password.html"]',
        'a[href*="reset-password.html"]',
      ].join(', '),
    )
    .forEach((link) => {
      const href = link.getAttribute('href');
      if (!href || href.includes('app=calendar')) return;

      link.setAttribute('href', toAppModeHref(href));
    });
}

export function initCalendarAppMode() {
  if (!isCalendarAppMode()) return false;

  document.documentElement.classList.add('is-calendar-app-mode');

  if (document.body) {
    document.body.dataset.appMode = APP_MODE_VALUE;
  }

  storeCalendarAppMode();
  removeWebsiteShellHosts();
  createCalendarAppShell();
  keepCalendarLinksInAppMode();

  return true;
}
