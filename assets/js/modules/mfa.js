import { supabase } from './supabase-client.js';
import { hasNativeSecondFactor, mfaEnabled, restoreSecondFactor, usesEmailMfa } from './mfa-session.js';

import { mountEmailCode } from './mfa-email.js';

function value(result) {
  if (result.error) throw result.error;
  return result.data;
}

function explain(error) {
  switch (error?.code) {
    case '42501':
      return '마이페이지에 다시 들어와 인증한 뒤 변경해 주세요.';
    case 'mfa_verification_failed':
    case 'mfa_totp_replay':
    case 'mfa_verification_rejected':
    case 'mfa_challenge_expired':
      return '인증 앱에 새로 표시된 6자리 코드를 입력해 주세요. 이미 사용한 코드라면 다음 코드를 기다려 주세요.';
    case 'over_request_rate_limit':
      return '요청이 많아요. 잠시 후 다시 시도해 주세요.';
    case 'mfa_factor_name_conflict':
      return '같은 이름의 인증 앱이 있어요. 다른 이름을 입력해 주세요.';
    case 'too_many_enrolled_mfa_factors':
      return '등록 가능한 인증 앱 수에 도달했어요. 사용하지 않는 앱을 확인해 주세요.';
    default:
      return '인증을 완료하지 못했어요. 연결과 로그인 상태를 확인하고 다시 시도해 주세요.';
  }
}

async function currentAccount(userId) {
  const { user } = value(await supabase.auth.getUser());
  if (!userId || user?.id !== userId) throw new Error('account changed');
  return user;
}

async function factorsFor(userId) {
  const user = await currentAccount(userId);
  return (user.factors || []).filter(f => f.status === 'verified');
}

function label(factor) {
  return factor.friendly_name || '인증 앱 ' + factor.id.slice(-4);
}

export async function mountMfa(root, { userId, mode = 'login', onVerified }) {
  if (mode !== 'add' && mode !== 'activate' && usesEmailMfa(await currentAccount(userId))) {
    return mountEmailCode(root, { mode, userId, onVerified });
  }
  root.innerHTML = `
    <form class="mfa-form">
      <p data-help></p>
      <label data-choice hidden>인증 앱 선택<select data-factors></select></label>
      <label data-name-field hidden>기기 이름<input data-name maxlength="48" placeholder="예: 내 휴대폰" autocomplete="off"></label>
      <div data-setup hidden>
        <img data-qr width="192" height="192" alt="인증 앱에 등록할 QR 코드">
        <details><summary>같은 휴대폰에서 설정 키로 등록하기</summary>
          <p>인증 앱에서 시간 기반 키를 선택하고 아래 키를 입력해 주세요.</p><code data-secret></code>
        </details>
      </div>
      <label data-code-field hidden>인증 앱의 6자리 코드
        <input data-code inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" placeholder="000000">
      </label>
      <button type="submit" data-submit disabled>확인</button>
      <p data-status role="status" aria-live="polite"></p>
    </form>`;
  const form = root.querySelector('form');
  const el = key => form.querySelector('[data-' + key + ']');
  let enrolling = false;
  let enrolledId = '';
  let loaded = false;
  let busy = false;

  async function load() {
    const factors = await factorsFor(userId);
    if (!form.isConnected) return;
    const totp = factors.filter(f => f.factor_type === 'totp');
    enrolling = mode === 'add' || (mode === 'activate' && !factors.length);
    if (!enrolling && !totp.length) throw new Error('no usable factor');
    for (const factor of totp) el('factors').add(new Option(label(factor), factor.id));
    el('choice').hidden = enrolling || totp.length <= 1;
    el('code-field').hidden = enrolling;
    el('code').required = !enrolling;
    el('name-field').hidden = !enrolling;
    el('help').textContent = enrolling
      ? 'Google Authenticator 등 인증 앱을 준비해 주세요. 기기 이름을 입력하면 등록용 QR 코드와 설정 키가 표시돼요.'
      : '등록한 인증 앱을 열고 현재 표시된 코드를 입력해 주세요.';
    el('name').value = mode === 'add' ? '예비 인증 앱' : '내 휴대폰';
    el('submit').textContent = enrolling ? '등록용 QR 코드 보기' : '인증하기';
    loaded = true;
  }

  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    el('submit').disabled = true;
    el('status').textContent = '';
    try {
      if (!loaded) {
        await load();
      } else if (enrolling && !enrolledId) {
        const mfa = supabase.auth.mfa;
        const name = el('name').value.trim();
        if (!name) { el('status').textContent = '기기 이름을 입력해 주세요.'; return; }
        await factorsFor(userId);
        const options = { factorType: 'totp', issuer: '말린오이닷컴', friendlyName: name };
        let result = await mfa.enroll(options);
        // An abandoned setup can reserve the name until its unverified factor expires.
        if (result.error?.code === 'mfa_factor_name_conflict') {
          result = await mfa.enroll({ ...options, friendlyName: name + ' · ' + crypto.randomUUID().slice(-6) });
        }
        const data = value(result);
        if (!form.isConnected) return;
        enrolledId = data.id;
        el('qr').src = data.totp.qr_code;
        el('secret').textContent = data.totp.secret;
        el('setup').hidden = false;
        el('name-field').hidden = true;
        el('code-field').hidden = false;
        el('code').required = true;
        el('help').textContent = '인증 앱으로 QR 코드를 스캔한 뒤 6자리 코드를 입력해 주세요.';
        el('submit').textContent = '등록 완료';
        el('code').focus();
      } else {
        const code = el('code').value.trim();
        if (!/^\d{6}$/.test(code)) { el('status').textContent = '숫자 6자리를 입력해 주세요.'; return; }
        el('code').value = '';
        const factorId = enrolledId || el('factors').value;
        if (mode === 'activate' && usesEmailMfa(await currentAccount(userId))) value(await supabase.rpc('prepare_account_authenticator', { p_factor: factorId }));
        const verified = value(await supabase.auth.mfa.challengeAndVerify({ factorId, code }));
        if (verified?.user?.id !== userId || !hasNativeSecondFactor(verified)) throw new Error('invalid session');
        if (!form.isConnected) return;
        el('secret').textContent = '';
        el('qr').removeAttribute('src');
        el('setup').hidden = true;
        await onVerified(factorId);
        if (form.isConnected) form.replaceChildren();
      }
    } catch (error) {
      if (el('status')) el('status').textContent = explain(error);
      else if (form.isConnected) root.textContent = explain(error);
    } finally {
      busy = false;
      if (el('submit')) el('submit').disabled = false;
    }
  };
  try { await load(); }
  catch (error) { el('status').textContent = explain(error); el('submit').textContent = '다시 시도'; }
  el('submit').disabled = false;
}

function showMfaNotice(message) {
  const dialog = document.createElement('dialog');
  dialog.className = 'mfa-notice';
  dialog.setAttribute('aria-label', message);
  const text = document.createElement('p');
  text.textContent = message;
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '확인';
  close.onclick = () => dialog.close();
  dialog.append(text, close);
  document.body.append(dialog);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  dialog.showModal();
}

export async function mountMfaSettings(root, userId, verifiedId) {
  const account = await currentAccount(userId);
  const emailMode = usesEmailMfa(account);
  const factors = (account.factors || []).filter(f => f.status === 'verified' && f.factor_type === 'totp');
  if (!root.isConnected) return;
  root.replaceChildren();
  const help = document.createElement('p');
  const enabled = mfaEnabled(account);
  help.textContent = !enabled ? '2차 인증이 꺼져 있어요. 켜면 로그인하거나 마이페이지에 들어갈 때 6자리 코드를 확인해요.' : emailMode ? '2차 인증이 켜져 있어요. 가입 이메일로 인증번호를 받아요. 인증 앱으로 변경하면 다음 로그인부터 앱에 표시된 코드를 사용해요.' : '2차 인증이 켜져 있어요. 인증 앱을 사용 중이에요. 휴대폰을 잃어버릴 때를 대비해 다른 기기에 예비 인증 앱을 등록할 수 있어요.';
  root.append(help);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const editor = document.createElement('div');
  async function readyToChange() {
    const { error } = await supabase.rpc('require_recent_account_mfa');
    if (!error) return true;
    if (error.message !== 'RECENT_MFA_REQUIRED') throw error;
    root.replaceChildren('인증 앱을 변경하려면 다시 인증해 주세요.', editor);
    await mountMfa(editor, { mode: 'entry', userId, onVerified: id => mountMfaSettings(root, userId, id) });
    return false;
  }
  async function refreshSettings(message, id) {
    const { session } = value(await supabase.auth.refreshSession());
    if (session?.user?.id !== userId) throw new Error('account changed');
    if (root.isConnected) {
      showMfaNotice(message);
      await mountMfaSettings(root, userId, id);
    }
  }
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.textContent = enabled ? '2차 인증 끄기' : '2차 인증 켜기';
  toggle.onclick = async () => {
    if (enabled && !window.confirm('2차 인증을 끌까요? 등록한 인증 앱도 이 계정에서 해제돼요.')) return;
    toggle.disabled = true;
    try {
      await currentAccount(userId);
      if (enabled) {
        if (!await readyToChange()) return;
        value(await supabase.rpc('disable_account_mfa'));
        await refreshSettings('2차 인증을 껐어요.');
      } else if (emailMode) {
        await mountEmailCode(editor, { mode: 'login', userId, onVerified: async () => {
          value(await supabase.rpc('enable_account_email_mfa'));
          const { session } = value(await supabase.auth.getSession());
          await restoreSecondFactor(session, supabase);
          await refreshSettings('이메일 2차 인증 등록이 완료됐어요.');
        } });
      } else {
        await mountMfa(editor, { mode: 'activate', userId, onVerified: id =>
          refreshSettings('인증 앱 등록이 완료됐어요. 다음 로그인부터 앱의 6자리 코드를 입력해 주세요.', id) });
      }
    } catch (error) { status.textContent = explain(error); }
    finally { toggle.disabled = false; }
  };
  root.append(toggle);
  if (!enabled) {
    root.append(editor, status);
    return;
  }
  for (const factor of (emailMode ? [] : factors)) {
    const row = document.createElement('div');
    row.className = 'social-auth-row';
    row.append(document.createTextNode(label(factor)));
    // The factor just proved on this page stays usable when retiring another device.
    if (factor.id !== verifiedId && factors.some(f => f.id === verifiedId)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = '등록 해제';
      remove.onclick = async () => {
        if (!window.confirm(label(factor) + ' 등록을 해제할까요?')) return;
        remove.disabled = true;
        try {
          if (!await readyToChange()) return;
          const current = await factorsFor(userId);
          if (!current.some(f => f.id === verifiedId)) throw new Error('factor changed');
          value(await supabase.auth.mfa.unenroll({ factorId: factor.id }));
          await mountMfaSettings(root, userId, verifiedId);
        } catch (error) { status.textContent = explain(error); remove.disabled = false; }
      };
      row.append(remove);
    }
    root.append(row);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.textContent = emailMode ? '인증 앱으로 변경' : '인증 앱 추가';
  add.onclick = async () => {
    add.disabled = true;
    try {
      if (!await readyToChange()) return;
      await mountMfa(editor, { mode: emailMode ? 'activate' : 'add', userId, onVerified: async id => {
        if (emailMode) {
          value(await supabase.rpc('activate_account_authenticator'));
        }
        await refreshSettings('인증 앱 등록이 완료됐어요. 다음 로그인부터 앱의 6자리 코드를 입력해 주세요.', id);
      } });
    } catch (error) { status.textContent = explain(error); add.disabled = false; }
  };
  root.append(add, editor, status);
}
