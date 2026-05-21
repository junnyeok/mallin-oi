// assets/js/modules/auth-store.js
import { supabase } from './supabase-client.js';

export const REDIRECT_KEY = 'authRedirectTo';
export const MYPAGE_VERIFY_KEY = 'mypageVerified_v1';
export const AUTH_POLICY_KEY = 'mallinAuthPolicy_v2';
const CALENDAR_APP_MODE_KEY = 'mallin:calendar-app-mode';
const APP_MODE_PARAM = 'app';
const APP_MODE_VALUE = 'calendar';

function readAuthPolicy() {
  try {
    const raw = localStorage.getItem(AUTH_POLICY_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return parsed;
  } catch (error) {
    console.error('[auth-store] readAuthPolicy error:', error);
    return null;
  }
}

export function clearLoginPolicy() {
  localStorage.removeItem(AUTH_POLICY_KEY);
}

export function saveLoginPolicy({ autoLogin = false } = {}) {
  const now = Date.now();

  const policy = {
    mode: autoLogin ? 'auto' : 'normal',
    loginAt: now,
    autoLogin: !!autoLogin,
  };

  localStorage.setItem(AUTH_POLICY_KEY, JSON.stringify(policy));
  return policy;
}

export function getLoginPolicy() {
  return readAuthPolicy();
}

function isHomePage() {
  const path = window.location.pathname.toLowerCase();
  return path.endsWith('/index.html') || path.endsWith('/');
}

function hasRecoveryParamsInUrl() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;

  const hashParams = new URLSearchParams(hash);
  const searchParams = new URLSearchParams(window.location.search);

  return (
    searchParams.has('code') ||
    searchParams.get('type') === 'recovery' ||
    hashParams.has('access_token') ||
    hashParams.has('refresh_token') ||
    hashParams.get('type') === 'recovery'
  );
}

function isResetPasswordPage() {
  return document.body?.dataset?.page === 'reset-password';
}

function shouldBypassLoginPolicy() {
  return isResetPasswordPage() || hasRecoveryParamsInUrl();
}

async function enforceLoginPolicy() {
  const session = await getCurrentSession();

  if (!session?.user) {
    clearMypageVerified();
    return null;
  }

  if (shouldBypassLoginPolicy()) {
    return {
      session,
      policy: readAuthPolicy(),
    };
  }

  const policy = readAuthPolicy();

  // 예전 v1(30일 만료 정책)이나 정책 누락 상태에서도
  // 이미 살아있는 Supabase 세션이 있으면 강제 로그아웃시키지 않고
  // 새 정책으로 자동 마이그레이션
  if (!policy || typeof policy !== 'object') {
    const nextPolicy = saveLoginPolicy({ autoLogin: true });

    return {
      session,
      policy: nextPolicy,
    };
  }

  // 예전 remember 정책도 새 auto 정책으로 승격
  if (policy.mode === 'remember') {
    const nextPolicy = saveLoginPolicy({ autoLogin: true });

    return {
      session,
      policy: nextPolicy,
    };
  }

  return {
    session,
    policy,
  };
}

function normalizePath(path) {
  return String(path || '').replace(/^\.?\//, '');
}

function hasCalendarAppQuery() {
  return (
    new URLSearchParams(window.location.search || '').get(APP_MODE_PARAM) ===
    APP_MODE_VALUE
  );
}

function hasStoredCalendarAppMode() {
  try {
    return sessionStorage.getItem(CALENDAR_APP_MODE_KEY) === APP_MODE_VALUE;
  } catch {
    return false;
  }
}

function isNativeCapacitor() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

function isCalendarAppMode() {
  return (
    document.body?.dataset?.appMode === APP_MODE_VALUE ||
    document.documentElement.classList.contains('is-calendar-app-mode') ||
    hasCalendarAppQuery() ||
    hasStoredCalendarAppMode() ||
    isNativeCapacitor()
  );
}

function withCalendarAppParam(href) {
  if (!isCalendarAppMode()) return href;

  const url = new URL(href, window.location.href);
  url.searchParams.set(APP_MODE_PARAM, APP_MODE_VALUE);

  return `${url.pathname}${url.search}${url.hash}`;
}

export function getSiteBasePath() {
  const parts = window.location.pathname.split('/').filter(Boolean);

  if (window.location.hostname.endsWith('github.io') && parts.length > 0) {
    return `/${parts[0]}/`;
  }

  return '/';
}

export function resolveSitePath(path = '') {
  const clean = normalizePath(path);
  return `${getSiteBasePath()}${clean}`;
}

export function homeHref() {
  return isCalendarAppMode()
    ? withCalendarAppParam(resolveSitePath('app-calendar.html'))
    : resolveSitePath('index.html');
}

export function loginHref() {
  return withCalendarAppParam(resolveSitePath('login.html'));
}

export function signupHref() {
  return withCalendarAppParam(resolveSitePath('account/signup.html'));
}

export function mypageHref() {
  return resolveSitePath('mypage.html');
}

export function prevMypageHref() {
  return resolveSitePath('prev-mypage.html');
}

export function profileHref() {
  return resolveSitePath('profile.html');
}

export function publicProfileHref(userId = '') {
  const base = profileHref();
  const safeUserId = String(userId || '').trim();

  if (!safeUserId) return base;
  return `${base}?user=${encodeURIComponent(safeUserId)}`;
}

export function writeHref() {
  return resolveSitePath('write.html');
}

export function findIdHref() {
  return withCalendarAppParam(resolveSitePath('account/find-id.html'));
}

export function findPasswordHref() {
  return withCalendarAppParam(resolveSitePath('account/find-password.html'));
}

export function resetPasswordHref() {
  return withCalendarAppParam(resolveSitePath('account/reset-password.html'));
}

const LOGIN_REQUIRED_POPUP_ID = 'loginRequiredPopup';

export function closeLoginRequiredPopup() {
  const popup = document.getElementById(LOGIN_REQUIRED_POPUP_ID);
  if (!popup) return;

  const onKeydown = popup._onKeydown;
  if (onKeydown) {
    document.removeEventListener('keydown', onKeydown);
  }

  popup.classList.remove('is-open');

  window.setTimeout(() => {
    popup.remove();
  }, 180);
}

export function showLoginRequiredPopup({
  title = '로그인이 필요해',
  message = '로그인 후 이용할 수 있어.',
  confirmText = '로그인하러 가기',
  cancelText = '닫기',
} = {}) {
  closeLoginRequiredPopup();

  const overlay = document.createElement('div');
  overlay.id = LOGIN_REQUIRED_POPUP_ID;
  overlay.className = 'login-required-popup';
  overlay.innerHTML = `
    <div class="login-required-popup__backdrop"></div>
    <section
      class="login-required-popup__panel"
      role="dialog"
      aria-modal="true"
      aria-labelledby="loginRequiredPopupTitle"
      aria-describedby="loginRequiredPopupDesc"
    >
      <strong class="login-required-popup__title" id="loginRequiredPopupTitle"></strong>
      <p class="login-required-popup__desc" id="loginRequiredPopupDesc"></p>

      <div class="login-required-popup__actions">
        <button
          type="button"
          class="login-required-popup__btn login-required-popup__btn--ghost"
          data-login-popup-close
        ></button>
        <button
          type="button"
          class="login-required-popup__btn login-required-popup__btn--primary"
          data-login-popup-confirm
        ></button>
      </div>
    </section>
  `;

  const titleEl = overlay.querySelector('#loginRequiredPopupTitle');
  const descEl = overlay.querySelector('#loginRequiredPopupDesc');
  const closeBtn = overlay.querySelector('[data-login-popup-close]');
  const confirmBtn = overlay.querySelector('[data-login-popup-confirm]');
  const backdrop = overlay.querySelector('.login-required-popup__backdrop');

  if (titleEl) titleEl.textContent = title;
  if (descEl) descEl.textContent = message;
  if (closeBtn) closeBtn.textContent = cancelText;
  if (confirmBtn) confirmBtn.textContent = confirmText;

  const handleClose = () => {
    closeLoginRequiredPopup();
  };

  const handleConfirm = () => {
    saveRedirect();
    window.location.href = loginHref();
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape') {
      handleClose();
    }
  };

  overlay._onKeydown = handleKeydown;

  closeBtn?.addEventListener('click', handleClose);
  confirmBtn?.addEventListener('click', handleConfirm);
  backdrop?.addEventListener('click', handleClose);
  document.addEventListener('keydown', handleKeydown);

  document.body.appendChild(overlay);

  window.requestAnimationFrame(() => {
    overlay.classList.add('is-open');
  });
}

export function saveRedirect(url) {
  const next =
    url ||
    `${window.location.pathname}${window.location.search}${window.location.hash}`;
  sessionStorage.setItem(REDIRECT_KEY, next);
}

export function consumeRedirect(defaultUrl = homeHref()) {
  const saved = sessionStorage.getItem(REDIRECT_KEY);
  sessionStorage.removeItem(REDIRECT_KEY);
  return saved || defaultUrl;
}

export function setMypageVerified(value = true) {
  sessionStorage.setItem(MYPAGE_VERIFY_KEY, value ? 'true' : 'false');
}

export function clearMypageVerified() {
  sessionStorage.removeItem(MYPAGE_VERIFY_KEY);
}

export function isMypageVerified() {
  return sessionStorage.getItem(MYPAGE_VERIFY_KEY) === 'true';
}

export async function getCurrentSession() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[auth-store] getCurrentSession error:', error.message);
    return null;
  }

  return session;
}

export async function getCurrentUser() {
  const session = await getCurrentSession();

  if (!session?.user) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    const message = String(error.message || '').trim();

    if (message.toLowerCase().includes('auth session missing')) {
      return session.user || null;
    }

    console.error('[auth-store] getCurrentUser error:', message);
    return session.user || null;
  }

  return user || session.user || null;
}

export async function isLoggedIn() {
  const session = await getCurrentSession();
  return !!session?.user;
}

export function getUserMeta(user) {
  return user?.user_metadata || {};
}

export function getUserIdValue(user) {
  const meta = getUserMeta(user);
  return String(meta.userId || '').trim();
}

export function getNicknameValue(user) {
  const meta = getUserMeta(user);
  return String(meta.nickname || '').trim();
}

export function getUserEmail(user) {
  return String(user?.email || '').trim();
}

export function getDisplayName(user) {
  const nickname = getNicknameValue(user);
  if (nickname) return nickname;

  const customId = getUserIdValue(user);
  if (customId) return customId;

  const email = getUserEmail(user);
  if (email.includes('@')) return email.split('@')[0];

  return '회원';
}

export async function signOutUser() {
  clearMypageVerified();
  clearLoginPolicy();

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
}

export async function requireLogin({ redirectTo = null } = {}) {
  const user = await getCurrentUser();

  if (!user) {
    saveRedirect(redirectTo || undefined);
    window.location.href = loginHref();
    return null;
  }

  return user;
}

export async function verifyCurrentPassword(password) {
  const user = await getCurrentUser();
  if (!user?.email) {
    return { ok: false, message: '현재 로그인 사용자 정보를 찾지 못했어.' };
  }

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password,
  });

  if (error) {
    return { ok: false, message: '현재 비밀번호가 올바르지 않아.' };
  }

  return { ok: true, message: '' };
}

function removeOldNickname() {
  const old = document.querySelector(
    '.auth-nickname[data-auth-nickname="true"]',
  );
  if (old) old.remove();
}

function findLoginLink() {
  return (
    document.querySelector('[data-auth-link]') ||
    document.querySelector('.auth-links .auth-link[href$="login.html"]')
  );
}

function findMypageLink() {
  return (
    document.querySelector('[data-mypage-link]') ||
    document.querySelector('.auth-links .auth-link[href$="mypage.html"]')
  );
}

function findProfileButton() {
  return (
    document.querySelector('[data-profile-btn]') ||
    document.querySelector('.header-actions .write-btn[href$="profile.html"]')
  );
}

function findAuthText(loginLink) {
  if (!loginLink) return null;
  return loginLink.querySelector('[data-auth-text]') || loginLink;
}

function setLinkText(el, text) {
  if (!el) return;
  if (el === el.closest('a') && el.querySelector('*')) return;
  el.textContent = text;
}

export async function updateAuthUI() {
  const loginLink = findLoginLink();
  const mypageLink = findMypageLink();
  const profileButton = findProfileButton();

  removeOldNickname();

  const user = await getCurrentUser();
  const authTextEl = findAuthText(loginLink);

  if (user) {
    const displayName = getDisplayName(user);

    if (loginLink) {
      loginLink.href = '#';
      setLinkText(authTextEl, '로그아웃');
      loginLink.onclick = async (e) => {
        e.preventDefault();

        try {
          await signOutUser();
          window.location.href = homeHref();
        } catch (err) {
          console.error(err);
          alert(`로그아웃 실패: ${err.message}`);
        }
      };

      const nickEl = document.createElement('a');
      nickEl.className = 'auth-link auth-nickname';
      nickEl.dataset.authNickname = 'true';
      nickEl.href = profileHref();
      nickEl.textContent = `${displayName}님`;

      if (!loginLink.previousElementSibling?.matches('.auth-nickname')) {
        loginLink.before(nickEl);
      }
    }

    if (mypageLink) {
      mypageLink.href = prevMypageHref();
      mypageLink.onclick = null;
    }

    if (profileButton) {
      profileButton.href = profileHref();
      profileButton.onclick = null;
    }

    return;
  }

  if (loginLink) {
    loginLink.href = loginHref();
    setLinkText(authTextEl, '로그인');
    loginLink.onclick = () => {
      saveRedirect();
    };
  }

  if (mypageLink) {
    mypageLink.href = loginHref();
    mypageLink.onclick = (e) => {
      e.preventDefault();
      saveRedirect();
      window.location.href = loginHref();
    };
  }

  if (profileButton) {
    profileButton.href = loginHref();
    profileButton.onclick = (e) => {
      e.preventDefault();
      saveRedirect();
      window.location.href = loginHref();
    };
  }
}

let authUiBound = false;

export async function initAuthUI() {
  const enforced = await enforceLoginPolicy();
  await updateAuthUI();

  if (authUiBound) return;
  authUiBound = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      clearLoginPolicy();
      clearMypageVerified();
    }

    if (event === 'SIGNED_IN' && session?.user) {
      const policy = readAuthPolicy();

      if (!policy) {
        saveLoginPolicy({ autoLogin: true });
      }
    }

    updateAuthUI().catch((err) => {
      console.error('[auth-store] updateAuthUI failed:', err);
    });
  });
}

window.addEventListener('auth-changed', () => {
  updateAuthUI().catch((err) => {
    console.error('[auth-store] auth-changed update failed:', err);
  });
});
