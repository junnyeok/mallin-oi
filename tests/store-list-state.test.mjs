import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile('assets/js/modules/store.js', 'utf8');
const code = source.slice(source.indexOf('function bindStoreFilter('), source.indexOf('function renderStoreItemPreview('));
async function harness(search = '') {
  const element = (dataset = {}) => ({ dataset, attrs: {}, listeners: {}, innerHTML: '',
    classList: { toggle() {} }, setAttribute(k,v) { this.attrs[k] = v; },
    addEventListener(k,fn) { this.listeners[k] = fn; },
  });
  const grid = element();
  const filters = ['all','character','skin'].map(storeFilter => element({storeFilter}));
  const sorts = ['releaseDate','price'].map(storeSortKey => element({storeSortKey}));
  const direction = element();
  const window = { location: new URL('https://example.com/shop/store.html' + search) };
  const state = {pjax: true, unrelated: 42};
  let replacements = 0;
  window.history = { state, replaceState(s,_,href) { assert.equal(s,state); replacements++; window.location = new URL(href,window.location); } };
  const items = Array.from({length: 12},(_,i)=>({id:'char'+i,category:'character',price:i,releaseDate:'2026-11-10'}));
  items.push({id:'skin',category:'skin',price:99,releaseDate:'2026-11-10'});
  const ctx = vm.createContext({window, URL, URLSearchParams, STORE_ITEMS:items,
    $: s => s==='#storeGrid'?grid:s==='[data-store-sort-direction]'?direction:null,
    $all:s=>s==='[data-store-filter]'?filters:sorts,
    prepareCharacterEffects(){}, loadMyPickles:async()=>null,
    getStoreItemDetailHref:id=>'./store-item.html?id='+id,
    renderStoreCard:(item,options)=>JSON.stringify({id:item.id,href:options.detailHref})+'\n',
  });
  vm.runInContext(code,ctx);
  await ctx.initStorePage();
  return {ctx,grid,filters,sorts,direction,window,replacements:()=>replacements};
}

test('직접 상점 방문은 전체·출시일 내림차순이며 불필요한 history 기록이 없다', async()=>{
  const h=await harness(); assert.equal(h.filters[0].attrs['aria-pressed'],'true');
  assert.equal(h.replacements(),0); assert.equal(h.direction.textContent,'내림차순');
});
test('뒤로가기 재초기화 시 카테고리·정렬·페이지와 상품 링크가 복원된다',async()=>{
  const h=await harness('?category=character&sort=price&direction=asc&page=2');
  assert.equal(h.filters[1].attrs['aria-pressed'],'true');
  assert.equal(h.sorts[1].attrs['aria-pressed'],'true');
  assert.equal(h.direction.textContent,'오름차순');
  const rows=h.grid.innerHTML.trim().split('\n').map(JSON.parse);
  assert.deepEqual(rows.map(x=>x.id),['char8','char9','char10','char11']);
  const detail=new URL(rows[0].href,h.window.location);
  assert.equal(detail.searchParams.get('id'),'char8');
  const restored=h.ctx.readStoreListState(detail.search);
  const back=h.ctx.storeListStateHref('./store.html',restored);
  assert.equal(back,'/shop/store.html?category=character&sort=price&direction=asc&page=2');
  await h.ctx.initStorePage(); assert.equal(h.grid.innerHTML.trim().split('\n').length,4);
});
test('필터·정렬 변경은 현재 URL만 갱신하고 페이지를 1로 재설정한다',async()=>{
  const h=await harness('?category=character&page=2&unrelated=ok#list');
  h.filters[2].listeners.click();
  assert.equal(h.window.location.search,'?category=skin&unrelated=ok');
  assert.equal(h.window.location.hash,'#list');
  assert.equal(h.replacements(),1);
  h.sorts[1].listeners.click(); h.direction.listeners.click();
  assert.equal(h.window.location.searchParams.get('sort'),'price');
  assert.equal(h.window.location.searchParams.get('direction'),'asc');
});
test('잘못된 필터·정렬·페이지를 안전하게 기본값으로 되돌리고 범위를 제한한다',async()=>{
  const h=await harness('?category=invalid&sort=bad&direction=bad&page=-2');
  assert.equal(h.window.location.search,'');
  const h2=await harness('?category=character&page=999');
  assert.equal(h2.window.location.searchParams.get('page'),'2');
  for(const page of ['1.5','Infinity','NaN','9007199254740992']) assert.equal(h.ctx.readStoreListState('?page='+page).page,1);
});
test('상세 화면 복귀 링크도 상태를 사용하며 루트와 www 코드가 같다',async()=>{
  assert.ok(source.includes("storeListStateHref('./store.html', readStoreListState())"));
  assert.equal(source,await readFile('www/assets/js/modules/store.js','utf8'));
});
