// Isolated SQL + real broker logic; never connects to Supabase or sends mail.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHandler } from '../supabase/functions/social-auth/service.mjs';
import { challenge, randomToken, socialAccountEmail } from '../supabase/functions/social-auth/policy.mjs';
const modules = process.argv[2];
assert.ok(modules && path.isAbsolute(modules));
const { PGlite } = await import(pathToFileURL(path.join(modules, '@electric-sql/pglite/dist/index.js')));
const db = new PGlite();
const legacy = '11111111-1111-4111-8111-111111111111';
const sessionTokens = new Map();
let signedIn = null;
let creations = 0;
const sql = (query, args = []) => db.query(query, args);
const userById = async id => {
  const row = (await sql('select * from auth.users where id=$1', [id])).rows[0];
  return row && { ...row, app_metadata: row.raw_app_meta_data, user_metadata: row.raw_user_meta_data };
};
const wrap = async operation => { try { return { data: await operation() }; } catch (error) { return { error }; } };
const admin = {
  from(table) {
    const filters = [], values = [];
    const chain = { select() { return chain; }, eq(key, value) { values.push(value); filters.push(`${key}=$${values.length}`); return chain; },
      maybeSingle: () => wrap(async () => (await sql(`select * from ${table} where ${filters.join(' and ')}`, values)).rows[0] || null) };
    return chain;
  },
  rpc(name, args = {}) {
    return wrap(async () => {
      const entries = Object.entries(args);
      const rows = (await sql(`select * from public.${name}(${entries.map(([k], i) => `${k} => $${i+1}`).join(',')})`, entries.map(([,v])=>v))).rows;
      return ['social_auth_account_mode','social_auth_rate_limit'].includes(name) ? rows[0][name] : rows;
    });
  },
  auth: { admin: {
    getUserById: id => wrap(async () => ({ user: await userById(id) })),
    createUser: input => wrap(async () => {
      creations++;
      const id = crypto.randomUUID();
      await sql('insert into auth.users(id,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values($1,$2,now(),$3,$4)',
        [id,input.email,input.app_metadata,input.user_metadata]);
      return { user: await userById(id) };
    }),
    generateLink: ({ email }) => wrap(async () => {
      const row = (await sql('select id from auth.users where email=$1',[email])).rows[0];
      const token = randomToken(); sessionTokens.set(token,row.id);
      return { properties: { hashed_token: token } };
    }),
  } },
};
const anonymous = { auth: {
  getUser: async () => ({ data: { user: await userById(signedIn) } }),
  verifyOtp: async ({ token_hash }) => {
    assert.ok(sessionTokens.has(token_hash));
    const id = sessionTokens.get(token_hash); sessionTokens.delete(token_hash);
    return { data: { user: await userById(id), session: { access_token: id, refresh_token:'test-only' } } };
  },
} };
const env = name => ({ SOCIAL_AUTH_ENABLED:'true', MALLINOI_SERVICE_ROLE_KEY:'test-server',
  SUPABASE_ANON_KEY:'test-public', SUPABASE_URL:'https://auth.example.test',
  SOCIAL_ALLOWED_ORIGINS:'https://example.test', SOCIAL_RETURN_URIS:'https://example.test/account/social-callback.html' })[name] || '';
const handler = createHandler({ env, createClient: (_, key) => key === 'test-server' ? admin : anonymous,
  providers: { available: () => true }, fetcher: async () => Response.json({ external:{ google:false,kakao:false,apple:false } }) });
const call = async (action, payload) => {
  const response = await handler(new Request('https://auth.example.test/functions/v1/social-auth', {
    method:'POST', headers:{ Origin:'https://example.test', 'Content-Type':'application/json' }, body:JSON.stringify({ action,...payload }) }));
  return { status:response.status, ...await response.json() };
};
const request = async (provider, subject, email = 'same@example.test', purpose = 'login', target = null) => {
  const verifier = randomToken();
  const row = (await sql(`insert into social_auth_requests(provider,subject,verified_email,purpose,target_user_id,state_hash,
    client_challenge,provider_verifier,nonce,return_uri,status,provider_authenticated_at)
    values($1,$2,$3,$4,$5,$6,$7,'unused','unused','https://example.test/account/social-callback.html','ready',now()) returning id`,
    [provider,subject,email,purpose,target,randomToken(),await challenge(verifier)])).rows[0];
  return { request:row.id,verifier };
};
const signup = { nickname:'새회원', terms:true, privacy:true };
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key,email text unique,encrypted_password text default '',
    email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}',raw_user_meta_data jsonb default '{}');
    create table profiles(id uuid primary key references auth.users(id),pickles int,nickname text);
    create table calendar_records(user_id uuid references auth.users(id),title text);
    insert into auth.users(id,email,encrypted_password,email_confirmed_at) values('${legacy}','same@example.test','original-password-hash',now());
    insert into profiles values('${legacy}',123,'원래회원'); insert into calendar_records values('${legacy}','기존 일정');`);
  for (const file of ['20261018-social-account-links.sql','20261018-social-provider-events.sql'])
    await db.exec(await readFile(new URL(`../supabase-SQLEditor/${file}`,import.meta.url),'utf8'));
  for (const provider of ['google','kakao','apple']) await sql('insert into social_account_links(user_id,provider,subject) values($1,$2,$3)',[legacy,provider,provider+'-old-subject']);
  const migration = await readFile(new URL('../supabase-SQLEditor/20261018-independent-social-accounts.sql',import.meta.url),'utf8');
  await db.exec(migration); await db.exec(migration);
  const accounts = new Map();
  for (const provider of ['google','kakao','apple']) {
    const payload = await request(provider,provider+'-old-subject',provider === 'kakao' ? null : 'same@example.test');
    assert.equal((await call('inspect',payload)).decision,'signup');
    const rejected = await call('finish',{ ...payload,nickname:'새회원' });
    assert.equal(rejected.error,'CONSENT_REQUIRED');
    const result = await call('finish',{ ...payload,...signup });
    assert.equal(result.status,200,JSON.stringify(result));
    assert.notEqual(result.session.access_token,legacy);
    accounts.set(provider,result.session.access_token);
    assert.equal((await call('finish',{ ...payload,...signup })).error,'EXPIRED_REQUEST');
    const retry = await request(provider,provider+'-old-subject','changed@example.test');
    assert.equal((await call('inspect',retry)).decision,'ready');
    assert.equal((await call('finish',retry)).session.access_token,accounts.get(provider));
  }
  assert.equal(new Set([legacy,...accounts.values()]).size,4);
  assert.deepEqual((await sql('select pickles,nickname from profiles where id=$1',[legacy])).rows,[{pickles:123,nickname:'원래회원'}]);
  assert.equal((await sql('select count(*)::int n from calendar_records where user_id=$1',[legacy])).rows[0].n,1);
  assert.equal((await sql('select count(*)::int n from social_account_links')).rows[0].n,3);
  assert.equal(creations,3);
  const google = accounts.get('google'); signedIn = google;
  const reauth = await request('google','google-old-subject',null,'reauth',google);
  assert.equal((await call('finish',reauth)).verified,true);
  const wrong = await request('google','someone-else',null,'reauth',google);
  assert.equal((await call('finish',wrong)).error,'ACCOUNT_MISMATCH');
  const oldLink = await request('google','google-old-subject',null,'link',legacy);
  assert.equal((await call('finish',oldLink)).error,'ACCOUNT_LINKING_DISABLED');
  assert.equal((await call('reauth-email',{})).error,'SOCIAL_REAUTH_REQUIRED');
  for (const action of ['unlink','password','email-send']) assert.equal((await call(action,{})).error,'ACCOUNT_LINKING_DISABLED');
  await assert.rejects(sql("update auth.users set encrypted_password='added' where id=$1",[google]),/SOCIAL_LOGIN_ONLY/);
  await assert.rejects(sql("update auth.users set email='other@example.test' where id=$1",[google]),/SOCIAL_LOGIN_ONLY/);
  await assert.rejects(sql('insert into auth.users(id,email) values($1,$2)',[crypto.randomUUID(),await socialAccountEmail('google','squat')]),/RESERVED_SOCIAL_ACCOUNT/);
  // Account creation succeeded but mapping write was interrupted: retry recovers only that identity.
  const orphanEmail = await socialAccountEmail('google','interrupted');
  const orphan = await admin.auth.admin.createUser({email:orphanEmail,user_metadata:signup,
    app_metadata:{mallinoi_auth:{kind:'social',provider:'google',subject:'interrupted'}}});
  const recovered = await call('finish',{ ...await request('google','interrupted'),...signup });
  assert.equal(recovered.session.access_token,orphan.data.user.id);
  // Notifications suspend, but do not erase ownership or reach the legacy email account.
  const apple = accounts.get('apple');
  const stamp = new Date().toISOString();
  await sql('select social_auth_receive_event($1,$2,$3,$4,$5)',['apple','event-1','apple-old-subject','consent-revoked',stamp]);
  let row=(await sql('select * from social_login_accounts where user_id=$1',[apple])).rows[0];
  assert.equal(row.user_id,apple); assert.ok(row.revoked_at);
  const fresh=await request('apple','apple-old-subject');
  await sql("update social_auth_requests set provider_authenticated_at=$2::timestamptz+interval '2 seconds' where id=$1",[fresh.request,stamp]);
  assert.equal((await call('finish',fresh)).session.access_token,apple);
  assert.equal((await sql('select revoked_at from social_login_accounts where user_id=$1',[apple])).rows[0].revoked_at,null);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.exec('select * from social_login_accounts'),/permission denied/);
    await assert.rejects(db.exec('select social_auth_account_mode()'),/permission denied/);
    await db.exec('reset role');
  }
  await sql('delete from auth.users where id=$1',[accounts.get('kakao')]);
  assert.equal((await sql('select count(*)::int n from social_login_accounts')).rows[0].n,3);
  assert.equal((await sql('select pickles from profiles where id=$1',[legacy])).rows[0].pickles,123);
  console.log('Independent accounts: migration/reapply, same-email separation, legacy data preservation, consent, direct login, reauth mismatch, removed APIs, reserved email/password protection, retry recovery, notifications, RLS and isolated deletion passed.');
} finally { await db.close(); }
