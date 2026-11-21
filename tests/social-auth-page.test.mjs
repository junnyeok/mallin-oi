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
    if (['socialSignupEmail','socialSignupPassword','socialSignupPasswordConfirm'].includes(id)) return null;
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
    routePendingSecondFactor:async()=>false,
    loginHref:()=>'/login.html',mypageHref:()=>'/mypage.html',homeHref:()=>'/index.html',
    initSocialAuthNative:async()=>{},initCalendarWidgetNavigation:async()=>false,
    startSocialLogin:async(...args)=>calls.push({start:args}),enterVerifiedAccountPage:()=>{},
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
for(const [provider,label] of [['google','Google'],['kakao','카카오'],['apple','Apple']]) for(const native of [false,true]) {
test(`${provider} ${native?'app':'web'} signup shows only nickname and consent, never email/password`,async()=>{
  const {get,calls,accepted}=await render({decision:'signup',provider,native});
  assert.equal(get('socialTitle').textContent,`${label}로 회원가입`);
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
    assert.doesNotMatch(html,new RegExp(`id="${id}"`));
  const textFields=[...html.matchAll(/<input\b[^>]*>/g)].map(match=>match[0]).filter(input=>!input.includes('type="checkbox"'));
  assert.equal(textFields.length,1);
  assert.match(textFields[0],/id="socialNickname"/);
});
}
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

const auth = (await readFile(new URL('../assets/js/modules/social-auth.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '')
  .replace(/^export /gm, '');

function startFixture({ siteApp = true, calendarApp = false, complete = request => request } = {}) {
  const request = '11111111-1111-4111-8111-111111111111';
  const providerUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
  const storage = new Map();
  const requests = [];
  const navigations = [];
  const launchUrls = [];
  const location = new URL('https://mallin-oi.com/login.html');
  location.assign = value => navigations.push(value);
  const window = { location };
  if (calendarApp) window.Capacitor = { isNativePlatform: () => true,
    Plugins: { AppLauncher: { openUrl: async ({ url }) => { launchUrls.push(url); return { completed: true }; } } } };
  if (siteApp) window.webkit = { messageHandlers: { mallinoiSite: { postMessage: async message => {
    assert.equal(message.action, 'authenticate');
    assert.equal(message.url, providerUrl);
    assert.equal(message.request, request);
    const pending = JSON.parse(storage.get('mallin:social-request:v1'));
    assert.equal(pending.request, request);
    assert.match(pending.verifier, /^[A-Za-z0-9_-]{43}$/);
    return complete(request, storage);
  } } } };
  const start = runInNewContext(auth + '\nstartSocialLogin', {
    window, URL, URLSearchParams, crypto, btoa, TextEncoder, document: { getElementById: () => null },
    resolveSitePath: path => '/' + path,
    localStorage: { setItem: (key, value) => storage.set(key, value), getItem: key => storage.get(key),
      removeItem: key => storage.delete(key) },
    supabase: { functions: { invoke: async (_, { body }) => {
      requests.push(body);
      return { data: { request, url: providerUrl } };
    } } },
  });
  return { start, request, providerUrl, requests, navigations, storage, launchUrls };
}

test('iPhone site app sends auth through the system browser and resumes in the initiating site', async () => {
  const flow = startFixture();
  await flow.start('google', 'reauth');
  assert.equal(flow.requests[0].returnUri, 'mallinoi://auth/callback');
  assert.equal(flow.requests[0].purpose, 'reauth');
  assert.deepEqual(flow.navigations, [`https://mallin-oi.com/account/social-callback.html#request=${flow.request}`]);
});

test('iPhone site app rejects mismatches and returns a retryable error after cancellation', async () => {
  const mismatch = startFixture({ complete: () => 'unmatched-request' });
  await assert.rejects(mismatch.start('google'), /REQUEST_MISMATCH/);
  assert.deepEqual(mismatch.navigations, []);
  const cancelled = startFixture({ complete: () => { throw new Error('system cancellation'); } });
  await assert.rejects(cancelled.start('google'), /PROVIDER_FAILED/);
  assert.equal(cancelled.storage.size, 0);
  assert.deepEqual(cancelled.navigations, []);
  const superseded = startFixture({ complete: (request, storage) => {
    storage.set('mallin:social-request:v1', JSON.stringify({ request: 'new-request', expires: Date.now() + 5000 }));
    return request;
  } });
  await assert.rejects(superseded.start('google'), /REQUEST_MISMATCH/);
  assert.deepEqual(superseded.navigations, []);
});

test('the ordinary website and Capacitor calendar keep their login transports', async () => {
  const web = startFixture({ siteApp: false });
  await web.start('google');
  assert.equal(web.requests[0].returnUri, 'https://mallin-oi.com/account/social-callback.html');
  assert.deepEqual(web.navigations, [web.providerUrl]);
  const calendar = startFixture({ calendarApp: true });
  await calendar.start('google');
  assert.equal(calendar.requests[0].returnUri, 'mallinoi://auth/callback');
  assert.deepEqual(calendar.launchUrls, [calendar.providerUrl]);
  assert.deepEqual(calendar.navigations, []);
});
