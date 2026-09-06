import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

globalThis.window = {
  __SITE_VERSION__: 'test',
  location: {
    hostname: 'localhost',
    origin: 'http://localhost',
    pathname: '/',
    href: 'http://localhost/',
  },
};

const {
  CHARACTER_EFFECT_CATALOG,
  SPIDER_WEB_CHARACTER_EFFECT_PREVIEW,
  STORE_ITEMS,
  getCharacterEffectRenderMeta,
  getFeaturedStoreItems,
} = await import('../assets/js/modules/store-data.js');
const { renderCharacterEffectHtml } = await import(
  '../assets/js/modules/character-effects.js'
);

const WEB_ITEM_ID = 'cha-effects-web-01';
const FIRE_ITEM_ID = 'cha-effects-fire-01';
const HEART_ITEM_ID = 'cha-effects-cucumberheart-01';
const WEB_IMAGE_PATH = './images/character-effects/spider-web-effect-01.png';

function extractSvgIds(html = '') {
  return new Set(
    Array.from(html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]),
  );
}

function extractSvgUrlReferences(html = '') {
  return Array.from(
    html.matchAll(/url\(#([^\)]+)\)/g),
    (match) => match[1],
  );
}

test('거미줄 상품과 SVG 카탈로그 메타데이터가 한 번만 정의된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === WEB_ITEM_ID);
  const effects = CHARACTER_EFFECT_CATALOG.filter(
    (item) => item.itemId === WEB_ITEM_ID,
  );

  assert.equal(products.length, 1);
  assert.equal(effects.length, 1);
  assert.equal(products[0].name, '거미줄 효과');
  assert.equal(products[0].price, 523);
  assert.equal(products[0].category, 'cha-effects');
  assert.equal(products[0].releaseDate, '2026-08-04');
  assert.equal(products[0].previewImages, SPIDER_WEB_CHARACTER_EFFECT_PREVIEW);
  assert.equal(products[0].previewImages.length, 1);
  assert.match(products[0].previewImages[0].imagePath, /spider-web-effect-01\.png/);
  assert.match(products[0].thumbImagePath, /spider-web-effect-01\.png/);
  assert.equal(effects[0].renderMode, 'spider-web-svg');
  assert.equal(effects[0].sprite, undefined);
  assert.equal(getFeaturedStoreItems(9)[8].id, WEB_ITEM_ID);
});

test('front 배치가 모든 장착 문맥에서 캐릭터 전체를 같은 비율로 감싼다', () => {
  ['profile', 'inventory', 'post', 'comment'].forEach((context) => {
    const meta = getCharacterEffectRenderMeta(WEB_ITEM_ID, context);

    assert.equal(meta.placement, 'front');
    assert.equal(meta.renderMode, 'spider-web-svg');
    assert.equal(meta.cssVars['--character-effect-default-width'], '150%');
    assert.equal(meta.cssVars['--character-effect-ground-offset'], '-8%');
    assert.equal(meta.cssVars['--character-effect-default-z'], '35');
  });

  assert.equal(
    getCharacterEffectRenderMeta(WEB_ITEM_ID, 'store').cssVars[
      '--character-effect-default-width'
    ],
    '140%',
  );
  assert.equal(
    getCharacterEffectRenderMeta(WEB_ITEM_ID, 'thumbnail').cssVars[
      '--character-effect-default-width'
    ],
    '118%',
  );
});

test('거미줄 효과는 스프라이트가 아닌 고유 식별 인라인 SVG로 렌더링된다', () => {
  const html = renderCharacterEffectHtml(
    getCharacterEffectRenderMeta(WEB_ITEM_ID, 'profile'),
  );

  assert.match(html, /data-character-effect-vector="spider-web"/);
  assert.match(html, /data-character-effect-duration="4800"/);
  assert.match(html, /<svg[\s\S]*viewBox="0 0 600 600"/);
  assert.match(html, /class="web-spokes"/);
  assert.match(html, /class="web-rings web-rings-a"/);
  assert.match(html, /class="web-rings web-rings-b"/);
  assert.match(html, /class="web-anchor"/);
  assert.match(html, /class="web-sweep"/);
  assert.match(html, /class="web-drops"/);
  assert.match(html, /class="web-spider"/);
  assert.match(html, /character-effect-vector__fallback/);
  assert.match(html, /spider-web-effect-01\.png/);
  assert.doesNotMatch(html, /data-character-effect-sprite/);
  assert.doesNotMatch(html, /data-sprite-frame-duration/);
  assert.doesNotMatch(html, /data-sprite-frame-count/);
});

test('여러 거미줄 SVG의 gradient와 filter ID가 서로 충돌하지 않는다', () => {
  const effect = getCharacterEffectRenderMeta(WEB_ITEM_ID, 'comment');
  const firstHtml = renderCharacterEffectHtml(effect);
  const secondHtml = renderCharacterEffectHtml(effect);
  const firstIds = extractSvgIds(firstHtml);
  const secondIds = extractSvgIds(secondHtml);

  assert.equal(firstIds.size, 4);
  assert.equal(secondIds.size, 4);
  assert.deepEqual(
    [...firstIds].filter((id) => secondIds.has(id)),
    [],
  );

  extractSvgUrlReferences(firstHtml).forEach((id) => {
    assert.equal(firstIds.has(id), true, `${id} must belong to the first SVG`);
  });
  extractSvgUrlReferences(secondHtml).forEach((id) => {
    assert.equal(secondIds.has(id), true, `${id} must belong to the second SVG`);
  });
});

test('4.8초 CSS 보간과 reduced-motion 정적 상태를 제공한다', async () => {
  const css = await readFile(
    'assets/css/components/character-effects.css',
    'utf8',
  );
  const spiderKeyframes = Array.from(
    css.matchAll(/@keyframes\s+(characterEffectSpiderWeb[A-Za-z]+)/g),
    (match) => match[1],
  );
  const allKeyframes = Array.from(
    css.matchAll(/@keyframes\s+([A-Za-z0-9_-]+)/g),
    (match) => match[1],
  );

  assert.match(css, /--spider-web-duration:\s*4\.8s/);
  assert.match(css, /stroke-dashoffset/);
  assert.match(css, /cubic-bezier\(/);
  assert.match(css, /ease-in-out/);
  assert.match(css, /characterEffectSpiderWebAfterglow/);
  assert.match(css, /characterEffectSpiderWebSpider/);
  assert.match(css, /characterEffectSpiderWebSweep/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(
    css,
    /character-effect-vector--spider-web \*[\s\S]*?animation: none !important/,
  );
  assert.match(css, /\.web-spokes path,[\s\S]*?stroke-dashoffset: 0/);
  assert.match(css, /\.web-spider, \.web-drops[\s\S]*?display: none/);
  assert.equal(spiderKeyframes.length >= 10, true);
  assert.equal(new Set(allKeyframes).size, allKeyframes.length);
  assert.doesNotMatch(css, /steps\s*\(/i);
  assert.doesNotMatch(css, /400ms/i);
});

test('불꽃 스프라이트와 하트 이미지 렌더링은 기존 방식을 유지한다', () => {
  const fire = getCharacterEffectRenderMeta(FIRE_ITEM_ID, 'profile');
  const heart = getCharacterEffectRenderMeta(HEART_ITEM_ID, 'profile');
  const fireHtml = renderCharacterEffectHtml(fire);
  const heartHtml = renderCharacterEffectHtml(heart);

  assert.equal(fire.sprite.columnCount, 6);
  assert.equal(fire.sprite.rowCount, 4);
  assert.equal(fire.sprite.frameCount, 22);
  assert.equal(fire.sprite.frameDurationMs, 90);
  assert.match(fireHtml, /data-character-effect-sprite/);
  assert.match(fireHtml, /data-sprite-frame-duration="90"/);
  assert.doesNotMatch(fireHtml, /data-character-effect-vector/);
  assert.match(heartHtml, /class="character-effect-img character-effect-img--heart"/);
  assert.doesNotMatch(heartHtml, /data-character-effect-sprite/);
  assert.doesNotMatch(heartHtml, /data-character-effect-vector/);
});

test('PNG는 단일 512×512 RGBA 정적 fallback 이미지다', async () => {
  const png = await readFile('images/character-effects/spider-web-effect-01.png');

  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(png[25], 6, 'PNG color type 6 must include alpha');
});

test('SVG 분기는 기존 미리보기·ready·정리 파이프라인을 재사용한다', async () => {
  const [store, renderer, index, prepare] = await Promise.all([
    readFile('assets/js/modules/store.js', 'utf8'),
    readFile('assets/js/modules/character-effects.js', 'utf8'),
    readFile('index.html', 'utf8'),
    readFile('scripts/prepare-capacitor-web.mjs', 'utf8'),
  ]);

  assert.match(store, /loadMyEquippedCharacterImageUrl/);
  assert.match(store, /getCharacterEffectRenderMeta\(item\?\.id, 'store'\)/);
  assert.match(store, /prepareCharacterEffects\(root\)/);
  assert.match(renderer, /renderMode === 'spider-web-svg'/);
  assert.match(renderer, /removeDuplicateEffectLayers/);
  assert.match(renderer, /unregisterSpriteLayers\(layer\)/);
  assert.match(renderer, /replaceCharacterEffect/);
  assert.match(renderer, /cleanupCharacterEffects/);
  assert.match(index, /🛍️ New 상품 품목/);
  assert.doesNotMatch(index, /🛍️ NEW 상품 품목/);
  assert.match(prepare, /images\/character-effects\/spider-web-effect-01\.png/);
});

test('구매 SQL과 장착 소유권 정책은 기존 상태를 유지한다', async () => {
  const [commonSql, dedicatedSql, migrationSql, followupSql, backupSql] =
    await Promise.all([
      readFile('supabase-SQLEditor/store-item_purchase-functions.sql', 'utf8'),
      readFile(
        'supabase-SQLEditor/20260804-spider-web-character-effect.sql',
        'utf8',
      ),
      readFile(
        'supabase/migrations/20260804000000_spider_web_character_effect.sql',
        'utf8',
      ),
      readFile(
        'supabase/migrations/20260804010000_spider_web_test_purchase_permission.sql',
        'utf8',
      ),
      readFile('supabase-SQLEditor/99_all_backup.sql', 'utf8'),
    ]);

  const corePatterns = [
    /p_item_id = 'cha-effects-web-01'[\s\S]*?v_price := 523;[\s\S]*?v_name := '거미줄 효과';[\s\S]*?v_category := 'cha-effects';/,
    /거미줄 효과 구매가 완료됐어\. 523피클이 차감됐고 인벤토리에서 장착할 수 있어\./,
  ];

  corePatterns.forEach((pattern) => assert.match(commonSql, pattern));
  [dedicatedSql, migrationSql, backupSql].forEach((sql) => {
    corePatterns.forEach((pattern) => assert.match(sql, pattern));
    assert.match(sql, /enforce_equipped_character_effect_ownership/);
    assert.match(
      sql,
      /'cha-effects-cucumberheart-01',[\s\S]*?'cha-effects-fire-01',[\s\S]*?'cha-effects-web-01'/,
    );
    assert.match(sql, /item\.item_category = 'cha-effects'/);
    assert.match(sql, /CHARACTER_EFFECT_NOT_OWNED/);
  });

  assert.match(commonSql, /insert into public\.user_store_items/);
  assert.match(commonSql, /insert into public\.pickle_ledger/);
  assert.match(commonSql, /-v_charged_amount/);
  assert.match(commonSql, /from public\.store_purchase_test_permissions permission/);
  assert.match(followupSql, /allow_spider_web_test_purchase/);
  assert.match(followupSql, /coalesce\(pickles, 0\) >= v_price/);
});

test('루트·www 대응 파일과 앱 시작 페이지가 일치한다', async () => {
  const mirrors = [
    'assets/css/components/character-effects.css',
    'assets/js/modules/character-effects.js',
    'assets/js/modules/store-data.js',
    'images/character-effects/spider-web-effect-01.png',
  ];

  await Promise.all(
    mirrors.map(async (path) => {
      assert.deepEqual(
        await readFile(path),
        await readFile(`www/${path}`),
        `${path} must match www/${path}`,
      );
    }),
  );

  assert.equal(
    await readFile('www/index.html', 'utf8'),
    await readFile('app-calendar.html', 'utf8'),
    'Capacitor index must remain the calendar launcher',
  );
  assert.equal(SPIDER_WEB_CHARACTER_EFFECT_PREVIEW[0].placement, 'front');
  assert.equal(
    SPIDER_WEB_CHARACTER_EFFECT_PREVIEW[0].imagePath.includes(
      WEB_IMAGE_PATH.replace(/^\./, ''),
    ),
    true,
  );
});

test('file-list에는 기존 거미줄 파일 경로가 중복 없이 유지된다', async () => {
  const fileList = await readFile('file-list.txt', 'utf8');
  const expectedPaths = [
    './images/character-effects/spider-web-effect-01.png',
    './www/images/character-effects/spider-web-effect-01.png',
    './android/app/src/main/assets/public/images/character-effects/spider-web-effect-01.png',
    './ios/App/App/public/images/character-effects/spider-web-effect-01.png',
    './tests/character-effects-spider-web.test.mjs',
  ];

  expectedPaths.forEach((path) => {
    assert.equal(
      fileList.split('\n').filter((line) => line === path).length,
      1,
      `${path} must appear once`,
    );
  });
});
