// assets/js/modules/login.js
import { supabase } from './supabase-client.js';
import {
  consumeRedirect,
  homeHref,
  saveLoginPolicy,
  saveRedirect,
} from './auth-store.js';
import { isCalendarAppMode } from './app-calendar-mode.js';

function $(id) {
  return document.getElementById(id);
}

function setMsg(el, text, color = 'var(--color-text-sub)') {
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function getEmailRedirectTo() {
  return new URL(window.location.pathname + window.location.search, window.location.origin)
    .toString();
}

function isEmailNotConfirmedError(error) {
  const code = String(error?.code || '')
    .trim()
    .toLowerCase();
  const message = String(error?.message || '')
    .trim()
    .toLowerCase();

  return (
    code === 'email_not_confirmed' ||
    message.includes('email not confirmed')
  );
}

function isRateLimitError(error) {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();

  return (
    code === 'over_email_send_rate_limit' ||
    code === 'over_request_rate_limit' ||
    message.includes('rate limit')
  );
}

async function resendSignupEmail(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: getEmailRedirectTo(),
    },
  });

  if (error) throw error;
}

function getFriendlyResendError(error) {
  if (isRateLimitError(error)) {
    return '인증메일 발송 요청이 너무 많았어. 잠시 후 다시 시도해줘.';
  }

  return '인증메일을 다시 보내지 못했어. 이메일 주소를 확인해줘.';
}

function getFriendlyLoginError(error) {
  if (isEmailNotConfirmedError(error)) {
    return '이메일 인증이 아직 끝나지 않았어. 인증메일을 확인하거나 다시 보내기를 눌러줘.';
  }

  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || '').trim().toLowerCase();

  if (
    code === 'invalid_credentials' ||
    message.includes('invalid login credentials') ||
    message.includes('invalid credentials')
  ) {
    return '이메일 또는 비밀번호가 잘못됐어';
  }

  return '로그인에 실패했어. 잠시 후 다시 시도해줘.';
}

function hasEmailConfirmationParams() {
  const searchParams = new URLSearchParams(window.location.search || '');
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);
  const type = searchParams.get('type') || hashParams.get('type') || '';

  return (
    type === 'signup' ||
    type === 'email' ||
    searchParams.has('code') ||
    hashParams.has('access_token')
  );
}

function normalizeRedirectParam(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return '';

  const url = new URL(raw, window.location.href);

  if (url.origin !== window.location.origin) {
    return '';
  }

  return `${url.pathname}${url.search}${url.hash}`;
}

export function initLogin() {
  const form = $('loginForm');
  if (!form) return;
  if (form.dataset.loginBound === 'true') return;
  form.dataset.loginBound = 'true';

  const params = new URLSearchParams(window.location.search || '');
  const redirectFromQuery = normalizeRedirectParam(params.get('redirect'));

  if (redirectFromQuery) {
    saveRedirect(redirectFromQuery);
  }

  const msg = $('loginMsg');
  const idInput = $('loginId');
  const pwInput = $('loginPw');
  const rememberInput = $('rememberLogin');
  const resendBtn = $('loginResendBtn');
  const calendarAppMode = isCalendarAppMode();
  let lastUnconfirmedEmail = '';

  if (calendarAppMode && rememberInput) {
    rememberInput.checked = true;
  }

  const hideResend = () => {
    if (!resendBtn) return;
    resendBtn.hidden = true;
    resendBtn.disabled = false;
  };

  const showResend = (email) => {
    lastUnconfirmedEmail = email;
    if (!resendBtn) return;
    resendBtn.hidden = false;
    resendBtn.disabled = !isValidEmail(email);
  };

  hideResend();

  if (hasEmailConfirmationParams()) {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session?.user) {
        saveLoginPolicy({ autoLogin: true });
        setMsg(msg, '이메일 인증이 완료됐어. 이동할게.', 'green');

        const redirectTo = consumeRedirect(redirectFromQuery || homeHref());
        setTimeout(() => {
          window.location.href = redirectTo;
        }, 500);
        return;
      }

      setMsg(msg, '이메일 인증이 완료됐어. 이제 로그인해줘.', 'green');
    });
  }

  resendBtn?.addEventListener('click', async () => {
    const email = (lastUnconfirmedEmail || idInput?.value || '').trim();

    if (!isValidEmail(email)) {
      setMsg(msg, '인증메일을 다시 받을 이메일을 입력해줘.', 'red');
      idInput?.focus();
      return;
    }

    resendBtn.disabled = true;
    setMsg(msg, '인증메일을 다시 보내는 중...', 'var(--color-text-sub)');

    try {
      await resendSignupEmail(email);
      setMsg(
        msg,
        '인증메일을 다시 보냈어. 메일함과 스팸함을 확인해줘.',
        'green',
      );
    } catch (error) {
      console.error('[login] resend error:', error);
      setMsg(msg, getFriendlyResendError(error), 'red');
    } finally {
      resendBtn.disabled = false;
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = idInput?.value.trim() || '';
    const password = pwInput?.value || '';

    if (!email || !password) {
      hideResend();
      setMsg(msg, '이메일(아이디)과 비밀번호를 입력해줘.', 'red');
      return;
    }

    if (!isValidEmail(email)) {
      hideResend();
      setMsg(msg, '지금 Supabase 로그인은 가입한 이메일로 해야 해.', 'red');
      return;
    }

    hideResend();
    setMsg(msg, '로그인 중...', 'var(--color-text-sub)');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[login] signInWithPassword error:', error);
      setMsg(msg, getFriendlyLoginError(error), 'red');
      if (isEmailNotConfirmedError(error)) {
        showResend(email);
      }
      return;
    }

    saveLoginPolicy({
      autoLogin: !!rememberInput?.checked,
    });

    setMsg(msg, '로그인 성공! 이동할게.', 'green');

    const redirectTo = consumeRedirect(redirectFromQuery || homeHref());

    setTimeout(() => {
      window.location.href = redirectTo;
    }, 300);
  });
}
