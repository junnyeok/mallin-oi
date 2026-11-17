import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=fs.readFileSync('assets/js/modules/community-members.js','utf8').replace(/^import .*;\n/gm,'').replace('export async function initCommunityMembers','async function initCommunityMembers');
class Element {
  constructor(){this.style={values:{},setProperty(key,value){this.values[key]=value;}};this.dataset={};this.children=[];this.attrs={};this.hidden=false;this.textContent='';this.classList={add(){}};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=items;}
  setAttribute(key,value){this.attrs[key]=value;}
  addEventListener(){}
  insertAdjacentHTML(where,html){this.effectHtml=html;}
}
async function run({view='today',data,error,signOut=false,display='photo'}){
 const root=new Element();root.isConnected=true;
 const state={root,view,display,search:'',page:1,request:0};
 for(const key of ['refresh','submit','status','grid','message','pagination','totalLabel','total','guestNote','form'])state[key]=new Element();
 state.total.textContent='99';state.guestNote.hidden=false;
 let authHandler;
 const context={getProfileBackgroundByItemId:id=>id?{pcImagePath:'/background.png',mobileImagePath:'/background-mobile.png'}:null,getProfileFrameByItemId:id=>id?{pcImagePath:'/frame.png',mobileImagePath:'/frame-mobile.png'}:null,getCharacterEffectRenderMeta:id=>id?{itemId:id}:null,renderCharacterEffectHtml:effect=>'<effect>'+effect.itemId+'</effect>',cleanupCharacterEffects:()=>{},prepareCharacterEffects:()=>{},supabase:{auth:{onAuthStateChange:fn=>{authHandler=fn;}}},window:{location:{href:'https://mallin-oi.com/community-members.html?view='+view,origin:'https://mallin-oi.com'}},document:{querySelector:()=>root,body:{dataset:{page:'community-members'}},createElement:()=>new Element()},URL,console:{warn(){}},loadSitePeople:async()=>{if(error)throw error;return data;},state};
 await vm.runInNewContext(source+';states.set(state.root,state);loadPage(state);',context);
 if(signOut){
   const start=source.indexOf('    supabase.auth.onAuthStateChange(');
   const end=source.indexOf("    window.addEventListener('auth-changed'",start);
   vm.runInNewContext(source.slice(start,end),context);
   authHandler('SIGNED_OUT');
 }
 assert.equal(root.attrs['aria-busy'],'false');
 assert.equal(state.refresh.disabled,false);
 return state;
}
test('directory UI gates identities, clears stale counts, handles errors and renders safe profiles', async()=>{
 for(const access of ['login_required','admin_required']){
  const state=await run({data:{access,total:0}});
  assert.equal(state.total.textContent,'—');assert.equal(state.totalLabel.textContent,'금일 방문');assert.equal(state.guestNote.hidden,true);assert.equal(state.form.hidden,true);
 }
 for(const view of ['members','today']){
  const state=await run({view,error:new Error('offline')});
  assert.equal(state.total.textContent,'—');assert.equal(state.totalLabel.textContent,view==='today'?'금일 방문':'회원');assert.equal(state.guestNote.hidden,true);assert.equal(state.message.children[1].textContent,'다시 불러오기');
 }
 const empty=await run({view:'members',data:{access:'allowed',items:[],total:0,memberCount:43}});
 assert.equal(empty.total.textContent,'43');assert.equal(empty.guestNote.hidden,true);
 const allowed=await run({data:{access:'allowed',items:[{user_id:'id&1',nickname:'<script>',avatar_url:'javascript:alert(1)'}],total:1,todayVisitCount:3,guestCount:2,date:'2026-11-17'}});
 assert.equal(allowed.total.textContent,'3');assert.equal(allowed.guestNote.hidden,false);assert.match(allowed.guestNote.textContent,/비로그인 방문 2명/);
 const signedOut=await run({signOut:true,data:{access:'allowed',items:[{user_id:'one',nickname:'방문회원'}],total:1,guestCount:2}});
 assert.equal(signedOut.grid.children.length,0);assert.equal(signedOut.total.textContent,'—');assert.equal(signedOut.form.hidden,true);
 const link=allowed.grid.children[0].children[0];assert.equal(link.href,'./profile.html?user=id%261');assert.equal(link.children[0].src,'./images/logo-home.png');assert.equal(link.children[1].textContent,'<script>');
});

test('decorated cards render equipped character, background, frame and animated effect together',async()=>{
 const state=await run({view:'members',display:'character',data:{access:'allowed',items:[{user_id:'one',nickname:'꾸민 회원',character_image_url:'/skin.png',background_item_id:'BG-06',frame_item_id:'BF-01',effect_item_id:'cha-fall-01'}],total:1}});
 const scene=state.grid.children[0].children[0].children[0];
 assert.equal(scene.className,'people-card__scene');
 assert.equal(scene.style.values['--people-frame'],'url("/frame.png")');
 assert.equal(scene.children[0].style.values['--people-background'],'url("/background.png")');
 assert.equal(scene.children[1].children[0].src,'https://mallin-oi.com/skin.png');
 assert.match(scene.children[1].effectHtml,/cha-fall-01/);
});
