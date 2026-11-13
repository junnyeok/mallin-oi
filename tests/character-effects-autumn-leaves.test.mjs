import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};
const catalog = await import('../assets/js/modules/store-data.js');
const { renderCharacterEffectHtml } = await import('../assets/js/modules/character-effects.js');
const itemId = 'cha-fall-01';
const asset = 'images/character-effects/autumn-leaves-effect-01.svg';
const sqlPath = 'supabase-SQLEditor/20261113-autumn-leaves-character-effect.sql';

test('늦가을 산책은 지정 문구·455피클로 NEW 첫 번째에 유일하게 등록된다', () => {
  const product = catalog.getStoreItemById(itemId);
  assert.equal(catalog.STORE_ITEMS.filter(item => item.id === itemId).length, 1);
  assert.equal(catalog.CHARACTER_EFFECT_CATALOG.filter(item => item.itemId === itemId).length, 1);
  assert.equal(catalog.getFeaturedStoreItems(1)[0].id, itemId);
  assert.equal(product.name, '늦가을 산책');
  assert.equal(product.price, 455);
  assert.equal(product.category, 'cha-effects');
  assert.equal(product.description, '날씨가 추워졌어.');
  assert.equal(product.detailDescription, '구매하면 인벤토리의 캐릭터 효과 항목에 추가되고, 장착하면 프로필/게시물/댓글/답글의 내 캐릭터에 표시돼.');
  assert.equal(product.releaseDate, '2026-11-13');
  assert.equal(product.isPurchasable, true);
  assert.equal(product.previewImages.length, 1);
  assert.equal(product.previewImages[0].imagePath, product.thumbImagePath);
  assert.match(product.thumbImagePath, /autumn-leaves-effect-01\.svg\?v=test$/);
});

test('모든 표시 문맥에서 공통 렌더러가 낙엽 SVG를 장식 레이어로 표시한다', () => {
  for (const context of ['profile', 'inventory', 'post', 'comment', 'store', 'thumbnail']) {
    const meta = catalog.getCharacterEffectRenderMeta(itemId, context);
    const html = renderCharacterEffectHtml(meta);
    assert.equal(meta.placement, 'front');
    assert.equal(meta.animation, 'none');
    assert.match(html, /data-character-effect-id="cha-fall-01"/);
    assert.match(html, new RegExp(`data-character-effect-context="${context}"`));
    assert.match(html, /aria-hidden="true"/);
    assert.match(html, /autumn-leaves-effect-01\.svg\?v=test/);
    assert.doesNotMatch(html, /data-character-effect-sprite/);
  }
});

test('투명 SVG는 자체 애니메이션·동작 줄이기를 제공하고 외부 자원을 요구하지 않는다', async () => {
  const svg = await readFile(asset, 'utf8');
  const ids = [...svg.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const [, id] of svg.matchAll(/(?:href="#|url\(#)([\w-]+)/g)) assert.ok(ids.includes(id));
  assert.match(svg, /viewBox="0 0 600 600"/);
  assert.equal([...svg.matchAll(/class="leaf-fall"/g)].length, 12);
  assert.match(svg, /@keyframes autumn-fall/);
  assert.match(svg, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(svg, /<script|<image|<rect|(?:href|src)="(?:https?:|data:)/i);
});

test('전용 SQL·마이그레이션·누적본과 구매 함수의 이번 상품 분기가 일치한다', async () => {
  const [sql, migration, backup, purchase] = await Promise.all([
    readFile(sqlPath, 'utf8'),
    readFile('supabase/migrations/20261113000000_autumn_leaves_character_effect.sql', 'utf8'),
    readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
    readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
  ]);
  assert.equal(sql, migration);
  assert.ok(backup.endsWith(sql));
  assert.match(purchase, /elsif p_item_id = 'cha-fall-01' then\s+v_price := 455;\s+v_name := '늦가을 산책';\s+v_category := 'cha-effects';/);
  assert.doesNotMatch(purchase, /if p_item_id = 'cha-fall-01' then\s+v_can_bypass_store_balance := false;/);
  assert.match(purchase, /permission.can_bypass_store_balance = true/);
  assert.match(purchase, /if p_item_id = 'cha-fall-01' then\s+v_is_auto_topup_admin := false;/);
  assert.match(sql, /AUTUMN_LEAVES_ITEM_ID_CONFLICT/);
  assert.match(sql, /AUTUMN_LEAVES_PURCHASE_ANCHOR_MISMATCH/);
  assert.match(sql, /item\.user_id = new\.id/);
  assert.match(sql, /item\.item_id = new\.equipped_character_effect_item_id/);
  assert.match(sql, /insert into public\.pickle_ledger/);
  assert.match(sql, /-v_charged_amount/);
  assert.doesNotMatch(sql, /delete from|drop trigger|update public\.profiles/i);
});

test('원본·www와 준비 스크립트에 동일한 최종 SVG가 포함된다', async () => {
  for (const path of ['assets/js/modules/store-data.js', asset]) {
    assert.deepEqual(await readFile(path), await readFile(`www/${path}`));
  }
  const script = await readFile('scripts/prepare-capacitor-web.mjs', 'utf8');
  assert.ok(script.includes(`'${asset}'`));
});
