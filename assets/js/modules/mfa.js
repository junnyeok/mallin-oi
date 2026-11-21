import { supabase } from './supabase-client.js';
import { hasNativeSecondFactor, mfaEnabled, restoreSecondFactor, usesEmailMfa } from './mfa-session.js';

import { mountEmailCode } from './mfa-email.js';

const authenticatorPackage = 'com.google.android.apps.authenticator2';
const googlePlay = 'https://play.google.com/store/apps/details?id=' + authenticatorPackage;
const appStore = 'https://apps.apple.com/kr/app/id388497605';
const appStoreApp = 'itms-apps://apps.apple.com/kr/app/id388497605';

function mountAuthenticatorShortcut(el, browser = globalThis.window) {
  const { userAgent = '', maxTouchPoints = 0 } = browser?.navigator || {};
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const android = /Android/.test(userAgent);
  const open = el('open-authenticator');
  const apple = el('authenticator-app-store');
  const google = el('authenticator-google-play');
  apple.href = ios ? appStoreApp : appStore;
  google.href = googlePlay;
  apple.hidden = android;
  google.hidden = ios;
  open.hidden = !ios && !android;
  el('authenticator-name').hidden = !open.hidden;
  el('authenticator-links').hidden = false;

  if (android) {
    // Scope the launch to Google's app and let Chrome open Play when the app is unavailable.
    open.href = 'intent://totp/#Intent;scheme=otpauth;package=' + authenticatorPackage +
      ';S.browser_fallback_url=' + encodeURIComponent(googlePlay) + ';end';
  } else if (ios) {
    open.href = 'googleauthenticator://';
    apple.removeAttribute('target');
    let cancelFallback;
    open.onclick = event => {
      const bridge = browser.webkit?.messageHandlers?.mallinoiSite;
      if (bridge?.postMessage) {
        event.preventDefault();
        bridge.postMessage({ action: 'openGoogleAuthenticator' }).then(opened => {
          if (!opened && apple.isConnected) apple.click();
        }).catch(() => { if (apple.isConnected) apple.click(); });
        return;
      }

      // Safari does not report whether a custom URL opened an app.
      const page = browser.document;
      cancelFallback?.();
      const cancel = () => {
        browser.clearTimeout(timer);
        page.removeEventListener('visibilitychange', onVisibility);
        browser.removeEventListener('pagehide', cancel);
        cancelFallback = null;
      };
      const onVisibility = () => { if (page.hidden) cancel(); };
      const timer = browser.setTimeout(() => {
        cancel();
        if (open.isConnected && !page.hidden && page.hasFocus()) browser.location.assign(appStoreApp);
      }, 1600);
      cancelFallback = cancel;
      page.addEventListener('visibilitychange', onVisibility);
      browser.addEventListener('pagehide', cancel);
    };
  }
}

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
      <div class="mfa-setup" data-setup tabindex="-1" hidden>
        <div class="mfa-setup__scan">
          <p><strong>QR 코드로 등록하기</strong></p>
          <img data-qr width="192" height="192" alt="인증 앱에 등록할 QR 코드">
        </div>
        <div class="mfa-setup__key">
          <p><strong>설정키로 등록하기</strong></p>
          <p>인증 앱에서 시간 기반 키를 선택하고 아래 키를 입력해 주세요.</p>
          <code data-secret></code>
        </div>
      </div>
      ${mode === 'login' ? '' : `
        <div class="mfa-authenticator-links" data-authenticator-links aria-label="Google Authenticator" role="group" hidden>
          <strong data-authenticator-name hidden>Google Authenticator</strong>
          <a class="social-auth-link" data-open-authenticator hidden>Google Authenticator 열기</a>
          <a class="social-auth-link" data-authenticator-app-store target="_blank" rel="noopener noreferrer">App Store</a>
          <a class="social-auth-link" data-authenticator-google-play target="_blank" rel="noopener noreferrer">Google Play</a>
        </div>`}
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
    if (mode !== 'login') mountAuthenticatorShortcut(el);
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
        el('help').textContent = '인증 앱에 계정을 추가한 뒤 앱에 표시되는 6자리 코드를 입력해 주세요.';
        el('submit').textContent = '등록 완료';
        el('setup').focus();
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
  const enabled = mfaEnabled(account);
  const overview = document.createElement('div');
  overview.className = 'mypage-mfa-overview';
  const summary = document.createElement('div');
  const state = document.createElement('strong');
  state.textContent = !enabled ? '2차 인증이 꺼져 있어요' : emailMode ? '이메일 인증 사용 중' : '인증 앱 사용 중';
  const help = document.createElement('p');
  help.textContent = !enabled
    ? '켜면 로그인하거나 마이페이지에 들어갈 때 6자리 코드를 확인해요.'
    : emailMode
      ? '가입 이메일로 인증번호를 받아요. 인증 앱으로 변경하면 다음 로그인부터 앱에 표시된 코드를 사용해요.'
      : '휴대폰을 잃어버릴 때를 대비해 다른 기기에 예비 인증 앱을 등록할 수 있어요.';
  summary.append(state, help);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const editor = document.createElement('div');
  editor.className = 'mypage-mfa-editor';
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
  toggle.className = enabled ? 'mypage-sub-btn' : 'mypage-btn';
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
  overview.append(summary, toggle);
  root.append(overview);
  if (!enabled) {
    root.append(editor, status);
    return;
  }
  const devices = document.createElement('ul');
  devices.className = 'mypage-mfa-devices';
  devices.setAttribute('aria-label', '등록된 인증 앱');
  for (const factor of (emailMode ? [] : factors)) {
    const row = document.createElement('li');
    row.className = 'social-auth-row';
    row.append(document.createTextNode(label(factor)));
    // The factor just proved on this page stays usable when retiring another device.
    if (factor.id !== verifiedId && factors.some(f => f.id === verifiedId)) {
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'mypage-sub-btn';
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
    devices.append(row);
  }
  if (devices.childElementCount) root.append(devices);
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'mypage-btn';
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
