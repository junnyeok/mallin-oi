// assets/js/modules/mypage.js
import { supabase } from '../lib/supabase-client.js';
import {
  getCurrentUser,
  getNicknameValue,
  getDisplayName,
  getUserEmail,
  saveRedirect,
  loginHref,
  homeHref,
  signOutUser,
  verifyCurrentPassword,
} from './auth-store.js';

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

function isValidNickname(v) {
  return String(v || '').trim().length >= 2;
}

async function guardMypage() {
  const form = $('mypageForm');
  if (!form) return null;

  const user = await getCurrentUser();

  if (!user) {
    saveRedirect(`${window.location.pathname}${window.location.search}`);
    window.location.href = loginHref();
    return null;
  }

  return user;
}

function formatDate(isoString) {
  if (!isoString) return '-';

  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

async function loadPostsData() {
  const candidates = [
    './assets/data/posts.json',
    './data/posts.json',
    './posts.json',
    '../assets/data/posts.json',
    '../data/posts.json',
    '../posts.json',
  ];

  for (const url of candidates) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;

      const data = await res.json();
      if (Array.isArray(data)) return data;
    } catch {
      // continue
    }
  }

  return [];
}

function countUserPosts(posts, user) {
  if (!Array.isArray(posts) || !user) return 0;

  const nickname = getNicknameValue(user);
  const email = getUserEmail(user);

  return posts.filter((post) => {
    const authorId = String(post.authorId || post.userId || '').trim();
    const authorNick = String(
      post.author || post.nickname || post.authorNickname || '',
    ).trim();

    return (
      (!!nickname && authorNick === nickname) || (!!email && authorId === email)
    );
  }).length;
}

async function fillSummary(user) {
  const createdAtEl = $('mypageCreatedAt');
  const postCountEl = $('mypagePostCount');

  if (createdAtEl) {
    createdAtEl.textContent = formatDate(user?.created_at);
  }

  if (postCountEl) {
    const posts = await loadPostsData();
    postCountEl.textContent = String(countUserPosts(posts, user));
  }
}

function fillUserInfo(user) {
  const form = $('mypageForm');
  if (!form || !user) return;

  const emailInput = $('mypageEmail');
  const nickInput = $('mypageNickname');

  if (emailInput) emailInput.value = getUserEmail(user);
  if (nickInput)
    nickInput.value = getNicknameValue(user) || getDisplayName(user);
}

function initRealtimeValidation() {
  const form = $('mypageForm');
  if (!form) return;

  const nickInput = $('mypageNickname');
  const msgNick = ensureMsgEl('mypageNickname');

  if (nickInput) {
    nickInput.addEventListener('blur', () => {
      const val = nickInput.value.trim();

      if (!val) {
        setMsg(msgNick, '닉네임을 입력해줘.');
        return;
      }

      if (!isValidNickname(val)) {
        setMsg(msgNick, '닉네임은 최소 2글자 이상이야.');
        return;
      }

      clearMsg(msgNick);
    });
  }
}

function initMypageSubmit(user) {
  const form = $('mypageForm');
  if (!form) return;

  const msg = $('mypageMsg');

  const emailInput = $('mypageEmail');
  const nickInput = $('mypageNickname');
  const currentPwInput = $('mypageCurrentPw');
  const newPwInput = $('mypageNewPw');
  const newPw2Input = $('mypageNewPw2');

  const msgNick = ensureMsgEl('mypageNickname');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput?.value.trim() || '';
    const nickname = nickInput?.value.trim() || '';

    const currentPw = currentPwInput?.value || '';
    const newPw = newPwInput?.value || '';
    const newPw2 = newPw2Input?.value || '';

    clearMsg(msgNick);
    setMsg(msg, '', 'var(--color-text-sub)');

    if (!nickname || !isValidNickname(nickname)) {
      setMsg(msgNick, '닉네임은 최소 2글자 이상이야.');
      setMsg(msg, '닉네임을 다시 확인해줘.', 'red');
      return;
    }

    if (email !== getUserEmail(user)) {
      setMsg(msg, '이메일은 현재 변경할 수 없어.', 'red');
      if (emailInput) emailInput.value = getUserEmail(user);
      return;
    }

    const wantsPwChange = currentPw || newPw || newPw2;

    if (wantsPwChange) {
      if (!currentPw || !newPw || !newPw2) {
        setMsg(
          msg,
          '비밀번호를 변경하려면 현재/새 비밀번호를 모두 입력해줘.',
          'red',
        );
        return;
      }

      const verify = await verifyCurrentPassword(currentPw);

      if (!verify.ok) {
        setMsg(msg, verify.message, 'red');
        if (currentPwInput) {
          currentPwInput.value = '';
          currentPwInput.focus();
        }
        return;
      }

      if (newPw.length < 6) {
        setMsg(msg, '새 비밀번호는 최소 6자 이상이어야 해.', 'red');
        return;
      }

      if (newPw !== newPw2) {
        setMsg(msg, '새 비밀번호가 서로 일치하지 않아.', 'red');
        return;
      }
    }

    const payload = {
      data: {
        ...(user.user_metadata || {}),
        nickname,
      },
    };

    if (wantsPwChange) {
      payload.password = newPw;
    }

    const { error } = await supabase.auth.updateUser(payload);

    if (error) {
      console.error('[mypage] updateUser error:', error);
      setMsg(msg, `저장 실패: ${error.message}`, 'red');
      return;
    }

    if (currentPwInput) currentPwInput.value = '';
    if (newPwInput) newPwInput.value = '';
    if (newPw2Input) newPw2Input.value = '';

    setMsg(msg, '회원정보가 저장됐어.', 'green');

    setTimeout(() => {
      window.location.reload();
    }, 400);
  });
}

function initLogoutButton() {
  const btn = $('mypageLogoutBtn');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    try {
      await signOutUser();
      window.location.href = homeHref();
    } catch (err) {
      console.error(err);
      alert(`로그아웃 실패: ${err.message}`);
    }
  });
}

function initWithdraw() {
  const btn = $('mypageWithdrawBtn');
  if (!btn) return;

  const msg = $('mypageWithdrawMsg');

  btn.addEventListener('click', () => {
    setMsg(
      msg,
      '회원탈퇴는 아직 프론트만으로 안전하게 처리할 수 없어. 이건 다음에 백엔드/관리자 권한까지 붙여서 처리하자.',
      'red',
    );
  });
}

export async function initMypage() {
  const form = $('mypageForm');
  if (!form) return;

  const user = await guardMypage();
  if (!user) return;

  fillUserInfo(user);
  await fillSummary(user);
  initRealtimeValidation();
  initMypageSubmit(user);
  initLogoutButton();
  initWithdraw();
}
