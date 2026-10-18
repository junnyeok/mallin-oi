import { SOCIAL_PROVIDERS, socialApi, socialMessage, pendingRequest,
  startSocialLogin, acceptSocialResult, enterVerifiedAccountPage } from './social-auth.js';
import { supabase } from './supabase-client.js';
import { loginHref, mypageHref, homeHref } from './auth-store.js';
import { initSocialAuthNative } from './social-auth-native.js';

const $ = id => document.getElementById(id);
const status = message => { $('socialStatus').textContent = message; };
const proof = () => ({ password: $('socialPassword')?.value || '', otp: $('socialOtp')?.value.trim() || '' });
function clearProof() { for (const id of ['socialPassword', 'socialOtp']) if ($(id)) $(id).value = ''; }
async function busy(operation) {
  const buttons = [...document.querySelectorAll('button')];
  const wasDisabled = buttons.map(b => b.disabled);
  buttons.forEach(b => { b.disabled = true; });
  try { await operation(); } catch (error) { status(socialMessage(error)); }
  finally { buttons.forEach((b, i) => { b.disabled = wasDisabled[i]; }); }
}
function profile() {
  return { nickname: $('socialNickname').value, terms: $('socialTerms').checked,
    privacy: $('socialPrivacy').checked, marketing: $('socialMarketing').checked };
}
async function callbackPage() {
  const request = new URLSearchParams(location.hash.slice(1)).get('request');
  const pending = pendingRequest();
  if (!pending || pending.request !== request) throw new Error('REQUEST_MISMATCH');
  const payload = { request, verifier: pending.verifier };
  const info = await socialApi('inspect', payload);
  if (info.accountMode !== 'separate') throw new Error('ACCOUNT_MIGRATION_REQUIRED');
  if (info.purpose !== pending.purpose) throw new Error('REQUEST_MISMATCH');
  if (info.purpose === 'login' && info.decision === 'ready') {
    status('로그인하고 있어요. 잠시만 기다려 주세요.');
    await acceptSocialResult(await socialApi('finish', payload));
    return;
  }
  if (info.purpose === 'reauth' && info.decision === 'reauth') {
    status('본인 확인을 마치고 계정 관리로 이동하고 있어요.');
    await acceptSocialResult(await socialApi('finish', payload));
    return;
  }
  if (info.purpose !== 'login' || info.decision !== 'signup') throw new Error('ACCOUNT_LINKING_DISABLED');
  const provider = SOCIAL_PROVIDERS.find(([id]) => id === info.provider)?.[1] || '소셜';
  $('socialTitle').textContent = `${provider}로 회원가입`;
  $('socialSignupEmail').value = info.email || '';
  $('socialSignupEmail').placeholder = `${provider} 인증으로 확인했어요`;
  $('socialCompleteForm').hidden = false;
  $('socialNickname').required = true;
  $('socialTerms').required = true;
  $('socialPrivacy').required = true;
  status('닉네임을 정하면 시작할 수 있어요. 이메일과 비밀번호는 입력하지 않아도 돼요.');
  $('socialCompleteForm').addEventListener('submit', event => {
    event.preventDefault();
    busy(async () => {
      await acceptSocialResult(await socialApi('finish', { ...payload, ...profile() }));
    });
  });
}
async function managementPage() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('LOGIN_REQUIRED');
  const info = await socialApi('list');
  $('socialManagement').hidden = false;
  if (info.provider) {
    $('socialProviderProof').hidden = false;
    const label = SOCIAL_PROVIDERS.find(([id]) => id === info.provider)?.[1] || '소셜';
    $('socialProviderVerify').textContent = `${label}로 본인 확인`;
    status('가입한 소셜 계정으로 다시 인증하면 계정 정보를 관리할 수 있어요.');
    $('socialProviderVerify').addEventListener('click', () => busy(() => startSocialLogin(info.provider, 'reauth')));
    return;
  }
  $('socialEmailProof').hidden = false;
  $('socialEmail').textContent = `인증번호를 받을 이메일: ${info.email}`;
  status('비밀번호 또는 이메일 인증번호로 본인 확인을 해 주세요.');
  $('socialSendProof').addEventListener('click', () => busy(async () => {
    await socialApi('reauth-email'); clearProof(); status('내 이메일로 인증번호를 보냈어요.');
  }));
  $('socialEnterAccount').addEventListener('click', () => busy(async () => {
    const currentProof = proof(); clearProof();
    await socialApi('reauth', { proof: currentProof }); enterVerifiedAccountPage();
  }));
}
$('socialLoginLink').href = loginHref();
if ($('socialBack')) $('socialBack').href = mypageHref();
await initSocialAuthNative().catch(() => {});
await (document.body.dataset.page === 'social-callback' ? callbackPage() : managementPage())
  .catch(error => {
    status(socialMessage(error));
    if ($('socialBack')) { $('socialBack').href = homeHref(); $('socialBack').textContent = '‹ 홈으로'; }
  });
