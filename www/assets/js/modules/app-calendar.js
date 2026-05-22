// assets/js/modules/app-calendar.js
import {
  getCurrentUser,
  getDisplayName,
  saveRedirect,
  signOutUser,
} from './auth-store.js';
import { initRefreshControls } from './refresh-control.js';

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

function getReturnTo() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function getLoginHref() {
  const url = new URL('./login.html', window.location.href);
  url.searchParams.set('app', 'calendar');
  url.searchParams.set('redirect', './app-calendar.html?app=calendar');

  return `${url.pathname.split('/').pop()}${url.search}${url.hash}`;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return map[char] || char;
  });
}

function renderLoggedOut(accountEl) {
  accountEl.innerHTML = `
    <p class="app-calendar-account__status">로그인하면 내 캘린더를 이어서 쓸 수 있어.</p>
    <div class="app-calendar-account__actions">
      <a class="app-calendar-account__btn app-calendar-account__btn--primary" href="${getLoginHref()}" data-app-calendar-login>
        로그인
      </a>
      <button
        class="app-calendar-account__refresh"
        type="button"
        aria-label="새로고침"
        data-refresh-control
      >
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  `;

  accountEl.querySelector('[data-app-calendar-login]')?.addEventListener(
    'click',
    () => {
      saveRedirect(getReturnTo());
    },
  );
}

function renderLoggedIn(accountEl, user) {
  const displayName = escapeHtml(getDisplayName(user));

  accountEl.innerHTML = `
    <p class="app-calendar-account__status">
      <strong>${displayName}님</strong>
      <span>로그인 중</span>
    </p>
    <div class="app-calendar-account__actions">
      <button class="app-calendar-account__btn" type="button" data-app-calendar-logout>
        로그아웃
      </button>
      <button
        class="app-calendar-account__refresh"
        type="button"
        aria-label="새로고침"
        data-refresh-control
      >
        <span aria-hidden="true">↻</span>
      </button>
    </div>
  `;

  accountEl.querySelector('[data-app-calendar-logout]')?.addEventListener(
    'click',
    async () => {
      try {
        await signOutUser();
        renderLoggedOut(accountEl);
      } catch (error) {
        console.error('[app-calendar] sign out failed:', error);
        alert(`로그아웃 실패: ${error.message}`);
      }
    },
  );
}

async function initAppCalendarAccount() {
  const accountEl = document.getElementById('appCalendarAccount');
  if (!accountEl) return;

  accountEl.setAttribute('aria-busy', 'true');

  try {
    const user = await getCurrentUser();

    if (user) {
      renderLoggedIn(accountEl, user);
    } else {
      renderLoggedOut(accountEl);
    }
  } catch (error) {
    console.error('[app-calendar] auth check failed:', error);
    renderLoggedOut(accountEl);
  } finally {
    accountEl.setAttribute('aria-busy', 'false');
  }
}

async function initAppCalendarLauncher() {
  enableCalendarAppMode();
  bindCalendarLinks();
  initRefreshControls();
  await initAppCalendarAccount();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppCalendarLauncher, {
    once: true,
  });
} else {
  initAppCalendarLauncher();
}
