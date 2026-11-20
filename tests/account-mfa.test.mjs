import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { hasSecondFactor, hasNativeSecondFactor, restoreSecondFactor, usesEmailMfa, sessionAllowsAccess, mfaEnabled, safeMfaReturn } from '../assets/js/modules/mfa-session.js';

const claims = (aal, sub = 'member') => ({
  access_token: 'test.' + Buffer.from(JSON.stringify({ aal, sub, session_id: 'session' })).toString('base64url') + '.test',
  user: { id: 'member', app_metadata: { mallinoi_mfa_method: 'totp' } },
});

test('primary and malformed sessions never count as completed second factors', () => {
  assert.equal(hasSecondFactor(claims('aal1')), false);
  assert.equal(hasSecondFactor(claims('aal2', 'another-member')), false);
  assert.equal(hasSecondFactor({ user: { id: 'member' } }), false);
  assert.equal(hasSecondFactor(claims('aal2')), true);
});

test('optional protection follows verified enrollment, never pending QR setups or editable profile fields', () => {
  const session = claims('aal1');
  session.user.app_metadata = {mallinoi_auth: {kind: 'social'}};
  session.user.user_metadata = {mallinoi_mfa_method: 'totp'};
  session.user.factors = [{status: 'unverified'}];
  assert.equal(mfaEnabled(session.user), false);
  assert.equal(sessionAllowsAccess(session), true);
  session.user.factors[0].status = 'verified';
  assert.equal(sessionAllowsAccess(session), false);
  session.user.factors = [];
  session.user.app_metadata = {mallinoi_mfa_method: 'email'};
  assert.equal(sessionAllowsAccess(session), false);
  assert.equal(sessionAllowsAccess(null), false);
});

test('post-verification destinations stay on site and discard callback credentials', () => {
  const base = 'https://member.test/account/mfa.html';
  for (const url of ['https://other.test', '//other.test', 'https://member.test//other.test',
    'javascript:alert(1)', '/account/mfa.html', '/account/social-callback.html#request=secret']) {
    assert.equal(safeMfaReturn(url, base, '/index.html'), '/index.html');
  }
  assert.equal(safeMfaReturn('/account/reset-password.html?app=calendar&code=secret#access_token=secret', base, '/'), '/account/reset-password.html?app=calendar');
  assert.equal(safeMfaReturn('/post.html?id=4#comments', base, '/'), '/post.html?id=4#comments');
});

const source = (await readFile(new URL('../assets/js/modules/mfa.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');

async function fixture(mode, factors, session = claims('aal2')) {
  const fields = new Map();
  function field(key) {
    if (!fields.has(key)) fields.set(key, { value: '', hidden: true, textContent: '',
      add(option) { if (!this.value) this.value = option.value; }, focus() {}, removeAttribute() {} });
    return fields.get(key);
  }
  const form = { isConnected: true, querySelector: key => field(key),
    replaceChildren() { this.querySelector = () => null; } };
  const root = { querySelector: () => form };
  const calls = [], completed = [];
  const supabase = { auth: {
    getUser: async () => ({ data: { user: { id: 'member', app_metadata: { mallinoi_auth: { kind: 'social' } }, factors } } }),
    mfa: {
      enroll: async options => { calls.push(options); return { data: { id: 'new', totp: { qr_code: 'data:image/svg+xml,qr', secret: 'test' } } }; },
      challengeAndVerify: async args => {
        calls.push(args);
        return args.code === '123456' ? { data: session } : { error: { code: 'mfa_verification_failed' } };
      },
    },
  } };
  const mount = runInNewContext(source + '\nmountMfa', {
    supabase, hasNativeSecondFactor, usesEmailMfa, Option: class { constructor(_, value) { this.value = value; } }, crypto,
  });
  await mount(root, { userId: 'member', mode, onVerified: id => completed.push(id) });
  const submit = () => form.onsubmit({ preventDefault() {} });
  return { calls, completed, submit, field: key => field('[data-' + key + ']') };
}

const totp = [{ id: 'first', factor_type: 'totp', status: 'verified' }];
test('setup only succeeds after verifying the newly enrolled authenticator', async () => {
  const view = await fixture('activate', []);
  assert.equal(view.calls.length, 0);
  await view.submit();
  assert.equal(view.calls[0].factorType, 'totp');
  assert.equal(view.field('setup').hidden, false);
  assert.deepEqual(view.completed, []);
  view.field('code').value = '000000';
  await view.submit();
  assert.deepEqual(view.completed, []);
  view.field('code').value = '123456';
  await view.submit();
  assert.deepEqual(view.completed, ['new']);
});
for (const mode of ['login', 'entry']) {
  test(mode + ' requires proof from a verified factor for the same account', async () => {
    for (const [session, expected] of [[claims('aal1'), []], [claims('aal2', 'another'), []], [claims('aal2'), ['first']]]) {
      const view = await fixture(mode, totp, session);
      view.field('code').value = '123456';
      await view.submit();
      assert.equal(view.calls.length, 1);
      assert.equal(view.calls[0].factorId, 'first');
      assert.deepEqual(view.completed, expected);
    }
  });
}

test('social login forwards the provider session to second-factor verification before navigating back', async () => {
  const code = (await readFile(new URL('../assets/js/modules/social-auth.js', import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+';\n/gm, '').replace(/^export /gm, '');
  const events = [];
  const accept = runInNewContext(code + '\nacceptSocialResult', {
    localStorage: { removeItem() {} },
    clearMypageVerified: () => events.push('clear'),
    supabase: { auth: { setSession: async () => { events.push('primary'); return { error: null }; } } },
    saveLoginPolicy() {}, homeHref: () => '/index.html', consumeRedirect: () => '/work.html',
    beginSecondFactor: destination => events.push(['mfa', destination]),
  });
  await accept({ session: { access_token: 'first-factor', refresh_token: 'test' } });
  assert.deepEqual(events, ['clear', 'primary', ['mfa', '/work.html']]);
});

test('email routing requires the password session confirmed by the server and never persists across logins', async () => {
  function member(id, method='password', aal='aal1') {
    const body = {sub:'member',session_id:id,aal,amr:[{method}]};
    return { user: {id:'member',email:'member@example.test'},
      access_token:'x.'+Buffer.from(JSON.stringify(body)).toString('base64url')+'.x' };
  }
  const one = member('first');
  const allow = {rpc: async () => ({data:'first'})};
  assert.equal(hasSecondFactor(one),false);
  assert.equal(await restoreSecondFactor(member('first','otp'),allow),false);
  assert.equal(await restoreSecondFactor(one,{rpc:async()=>({error:{code:'42501'}})}),false);
  assert.equal(await restoreSecondFactor(one,{rpc:async()=>({data:'different-session'})}),false);
  assert.equal(await restoreSecondFactor(one,allow),true);
  assert.equal(hasSecondFactor(one),true);
  assert.equal(hasSecondFactor(member('other','password','aal2')),false);
  assert.equal(hasSecondFactor({...one,user:{...one.user,email:'changed@example.test'}}),false);
});
