// assets/js/modules/prev-mypage.js

import {
  REDIRECT_KEY,
  readUsers,
  sha256,
  isLoggedIn,
  getLoggedInUserId,
  loginHref,
} from './auth-store.js';

const MYPAGE_VERIFY_KEY = 'mypageVerified_v1';

function prevMypageHref() {
  return window.location.pathname.includes('/account/')
    ? '../prev-mypage.html'
    : './prev-mypage.html';
}

function mypageHref() {
  return window.location.pathname.includes('/account/')
    ? '../mypage.html'
    : './mypage.html';
}

function setMsg(el, text, color = 'var(--color-text-sub)') {
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

/* =================================================
  prev-mypage.html 전용
  - 로그인 상태 확인
  - 현재 로그인한 사용자의 비밀번호 재확인
  - 성공 시 mypage.html 이동
================================================= */
function initPrevMypageForm() {
  const form = document.getElementById('prevMypageForm');
  if (!form) return;

  const msg = document.getElementById('prevMypageMsg');
  const pwInput = document.getElementById('prevMypagePw');

  // ✅ 로그인 안 된 상태면 로그인 페이지로
  if (!isLoggedIn()) {
    sessionStorage.setItem(
      REDIRECT_KEY,
      window.location.pathname + window.location.search,
    );
    window.location.href = loginHref();
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pw = pwInput?.value ?? '';
    const userId = getLoggedInUserId();

    if (!pw.trim()) {
      setMsg(msg, '비밀번호를 입력해줘.', 'red');
      return;
    }

    if (!userId) {
      setMsg(msg, '로그인 정보가 없습니다. 다시 로그인해줘.', 'red');
      sessionStorage.setItem(
        REDIRECT_KEY,
        window.location.pathname + window.location.search,
      );
      setTimeout(() => {
        window.location.href = loginHref();
      }, 400);
      return;
    }

    const users = readUsers();
    const user = users.find((u) => u.userId === userId);

    if (!user) {
      setMsg(msg, '사용자 정보를 찾을 수 없어. 다시 로그인해줘.', 'red');
      sessionStorage.setItem(
        REDIRECT_KEY,
        window.location.pathname + window.location.search,
      );
      setTimeout(() => {
        window.location.href = loginHref();
      }, 400);
      return;
    }

    const inputHash = await sha256(pw);

    if (user.passHash !== inputHash) {
      setMsg(msg, '비밀번호가 올바르지 않습니다.', 'red');
      pwInput.value = '';
      pwInput.focus();
      return;
    }

    sessionStorage.setItem(MYPAGE_VERIFY_KEY, 'true');

    setMsg(msg, '확인 완료! 마이페이지로 이동합니다...', 'green');

    setTimeout(() => {
      window.location.href = mypageHref();
    }, 300);
  });
}

/* =================================================
  mypage.html 전용
  - 로그인 상태 확인
  - prev-mypage 인증 여부 확인
  - 직접 URL 접근 차단
================================================= */
function initMypageGuard() {
  const page = document.body?.dataset?.page;
  if (page !== 'mypage') return;

  // ✅ 로그인 안 되어 있으면 로그인으로
  if (!isLoggedIn()) {
    sessionStorage.setItem(
      REDIRECT_KEY,
      window.location.pathname + window.location.search,
    );
    window.location.href = loginHref();
    return;
  }

  // ✅ 비밀번호 재확인 안 했으면 prev-mypage로
  const verified = sessionStorage.getItem(MYPAGE_VERIFY_KEY) === 'true';

  if (!verified) {
    window.location.href = prevMypageHref();
  }
}

export function initPrevMypage() {
  initPrevMypageForm();
  initMypageGuard();
}
