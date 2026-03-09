// assets/js/modules/signup.js
import { supabase } from './supabase-client.js';
import { loginHref } from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

function ensureMsgEl(inputId) {
  const input = $(inputId);
  if (!input) return null;

  let msg = input.parentElement.querySelector('.field-msg');

  if (!msg) {
    msg = document.createElement('p');
    msg.className = 'field-msg';
    input.parentElement.appendChild(msg);
  }

  return msg;
}

function setMsg(el, text, color = 'red') {
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

function clearMsg(el) {
  if (!el) return;
  el.textContent = '';
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function isValidNickname(v) {
  return String(v || '').trim().length >= 2;
}

export function initSignup() {
  const form = $('signupForm');
  if (!form) return;

  const emailInput = $('signupEmail');
  const nickInput = $('signupNickname');
  const pwInput = $('signupPw');
  const pw2Input = $('signupPw2');
  const signupMsg = $('signupMsg');

  const msgEmail = ensureMsgEl('signupEmail');
  const msgNick = ensureMsgEl('signupNickname');

  const agreeTerms = $('agreeTerms');
  const agreePrivacy = $('agreePrivacy');

  emailInput?.addEventListener('blur', () => {
    const val = emailInput.value.trim();
    if (!val) return clearMsg(msgEmail);

    if (!isValidEmail(val)) {
      setMsg(msgEmail, '이메일 형식이 올바르지 않아.');
      return;
    }

    clearMsg(msgEmail);
  });

  nickInput?.addEventListener('blur', () => {
    const val = nickInput.value.trim();
    if (!val) return clearMsg(msgNick);

    if (!isValidNickname(val)) {
      setMsg(msgNick, '닉네임은 최소 2글자 이상이야.');
      return;
    }

    clearMsg(msgNick);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput?.value.trim() || '';
    const nickname = nickInput?.value.trim() || '';
    const pw = pwInput?.value || '';
    const pw2 = pw2Input?.value || '';

    clearMsg(msgEmail);
    clearMsg(msgNick);
    if (signupMsg) {
      signupMsg.textContent = '';
      signupMsg.style.color = 'var(--color-text-sub)';
    }

    if (!isValidEmail(email)) {
      setMsg(msgEmail, '이메일 형식을 확인해줘.');
      return;
    }

    if (!isValidNickname(nickname)) {
      setMsg(msgNick, '닉네임은 최소 2글자 이상이야.');
      return;
    }

    if (!agreeTerms?.checked || !agreePrivacy?.checked) {
      alert('필수 약관에 동의해야 해.');
      return;
    }

    if (!pw || pw.length < 6) {
      alert('비밀번호는 최소 6자 이상으로 입력해줘.');
      return;
    }

    if (pw !== pw2) {
      alert('비밀번호가 일치하지 않아.');
      return;
    }

    if (signupMsg) {
      signupMsg.textContent = '회원가입 처리 중...';
      signupMsg.style.color = 'var(--color-text-sub)';
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password: pw,
      options: {
        data: {
          nickname,
        },
      },
    });

    if (error) {
      console.error('[signup] signUp error:', error);

      if (signupMsg) {
        signupMsg.textContent = `회원가입 실패: ${error.message}`;
        signupMsg.style.color = 'red';
      } else {
        alert(`회원가입 실패: ${error.message}`);
      }
      return;
    }

    if (!data.session) {
      if (signupMsg) {
        signupMsg.textContent = '회원가입 완료! 이메일 인증 후 로그인해줘.';
        signupMsg.style.color = 'green';
      }

      setTimeout(() => {
        window.location.href = loginHref();
      }, 500);
      return;
    }

    if (signupMsg) {
      signupMsg.textContent = '회원가입 완료! 로그인 페이지로 이동할게.';
      signupMsg.style.color = 'green';
    }

    setTimeout(() => {
      window.location.href = loginHref();
    }, 500);
  });
}
