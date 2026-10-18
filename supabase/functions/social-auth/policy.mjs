export const PROVIDERS = ['google', 'kakao', 'apple'];
export class AuthError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function demand(condition, code, status = 400) {
  if (!condition) throw new AuthError(code, status);
}
export function safeProviderFailure(error) {
  const code = error?.code;
  const allowed = ['PROVIDER_CANCELLED', 'PROVIDER_REQUEST_FAILED', 'OIDC_REQUIRED',
    'NONCE_MISMATCH', 'AUDIENCE_MISMATCH', 'INVALID_IDENTITY', 'IDENTITY_MISMATCH',
    'APPLE_REVOCATION_REQUIRED', 'SERVER_CONFIGURATION', 'SERVER_REQUEST_FAILED',
    'ERR_JWT_CLAIM_VALIDATION_FAILED', 'ERR_JWT_EXPIRED', 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED',
    'ERR_JWKS_TIMEOUT', 'ERR_JWKS_NO_MATCHING_KEY'];
  return allowed.includes(code) || /^PROVIDER_KOE\d{3}$/.test(code || '') ? code : 'PROVIDER_FAILED';
}
export function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  demand(email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'INVALID_EMAIL');
  return email;
}
export function validateProfile(body) {
  const nickname = String(body.nickname || '').trim();
  demand(nickname.length >= 2 && nickname.length <= 20, 'INVALID_NICKNAME');
  demand(body.terms === true && body.privacy === true, 'CONSENT_REQUIRED');
  return { nickname, marketing_agreed: body.marketing === true,
    terms_agreed_at: new Date().toISOString(), privacy_agreed_at: new Date().toISOString() };
}
export function randomToken() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
    .replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export async function challenge(value) {
  return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',
    new TextEncoder().encode(value))))).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}
export function validateVerifier(value) {
  demand(typeof value === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(value), 'INVALID_VERIFIER');
  return value;
}
export function validateReturnUri(value, allowed) {
  demand(typeof value === 'string' && allowed.includes(value), 'INVALID_RETURN_URI');
  const url = new URL(value);
  demand(!url.username && !url.password && !url.hash && !url.search, 'INVALID_RETURN_URI');
  demand(url.protocol === 'https:' || value === 'mallinoi://auth/callback' ||
    (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)), 'INVALID_RETURN_URI');
  return value;
}
export async function authorizeRequest(row, verifier, now = Date.now()) {
  demand(row && new Date(row.expires_at).getTime() > now && row.status !== 'used', 'EXPIRED_REQUEST');
  demand(row.client_challenge === await challenge(validateVerifier(verifier)), 'REQUEST_MISMATCH', 403);
  return row;
}
export function loginDecision(link, existingEmailUser) {
  if (link) return 'linked';
  if (existingEmailUser) return 'existing-account';
  return 'signup';
}
export function providerIdentity(provider, claims, profile = null) {
  demand(PROVIDERS.includes(provider) && typeof claims.sub === 'string' && claims.sub.length > 0 &&
    claims.sub.length <= 255, 'INVALID_IDENTITY');
  if (provider === 'kakao') {
    demand(String(profile?.id) === claims.sub, 'IDENTITY_MISMATCH');
    const a = profile?.kakao_account;
    return { subject: claims.sub, verified_email: a?.is_email_valid === true &&
      a?.is_email_verified === true && a?.email ? normalizeEmail(a.email) : null };
  }
  return { subject: claims.sub, verified_email:
    (claims.email_verified === true || claims.email_verified === 'true') && claims.email
      ? normalizeEmail(claims.email) : null };
}
