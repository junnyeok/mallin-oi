// assets/js/modules/account-recovery.js
import { supabase } from './supabase-client.js';
import { resetPasswordHref } from './auth-store.js';

function setMessage(el, text, type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = type ? `account-auth-msg ${type}` : 'account-auth-msg';
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());
}

function getResetRedirectUrl() {
  return new URL(resetPasswordHref(), window.location.origin).toString();
}

function initFindIdPage() {
  const form = document.getElementById('findIdForm');
  const emailInput = document.getElementById('findIdEmail');
  const msg = document.getElementById('findIdMsg');

  if (!form || !emailInput || !msg) return;

  form.addEventListener('submit', (e) => {
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

    setMessage(
      msg,
      '지금 Supabase 로그인 기준에서는 가입한 이메일 자체가 로그인 아이디야.',
      'is-success',
    );
  });
}

function initFindPasswordPage() {
  const form = document.getElementById('findPasswordForm');
  const idInput = document.getElementById('findPasswordId');
  const emailInput = document.getElementById('findPasswordEmail');
  const msg = document.getElementById('findPasswordMsg');

  if (!form || !idInput || !emailInput || !msg) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const idValue = idInput.value.trim();
    const email = emailInput.value.trim();

    if (!idValue) {
      setMessage(msg, '이메일(아이디)을 입력해줘.', 'is-error');
      return;
    }

    if (!email) {
      setMessage(msg, '이메일을 입력해줘.', 'is-error');
      return;
    }

    if (!isValidEmail(idValue) || !isValidEmail(email)) {
      setMessage(msg, '이메일 형식을 확인해줘.', 'is-error');
      return;
    }

    if (idValue !== email) {
      setMessage(
        msg,
        '현재 로그인 아이디는 이메일이야. 두 칸 모두 같은 이메일로 입력해줘.',
        'is-error',
      );
      return;
    }

    setMessage(msg, '비밀번호 재설정 메일 보내는 중...', '');

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
      '이메일이 맞다면 비밀번호 재설정 링크가 전송됐어. 메일함을 확인해줘.',
      'is-success',
    );
  });
}

async function initResetPasswordPage() {
  const form = document.getElementById('resetPasswordForm');
  const pw1Input = document.getElementById('newPassword');
  const pw2Input = document.getElementById('confirmPassword');
  const msg = document.getElementById('resetPasswordMsg');

  if (!form || !pw1Input || !pw2Input || !msg) return;

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    setMessage(
      msg,
      '재설정 링크로 들어온 세션을 찾지 못했어. 이메일에서 다시 들어와줘.',
      'is-error',
    );
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pw1 = pw1Input.value.trim();
    const pw2 = pw2Input.value.trim();

    if (!pw1 || !pw2) {
      setMessage(msg, '비밀번호를 모두 입력해줘.', 'is-error');
      return;
    }

    if (pw1.length < 6) {
      setMessage(msg, '비밀번호는 최소 6자 이상으로 입력해줘.', 'is-error');
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
  });
}

export function initAccountRecovery() {
  const page = document.body?.dataset?.page;
  if (!page) return;

  if (page === 'find-id') {
    initFindIdPage();
    return;
  }

  if (page === 'find-password') {
    initFindPasswordPage();
    return;
  }

  if (page === 'reset-password') {
    initResetPasswordPage();
  }
}
