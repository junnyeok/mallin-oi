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

function isValidRealName(v) {
  return String(v || '').trim().length >= 2;
}

function normalizeBirthKey(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

function isValidBirthKey(v) {
  return /^\d{7}$/.test(normalizeBirthKey(v));
}

function normalizeRecoveryAnswer(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isValidRecoveryAnswer(v) {
  return normalizeRecoveryAnswer(v).length >= 2;
}

async function sha256Hex(value) {
  const src = new TextEncoder().encode(String(value || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', src);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getEmailRedirectTo() {
  return new URL(loginHref(), window.location.origin).toString();
}

async function checkAccountAvailability({
  email = '',
  nickname = '',
  excludeUserId = null,
} = {}) {
  const { data, error } = await supabase.rpc('check_account_availability', {
    p_email: email || null,
    p_nickname: nickname || null,
    p_exclude_user_id: excludeUserId || null,
  });

  if (error) {
    console.error('[signup] check_account_availability error:', error);
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    emailExists: !!row?.email_exists,
    nicknameExists: !!row?.nickname_exists,
  };
}

function getFriendlySignupError(error) {
  if (!error) return '알 수 없는 오류가 발생했어.';

  const code = error.code || '';
  const message = error.message || '';
  const lowerMessage = message.toLowerCase();

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

  if (code === 'signup_disabled') {
    return '현재 회원가입이 비활성화되어 있어.';
  }

  if (
    lowerMessage.includes('duplicate key value') &&
    lowerMessage.includes('nickname')
  ) {
    return '이미 사용 중인 닉네임이야.';
  }

  if (
    lowerMessage.includes('duplicate key value') &&
    lowerMessage.includes('email')
  ) {
    return '이미 가입된 이메일이야.';
  }

  return `회원가입 실패: ${message}`;
}

export function initSignup() {
  const form = $('signupForm');
  if (!form) return;

  const emailInput = $('signupEmail');
  const nickInput = $('signupNickname');
  const realNameInput = $('signupRealName');
  const birthKeyInput = $('signupBirthKey');
  const questionInput = $('signupRecoveryQuestion');
  const answerInput = $('signupRecoveryAnswer');
  const pwInput = $('signupPw');
  const pw2Input = $('signupPw2');

  const agreeTerms = $('agreeTerms');
  const agreePrivacy = $('agreePrivacy');

  const submitBtn = $('signupSubmitBtn');
  const signupMsg = $('signupMsg');

  const msgEmail = ensureMsgEl('signupEmail');
  const msgNick = ensureMsgEl('signupNickname');
  const msgRealName = ensureMsgEl('signupRealName');
  const msgBirthKey = ensureMsgEl('signupBirthKey');
  const msgQuestion = ensureMsgEl('signupRecoveryQuestion');
  const msgAnswer = ensureMsgEl('signupRecoveryAnswer');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = emailInput?.value.trim() || '';
    const nickname = nickInput?.value.trim() || '';
    const realName = realNameInput?.value.trim() || '';
    const birthKey = birthKeyInput?.value.trim() || '';
    const recoveryQuestion = questionInput?.value || '';
    const recoveryAnswer = answerInput?.value || '';
    const pw = pwInput?.value || '';
    const pw2 = pw2Input?.value || '';
    const emailRedirectTo = getEmailRedirectTo();

    clearMsg(msgEmail);
    clearMsg(msgNick);
    clearMsg(msgRealName);
    clearMsg(msgBirthKey);
    clearMsg(msgQuestion);
    clearMsg(msgAnswer);

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

    if (!isValidRealName(realName)) {
      setMsg(msgRealName, '이름을 2글자 이상 입력해줘.');
      realNameInput?.focus();
      return;
    }

    if (!isValidBirthKey(birthKey)) {
      setMsg(msgBirthKey, '생년월일은 960829-1 형식으로 입력해줘.');
      birthKeyInput?.focus();
      return;
    }

    if (!recoveryQuestion) {
      setMsg(msgQuestion, '아이디 찾기 질문을 선택해줘.');
      questionInput?.focus();
      return;
    }

    if (!isValidRecoveryAnswer(recoveryAnswer)) {
      setMsg(msgAnswer, '아이디 찾기 답변을 2글자 이상 입력해줘.');
      answerInput?.focus();
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

    try {
      const availability = await checkAccountAvailability({ email, nickname });

      if (availability.emailExists) {
        setMsg(msgEmail, '이미 가입된 이메일이야.');
        emailInput?.focus();
        return;
      }

      if (availability.nicknameExists) {
        setMsg(msgNick, '이미 사용 중인 닉네임이야.');
        nickInput?.focus();
        return;
      }

      if (signupMsg) {
        signupMsg.textContent = '회원가입 처리 중...';
        signupMsg.style.color = 'var(--color-text-sub)';
      }

      const recoveryAnswerHash = await sha256Hex(
        normalizeRecoveryAnswer(recoveryAnswer),
      );

      const { data, error } = await supabase.auth.signUp({
        email,
        password: pw,
        options: {
          emailRedirectTo,
          data: {
            nickname,
            real_name: realName,
            birth_key: normalizeBirthKey(birthKey),
            recovery_question: recoveryQuestion,
            recovery_answer_hash: recoveryAnswerHash,
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
          '회원가입 중 오류가 발생했어. 잠시 후 다시 시도해줘.';
        signupMsg.style.color = 'red';
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
