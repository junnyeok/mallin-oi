import { demand, challenge, providerIdentity } from './policy.mjs';

const definitions = {
  google: { authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token', jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuer: ['https://accounts.google.com', 'accounts.google.com'], scope: 'openid email' },
  kakao: { authorize: 'https://kauth.kakao.com/oauth/authorize', token: 'https://kauth.kakao.com/oauth/token',
    jwks: 'https://kauth.kakao.com/.well-known/jwks.json', issuer: 'https://kauth.kakao.com', scope: 'openid' },
  apple: { authorize: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys', issuer: 'https://appleid.apple.com', scope: 'email' },
};

export function createProviders(env, jose, fetcher = fetch) {
  const keys = new Map();
  function config(provider) {
    const d = definitions[provider];
    demand(d, 'INVALID_PROVIDER');
    const prefix = `SOCIAL_${provider.toUpperCase()}`;
    const clientId = env(`${prefix}_CLIENT_ID`);
    const secret = env(`${prefix}_CLIENT_SECRET`);
    demand(clientId && secret, 'PROVIDER_UNAVAILABLE', 503);
    if (provider === 'apple') demand(env('SOCIAL_CREDENTIAL_KEY'), 'PROVIDER_UNAVAILABLE', 503);
    return { ...d, clientId, secret };
  }
  async function request(url, options) {
    const response = await fetcher(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
    const raw = await response.text();
    const data = raw ? JSON.parse(raw) : {};
    // Retain only Kakao's documented error identifier, never response text or credentials.
    demand(response.ok, /^KOE\d{3}$/.test(data.error_code || '')
      ? `PROVIDER_${data.error_code}` : 'PROVIDER_REQUEST_FAILED', 502);
    demand(!data.error, 'PROVIDER_REQUEST_FAILED', 502);
    return data;
  }
  async function credentialKey() {
    const raw = Uint8Array.from(atob(env('SOCIAL_CREDENTIAL_KEY') || ''), c => c.charCodeAt(0));
    demand(raw.length === 32, 'SERVER_CONFIGURATION', 503);
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }
  async function seal(token, subject) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv,
      additionalData: new TextEncoder().encode(`apple:${subject}`) }, await credentialKey(), new TextEncoder().encode(token));
    return btoa(String.fromCharCode(...iv, ...new Uint8Array(ciphertext)));
  }
  async function unseal(value, subject) {
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12),
      additionalData: new TextEncoder().encode(`apple:${subject}`) }, await credentialKey(), bytes.slice(12)));
  }
  return {
    available(provider) { try { config(provider); return true; } catch { return false; } },
    async authorize(provider, row, state, callback) {
      const c = config(provider);
      const url = new URL(c.authorize);
      const p = { response_type: 'code', client_id: c.clientId, redirect_uri: callback,
        scope: c.scope, state, nonce: row.nonce };
      if (provider !== 'apple') {
        p.code_challenge = await challenge(row.provider_verifier);
        p.code_challenge_method = 'S256';
      } else p.response_mode = 'form_post';
      if (provider === 'google') p.prompt = 'select_account';
      Object.entries(p).forEach(([key, value]) => url.searchParams.set(key, value));
      return url.href;
    },
    async exchange(provider, row, code, callback) {
      const c = config(provider);
      const form = { grant_type: 'authorization_code', client_id: c.clientId,
        client_secret: c.secret, redirect_uri: callback, code };
      if (provider !== 'apple') form.code_verifier = row.provider_verifier;
      const tokens = await request(c.token, { method: 'POST', body: new URLSearchParams(form) });
      demand(typeof tokens.id_token === 'string', 'OIDC_REQUIRED');
      if (!keys.has(provider)) keys.set(provider, jose.createRemoteJWKSet(new URL(c.jwks)));
      const { payload } = await jose.jwtVerify(tokens.id_token, keys.get(provider), {
        issuer: c.issuer, audience: c.clientId, algorithms: ['RS256'],
        requiredClaims: ['sub', 'iss', 'aud', 'exp', 'iat', 'nonce'], clockTolerance: 30, maxTokenAge: '10m',
      });
      demand(payload.nonce === row.nonce, 'NONCE_MISMATCH', 403);
      demand(!payload.azp || payload.azp === c.clientId, 'AUDIENCE_MISMATCH', 403);
      let profile = null;
      if (provider === 'kakao') {
        demand(tokens.access_token, 'PROVIDER_REQUEST_FAILED');
        profile = await request('https://kapi.kakao.com/v2/user/me', {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
      }
      const identity = providerIdentity(provider, payload, profile);
      if (provider === 'apple') demand(tokens.refresh_token, 'APPLE_REVOCATION_REQUIRED');
      // Apple credentials are retained encrypted only to support revocation at account deletion.
      return { ...identity, provider_authenticated_at: new Date(payload.iat * 1000).toISOString(), credential_ciphertext: provider === 'apple' && tokens.refresh_token
        ? await seal(tokens.refresh_token, identity.subject) : null };
    },
    async revokeApple(link) {
      if (link.provider !== 'apple') return;
      demand(link.credential_ciphertext, 'APPLE_REVOCATION_REQUIRED');
      const c = config('apple');
      await request('https://appleid.apple.com/auth/revoke', { method: 'POST',
        body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret,
          token: await unseal(link.credential_ciphertext, link.subject), token_type_hint: 'refresh_token' }) });
    },
  };
}
