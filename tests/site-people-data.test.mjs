import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const code=(await readFile(new URL('../assets/js/modules/site-people-data.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'').replaceAll('export ','');
function setup({loggedIn=false,rpcError=null}={}) {
 const calls=[];
 const request={async in(){return {data:[{id:'one',equipped_character_image_url:'/today-skin.png',equipped_profile_frame_item_id:'BF-03'}]};},select(...args){calls.push(['select',...args]);return this;},ilike(...args){calls.push(['ilike',...args]);return this;},order(...args){calls.push(['order',...args]);return this;},async range(...args){calls.push(['range',...args]);return {data:[{id:'member-1',nickname:'오이',profile_image_url:'/avatar.png',equipped_character_image_url:'/skin.png',equipped_character_effect_item_id:'cha-fall-01',equipped_profile_background_item_id:'BG-06',equipped_profile_frame_item_id:'BF-01'}],count:43};}};
 const supabase={from(name){calls.push(['from',name]);return request;},auth:{getSession:async()=>({data:{session:loggedIn?{user:{id:'me'}}:null}})},rpc:async(...args)=>{calls.push(['rpc',...args]);if(args[0]==='get_site_stats')return {data:[{member_count:43,today_visit_count:2}],error:null};return {data:{items:[{user_id:'one',nickname:'방문회원',avatar_url:'/visit.png'}],total:2,guestCount:3,date:'2026-11-17'},error:rpcError};}};
 const api=vm.runInNewContext(code+';({loadSitePeople,escapeNicknameSearch})',{supabase,initSiteStats:async()=>{}});return {api,calls};
}
test('members use only public avatar fields and escape wildcard nickname searches',async()=>{
 const {api,calls}=setup();const result=await api.loadSitePeople({search:'%_',offset:-4,limit:100});
 assert.equal(calls.find(c=>c[0]==='order')[1],'total_xp');assert.equal(calls.find(c=>c[0]==='order')[2].ascending,false);assert.equal(result.total,43);assert.equal(result.items[0].avatar_url,'/avatar.png');
 assert.equal(calls[0][1],'public_member_levels');assert.match(calls.find(c=>c[0]==='select')[1],/^id,nickname,profile_image_url,equipped_character_image_url,/);
 assert.equal(result.items[0].character_image_url,'/skin.png');assert.equal(result.items[0].frame_item_id,'BF-01');
 assert.equal(calls.find(c=>c[0]==='ilike')[2],'%\\%\\_%');assert.equal(calls.find(c=>c[0]==='range')[2],47);
});
test('today guests get a login gate without requesting visit identities',async()=>{
 const {api,calls}=setup();const result=await api.loadSitePeople({view:'today'});
 assert.equal(result.access,'login_required');assert.equal(calls.length,0);
});
test('logged-in visitors use the restricted current-day RPC and normalize its public results',async()=>{
 const {api,calls}=setup({loggedIn:true});const result=await api.loadSitePeople({view:'today',search:'오이',offset:24});
 assert.equal(result.items[0].user_id,'one');assert.equal(result.items[0].character_image_url,'/today-skin.png');assert.equal(result.items[0].frame_item_id,'BF-03');assert.equal(result.guestCount,3);assert.equal(result.todayVisitCount,2);assert.equal(result.date,'2026-11-17');
 assert.equal(calls[0][1],'get_today_site_people');assert.equal(calls[0][2].p_offset,24);
});
test('expired server authorization returns a login gate',async()=>{
 const {api}=setup({loggedIn:true,rpcError:{code:'42501'}});assert.equal((await api.loadSitePeople({view:'today'})).access,'login_required');
});
