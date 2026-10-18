// assets/js/modules/app-calendar-mode.js

const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';
const APP_MODE_PARAM = 'app';
const APP_MODE_VALUE = 'calendar';

const CALENDAR_PAGES = new Set([
  'app-calendar',
  'app-calendar-settings',
  'calendar-study',
  'calendar-work',
  'calendar-event',
  'calendar-groups',
  'login',
  'signup',
  'find-password',
  'reset-password',
  'prev-mypage',
  'mypage',
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

function storeCalendarAppMode() {
  try {
    sessionStorage.setItem(CALENDAR_APP_MODE_KEY, APP_MODE_VALUE);
  } catch {
    // sessionStorage가 막힌 환경이면 무시
  }
}

function getSessionValue(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function hasStoredCalendarAppMode() {
  return getSessionValue(CALENDAR_APP_MODE_KEY) === APP_MODE_VALUE;
}

function hasCalendarRedirect() {
  return ['authRedirectTo', 'redirectAfterLogin'].some((key) =>
    getSessionValue(key).includes('app=calendar'),
  );
}

export function isCalendarAppMode() {
  const page = getPageName();

  if (hasCalendarAppQuery()) {
    storeCalendarAppMode();
    return true;
  }

  if (!CALENDAR_PAGES.has(page)) return false;

  if (hasStoredCalendarAppMode() || hasCalendarRedirect()) {
    storeCalendarAppMode();
    return true;
  }

  return isNativeCapacitor();
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
  if (page === 'calendar-groups') return 'groups';

  return '';
}

export function renderCalendarAppActions(authMarkup, { launcher = false } = {}) {
  const textClass = launcher
    ? 'app-calendar-account__btn'
    : 'calendar-app-shell__action';
  const iconClass = launcher
    ? 'app-calendar-account__icon'
    : 'calendar-app-shell__icon';
  const from = encodeURIComponent(window.location.pathname.split('/').pop());

  return `
    <a class="${textClass}" href="https://mallin-oi.com/post.html?id=362"
       aria-label="말린오이 캘린더 사용방법 보기">사용방법</a>
    ${authMarkup}
    <button class="calendar-app-icon-button ${iconClass}" type="button"
            aria-label="새로고침" data-refresh-control>
      <span aria-hidden="true">↻</span>
    </button>
    <a class="calendar-app-icon-button ${iconClass}"
       href="./app-calendar-settings.html?app=calendar&from=${from}"
       aria-label="환경설정">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
        <path d="m9.5 3-.6 2.1-1.5.9-2.1-.5-2.5 4.3 1.5 1.6v1.7l-1.5 1.6L5.3 19l2.1-.5 1.5.9.6 2.1h5l.6-2.1 1.5-.9 2.1.5 2.5-4.3-1.5-1.6v-1.7l1.5-1.6-2.5-4.3-2.1.5-1.5-.9-.6-2.1z" />
        <circle cx="12" cy="12.25" r="3.25" />
      </svg>
    </a>
  `;
}

function createCalendarAppShell() {
  if (document.getElementById('calendarAppShell')) return;

  const active = getActiveCalendarType();
  if (!active || active === 'groups') return;

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
        <div class="calendar-app-shell__actions" aria-label="캘린더 앱 작업">
          ${renderCalendarAppActions(`
          <a class="calendar-app-shell__action" data-auth-link href="./login.html?app=calendar">
            <span data-auth-text>로그인</span>
          </a>
          `)}
        </div>
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
        'a[href*="account/find-password.html"]',
        'a[href*="account/reset-password.html"]',
        'a[href*="signup.html"]',
        'a[href*="find-password.html"]',
        'a[href*="reset-password.html"]',
        'a[href*="prev-mypage.html"]',
        'a[href*="mypage.html"]',
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
