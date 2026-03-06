// assets/js/modules/signup.js

import { readUsers, writeUsers, sha256, loginHref } from './auth-store.js';

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

/* ================= 유효성 ================= */

function isValidUserId(v) {
  if (v.length < 4 || v.length > 20) return false;
  if (/\s/.test(v)) return false;
  return true;
}

function isValidEmail(v) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/* ================= 중복 체크 ================= */

function checkDuplicateId(id) {
  const users = readUsers();
  return users.some((u) => u.userId === id);
}

function checkDuplicateEmail(email) {
  const users = readUsers();
  return users.some((u) => u.email === email);
}

function checkDuplicateNick(nick) {
  const users = readUsers();
  return users.some((u) => u.nickname === nick);
}

/* ================= init ================= */

export function initSignup() {
  const form = $('signupForm');
  if (!form) return;

  const idInput = $('signupId');
  const emailInput = $('signupEmail');
  const nickInput = $('signupNickname');
  const pwInput = $('signupPw');
  const pw2Input = $('signupPw2');

  const msgId = ensureMsgEl('signupId');
  const msgEmail = ensureMsgEl('signupEmail');
  const msgNick = ensureMsgEl('signupNickname');

  const agreeTerms = $('agreeTerms');
  const agreePrivacy = $('agreePrivacy');

  /* ================= 아이디 실시간 체크 ================= */

  idInput.addEventListener('blur', () => {
    const val = idInput.value.trim();

    if (!val) return clearMsg(msgId);

    if (!isValidUserId(val)) {
      setMsg(msgId, '아이디는 4~20자, 공백 없이 입력해줘.');
      return;
    }

    if (checkDuplicateId(val)) {
      setMsg(msgId, '중복된 아이디입니다.');
    } else {
      clearMsg(msgId);
    }
  });

  /* ================= 이메일 실시간 체크 ================= */

  emailInput.addEventListener('blur', () => {
    const val = emailInput.value.trim();

    if (!val) return clearMsg(msgEmail);

    if (!isValidEmail(val)) {
      setMsg(msgEmail, '이메일 형식이 올바르지 않습니다.');
      return;
    }

    if (checkDuplicateEmail(val)) {
      setMsg(msgEmail, '중복된 이메일입니다.');
    } else {
      clearMsg(msgEmail);
    }
  });

  /* ================= 닉네임 실시간 체크 ================= */

  nickInput.addEventListener('blur', () => {
    const val = nickInput.value.trim();

    if (!val) return clearMsg(msgNick);

    if (val.length < 2) {
      setMsg(msgNick, '닉네임은 최소 2글자 이상입니다.');
      return;
    }

    if (checkDuplicateNick(val)) {
      setMsg(msgNick, '중복된 닉네임입니다.');
    } else {
      clearMsg(msgNick);
    }
  });

  /* ================= 회원가입 ================= */

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const userId = idInput.value.trim();
    const email = emailInput.value.trim();
    const nickname = nickInput.value.trim();
    const pw = pwInput.value;
    const pw2 = pw2Input.value;

    if (
      checkDuplicateId(userId) ||
      checkDuplicateEmail(email) ||
      checkDuplicateNick(nickname)
    ) {
      alert('중복된 정보가 있습니다.');
      return;
    }

    if (!agreeTerms.checked || !agreePrivacy.checked) {
      alert('필수 약관에 동의해야 합니다.');
      return;
    }

    if (pw !== pw2) {
      alert('비밀번호가 일치하지 않습니다.');
      return;
    }

    const users = readUsers();

    const passHash = await sha256(pw);

    users.push({
      userId,
      email,
      nickname,
      passHash,
      createdAt: new Date().toISOString(),
    });

    writeUsers(users);

    alert('회원가입 완료!');

    window.location.href = loginHref();
  });
}
