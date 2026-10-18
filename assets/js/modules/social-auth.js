import { supabase } from './supabase-client.js';
import { resolveSitePath, homeHref, saveLoginPolicy, setMypageVerified, clearMypageVerified,
  consumeRedirect, mypageHref } from './auth-store.js';

export const SOCIAL_PROVIDERS = [ ['google', 'Google'], ['kakao', '카카오'], ['apple', 'Apple'] ];
const pendingKey = 'mallin:social-request:v1';
const messages = {
  TEST_RESTRICTED: '현재 소셜 로그인 확인 작업 중이에요. 기존 이메일 로그인을 이용해 주세요.',
  PROVIDER_REVOKED: '소셜 인증 승인이 해제되었어요. 가입한 제공자로 다시 로그인해 주세요.',
  RELAY_DISABLED: 'Apple 이메일 전달이 꺼져 있어요. Apple 계정 설정에서 이메일 전달을 켠 뒤 다시 시도해 주세요.',
  NOT_CONFIGURED: '소셜 로그인을 준비하고 있어요. 지금은 이메일 로그인을 이용해 주세요.',
  PROVIDER_UNAVAILABLE: '아직 준비 중인 로그인 방법이에요.',
  UNSAFE_AUTH_CONFIGURATION: '소셜 로그인 설정을 확인 중이에요. 이메일 로그인을 이용해 주세요.',
  MFA_REQUIRED: '추가 인증이 설정된 계정이에요. 기존 로그인 방법으로 인증해 주세요.',
  IDENTITY_ALREADY_LINKED: '이 소셜 계정은 다른 회원 계정에 연결되어 있어요.',
  REVOCATION_PENDING: '이전 Apple 연결 해제를 처리 중이에요. 잠시 후 다시 시도해 주세요.',
  INVALID_OR_USED_REQUEST: '이미 처리되었거나 만료된 요청이에요. 처음부터 다시 시도해 주세요.',
  LOGIN_REQUIRED: '먼저 이메일 또는 연결된 소셜 계정으로 로그인해 주세요.',
  ACCOUNT_LINKING_DISABLED: '계정 연결 기능은 제공하지 않아요. 가입한 방법으로 다시 로그인해 주세요.',
  ACCOUNT_MIGRATION_REQUIRED: '새 로그인 방식을 준비 중이에요. 잠시 후 다시 시도해 주세요.',
  SOCIAL_REAUTH_REQUIRED: '가입한 소셜 계정으로 본인 확인해 주세요.',
  ACCOUNT_CONFLICT: '이미 사용 중인 닉네임이에요. 다른 닉네임으로 다시 시도해 주세요.',
  INVALID_PROOF: '비밀번호 또는 이메일 인증번호를 다시 확인해 주세요.',
  REAUTHENTICATION_REQUIRED: '현재 비밀번호 또는 이메일 인증번호로 본인 확인을 해 주세요.',
  LAST_LOGIN_METHOD: '마지막 로그인 방법은 해제할 수 없어요. 비밀번호나 다른 소셜 계정을 먼저 추가해 주세요.',
  INVALID_NICKNAME: '닉네임을 2~20자로 입력해 주세요.',
  CONSENT_REQUIRED: '이용약관과 개인정보처리방침에 동의해 주세요.',
  INVALID_EMAIL: '사용할 이메일 주소를 확인해 주세요.',
  EMAIL_ALREADY_SELECTED: '이미 인증번호를 보낸 이메일로 인증해 주세요. 다른 이메일은 처음부터 다시 시작해 주세요.',
  INVALID_PASSWORD: '비밀번호는 영문·숫자·특수문자를 포함한 10~64자로 입력해 주세요.',
  EMAIL_VERIFICATION_REQUIRED: '이메일로 받은 인증번호를 입력해 주세요.',
  RATE_LIMIT: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
  EXPIRED_REQUEST: '연결 시간이 지났거나 이미 완료된 요청이에요. 처음부터 다시 시도해 주세요.',
  REQUEST_MISMATCH: '로그인을 시작한 브라우저나 앱에서 다시 시도해 주세요.',
  ACCOUNT_MISMATCH: '처음 연결을 시작한 계정으로 다시 로그인해 주세요.',
  PROVIDER_FAILED: '소셜 인증이 취소되었거나 완료되지 않았어요. 다시 시도해 주세요.',
  AUTHORIZATION_PENDING: '소셜 인증을 완료한 뒤 다시 시도해 주세요.',
};

export function socialMessage(error) {
  return messages[error?.code || error?.message] || '요청을 완료하지 못했어요. 잠시 후 다시 시도해 주세요.';
}
export function pendingRequest() {
  try {
    const saved = JSON.parse(localStorage.getItem(pendingKey) || 'null');
    if (!saved || saved.expires < Date.now()) { localStorage.removeItem(pendingKey); return null; }
    return saved;
  } catch { return null; }
}
export function clearSocialRequest() { localStorage.removeItem(pendingKey); }
function randomVerifier() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
async function hash(value) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(value))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function socialApi(action, body = {}) {
  const { data, error } = await supabase.functions.invoke('social-auth', { body: { ...body, action } });
  if (error || data?.error) {
    let code = data?.error;
    if (!code && error?.context?.json) {
      try { code = (await error.context.json()).error; } catch { /* Generic error below. */ }
    }
    throw Object.assign(new Error(code || 'AUTH_FAILED'), { code: code || 'AUTH_FAILED' });
  }
  return data;
}
export async function availableSocialProviders() {
  try {
    const response = await fetch(resolveSitePath('assets/social-auth-config.json'), { cache: 'no-store' });
    if (!response.ok || !(await response.json()).enabled) return [];
    const config = await socialApi('config');
    return config.accountMode === 'separate' ? config.providers || [] : [];
  } catch { return []; }
}
export async function startSocialLogin(provider, purpose = 'login') {
  if (!['login', 'reauth'].includes(purpose)) throw new Error('ACCOUNT_LINKING_DISABLED');
  const native = window.Capacitor?.isNativePlatform?.() === true;
  const verifier = randomVerifier();
  const callback = new URL(resolveSitePath('account/social-callback.html'), window.location.href);
  const result = await socialApi('start', { provider, purpose, challenge: await hash(verifier),
    returnUri: native ? 'mallinoi://auth/callback' : callback.href });
  const allowedHosts = { google: 'accounts.google.com', kakao: 'kauth.kakao.com', apple: 'appleid.apple.com' };
  const destination = new URL(result.url);
  if (destination.protocol !== 'https:' || destination.hostname !== allowedHosts[provider]) throw new Error('AUTH_FAILED');
  // Save before opening the external browser. Failure to persist must abort authorization.
  const pending = { request: result.request, verifier, purpose, expires: Date.now() + 5 * 60_000,
    autoLogin: document.getElementById('rememberLogin')?.checked ?? true };
  localStorage.setItem(pendingKey, JSON.stringify(pending));
  if (pendingRequest()?.verifier !== verifier) throw new Error('REQUEST_MISMATCH');
  if (native) {
    const launcher = window.Capacitor?.Plugins?.AppLauncher;
    if (!launcher) throw new Error('AUTH_FAILED');
    const result = await launcher.openUrl({ url: destination.href });
    if (result?.completed === false) throw new Error('AUTH_FAILED');
  } else window.location.assign(destination.href);
}
export function accountVerificationHref() {
  return resolveSitePath('account/verify.html') + (window.Capacitor?.isNativePlatform?.() ||
    new URLSearchParams(location.search).get('app') === 'calendar' ? '?app=calendar' : '');
}
export async function mountSocialLogin(root) {
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  const heading = document.createElement('p');
  heading.textContent = '소셜 계정으로 계속하기';
  const buttons = document.createElement('div'); buttons.className = 'social-auth-buttons';
  const status = document.createElement('p'); status.className = 'social-auth-message'; status.setAttribute('role', 'status');
  root.append(heading, buttons, status);
  const controls = [];
  status.textContent = '로그인 방법을 확인하고 있어요.';
  for (const [provider, label] of SOCIAL_PROVIDERS) {
    const button = document.createElement('button'); button.type = 'button';
    const image = document.createElement('img');
    image.src = resolveSitePath(`assets/images/auth/${provider}-signin.${provider === 'kakao' ? 'svg' : 'png'}`);
    image.alt = provider === 'kakao' ? '카카오 로그인' : `${label}로 계속하기`;
    image.width = 224; image.decoding = 'async'; button.append(image);
    button.className = `social-auth-button social-auth-button--${provider}`;
    button.disabled = true;
    controls.push({ provider, button });
    button.addEventListener('click', async () => {
      button.disabled = true;
      try { await startSocialLogin(provider); }
      catch (error) { status.textContent = socialMessage(error); button.disabled = false; }
    });
    buttons.append(button);
  }
  const available = await availableSocialProviders();
  controls.forEach(({ provider, button }) => { button.disabled = !available.includes(provider); });
  status.textContent = available.length ? '이메일·Google·카카오·Apple은 각각 별개의 계정이에요. 가입한 방법으로 로그인해 주세요.' : messages.NOT_CONFIGURED;
}
export async function acceptSocialResult(result) {
  if (result.session) {
    clearMypageVerified();
    const { error } = await supabase.auth.setSession({ access_token: result.session.access_token,
      refresh_token: result.session.refresh_token });
    if (error) throw new Error('AUTH_FAILED');
    saveLoginPolicy({ autoLogin: pendingRequest()?.autoLogin === true });
  }
  clearSocialRequest();
  if (result.verified === true) { enterVerifiedAccountPage(); return; }
  let destination = consumeRedirect(homeHref());
  try {
    if (new URL(destination, location.href).origin !== location.origin) destination = homeHref();
  } catch { destination = homeHref(); }
  window.location.replace(destination);
}
export function enterVerifiedAccountPage() {
  setMypageVerified(true);
  window.location.assign(mypageHref());
}

export async function initSocialAuthUI() {
  await Promise.all([...document.querySelectorAll('[data-social-login]')].map(root => mountSocialLogin(root)));
  document.querySelectorAll('[data-account-verification]').forEach(link => { link.href = accountVerificationHref(); });
}
