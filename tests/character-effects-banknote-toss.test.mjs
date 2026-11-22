import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: { hostname: 'localhost', origin: 'http://localhost', pathname: '/', href: 'http://localhost/' },
};

const catalog = await import('../assets/js/modules/store-data.js');
const { renderCharacterEffectHtml } = await import('../assets/js/modules/character-effects.js');
const itemId = 'cha-cash-01';
const asset = 'images/character-effects/banknote-toss-effect-01.svg';

test('지폐 흩뿌리기 follows the sports day pack in New and in release-date order', () => {
  const item = catalog.getStoreItemById(itemId);
  assert.equal(catalog.STORE_ITEMS.filter(product => product.id === itemId).length, 1);
  assert.equal(catalog.CHARACTER_EFFECT_CATALOG.filter(effect => effect.itemId === itemId).length, 1);
  assert.equal(catalog.getFeaturedStoreItems(2)[1], item);
  assert.equal(catalog.STORE_ITEMS.toSorted((a, b) => b.releaseDate.localeCompare(a.releaseDate))[1], item);
  assert.equal(catalog.getStoreItemDetailHref(itemId), './store-item.html?id=cha-cash-01');
  assert.equal(item.name, '지폐 흩뿌리기');
  assert.equal(item.price, 413);
  assert.equal(item.category, 'cha-effects');
  assert.equal(item.badge, '캐릭터효과');
  assert.equal(item.icon, '💸');
  assert.equal(item.state, '판매 중');
  assert.equal(item.description, '지폐를 흩뿌리는 효과야.');
  assert.equal(item.detailDescription, '구매하면 인벤토리의 캐릭터 효과 항목에 추가되고, 장착하면 프로필/게시물/댓글/답글의 내 캐릭터에 표시돼.');
  assert.equal(item.isPurchasable, true);
  assert.equal(item.thumbImagePath, `/${asset}?v=test`);
  assert.equal(item.previewImages.length, 1);
  assert.equal(item.previewImages[0].imagePath, item.thumbImagePath);
});

test('post, comment, and reply authors mount banknotes inline while previews still use the image', () => {
  for (const context of ['profile', 'inventory', 'post', 'comment', 'store', 'thumbnail']) {
    const effect = catalog.getCharacterEffectRenderMeta(itemId, context);
    const html = renderCharacterEffectHtml(effect);
    assert.equal(effect.placement, 'front');
    assert.equal(effect.animation, 'none');
    assert.match(html, /data-character-effect-id="cha-cash-01"/);
    assert.match(html, new RegExp(`data-character-effect-context="${context}"`));
    if (context === 'post' || context === 'comment') {
      assert.match(html, /<span class="character-effect-banknote" data-character-effect-banknote><\/span>/);
      assert.doesNotMatch(html, /<img/);
    } else {
      assert.match(html, /<img\s+class="character-effect-img"/);
      assert.ok(html.includes(`src="/${asset}?v=test"`));
    }
  }
});

test('the published web files and the packaged web files share the same animation and catalog', async () => {
  for (const path of [
    asset,
    'assets/js/modules/store-data.js',
    'assets/js/modules/character-effects.js',
    'assets/css/components/character-effects.css',
    'assets/css/main/post-main.css',
  ]) {
    assert.deepEqual(await readFile(path), await readFile(`www/${path}`));
  }
  const prepareScript = await readFile('scripts/prepare-capacitor-web.mjs', 'utf8');
  assert.ok(prepareScript.includes(`'${asset}'`));
});
