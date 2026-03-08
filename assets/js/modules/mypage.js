// assets/js/modules/mypage.js

import {
  REDIRECT_KEY,
  readUsers,
  writeUsers,
  sha256,
  isLoggedIn,
  getLoggedInUserId,
  loginHref,
  homeHref,
  logoutAndClear,
} from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

/* ================= 메시지 생성 ================= */

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
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function isValidNickname(v) {
  return String(v).trim().length >= 2;
}

function getCurrentUser() {
  const userId = getLoggedInUserId();
  if (!userId) return null;

  const users = readUsers();
  return users.find((u) => u.userId === userId) || null;
}

function getCurrentUserIndex() {
  const userId = getLoggedInUserId();
  if (!userId) return -1;

  const users = readUsers();
  return users.findIndex((u) => u.userId === userId);
}

function isDuplicateEmail(email, currentUserId) {
  const users = readUsers();
  return users.some((u) => u.email === email && u.userId !== currentUserId);
}

function isDuplicateNick(nickname, currentUserId) {
  const users = readUsers();
  return users.some(
    (u) => u.nickname === nickname && u.userId !== currentUserId,
  );
}

/* ================= 로그인 보호 ================= */

function guardMypage() {
  const form = $('mypageForm');
  if (!form) return false;

  if (!isLoggedIn()) {
    sessionStorage.setItem(
      REDIRECT_KEY,
      window.location.pathname + window.location.search,
    );
    window.location.href = loginHref();
    return false;
  }

  const currentUser = getCurrentUser();

  if (!currentUser) {
    sessionStorage.setItem(
      REDIRECT_KEY,
      window.location.pathname + window.location.search,
    );
    window.location.href = loginHref();
    return false;
  }

  return true;
}

/* ================= 날짜 포맷 ================= */

function formatDate(isoString) {
  if (!isoString) return '-';

  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '-';

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}.${m}.${day}`;
}

/* ================= 작성글 수 ================= */

async function loadPostsData() {
  const candidates = [
    './data/posts.json',
    './posts.json',
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

function countUserPosts(posts, currentUser) {
  if (!Array.isArray(posts) || !currentUser) return 0;

  return posts.filter((post) => {
    const authorId = String(post.authorId || post.userId || '').trim();
    const authorNick = String(post.author || post.nickname || '').trim();

    return (
      authorId === currentUser.userId || authorNick === currentUser.nickname
    );
  }).length;
}

async function fillSummary() {
  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const createdAtEl = $('mypageCreatedAt');
  const postCountEl = $('mypagePostCount');

  if (createdAtEl) {
    createdAtEl.textContent = formatDate(currentUser.createdAt);
  }

  if (postCountEl) {
    const posts = await loadPostsData();
    const count = countUserPosts(posts, currentUser);
    postCountEl.textContent = String(count);
  }
}

/* ================= 초기값 채우기 ================= */

function fillUserInfo() {
  const form = $('mypageForm');
  if (!form) return;

  const currentUser = getCurrentUser();
  if (!currentUser) return;

  const idInput = $('mypageId');
  const emailInput = $('mypageEmail');
  const nickInput = $('mypageNickname');

  if (idInput) idInput.value = currentUser.userId || '';
  if (emailInput) emailInput.value = currentUser.email || '';
  if (nickInput) nickInput.value = currentUser.nickname || '';
}

/* ================= 중복 체크 ================= */

function initRealtimeValidation() {
  const form = $('mypageForm');
  if (!form) return;

  const emailInput = $('mypageEmail');
  const nickInput = $('mypageNickname');

  const msgEmail = ensureMsgEl('mypageEmail');
  const msgNick = ensureMsgEl('mypageNickname');

  const currentUser = getCurrentUser();
  if (!currentUser) return;

  if (emailInput) {
    emailInput.addEventListener('blur', () => {
      const val = emailInput.value.trim();

      if (!val) {
        setMsg(msgEmail, '이메일을 입력해줘.');
        return;
      }

      if (!isValidEmail(val)) {
        setMsg(msgEmail, '이메일 형식이 올바르지 않습니다.');
        return;
      }

      if (val === currentUser.email) {
        clearMsg(msgEmail);
        return;
      }

      if (isDuplicateEmail(val, currentUser.userId)) {
        setMsg(msgEmail, '중복된 이메일입니다.');
      } else {
        clearMsg(msgEmail);
      }
    });
  }

  if (nickInput) {
    nickInput.addEventListener('blur', () => {
      const val = nickInput.value.trim();

      if (!val) {
        setMsg(msgNick, '닉네임을 입력해줘.');
        return;
      }

      if (!isValidNickname(val)) {
        setMsg(msgNick, '닉네임은 최소 2글자 이상입니다.');
        return;
      }

      if (val === currentUser.nickname) {
        clearMsg(msgNick);
        return;
      }

      if (isDuplicateNick(val, currentUser.userId)) {
        setMsg(msgNick, '중복된 닉네임입니다.');
      } else {
        clearMsg(msgNick);
      }
    });
  }
}

/* ================= 저장 ================= */

function initMypageSubmit() {
  const form = $('mypageForm');
  if (!form) return;

  const msg = $('mypageMsg');

  const emailInput = $('mypageEmail');
  const nickInput = $('mypageNickname');
  const currentPwInput = $('mypageCurrentPw');
  const newPwInput = $('mypageNewPw');
  const newPw2Input = $('mypageNewPw2');

  const msgEmail = ensureMsgEl('mypageEmail');
  const msgNick = ensureMsgEl('mypageNickname');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const currentUser = getCurrentUser();
    const currentIndex = getCurrentUserIndex();

    if (!currentUser || currentIndex < 0) {
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

    const email = emailInput?.value.trim() || '';
    const nickname = nickInput?.value.trim() || '';
    const currentPw = currentPwInput?.value || '';
    const newPw = newPwInput?.value || '';
    const newPw2 = newPw2Input?.value || '';

    clearMsg(msgEmail);
    clearMsg(msgNick);
    setMsg(msg, '');

    if (!email) {
      setMsg(msgEmail, '이메일을 입력해줘.');
      setMsg(msg, '입력값을 확인해줘.', 'red');
      return;
    }

    if (!isValidEmail(email)) {
      setMsg(msgEmail, '이메일 형식이 올바르지 않습니다.');
      setMsg(msg, '이메일 형식을 확인해줘.', 'red');
      return;
    }

    if (isDuplicateEmail(email, currentUser.userId)) {
      setMsg(msgEmail, '중복된 이메일입니다.');
      setMsg(msg, '중복된 이메일은 사용할 수 없어.', 'red');
      return;
    }

    if (!nickname) {
      setMsg(msgNick, '닉네임을 입력해줘.');
      setMsg(msg, '입력값을 확인해줘.', 'red');
      return;
    }

    if (!isValidNickname(nickname)) {
      setMsg(msgNick, '닉네임은 최소 2글자 이상입니다.');
      setMsg(msg, '닉네임을 다시 확인해줘.', 'red');
      return;
    }

    if (isDuplicateNick(nickname, currentUser.userId)) {
      setMsg(msgNick, '중복된 닉네임입니다.');
      setMsg(msg, '중복된 닉네임은 사용할 수 없어.', 'red');
      return;
    }

    const wantsPwChange = currentPw || newPw || newPw2;

    let nextPassHash = currentUser.passHash;

    if (wantsPwChange) {
      if (!currentPw || !newPw || !newPw2) {
        setMsg(msg, '비밀번호를 변경하려면 모든 칸을 입력해줘.', 'red');
        return;
      }

      const currentHash = await sha256(currentPw);

      if (currentHash !== currentUser.passHash) {
        setMsg(msg, '현재 비밀번호가 올바르지 않습니다.', 'red');
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
        setMsg(msg, '새 비밀번호가 서로 일치하지 않습니다.', 'red');
        return;
      }

      nextPassHash = await sha256(newPw);
    }

    const users = readUsers();

    users[currentIndex] = {
      ...users[currentIndex],
      email,
      nickname,
      passHash: nextPassHash,
      updatedAt: new Date().toISOString(),
    };

    writeUsers(users);

    if (currentPwInput) currentPwInput.value = '';
    if (newPwInput) newPwInput.value = '';
    if (newPw2Input) newPw2Input.value = '';

    setMsg(msg, '회원정보가 저장되었습니다.', 'green');

    setTimeout(() => {
      window.location.reload();
    }, 500);
  });
}

/* ================= 로그아웃 ================= */

function initLogoutButton() {
  const btn = $('mypageLogoutBtn');
  if (!btn) return;

  btn.addEventListener('click', () => {
    logoutAndClear();
    window.location.href = homeHref();
  });
}

/* ================= 회원탈퇴 ================= */

function initWithdraw() {
  const btn = $('mypageWithdrawBtn');
  if (!btn) return;

  const msg = $('mypageWithdrawMsg');
  const confirmInput = $('withdrawConfirmText');
  const pwInput = $('withdrawCurrentPw');

  btn.addEventListener('click', async () => {
    const currentUser = getCurrentUser();
    const currentIndex = getCurrentUserIndex();

    if (!currentUser || currentIndex < 0) {
      setMsg(msg, '사용자 정보를 찾을 수 없어. 다시 로그인해줘.', 'red');
      return;
    }

    const confirmText = confirmInput?.value.trim() || '';
    const currentPw = pwInput?.value || '';

    if (confirmText !== '탈퇴합니다') {
      setMsg(msg, '확인 문구를 정확히 입력해줘.', 'red');
      return;
    }

    if (!currentPw) {
      setMsg(msg, '현재 비밀번호를 입력해줘.', 'red');
      return;
    }

    const currentHash = await sha256(currentPw);

    if (currentHash !== currentUser.passHash) {
      setMsg(msg, '현재 비밀번호가 올바르지 않습니다.', 'red');
      if (pwInput) {
        pwInput.value = '';
        pwInput.focus();
      }
      return;
    }

    const ok = window.confirm(
      '정말 회원탈퇴할까?\n현재 브라우저에 저장된 계정 정보가 삭제돼.',
    );

    if (!ok) return;

    const users = readUsers();
    users.splice(currentIndex, 1);
    writeUsers(users);

    logoutAndClear();
    sessionStorage.removeItem('mypageVerified_v1');

    alert('회원탈퇴가 완료되었습니다.');
    window.location.href = homeHref();
  });
}

/* ================= init ================= */

export async function initMypage() {
  const form = $('mypageForm');
  if (!form) return;

  const ok = guardMypage();
  if (!ok) return;

  fillUserInfo();
  await fillSummary();
  initRealtimeValidation();
  initMypageSubmit();
  initLogoutButton();
  initWithdraw();
}
