import { supabase } from './supabase-client.js';
import { resetPasswordHref } from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

function setMessage(el, text, type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = type ? `account-auth-msg ${type}` : 'account-auth-msg';
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function isStrongPassword(v) {
  const value = String(v || '');
  return (
    value.length >= 10 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function getResetRedirectUrl() {
  return new URL(resetPasswordHref(), window.location.origin).toString();
}

async function ensureRecoverySession() {
  const {
    data: { session: currentSession },
  } = await supabase.auth.getSession();

  if (currentSession) return currentSession;

  const searchParams = new URLSearchParams(window.location.search);
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hash);

  const code = searchParams.get('code');
  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('[account-recovery] exchangeCodeForSession error:', error);
      return null;
    }
    return data?.session || null;
  }

  const accessToken = hashParams.get('access_token');
  const refreshToken = hashParams.get('refresh_token');

  if (accessToken && refreshToken) {
    const { data, error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    if (error) {
      console.error('[account-recovery] setSession error:', error);
      return null;
    }

    return data?.session || null;
  }

  return null;
}

function initFindPasswordPage() {
  const form = $('findPasswordForm');
  const emailInput = $('findPasswordEmail');
  const msg = $('findPasswordMsg');

  if (!form || !emailInput || !msg) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput.value.trim();

    if (!email) {
      setMessage(msg, '이메일을 입력해줘.', 'is-error');
      return;
    }

    if (!isValidEmail(email)) {
      setMessage(msg, '이메일 형식을 확인해줘.', 'is-error');
      return;
    }

    setMessage(msg, '비밀번호 재설정 메일 보내는 중...');

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getResetRedirectUrl(),
    });

    if (error) {
      console.error('[account-recovery] resetPasswordForEmail error:', error);
      setMessage(
        msg,
        '재설정 메일 전송에 실패했어. Supabase Redirect URL 설정도 같이 확인해줘.',
        'is-error',
      );
      return;
    }

    setMessage(
      msg,
      '입력한 이메일로 가입된 계정이 있다면 재설정 메일을 보냈어. 메일함과 스팸함을 확인해줘.',
      'is-success',
    );
  });
}

async function initResetPasswordPage() {
  const form = $('resetPasswordForm');
  const pw1Input = $('newPassword');
  const pw2Input = $('confirmPassword');
  const msg = $('resetPasswordMsg');

  if (!form || !pw1Input || !pw2Input || !msg) return;

  let recoverySession = await ensureRecoverySession();

  if (!recoverySession) {
    const { data } = await supabase.auth.getSession();
    recoverySession = data?.session || null;
  }

  if (!recoverySession) {
    setMessage(
      msg,
      '재설정 링크로 들어온 세션을 찾지 못했어. 이메일에서 다시 들어와줘.',
      'is-error',
    );
  } else {
    setMessage(msg, '');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const { data } = await supabase.auth.getSession();
    const activeSession = data?.session || recoverySession;

    if (!activeSession) {
      setMessage(
        msg,
        '재설정 세션이 만료됐거나 유실됐어. 이메일에서 링크를 다시 눌러줘.',
        'is-error',
      );
      return;
    }

    const pw1 = pw1Input.value.trim();
    const pw2 = pw2Input.value.trim();

    if (!pw1 || !pw2) {
      setMessage(msg, '비밀번호를 모두 입력해줘.', 'is-error');
      return;
    }

    if (!isStrongPassword(pw1)) {
      setMessage(
        msg,
        '비밀번호는 영문자+숫자+특수기호를 포함한 10자 이상으로 입력해줘.',
        'is-error',
      );
      return;
    }

    if (pw1 !== pw2) {
      setMessage(msg, '비밀번호가 서로 일치하지 않아.', 'is-error');
      return;
    }

    const { error } = await supabase.auth.updateUser({
      password: pw1,
    });

    if (error) {
      console.error('[account-recovery] updateUser error:', error);
      setMessage(
        msg,
        '비밀번호 변경에 실패했어. 재설정 링크를 다시 받아서 시도해줘.',
        'is-error',
      );
      return;
    }

    setMessage(
      msg,
      '비밀번호가 변경됐어. 이제 새 비밀번호로 로그인하면 돼.',
      'is-success',
    );

    pw1Input.value = '';
    pw2Input.value = '';

    const cleanUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({}, document.title, cleanUrl);
  });
}

export function initAccountRecovery() {
  const page = document.body?.dataset?.page;
  if (!page) return;

  if (page === 'find-password') {
    initFindPasswordPage();
    return;
  }

  if (page === 'reset-password') {
    initResetPasswordPage();
  }
}
