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
    listeners = [];
    classes = new Set();
    classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
    addEventListener(type, listener, options) {
      this.listeners.push({ type, options });
      super.addEventListener(type, listener, options);
    }
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
    const { cancelable = true, originTarget, ...eventProps } = props;
    const event = new Event(type, { cancelable });
    Object.assign(event, eventProps);
    if (originTarget) Object.defineProperty(event, 'target', { value: originTarget });
    event.stopPropagation = () => {
      event.propagationStopped = true;
      Event.prototype.stopPropagation.call(event);
    };
    target.dispatchEvent(event);
    return event;
  }
  const pointer = (phase, x, y = 100, props = {}) => fire(
    phase === 'down' ? viewport : window,
    `pointer${phase}`,
    { pointerId: 1, pointerType: 'touch', isPrimary: true, button: 0, clientX: x, clientY: y, ...props },
  );
  const click = (direction) => fire(elements[direction === 'next' ? 'storeNextBtn' : 'storePrevBtn'], 'click', { detail: 1 });
  const touchMove = (x, y = 100, props = {}) => fire(viewport, 'touchmove', {
    touches: [{ identifier: 0, clientX: x, clientY: y }], ...props,
  });
  init();
  return { window, document, media, elements, track, viewport, timers, offset, pointer, touchMove, click, fire, init,
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

test('첫 미세한 가로 touchmove부터 세로 스크롤과 상위 새로고침을 막는다', () => {
  const h = createHarness();
  const listener = h.viewport.listeners.find(({ type }) => type === 'touchmove');
  assert.equal(listener.options.passive, false);
  assert.equal(listener.options.capture, true);
  assert.ok(listener.options.signal);
  h.pointer('down', 220, 100);
  h.pointer('move', 218, 101);
  const firstMove = h.touchMove(218, 101);
  assert.equal(firstMove.defaultPrevented, true);
  assert.equal(firstMove.propagationStopped, true);
  assert.equal(h.viewport.hasPointerCapture(1), true);

  // 가로로 시작한 뒤 세로 이동량이 더 커져도 방향은 바뀌지 않는다.
  h.pointer('move', 190, 175);
  const diagonalMove = h.touchMove(190, 175);
  assert.equal(diagonalMove.defaultPrevented, true);
  assert.equal(h.offset(), -30);
  h.pointer('move', 120, 185);
  assert.equal(h.touchMove(120, 185).defaultPrevented, true);
  assert.equal(h.offset(), -100);
  h.pointer('up', 120, 185);
  assert.equal(h.status(), '2 / 15');
  assert.equal(h.touchMove(100, 200).defaultPrevented, false);
});

test('세로 터치로 시작한 입력과 다음 새 제스처의 일반 스크롤은 유지한다', () => {
  const h = createHarness();
  h.pointer('down', 200, 100);
  const verticalMove = h.touchMove(199, 104);
  assert.equal(verticalMove.defaultPrevented, false);
  assert.equal(verticalMove.propagationStopped, undefined);
  h.pointer('move', 110, 150);
  assert.equal(h.touchMove(110, 150).defaultPrevented, false);
  assert.equal(h.offset(), 0);
  h.pointer('cancel', 110, 150);
  h.pointer('down', 200, 100);
  assert.equal(h.touchMove(180, 101).defaultPrevented, true);
  h.pointer('cancel', 180, 101);
  h.pointer('down', 200, 100);
  assert.equal(h.touchMove(201, 120).defaultPrevented, false);
});

test('두 손가락 확대·비활성 슬라이더·마우스 입력은 터치 스크롤 잠금에서 제외한다', () => {
  const h = createHarness();
  h.pointer('down', 200);
  assert.equal(h.touchMove(180).defaultPrevented, true);
  h.pointer('move', 100);
  const multi = h.touchMove(100, 100, { touches: [{}, {}] });
  assert.equal(multi.defaultPrevented, false);
  assert.equal(multi.propagationStopped, undefined);
  assert.equal(h.viewport.captures.size, 0);
  assert.equal(h.status(), '1 / 15');
  assert.equal(h.offset(), 0);
  assert.equal(h.touchMove(80).defaultPrevented, false);

  for (const options of [{ width: 1200 }, { count: 1 }]) {
    const inactive = createHarness(options);
    inactive.pointer('down', 200);
    assert.equal(inactive.touchMove(100).defaultPrevented, false);
  }
  const mouse = createHarness();
  mouse.pointer('down', 200, 100, { pointerType: 'mouse' });
  assert.equal(mouse.touchMove(100).defaultPrevented, false);
});

test('취소 불가 터치에서 preventDefault 경고를 내지 않고 PJAX 뒤 잠금 리스너를 해제한다', () => {
  const h = createHarness();
  h.pointer('down', 200);
  assert.equal(h.touchMove(180, 100, { cancelable: false }).defaultPrevented, false);
  h.fire(h.window, 'mallin:before-pjax-swap');
  assert.equal(h.viewport.captures.size, 0);
  h.pointer('down', 200);
  assert.equal(h.touchMove(180).defaultPrevented, false);
  h.init();
  h.pointer('down', 200);
  assert.equal(h.touchMove(180).defaultPrevented, true);
});

test('카드 자식의 암묵적 캡처를 슬라이더로 넘길 때 터치 드래그를 취소하지 않는다', () => {
  const h = createHarness();
  h.pointer('down', 220);
  h.pointer('move', 200);
  assert.equal(h.offset(), -20);
  // 실제 터치는 누른 이미지/링크가 먼저 암묵적으로 캡처한다.
  // viewport로 캡처를 넘기면 자식에서 발생한 lostpointercapture가 버블링한다.
  h.fire(h.viewport, 'lostpointercapture', {
    pointerId: 1, originTarget: { id: 'product-image' },
  });
  assert.equal(h.offset(), -20);
  assert.equal(h.viewport.hasPointerCapture(1), true);
  h.pointer('move', 120, 130);
  assert.equal(h.touchMove(120, 130).defaultPrevented, true);
  assert.equal(h.offset(), -100);
  h.pointer('up', 120, 130);
  assert.equal(h.status(), '2 / 15');
});

test('주소 표시줄에 의한 높이 전용 resize는 진행 중인 드래그를 되돌리지 않는다', () => {
  const h = createHarness();
  h.pointer('down', 220);
  h.pointer('move', 200);
  h.window.innerHeight = 740;
  h.fire(h.window, 'resize');
  assert.equal(h.offset(), -20);
  assert.equal(h.viewport.hasPointerCapture(1), true);
  assert.equal(h.timers.size, 0);
  h.pointer('move', 120);
  h.pointer('up', 120);
  assert.equal(h.status(), '2 / 15');
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
