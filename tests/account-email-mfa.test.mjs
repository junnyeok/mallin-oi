import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmailMfaHandler } from '../supabase/functions/account-email-mfa/service.mjs';

function setup({ verified = true, method = 'password', kind = 'regular', app = false, mailFails = false } = {}) {
  const uid = crypto.randomUUID(), sid = crypto.randomUUID(), mailbox = 'member@example.test';
  const token = 'test.' + Buffer.from(JSON.stringify({ sub: uid, session_id: sid, amr: [{ method }] })).toString('base64url') + '.test';
  const user = { id: uid, email_confirmed_at: 'date', app_metadata: { mallinoi_auth: { kind }, mallinoi_mfa_method: app ? 'totp' : undefined } };
  let pending;
  const calls = [], deliveries = [];
  const handler = createEmailMfaHandler({
    auth: { getUser: async jwt => ({ data: { user: verified && jwt === token ? user : null } }) },
    digestKey: 'local-only-test-key',
    db: { async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'begin_account_email_mfa') {
        pending = args;
        return {data:{id:args.p_id,send:true,email:mailbox,expires_at:new Date(Date.now()+300000).toISOString()}};
      }
      if (name === 'cancel_undelivered_account_code') { pending = null; return {}; }
      return {data:pending?.p_digest === args.p_digest};
    } },
    async send(...args) { if (mailFails) throw new Error(); deliveries.push(args); },
  });
  const call = (body, bearer = token) => handler(new Request('https://example.test/mfa', {
    method:'POST',headers:{ Authorization:'Bearer '+bearer },body:JSON.stringify(body),
  }));
  return { call, calls, deliveries, mailbox };
}
test('registered mailbox receives a six-digit code and neither code nor recipient is exposed by the endpoint', async () => {
  const { call, calls, deliveries, mailbox } = setup();
  const sent = await call({action:'send',purpose:'login',email:'untrusted@example.test'});
  assert.equal(sent.status,200);
  const body=await sent.json();
  assert.deepEqual(Object.keys(body),['id','remainingMs']);
  assert.ok(body.remainingMs > 299000 && body.remainingMs <= 300000);
  const [to,code,purpose,id]=deliveries[0];
  assert.equal(to,mailbox); assert.match(code,/^\d{6}$/); assert.equal(purpose,'login'); assert.equal(id,body.id);
  assert.match(calls[0].args.p_digest,/^[a-f0-9]{64}$/);
  assert.equal((await call({action:'verify',purpose:'entry',id,code})).status,400);
  assert.equal((await call({action:'verify',purpose:'login',id:crypto.randomUUID(),code})).status,400);
  assert.deepEqual(await (await call({action:'verify',purpose:'login',id,code})).json(),{verified:true});
});
test('mail is restricted to verified password sessions whose configured second factor is email',async () => {
  for (const options of [{verified:false},{method:'otp'},{method:'recovery'},{kind:'social'},{app:true}]) {
    const {call,calls,deliveries}=setup(options);
    assert.ok((await call({action:'send',purpose:'login'})).status>=400);
    assert.equal(calls.length,0); assert.equal(deliveries.length,0);
  }
});
test('delivery failures invalidate only the pending challenge',async () => {
  const {call,calls}=setup({mailFails:true});
  const response=await call({action:'send',purpose:'login'});
  assert.equal(response.status,503); assert.equal((await response.json()).code,'MAIL_UNAVAILABLE');
  assert.equal(calls[1].name,'cancel_undelivered_account_code');
  assert.equal(calls[1].args.p_id,calls[0].args.p_id);
});
