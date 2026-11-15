import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCharacterEffectHtml } from '../assets/js/modules/character-effects.js';

const effect = {itemId: 'cha-fall-01', imagePath: './images/character-effects/autumn-leaves-effect-01.svg', placement: 'front', animation: 'none'};

test('autumn leaves render inline in all character contexts with continuous animation', () => {
  for (const context of ['post', 'comment', 'profile', 'inventory', 'store']) {
    const html = renderCharacterEffectHtml({...effect, context});
    assert.match(html, /<svg/);
    assert.doesNotMatch(html, /<img/);
    assert.match(html, /linear infinite/);
    assert.equal((html.match(/class="autumnLeaves\d+-leaf-fall"/g) || []).length, 12);
    assert.match(html, /prefers-reduced-motion: reduce/);
  }
});

test('multiple authors have independent SVG definitions and animation names', () => {
  const first = renderCharacterEffectHtml(effect);
  const second = renderCharacterEffectHtml(effect);
  const ids = html => [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  const a = ids(first), b = ids(second);
  assert.ok(a.length > 0);
  assert.ok(a.every(id => !b.includes(id)));
  for (const html of [first, second]) {
    const defined = new Set(ids(html));
    for (const ref of html.matchAll(/(?:url\(#|href="#)([^)"\s]+)/g)) {
      assert.ok(defined.has(ref[1]), `missing SVG reference ${ref[1]}`);
    }
    assert.doesNotMatch(html, /__AUTUMN_INSTANCE__/);
  }
});
