import test from 'node:test';
import assert from 'node:assert/strict';
import { getPickerGeometry, rectsOverlap } from '../assets/js/modules/write-emoticon-anchor.js';

test('본문 커서 줄 오른쪽 버튼과 그 아래 선택창을 배치한다', () => {
 const result = getPickerGeometry({editorTop:100,editorBottom:700,caretTop:180,caretBottom:204,viewportTop:0,viewportBottom:844});
 assert.equal(result.buttonTop,180);
 assert.ok(result.panelTop >= result.buttonTop+44);
 assert.ok(result.panelTop > 204);
 assert.ok(result.panelTop+result.panelHeight <= 692);
});
test('키보드로 줄어든 보이는 화면을 넘어 선택창이 늘어나지 않는다', () => {
 const result = getPickerGeometry({editorTop:-100,editorBottom:600,caretTop:70,caretBottom:94,viewportTop:40,viewportBottom:330});
 assert.ok(result.buttonTop>=48);
 assert.ok(result.panelHeight>0);
 assert.ok(result.panelTop+result.panelHeight<=322);
});
test('본문 내부 스크롤로 커서가 가려지면 버튼을 다른 줄로 옮기지 않고 숨긴다', () => {
 const result = getPickerGeometry({editorTop:80,editorBottom:560,caretTop:-50,caretBottom:-26,viewportTop:0,viewportBottom:844});
 assert.equal(result.buttonTop,-50);
 assert.equal(result.caretVisible,false);
 assert.ok(result.panelHeight>=0);
});

test('페이지 스크롤 전후 버튼과 선택창의 본문 기준 위치가 같다', () => {
 const initial = {editorTop:100,editorBottom:700,caretTop:180,caretBottom:204,viewportTop:0,viewportBottom:844};
 const before = getPickerGeometry(initial);
 for (const delta of [-300, 150, 500]) {
  const scrolled = {...initial, editorTop:initial.editorTop-delta, editorBottom:initial.editorBottom-delta,
   caretTop:initial.caretTop-delta, caretBottom:initial.caretBottom-delta};
  const after = getPickerGeometry(scrolled);
  assert.equal(after.buttonTop-scrolled.editorTop,before.buttonTop-initial.editorTop);
  assert.equal(after.panelTop-scrolled.editorTop,before.panelTop-initial.editorTop);
  assert.equal(after.caretVisible,true);
 }
});
test('모바일 키보드와 visual viewport 이동이 버튼을 커서 줄에서 밀어내지 않는다', () => {
 for (const viewportTop of [0, 200, 400]) {
  const result = getPickerGeometry({editorTop:100,editorBottom:700,caretTop:180,caretBottom:204,viewportTop,viewportBottom:viewportTop+300});
  assert.equal(result.buttonTop,180);
  assert.equal(result.panelTop,230);
 }
});
test('본문 내부 스크롤 후 다시 보이는 커서 줄에 버튼을 복원한다', () => {
 const base = {editorTop:80,editorBottom:560,caretBottom:600,viewportTop:0,viewportBottom:844};
 assert.equal(getPickerGeometry({...base,caretTop:576}).caretVisible,false);
 const visible = getPickerGeometry({...base,caretTop:120,caretBottom:144});
 assert.equal(visible.caretVisible,true);
 assert.equal(visible.buttonTop,120);
});

test('글자 영역이 버튼과 실제 겹칠 때만 반투명 처리 대상으로 판단한다', () => {
 const button = {left:260,right:304,top:120,bottom:164};
 assert.equal(rectsOverlap({left:240,right:280,top:124,bottom:148,width:40,height:24},button),true);
 assert.equal(rectsOverlap({left:20,right:250,top:124,bottom:148,width:230,height:24},button),false);
 assert.equal(rectsOverlap({left:240,right:280,top:90,bottom:114,width:40,height:24},button),false);
 assert.equal(rectsOverlap({left:280,right:280,top:124,bottom:148,width:0,height:24},button),false);
});
