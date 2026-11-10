import test from 'node:test';
import assert from 'node:assert/strict';
import { getPickerGeometry } from '../assets/js/modules/write-emoticon-anchor.js';

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
test('본문 내부 스크롤로 커서가 가려져도 버튼은 입력칸의 보이는 영역에 남는다', () => {
 const result = getPickerGeometry({editorTop:80,editorBottom:560,caretTop:-50,caretBottom:-26,viewportTop:0,viewportBottom:844});
 assert.equal(result.buttonTop,88);
 assert.ok(result.panelHeight>=0);
});
