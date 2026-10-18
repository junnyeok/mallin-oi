import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const page = (await readFile(new URL('../assets/js/modules/social-auth-page.js',import.meta.url),'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm,'');
async function render({ purpose='login', decision='ready', provider='google', fail, savedRequest='request-1', native=false, pageType='social-callback', accountProvider=null }={}) {
  const elements = new Map();
  const calls=[],accepted=[];
  const get=id => {
    if (!elements.has(id)) elements.set(id,{hidden:['socialCompleteForm','socialManagement','socialProviderProof','socialEmailProof'].includes(id),value:'',checked:false,
      textContent:'',disabled:false,listeners:{},addEventListener(name,fn){this.listeners[name]=fn;}});
    return elements.get(id);
  };
  const context={ URLSearchParams,
    document:{body:{dataset:{page:pageType}},getElementById:get,querySelectorAll:()=>[]},
    location:{hash:'#request=request-1',href:native?'capacitor://localhost/account/social-callback.html?app=calendar':'https://example.test/account/social-callback.html'},
    SOCIAL_PROVIDERS:[['google','Google'],['kakao','카카오'],['apple','Apple']],
    pendingRequest:()=>({request:savedRequest,verifier:'private-verifier',purpose}),
    socialApi:async(action,body)=>{
      calls.push({action,body}); if(action===fail) throw new Error('EXPIRED_REQUEST');
      return action==='inspect'?{purpose,decision,provider,emailRequired:false,accountMode:'separate'}:action==='list'?{provider:accountProvider,email:'member@example.test'}:{session:{user:{id:'separate-user'}}};
    },
    acceptSocialResult:async result=>accepted.push(result),socialMessage:error=>error.message,
    supabase:{auth:{getSession:async()=>({data:{session:{user:{id:'user'}}}})}},
    loginHref:()=>'/login.html',mypageHref:()=>'/mypage.html',homeHref:()=>'/index.html',
    initSocialAuthNative:async()=>{},startSocialLogin:async(...args)=>calls.push({start:args}),enterVerifiedAccountPage:()=>{},
  };
  await runInNewContext(`(async()=>{${page}\n})()`,context);
  return {get,calls,accepted};
}
for(const provider of ['google','kakao','apple']) for(const native of [false,true]) {
  test(`${provider} ${native?'app':'web'} automatically completes the authenticated login without a second button`,async()=>{
    const {get,calls,accepted}=await render({provider,native});
    assert.deepEqual(calls.map(c=>c.action),['inspect','finish']);
    assert.equal(calls[1].body.verifier,'private-verifier');
    assert.equal(accepted.length,1); assert.equal(get('socialCompleteForm').hidden,true);
  });
}
test('new social signup requires only nickname and consent, never email/password',async()=>{
  const {get,calls,accepted}=await render({decision:'signup',provider:'kakao'});
  assert.equal(get('socialTitle').textContent,'카카오로 회원가입');
  assert.equal(get('socialCompleteForm').hidden,false);
  assert.deepEqual(calls.map(c=>c.action),['inspect']); assert.equal(accepted.length,0);
  get('socialNickname').value='새닉네임';get('socialTerms').checked=true;get('socialPrivacy').checked=true;
  get('socialCompleteForm').listeners.submit({preventDefault(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.at(-1).action,'finish');
  assert.equal(calls.at(-1).body.nickname,'새닉네임');
  for(const field of ['email','password','otp']) assert.equal(field in calls.at(-1).body,false);
  const html=await readFile(new URL('../account/social-callback.html',import.meta.url),'utf8');
  for(const id of ['socialSignupEmail','socialSignupPassword','socialSignupPasswordConfirm'])
    assert.match(html,new RegExp(`<input[^>]+id="${id}"[^>]+disabled`));
});
test('expired/replayed requests and mismatched browser state never accept a session',async()=>{
  for(const options of [{fail:'inspect'},{fail:'finish'},{savedRequest:'different'}]) {
    const result=await render(options);assert.equal(result.accepted.length,0);
    assert.equal(result.get('socialCompleteForm').hidden,true);
    assert.ok(['EXPIRED_REQUEST','REQUEST_MISMATCH'].includes(result.get('socialStatus').textContent));
  }
});
test('old account linking callback is blocked, while provider reauthentication completes automatically',async()=>{
  const blocked=await render({purpose:'link',decision:'link'});
  assert.equal(blocked.accepted.length,0);assert.equal(blocked.get('socialStatus').textContent,'ACCOUNT_LINKING_DISABLED');
  const valid=await render({purpose:'reauth',decision:'reauth'});
  assert.deepEqual(valid.calls.map(c=>c.action),['inspect','finish']);assert.equal(valid.accepted.length,1);
});
test('account verification exposes only its provider, never link or password-add controls',async()=>{
  const {get,calls}=await render({pageType:'account-verification',accountProvider:'apple'});
  assert.equal(get('socialProviderProof').hidden,false);assert.equal(get('socialEmailProof').hidden,true);
  assert.equal(get('socialProviderVerify').textContent,'Apple로 본인 확인');
  get('socialProviderVerify').listeners.click();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls.at(-1).start[0],'apple');assert.equal(calls.at(-1).start[1],'reauth');
});
