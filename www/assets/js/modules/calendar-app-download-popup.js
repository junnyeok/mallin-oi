// assets/js/modules/calendar-app-download-popup.js

const APP_STORE_URL = 'https://apps.apple.com/kr/app/%EB%A7%90%EB%A6%B0%EC%98%A4%EC%9D%B4-%EC%BA%98%EB%A6%B0%EB%8D%94/id6774468038';
const GOOGLE_PLAY_URL = 'https://play.google.com/store/apps/details?id=com.mallinoi.calendar&pcampaignid=web_share';

const POPUP_ID = 'calendarAppDownloadPopup';
const SESSION_DISMISS_KEY =
  'mallinoi_calendar_app_download_popup_session_dismissed';
const DISMISSED_UNTIL_KEY =
  'mallinoi_calendar_app_download_popup_dismissed_until';
const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';
const CALENDAR_APP_MODE_VALUE = 'calendar';

const CALENDAR_PAGE_NAMES = new Set([
  'calendar-study',
  'calendar-work',
  'calendar-event',
  'calendar-groups',
]);

let initialized = false;
let previousActiveElement = null;

function getPageName() {
  return String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();
}

function getSearchParams() {
  return new URLSearchParams(window.location.search || '');
}

function getStorageValue(storage, key) {
  try {
    return storage.getItem(key) || '';
  } catch {
    return '';
  }
}

function setStorageValue(storage, key, value) {
  try {
    storage.setItem(key, value);
  } catch {
    // 저장소가 막힌 환경이면 이번 세션 동작만 유지
  }
}

function isNativeCapacitor() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

function isCalendarAppSession() {
  if (getSearchParams().get('app') === CALENDAR_APP_MODE_VALUE) return true;

  return (
    getStorageValue(sessionStorage, CALENDAR_APP_MODE_KEY) ===
    CALENDAR_APP_MODE_VALUE
  );
}

function shouldSkipForAppEnvironment() {
  return isNativeCapacitor() || isCalendarAppSession();
}

function wasDismissedThisSession() {
  return getStorageValue(sessionStorage, SESSION_DISMISS_KEY) === 'true';
}

function wasDismissedUntilFuture() {
  const raw = getStorageValue(localStorage, DISMISSED_UNTIL_KEY);
  if (!raw) return false;

  const until = Number(raw);
  if (!Number.isFinite(until)) return false;

  return Date.now() < until;
}

function getNextLocalMidnight() {
  const next = new Date();
  next.setHours(24, 0, 0, 0);
  return next.getTime();
}

function markSessionDismissed() {
  setStorageValue(sessionStorage, SESSION_DISMISS_KEY, 'true');
}

function markDismissedToday() {
  setStorageValue(
    localStorage,
    DISMISSED_UNTIL_KEY,
    String(getNextLocalMidnight()),
  );
  markSessionDismissed();
}

function createStoreLink({ href, className, text }) {
  const link = document.createElement('a');
  link.className = className;
  link.href = href;
  link.textContent = text;

  if (href !== '#') {
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
  } else {
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
  }

  return link;
}

function getFocusableElements(root) {
  return Array.from(
    root.querySelectorAll(
      [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(','),
    ),
  ).filter((el) => el.offsetParent !== null || el === document.activeElement);
}

function trapFocus(event, dialog) {
  if (event.key !== 'Tab') return;

  const focusable = getFocusableElements(dialog);
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function restoreFocus() {
  if (previousActiveElement?.focus && document.contains(previousActiveElement)) {
    previousActiveElement.focus();
  }

  previousActiveElement = null;
}

function removePopup() {
  document.getElementById(POPUP_ID)?.remove();
  document.removeEventListener('keydown', handleDocumentKeydown);
  restoreFocus();
}

function closeForSession() {
  markSessionDismissed();
  removePopup();
}

function closeForToday() {
  markDismissedToday();
  removePopup();
}

function handleDocumentKeydown(event) {
  const popup = document.getElementById(POPUP_ID);
  if (!popup) return;

  const dialog = popup.querySelector('[role="dialog"]');

  if (event.key === 'Escape') {
    event.preventDefault();
    closeForSession();
    return;
  }

  if (dialog) {
    trapFocus(event, dialog);
  }
}

function createPopup() {
  const overlay = document.createElement('div');
  overlay.className = 'calendar-app-download-popup';
  overlay.id = POPUP_ID;

  const dialog = document.createElement('section');
  dialog.className = 'calendar-app-download-popup__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'calendarAppDownloadPopupTitle');
  dialog.setAttribute('aria-describedby', 'calendarAppDownloadPopupDesc');
  dialog.tabIndex = -1;

  const closeIconButton = document.createElement('button');
  closeIconButton.type = 'button';
  closeIconButton.className = 'calendar-app-download-popup__close';
  closeIconButton.setAttribute('aria-label', '캘린더 앱 다운로드 안내 닫기');
  closeIconButton.textContent = '×';

  const title = document.createElement('h2');
  title.className = 'calendar-app-download-popup__title';
  title.id = 'calendarAppDownloadPopupTitle';
  title.textContent = '말린오이 캘린더 앱으로 더 편하게 사용해봐!';

  const desc = document.createElement('p');
  desc.className = 'calendar-app-download-popup__desc';
  desc.id = 'calendarAppDownloadPopupDesc';
  desc.textContent =
    '근무표, 자기개발, 개인일정을 앱에서 더 빠르게 확인하고 위젯으로도 볼 수 있어.';

  const actions = document.createElement('div');
  actions.className = 'calendar-app-download-popup__actions';

  const appStoreLink = createStoreLink({
    href: APP_STORE_URL,
    className:
      'calendar-app-download-popup__button calendar-app-download-popup__button--primary',
    text: 'App Store',
  });

  const googlePlayLink = createStoreLink({
    href: GOOGLE_PLAY_URL,
    className:
      'calendar-app-download-popup__button calendar-app-download-popup__button--primary',
    text: 'Google Play',
  });

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'calendar-app-download-popup__button';
  closeButton.textContent = '닫기';

  const todayButton = document.createElement('button');
  todayButton.type = 'button';
  todayButton.className =
    'calendar-app-download-popup__button calendar-app-download-popup__button--quiet';
  todayButton.textContent = '오늘은 다시 보지 않기';

  actions.append(appStoreLink, googlePlayLink, closeButton, todayButton);
  dialog.append(closeIconButton, title, desc, actions);
  overlay.append(dialog);

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeForSession();
    }
  });

  closeIconButton.addEventListener('click', closeForSession);
  closeButton.addEventListener('click', closeForSession);
  todayButton.addEventListener('click', closeForToday);

  return overlay;
}

function shouldShowPopup() {
  if (!CALENDAR_PAGE_NAMES.has(getPageName())) return false;
  if (shouldSkipForAppEnvironment()) return false;
  if (wasDismissedThisSession()) return false;
  if (wasDismissedUntilFuture()) return false;

  return true;
}

export function initCalendarAppDownloadPopup() {
  if (initialized) return;
  if (!shouldShowPopup()) return;
  if (document.getElementById(POPUP_ID)) {
    initialized = true;
    return;
  }

  previousActiveElement = document.activeElement;

  const popup = createPopup();
  initialized = true;
  document.body.append(popup);
  document.addEventListener('keydown', handleDocumentKeydown);

  const firstAction = popup.querySelector(
    '.calendar-app-download-popup__button--primary',
  );

  window.setTimeout(() => {
    if (firstAction instanceof HTMLElement) {
      firstAction.focus();
    }
  }, 0);
}
