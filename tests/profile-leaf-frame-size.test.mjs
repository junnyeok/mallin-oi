import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('side leaves keep equal X/Y scale after XP height changes; resizing and unequip clean up',async()=>{
 const code=(await readFile('assets/js/modules/profile-leaf-frame.js','utf8')).replace('export function','function');
 const listeners=new Map();let callback,stops=0,mobile=true,height=670;
 const properties=new Map();
 const target={getBoundingClientRect:()=>({width:345,height}),style:{setProperty:(k,v)=>properties.set(k,v),removeProperty:k=>properties.delete(k)}};
 const fn=vm.runInNewContext(code+';syncLeafFrameSize',{WeakMap,Math,ResizeObserver:class{constructor(fn){callback=fn}observe(){}disconnect(){stops++}},window:{matchMedia:()=>({matches:mobile}),addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)}});
 fn(target,true);
 for(const h of [670,780]){
  height=h;callback();
  const top=parseFloat(properties.get('--leaf-cap-top')),bottom=parseFloat(properties.get('--leaf-cap-bottom')),side=parseFloat(properties.get('--leaf-side'));
  assert.ok(Math.abs(side/180-(height+124-top-bottom)/1143)<.00001);
 }
 mobile=false;listeners.get('resize')();
 assert.ok(parseFloat(properties.get('--leaf-side'))>100);
 fn(target,false);assert.equal(properties.size,0);assert.equal(listeners.size,0);assert.equal(stops,1);
 fn(target,true);listeners.get('mallin:before-pjax-swap')();assert.equal(listeners.size,0);assert.equal(stops,2);
});
