import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('상점 목록은 description, 상품 상세는 detailDescription만 표시한다', async () => {
  const [rootStoreSource, mobileStoreSource] = await Promise.all([
    readFile('assets/js/modules/store.js', 'utf8'),
    readFile('www/assets/js/modules/store.js', 'utf8'),
  ]);

  assert.equal(mobileStoreSource, rootStoreSource);
  assert.equal(
    rootStoreSource.match(/\$\{item\.description\}/g)?.length,
    1,
    'description은 상점 목록 카드에서만 렌더링해야 한다.',
  );
  assert.equal(
    rootStoreSource.match(/\$\{item\.detailDescription\}/g)?.length,
    1,
    'detailDescription은 상품 상세에서만 렌더링해야 한다.',
  );
  assert.match(
    rootStoreSource,
    /class="store-card__desc">\$\{item\.description\}<\/p>/,
  );
  assert.match(
    rootStoreSource,
    /class="store-item-detail__desc">\$\{item\.detailDescription\}<\/p>/,
  );
  assert.doesNotMatch(
    rootStoreSource,
    /class="store-item-detail__desc">\$\{item\.description\}<\/p>/,
  );
});
