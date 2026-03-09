// assets/js/modules/login.js
import { supabase } from '../lib/supabase-client.js';
import { consumeRedirect, homeHref } from './auth-store.js';

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

export function initLogin() {
  const form = $('loginForm');
  if (!form) return;

  const msg = $('loginMsg');
  const idInput = $('loginId');
  const pwInput = $('loginPw');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = idInput?.value.trim() || '';
    const password = pwInput?.value || '';

    if (!email || !password) {
      setMsg(msg, '이메일(아이디)과 비밀번호를 입력해줘.', 'red');
      return;
    }

    if (!isValidEmail(email)) {
      setMsg(msg, '지금 Supabase 로그인은 가입한 이메일로 해야 해.', 'red');
      return;
    }

    setMsg(msg, '로그인 중...', 'var(--color-text-sub)');

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error('[login] signInWithPassword error:', error);
      setMsg(
        msg,
        '로그인에 실패했어. 이메일 또는 비밀번호를 다시 확인해줘.',
        'red',
      );
      return;
    }

    setMsg(msg, '로그인 성공! 이동할게.', 'green');

    const redirectTo = consumeRedirect(homeHref());

    setTimeout(() => {
      window.location.href = redirectTo;
    }, 300);
  });
}
