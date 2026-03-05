// assets/js/modules/login.js
import {
  STORAGE_KEY,
  USER_KEY,
  REDIRECT_KEY,
  findUserById,
  sha256,
  setLoggedIn,
  logoutAndClear,
  isLoggedIn,
  homeHref,
  loginHref,
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

    if (msg) {
      msg.style.color = '';
      msg.textContent = '';
    }

    const id = document.getElementById('loginId')?.value.trim() || '';
    const pw = document.getElementById('loginPw')?.value || '';

    if (!id || !pw) {
      if (msg) {
        msg.style.color = 'red';
        msg.textContent = '아이디/비밀번호를 입력해줘.';
      }
      return;
    }

    // ✅ 저장된 회원에서 찾기
    const user = findUserById(id);

    if (!user) {
      if (msg) {
        msg.style.color = 'red';
        msg.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
      }
      return;
    }

    const inputHash = await sha256(pw);
    if (user.passHash !== inputHash) {
      if (msg) {
        msg.style.color = 'red';
        msg.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
      }
      return;
    }

    // ✅ 로그인 세션 저장(기존 키 유지)
    setLoggedIn(user.userId);

    if (msg) {
      msg.style.color = 'green';
      msg.textContent = '로그인 성공! 이동합니다...';
    }

    const redirectTo = sessionStorage.getItem(REDIRECT_KEY);

    setTimeout(() => {
      if (redirectTo) {
        sessionStorage.removeItem(REDIRECT_KEY);
        window.location.href = redirectTo;
        return;
      }

      // 직접 login.html로 왔을 경우: 이전 페이지가 있으면 거기로
      if (document.referrer) {
        window.location.href = document.referrer;
        return;
      }

      // 기본: 홈
      window.location.href = homeHref();
    }, 400);
  });
}

/* ================= 헤더 로그인/로그아웃 UI ================= */

function initAuthUI() {
  // 헤더 include 때문에 페이지마다 href가 다를 수 있어서 "login.html 포함"으로 찾음
  const links = [...document.querySelectorAll('a.auth-link')];
  const loginLink =
    links.find((a) => (a.getAttribute('href') || '').includes('login.html')) ||
    null;

  if (!loginLink) return;

  const loggedIn = isLoggedIn();

  if (loggedIn) {
    loginLink.textContent = '로그아웃';
    loginLink.href = '#';

    loginLink.addEventListener('click', (e) => {
      e.preventDefault();
      logoutAndClear();
      window.location.href = homeHref();
    });
  } else {
    // ✅ 로그인 버튼 클릭 시 현재 URL(경로+쿼리) 저장 -> 로그인 후 돌아오기
    loginLink.addEventListener('click', () => {
      const current = window.location.pathname + window.location.search;
      sessionStorage.setItem(REDIRECT_KEY, current);

      // 혹시 href가 잘못되어 있으면 보정(선택)
      // window.location.href = loginHref();
    });
  }
}
