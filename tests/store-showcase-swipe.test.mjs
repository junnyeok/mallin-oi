import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile('assets/js/modules/store.js', 'utf8');
const initSource = source.slice(
  source.indexOf('function initHomeStoreSection()'),
  source.indexOf('\nasync function loadMyPickles()'),
);

function createHarness({ width = 390, count = 15, reduced = false } = {}) {
  class Element extends EventTarget {
    style = {};
    textContent = '';
    disabled = false;
    captures = new Set();
    classes = new Set();
    classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    getBoundingClientRect() { return { width: this.clientWidth }; }
  }
  const window = new EventTarget();
  window.innerWidth = width;
  const document = new EventTarget();
  document.hidden = false;
  const media = new EventTarget();
  media.matches = reduced;
  window.matchMedia = () => media;
  const elements = Object.fromEntries(
    ['storeFeaturedGrid', 'storeFeaturedViewport', 'storePrevBtn', 'storeNextBtn', 'storeFeaturedStatus']
      .map((id) => [id, new Element()]),
  );
  const track = elements.storeFeaturedGrid;
  const viewport = elements.storeFeaturedViewport;
  Object.defineProperty(viewport, 'clientWidth', { get: () => window.innerWidth <= 768 ? 260 : 1000 });
  const cards = Array.from({ length: count }, (_, index) => ({
    get offsetLeft() {
      return index * (window.innerWidth <= 768 ? 272 : 203.2);
    },
  }));
  track.querySelectorAll = () => cards;
  let renderedOffset = null;
  const offset = () => Number(track.style.transform.match(/translate3d\(([-\d.]+)/)?.[1]) || 0;
  window.getComputedStyle = () => ({ transform: `matrix(1, 0, 0, 1, ${renderedOffset ?? offset()}, 0)` });
  let timerId = 0;
  const timers = new Map();
  window.setInterval = (callback) => { timers.set(++timerId, callback); return timerId; };
  const context = vm.createContext({
    window, document, AbortController, Date,
    clearInterval: (id) => timers.delete(id),
    HOME_STORE_MOBILE_BREAKPOINT: 768,
    HOME_STORE_MOBILE_VISIBLE: 1,
    HOME_STORE_DESKTOP_VISIBLE: 5,
    HOME_STORE_AUTOPLAY_MS: 5000,
    BEFORE_PJAX_SWAP_EVENT: 'mallin:before-pjax-swap',
    $: (selector) => elements[selector.slice(1)],
    getFeaturedStoreItems: () => cards,
    renderStoreCard: () => '<article class="store-card"></article>',
    prepareCharacterEffects: () => {},
  });
  vm.runInContext(`let homeStoreCleanup = null; ${initSource};`, context);
  const init = () => vm.runInContext('initHomeStoreSection()', context);
  function fire(target, type, props = {}) {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, props);
    target.dispatchEvent(event);
    return event;
  }
  const pointer = (phase, x, y = 100, props = {}) => fire(
    phase === 'down' ? viewport : window,
    `pointer${phase}`,
    { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...props },
  );
  const click = (direction) => fire(elements[direction === 'next' ? 'storeNextBtn' : 'storePrevBtn'], 'click', { detail: 1 });
  init();
  return { window, document, media, elements, track, viewport, timers, offset, pointer, click, fire, init,
    status: () => elements.storeFeaturedStatus.textContent,
    setRenderedOffset: (value) => { renderedOffset = value; },
  };
}

test('손을 떼기 전 이동량을 즉시 반영하고 놓으면 다음 카드로 정착한다', () => {
  const h = createHarness();
  h.pointer('down', 220);
  assert.equal(h.timers.size, 0);
  assert.equal(h.pointer('move', 200).defaultPrevented, true);
  assert.equal(h.offset(), -20);
  assert.equal(h.track.classList.contains('is-dragging'), true);
  h.pointer('move', 130);
  assert.equal(h.offset(), -90);
  assert.equal(h.status(), '1 / 15');
  h.pointer('up', 130);
  assert.equal(h.status(), '2 / 15');
  assert.equal(h.offset(), -272);
  assert.equal(h.track.classList.contains('is-dragging'), false);
  assert.equal(h.track.classList.contains('is-instant'), false);
  assert.equal(h.viewport.captures.size, 0);
  assert.equal(h.timers.size, 1);
});

test('짧은 드래그는 복귀하고 드래그 직후 클릭만 차단한다', () => {
  const h = createHarness();
  h.pointer('down', 200);
  h.pointer('move', 170);
  h.pointer('up', 170);
  assert.equal(h.offset(), 0);
  assert.equal(h.status(), '1 / 15');
  assert.equal(h.fire(h.viewport, 'click', { detail: 1 }).defaultPrevented, true);
  assert.equal(h.fire(h.viewport, 'click', { detail: 0 }).defaultPrevented, false);
  h.pointer('down', 200);
  h.pointer('up', 200);
  assert.equal(h.fire(h.viewport, 'click', { detail: 1 }).defaultPrevented, false);
});

test('세로 방향으로 시작한 스크롤은 가로로 바꾸거나 기본 동작을 막지 않는다', () => {
  const h = createHarness();
  h.pointer('down', 200, 100);
  assert.equal(h.pointer('move', 190, 155).defaultPrevented, false);
  assert.equal(h.pointer('move', 90, 180).defaultPrevented, false);
  assert.equal(h.offset(), 0);
  h.pointer('up', 90, 180);
  assert.equal(h.status(), '1 / 15');
  assert.equal(h.fire(h.viewport, 'click', { detail: 1 }).defaultPrevented, false);
});

test('취소·포인터 캡처 유실·두 손가락 입력은 품목을 바꾸지 않는다', () => {
  for (const ending of ['cancel', 'capture', 'multitouch']) {
    const h = createHarness();
    h.pointer('down', 200);
    h.pointer('move', 100);
    h.pointer('move', 0, 100, { pointerId: 2 });
    assert.equal(h.offset(), -100);
    if (ending === 'cancel') h.pointer('cancel', 100);
    if (ending === 'capture') h.fire(h.viewport, 'lostpointercapture', { pointerId: 1 });
    if (ending === 'multitouch') h.pointer('down', 100, 100, { pointerId: 2, isPrimary: false });
    assert.equal(h.offset(), 0);
    assert.equal(h.status(), '1 / 15');
    assert.equal(h.track.classList.contains('is-dragging'), false);
    h.pointer('up', 100);
    assert.equal(h.status(), '1 / 15');
  }
});

test('모바일 마우스 드래그도 지원하고 데스크톱은 기존 버튼 단위를 유지한다', () => {
  const h = createHarness();
  h.pointer('down', 200, 100, { pointerType: 'mouse' });
  h.pointer('move', 100, 100, { pointerType: 'mouse' });
  h.pointer('up', 100, 100, { pointerType: 'mouse' });
  assert.equal(h.status(), '2 / 15');
  const desktop = createHarness({ width: 1200 });
  desktop.pointer('down', 200);
  desktop.pointer('move', 100);
  desktop.pointer('up', 100);
  assert.equal(desktop.status(), '1 / 3');
  desktop.click('next');
  assert.equal(desktop.status(), '2 / 3');
  assert.equal(desktop.offset(), -1016);
});

test('애니메이션 중 잡으면 목표 좌표가 아닌 실제 표시 위치에서 따라온다', () => {
  const h = createHarness();
  h.click('next');
  h.setRenderedOffset(-180);
  h.pointer('down', 200);
  h.pointer('move', 150);
  assert.equal(h.offset(), -230);
});

test('양 끝 저항과 순환 이동은 유지하되 터치 순환은 전체 트랙을 역주행하지 않는다', () => {
  const h = createHarness();
  h.pointer('down', 150);
  h.pointer('move', 250);
  assert.equal(h.offset(), 25);
  h.pointer('up', 250);
  assert.equal(h.status(), '15 / 15');
  assert.equal(h.track.classList.contains('is-instant'), true);
  h.pointer('down', 200);
  h.pointer('move', 100);
  assert.equal(h.offset(), -14 * 272 - 25);
  h.pointer('up', 100);
  assert.equal(h.status(), '1 / 15');
  h.click('prev');
  assert.equal(h.status(), '15 / 15');
  assert.equal(h.track.classList.contains('is-instant'), false);
});

test('드래그 중 자동 넘김·페이지 숨김·화면 크기 변경을 안전하게 처리한다', () => {
  const h = createHarness();
  h.pointer('down', 200);
  h.fire(h.viewport, 'mouseleave');
  assert.equal(h.timers.size, 0);
  h.pointer('move', 100);
  h.document.hidden = true;
  h.fire(h.document, 'visibilitychange');
  assert.equal(h.offset(), 0);
  assert.equal(h.timers.size, 0);
  h.document.hidden = false;
  h.fire(h.document, 'visibilitychange');
  assert.equal(h.timers.size, 1);
  h.click('next');
  h.pointer('down', 200);
  h.pointer('move', 100);
  h.window.innerWidth = 1200;
  h.fire(h.window, 'resize');
  assert.equal(h.status(), '1 / 3');
  assert.equal(h.track.classList.contains('is-dragging'), false);
  h.click('next');
  h.window.innerWidth = 390;
  h.fire(h.window, 'resize');
  assert.equal(h.status(), '6 / 15');
});

test('동작 줄이기는 자동 넘김·정착 애니메이션만 끄고 직접 드래그는 유지한다', () => {
  const h = createHarness({ reduced: true });
  assert.equal(h.timers.size, 0);
  h.pointer('down', 200);
  h.pointer('move', 100);
  assert.equal(h.offset(), -100);
  h.pointer('up', 100);
  assert.equal(h.status(), '2 / 15');
  assert.equal(h.track.classList.contains('is-instant'), true);
  assert.equal(h.timers.size, 0);
  h.media.matches = false;
  h.fire(h.media, 'change');
  assert.equal(h.timers.size, 1);
});

test('재초기화·PJAX 이탈·페이지 복원에서 이벤트와 타이머가 중복되지 않는다', () => {
  const h = createHarness();
  h.init();
  assert.equal(h.timers.size, 1);
  h.click('next');
  assert.equal(h.status(), '2 / 15');
  h.fire(h.window, 'pagehide');
  assert.equal(h.timers.size, 0);
  h.fire(h.window, 'pageshow');
  assert.equal(h.timers.size, 1);
  h.fire(h.window, 'mallin:before-pjax-swap');
  assert.equal(h.timers.size, 0);
  h.click('next');
  assert.equal(h.status(), '2 / 15');
});

test('한 품목만 있으면 자동 재생·드래그·양쪽 버튼을 비활성화한다', () => {
  const h = createHarness({ count: 1 });
  assert.equal(h.elements.storePrevBtn.disabled, true);
  assert.equal(h.elements.storeNextBtn.disabled, true);
  assert.equal(h.timers.size, 0);
  h.pointer('down', 200);
  h.pointer('move', 100);
  assert.equal(h.offset(), 0);
});

test('공통 CSS는 직접 드래그·세로 스크롤·확대를 지원하고 원본/www가 같다', async () => {
  const css = await readFile('assets/css/main/store-main.css', 'utf8');
  assert.match(css, /\.store-showcase__viewport\s*\{[^}]*touch-action: pan-y pinch-zoom;/);
  assert.match(css, /\.store-showcase__track\.is-dragging,[\s\S]*?transition: none;/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\s*\{\s*#featuredStoreSection \.store-showcase__track\s*\{\s*transition: none;/);
  assert.ok(!initSource.includes('touchend'));
  assert.ok(!initSource.includes('style.transition'));
  assert.equal(source, await readFile('www/assets/js/modules/store.js', 'utf8'));
  assert.equal(css, await readFile('www/assets/css/main/store-main.css', 'utf8'));
});
