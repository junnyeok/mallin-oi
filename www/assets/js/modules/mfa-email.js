import { supabase } from './supabase-client.js';
import { sessionClaims } from './mfa-session.js';

const messages = {
  INVALID_CODE: '코드를 확인해 주세요. 5분이 지났거나 5번 틀렸다면 새 코드를 받아 주세요.',
  RATE_LIMIT: '잠시 후 다시 요청해 주세요. 재발송은 1분 뒤부터 가능하고 한 시간에 최대 10회 받을 수 있어요.',
  PASSWORD_EMAIL_REQUIRED: '가입한 비밀번호로 다시 로그인해 주세요.',
  MAIL_UNAVAILABLE: '메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
};
export async function mountEmailCode(root, { mode, userId, onVerified }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!root.isConnected || session?.user?.id !== userId) return;
  const sessionId = sessionClaims(session).session_id;
  const purpose = mode === 'entry' ? 'entry' : 'login';
  root.innerHTML = `
    <form class="mfa-form">
      <p data-help></p>
      <label>이메일 인증번호
        <input data-code type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" required>
      </label>
      <button type="submit">인증하기</button>
      <button type="button" data-resend>인증번호 다시 받기</button>
      <p data-status role="status" aria-live="polite"></p>
    </form>`;
  const form = root.querySelector('form');
  const input = form.querySelector('input');
  const submit = form.querySelector('[type=submit]');
  const resend = form.querySelector('[data-resend]');
  const status = form.querySelector('[data-status]');
  form.querySelector('[data-help]').textContent = session.user.email + '로 받은 6자리 코드를 5분 안에 입력해 주세요.';
  let id = '';
  let busy = false;

  async function request(action, again = false) {
    if (busy) return;
    busy = true;
    resend.disabled = submit.disabled = true;
    status.textContent = action === 'send' ? '인증메일을 준비하고 있어요.' : '코드를 확인하고 있어요.';
    try {
      const { data: { session: current } } = await supabase.auth.getSession();
      if (!current || current.user.id !== userId || sessionClaims(current).session_id !== sessionId) throw new Error();
      const body = { action, purpose };
      if (action === 'send') body.resend = again;
      else { body.id = id; body.code = input.value.trim(); input.value = ''; }
      const { data, error } = await supabase.functions.invoke('account-email-mfa', {
        headers: { Authorization: 'Bearer ' + current.access_token }, body,
      });
      if (!form.isConnected) return;
      if (error) {
        const result = await error.context?.json?.().catch(() => null);
        status.textContent = messages[result?.code] || '인증 서버에 연결하지 못했어요. 다시 시도해 주세요.';
        return;
      }
      if (action === 'send' && data?.id) {
        id = data.id;
        status.textContent = '메일함을 확인해 주세요. 메일이 보이지 않으면 스팸함도 확인해 주세요.';
      } else if (action === 'verify' && data?.verified === true) {
        await onVerified();
        if (form.isConnected) form.replaceChildren();
      } else throw new Error();
    } catch {
      if (form.isConnected) status.textContent = '인증을 완료하지 못했어요. 로그인 상태를 확인하고 다시 시도해 주세요.';
    } finally {
      busy = false;
      resend.disabled = false;
      submit.disabled = !id;
    }
  }
  form.onsubmit = event => { event.preventDefault(); if (id) void request('verify'); };
  resend.onclick = () => void request('send', true);
  await request('send');
}
