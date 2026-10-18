import { PROVIDERS, AuthError, demand, validateProfile, randomToken,
  challenge, validateReturnUri, validateVerifier, authorizeRequest, loginDecision, safeProviderFailure, socialAccount, socialAccountEmail } from './policy.mjs';

// Credentials and provider responses must never be logged or returned in error messages.
export function createHandler({ env, createClient, providers, fetcher = fetch }) {
  const list = name => env(name).split(',').map(s => s.trim()).filter(Boolean);
  const active = () => env('SOCIAL_AUTH_ENABLED') === 'true';
  function allowTestEmail(email) {
    const testers = list('SOCIAL_AUTH_TEST_EMAILS').map(e => e.toLowerCase());
    demand(!testers.length || testers.includes((email || '').trim().toLowerCase()), 'TEST_RESTRICTED', 403);
  }
  const client = key => createClient(env('SUPABASE_URL'), key,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const admin = () => client(env('MALLINOI_SERVICE_ROLE_KEY'));
  const auth = () => client(env('SUPABASE_ANON_KEY'));
  const callback = provider => `${env('SUPABASE_URL')}/functions/v1/social-auth/callback/${provider}`;
  function checked(result) {
    if (result.error) {
      const safe = ['ACCOUNT_LINKING_DISABLED', 'ACCOUNT_MISMATCH', 'SOCIAL_ACCOUNT_REQUIRED', 'LAST_LOGIN_METHOD', 'IDENTITY_ALREADY_LINKED', 'REVOCATION_PENDING', 'INVALID_OR_USED_REQUEST', 'PROVIDER_REVOKED'];
      throw new AuthError(result.error.code === '23505' ? 'ACCOUNT_CONFLICT' :
        safe.includes(result.error.message) ? result.error.message : 'SERVER_REQUEST_FAILED', 409);
    }
    return result.data;
  }
  async function verifyAuthConfiguration() {
    const response = await fetcher(`${env('SUPABASE_URL')}/auth/v1/settings`, {
      headers: { apikey: env('SUPABASE_ANON_KEY') }, redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    demand(response.ok, 'NOT_CONFIGURED', 503);
    const settings = await response.json();
    // Direct Supabase provider endpoints could merge these independent accounts by email.
    demand(settings.external && PROVIDERS.every(p => settings.external[p] === false), 'UNSAFE_AUTH_CONFIGURATION', 503);
  }
  async function rpc(db, name, args) { return checked(await db.rpc(name, args)); }
  async function userInfo(db, id, email = null) {
    return (await rpc(db, 'social_auth_user', { p_id: id || null, p_email: email }))?.[0] || null;
  }
  async function currentUser(req) {
    const jwt = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data, error } = await auth().auth.getUser(jwt);
    demand(!error && data?.user?.id, 'LOGIN_REQUIRED', 401);
    allowTestEmail(socialAccount(data.user)?.contact_email || data.user.email);
    return data.user;
  }
  async function rate(db, req, action, who = '') {
    // Gateway-supplied IP; no raw address or email is persisted.
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    // Account/email limits must survive an IP change; the caller also applies an IP limit.
    const subject = who ? `identity:${who}` : `ip:${ip}`;
    const bucket = await challenge(`${env('MALLINOI_SERVICE_ROLE_KEY')}:${action}:${subject}`);
    demand(await rpc(db, 'social_auth_rate_limit', { p_bucket: bucket,
      p_limit: action.includes('email') ? 5 : 20 }), 'RATE_LIMIT', 429);
  }
  async function reauthenticate(db, user, proof) {
    demand(user.email && user.email_confirmed_at, 'VERIFIED_ACCOUNT_REQUIRED');
    demand(!user.factors?.some(f => f.status === 'verified'), 'MFA_REQUIRED', 403);
    const a = auth();
    let result;
    if (proof?.password) {
      demand(typeof proof.password === 'string' && proof.password.length <= 1024, 'INVALID_PROOF');
      result = await a.auth.signInWithPassword({ email: user.email, password: proof.password });
    } else {
      demand(/^\d{6,10}$/.test(proof?.otp || ''), 'REAUTHENTICATION_REQUIRED', 403);
      result = await a.auth.verifyOtp({ email: user.email, token: proof.otp, type: 'email' });
    }
    const valid = !result.error && result.data?.user?.id === user.id;
    if (result.data?.session) await a.auth.signOut({ scope: 'local' });
    demand(valid, 'INVALID_PROOF', 403);
  }
  async function loadRequest(db, body) {
    demand(/^[0-9a-f-]{36}$/i.test(body.request || ''), 'INVALID_REQUEST');
    const row = checked(await db.from('social_auth_requests').select('*').eq('id', body.request).maybeSingle());
    return authorizeRequest(row, body.verifier);
  }
  async function existingAccount(db, row) {
    return checked(await db.from('social_login_accounts').select('user_id,provider,subject')
      .eq('provider', row.provider).eq('subject', row.subject).maybeSingle());
  }
  async function sessionFor(db, userId) {
    const { user } = checked(await db.auth.admin.getUserById(userId));
    demand(user?.email && user.email_confirmed_at &&
      (!user.banned_until || new Date(user.banned_until).getTime() <= Date.now()), 'ACCOUNT_UNAVAILABLE', 403);
    demand(!user.factors?.some(f => f.status === 'verified'), 'MFA_REQUIRED', 403);
    // Public OAuth endpoints remain disabled. A verified provider mapping, not email equality,
    // authorizes this server-side, single-use session exchange. No email is sent by generateLink.
    const link = checked(await db.auth.admin.generateLink({ type: 'magiclink', email: user.email }));
    const a = auth();
    const verified = checked(await a.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' }));
    demand(verified.user?.id === userId && verified.session, 'ACCOUNT_MISMATCH', 403);
    return verified.session;
  }
  async function independentUser(db, row, body) {
    const metadata = validateProfile(body);
    const email = await socialAccountEmail(row.provider, row.subject);
    allowTestEmail(row.verified_email);
    let existing = await userInfo(db, null, email);
    if (!existing) {
      const result = await db.auth.admin.createUser({ id: row.id, email, email_confirm: true, user_metadata: metadata,
        app_metadata: { mallinoi_auth: { kind: 'social', provider: row.provider,
          subject: row.subject, contact_email: row.verified_email || null } } });
      if (!result.error) existing = result.data.user;
      else {
        // Recover only this provider identity after a concurrent creation/interrupted finish.
        existing = await userInfo(db, null, email);
        if (!existing) checked(result);
      }
    }
    const { user } = checked(await db.auth.admin.getUserById(existing.id));
    const account = socialAccount(user);
    demand(account?.provider === row.provider && account.subject === row.subject && user.email === email,
      'ACCOUNT_MISMATCH', 403);
    return user.id;
  }
  return async function handle(req) {
    const url = new URL(req.url);
    const isCallback = /\/callback\/(google|kakao|apple)$/.test(url.pathname);
    const origin = req.headers.get('Origin') || '';
    const allowedOrigin = list('SOCIAL_ALLOWED_ORIGINS').includes(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Vary': 'Origin' };
    if (allowedOrigin) headers['Access-Control-Allow-Origin'] = origin;
    const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers });
    const returnToClient = row => {
      const destination = new URL(validateReturnUri(row.return_uri, list('SOCIAL_RETURN_URIS')));
      destination.hash = new URLSearchParams({ request: row.id }).toString();
      return new Response(null, { status: 303, headers: { ...headers, Location: destination.href } });
    };
    if (req.method === 'OPTIONS') return new Response(null, { status: allowedOrigin ? 204 : 403, headers });
    try {
      demand(active(), 'NOT_CONFIGURED', 503);
      demand(env('MALLINOI_SERVICE_ROLE_KEY') && env('SUPABASE_ANON_KEY') && env('SUPABASE_URL'), 'NOT_CONFIGURED', 503);
      const db = admin();
      if (isCallback) {
        demand(['GET', 'POST'].includes(req.method), 'METHOD_NOT_ALLOWED', 405);
        const raw = req.method === 'POST' ? await req.text() : url.search;
        demand(raw.length <= 8192, 'REQUEST_TOO_LARGE', 413);
        const params = req.method === 'POST' ? new URLSearchParams(raw) : url.searchParams;
        const state = validateVerifier(params.get('state'));
        const provider = url.pathname.split('/').at(-1);
        const row = checked(await db.from('social_auth_requests').update({ status: 'processing' })
          .eq('state_hash', await challenge(state)).eq('provider', provider).eq('status', 'pending')
          .gt('expires_at', new Date().toISOString()).select('*').maybeSingle());
        if (!row) {
          // Return known expired/replayed requests to the original client for its error UI.
          // Never exchange the code or extend the request's lifetime on this path.
          const previous = checked(await db.from('social_auth_requests').select('id,return_uri')
            .eq('state_hash', await challenge(state)).eq('provider', provider).maybeSingle());
          demand(previous, 'EXPIRED_REQUEST');
          return returnToClient(previous);
        }
        try {
          demand(!params.has('error') && params.get('code'), 'PROVIDER_CANCELLED');
          const identity = await providers.exchange(provider, row, params.get('code'), callback(provider));
          checked(await db.from('social_auth_requests').update({ ...identity, status: 'ready', provider_verifier: '' })
            .eq('id', row.id));
        } catch (error) {
          checked(await db.from('social_auth_requests').update({ status: 'failed', error_code: safeProviderFailure(error),
            provider_verifier: '', nonce: '' }).eq('id', row.id));
        }
        return returnToClient(row);
      }
      demand(allowedOrigin, 'ORIGIN_NOT_ALLOWED', 403);
      demand(req.method === 'POST', 'METHOD_NOT_ALLOWED', 405);
      demand((req.headers.get('Content-Type') || '').startsWith('application/json'), 'INVALID_CONTENT_TYPE');
      const raw = await req.text();
      demand(raw.length <= 8192, 'REQUEST_TOO_LARGE', 413);
      const body = JSON.parse(raw);
      const action = body.action;
      demand(!['unlink', 'password', 'email-send'].includes(action), 'ACCOUNT_LINKING_DISABLED');
      demand(['config','list','reauth-email','reauth','start','inspect','finish'].includes(action), 'INVALID_ACTION');
      if (['config','start','finish'].includes(action)) await verifyAuthConfiguration();
      demand(await rpc(db, 'social_auth_account_mode', {}) === 'separate', 'ACCOUNT_MIGRATION_REQUIRED', 503);
      if (action === 'config') return json({ providers: PROVIDERS.filter(p => providers.available(p)), accountMode: 'separate' });
      await rate(db, req, action || 'invalid');

      if (['list','reauth-email','reauth'].includes(action)) {
        const user = await currentUser(req);
        await rate(db, req, action, user.id);
        const account = socialAccount(user);
        const info = await userInfo(db, user.id);
        if (action === 'list') return json({ provider: account?.provider || null,
          hasPassword: !account && info?.has_password === true,
          email: account ? account.contact_email || '' : user.email, accountMode: 'separate' });
        demand(!account, 'SOCIAL_REAUTH_REQUIRED', 403);
        if (action === 'reauth-email') {
          demand(user.email_confirmed_at, 'VERIFIED_ACCOUNT_REQUIRED');
          checked(await auth().auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } }));
          return json({ sent: true });
        }
        await reauthenticate(db, user, body.proof);
        return json({ verified: true });
      }
      if (action === 'start') {
        demand(PROVIDERS.includes(body.provider) && providers.available(body.provider), 'PROVIDER_UNAVAILABLE', 503);
        demand(body.purpose !== 'link', 'ACCOUNT_LINKING_DISABLED');
        demand(['login','reauth'].includes(body.purpose), 'INVALID_PURPOSE');
        demand(/^[A-Za-z0-9_-]{43}$/.test(body.challenge || ''), 'INVALID_CHALLENGE');
        const returnUri = validateReturnUri(body.returnUri, list('SOCIAL_RETURN_URIS'));
        let user = null;
        if (body.purpose === 'reauth') {
          user = await currentUser(req);
          demand(socialAccount(user)?.provider === body.provider, 'ACCOUNT_MISMATCH', 403);
        }
        const state = randomToken();
        const row = checked(await db.from('social_auth_requests').insert({ provider: body.provider,
          purpose: body.purpose, target_user_id: user?.id || null, client_challenge: body.challenge,
          state_hash: await challenge(state), nonce: randomToken(), provider_verifier: randomToken(), return_uri: returnUri,
        }).select('*').single());
        return json({ request: row.id, url: await providers.authorize(body.provider, row, state, callback(body.provider)) });
      }
      const row = await loadRequest(db, body);
      demand(row.status === 'ready', row.error_code || 'AUTHORIZATION_PENDING');
      demand(row.purpose !== 'link', 'ACCOUNT_LINKING_DISABLED');
      const account = await existingAccount(db, row);
      if (row.purpose === 'reauth') {
        const user = await currentUser(req);
        demand(row.target_user_id === user.id && account?.user_id === user.id &&
          socialAccount(user)?.provider === row.provider, 'ACCOUNT_MISMATCH', 403);
      }
      if (action === 'inspect') return json({ purpose: row.purpose, provider: row.provider,
        decision: row.purpose === 'reauth' ? 'reauth' : loginDecision(account),
        email: row.verified_email || '', emailRequired: false, accountMode: 'separate' });
      demand(action === 'finish', 'INVALID_ACTION');
      const userId = account?.user_id || await independentUser(db, row, body);
      const { user } = checked(await db.auth.admin.getUserById(userId));
      const identity = socialAccount(user);
      demand(identity?.provider === row.provider && identity.subject === row.subject, 'ACCOUNT_MISMATCH', 403);
      allowTestEmail(identity.contact_email);
      await rpc(db, 'social_auth_finish', { p_request: row.id, p_challenge: await challenge(body.verifier), p_user: userId });
      return json(row.purpose === 'reauth' ? { verified: true } : { session: await sessionFor(db, userId) });
    } catch (error) {
      return json({ error: error instanceof AuthError ? error.code : 'AUTH_FAILED' },
        error instanceof AuthError ? error.status : 500);
    }
  };
}
