import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  calculateXpGainOrigin,
  createWholeXpGainAccumulator,
  formatXpGainAmount,
  showXpGain,
  XP_GAIN_EFFECT_CONFIG,
} from "../js/xp-gain-effect.js";

class FakeStyle {
  constructor() {
    this.properties = new Map();
  }

  setProperty(name, value) {
    this.properties.set(name, value);
  }

  getPropertyValue(name) {
    return this.properties.get(name) ?? "";
  }
}

class FakeElement {
  constructor(ownerDocument, rect = null) {
    this.ownerDocument = ownerDocument;
    this.rect = rect;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = new FakeStyle();
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = "";
    this.textContent = "";
  }

  append(...children) {
    children.forEach((child) => {
      child.parentNode = this;
      this.children.push(child);
    });
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(
      (child) => child !== this
    );
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options.once) });
    this.listeners.set(type, listeners);
  }

  dispatchAnimationEnd(animationName) {
    const listeners = [...(this.listeners.get("animationend") ?? [])];
    listeners.forEach(({ listener, once }) => {
      listener({ type: "animationend", target: this, animationName });
      if (once) {
        this.listeners.set(
          "animationend",
          (this.listeners.get("animationend") ?? []).filter(
            (entry) => entry.listener !== listener
          )
        );
      }
    });
  }

  getBoundingClientRect() {
    return this.rect;
  }
}

class FakeWindow {
  constructor() {
    this.nextTimerId = 1;
    this.timers = new Map();
  }

  setTimeout(callback, delay) {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, { callback, delay });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  runAllTimers() {
    const timers = [...this.timers.values()];
    this.timers.clear();
    timers.forEach(({ callback }) => callback());
  }
}

class FakeDocument {
  constructor(windowRef) {
    this.defaultView = windowRef;
  }

  createElement() {
    return new FakeElement(this);
  }
}

function createFixture() {
  const windowRef = new FakeWindow();
  const documentRef = new FakeDocument(windowRef);
  const container = new FakeElement(documentRef, {
    left: 10,
    top: 20,
    width: 390,
    height: 360,
  });
  const anchor = new FakeElement(documentRef, {
    left: 105,
    top: 48,
    width: 200,
    height: 240,
  });

  return { windowRef, documentRef, container, anchor };
}

test("정상 양수 경험치는 공백 없는 숫자XP 문구를 머리 위에 생성한다", () => {
  const fixture = createFixture();
  const effect = showXpGain(35, fixture);

  assert.ok(effect);
  assert.equal(effect.textContent, "35XP");
  assert.equal(effect.dataset.amount, "35");
  assert.equal(effect.dataset.source, "generic");
  assert.equal(effect.attributes.get("aria-hidden"), "true");
  assert.equal(effect.parentNode, fixture.container);
  assert.equal(
    effect.style.getPropertyValue("--xp-duration"),
    `${XP_GAIN_EFFECT_CONFIG.durationMs}ms`
  );
  assert.equal(formatXpGainAmount(0.25), "0.25");
});

test("0, 음수, NaN과 잘못된 값은 효과를 만들지 않는다", () => {
  const fixture = createFixture();

  [0, -1, Number.NaN, Number.POSITIVE_INFINITY, "invalid", null].forEach(
    (amount) => assert.equal(showXpGain(amount, fixture), null)
  );
  assert.equal(fixture.container.children.length, 0);
  assert.equal(fixture.windowRef.timers.size, 0);
});

test("자동 생산 소수 지급은 확정값만 누적해 정수 XP 단위로 표시한다", () => {
  const accumulator = createWholeXpGainAccumulator();

  assert.equal(accumulator.add(0.023), 0);
  assert.equal(accumulator.add(0.243), 0);
  assert.equal(accumulator.add(0.734), 1);
  assert.ok(Math.abs(accumulator.getPendingAmount()) < Number.EPSILON * 4);
  assert.equal(accumulator.add(Number.NaN), 0);
  accumulator.reset();
  assert.equal(accumulator.getPendingAmount(), 0);
});

test("연속 효과는 다른 레인에서 독립 실행되고 각 애니메이션 종료 시 제거된다", () => {
  const fixture = createFixture();
  const first = showXpGain(1, { ...fixture, source: "watering" });
  const second = showXpGain(2, { ...fixture, source: "production" });

  assert.equal(fixture.container.children.length, 2);
  assert.notEqual(first.dataset.lane, second.dataset.lane);
  assert.notEqual(
    first.style.getPropertyValue("--xp-offset-x"),
    second.style.getPropertyValue("--xp-offset-x")
  );

  first.dispatchAnimationEnd("xp-gain-spark");
  assert.equal(fixture.container.children.length, 2);
  first.dispatchAnimationEnd("xp-gain-float");
  assert.equal(fixture.container.children.length, 1);
  assert.equal(second.parentNode, fixture.container);

  second.dispatchAnimationEnd("xp-gain-fade-reduced");
  assert.equal(fixture.container.children.length, 0);
  assert.equal(fixture.windowRef.timers.size, 0);
});

test("animationend가 없어도 안전 타이머가 생성 요소를 완전히 정리한다", () => {
  const fixture = createFixture();
  const effect = showXpGain(3, fixture);

  assert.equal(fixture.windowRef.timers.size, 1);
  fixture.windowRef.runAllTimers();
  assert.equal(effect.parentNode, null);
  assert.equal(fixture.container.children.length, 0);
  assert.equal(fixture.windowRef.timers.size, 0);
});

test("모바일과 데스크톱 원점은 컨테이너 안에서 캐릭터 중앙을 따른다", () => {
  const mobile = calculateXpGainOrigin(
    { left: 0, top: 100, width: 390, height: 360 },
    { left: 95, top: 130, width: 200, height: 240 }
  );
  const desktop = calculateXpGainOrigin(
    { left: 40, top: 180, width: 756, height: 617 },
    { left: 238, top: 208, width: 360, height: 430 }
  );

  assert.deepEqual(mobile, { x: 195, y: 61.2 });
  assert.deepEqual(desktop, { x: 378, y: 83.9 });
  [mobile, desktop].forEach((origin) => {
    assert.ok(origin.x > 0);
    assert.ok(origin.y > 0);
  });
});

test("CSS와 지급 연결은 독립 노드, 포인터 비간섭, reduced motion을 보장한다", async () => {
  const [css, mainSource, rendererSource, offlineSource] = await Promise.all([
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../js/offline-reward.js", import.meta.url), "utf8"),
  ]);

  assert.match(
    css,
    /\.crop-transition-layer,\s*\.xp-gain-layer,\s*\.touch-effects\s*\{[^}]*position:\s*absolute[^}]*overflow:\s*hidden[^}]*pointer-events:\s*none/s
  );
  assert.match(
    css,
    /\.xp-gain\s*\{[^}]*pointer-events:\s*none[^}]*xp-gain-float var\(--xp-duration, 1000ms\)/s
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.xp-gain\s*\{[^}]*xp-gain-fade-reduced 420ms/s
  );
  assert.doesNotMatch(css, /\.touch-gain|@keyframes gain-rise/);
  assert.doesNotMatch(
    rendererSource,
    /gain\.textContent|className = "touch-gain"/
  );
  assert.match(
    mainSource,
    /result\?\.reason === "production" && result\.gained > 0[\s\S]*ui\.showProductionXpGain\(result\.allocations\)/
  );
  assert.match(
    mainSource,
    /if \(result\.gained > 0\) \{[\s\S]*ui\.renderWatering\(event, plotId, slotId\);[\s\S]*ui\.showXpGain\(result\.gained, \{[\s\S]*plotId,[\s\S]*slotId,[\s\S]*source: "watering"/
  );
  assert.match(offlineSource, /gained:\s*distribution\.gained/);
  assert.match(
    rendererSource,
    /showProductionXpGain\(allocations = \[\]\)[\s\S]*view\.productionAccumulator\.add\([\s\S]*source: "production"/
  );
  assert.match(
    rendererSource,
    /if \(showGain\) \{[\s\S]*pendingAllocations\.forEach[\s\S]*source: "offline"/
  );
});
