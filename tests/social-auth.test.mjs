import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { PROVIDERS, normalizeEmail, validateProfile, randomToken, challenge, validateReturnUri,
  authorizeRequest, loginDecision, providerIdentity, safeProviderFailure } from '../supabase/functions/social-auth/policy.mjs';
import { createProviders } from '../supabase/functions/social-auth/providers.mjs';
import { createHandler } from '../supabase/functions/social-auth/service.mjs';
import { revokePendingApple } from '../supabase/functions/social-auth/revocation.mjs';
import { socialNativeDestination } from '../assets/js/modules/social-auth-native.js';

test('provider diagnostics retain only known codes, never raw errors or credentials', () => {
  assert.equal(safeProviderFailure({ code: 'PROVIDER_KOE010', message: 'sensitive response' }), 'PROVIDER_KOE010');
  assert.equal(safeProviderFailure({ code: 'NONCE_MISMATCH' }), 'NONCE_MISMATCH');
  assert.equal(safeProviderFailure({ code: 'secret-value', message: 'secret-value' }), 'PROVIDER_FAILED');
  assert.equal(safeProviderFailure(new Error('secret-value')), 'PROVIDER_FAILED');
});

test('service worker follows authentication activation and rollback without cached flags', async () => {
  const listeners = new Map();
  let enabled = false;
  let requests = 0;
  runInNewContext(await readFile(new URL('../sw.js', import.meta.url), 'utf8'), {
    URL,
    self: { location: { origin: 'https://mallin-oi.com' }, addEventListener: (name, fn) => listeners.set(name, fn) },
    caches: { open() { throw new Error('Authentication flags must not use a cache'); } },
    fetch: async (request, options) => {
      assert.equal(options.cache, 'no-store'); requests++;
      return Response.json({ enabled });
    },
  });
  for (const value of [false, true, false]) {
    enabled = value;
    let result;
    listeners.get('fetch')({ request: new Request('https://mallin-oi.com/assets/social-auth-config.json'),
      respondWith(promise) { result = promise; } });
    assert.equal((await (await result).json()).enabled, value);
  }
  assert.equal(requests, 3);
});

test('email normalization preserves aliases and Apple relay addresses', () => {
  assert.equal(normalizeEmail(' Name+tag@Example.com '), 'name+tag@example.com');
  assert.notEqual(normalizeEmail('a.b@gmail.com'), normalizeEmail('ab@gmail.com'));
  assert.equal(normalizeEmail('AB@privaterelay.appleid.com'), 'ab@privaterelay.appleid.com');
  assert.throws(() => normalizeEmail('bad@host'), /INVALID_EMAIL/);
});
test('signup requires explicit mandatory consent', () => {
  assert.throws(() => validateProfile({ nickname: '테스트', terms: true }), /CONSENT_REQUIRED/);
  assert.throws(() => validateProfile({ nickname: 'a', terms: true, privacy: true }), /INVALID_NICKNAME/);
  assert.equal(validateProfile({ nickname: ' 테스트 ', terms: true, privacy: true }).nickname, '테스트');
});
test('email equality never authorizes login or account merging', () => {
  assert.equal(loginDecision(null, { id: 'existing' }), 'existing-account');
  assert.equal(loginDecision({ user_id: 'linked' }, { id: 'different' }), 'linked');
  assert.equal(loginDecision(null, null), 'signup');
});
test('provider identity trusts subject and verified email only', () => {
  assert.equal(providerIdentity('google', { sub: '42', email: 'x@example.com', email_verified: false }).verified_email, null);
  assert.equal(providerIdentity('apple', { sub: 'apple-42', email: 'x@privaterelay.appleid.com', email_verified: 'true' }).verified_email, 'x@privaterelay.appleid.com');
  assert.equal(providerIdentity('kakao', { sub: '42' }, { id: 42 }).verified_email, null);
  assert.equal(providerIdentity('kakao', { sub: '42' }, { id: 42, kakao_account: { email: 'x@example.com', is_email_valid: true, is_email_verified: true } }).verified_email, 'x@example.com');
  assert.throws(() => providerIdentity('kakao', { sub: '42' }, { id: 43 }), /IDENTITY_MISMATCH/);
});
test('return URLs require exact matches and reject open redirects', () => {
  const allowed = ['https://mallin-oi.com/account/social-callback.html', 'mallinoi://auth/callback'];
  for (const url of allowed) assert.equal(validateReturnUri(url, allowed), url);
  for (const url of ['https://mallin-oi.com.evil.test/account/social-callback.html', allowed[0] + '?next=https://evil.test', 'javascript:alert(1)']) {
    assert.throws(() => validateReturnUri(url, allowed));
  }
  assert.throws(() => validateReturnUri('https://user:pass@example.com', ['https://user:pass@example.com']));
});
test('request proof rejects interception, expiry and replay', async () => {
  const verifier = randomToken(); assert.equal(verifier.length, 43);
  const row = { status: 'ready', client_challenge: await challenge(verifier), expires_at: new Date(Date.now() + 10000).toISOString() };
  assert.equal(await authorizeRequest(row, verifier), row);
  await assert.rejects(authorizeRequest(row, randomToken()), /REQUEST_MISMATCH/);
  await assert.rejects(authorizeRequest({ ...row, status: 'used' }, verifier), /EXPIRED_REQUEST/);
  await assert.rejects(authorizeRequest(row, verifier, Date.now() + 20000), /EXPIRED_REQUEST/);
});
test('expired provider callbacks return only to their recorded client without exchanging a code', async () => {
  const state = randomToken();
  const stateHash = await challenge(state);
  const id = '11111111-1111-4111-8111-111111111111';
  let returnUri = 'https://mallin-oi.com/account/social-callback.html';
  const db = { from: () => {
    let claiming = false;
    const filters = {};
    const q = { update() { claiming = true; return q; }, select() { return q; },
      eq(key, value) { filters[key] = value; return q; }, gt() { return q; },
      async maybeSingle() { return { data: !claiming && filters.state_hash === stateHash && filters.provider === 'apple'
        ? { id, return_uri: returnUri } : null, error: null }; } };
    return q;
  } };
  let exchanges = 0;
  const handler = createHandler({ env, createClient: () => db,
    providers: { exchange() { exchanges++; throw new Error('expired code must not be exchanged'); } } });
  const callback = (provider, value) => new Request(`https://auth.example.test/callback/${provider}`, {
    method: 'POST', body: new URLSearchParams({ state: value, code: 'expired-code' }) });
  const response = await handler(callback('apple', state));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), `${returnUri}#request=${id}`);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(exchanges, 0);
  for (const req of [callback('apple', randomToken()), callback('google', state)]) {
    const rejected = await handler(req);
    assert.equal(rejected.headers.has('location'), false);
    assert.equal((await rejected.json()).error, 'EXPIRED_REQUEST');
  }
  returnUri = 'https://unapproved.example.test/';
  const rejected = await handler(callback('apple', state));
  assert.equal(rejected.headers.has('location'), false);
  assert.equal((await rejected.json()).error, 'INVALID_RETURN_URI');
  assert.equal(exchanges, 0);
});
test('native return accepts only the initiating app request; contains no session tokens', () => {
  const stored = { request: 'request-1', expires: Date.now() + 10000 };
  const current = 'capacitor://localhost/app-calendar.html?app=calendar';
  const expected = 'capacitor://localhost/account/social-callback.html?app=calendar#request=request-1';
  assert.equal(socialNativeDestination('mallinoi://auth/callback#request=request-1', stored, current), expected);
  for (const url of ['mallinoi://calendar/callback#request=request-1', 'https://evil.test/#request=request-1', 'mallinoi://auth/callback#request=other']) {
    assert.equal(socialNativeDestination(url, stored, current), null);
  }
  assert.equal(socialNativeDestination('mallinoi://auth/callback#request=request-1', { ...stored, expires: 0 }, current), null);
  assert.equal(socialNativeDestination('mallinoi://auth/callback#request=request-1', stored, expected), null);
});

const values = { SOCIAL_AUTH_ENABLED: 'true', SUPABASE_URL: 'https://auth.example.test',
  SUPABASE_ANON_KEY: 'test-public', MALLINOI_SERVICE_ROLE_KEY: 'test-server',
  SOCIAL_ALLOWED_ORIGINS: 'https://mallin-oi.com', SOCIAL_RETURN_URIS: 'https://mallin-oi.com/account/social-callback.html',
  SOCIAL_CREDENTIAL_KEY: btoa('t'.repeat(32)) };
for (const p of PROVIDERS) { values[`SOCIAL_${p.toUpperCase()}_CLIENT_ID`] = `${p}-client`; values[`SOCIAL_${p.toUpperCase()}_CLIENT_SECRET`] = 'test-secret'; }
const env = key => values[key] || '';
const safeSettings = async () => Response.json({ external: { google: false, kakao: false, apple: false } });
const request = (action, body = {}, origin = 'https://mallin-oi.com') => new Request('https://auth.example.test/functions/v1/social-auth',
  { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer test-session' }, body: JSON.stringify({ action, ...body }) });
test('authorization URLs bind state, nonce, exact callback and PKCE', async () => {
  const providers = createProviders(env, {});
  for (const p of PROVIDERS) {
    const row = { nonce: randomToken(), provider_verifier: randomToken() };
    const url = new URL(await providers.authorize(p, row, 'state', 'https://auth.example.test/callback'));
    assert.equal(url.searchParams.get('state'), 'state');
    assert.equal(url.searchParams.get('nonce'), row.nonce);
    assert.equal(url.searchParams.get('redirect_uri'), 'https://auth.example.test/callback');
    if (p !== 'apple') assert.equal(url.searchParams.get('code_challenge'), await challenge(row.provider_verifier));
    else assert.equal(url.searchParams.get('response_mode'), 'form_post');
  }
});
test('provider exchange validates nonce and verification constraints', async () => {
  let options;
  const jose = { createRemoteJWKSet: () => ({}), jwtVerify: async (_, __, o) => {
    options = o; return { payload: { sub: 'subject', nonce: 'wrong' } };
  } };
  const providers = createProviders(env, jose, async () => Response.json({ id_token: 'signed-token' }));
  await assert.rejects(providers.exchange('google', { nonce: 'expected', provider_verifier: randomToken() }, 'code', 'https://auth.example.test/callback'), /NONCE_MISMATCH/);
  assert.deepEqual(options.algorithms, ['RS256']); assert.equal(options.audience, 'google-client');
  assert.ok(options.requiredClaims.includes('exp')); assert.ok(options.requiredClaims.includes('nonce'));
});
test('Apple revocation credentials are encrypted and bound to the subject', async () => {
  let revokedToken;
  const jose = { createRemoteJWKSet: () => ({}), jwtVerify: async () => ({ payload: { sub: 'apple-sub', nonce: 'nonce', iat: Math.floor(Date.now() / 1000) } }) };
  const providers = createProviders(env, jose, async (url, options) => {
    if (url.endsWith('/revoke')) { revokedToken = options.body.get('token'); return new Response(''); }
    return Response.json({ id_token: 'token', refresh_token: 'private-refresh-token' });
  });
  const identity = await providers.exchange('apple', { nonce: 'nonce' }, 'code', 'https://auth.example.test/callback');
  assert.ok(identity.credential_ciphertext); assert.ok(!identity.credential_ciphertext.includes('private-refresh-token'));
  await providers.revokeApple({ ...identity, provider: 'apple' }); assert.equal(revokedToken, 'private-refresh-token');
  await assert.rejects(providers.revokeApple({ ...identity, provider: 'apple', subject: 'other' }));
});
test('unconfigured deployment, disallowed origins, methods and invalid actions fail closed', async () => {
  const createClient = () => { throw new Error('must not access database'); };
  const disabled = createHandler({ env: () => '', createClient, providers: {} });
  assert.equal((await disabled(request('config'))).status, 503);
  const enabled = createHandler({ env, createClient: () => ({}), providers: {}, fetcher: safeSettings });
  assert.equal((await enabled(request('config', {}, 'https://evil.test'))).status, 403);
  assert.equal((await enabled(request('unknown'))).status, 400);
  const preflight = await enabled(new Request('https://auth.example.test', { method: 'OPTIONS', headers: { Origin: 'https://evil.test' } }));
  assert.equal(preflight.status, 403); assert.equal(preflight.headers.has('access-control-allow-origin'), false);
});
test('broker refuses activation while automatic email-linking provider endpoints are enabled', async () => {
  const handler = createHandler({ env, createClient: () => ({}), providers: { available: () => true },
    fetcher: async () => Response.json({ external: { google: true, kakao: false, apple: false } }) });
  const response = await handler(request('config'));
  assert.equal(response.status, 503); assert.equal((await response.json()).error, 'UNSAFE_AUTH_CONFIGURATION');
});
test('configured capabilities expose no secrets and only available providers', async () => {
  const handler = createHandler({ env, createClient: () => ({}), providers: { available: p => p === 'google' }, fetcher: safeSettings });
  const response = await handler(request('config')); assert.deepEqual(await response.json(), { providers: ['google'] });
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('reauthentication email limit stays bound to the account across changing IP addresses', async () => {
  const buckets = new Map();
  let sent = 0;
  const db = {
    from: () => ({ select: () => ({ eq: async () => ({ data: [] }) }) }),
    rpc: async (name, args) => {
      if (name !== 'social_auth_rate_limit') return { data: [] };
      const count = (buckets.get(args.p_bucket) || 0) + 1;
      buckets.set(args.p_bucket, count);
      return { data: count <= args.p_limit };
    },
  };
  const anon = { auth: {
    getUser: async () => ({ data: { user: { id: 'member', email: 'member@example.test', email_confirmed_at: '2026-01-01' } } }),
    signInWithOtp: async () => { sent++; return { data: {} }; },
  } };
  const handler = createHandler({ env, createClient: (_, key) => key === 'test-server' ? db : anon, providers: {} });
  for (let i = 0; i < 6; i++) {
    const input = request('reauth-email');
    input.headers.set('x-forwarded-for', `192.0.2.${i + 1}`);
    const response = await handler(input);
    assert.equal(response.status, i < 5 ? 200 : 429);
    if (i === 5) assert.equal((await response.json()).error, 'RATE_LIMIT');
  }
  assert.equal(sent, 5);
});

function stubDb(row, existing = null, link = null) {
  const calls = [];
  const chain = table => {
    const q = { select() { return q; }, eq() { return q; },
      maybeSingle: async () => ({ data: table === 'social_auth_requests' ? row : link, error: null }) };
    return q;
  };
  return { calls, from: chain, rpc: async name => ({ data: name === 'social_auth_rate_limit' ? true : name === 'social_auth_user' ? existing ? [existing] : [] : null, error: null }),
    auth: { admin: { createUser: async () => { calls.push('createUser'); throw new Error('unexpected signup'); },
      generateLink: async () => { calls.push('generateLink'); throw new Error('unexpected session'); } } } };
}
test('same-email existing member cannot receive a session through unlinked social login', async () => {
  const verifier = randomToken();
  const row = { id: '11111111-1111-4111-8111-111111111111', status: 'ready', purpose: 'login', provider: 'google',
    subject: 'unlinked', verified_email: 'member@example.com', client_challenge: await challenge(verifier),
    expires_at: new Date(Date.now() + 10000).toISOString() };
  const db = stubDb(row, { id: 'existing' });
  const handler = createHandler({ env, createClient: () => db, providers: {}, fetcher: safeSettings });
  const response = await handler(request('finish', { request: row.id, verifier, nickname: '테스트', terms: true, privacy: true }));
  assert.equal((await response.json()).error, 'EXISTING_ACCOUNT'); assert.deepEqual(db.calls, []);
});
test('a stolen callback request id cannot inspect or redeem without the initiating verifier', async () => {
  const row = { id: '11111111-1111-4111-8111-111111111111', status: 'ready', client_challenge: await challenge(randomToken()), expires_at: new Date(Date.now() + 10000).toISOString() };
  const db = stubDb(row);
  const handler = createHandler({ env, createClient: () => db, providers: {}, fetcher: safeSettings });
  const response = await handler(request('finish', { request: row.id, verifier: randomToken() }));
  assert.equal(response.status, 403); assert.equal((await response.json()).error, 'REQUEST_MISMATCH'); assert.deepEqual(db.calls, []);
});
test('failed Apple revocation retains durable retry record', async () => {
  let removed = false;
  const db = { from: () => ({ select: () => ({ eq: async () => ({ data: [{ id: 'pending', provider: 'apple' }] }) }),
    delete: () => { removed = true; } }) };
  await assert.rejects(revokePendingApple(db, { revokeApple: async () => { throw new Error('network'); } }, 'user'));
  assert.equal(removed, false);
});
test('public activation file contains only a boolean flag, never server configuration', async () => {
  const config = JSON.parse(await readFile(new URL('../assets/social-auth-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(config), ['enabled']);
  assert.equal(typeof config.enabled, 'boolean');
  const generated = JSON.parse(await readFile(new URL('../www/assets/social-auth-config.json', import.meta.url), 'utf8'));
  assert.deepEqual(generated, config);
});

test('linked login issues a session for the stored UUID, never for the provider email', async () => {
  const verifier = randomToken(), userId = 'existing-user';
  const row = { id: '11111111-1111-4111-8111-111111111111', status: 'ready', purpose: 'login', provider: 'google',
    subject: 'linked-sub', verified_email: 'changed-provider@example.com', client_challenge: await challenge(verifier),
    expires_at: new Date(Date.now() + 10000).toISOString() };
  const db = stubDb(row, { id: 'different-email-owner' }, { user_id: userId });
  const events = [];
  db.rpc = async name => {
    if (name === 'social_auth_finish') events.push('atomic-finish');
    return { data: name === 'social_auth_rate_limit' ? true : name === 'social_auth_user' ? [{ id: 'different-email-owner' }] : null };
  };
  let user = { id: userId, email: 'original@example.com', email_confirmed_at: '2026-01-01', banned_until: '2020-01-01' };
  db.auth.admin.getUserById = async id => { assert.equal(id,userId); return { data: { user } }; };
  db.auth.admin.generateLink = async input => {
    assert.equal(input.email, 'original@example.com'); events.push('generate');
    return { data: { properties: { hashed_token: 'one-time-proof' } } };
  };
  const anon = { auth: { verifyOtp: async input => {
    assert.equal(input.token_hash,'one-time-proof'); events.push('verify');
    return { data: { user: { id: userId }, session: { access_token: 'test-access', refresh_token: 'test-refresh' } } };
  } } };
  const handler = createHandler({ env, createClient: (_, key) => key === 'test-server' ? db : anon, providers: {}, fetcher: safeSettings });
  const response = await handler(request('finish', { request: row.id, verifier }));
  assert.equal(response.status,200); assert.equal((await response.json()).session.access_token,'test-access');
  assert.deepEqual(events,['atomic-finish','generate','verify']);
  user = { ...user, banned_until: '2999-01-01' }; events.length=0;
  assert.equal((await (await handler(request('finish',{ request: row.id,verifier }))).json()).error,'ACCOUNT_UNAVAILABLE');
  assert.ok(!events.includes('generate'));
  user = { ...user, banned_until: null, factors: [{status:'verified'}] }; events.length=0;
  assert.equal((await (await handler(request('finish',{ request: row.id,verifier }))).json()).error,'MFA_REQUIRED');
  assert.ok(!events.includes('generate'));
});

test('link start requires successful fresh reauthentication before creating an OAuth request', async () => {
  const db = stubDb(null);
  const anon = { auth: { getUser: async () => ({ data: { user: { id:'member', email:'member@example.com', email_confirmed_at:'2026-01-01' } } }),
    signInWithPassword: async () => ({ error: { message:'incorrect password' } }) } };
  const handler = createHandler({ env, createClient: (_,key) => key === 'test-server' ? db : anon,
    providers: { available: () => true }, fetcher: safeSettings });
  const response = await handler(request('start',{provider:'google',purpose:'link',challenge:await challenge(randomToken()),
    returnUri:'https://mallin-oi.com/account/social-callback.html',proof:{password:'wrong'}}));
  assert.equal(response.status,403); assert.equal((await response.json()).error,'INVALID_PROOF');
});

test('email-absent signup cannot redeem an OTP belonging to a different existing UUID', async () => {
  const verifier=randomToken();
  const row={id:'11111111-1111-4111-8111-111111111111',status:'ready',purpose:'login',provider:'kakao',subject:'new-sub',
    proof_email:'new@example.com',proof_user_id:'newly-created',client_challenge:await challenge(verifier),expires_at:new Date(Date.now()+10000).toISOString()};
  const db=stubDb(row);
  const anon={auth:{verifyOtp:async()=>({data:{user:{id:'preexisting-user',email:'new@example.com',email_confirmed_at:'2026-01-01'}}})}};
  const handler=createHandler({env,createClient:(_,key)=>key==='test-server'?db:anon,providers:{},fetcher:safeSettings});
  const response=await handler(request('finish',{request:row.id,verifier,otp:'123456'}));
  assert.equal((await response.json()).error,'INVALID_PROOF'); assert.deepEqual(db.calls,[]);
});

test('staged acceptance rejects non-test members before account linking', async () => {
  const db = stubDb(null);
  let passwordChecks = 0;
  const anon = { auth: { getUser: async () => ({ data: { user: { id:'other', email:'other@example.com', email_confirmed_at:'2026-01-01' } } }),
    signInWithPassword: async () => { passwordChecks++; return {}; } } };
  const restrictedEnv = key => key === 'SOCIAL_AUTH_TEST_EMAILS' ? 'tester@example.com' : env(key);
  const handler = createHandler({ env: restrictedEnv, createClient: (_,key) => key === 'test-server' ? db : anon,
    providers: { available: () => true }, fetcher: safeSettings });
  const response = await handler(request('start',{provider:'google',purpose:'link',challenge:await challenge(randomToken()),
    returnUri:'https://mallin-oi.com/account/social-callback.html',proof:{password:'not-used'}}));
  assert.equal(response.status,403); assert.equal((await response.json()).error,'TEST_RESTRICTED');
  assert.equal(passwordChecks,0); assert.deepEqual(db.calls,[]);
});
