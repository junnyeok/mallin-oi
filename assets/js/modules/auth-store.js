// assets/js/modules/auth-store.js
/* =================================================
  auth-store.js (연습용)
  - localStorage 회원 DB + 로그인 세션 관리
  - 비밀번호는 SHA-256 해시로 저장(그래도 실서비스 보안 아님)
================================================= */

export const STORAGE_KEY = 'mallinLoggedIn';
export const USER_KEY = 'mallinUser';
export const REDIRECT_KEY = 'authRedirectTo';
export const USERS_KEY = 'mallinUsers_v1';

function safeJsonParse(str, fallback) {
  try {
    return JSON.parse(str) ?? fallback;
  } catch {
    return fallback;
  }
}

export function readUsers() {
  return safeJsonParse(localStorage.getItem(USERS_KEY), []);
}

export function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function findUserById(userId) {
  const users = readUsers();
  return users.find((u) => u.userId === userId) || null;
}

function bufToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function sha256(text) {
  if (window.crypto?.subtle) {
    const enc = new TextEncoder().encode(String(text));
    const hashBuf = await crypto.subtle.digest('SHA-256', enc);
    return bufToHex(hashBuf);
  }
  // fallback (최후수단): 해시 못 쓰는 환경이면 그냥 문자열 반환 (권장X)
  return String(text);
}

export function setLoggedIn(userId) {
  localStorage.setItem(STORAGE_KEY, 'true');
  localStorage.setItem(USER_KEY, userId);
}

export function logoutAndClear() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

export function isLoggedIn() {
  return localStorage.getItem(STORAGE_KEY) === 'true';
}

export function getLoggedInUserId() {
  return localStorage.getItem(USER_KEY) || '';
}

export function homeHref() {
  // account 폴더 안이면 ../index.html, 아니면 ./index.html
  return window.location.pathname.includes('/account/')
    ? '../index.html'
    : './index.html';
}

export function loginHref() {
  return window.location.pathname.includes('/account/')
    ? '../login.html'
    : './login.html';
}
