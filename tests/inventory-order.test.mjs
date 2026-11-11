import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
let user = {id:'u1', user_metadata:{other:'preserve'}};
let fail = false;
let updates = [];
const events = [];
globalThis.__orderClient = {auth:{
  async getUser() { return {data:{user}}; },
  async updateUser(payload) {
    updates.push(payload);
    if (fail) return {error:new Error('failed')};
    Object.assign(user.user_metadata,payload.data);
    return {};
  }
}};
globalThis.window = {dispatchEvent:event=>events.push(event)};
const source = (await readFile('assets/js/modules/inventory-order.js','utf8'))
 .replace("import { supabase } from './supabase-client.js';",'const supabase = globalThis.__orderClient;');
const {normalizeOrder,sortByItemOrder,mergeVisibleOrder,loadItemOrder,saveItemOrder,getItemOrder,appendItemOrderButton} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
test('중복·잘못된 ID를 정리하고 새 품목은 기존 순서 뒤에 유지한다',()=>{
 assert.deepEqual(normalizeOrder(['a','a',null,'<script>','b']),['a','b']);
 const rows=[{id:'a'},{id:'b'},{id:'new'}];
 assert.deepEqual(sortByItemOrder(rows,['b','a']).map(x=>x.id),['b','a','new']);
 assert.deepEqual(rows.map(x=>x.id),['a','b','new']);
});
test('팝업에서 선택한 곡만 바꿔도 미선택 곡 순서를 보존한다',()=>{
 assert.deepEqual(mergeVisibleOrder(['a','off','b','c'],['c','a','b']),['c','off','a','b']);
 assert.deepEqual(mergeVisibleOrder([],['b','a']),['b','a']);
});
test('계정 설정에 저장·재조회하며 다른 설정과 장착·재생 상태를 변경하지 않는다',async()=>{
 await saveItemOrder('u1','bgm',['b','a']);
 assert.deepEqual(updates.at(-1),{data:{mallin_bgm_order_v1:['b','a']}});
 assert.equal(user.user_metadata.other,'preserve');
 assert.deepEqual(await loadItemOrder('u1','bgm'),['b','a']);
 assert.equal(events.at(-1).detail.type,'bgm');
 await saveItemOrder('u1','emoticon',['emo-basic-01']);
 assert.deepEqual(getItemOrder('u1','bgm'),['b','a']);
});
test('저장 실패는 성공 이벤트와 캐시 변경을 만들지 않는다',async()=>{
 const previous=events.length; fail=true;
 await assert.rejects(saveItemOrder('u1','bgm',['a','b']));
 assert.equal(events.length,previous);
 assert.deepEqual(getItemOrder('u1','bgm'),['b','a']);
 fail=false;
});
test('다른 계정의 순서를 저장할 수 없고 캐시가 섞이지 않는다',async()=>{
 await assert.rejects(saveItemOrder('u2','bgm',['a']));
 assert.deepEqual(getItemOrder('u2','bgm'),[]);
});


// Exercise pointer capture, cancellation and drop with the real event handlers.
function dragFixture() {
 class Element extends EventTarget {
  constructor() {
   super(); this.dataset={}; this.style={}; this.children=[]; this.attributes={}; this.isConnected=true;
   const classes=new Set(); this.classList={add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)};
  }
  append(el) { this.children.push(el); el.parentElement=this; }
  setAttribute(k,v) { this.attributes[k]=v; }
  removeAttribute(k) { delete this.attributes[k]; }
  querySelectorAll() { return []; }
  querySelector() { return null; }
  cloneNode() { return new Element(); }
  remove() { this.isConnected=false; }
  getBoundingClientRect() { return this.rect || {left:0,top:100,right:100,bottom:200,width:100,height:100}; }
  setPointerCapture(id) { this.capture=id; }
  hasPointerCapture(id) { return this.capture===id; }
  releasePointerCapture() { this.capture=null; }
 }
 const body=new Element();
 globalThis.document={body,createElement:()=>new Element(),querySelector:()=>null};
 Object.assign(window,{addEventListener(){},removeEventListener(){},innerHeight:700,scrollBy(){}});
 globalThis.getComputedStyle=()=>({overflowY:'visible'});
 globalThis.requestAnimationFrame=()=>1;
 globalThis.cancelAnimationFrame=()=>{};
 const parent=new Element(); body.append(parent);
 const a=new Element(),b=new Element(); b.rect={left:110,top:100,right:210,bottom:200,width:100,height:100};
 parent.append(a);parent.append(b);b.dataset.orderItemId='b';
 let saved=0;
 appendItemOrderButton(a,{userId:'u1',type:'bgm',itemId:'a',items:[{id:'a',label:'A'},{id:'b',label:'B'}],onSaved:()=>saved++});
 const button=a.children[0];
 function event(type,x=20) {
  const e=new Event(type,{cancelable:true});
  Object.assign(e,{pointerId:1,isPrimary:true,button:0,clientX:x,clientY:140});return e;
 }
 return {a,b,parent,button,event,saved:()=>saved};
}
test('짧은 탭과 드래그 취소는 저장·장착 변경을 하지 않는다',()=>{
 const f=dragFixture(),count=updates.length;
 f.button.onpointerdown(f.event('pointerdown'));
 f.button.dispatchEvent(f.event('pointerup'));
 assert.equal(updates.length,count);
 f.button.onpointerdown(f.event('pointerdown'));
 f.button.dispatchEvent(f.event('pointermove',150));
 assert.ok(f.a.classList.contains('item-order-dragging'));
 assert.ok(f.b.classList.contains('item-order-drop-target'));
 f.button.dispatchEvent(f.event('pointercancel'));
 assert.equal(updates.length,count);
 assert.ok(!f.a.classList.contains('item-order-dragging'));
 assert.ok(!f.b.classList.contains('item-order-drop-target'));
});
test('버튼을 누른 채 다른 카드로 이동하고 놓으면 새 순서를 한 번 저장한다',async()=>{
 const f=dragFixture(),count=updates.length;
 f.button.onpointerdown(f.event('pointerdown'));
 f.button.dispatchEvent(f.event('pointermove',150));
 f.button.dispatchEvent(f.event('pointerup',150));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(updates.length,count+1);
 assert.deepEqual(updates.at(-1).data.mallin_bgm_order_v1,['b','a']);
 assert.equal(f.saved(),1);
 assert.ok(!f.a.classList.contains('item-order-dragging'));
 assert.equal(f.button.capture,null);
});
test('드롭 저장 실패는 목록을 재배치하지 않고 다시 드래그할 수 있다',async()=>{
 const f=dragFixture();fail=true;
 f.button.onpointerdown(f.event('pointerdown'));
 f.button.dispatchEvent(f.event('pointermove',150));
 f.button.dispatchEvent(f.event('pointerup',150));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.saved(),0);
 assert.equal(f.parent.children[0],f.a);
 fail=false;
 f.button.onpointerdown(f.event('pointerdown'));
 assert.equal(f.button.capture,1);
 f.button.dispatchEvent(f.event('pointercancel'));
});
