const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function randomCode() {
  const sample = new Uint32Array(1);
  do { crypto.getRandomValues(sample); } while (sample[0] >= 4294000000);
  return String(sample[0] % 1000000).padStart(6, '0');
}

export function createEmailMfaHandler({ auth, db, send, digestKey }) {
  const bytes = new TextEncoder();
  const key = crypto.subtle.importKey('raw', bytes.encode(digestKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  async function digest(values) {
    const buffer = await crypto.subtle.sign('HMAC', await key, bytes.encode(JSON.stringify(['mallinoi/email-mfa/v1', ...values])));
    return Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
  }

  return async req => {
    if (req.method === 'OPTIONS') return reply(200, {});
    if (req.method !== 'POST') return reply(405, {});
    try {
      const token = /^Bearer (\S+)$/i.exec(req.headers.get('Authorization') || '')?.[1];
      if (!token) return reply(401, { code: 'LOGIN_REQUIRED' });
      // Verify the exact JWT with GoTrue before reading its password AMR and session ID.
      const { data, error } = await auth.getUser(token);
      if (error || !data?.user?.id) return reply(401, { code: 'LOGIN_REQUIRED' });
      const user = data.user;
      const claims = JSON.parse(atob(token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/')));
      if (claims.sub !== user.id || !uuid.test(claims.session_id) || !claims.amr?.some(p => p.method === 'password') ||
          !user.email_confirmed_at || user.app_metadata?.mallinoi_auth?.kind === 'social' ||
          user.app_metadata?.mallinoi_mfa_method === 'totp') return reply(403, { code: 'PASSWORD_EMAIL_REQUIRED' });
      const body = await req.json().catch(() => null);
      if (!['login', 'entry'].includes(body?.purpose) || !['send', 'verify'].includes(body?.action)) return reply(400, {});
      const args = { p_user: user.id, p_session: claims.session_id, p_purpose: body.purpose };
      const sending = body.action === 'send';
      const id = sending ? crypto.randomUUID() : body.id;
      const code = sending ? randomCode() : body.code;
      if (!uuid.test(id) || typeof code !== 'string' || !/^\d{6}$/.test(code)) return reply(400, { code: 'INVALID_CODE' });
      const params = { ...args, p_id: id, p_digest: await digest([user.id, claims.session_id, body.purpose, id, code]) };
      if (!sending) {
        const result = await db.rpc('finish_account_email_mfa', params);
        if (result.error) return reply(503, { code: 'UNAVAILABLE' });
        return result.data === true ? reply(200, { verified: true }) : reply(400, { code: 'INVALID_CODE' });
      }
      const result = await db.rpc('begin_account_email_mfa', { ...params, p_resend: body.resend === true });
      if (result.error?.message === 'MFA_RATE_LIMIT') return reply(429, { code: 'RATE_LIMIT' });
      if (result.error || !result.data?.id) return reply(503, { code: 'UNAVAILABLE' });
      if (result.data.send) {
        try { await send(result.data.email, code, body.purpose, id); }
        catch {
          await db.rpc('cancel_undelivered_account_code', { p_session: claims.session_id, p_id: id });
          return reply(503, { code: 'MAIL_UNAVAILABLE' });
        }
      }
      const expiresAt = Date.parse(result.data.expires_at);
      if (!Number.isFinite(expiresAt)) return reply(503, { code: 'UNAVAILABLE' });
      return reply(200, { id: result.data.id, remainingMs: Math.max(0, expiresAt - Date.now()) });
    } catch {
      return reply(503, { code: 'UNAVAILABLE' });
    }
  };
}
