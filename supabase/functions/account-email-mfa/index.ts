import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { createEmailMfaHandler } from './service.mjs';

const env = (name: string) => Deno.env.get(name) || '';
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const url = env('SUPABASE_URL');
const adminKey = env('MALLINOI_SERVICE_ROLE_KEY') || env('SUPABASE_SERVICE_ROLE_KEY');
const auth = createClient(url, env('SUPABASE_ANON_KEY'), options).auth;
const db = createClient(url, adminKey, options);
Deno.serve(createEmailMfaHandler({
  auth, db, digestKey: adminKey,
  async send(email: string, code: string, purpose: string, id: string) {
    const from = env('MFA_EMAIL_FROM') || '말린오이닷컴 <auth@mallin-oi.com>';
    const key = env('RESEND_API_KEY');
    if (!key) throw new Error('mailer unavailable');
    const action = purpose === 'entry' ? '마이페이지' : '로그인';
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json', 'Idempotency-Key': id },
      body: JSON.stringify({ from, to: [email], subject: '말린오이닷컴 ' + action + ' 인증번호',
        text: action + ' 인증번호는 ' + code + '입니다. 5분 안에 입력해 주세요. 직접 요청하지 않았다면 이 코드를 공유하지 마세요.' }),
    });
    if (!result.ok) throw new Error('mailer unavailable');
  },
}));
