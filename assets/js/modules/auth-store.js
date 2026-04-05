// assets/js/modules/auth-store.js
import { supabase } from './supabase-client.js';
export const REDIRECT_KEY = 'authRedirectTo';
export const MYPAGE_VERIFY_KEY = 'mypageVerified_v1';

export const AUTH_POLICY_KEY = 'mallinAuthPolicy_v1';
export const AUTO_ATTENDANCE_KEY = 'mallinAutoAttendance_v1';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * ONE_DAY_MS;

function getTodayKey() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

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

function clearAutoAttendanceMarker() {
  localStorage.removeItem(AUTO_ATTENDANCE_KEY);
}

export function clearLoginPolicy() {
  localStorage.removeItem(AUTH_POLICY_KEY);
  clearAutoAttendanceMarker();
}

export function saveLoginPolicy({ rememberMe = false } = {}) {
  const now = Date.now();
  const expiresAt = now + (rememberMe ? THIRTY_DAYS_MS : ONE_DAY_MS);

  const policy = {
    mode: rememberMe ? 'remember' : 'normal',
    loginAt: now,
    expiresAt,
  };

  localStorage.setItem(AUTH_POLICY_KEY, JSON.stringify(policy));
  return policy;
}

export function getLoginPolicy() {
  return readAuthPolicy();
}

function isLoginPolicyExpired(policy) {
  if (!policy?.expiresAt) return true;
  return Date.now() >= Number(policy.expiresAt);
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

async function claimDailyAttendanceForAuto() {
  const { data, error } = await supabase.rpc('claim_daily_attendance');

  if (error) {
    console.error('[auth-store] claim_daily_attendance error:', error);
    return {
      ok: false,
      message: '',
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    ok: !!row?.ok,
    message: String(row?.message || '').trim(),
  };
}

async function enforceLoginPolicy() {
  const session = await getCurrentSession();

  if (!session?.user) {
    clearLoginPolicy();
    return null;
  }

  if (shouldBypassLoginPolicy()) {
    return {
      session,
      policy: readAuthPolicy(),
    };
  }

  const policy = readAuthPolicy();

  if (!policy) {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[auth-store] signOut without policy failed:', error);
    }
    clearLoginPolicy();
    return null;
  }

  if (isLoginPolicyExpired(policy)) {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[auth-store] signOut on expired policy failed:', error);
    }
    clearLoginPolicy();
    return null;
  }

  return {
    session,
    policy,
  };
}

async function maybeAutoClaimAttendance(policy) {
  if (policy?.mode !== 'remember') return;
  if (!isHomePage()) return;

  const todayKey = getTodayKey();
  const lastAutoAttendanceKey = localStorage.getItem(AUTO_ATTENDANCE_KEY);

  if (lastAutoAttendanceKey === todayKey) return;

  const result = await claimDailyAttendanceForAuto();

  if (result.ok || result.message) {
    localStorage.setItem(AUTO_ATTENDANCE_KEY, todayKey);
  }
}

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
  return resolveSitePath('account/signup.html');
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
  const state = await enforceLoginPolicy();

  if (state?.policy) {
    await maybeAutoClaimAttendance(state.policy);
  }

  await updateAuthUI();

  if (authUiBound) return;
  authUiBound = true;

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      clearLoginPolicy();
      clearMypageVerified();
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
