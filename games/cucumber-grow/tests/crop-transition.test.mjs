import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  CROP_TRANSITION_CONFIG,
  CropTransitionController,
  getEvolutionPath,
} from "../js/crop-transition.js";
import { GAME_CONFIG } from "../js/game-config.js";

class FakeStyle {
  constructor() {
    this.properties = new Map();
  }

  setProperty(name, value) {
    this.properties.set(name, value);
  }
}

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
  }

  contains(value) {
    return this.values.has(value);
  }
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = new FakeStyle();
    this.classList = new FakeClassList();
    this.attributes = new Map();
    this.listeners = new Map();
    this.className = "";
    this.hidden = false;
    this.src = "";
    this.offsetWidth = 120;
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

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((entry) => entry !== listener)
    );
  }

  dispatchAnimationEnd(animationName) {
    [...(this.listeners.get("animationend") ?? [])].forEach((listener) => {
      listener({ target: this, animationName });
    });
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

  runTimersWithDelay(delay) {
    const timers = [...this.timers.entries()].filter(
      (unusedEntry) => unusedEntry[1].delay === delay
    );
    timers.forEach(([id, timer]) => {
      this.timers.delete(id);
      timer.callback();
    });
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
  const characterZone = new FakeElement(documentRef);
  const characterButton = new FakeElement(documentRef);
  const characterImage = new FakeElement(documentRef);
  const effectLayer = new FakeElement(documentRef);
  const plantingGuide = new FakeElement(documentRef);
  const controller = new CropTransitionController({
    characterZone,
    characterButton,
    characterImage,
    effectLayer,
    plantingGuide,
    stages: GAME_CONFIG.growthStages,
    documentRef,
    windowRef,
  });

  return {
    controller,
    windowRef,
    characterZone,
    characterButton,
    characterImage,
    effectLayer,
    plantingGuide,
  };
}

async function flushAnimations() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test("초기 동기화와 단순 재렌더는 진화 모션을 만들지 않는다", () => {
  const fixture = createFixture();
  const adult = GAME_CONFIG.growthStages[2];

  fixture.controller.syncState({ isPlanted: true, stage: adult });
  fixture.controller.syncState({ isPlanted: true, stage: adult });

  assert.equal(fixture.characterImage.src, adult.characterAsset);
  assert.equal(fixture.controller.visualStageId, "adult");
  assert.equal(fixture.controller.isBusy, false);
  assert.equal(fixture.effectLayer.children.length, 0);
  assert.equal(fixture.windowRef.timers.size, 0);
});

test("신규 빈 밭 안내는 초기 렌더 직후 같은 노드로 한 번 표시된다", () => {
  const fixture = createFixture();
  const sprout = GAME_CONFIG.growthStages[0];

  fixture.controller.syncState({ isPlanted: false, stage: sprout });
  assert.equal(fixture.characterImage.hidden, true);
  assert.equal(fixture.characterZone.dataset.empty, "true");
  assert.equal(fixture.windowRef.timers.size, 1);
  assert.equal(
    [...fixture.windowRef.timers.values()][0].delay,
    CROP_TRANSITION_CONFIG.plantingGuideDelayMs
  );

  fixture.controller.showPlantingGuideImmediately();
  assert.equal(fixture.windowRef.timers.size, 1, "기존 지연 타이머를 교체");
  assert.equal([...fixture.windowRef.timers.values()][0].delay, 0);
  fixture.windowRef.runTimersWithDelay(0);

  assert.equal(fixture.plantingGuide.hidden, false);
  assert.equal(fixture.plantingGuide.classList.contains("is-visible"), true);
  assert.equal(fixture.windowRef.timers.size, 0);
  fixture.controller.showPlantingGuideImmediately();
  assert.equal(fixture.windowRef.timers.size, 0, "표시 뒤 중복 예약 없음");
});

test("최초 안내 예약은 화면 이탈 시 정리되어 나중에 나타나지 않는다", () => {
  const fixture = createFixture();
  const sprout = GAME_CONFIG.growthStages[0];

  fixture.controller.syncState({ isPlanted: false, stage: sprout });
  fixture.controller.showPlantingGuideImmediately();
  assert.equal([...fixture.windowRef.timers.values()][0].delay, 0);

  fixture.controller.suspend();
  assert.equal(fixture.windowRef.timers.size, 0);
  fixture.windowRef.runTimersWithDelay(0);
  assert.equal(fixture.plantingGuide.hidden, true);
  assert.equal(fixture.plantingGuide.classList.contains("is-visible"), false);
});

test("두 성장 기준을 한 번에 넘으면 young 다음 adult 순서로 각각 한 번 전환한다", async () => {
  const fixture = createFixture();
  const [sprout, young, adult] = GAME_CONFIG.growthStages;

  assert.deepEqual(
    getEvolutionPath(GAME_CONFIG.growthStages, "sprout", "adult").map(
      (stage) => stage.id
    ),
    ["young", "adult"]
  );
  fixture.controller.syncState({ isPlanted: true, stage: sprout });
  const transition = fixture.controller.syncState({
    isPlanted: true,
    stage: adult,
  });
  const duplicate = fixture.controller.syncState({
    isPlanted: true,
    stage: adult,
  });

  assert.equal(duplicate, transition);
  assert.equal(fixture.effectLayer.children.length, 1);
  fixture.characterImage.dispatchAnimationEnd("crop-evolution-out");
  await flushAnimations();
  assert.equal(fixture.characterImage.src, young.characterAsset);
  fixture.characterImage.dispatchAnimationEnd("crop-evolution-in");
  await flushAnimations();
  assert.equal(fixture.effectLayer.children.length, 1);
  fixture.characterImage.dispatchAnimationEnd("crop-evolution-out");
  await flushAnimations();
  assert.equal(fixture.characterImage.src, adult.characterAsset);
  fixture.characterImage.dispatchAnimationEnd("crop-evolution-in");
  await transition;

  assert.equal(fixture.controller.visualStageId, "adult");
  assert.equal(fixture.controller.isBusy, false);
  assert.equal(fixture.effectLayer.children.length, 0);
  assert.equal(fixture.windowRef.timers.size, 0);
});

test("빈 밭의 연속 심기 요청은 한 번만 실행되고 효과 DOM을 정리한다", async () => {
  const fixture = createFixture();
  const sprout = GAME_CONFIG.growthStages[0];

  fixture.controller.syncState({ isPlanted: false, stage: sprout });
  const first = fixture.controller.playPlant(sprout);
  const duplicate = await fixture.controller.playPlant(sprout);

  assert.equal(duplicate, false);
  assert.equal(fixture.characterImage.hidden, false);
  assert.equal(fixture.characterImage.src, sprout.characterAsset);
  assert.equal(fixture.effectLayer.children.length, 1);
  assert.equal(fixture.plantingGuide.hidden, true);
  fixture.characterImage.dispatchAnimationEnd("crop-plant-in");
  assert.equal(await first, true);
  assert.equal(fixture.controller.isBusy, false);
  assert.equal(fixture.effectLayer.children.length, 0);
  assert.equal(fixture.windowRef.timers.size, 0);
});

test("이전 주기 목표 단계는 수확과 다시 심기 뒤 다음 진화에 남지 않는다", async () => {
  const fixture = createFixture();
  const [sprout, young, adult] = GAME_CONFIG.growthStages;

  fixture.controller.syncState({ isPlanted: true, stage: adult });
  const harvest = fixture.controller.playHarvest();
  fixture.characterImage.dispatchAnimationEnd("crop-harvest-out");
  await harvest;

  const planting = fixture.controller.playPlant(sprout);
  fixture.characterImage.dispatchAnimationEnd("crop-plant-in");
  await planting;

  const evolution = fixture.controller.syncState({
    isPlanted: true,
    stage: young,
  });
  fixture.characterImage.dispatchAnimationEnd("crop-evolution-out");
  await flushAnimations();
  fixture.characterImage.dispatchAnimationEnd("crop-evolution-in");
  await evolution;

  assert.equal(fixture.controller.visualStageId, "young");
  assert.equal(fixture.characterImage.src, young.characterAsset);
  assert.notEqual(fixture.characterImage.src, adult.characterAsset);
  assert.equal(fixture.effectLayer.children.length, 0);
});

test("수확 모션이 끝난 뒤에만 빈 밭이 되고 2.5초 후 안내가 한 번 나타난다", async () => {
  const fixture = createFixture();
  const adult = GAME_CONFIG.growthStages[2];

  fixture.controller.syncState({ isPlanted: true, stage: adult });
  const transition = fixture.controller.playHarvest();

  assert.equal(fixture.characterImage.hidden, false);
  assert.equal(fixture.effectLayer.children.length, 1);
  fixture.characterImage.dispatchAnimationEnd("crop-harvest-out");
  assert.equal(await transition, true);

  assert.equal(fixture.characterImage.hidden, true);
  assert.equal(fixture.characterZone.dataset.empty, "true");
  assert.equal(fixture.effectLayer.children.length, 0);
  assert.equal(fixture.plantingGuide.hidden, true);
  assert.equal(fixture.windowRef.timers.size, 1);
  assert.equal(
    [...fixture.windowRef.timers.values()][0].delay,
    CROP_TRANSITION_CONFIG.plantingGuideDelayMs
  );

  fixture.windowRef.runTimersWithDelay(
    CROP_TRANSITION_CONFIG.plantingGuideDelayMs
  );
  assert.equal(fixture.plantingGuide.hidden, false);
  assert.equal(fixture.plantingGuide.classList.contains("is-visible"), true);
  fixture.controller.syncState({ isPlanted: false, stage: adult });
  assert.equal(fixture.windowRef.timers.size, 0);
  assert.equal(fixture.plantingGuide.hidden, false, "단순 렌더로 중복 타이머 없음");
});

test("심기 또는 화면 이탈은 안내 문구와 대기 타이머를 즉시 정리한다", () => {
  const fixture = createFixture();
  const sprout = GAME_CONFIG.growthStages[0];

  fixture.controller.syncState({ isPlanted: false, stage: sprout });
  assert.equal(fixture.windowRef.timers.size, 1);
  fixture.controller.suspend();
  assert.equal(fixture.windowRef.timers.size, 0);
  assert.equal(fixture.plantingGuide.hidden, true);

  fixture.controller.resume({ isPlanted: false, stage: sprout });
  assert.equal(fixture.windowRef.timers.size, 1);
  fixture.controller.playPlant(sprout);
  assert.equal(fixture.windowRef.timers.size, 1, "심기 애니메이션 폴백만 남음");
  assert.equal(
    [...fixture.windowRef.timers.values()][0].delay,
    CROP_TRANSITION_CONFIG.plantDurationMs +
      CROP_TRANSITION_CONFIG.fallbackPaddingMs
  );
});

test("단일 작물 입력은 포인터 카메라에서 탭·드래그를 구분하고 reduced motion을 보장한다", async () => {
  const [mainSource, cameraSource, css, html] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/world-camera.js", import.meta.url), "utf8"),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
    readFile(new URL("../index.html", import.meta.url), "utf8"),
  ]);
  assert.match(mainSource, /onTap:\s*handleWorldTap/);
  assert.match(mainSource, /plantCrop\(state, drop\.plotId, drop\.varietyId\)/);
  assert.match(mainSource, /beginSeedDrag/);
  assert.doesNotMatch(html, /seedPickerModal|CHOOSE A SEED/);
  assert.match(mainSource, /harvestCrop\(state, plotId, Date\.now\(\)\)/);
  assert.match(mainSource, /useWateringCan\(state, plotId\)/);
  assert.match(cameraSource, /addEventListener\("pointerdown"/);
  assert.match(cameraSource, /addEventListener\("pointermove"/);
  assert.match(cameraSource, /addEventListener\("pointercancel"/);
  assert.doesNotMatch(cameraSource, /addEventListener\("touchstart"/);
  assert.match(cameraSource, /event\.preventDefault\(\)/);
  assert.match(
    css,
    /\.empty-marker\s*\{[^}]*pointer-events:\s*none/s
  );
  assert.match(
    css,
    /\.crop-image,\s*\.crop-fallback\s*\{[^}]*pointer-events:\s*none/s
  );
  assert.match(
    css,
    /\.crop-button\s*\{[^}]*touch-action:\s*none/s
  );
  assert.match(
    css,
    /\.plot-list\s*\{[^}]*grid-template-columns:\s*repeat\(3,/s
  );
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation-duration:\s*0\.01ms/s
  );
  assert.doesNotMatch(html, /id="plantingGuide"/);
  assert.doesNotMatch(html, /빈 밭을 톡! 새싹을 심어주세요/);
  assert.doesNotMatch(html, /id="harvestButton"/);
});
