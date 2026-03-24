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

async function sha256Hex(value) {
  const src = new TextEncoder().encode(String(value || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', src);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function getResetRedirectUrl() {
  return new URL(resetPasswordHref(), window.location.origin).toString();
}

function getFriendlyRpcError(error) {
  const message = String(error?.message || '').trim();

  if (!message) return '알 수 없는 오류가 발생했어.';
  if (message.includes('find_id_recovery_start')) {
    return '아이디 찾기 함수 호출 중 오류가 발생했어.';
  }
  if (message.includes('verify_id_recovery')) {
    return '아이디 검증 함수 호출 중 오류가 발생했어.';
  }

  return message;
}

function initFindIdPage() {
  const form = $('findIdForm');
  const step1 = $('findIdStep1');
  const step2 = $('findIdStep2');

  const nameInput = $('findIdName');
  const birthInput = $('findIdBirthKey');
  const answerInput = $('findIdAnswer');

  const questionKeyInput = $('findIdQuestionKey');
  const maskedEmailEl = $('findIdMaskedEmail');
  const questionLabelEl = $('findIdQuestionLabel');

  const nextBtn = $('findIdNextBtn');
  const backBtn = $('findIdBackBtn');
  const verifyBtn = $('findIdVerifyBtn');
  const msg = $('findIdMsg');

  if (
    !form ||
    !step1 ||
    !step2 ||
    !nameInput ||
    !birthInput ||
    !answerInput ||
    !questionKeyInput ||
    !maskedEmailEl ||
    !questionLabelEl ||
    !msg
  ) {
    return;
  }

  function resetStep2Content() {
    answerInput.value = '';
    questionKeyInput.value = '';
    maskedEmailEl.textContent = '-';
    questionLabelEl.textContent = '질문';
  }

  function goStep1() {
    step1.hidden = false;
    step2.hidden = true;
    resetStep2Content();
    setMessage(msg, '');
  }

  function goStep2({ maskedEmail, questionKey, questionLabel }) {
    step1.hidden = true;
    step2.hidden = false;
    maskedEmailEl.textContent = maskedEmail || '-';
    questionKeyInput.value = questionKey || '';
    questionLabelEl.textContent = questionLabel || '질문';
    setMessage(msg, '');
    answerInput.focus();
  }

  goStep1();

  backBtn?.addEventListener('click', () => {
    goStep1();
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const isStep2 = !step2.hidden;
    const realName = nameInput.value.trim();
    const birthKey = birthInput.value.trim();

    if (!realName || realName.length < 2) {
      setMessage(msg, '이름을 2글자 이상 입력해줘.', 'is-error');
      nameInput.focus();
      return;
    }

    if (!isValidBirthKey(birthKey)) {
      setMessage(msg, '생년월일은 960829-1 형식으로 입력해줘.', 'is-error');
      birthInput.focus();
      return;
    }

    if (!isStep2) {
      try {
        if (nextBtn) nextBtn.disabled = true;
        setMessage(msg, '확인 중...');

        const { data, error } = await supabase.rpc('find_id_recovery_start', {
          p_real_name: realName,
          p_birth_key: normalizeBirthKey(birthKey),
        });

        if (error) {
          console.error(
            '[account-recovery] find_id_recovery_start error:',
            error,
          );
          goStep1();
          setMessage(
            msg,
            `아이디 확인 중 오류가 발생했어. (${getFriendlyRpcError(error)})`,
            'is-error',
          );
          return;
        }

        const row = Array.isArray(data) ? data[0] : data;

        if (!row?.found) {
          goStep1();
          setMessage(
            msg,
            '입력한 이름과 생년월일로 가입된 계정을 찾지 못했어.',
            'is-error',
          );
          return;
        }

        if (row?.ambiguous) {
          goStep1();
          setMessage(
            msg,
            '같은 이름과 생년월일 정보가 여러 개 있어. 관리자에게 문의해줘.',
            'is-error',
          );
          return;
        }

        if (!row?.recovery_question) {
          goStep1();
          setMessage(
            msg,
            '이 계정에는 아이디 찾기 질문 정보가 없어. 기존 가입 계정이면 관리자 보정이 필요해.',
            'is-error',
          );
          return;
        }

        goStep2({
          maskedEmail: row?.masked_email || '',
          questionKey: row?.recovery_question || '',
          questionLabel: row?.recovery_question_label || '질문',
        });
      } catch (err) {
        console.error('[account-recovery] find id step1 failed:', err);
        goStep1();
        setMessage(msg, '아이디 확인 중 오류가 발생했어.', 'is-error');
      } finally {
        if (nextBtn) nextBtn.disabled = false;
      }

      return;
    }

    const answer = answerInput.value.trim();
    const questionKey = questionKeyInput.value;

    if (!questionKey) {
      goStep1();
      setMessage(msg, '질문 정보를 찾지 못했어. 다시 시도해줘.', 'is-error');
      return;
    }

    if (!answer || normalizeRecoveryAnswer(answer).length < 2) {
      setMessage(msg, '질문의 답을 입력해줘.', 'is-error');
      answerInput.focus();
      return;
    }

    try {
      if (verifyBtn) verifyBtn.disabled = true;
      setMessage(msg, '답변 확인 중...');

      const answerHash = await sha256Hex(normalizeRecoveryAnswer(answer));

      const { data, error } = await supabase.rpc('verify_id_recovery', {
        p_real_name: realName,
        p_birth_key: normalizeBirthKey(birthKey),
        p_recovery_question: questionKey,
        p_recovery_answer_hash: answerHash,
      });

      if (error) {
        console.error('[account-recovery] verify_id_recovery error:', error);
        setMessage(
          msg,
          `아이디 검증 중 오류가 발생했어. (${getFriendlyRpcError(error)})`,
          'is-error',
        );
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;

      if (!row?.found) {
        setMessage(
          msg,
          '입력한 이름과 생년월일로 가입된 계정을 찾지 못했어.',
          'is-error',
        );
        return;
      }

      if (row?.ambiguous) {
        setMessage(
          msg,
          '같은 이름과 생년월일 정보가 여러 개 있어. 관리자에게 문의해줘.',
          'is-error',
        );
        return;
      }

      if (!row?.success || !row?.email) {
        setMessage(msg, '답변이 일치하지 않아.', 'is-error');
        answerInput.focus();
        return;
      }

      setMessage(msg, `가입 아이디는 ${row.email} 이야.`, 'is-success');
    } catch (err) {
      console.error('[account-recovery] find id step2 failed:', err);
      setMessage(msg, '아이디 검증 중 오류가 발생했어.', 'is-error');
    } finally {
      if (verifyBtn) verifyBtn.disabled = false;
    }
  });
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
      '이메일이 맞다면 비밀번호 재설정 링크가 전송됐어. 메일함과 스팸함을 확인해줘.',
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
