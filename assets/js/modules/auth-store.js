// assets/js/modules/auth-store.js
import { supabase } from './supabase-client.js';

export const REDIRECT_KEY = 'authRedirectTo';
export const MYPAGE_VERIFY_KEY = 'mypageVerified_v1';

function normalizePath(path) {
  return String(path || '').replace(/^\.?\//, '');
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
  return resolveSitePath('index.html');
}

export function loginHref() {
  return resolveSitePath('login.html');
}

export function signupHref() {
  return resolveSitePath('signup.html');
}

export function mypageHref() {
  return resolveSitePath('mypage.html');
}

export function prevMypageHref() {
  return resolveSitePath('prev-mypage.html');
}

export function writeHref() {
  return resolveSitePath('write.html');
}

export function findIdHref() {
  return resolveSitePath('account/find-id.html');
}

export function findPasswordHref() {
  return resolveSitePath('account/find-password.html');
}

export function resetPasswordHref() {
  return resolveSitePath('account/reset-password.html');
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
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    console.error('[auth-store] getCurrentUser error:', error.message);
    return null;
  }

  return user;
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

      const nickEl = document.createElement('span');
      nickEl.className = 'auth-nickname';
      nickEl.dataset.authNickname = 'true';
      nickEl.textContent = `${displayName}님`;

      if (!loginLink.previousElementSibling?.matches('.auth-nickname')) {
        loginLink.before(nickEl);
      }
    }

    if (mypageLink) {
      mypageLink.href = prevMypageHref();
      mypageLink.onclick = null;
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
}

let authUiBound = false;

export async function initAuthUI() {
  await updateAuthUI();

  if (authUiBound) return;
  authUiBound = true;

  supabase.auth.onAuthStateChange(() => {
    updateAuthUI().catch((err) => {
      console.error('[auth-store] updateAuthUI failed:', err);
    });
  });
}
