// login.js

const STORAGE_KEY = 'mallinLoggedIn';
const USER_KEY = 'mallinUser';
const REDIRECT_KEY = 'authRedirectTo';

export function initLogin() {
  initLoginForm();
  initAuthUI();
}

/* ================= 로그인 폼 ================= */

function initLoginForm() {
  const form = document.getElementById('loginForm');
  if (!form) return;

  const msg = document.getElementById('loginMsg');

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('loginId').value.trim();
    const pw = document.getElementById('loginPw').value.trim();

    // 🔥 임시 더미 로그인
    if (id === 'admin' && pw === '1234') {
      localStorage.setItem(STORAGE_KEY, 'true');
      localStorage.setItem(USER_KEY, id);

      msg.style.color = 'green';
      msg.textContent = '로그인 성공! 이동합니다...';

      // ✅ 복귀 페이지 확인
      const redirectTo = sessionStorage.getItem(REDIRECT_KEY);

      setTimeout(() => {
        if (redirectTo) {
          sessionStorage.removeItem(REDIRECT_KEY);
          window.location.href = redirectTo;
        } else if (document.referrer) {
          // 직접 login.html로 왔을 경우 이전 페이지
          window.location.href = document.referrer;
        } else {
          window.location.href = './index.html';
        }
      }, 600);
    } else {
      msg.style.color = 'red';
      msg.textContent = '아이디 또는 비밀번호가 올바르지 않습니다.';
    }
  });
}

/* ================= 헤더 로그인/로그아웃 UI ================= */

function initAuthUI() {
  const loginLink = document.querySelector('.auth-link[href="./login.html"]');
  if (!loginLink) return;

  const isLoggedIn = localStorage.getItem(STORAGE_KEY) === 'true';

  if (isLoggedIn) {
    loginLink.textContent = '로그아웃';
    loginLink.href = '#';

    loginLink.addEventListener('click', (e) => {
      e.preventDefault();

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(USER_KEY);

      window.location.href = './index.html';
    });
  } else {
    // ✅ 로그인 버튼 클릭 시 현재 페이지 저장
    loginLink.addEventListener('click', () => {
      const current = window.location.pathname.split('/').pop() || 'index.html';
      sessionStorage.setItem(REDIRECT_KEY, `./${current}`);
    });
  }
}
