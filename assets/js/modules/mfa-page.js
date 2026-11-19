import { supabase } from './supabase-client.js';
import { consumeRedirect, homeHref, loginHref, clearMypageVerified } from './auth-store.js';
import { restoreSecondFactor, safeMfaReturn, sessionClaims, usesEmailMfa } from './mfa-session.js';
import { mountMfa } from './mfa.js';

const root = document.querySelector('#loginMfa');
const cancel = document.querySelector('#cancelMfa');
let cancelling = false;
let needsPassword = false;
const finish = async () => {
  const { error } = await supabase.rpc('require_account_mfa');
  if (error) throw error;
  if (!cancelling) location.replace(safeMfaReturn(consumeRedirect(), location.href, homeHref()));
};

cancel.onclick = async () => {
  cancelling = true;
  cancel.disabled = true;
  try {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    if (!needsPassword) consumeRedirect();
    clearMypageVerified();
    location.replace(loginHref());
  } catch {
    document.querySelector('#cancelMfaStatus').textContent = '취소하지 못했어요. 연결을 확인하고 다시 시도해 주세요.';
    cancelling = false;
    cancel.disabled = false;
  }
};

async function start() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session) return location.replace(loginHref());
  if (await restoreSecondFactor(data.session, supabase)) return finish();
  if (usesEmailMfa(data.session.user) && !sessionClaims(data.session).amr?.some(p => p.method === 'password')) {
    root.textContent = '이메일 확인이 끝났어요. 가입한 비밀번호로 로그인하면 2차 인증번호를 보내드려요.';
    needsPassword = true;
    cancel.textContent = '비밀번호로 로그인';
    return;
  }
  // Local previews can point at the live project. Never enroll a real account
  // without a configured server rollout (pilot or full enforcement).
  const probe = await supabase.from('profiles').select('id').limit(0);
  const enforcing = probe.error?.code === '42501' && probe.error.message === 'MFA_REQUIRED';
  const staged = !probe.error && (await supabase.rpc('account_mfa_legacy_access')).data === true;
  if (!enforcing && !staged) {
    root.textContent = '계정 서버에서 2차 인증을 준비하고 있어요. 잠시 후 다시 로그인해 주세요.';
    return;
  }
  await mountMfa(root, { userId: data.session.user.id, onVerified: finish });
}
start().catch(() => {
  root.replaceChildren('인증을 시작하지 못했어요. ');
  const retry = document.createElement('button');
  retry.textContent = '다시 시도';
  retry.onclick = () => location.reload();
  root.append(retry);
});
window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
window.addEventListener('pagehide', () => root.replaceChildren());
