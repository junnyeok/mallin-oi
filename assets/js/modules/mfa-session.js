// Only used for routing. Supabase validates the signed token for every protected request.
export function sessionClaims(session) {
  try {
    const payload = session.access_token.split('.')[1].replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(payload));
  } catch {
    return {};
  }
}

export function hasNativeSecondFactor(session) {
  const claims = sessionClaims(session);
  return !!session?.user?.id && claims.sub === session.user.id &&
    claims.aal === 'aal2' && !!claims.session_id;
}

export function usesEmailMfa(user) {
  return !!user?.id && user.app_metadata?.mallinoi_auth?.kind !== 'social' &&
    user.app_metadata?.mallinoi_mfa_method !== 'totp';
}

export function mfaEnabled(user) {
  return ['email', 'totp'].includes(user?.app_metadata?.mallinoi_mfa_method) ||
    !!user?.factors?.some(factor => factor.status === 'verified');
}

export function sessionAllowsAccess(session) {
  if (mfaEnabled(session?.user)) return hasSecondFactor(session);
  const c = sessionClaims(session);
  return !!session?.user?.id && c.sub === session.user.id && !!c.session_id &&
    (session.user.app_metadata?.mallinoi_auth?.kind === 'social' ||
      !!c.amr?.some(proof => proof.method === 'password'));
}

function passwordSessionKey(session) {
  const c = sessionClaims(session);
  if (!usesEmailMfa(session?.user) || c.sub !== session.user.id || !c.session_id ||
      !c.amr?.some(proof => proof.method === 'password')) return '';
  return JSON.stringify([c.sub, c.session_id, session.user.email]);
}

// A routing hint in this document only. Permissions are checked in PostgreSQL.
let confirmedEmailSession = '';
export function hasSecondFactor(session) {
  if (!usesEmailMfa(session?.user)) return hasNativeSecondFactor(session);
  return !!confirmedEmailSession && confirmedEmailSession === passwordSessionKey(session);
}

export async function restoreSecondFactor(session, client) {
  if (hasSecondFactor(session)) return true;
  const key = passwordSessionKey(session);
  if (!key) return false;
  const { data, error } = await client.rpc('verified_account_session');
  if (error || data !== sessionClaims(session).session_id) return false;
  confirmedEmailSession = key;
  return true;
}

export function safeMfaReturn(value, base, fallback) {
  try {
    const url = new URL(value || fallback, base);
    const site = new URL(base);
    if (url.protocol !== site.protocol || url.host !== site.host || url.username || url.password ||
        url.pathname.startsWith('//') || /\/(?:login|signup|social-callback|mfa)\.html$/i.test(url.pathname)) return fallback;
    for (const key of ['code', 'token', 'token_hash', 'access_token', 'refresh_token', 'type']) {
      url.searchParams.delete(key);
    }
    if (/(?:access_token|refresh_token|token_hash|provider_token|request)=/.test(url.hash)) url.hash = '';
    return url.pathname + url.search + url.hash;
  } catch {
    return fallback;
  }
}
