import { PROVIDERS, AuthError, demand, normalizeEmail, validateProfile, randomToken,
  challenge, validateReturnUri, validateVerifier, authorizeRequest, loginDecision, safeProviderFailure } from './policy.mjs';
import { revokePendingApple } from './revocation.mjs';

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
      const safe = ['LAST_LOGIN_METHOD', 'IDENTITY_ALREADY_LINKED', 'REVOCATION_PENDING', 'INVALID_OR_USED_REQUEST', 'PROVIDER_REVOKED'];
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
    // Direct Supabase provider endpoints would bypass this broker's explicit-link policy.
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
    allowTestEmail(data.user.email);
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
  async function existingLink(db, row) {
    return checked(await db.from('social_account_links').select('user_id,provider,subject')
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
      demand(['config','list','reauth-email','reauth','unlink','password','start','inspect','email-send','finish'].includes(action), 'INVALID_ACTION');
      if (['config','start','finish'].includes(action)) await verifyAuthConfiguration();
      if (action === 'config') return json({ providers: PROVIDERS.filter(p => providers.available(p)) });
      await rate(db, req, action || 'invalid');

      if (['list','reauth-email','reauth','unlink','password'].includes(action)) {
        const user = await currentUser(req);
        await rate(db, req, action, user.id);
        const links = checked(await db.from('social_account_links').select('*').eq('user_id', user.id));
        const info = await userInfo(db, user.id);
        if (action === 'list') {
          let revocationPending = false;
          try { await revokePendingApple(db, providers, user.id); } catch { revocationPending = true; }
          return json({ links: links.map(l => ({ provider: l.provider, created_at: l.created_at })),
            hasPassword: info?.has_password === true, email: user.email, revocationPending,
            relayDisabled: links.some(l => l.provider === 'apple' && l.email_enabled === false) && user.email.endsWith('@privaterelay.appleid.com') });
        }
        if (action === 'reauth-email') {
          demand(!user.email.endsWith('@privaterelay.appleid.com') ||
            !links.some(l => l.provider === 'apple' && l.email_enabled === false), 'RELAY_DISABLED');
          demand(user.email_confirmed_at, 'VERIFIED_ACCOUNT_REQUIRED');
          checked(await auth().auth.signInWithOtp({ email: user.email, options: { shouldCreateUser: false } }));
          return json({ sent: true });
        }
        await reauthenticate(db, user, body.proof);
        if (action === 'reauth') return json({ verified: true });
        if (action === 'password') {
          const password = body.password;
          demand(typeof password === 'string' && password.length >= 10 && password.length <= 64 &&
            /[A-Za-z]/.test(password) && /\d/.test(password) && /[^A-Za-z0-9]/.test(password), 'INVALID_PASSWORD');
          checked(await db.auth.admin.updateUserById(user.id, { password }));
          return json({ updated: true });
        }
        demand(PROVIDERS.includes(body.provider), 'INVALID_PROVIDER');
        demand(info?.has_password || links.length > 1, 'LAST_LOGIN_METHOD');
        const link = links.find(l => l.provider === body.provider);
        demand(link, 'LINK_NOT_FOUND');
        await rpc(db, 'social_auth_unlink', { p_user: user.id, p_provider: body.provider });
        let revocationPending = false;
        try { await revokePendingApple(db, providers, user.id); } catch { revocationPending = true; }
        return json({ unlinked: true, revocationPending });
      }
      if (action === 'start') {
        demand(PROVIDERS.includes(body.provider) && providers.available(body.provider), 'PROVIDER_UNAVAILABLE', 503);
        demand(['login','link'].includes(body.purpose), 'INVALID_PURPOSE');
        demand(/^[A-Za-z0-9_-]{43}$/.test(body.challenge || ''), 'INVALID_CHALLENGE');
        const returnUri = validateReturnUri(body.returnUri, list('SOCIAL_RETURN_URIS'));
        let user = null;
        if (body.purpose === 'link') {
          user = await currentUser(req);
          await rate(db, req, 'link-proof', user.id);
          await reauthenticate(db, user, body.proof);
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
      const link = await existingLink(db, row);
      const existing = row.verified_email ? await userInfo(db, null, row.verified_email) : null;
      if (action === 'inspect') return json({ purpose: row.purpose, provider: row.provider,
        decision: row.purpose === 'link' ? 'link' : loginDecision(link, existing),
        emailRequired: !row.verified_email && !link });
      if (action === 'email-send') {
        demand(row.purpose === 'login' && !link && !row.verified_email, 'EMAIL_NOT_REQUIRED');
        const email = normalizeEmail(body.email);
        allowTestEmail(email);
        const metadata = validateProfile(body);
        await rate(db, req, 'email-send', email);
        demand(!row.proof_email || row.proof_email === email, 'EMAIL_ALREADY_SELECTED');
        const claimed = checked(await db.from('social_auth_requests').update({ status: 'email-sending' })
          .eq('id', row.id).eq('status', 'ready').select('id').maybeSingle());
        demand(claimed, 'AUTHORIZATION_PENDING');
        try {
          let userId = row.proof_user_id;
          if (!userId) {
            // Create explicitly and bind the UUID. A concurrent email signup must never be
            // turned into an implicit link by signInWithOtp's create-or-login behavior.
            demand(!await userInfo(db, null, email), 'EXISTING_ACCOUNT');
            const created = checked(await db.auth.admin.createUser({ email, email_confirm: false, user_metadata: metadata }));
            userId = created.user.id;
            checked(await db.from('social_auth_requests').update({ proof_email: email, proof_user_id: userId })
              .eq('id', row.id).eq('status', 'email-sending'));
          }
          checked(await auth().auth.signInWithOtp({ email, options: { shouldCreateUser: false } }));
        } finally {
          checked(await db.from('social_auth_requests').update({ status: 'ready' }).eq('id', row.id).eq('status', 'email-sending'));
        }
        return json({ sent: true });
      }
      demand(action === 'finish', 'INVALID_ACTION');
      let userId;
      if (row.purpose === 'link') {
        const user = await currentUser(req);
        demand(user.id === row.target_user_id, 'ACCOUNT_MISMATCH', 403);
        userId = user.id;
      } else if (link) userId = link.user_id;
      else if (row.verified_email) {
        allowTestEmail(row.verified_email);
        demand(!existing, 'EXISTING_ACCOUNT');
        const metadata = validateProfile(body);
        const created = checked(await db.auth.admin.createUser({ email: row.verified_email,
          email_confirm: true, user_metadata: metadata }));
        userId = created.user.id;
      } else {
        demand(row.proof_email && row.proof_user_id && /^\d{6,10}$/.test(body.otp || ''), 'EMAIL_VERIFICATION_REQUIRED');
        const a = auth();
        const verified = checked(await a.auth.verifyOtp({ email: row.proof_email, token: body.otp, type: 'email' }));
        demand(verified.user?.id === row.proof_user_id && verified.user?.email_confirmed_at &&
          normalizeEmail(verified.user.email) === row.proof_email, 'INVALID_PROOF');
        userId = verified.user.id;
        if (verified.session) await a.auth.signOut({ scope: 'local' });
      }
      allowTestEmail((await userInfo(db, userId))?.email);
      await rpc(db, 'social_auth_finish', { p_request: row.id, p_challenge: await challenge(body.verifier), p_user: userId });
      return json(row.purpose === 'link' ? { linked: true } : { session: await sessionFor(db, userId) });
    } catch (error) {
      return json({ error: error instanceof AuthError ? error.code : 'AUTH_FAILED' },
        error instanceof AuthError ? error.status : 500);
    }
  };
}
