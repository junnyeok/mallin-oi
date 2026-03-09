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

function getEmailRedirectTo() {
  // 회원가입 인증 메일 클릭 후 돌아올 주소
  // GitHub Pages 기준: 로그인 페이지로 보내는 게 제일 무난
  const origin = window.location.origin;
  return `${origin}/login.html`;
}

function getFriendlySignupError(error) {
  if (!error) return '알 수 없는 오류가 발생했어.';

  const code = error.code || '';
  const message = error.message || '';

  // Supabase 공식 에러 코드 우선 처리
  if (code === 'over_email_send_rate_limit') {
    return '인증 메일 발송 제한에 걸렸어. 잠시 후 다시 시도해줘.';
  }

  if (code === 'over_request_rate_limit') {
    return '요청이 너무 많았어. 잠시 후 다시 시도해줘.';
  }

  if (code === 'email_exists' || code === 'user_already_exists') {
    return '이미 가입된 이메일이야. 로그인하거나 비밀번호 찾기를 이용해줘.';
  }

  if (code === 'email_address_invalid') {
    return '사용할 수 없는 이메일 주소야. 다른 이메일로 시도해줘.';
  }

  if (code === 'email_address_not_authorized') {
    return '현재 메일 발송 설정으로는 이 이메일 주소에 인증 메일을 보낼 수 없어. Supabase SMTP 설정을 확인해줘.';
  }

  if (code === 'signup_disabled') {
    return '현재 회원가입이 비활성화되어 있어. Supabase 설정을 확인해줘.';
  }

  if (code === 'email_provider_disabled') {
    return '이메일 회원가입이 비활성화되어 있어. Supabase Auth 설정을 확인해줘.';
  }

  // message 기반 보조 처리
  if (message.toLowerCase().includes('email rate limit exceeded')) {
    return '인증 메일 발송 제한에 걸렸어. 잠시 후 다시 시도해줘.';
  }

  return `회원가입 실패: ${message}`;
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
  const submitBtn = form.querySelector('button[type="submit"]');

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
      emailInput?.focus();
      return;
    }

    if (!isValidNickname(nickname)) {
      setMsg(msgNick, '닉네임은 최소 2글자 이상이야.');
      nickInput?.focus();
      return;
    }

    if (!agreeTerms?.checked || !agreePrivacy?.checked) {
      alert('필수 약관에 동의해야 해.');
      return;
    }

    if (!pw || pw.length < 6) {
      alert('비밀번호는 최소 6자 이상으로 입력해줘.');
      pwInput?.focus();
      return;
    }

    if (pw !== pw2) {
      alert('비밀번호가 일치하지 않아.');
      pw2Input?.focus();
      return;
    }

    if (submitBtn) submitBtn.disabled = true;

    if (signupMsg) {
      signupMsg.textContent = '회원가입 처리 중...';
      signupMsg.style.color = 'var(--color-text-sub)';
    }

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: {
          emailRedirectTo: getEmailRedirectTo(),
          data: {
            nickname,
          },
        },
      });

      if (error) {
        console.error('[signup] signUp error:', error);

        if (signupMsg) {
          signupMsg.textContent = getFriendlySignupError(error);
          signupMsg.style.color = 'red';
        } else {
          alert(getFriendlySignupError(error));
        }
        return;
      }

      // 이메일 인증이 켜져 있으면 session 없이 가입 완료됨
      if (!data.session) {
        if (signupMsg) {
          signupMsg.textContent =
            '회원가입 완료! 인증 메일을 보냈어. 메일함과 스팸함을 확인한 뒤 인증하고 로그인해줘.';
          signupMsg.style.color = 'green';
        }

        form.reset();

        setTimeout(() => {
          window.location.href = loginHref();
        }, 1200);
        return;
      }

      // 이메일 인증이 꺼져 있으면 바로 세션 생성될 수 있음
      if (signupMsg) {
        signupMsg.textContent = '회원가입 완료! 로그인 페이지로 이동할게.';
        signupMsg.style.color = 'green';
      }

      form.reset();

      setTimeout(() => {
        window.location.href = loginHref();
      }, 800);
    } catch (err) {
      console.error('[signup] unexpected error:', err);

      if (signupMsg) {
        signupMsg.textContent =
          '회원가입 중 예상치 못한 오류가 발생했어. 잠시 후 다시 시도해줘.';
        signupMsg.style.color = 'red';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
