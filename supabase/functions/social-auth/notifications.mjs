import { demand } from './policy.mjs';

// Provider signatures, not a browser session or Origin header, authorize notifications.
export function createNotificationVerifier(env, jose) {
  const keys = new Map();
  return async (provider, token) => {
    demand(['apple', 'kakao'].includes(provider) && typeof token === 'string' && token.length <= 24000, 'INVALID_EVENT');
    const apple = provider === 'apple';
    const issuer = apple ? 'https://appleid.apple.com' : 'https://kauth.kakao.com';
    if (!keys.has(provider)) keys.set(provider, jose.createRemoteJWKSet(new URL(apple
      ? 'https://appleid.apple.com/auth/keys' : 'https://kauth.kakao.com/.well-known/jwks.json'), { timeoutDuration: 1500 }));
    const audiences = apple ? [env('SOCIAL_APPLE_CLIENT_ID'), env('SOCIAL_APPLE_APP_ID')].filter(Boolean)
      : [env('SOCIAL_KAKAO_CLIENT_ID')];
    const { payload, protectedHeader } = await jose.jwtVerify(token, keys.get(provider), {
      issuer, audience: audiences, algorithms: ['RS256'], requiredClaims: ['iss','aud','iat','jti','events'],
      clockTolerance: 30, maxTokenAge: '30d',
    });
    demand(typeof payload.jti === 'string' && payload.jti.length <= 512, 'INVALID_EVENT');
    let event;
    if (apple) {
      const e = typeof payload.events === 'string' ? JSON.parse(payload.events) : payload.events;
      demand(['email-enabled','email-disabled','consent-revoked','account-deleted'].includes(e?.type), 'INVALID_EVENT');
      event = { subject: e.sub, type: e.type, time: e.event_time };
    } else {
      demand(protectedHeader.typ === 'secevent+jwt' && String(payload.app_id) === env('SOCIAL_KAKAO_APP_ID'), 'INVALID_EVENT');
      const e = payload.events?.['https://schemas.openid.net/secevent/oauth/event-type/user-unlinked'];
      demand(e?.subject?.subject_type === 'iss-sub' && e.subject.iss === issuer && e.subject.sub === payload.sub, 'INVALID_EVENT');
      event = { subject: e.subject.sub, type: 'user-unlinked', time: payload.toe };
    }
    const now = Date.now() / 1000;
    demand(typeof event.subject === 'string' && event.subject.length > 0 && event.subject.length <= 255 &&
      Number.isSafeInteger(event.time) && event.time <= now + 30 && event.time >= now - 30 * 86400 &&
      event.time <= payload.iat + 30, 'INVALID_EVENT');
    return { p_provider: provider, p_event_id: payload.jti, p_subject: event.subject,
      p_type: event.type, p_time: new Date(event.time * 1000).toISOString() };
  };
}

export function createNotificationHandler({ env, createClient, verify }) {
  return async (req, provider) => {
    const headers = { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
    if (req.method !== 'POST') return new Response(null, { status: 405, headers });
    let event;
    try {
      const raw = await req.text();
      demand(raw.length <= 32768, 'INVALID_EVENT');
      const type = (req.headers.get('content-type') || '').split(';')[0];
      demand(type === (provider === 'apple' ? 'application/json' : 'application/secevent+jwt'), 'INVALID_EVENT');
      event = await verify(provider, provider === 'apple' ? JSON.parse(raw).payload : raw);
    } catch {
      return Response.json({ err: 'invalid_request', description: 'Notification validation failed.' }, { status: 400, headers });
    }
    try {
      const db = createClient(env('SUPABASE_URL'), env('MALLINOI_SERVICE_ROLE_KEY'),
        { auth: { persistSession: false, autoRefreshToken: false } });
      const result = await db.rpc('social_auth_receive_event', event);
      if (result.error) throw new Error('EVENT_STORE_FAILED');
      return new Response(null, { status: provider === 'kakao' ? 202 : 200, headers });
    } catch {
      // Retryable error: never acknowledge a notification that was not persisted.
      return new Response(null, { status: 503, headers });
    }
  };
}
