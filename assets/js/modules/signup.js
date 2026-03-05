// assets/js/modules/signup.js
import {
  readUsers,
  writeUsers,
  findUserById,
  sha256,
  loginHref,
} from './auth-store.js';

function $(id) {
  return document.getElementById(id);
}

function setMsg(el, text, color = '') {
  if (!el) return;
  el.textContent = text || '';
  el.style.color = color || '';
}

function isValidUserId(v) {
  // signup.html 도움말: 4~20자, 공백X (영문/숫자 권장)
  // 너무 빡세게 막진 말고 공백만 금지 + 길이 기본
  if (v.length < 4 || v.length > 20) return false;
  if (/\s/.test(v)) return false;
  return true;
}

function isValidEmail(v) {
  // 브라우저 input type=email이 1차로 걸러주긴 하지만 한번 더
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export function initSignup() {
  const form = $('signupForm');
  if (!form) return; // signup 페이지 아니면 종료

  const msg = $('signupMsg');

  const elId = $('signupId');
  const elEmail = $('signupEmail');
  const elNick = $('signupNickname');
  const elPw = $('signupPw');
  const elPw2 = $('signupPw2');

  const agreeTerms = $('agreeTerms');
  const agreePrivacy = $('agreePrivacy');
  // const agreeMarketing = $('agreeMarketing'); // 저장은 선택

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    setMsg(msg, '');

    const userId = (elId?.value || '').trim();
    const email = (elEmail?.value || '').trim();
    const nickname = (elNick?.value || '').trim();
    const pw = elPw?.value || '';
    const pw2 = elPw2?.value || '';

    // 필수
    if (!userId || !email || !nickname || !pw || !pw2) {
      setMsg(msg, '모든 항목을 입력해줘.', 'red');
      return;
    }

    // 약관(필수)
    if (agreeTerms && !agreeTerms.checked) {
      setMsg(msg, '이용약관(필수)에 동의해줘.', 'red');
      agreeTerms.focus();
      return;
    }
    if (agreePrivacy && !agreePrivacy.checked) {
      setMsg(msg, '개인정보처리방침(필수)에 동의해줘.', 'red');
      agreePrivacy.focus();
      return;
    }

    // 유효성
    if (!isValidUserId(userId)) {
      setMsg(msg, '아이디는 4~20자, 공백 없이 입력해줘.', 'red');
      elId?.focus();
      return;
    }

    if (!isValidEmail(email)) {
      setMsg(msg, '이메일 형식이 올바르지 않아.', 'red');
      elEmail?.focus();
      return;
    }

    if (nickname.length < 2) {
      setMsg(msg, '닉네임은 최소 2글자 이상으로 해줘.', 'red');
      elNick?.focus();
      return;
    }

    if (pw.length < 6) {
      setMsg(msg, '비밀번호는 최소 6자 이상으로 해줘.', 'red');
      elPw?.focus();
      return;
    }

    if (pw !== pw2) {
      setMsg(msg, '비밀번호가 일치하지 않아.', 'red');
      elPw2?.focus();
      return;
    }

    // 중복 체크
    if (findUserById(userId)) {
      setMsg(msg, '이미 존재하는 아이디야.', 'red');
      elId?.focus();
      return;
    }

    // 저장
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

    setMsg(msg, '회원가입 완료! 로그인 페이지로 이동할게.', 'green');

    setTimeout(() => {
      window.location.href = loginHref(); // account/signup -> ../login.html
    }, 500);
  });
}
