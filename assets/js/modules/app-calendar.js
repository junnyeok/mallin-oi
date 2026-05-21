// assets/js/modules/app-calendar.js

const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';

function enableCalendarAppMode() {
  try {
    sessionStorage.setItem(CALENDAR_APP_MODE_KEY, 'calendar');
  } catch (error) {
    console.warn('[app-calendar] sessionStorage unavailable:', error);
  }

  document.documentElement.classList.add('is-calendar-app-mode');
  if (document.body) {
    document.body.dataset.appMode = 'calendar';
  }
}

function bindCalendarLinks() {
  document
    .querySelectorAll('a[href*="calendar-"], a[href*="app-calendar.html"]')
    .forEach((link) => {
      const href = link.getAttribute('href');

      if (href && !href.includes('app=calendar')) {
        const url = new URL(href, window.location.href);
        url.searchParams.set('app', 'calendar');
        link.setAttribute(
          'href',
          `${url.pathname.split('/').pop()}${url.search}${url.hash}`,
        );
      }

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
