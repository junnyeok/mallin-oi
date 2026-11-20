import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import test from 'node:test';

test('a running tab silently adopts the deployed version once, after editing is safe', async (t) => {
  const page = new EventTarget();
  page.__SITE_VERSION__ = 'old';
  page.location = new URL('https://mallin-oi.com/post.html?id=42#reply');
  const navigations = [];
  page.location.replace = url => navigations.push(url);
  let tick;
  page.setInterval = callback => { tick = callback; };

  const doc = new EventTarget();
  let onProtectedPage = false;
  doc.querySelector = () => onProtectedPage ? {} : null;
  const comment = { value: '', defaultValue: '' };
  doc.querySelectorAll = () => [comment];
  doc.hidden = false;

  t.mock.method(globalThis, 'fetch', async url => {
    assert.match(url.pathname, /\/assets\/version\.json$/);
    if (offline) throw new TypeError('offline');
    return Response.json({ siteVersion: deployed });
  });
  globalThis.window = page;
  globalThis.document = doc;
  t.after(() => { delete globalThis.window; delete globalThis.document; });

  let offline = false;
  let deployed = 'old';
  const { initSiteAutoUpdates } = await import('../assets/js/modules/site-version.js');
  initSiteAutoUpdates();
  initSiteAutoUpdates();
  await nextTurn();
  assert.deepEqual(navigations, []);

  deployed = 'new';
  doc.hidden = true;
  await tick();
  doc.hidden = false;
  offline = true;
  await tick();
  offline = false;
  onProtectedPage = true;
  await tick();
  onProtectedPage = false;
  comment.value = '작성 중인 댓글';
  await tick();
  assert.deepEqual(navigations, []);

  comment.value = '';
  page.location.searchParams.set('_updated', 'new');
  await tick();
  assert.deepEqual(navigations, []);

  page.location.searchParams.delete('_updated');
  page.dispatchEvent(new Event('online'));
  await nextTurn();
  await tick();
  assert.deepEqual(navigations, ['https://mallin-oi.com/post.html?id=42&_updated=new#reply']);
});
