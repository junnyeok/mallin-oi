import { SOCIAL_PROVIDERS, socialApi, socialMessage, pendingRequest, availableSocialProviders,
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
  return { nickname: $('socialNickname').value, email: $('socialSignupEmail').value,
    otp: $('socialSignupOtp').value.trim(), terms: $('socialTerms').checked,
    privacy: $('socialPrivacy').checked, marketing: $('socialMarketing').checked };
}
async function callbackPage() {
  const request = new URLSearchParams(location.hash.slice(1)).get('request');
  const pending = pendingRequest();
  if (!pending || pending.request !== request) throw new Error('REQUEST_MISMATCH');
  const payload = { request, verifier: pending.verifier };
  const info = await socialApi('inspect', payload);
  if (info.decision === 'existing-account') throw new Error('EXISTING_ACCOUNT');
  const signup = info.decision === 'signup';
  $('socialCompleteForm').hidden = false;
  $('socialSignupFields').hidden = !signup;
  $('socialEmailFields').hidden = !info.emailRequired;
  $('socialNickname').required = signup;
  $('socialTerms').required = signup;
  $('socialPrivacy').required = signup;
  $('socialSignupEmail').required = signup && info.emailRequired;
  $('socialSignupOtp').required = signup && info.emailRequired;
  $('socialFinish').textContent = info.purpose === 'link' ? '내 계정에 연결' : signup ? '가입하고 시작하기' : '로그인';
  status(info.purpose === 'link' ? '본인 확인한 계정에 이 소셜 계정을 연결할까요?' :
    signup ? '가입 정보를 확인해 주세요.' : '연결된 계정을 확인했어요. 로그인하면 같은 기록을 이어서 사용할 수 있어요.');
  $('socialSendEmail').addEventListener('click', () => busy(async () => {
    await socialApi('email-send', { ...payload, ...profile() });
    status('이메일로 인증번호를 보냈어요. 5분 안에 입력해 주세요.');
  }));
  $('socialCompleteForm').addEventListener('submit', event => {
    event.preventDefault();
    busy(async () => {
      const result = await socialApi('finish', { ...payload, ...(signup ? profile() : {}) });
      await acceptSocialResult(result);
    });
  });
}
async function managementPage() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('LOGIN_REQUIRED');
  const available = await availableSocialProviders();
  if (!available.length) throw new Error('NOT_CONFIGURED');
  $('socialManagement').hidden = false;
  async function refresh() {
    const result = await socialApi('list');
    $('socialEmail').textContent = `인증번호를 받을 이메일: ${result.email}`;
    $('socialSendProof').disabled = result.relayDisabled === true;
    if (result.relayDisabled) $('socialEmail').textContent += ' · Apple 계정 설정에서 이메일 전달을 켜 주세요.';
    $('socialLinks').replaceChildren();
    for (const [provider, label] of SOCIAL_PROVIDERS) {
      const linked = result.links.some(l => l.provider === provider);
      const row = document.createElement('div'); row.className = 'social-auth-row';
      const text = document.createElement('span'); text.textContent = `${label} · ${linked ? '연결됨' : '연결 안 됨'}`;
      const button = document.createElement('button'); button.type = 'button';
      button.textContent = linked ? '연결 해제' : '연결';
      button.setAttribute('aria-label', `${label} ${button.textContent}`);
      button.disabled = !available.includes(provider) || (linked && !result.hasPassword && result.links.length <= 1);
      button.addEventListener('click', () => busy(async () => {
        const currentProof = proof(); clearProof();
        if (linked) {
          const result = await socialApi('unlink', { provider, proof: currentProof });
          await refresh(); status(result.revocationPending ? '연결은 해제했어요. Apple 승인 해제는 재시도 중이며, 이 화면을 다시 열면 상태를 확인해요.' : `${label} 연결을 해제했어요.`);
        } else {
          status(`${label} 인증 화면으로 이동합니다.`);
          await startSocialLogin(provider, 'link', currentProof);
        }
      }));
      row.append(text, button); $('socialLinks').append(row);
    }
    return result;
  }
  const initial = await refresh();
  status(initial.revocationPending ? 'Apple 승인 해제를 아직 완료하지 못했어요. 잠시 후 이 화면을 다시 열어 주세요.' : '연결할 계정을 선택해 주세요.');
  $('socialSendProof').addEventListener('click', () => busy(async () => {
    await socialApi('reauth-email'); clearProof(); status('내 이메일로 인증번호를 보냈어요.');
  }));
  $('socialEnterAccount').addEventListener('click', () => busy(async () => {
    const currentProof = proof(); clearProof();
    await socialApi('reauth', { proof: currentProof }); enterVerifiedAccountPage();
  }));
  $('socialSavePassword').addEventListener('click', () => busy(async () => {
    const password = $('socialNewPassword').value;
    if (password !== $('socialNewPasswordConfirm').value) {
      status('새 비밀번호가 서로 같지 않아요.'); return;
    }
    const currentProof = proof(); clearProof();
    await socialApi('password', { proof: currentProof, password });
    $('socialNewPassword').value = ''; $('socialNewPasswordConfirm').value = '';
    await refresh(); status('비밀번호를 설정했어요. 이제 이메일과 비밀번호로도 로그인할 수 있어요.');
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
