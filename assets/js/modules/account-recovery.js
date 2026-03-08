// assets/js/modules/account-recovery.js

function setMessage(el, text, type = '') {
  if (!el) return;
  el.textContent = text;
  el.className = type ? `account-auth-msg ${type}` : 'account-auth-msg';
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

    setMessage(
      msg,
      '아이디 안내 메일 발송 기능은 백엔드 연결 후 동작해. 지금은 프론트 초안까지 완료된 상태야.',
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

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = idInput.value.trim();
    const email = emailInput.value.trim();

    if (!id) {
      setMessage(msg, '아이디를 입력해줘.', 'is-error');
      return;
    }

    if (!email) {
      setMessage(msg, '이메일을 입력해줘.', 'is-error');
      return;
    }

    setMessage(
      msg,
      '아이디와 이메일이 일치하면 비밀번호 재설정 링크가 이메일로 전송돼. 지금은 백엔드 연결 전이라 안내 메시지만 보여주는 상태야.',
      'is-success',
    );
  });
}

function initResetPasswordPage() {
  const form = document.getElementById('resetPasswordForm');
  const pw1Input = document.getElementById('newPassword');
  const pw2Input = document.getElementById('confirmPassword');
  const msg = document.getElementById('resetPasswordMsg');

  if (!form || !pw1Input || !pw2Input || !msg) return;

  form.addEventListener('submit', (e) => {
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

    setMessage(
      msg,
      '비밀번호 변경 기능은 백엔드 연결 후 실제로 동작해. 지금은 입력 검증까지 완료된 상태야.',
      'is-success',
    );
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
