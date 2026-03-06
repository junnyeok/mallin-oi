// assets/js/modules/login.js

import {
  STORAGE_KEY,
  USER_KEY,
  REDIRECT_KEY,
  findUserById,
  readUsers,
  sha256,
  setLoggedIn,
  logoutAndClear,
  isLoggedIn,
  homeHref,
} from './auth-store.js';

export function initLogin() {
  initLoginForm();
  initAuthUI();
}

/* ================= 로그인 폼 ================= */

function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const msg = document.getElementById('loginMsg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('loginId')?.value.trim();
    const pw = document.getElementById('loginPw')?.value;

    if (!id || !pw) {
      msg.style.color = 'red';
      msg.textContent = '아이디/비밀번호를 입력해줘.';
      return;
    }

    const user = findUserById(id);

    if (!user) {
      msg.style.color = 'red';
      msg.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
      return;
    }

    const inputHash = await sha256(pw);

    if (user.passHash !== inputHash) {
      msg.style.color = 'red';
      msg.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
      return;
    }

    setLoggedIn(user.userId);

    msg.style.color = 'green';
    msg.textContent = '로그인 성공! 이동합니다...';

    const redirectTo = sessionStorage.getItem(REDIRECT_KEY);

    setTimeout(() => {
      if (redirectTo) {
        sessionStorage.removeItem(REDIRECT_KEY);
        window.location.href = redirectTo;
        return;
      }

      if (document.referrer) {
        window.location.href = document.referrer;
        return;
      }

      window.location.href = homeHref();
    }, 500);
  });
}

/* ================= 헤더 로그인 UI ================= */

function initAuthUI() {
  const loginLink = document.querySelector(
    '.auth-links .auth-link[href$="login.html"]',
  );

  const mypageLink = document.querySelector(
    '.auth-links .auth-link[href$="mypage.html"]',
  );

  if (!loginLink) return;

  const loggedIn = isLoggedIn();

  if (loggedIn) {
    const userId = localStorage.getItem(USER_KEY);
    const users = readUsers();
    const user = users.find((u) => u.userId === userId);

    const nickname = user?.nickname || userId;

    /* ===== 로그인 버튼 -> 로그아웃 ===== */

    loginLink.textContent = '로그아웃';
    loginLink.href = '#';

    loginLink.addEventListener('click', (e) => {
      e.preventDefault();

      logoutAndClear();
      window.location.href = homeHref();
    });

    /* ===== 닉네임 표시 ===== */

    const nickEl = document.createElement('span');
    nickEl.className = 'auth-nickname';
    nickEl.textContent = `${nickname}님`;

    loginLink.before(nickEl);
  } else {
    /* ===== 로그인 안된 상태 ===== */

    loginLink.addEventListener('click', () => {
      const current = window.location.pathname + window.location.search;

      sessionStorage.setItem(REDIRECT_KEY, current);
    });

    /* ===== 마이페이지 접근 제한 ===== */

    if (mypageLink) {
      mypageLink.addEventListener('click', (e) => {
        e.preventDefault();

        sessionStorage.setItem(REDIRECT_KEY, window.location.pathname);

        window.location.href = './login.html';
      });
    }
  }
}
