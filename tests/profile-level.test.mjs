import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
const code=(await readFile('assets/js/modules/profile-level.js','utf8')).replace(/^import .*;\n/gm,'').replace('export ','');
function setup(reply){
 const fields={}; const calls=[];
 const root={hidden:false,isConnected:true,querySelector:key=>fields[key] ||= {setAttribute(k,v){this[k]=v;}}};
 const request={select(s){calls.push(s);return this;},eq(k,v){calls.push([k,v]);return this;},maybeSingle:reply};
 const {loadProfileLevel}=vm.runInNewContext(code+';({loadProfileLevel})',{supabase:{from:name=>{calls.push(name);return request;}},document:{getElementById:()=>root},console:{warn(){}}});
 return {loadProfileLevel,root,fields,calls};
}
test('profile uses server XP and displays progress, remaining XP and accessible label',async()=>{
 const s=setup(async()=>({data:{level:14,total_xp:9630,level_xp:530,next_level_xp:1400}}));
 await s.loadProfileLevel('member');
 assert.equal(s.root.hidden,false);assert.equal(s.fields['[data-level-badge]'].textContent,'Lv. 14');
 assert.equal(s.fields['[data-level-total]'].textContent,'총 9,630 XP');
 assert.equal(s.fields['[data-level-remaining]'].textContent,'다음 레벨까지 870 XP');
 assert.equal(s.fields.progress.value,530);assert.equal(s.fields.progress.max,1400);
 assert.match(s.fields.progress['aria-label'],/530 \/ 1,400/);
 assert.equal(s.calls[0],'public_member_levels');
});
test('missing, invalid, failed or obsolete requests never show fabricated or stale XP',async()=>{
 for(const reply of [()=>({data:null}),()=>({error:new Error('offline')}),()=>({data:{level:1,total_xp:0,level_xp:200,next_level_xp:100}})]){
  const s=setup(reply);await s.loadProfileLevel('member');assert.equal(s.root.hidden,true);
 }
 let resolve;const s=setup(()=>new Promise(r=>resolve=r));
 const pending=s.loadProfileLevel('old');await s.loadProfileLevel(null);
 resolve({data:{level:1,total_xp:0,level_xp:0,next_level_xp:100}});await pending;assert.equal(s.root.hidden,true);
});
