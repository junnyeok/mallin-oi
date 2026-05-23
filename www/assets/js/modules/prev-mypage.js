// assets/js/modules/prev-mypage.js
import {
  saveRedirect,
  isMypageVerified,
  setMypageVerified,
  getCurrentUser,
  loginHref,
  mypageHref,
  prevMypageHref,
  verifyCurrentPassword,
} from './auth-store.js';

function setMsg(el, text, color = 'var(--color-text-sub)') {
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

async function initPrevMypageForm() {
  const form = document.getElementById('prevMypageForm');
  if (!form) return;

  const msg = document.getElementById('prevMypageMsg');
  const pwInput = document.getElementById('prevMypagePw');

  const user = await getCurrentUser();
  if (!user) {
    saveRedirect(`${window.location.pathname}${window.location.search}`);
    window.location.href = loginHref();
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pw = pwInput?.value ?? '';

    if (!pw.trim()) {
      setMsg(msg, '비밀번호를 입력해줘.', 'red');
      return;
    }

    setMsg(msg, '확인 중...', 'var(--color-text-sub)');

    const result = await verifyCurrentPassword(pw);

    if (!result.ok) {
      setMsg(msg, result.message, 'red');
      if (pwInput) {
        pwInput.value = '';
        pwInput.focus();
      }
      return;
    }

    setMypageVerified(true);
    setMsg(msg, '확인 완료! 마이페이지로 이동할게.', 'green');

    setTimeout(() => {
      window.location.href = mypageHref();
    }, 300);
  });
}

async function initMypageGuard() {
  const page = document.body?.dataset?.page;
  if (page !== 'mypage') return;

  const user = await getCurrentUser();

  if (!user) {
    saveRedirect(`${window.location.pathname}${window.location.search}`);
    window.location.href = loginHref();
    return;
  }

  if (!isMypageVerified()) {
    window.location.href = prevMypageHref();
  }
}

export function initPrevMypage() {
  initPrevMypageForm();
  initMypageGuard();
}
