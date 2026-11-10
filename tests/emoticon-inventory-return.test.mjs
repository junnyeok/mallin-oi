import test from 'node:test';
import assert from 'node:assert/strict';
import { getEmoticonReturnHref, initEmoticonInventoryReturn } from '../assets/js/modules/emoticon-inventory-return.js';
const origin='https://mallin-oi.com';
const search=(returnTo)=>'?'+new URLSearchParams({from:'emoticon-settings',returnTo});
test('일반 인벤토리 진입에서는 반환 버튼을 숨긴다',()=>{
 assert.equal(getEmoticonReturnHref('',origin),'');
 assert.equal(getEmoticonReturnHref('?returnTo=/post.html?id=12',origin),'');
});
test('설정에서 연 게시글과 작성 페이지 주소를 유지한다',()=>{
 assert.equal(getEmoticonReturnHref(search('/post.html?id=12#comments'),origin),'/post.html?id=12#comments');
 assert.equal(getEmoticonReturnHref(search('/write.html?id=42'),origin),'/write.html?id=42');
});
test('외부 주소와 무관한 페이지 및 잘못된 게시글 주소를 거부한다',()=>{
 for(const value of ['https://example.com/write.html','//example.com/post.html?id=1','javascript:alert(1)','/profile.html','/post.html','/post.html?id=x']) assert.equal(getEmoticonReturnHref(search(value),origin),'');
});
test('작성 탭이 살아 있으면 이동 대신 원래 탭에 복귀한다',()=>{
 let focused=false,closed=false,refreshed=false;
 const link={};
 global.document={getElementById:()=>link};
 global.window={location:{origin,search:search('/write.html')},close:()=>closed=true,opener:{closed:false,location:{origin,pathname:'/write.html',search:'',hash:''},focus:()=>focused=true,dispatchEvent:()=>refreshed=true}};
 initEmoticonInventoryReturn();
 assert.equal(link.hidden,false);assert.equal(link.href,'/write.html');
 let prevented=false;link.onclick({button:0,preventDefault:()=>prevented=true});
 assert.ok(focused&&closed&&refreshed&&prevented);
 window.location.search='';initEmoticonInventoryReturn();assert.equal(link.hidden,true);
 delete global.window;delete global.document;
});
