import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile('assets/js/modules/service-menu.js', 'utf8');

function createHarness() {
  class Element extends EventTarget {
    dataset = {};
    hidden = true;
    classes = new Set();
    attributes = new Map();
    captures = new Set();
    listeners = [];
    style = {
      setProperty(name, value) { this[name] = value; },
      removeProperty(name) { delete this[name]; },
    };
    classList = {
      add: (name) => this.classes.add(name),
      remove: (name) => this.classes.delete(name),
      contains: (name) => this.classes.has(name),
    };
    addEventListener(type, listener, options) {
      this.listeners.push({ type, options });
      super.addEventListener(type, listener, options);
    }
    setAttribute(name, value) { this.attributes.set(name, value); }
    focus(options) { this.focusOptions = options; }
    getBoundingClientRect() { return { width: 346 }; }
    setPointerCapture(id) { this.captures.add(id); }
    hasPointerCapture(id) { return this.captures.has(id); }
    releasePointerCapture(id) { this.captures.delete(id); }
    querySelectorAll() { return []; }
  }
  const ids = ['serviceMenu', 'serviceMenuBtn', 'serviceMenuPanel', 'serviceMenuCloseBtn', 'serviceMenuBackdrop', 'calendarManageBtn', 'calendarManagePanel', 'calendarManageBackdrop', 'calendarManageCloseBtn'];
  const elements = Object.fromEntries(ids.map(id => [id, new Element()]));
  const menu = elements.serviceMenu;
  const panel = elements.serviceMenuPanel;
  const button = elements.serviceMenuBtn;
  menu.contains = target => Object.values(elements).includes(target);
  elements.calendarManagePanel.contains = target => target === elements.calendarManagePanel;
  const document = new EventTarget();
  document.body = new Element();
  document.documentElement = new Element();
  document.getElementById = id => elements[id];
  const window = new EventTarget();
  window.scrollX = 0;
  window.scrollY = 420;
  window.scrollCalls = [];
  window.scrollTo = options => {
    window.scrollCalls.push(options);
    window.scrollX = options.left;
    window.scrollY = options.top;
  };
  let now = 0;
  let nextId = 0;
  const timers = new Map();
  const frames = new Map();
  window.setTimeout = callback => { timers.set(++nextId, callback); return nextId; };
  const context = vm.createContext({
    window, document, Node: Element, Date,
    performance: { now: () => now },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { frames.set(++nextId, callback); return nextId; },
    cancelAnimationFrame: id => frames.delete(id),
  });
  vm.runInContext(source.replace(/^export /gm, '') + '\ninitServiceMenu();', context);
  const flush = queue => {
    const callbacks = [...queue.values()];
    queue.clear();
    callbacks.forEach(callback => callback());
  };
  const fire = (target, type, props = {}) => {
    const { cancelable = true, originTarget, ...rest } = props;
    const event = new Event(type, { cancelable });
    Object.assign(event, rest);
    if (originTarget) Object.defineProperty(event, 'target', { value: originTarget });
    event.stopPropagation = () => { event.propagationStopped = true; };
    target.dispatchEvent(event);
    return event;
  };
  const pointer = (phase, x, y = 200, props = {}) => fire(panel, `pointer${phase}`, {
    pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, ...props,
  });
  const touch = (x, y = 200, props = {}) => fire(panel, 'touchmove', {
    touches: [{ clientX: x, clientY: y }], ...props,
  });
  return {
    window, document, elements, menu, panel, button, fire, pointer, touch,
    open() { fire(button, 'click'); flush(frames); },
    frames: () => flush(frames), timers: () => flush(timers),
    advance(ms) { now += ms; },
    isOpen: () => menu.classList.contains('is-open'),
    isLocked: () => document.body.classList.contains('service-menu-open'),
  };
}

test('열 때 배경 위치를 저장하고 닫는 전환이 끝난 뒤 같은 위치로 복귀한다', () => {
  const h = createHarness();
  h.document.body.style.color = 'red';
  h.open();
  assert.equal(h.isLocked(), true);
  assert.equal(h.document.documentElement.classList.contains('service-menu-scroll-locked'), true);
  assert.equal(h.document.body.style['--service-menu-scroll-y'], '-420px');
  assert.equal(h.elements.serviceMenuCloseBtn.focusOptions.preventScroll, true);
  h.fire(h.elements.serviceMenuCloseBtn, 'click');
  assert.equal(h.isOpen(), false);
  assert.equal(h.isLocked(), true);
  assert.equal(h.button.focusOptions.preventScroll, true);
  h.timers();
  assert.equal(h.panel.hidden, true);
  assert.equal(h.isLocked(), false);
  assert.equal(h.document.documentElement.classList.contains('service-menu-scroll-locked'), false);
  assert.equal(h.document.body.style['--service-menu-scroll-y'], undefined);
  assert.equal(h.window.scrollY, 420);
  assert.equal(h.window.scrollCalls[0].behavior, 'instant');
  assert.equal(h.document.body.style.color, 'red');
});

test('첫 미세한 오른쪽 터치부터 스크롤을 막고 세로 흔들림에도 닫기를 완료한다', () => {
  const h = createHarness();
  h.open();
  const listener = h.panel.listeners.find(item => item.type === 'touchmove');
  assert.equal(listener.options.passive, false);
  assert.equal(listener.options.capture, true);
  h.pointer('down', 100);
  h.pointer('move', 102, 201);
  const first = h.touch(102, 201);
  assert.equal(first.defaultPrevented, true);
  assert.equal(first.propagationStopped, true);
  assert.equal(h.panel.style.transform, 'translate3d(2px, 0, 0)');
  assert.equal(h.panel.hasPointerCapture(1), true);
  h.pointer('move', 150, 310);
  assert.equal(h.touch(150, 310).defaultPrevented, true);
  assert.equal(h.panel.style.transform, 'translate3d(50px, 0, 0)');
  h.advance(500);
  h.pointer('up', 250, 320);
  assert.equal(h.isOpen(), false);
  assert.equal(h.isLocked(), true);
  assert.equal(h.panel.captures.size, 0);
  assert.equal(h.fire(h.panel, 'click', { detail: 1 }).defaultPrevented, true);
  assert.equal(h.fire(h.panel, 'click', { detail: 0 }).defaultPrevented, false);
  h.timers();
  assert.equal(h.isLocked(), false);
});

test('처음부터 세로로 스크롤하면 메뉴 내부 스크롤을 허용하고 닫지 않는다', () => {
  const h = createHarness();
  h.open();
  h.pointer('down', 100);
  assert.equal(h.touch(101, 204).defaultPrevented, false);
  h.pointer('move', 220, 230);
  assert.equal(h.touch(220, 230).defaultPrevented, false);
  h.pointer('up', 220, 230);
  assert.equal(h.isOpen(), true);
  assert.equal(h.isLocked(), true);
  assert.equal(h.panel.style.transform, undefined);
  assert.equal(h.fire(h.panel, 'click', { detail: 1 }).defaultPrevented, false);
});

test('짧은 드래그는 복귀하고 충분히 빠른 오른쪽 플릭은 닫힌다', () => {
  const h = createHarness();
  h.open();
  h.pointer('down', 100);
  h.touch(130);
  h.advance(500);
  h.pointer('up', 130);
  assert.equal(h.isOpen(), true);
  assert.equal(h.panel.style.transform, undefined);
  h.pointer('down', 100);
  h.touch(160);
  h.advance(80);
  h.pointer('up', 160);
  assert.equal(h.isOpen(), false);
});

test('취소·캡처 손실·여러 손가락은 안전하게 복귀하고 다음 스와이프가 가능하다', () => {
  for (const ending of ['cancel', 'lost', 'multi']) {
    const h = createHarness();
    h.open();
    h.pointer('down', 100);
    h.touch(130);
    if (ending === 'cancel') h.pointer('cancel', 130);
    if (ending === 'lost') h.fire(h.panel, 'lostpointercapture', { pointerId: 1 });
    if (ending === 'multi') h.pointer('down', 150, 220, { pointerId: 2, isPrimary: false });
    assert.equal(h.isOpen(), true);
    assert.equal(h.panel.style.transform, undefined);
    assert.equal(h.panel.captures.size, 0);
    assert.equal(h.touch(250).defaultPrevented, false);
    h.pointer('down', 100);
    h.touch(250);
    h.pointer('up', 250);
    assert.equal(h.isOpen(), false);
  }
});

test('자식의 암묵적 캡처 이동과 취소 불가능한 터치 이벤트가 드래그를 깨지 않는다', () => {
  const h = createHarness();
  h.open();
  h.pointer('down', 100);
  h.touch(120);
  h.fire(h.panel, 'lostpointercapture', { pointerId: 1, originTarget: h.elements.serviceMenuCloseBtn });
  assert.equal(h.touch(200, 250, { cancelable: false }).defaultPrevented, false);
  assert.equal(h.panel.style.transform, 'translate3d(100px, 0, 0)');
  h.pointer('up', 220, 250);
  assert.equal(h.isOpen(), false);
});

test('왼쪽 가장자리·마우스·왼쪽 제스처는 오른쪽 닫기를 실행하지 않는다', () => {
  for (const [x, props] of [[12, {}], [100, { pointerType: 'mouse' }]]) {
    const h = createHarness();
    h.open();
    h.pointer('down', x, 200, props);
    assert.equal(h.touch(250).defaultPrevented, false);
    h.pointer('up', 250);
    assert.equal(h.isOpen(), true);
  }
  const h = createHarness();
  h.open();
  h.pointer('down', 200);
  assert.equal(h.touch(180).defaultPrevented, false);
  h.pointer('up', 50);
  assert.equal(h.isOpen(), true);
});

test('빠르게 재열어도 잠금 위치를 잃지 않고 페이지 이동 전 잠금·타이머를 정리한다', () => {
  const h = createHarness();
  h.open();
  h.fire(h.elements.serviceMenuCloseBtn, 'click');
  h.window.scrollY = 0;
  h.open();
  h.timers();
  assert.equal(h.isOpen(), true);
  assert.equal(h.isLocked(), true);
  assert.equal(h.document.body.style['--service-menu-scroll-y'], '-420px');
  h.fire(h.window, 'mallin:before-pjax-swap');
  assert.equal(h.isLocked(), false);
  assert.equal(h.window.scrollY, 420);
  h.window.scrollY = 0;
  h.timers();
  assert.equal(h.window.scrollY, 0);
});

test('Escape·배경·페이지 이탈·열기 프레임 취소에서도 잠금이 남지 않는다', () => {
  for (const ending of ['escape', 'backdrop', 'pagehide']) {
    const h = createHarness();
    h.open();
    if (ending === 'escape') h.fire(h.document, 'keydown', { key: 'Escape' });
    if (ending === 'backdrop') h.fire(h.elements.serviceMenuBackdrop, 'click');
    if (ending === 'pagehide') h.fire(h.window, 'pagehide');
    h.timers();
    assert.equal(h.isOpen(), false);
    assert.equal(h.isLocked(), false);
  }
  const h = createHarness();
  h.fire(h.button, 'click');
  h.fire(h.window, 'pagehide');
  h.frames();
  assert.equal(h.isOpen(), false);
  assert.equal(h.isLocked(), false);
});

test('루트/www가 일치하고 배경 고정·메뉴 내부 세로 스크롤·모션 감소를 유지한다', async () => {
  const css = await readFile('assets/css/components/write-btn.css', 'utf8');
  assert.equal(source, await readFile('www/assets/js/modules/service-menu.js', 'utf8'));
  assert.equal(css, await readFile('www/assets/css/components/write-btn.css', 'utf8'));
  assert.match(css, /body\.service-menu-open\s*\{[^}]*position: fixed;[^}]*top: var\(--service-menu-scroll-y, 0px\);/);
  assert.match(css, /html\.service-menu-scroll-locked\s*\{[^}]*overscroll-behavior: none;/);
  assert.match(css, /\.service-menu__panel\s*\{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;[^}]*touch-action: pan-y pinch-zoom;/);
  assert.match(css, /\.service-menu__backdrop\s*\{[^}]*touch-action: none;/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.service-menu__panel\s*\{\s*transition: none;/);
});
