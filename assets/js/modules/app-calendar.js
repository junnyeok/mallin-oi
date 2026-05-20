// assets/js/modules/app-calendar.js

const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';

function enableCalendarAppMode() {
  try {
    sessionStorage.setItem(CALENDAR_APP_MODE_KEY, 'calendar');
  } catch (error) {
    console.warn('[app-calendar] sessionStorage unavailable:', error);
  }

  document.documentElement.classList.add('is-calendar-app-mode');
}

function bindCalendarLinks() {
  document.querySelectorAll('a[href*="calendar-"]').forEach((link) => {
    link.addEventListener('click', () => {
      enableCalendarAppMode();
    });
  });
}

function initAppCalendarLauncher() {
  enableCalendarAppMode();
  bindCalendarLinks();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppCalendarLauncher, {
    once: true,
  });
} else {
  initAppCalendarLauncher();
}
