// assets/js/modules/app-calendar.js
import {
  getCurrentUser,
  getDisplayName,
  routePendingSecondFactor,
  saveRedirect,
  signOutUser,
} from './auth-store.js';
import {
  initCalendarWidgetNavigation,
  scheduleCalendarWidgetRefresh,
} from './calendar-native-widgets.js';
import { openCalendarProfile } from './calendar-profile-link.js';
import { initRefreshControls } from './refresh-control.js';
import { renderCalendarAppActions } from './app-calendar-mode.js';
import { initSocialAuthNative } from './social-auth-native.js';
import { supabase } from './supabase-client.js';

const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';
const DEFAULT_CHARACTER_IMAGE = './images/characters/cucumber.png';

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
      ${renderCalendarAppActions(`
      <a class="app-calendar-account__btn app-calendar-account__btn--primary" href="${getLoginHref()}" data-app-calendar-login>
        로그인
      </a>
      `, { launcher: true })}
    </div>
  `;

  accountEl.querySelector('[data-app-calendar-login]')?.addEventListener(
    'click',
    () => {
      saveRedirect(getReturnTo());
    },
  );
}

function renderLoggedIn(accountEl, user, onSignOut) {
  const displayName = escapeHtml(getDisplayName(user));

  accountEl.innerHTML = `
    <p class="app-calendar-account__status">
      <strong>${displayName}님</strong>
      <span>로그인 중</span>
    </p>
    <div class="app-calendar-account__actions">
      ${renderCalendarAppActions(`
      <button class="app-calendar-account__btn" type="button" data-app-calendar-logout>
        로그아웃
      </button>
      `, { launcher: true })}
    </div>
  `;

  accountEl.querySelector('[data-app-calendar-logout]')?.addEventListener(
    'click',
    async () => {
      try {
        await signOutUser();
        onSignOut();
      } catch (error) {
        console.error('[app-calendar] sign out failed:', error);
        alert(`로그아웃 실패: ${error.message}`);
      }
    },
  );
}

function setCharacterImage(image, imagePath) {
  const sources = new Set([imagePath]);
  const assetPath = imagePath.replace(/^\.?\//, '');
  if (window.Capacitor?.isNativePlatform?.() && /^images\/(characters|skins)\//.test(assetPath)) {
    sources.add(new URL(assetPath, 'https://mallin-oi.com/').href);
  }
  sources.add(DEFAULT_CHARACTER_IMAGE);
  sources.add('./images/logo-home.png');

  const candidates = sources.values();
  const loadNext = () => {
    const { value } = candidates.next();
    if (value) image.src = value;
  };
  image.onerror = loadNext;
  loadNext();
}

function initAppCalendarCharacter() {
  const logo = document.getElementById('appCalendarLogo');
  const button = document.getElementById('appCalendarProfile');
  const wrap = button?.querySelector('.character-effect-wrap');
  const image = wrap?.querySelector('.character-effect-character');
  if (!logo || !button || !image) return () => {};

  let userId = '';
  let profileRequest = 0;
  let imagePath = '';
  let effectItemId = '';
  let applyEffect;

  function showCharacter(nextImagePath) {
    if (nextImagePath === imagePath) return;
    imagePath = nextImagePath;
    setCharacterImage(image, imagePath);
  }

  async function refreshCharacter() {
    if (!userId) return;
    const request = ++profileRequest;

    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('equipped_character_image_url, equipped_character_effect_item_id')
        .eq('id', userId)
        .maybeSingle();
      if (request !== profileRequest) return;
      if (error) throw error;

      showCharacter(String(data?.equipped_character_image_url || '').trim() || DEFAULT_CHARACTER_IMAGE);
      const nextEffectItemId = String(data?.equipped_character_effect_item_id || '').trim();
      if (nextEffectItemId === effectItemId) return;

      if (!applyEffect) {
        const [{ replaceCharacterEffect }, { getCharacterEffectRenderMeta }] = await Promise.all([
          import('./character-effects.js'),
          import('./store-data.js'),
        ]);
        applyEffect = (itemId) => replaceCharacterEffect(wrap, getCharacterEffectRenderMeta(itemId, 'profile'));
      }

      if (request !== profileRequest) return;
      applyEffect(nextEffectItemId);
      effectItemId = nextEffectItemId;
    } catch (error) {
      if (request === profileRequest) console.warn('[app-calendar] character unavailable:', error);
    }
  }

  button.addEventListener('click', () => openCalendarProfile(button));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshCharacter();
  });

  return (user) => {
    userId = user?.id || '';
    profileRequest += 1;
    logo.hidden = Boolean(userId);
    button.hidden = !userId;

    if (userId) {
      showCharacter(DEFAULT_CHARACTER_IMAGE);
      refreshCharacter();
    } else {
      image.onerror = null;
      image.removeAttribute('src');
      applyEffect?.('');
      imagePath = '';
      effectItemId = '';
    }
  };
}

async function initAppCalendarAccount() {
  const accountEl = document.getElementById('appCalendarAccount');
  if (!accountEl) return;

  const setCharacterUser = initAppCalendarCharacter();
  accountEl.setAttribute('aria-busy', 'true');

  try {
    const user = await getCurrentUser();

    if (user) {
      renderLoggedIn(accountEl, user, () => {
        setCharacterUser(null);
        renderLoggedOut(accountEl);
      });
      setCharacterUser(user);
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
  if (await initSocialAuthNative().catch(() => false)) return;
  enableCalendarAppMode();
  const homeRequested = new URLSearchParams(window.location.search).get('home') === '1';
  if (await initCalendarWidgetNavigation({ discardPending: homeRequested })) return;
  if (await routePendingSecondFactor()) return;
  bindCalendarLinks();
  initRefreshControls();
  await initAppCalendarAccount();
  scheduleCalendarWidgetRefresh();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initAppCalendarLauncher, {
    once: true,
  });
} else {
  initAppCalendarLauncher();
}
