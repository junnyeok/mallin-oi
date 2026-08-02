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
  STORE_ITEMS,
  getCharacterEffectRenderMeta,
  getFeaturedStoreItems,
} = await import('../assets/js/modules/store-data.js');
const { getCharacterEffectSpriteFrame, renderCharacterEffectHtml } =
  await import('../assets/js/modules/character-effects.js');

const FIRE_ITEM_ID = 'cha-effects-fire-01';
const FIRE_SPRITE = {
  columnCount: 6,
  rowCount: 4,
  frameWidth: 256,
  frameHeight: 256,
  frameCount: 22,
  frameDurationMs: 90,
  loop: true,
  frameBottomOffsets: [
    1, 2, 2, 1, 1, 20, 1, 2, 6, 1, 0, 1, 0, 2, 4, 1, 1, 9, 1, 2, 4,
    1,
  ],
};

test('불꽃 상품과 카탈로그 메타데이터가 한 번만 정의된다', () => {
  const products = STORE_ITEMS.filter((item) => item.id === FIRE_ITEM_ID);
  const effects = CHARACTER_EFFECT_CATALOG.filter(
    (item) => item.itemId === FIRE_ITEM_ID,
  );

  assert.equal(products.length, 1);
  assert.equal(effects.length, 1);
  assert.equal(products[0].price, 496);
  assert.equal(products[0].category, 'cha-effects');
  assert.equal(products[0].previewImages.length, 1);
  assert.deepEqual(effects[0].sprite, FIRE_SPRITE);
  assert.equal(getFeaturedStoreItems(4)[3].id, FIRE_ITEM_ID);
});

test('장착 화면은 발 기준 반응형 크기, 상품 기준 화면은 기존 크기를 유지한다', () => {
  const expectedContexts = {
    profile: '135%',
    inventory: '135%',
    post: '135%',
    comment: '135%',
  };

  Object.entries(expectedContexts).forEach(([context, width]) => {
    const meta = getCharacterEffectRenderMeta(FIRE_ITEM_ID, context);

    assert.equal(meta.placement, 'front');
    assert.equal(meta.cssVars['--character-effect-default-width'], width);
    assert.equal(meta.cssVars['--character-effect-ground-offset'], '6%');
    assert.equal(meta.cssVars['--character-effect-default-z'], '30');
  });

  ['store', 'thumbnail'].forEach((context) => {
    const meta = getCharacterEffectRenderMeta(FIRE_ITEM_ID, context);

    assert.equal(meta.cssVars['--character-effect-default-width'], '100%');
    assert.equal(meta.cssVars['--character-effect-ground-offset'], undefined);
  });
});

test('불꽃 스프라이트 HTML에 프레임별 하단 투명 여백 보정값이 포함된다', () => {
  const meta = getCharacterEffectRenderMeta(FIRE_ITEM_ID, 'profile');
  const html = renderCharacterEffectHtml(meta);

  assert.equal(meta.sprite.frameCount, 22);
  assert.match(html, /data-sprite-frame-height="256"/);
  assert.match(html, /data-sprite-frame-bottom-offsets="1,2,2,1,1,20,/);
  assert.match(html, /--character-effect-sprite-frame-bottom-offset:/);
});

test('22개 프레임을 행 우선으로 재생하고 마지막 뒤 첫 프레임으로 순환한다', () => {
  assert.deepEqual(getCharacterEffectSpriteFrame(FIRE_SPRITE, 0), {
    index: 0,
    column: 0,
    row: 0,
  });
  assert.deepEqual(getCharacterEffectSpriteFrame(FIRE_SPRITE, 5), {
    index: 5,
    column: 5,
    row: 0,
  });
  assert.deepEqual(getCharacterEffectSpriteFrame(FIRE_SPRITE, 6), {
    index: 6,
    column: 0,
    row: 1,
  });
  assert.deepEqual(getCharacterEffectSpriteFrame(FIRE_SPRITE, 21), {
    index: 21,
    column: 3,
    row: 3,
  });
  assert.deepEqual(getCharacterEffectSpriteFrame(FIRE_SPRITE, 22), {
    index: 0,
    column: 0,
    row: 0,
  });
});

test('원본 PNG는 1536×1024 RGBA 스프라이트다', async () => {
  const png = await readFile('images/character-effects/fire-effect-01.png');

  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1536);
  assert.equal(png.readUInt32BE(20), 1024);
  assert.equal(png[25], 6, 'PNG color type 6 must include alpha');
});

test('공통 CSS와 화면별 렌더링 경로가 발 기준 컨텍스트를 유지한다', async () => {
  const [css, profile, postDetail, postComments] = await Promise.all([
    readFile('assets/css/components/character-effects.css', 'utf8'),
    readFile('assets/js/modules/profile.js', 'utf8'),
    readFile('assets/js/modules/post-detail.js', 'utf8'),
    readFile('assets/js/modules/post-comments.js', 'utf8'),
  ]);

  assert.match(css, /data-character-effect-context='profile'/);
  assert.match(css, /data-character-effect-context='inventory'/);
  assert.match(css, /data-character-effect-context='post'/);
  assert.match(css, /data-character-effect-context='comment'/);
  assert.match(css, /bottom: var\(--character-effect-ground-offset, 0px\)/);
  assert.match(css, /--character-effect-anchor-y: 0%/);
  assert.match(css, /transform-origin: 50% 100%/);
  assert.match(profile, /\? 'inventory'\s*:\s*'profile'/);
  assert.match(postDetail, /getCharacterEffectRenderMeta\(effectItemId, 'post'\)/);
  assert.match(postComments, /getCharacterEffectRenderMeta\(characterEffectItemId, 'comment'\)/);
});

test('루트와 www의 불꽃 렌더링 파일이 일치한다', async () => {
  const mirrors = [
    'assets/css/components/character-effects.css',
    'assets/js/modules/character-effects.js',
    'assets/js/modules/store-data.js',
  ];

  await Promise.all(
    mirrors.map(async (path) => {
      assert.equal(
        await readFile(path, 'utf8'),
        await readFile(`www/${path}`, 'utf8'),
        `${path} must match www/${path}`,
      );
    }),
  );
});

test('구매 SQL은 서버 가격·원자성·원장·엄격 잔액 정책을 포함한다', async () => {
  const sql = await readFile(
    'supabase-SQLEditor/store-item_purchase-functions.sql',
    'utf8',
  );
  const backupSql = await readFile(
    'supabase-SQLEditor/99_all_backup.sql',
    'utf8',
  );

  assert.match(
    sql,
    /p_item_id = 'cha-effects-fire-01'[\s\S]*?v_price := 496;[\s\S]*?v_category := 'cha-effects';/,
  );
  assert.match(sql, /from public\.profiles p[\s\S]*?for update;/);
  assert.match(
    sql,
    /set pickles = coalesce\(pickles, 0\) - v_price[\s\S]*?coalesce\(pickles, 0\) >= v_price;/,
  );
  assert.match(sql, /insert into public\.user_store_items/);
  assert.match(sql, /insert into public\.pickle_ledger/);
  assert.match(sql, /'store_purchase'/);
  assert.equal(
    sql.indexOf('for update;') < sql.indexOf('v_exists := exists'),
    true,
    'the profile lock must serialize duplicate checks before charging',
  );
  assert.match(backupSql, /unique \(user_id, item_id\)/);
  assert.equal(
    [...sql.matchAll(/'cha-effects-fire-01'/g)].length >= 5,
    true,
  );
});

test('장착 보호 마이그레이션은 보유한 효과만 허용한다', async () => {
  const sql = await readFile(
    'supabase/migrations/20260728030000_fire_character_effect.sql',
    'utf8',
  );

  assert.match(sql, /enforce_equipped_character_effect_ownership/);
  assert.match(sql, /item\.user_id = new\.id/);
  assert.match(sql, /item\.item_category = 'cha-effects'/);
  assert.match(sql, /CHARACTER_EFFECT_NOT_OWNED/);
  assert.match(sql, /revoke all[\s\S]*from public, anon, authenticated;/);
});
