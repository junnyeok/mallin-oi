// Isolated PostgreSQL + signed OIDC tests. Usage: node tests/social-auth-integration.mjs /absolute/temp/node_modules
// Install @electric-sql/pglite and jose in an external temporary directory, never production DB.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createProviders } from '../supabase/functions/social-auth/providers.mjs';
const modules = process.argv[2];
assert.ok(modules && path.isAbsolute(modules), 'Supply an absolute temporary node_modules path');
const { PGlite } = await import(pathToFileURL(path.join(modules, '@electric-sql/pglite/dist/index.js')));
const jose = await import(pathToFileURL(path.join(modules, 'jose/dist/webapi/index.js')));
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users (id uuid primary key, email text unique,
      encrypted_password text, email_confirmed_at timestamptz);`);
  const sql = await readFile(new URL('../supabase-SQLEditor/20261018-social-account-links.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql); // Reapplication must be safe.
  const u1 = '11111111-1111-4111-8111-111111111111', u2 = '22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users values ($1,$2,$3,now()),($4,$5,$6,now())', [u1,'a@example.test','',u2,'b@example.test','hash']);
  const req = async (provider, subject, user = u1, purpose = 'link') => (await db.query(`insert into public.social_auth_requests
    (provider,purpose,target_user_id,state_hash,client_challenge,provider_verifier,nonce,return_uri,status,subject,credential_ciphertext)
    values($1,$2,$3,gen_random_uuid()::text,'proof','verifier','nonce','https://example.test','ready',$4,$5) returning id`,
    [provider,purpose,purpose === 'link' ? user : null,subject,provider === 'apple' ? 'encrypted' : null])).rows[0].id;
  const finish = (r, u = u1, proof = 'proof') => db.query('select public.social_auth_finish($1,$2,$3)', [r,proof,u]);
  const google = await req('google','google-1');
  await assert.rejects(finish(google,u1,'stolen-proof'), /INVALID_OR_USED_REQUEST/);
  await assert.rejects(finish(google,u2), /ACCOUNT_MISMATCH/);
  await finish(google); await assert.rejects(finish(google), /INVALID_OR_USED_REQUEST/);
  await assert.rejects(db.query('select public.social_auth_unlink($1,$2)',[u1,'google']), /LAST_LOGIN_METHOD/);
  const duplicate = await req('google','google-1',u2);
  await assert.rejects(finish(duplicate,u2), /IDENTITY_ALREADY_LINKED/);
  const secondGoogle = await req('google','google-2');
  await assert.rejects(finish(secondGoogle), /duplicate key/);
  const expired = await req('kakao','kakao-1');
  await db.query("update public.social_auth_requests set expires_at=now()-interval '1 second' where id=$1", [expired]);
  await assert.rejects(finish(expired), /INVALID_OR_USED_REQUEST/);
  const apple = await req('apple','apple-1'); await finish(apple);
  await db.query('select public.social_auth_unlink($1,$2)', [u1,'apple']);
  assert.equal((await db.query('select count(*)::int n from public.social_auth_revocations')).rows[0].n,1);
  const retry = await req('apple','apple-1'); await assert.rejects(finish(retry), /REVOCATION_PENDING/);
  await db.exec('delete from public.social_auth_revocations'); await finish(retry);
  const owner = (await db.query('select user_id from public.social_account_links where provider=$1 and subject=$2',['google','google-1'])).rows[0].user_id;
  assert.equal(owner,u1); // The preexisting UUID is preserved.
  assert.equal((await db.query("select public.social_auth_rate_limit('test',1) allowed")).rows[0].allowed,true);
  assert.equal((await db.query("select public.social_auth_rate_limit('test',1) allowed")).rows[0].allowed,false);
  for (const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.exec('select * from public.social_account_links'), /permission denied/);
    await assert.rejects(db.query('select public.social_auth_unlink($1,$2)',[u1,'google']), /permission denied/);
    await db.exec('reset role');
  }
  await db.query('delete from auth.users where id=$1',[u1]);
  assert.equal((await db.query('select count(*)::int n from public.social_account_links')).rows[0].n,0);
  console.log('PostgreSQL: migration/reapply, explicit UUID binding, replay/expiry, uniqueness, last-method guard, revocation queue, rate limit, role grants, cascade deletion passed.');
} finally { await db.close(); }

const { privateKey, publicKey } = await jose.generateKeyPair('RS256');
const env = key => ({ SOCIAL_GOOGLE_CLIENT_ID: 'google-client', SOCIAL_GOOGLE_CLIENT_SECRET: 'secret' })[key] || '';
const sign = (claims, audience = 'google-client', issuer = 'https://accounts.google.com', expiry = '2m') =>
  new jose.SignJWT(claims).setProtectedHeader({ alg: 'RS256' }).setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime(expiry).sign(privateKey);
let token = await sign({ sub: 'stable-sub', nonce: 'expected', email: 'u@example.test', email_verified: true });
const providers = createProviders(env, { ...jose, createRemoteJWKSet: () => publicKey }, async () => Response.json({ id_token: token }));
const exchange = () => providers.exchange('google', { nonce: 'expected', provider_verifier: 'verifier' }, 'code', 'https://auth.example.test/callback');
assert.equal((await exchange()).subject,'stable-sub');
token = await sign({ sub: 'stable-sub', nonce: 'expected' }, 'attacker'); await assert.rejects(exchange());
token = await sign({ sub: 'stable-sub', nonce: 'expected' }, 'google-client', 'https://evil.test'); await assert.rejects(exchange());
token = await sign({ sub: 'stable-sub', nonce: 'expected' }, 'google-client', 'https://accounts.google.com', '-1m'); await assert.rejects(exchange());
token = await sign({ sub: 'stable-sub', nonce: 'other' }); await assert.rejects(exchange(), /NONCE_MISMATCH/);
const tampered = token.split('.'); tampered[1] = Buffer.from(JSON.stringify({ sub:'attacker',nonce:'expected' })).toString('base64url'); token=tampered.join('.');
await assert.rejects(exchange());
console.log('Signed OIDC: valid token accepted; wrong audience, issuer, expiration, nonce and tampered signature rejected.');
