import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
globalThis.window={__SITE_VERSION__:'test',location:{hostname:'localhost',origin:'http://localhost',pathname:'/',href:'http://localhost/'}};
const catalog=await import('../assets/js/modules/store-data.js');
test('BF-03 keeps exact copy, price, two previews and follows the banknote effect',()=>{
 const item=catalog.getStoreItemById('BF-03');
 assert.equal(item.name,'귀여운 덩쿨잎');assert.equal(item.price,421);assert.equal(item.itemType,'profile-frame');
 assert.equal(item.description,'귀여운 디자인의 덩쿨잎 테두리야.');assert.equal(item.detailDescription,'구매하면 인벤토리의 프로필테두리 항목에 추가되고, 장착하면 프로필카드 테두리에 표시돼.');
 const featuredIds = catalog.getFeaturedStoreItems(catalog.STORE_ITEMS.length).map((entry) => entry.id);
 const previousIndex = featuredIds.indexOf('cha-cash-01');
 assert.deepEqual(featuredIds.slice(previousIndex, previousIndex + 2), ['cha-cash-01', 'BF-03']);
 assert.equal(catalog.STORE_ITEMS.filter(i=>i.id==='BF-03').length,1);
 assert.deepEqual(item.previewImages.map(i=>i.code),['BF-03-pc','BF-03-mobile']);
 assert.ok(catalog.getProfileFrameByItemId('BF-03').mobileImagePath.endsWith('leaf-mobile.png?v=test'));
});
test('PC/mobile exports retain alpha, exact dimensions and matching mirrors',async()=>{
 for(const [name,w,h] of [['leaf-PC.png',1484,1060],['leaf-mobile.png',957,1643]]) {
  const path='images/profile-frame/'+name;const bytes=await readFile(path);assert.equal(bytes.readUInt32BE(16),w);assert.equal(bytes.readUInt32BE(20),h);assert.equal(bytes[25],6);assert.deepEqual(bytes,await readFile('www/'+path));
 }
});
test('equipment applies leaf styling and cleans it when switching or unequipping',async()=>{
 const s=await readFile('assets/js/modules/profile.js','utf8');const fn=s.slice(s.indexOf('function setProfileFrameStyle('),s.indexOf('\nfunction applyProfileFrame'));
 const classes=new Set();const styles=new Map();const target={classList:{add:x=>classes.add(x),remove:x=>classes.delete(x),toggle:(x,on)=>on?classes.add(x):classes.delete(x)},style:{setProperty:(k,v)=>styles.set(k,v),removeProperty:k=>styles.delete(k)}};
 const apply=vm.runInNewContext(fn+';setProfileFrameStyle',{getProfileFrameByItemId:catalog.getProfileFrameByItemId,syncMallinShinyFrameMotion:()=>{},syncLeafFrameSize:()=>{},MALLIN_SHINY_FRAME_ITEM_ID:'BF-02'});
 apply(target,'BF-03');assert.ok(classes.has('has-profile-frame--leaf'));assert.match(styles.get('--profile-frame-desktop'),/leaf-PC/);
 apply(target,'BF-02');assert.ok(!classes.has('has-profile-frame--leaf'));assert.ok(classes.has('has-profile-frame--mallin-shiny'));
 apply(target,'BF-03');apply(target,'');assert.ok(!classes.has('has-profile-frame--leaf'));assert.equal(styles.size,0);
});
test('migration is isolated and preserves purchase ledger and ownership guard',async()=>{
 const sql=await readFile('supabase-SQLEditor/20261116-leaf-profile-frame.sql','utf8');assert.equal(sql,await readFile('supabase/migrations/20261116010000_leaf_profile_frame.sql','utf8'));
 assert.match(sql,/v_price := 421/);assert.match(sql,/v_can_bypass_store_balance := false/);assert.match(sql,/v_is_auto_topup_admin := false/);assert.match(sql,/usi.item_id in \('BF-01', 'BF-02', 'BF-03'\)/);assert.match(sql,/insert into public.pickle_ledger/);assert.doesNotMatch(sql,/delete from|drop table|update public.profiles/i);
 const css=await readFile('assets/css/main/profile-main.css','utf8');assert.match(css,/has-profile-frame--leaf[\s\S]*border-color: transparent/);assert.match(css,/border-image-repeat: stretch/);
});
