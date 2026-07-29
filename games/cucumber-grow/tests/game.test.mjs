import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { GAME_CONFIG } from "../js/game-config.js";
import {
  addGrowthExperience,
  applyProduction,
  calculateProductionRate,
  collectTouch,
  getGrowthProgress,
  getGrowthStage,
  getNextPrice,
  harvestCucumber,
  purchaseFacility,
  synchronizeDerivedState,
} from "../js/game-engine.js";
import { createInitialGameState } from "../js/game-state.js";
import {
  applyOfflineReward,
  calculateOfflineReward,
} from "../js/offline-reward.js";
import { clearGameSave, loadGameSave, saveGame } from "../js/save-manager.js";
import { formatExactNumber, formatNumber } from "../js/number-format.js";
import {
  calculateWateringLayout,
  getTiltedCanNozzleOffset,
  getWaterFrameTranslation,
  getWateringSide,
  WATERING_CAN_CONFIG,
  WATER_SPRITE_CONFIG,
} from "../js/ui-renderer.js";

class MemoryStorage {
  constructor(initialValue = null) {
    this.value = initialValue;
  }

  getItem(key) {
    assert.equal(key, GAME_CONFIG.storageKey);
    return this.value;
  }

  setItem(key, value) {
    assert.equal(key, GAME_CONFIG.storageKey);
    this.value = value;
  }

  removeItem(key) {
    assert.equal(key, GAME_CONFIG.storageKey);
    this.value = null;
  }
}

const tests = [];

function test(name, callback) {
  tests.push({ name, callback });
}

function assertNear(actual, expected, tolerance = 0.001, message = "") {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    message || `${actual} must be within ${tolerance} of ${expected}`
  );
}

test("초기 상태는 기존 재화와 성장 경험치가 0이고 새싹 단계다", () => {
  const state = createInitialGameState(1_000);

  assert.equal(state.cucumbers, 0);
  assert.equal(state.totalEarned, 0);
  assert.equal(state.growthExperience, 0);
  assert.equal(state.perSecond, 0);
  assert.equal(state.touchYield, GAME_CONFIG.touchExperience);
  assert.equal(state.growthStageId, "sprout");
});

test("물주기는 한 번마다 경험치 한 번만 지급하고 오이를 직접 늘리지 않는다", () => {
  const state = createInitialGameState(1_000);

  for (let index = 0; index < 10; index += 1) {
    const result = collectTouch(state);
    assert.equal(result.gained, 1);
  }

  assert.equal(state.growthExperience, 10);
  assert.equal(state.cucumbers, 0);
  assert.equal(state.totalEarned, 0);
});

test("물주기 좌우는 브라우저가 아닌 게임 장면 중앙선과 포인터 X로 판정한다", () => {
  const sceneRect = { left: 100, top: 50, width: 400, height: 320 };

  assert.equal(getWateringSide(200, sceneRect), "left", "장면 왼쪽 25%");
  assert.equal(getWateringSide(400, sceneRect), "right", "장면 오른쪽 75%");
  assert.equal(getWateringSide(299.999, sceneRect), "left");
  assert.equal(getWateringSide(300, sceneRect), "right");
});

test("포인터 X·Y는 스크롤과 장면 위치에 무관한 로컬 좌표로 변환된다", () => {
  const sceneRect = { left: 100, top: 50, width: 400, height: 320 };
  const movedSceneRect = { left: 810, top: 960, width: 400, height: 320 };
  const first = calculateWateringLayout(sceneRect, {
    clientX: sceneRect.left + 120,
    clientY: sceneRect.top + 150,
  });
  const moved = calculateWateringLayout(movedSceneRect, {
    clientX: movedSceneRect.left + 120,
    clientY: movedSceneRect.top + 150,
  });

  assert.equal(first.inputX, 120);
  assert.equal(first.inputY, 150);
  assert.equal(first.canX, 120);
  assert.equal(first.canY, 150);
  assert.equal(moved.inputX, first.inputX);
  assert.equal(moved.inputY, first.inputY);
  assert.equal(moved.canX, first.canX);
  assert.equal(moved.canY, first.canY);
  assert.equal(moved.nozzleX, first.nozzleX);
  assert.equal(moved.nozzleY, first.nozzleY);
});

test("서로 다른 상단·중앙·하단 입력은 고정 위치가 아닌 서로 다른 배치를 만든다", () => {
  const sceneRect = { left: 100, top: 50, width: 400, height: 420 };
  const layouts = [0.25, 0.5, 0.9].map((ratioY) =>
    calculateWateringLayout(sceneRect, {
      clientX: sceneRect.left + sceneRect.width * 0.25,
      clientY: sceneRect.top + sceneRect.height * ratioY,
    })
  );

  assert.deepEqual(
    layouts.map((layout) => layout.inputY),
    [105, 210, 378]
  );
  assert.equal(new Set(layouts.map((layout) => layout.canY)).size, 3);
  assert.ok(layouts[0].canY < layouts[1].canY);
  assert.ok(layouts[1].canY < layouts[2].canY);
});

test("좌우는 한 효과의 수평 대칭이고 물과 물보라는 언제나 주둥이보다 아래다", () => {
  const sceneRect = { left: 100, top: 50, width: 400, height: 360 };
  const left = calculateWateringLayout(sceneRect, {
    clientX: sceneRect.left + sceneRect.width * 0.25,
    clientY: sceneRect.top + sceneRect.height * 0.45,
  });
  const right = calculateWateringLayout(sceneRect, {
    clientX: sceneRect.left + sceneRect.width * 0.75,
    clientY: sceneRect.top + sceneRect.height * 0.45,
  });

  assert.equal(left.side, "left");
  assert.equal(right.side, "right");
  assert.ok(left.directionX > 0, "왼쪽 물은 오른쪽으로 진행");
  assert.ok(right.directionX < 0, "오른쪽 물은 왼쪽으로 진행");
  assert.ok(left.directionY > 0, "왼쪽 물은 아래로 진행");
  assert.ok(right.directionY > 0, "오른쪽 물은 아래로 진행");
  assert.ok(left.splashY > left.nozzleY);
  assert.ok(right.splashY > right.nozzleY);
  assert.equal(left.canY, right.canY);
  assert.equal(left.canX + right.canX, sceneRect.width);
  assertNear(left.nozzleX, left.spriteStartX, 0.001);
  assertNear(left.nozzleY, left.spriteStartY, 0.001);
  assertNear(right.nozzleX, right.spriteStartX, 0.001);
  assertNear(right.nozzleY, right.spriteStartY, 0.001);
  assertNear(left.nozzleX + right.nozzleX, sceneRect.width, 0.001);
  assertNear(
    left.spriteStartX + right.spriteStartX,
    sceneRect.width,
    0.001
  );
  assertNear(left.splashX + right.splashX, sceneRect.width, 0.001);
  assertNear(left.splashY, right.splashY, 0.001);
  assert.equal(left.mirrorScaleX, 1);
  assert.equal(right.mirrorScaleX, -1);
  assert.equal(left.mirrorScaleY, 1);
  assert.equal(right.mirrorScaleY, 1);
  assert.equal(left.visualTiltDegrees, WATERING_CAN_CONFIG.tiltDegrees);
  assert.equal(right.visualTiltDegrees, -WATERING_CAN_CONFIG.tiltDegrees);
});

test("모든 물 프레임의 실제 시작 픽셀은 같은 주둥이 앵커에 고정된다", () => {
  const sceneRect = { left: 100, top: 50, width: 400, height: 320 };
  const layouts = [
    calculateWateringLayout(sceneRect, { clientX: 200, clientY: 180 }),
    calculateWateringLayout(sceneRect, { clientX: 400, clientY: 180 }),
  ];

  for (const layout of layouts) {
    const directionSign = layout.side === "left" ? 1 : -1;

    WATER_SPRITE_CONFIG.frameStartPixels.forEach((frameStart, frameIndex) => {
      const translation = getWaterFrameTranslation(frameIndex);
      const localStartX =
        layout.spriteLeft +
        layout.spriteWidth *
          (frameStart.x / WATER_SPRITE_CONFIG.frameWidth +
            translation.x / 100);
      const localStartY =
        layout.spriteTop +
        layout.spriteHeight *
          (frameStart.y / WATER_SPRITE_CONFIG.frameHeight +
            translation.y / 100);
      const actualX = layout.canX + directionSign * localStartX;
      const actualY = layout.canY + localStartY;

      assertNear(actualX, layout.nozzleX, 0.001, `frame ${frameIndex + 1} X`);
      assertNear(actualY, layout.nozzleY, 0.001, `frame ${frameIndex + 1} Y`);
    });
  }
});

test("물뿌리개는 기존 8도보다 큰 16도로 기울고 물 표시 전에 자세를 잡는다", () => {
  const canSize = 88;
  const tiltedNozzle = getTiltedCanNozzleOffset(canSize);
  const unrotatedNozzleY =
    (WATERING_CAN_CONFIG.nozzleExitPixel.y /
      WATERING_CAN_CONFIG.imageHeight -
      0.5) *
    canSize;

  assert.equal(WATERING_CAN_CONFIG.tiltDegrees, 16);
  assert.ok(WATERING_CAN_CONFIG.tiltDegrees > 8);
  assert.ok(WATERING_CAN_CONFIG.tiltDegrees >= 14);
  assert.ok(WATERING_CAN_CONFIG.tiltDegrees <= 18);
  assert.ok(tiltedNozzle.y > unrotatedNozzleY);
  assert.ok(WATERING_CAN_CONFIG.pivot.x > 0.35);
  assert.ok(WATERING_CAN_CONFIG.pivot.x < 0.55);
  assert.ok(WATERING_CAN_CONFIG.pivot.y > 0.45);
  assert.ok(WATERING_CAN_CONFIG.pivot.y < 0.65);
  assert.ok(
    WATERING_CAN_CONFIG.tiltReachedAtPercent <
      WATER_SPRITE_CONFIG.waterVisibleAtPercent
  );
});

test("PC와 모바일 가장자리 보정은 실제 보이는 효과가 닿는 축에서만 최소 적용된다", () => {
  const scenes = [
    { left: 300, top: 180, width: 756, height: 617 },
    { left: 8, top: 117, width: 374, height: 416 },
  ];
  const points = [
    [0, 0],
    [0.5, 0],
    [1, 0],
    [0, 0.5],
    [0.5, 0.5],
    [1, 0.5],
    [0, 1],
    [0.5, 1],
    [1, 1],
  ];

  scenes.forEach((sceneRect) => {
    points.forEach(([ratioX, ratioY]) => {
      const layout = calculateWateringLayout(sceneRect, {
        clientX: sceneRect.left + sceneRect.width * ratioX,
        clientY: sceneRect.top + sceneRect.height * ratioY,
      });
      const { effectBounds, safeMargin } = layout;

      assert.ok(effectBounds.left >= safeMargin - 0.001);
      assert.ok(effectBounds.top >= safeMargin - 0.001);
      assert.ok(effectBounds.right <= sceneRect.width - safeMargin + 0.001);
      assert.ok(effectBounds.bottom <= sceneRect.height - safeMargin + 0.001);
      assert.ok(layout.splashY > layout.nozzleY);
      assert.ok(layout.directionY > 0);

      if (layout.correctionX > 0) {
        assertNear(effectBounds.left, safeMargin, 0.001);
      } else if (layout.correctionX < 0) {
        assertNear(effectBounds.right, sceneRect.width - safeMargin, 0.001);
      } else {
        assert.equal(layout.canX, layout.inputX);
      }

      if (layout.correctionY > 0) {
        assertNear(effectBounds.top, safeMargin, 0.001);
      } else if (layout.correctionY < 0) {
        assertNear(effectBounds.bottom, sceneRect.height - safeMargin, 0.001);
      } else {
        assert.equal(layout.canY, layout.inputY);
      }
    });
  });
});

test("정규화한 터치 위치는 화면 크기 변경 뒤에도 같은 상대 위치를 유지한다", () => {
  const initial = calculateWateringLayout(
    { left: 10, top: 20, width: 400, height: 360 },
    { clientX: 130, clientY: 200 }
  );
  const resized = calculateWateringLayout(
    { left: 40, top: 60, width: 760, height: 600 },
    { normalizedX: initial.normalizedX, normalizedY: initial.normalizedY }
  );

  assert.equal(initial.normalizedX, 0.3);
  assert.equal(initial.normalizedY, 0.5);
  assert.equal(resized.inputX, 228);
  assert.equal(resized.inputY, 300);
  assert.equal(resized.normalizedX, initial.normalizedX);
  assert.equal(resized.normalizedY, initial.normalizedY);
});

test("포인터가 없을 때도 오이와 무관한 안전한 기본 위치를 사용한다", async () => {
  const sceneRect = { left: 100, top: 50, width: 400, height: 320 };
  const layout = calculateWateringLayout(sceneRect);
  const rendererSource = await readFile(
    new URL("../js/ui-renderer.js", import.meta.url),
    "utf8"
  );
  const layoutSource = rendererSource.slice(
    rendererSource.indexOf("export function calculateWateringLayout"),
    rendererSource.indexOf("export class UIRenderer")
  );
  const positioningSource = rendererSource.slice(
    rendererSource.indexOf("positionWateringEffect(pointer"),
    rendererSource.indexOf(
      "\n  buildFacilityCards()",
      rendererSource.indexOf("positionWateringEffect(pointer")
    )
  );

  assert.ok(layout.inputX > 0 && layout.inputX < sceneRect.width);
  assert.ok(layout.inputY > 0 && layout.inputY < sceneRect.height);
  assert.ok(layout.splashY > layout.nozzleY);
  assert.doesNotMatch(layoutSource, /character|target/i);
  assert.doesNotMatch(positioningSource, /characterImage|getBoundingClientRect\(\).*character/s);
  assert.doesNotMatch(rendererSource, /characterImage\.getBoundingClientRect\(\)/);
});

test("물 스프라이트는 1776×888 RGBA의 4×2, 8프레임을 행 우선으로 재생한다", async () => {
  const [waterPng, wateringCanPng, gameCss, rendererSource] = await Promise.all([
    readFile(new URL("../assets/images/water.png", import.meta.url)),
    readFile(new URL("../assets/images/water-gun.png", import.meta.url)),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
  ]);

  assert.deepEqual([...waterPng.subarray(1, 4)], [80, 78, 71]);
  assert.equal(waterPng.readUInt32BE(16), 1776);
  assert.equal(waterPng.readUInt32BE(20), 888);
  assert.equal(waterPng[24], 8, "water.png must remain 8-bit");
  assert.equal(waterPng[25], 6, "water.png must remain RGBA");
  assert.equal(
    createHash("sha256").update(waterPng).digest("hex"),
    "a18b328a3176fd12d246edb6b3ccd004ed6c9eed5b2f6e6ac7759140f596b618"
  );
  assert.equal(
    createHash("sha256").update(wateringCanPng).digest("hex"),
    "1e89f5967c9b6d0422b635472e578e696a8ae285e8ddac9177f492bcc75c39e5"
  );
  assert.equal(
    WATER_SPRITE_CONFIG.sheetWidth,
    WATER_SPRITE_CONFIG.columns * WATER_SPRITE_CONFIG.frameWidth
  );
  assert.equal(
    WATER_SPRITE_CONFIG.sheetHeight,
    WATER_SPRITE_CONFIG.rows * WATER_SPRITE_CONFIG.frameHeight
  );
  assert.equal(
    WATER_SPRITE_CONFIG.frameCount,
    WATER_SPRITE_CONFIG.columns * WATER_SPRITE_CONFIG.rows
  );
  assert.equal(WATER_SPRITE_CONFIG.animationDurationMs, 820);
  assert.equal(WATER_SPRITE_CONFIG.frameStartPixels.length, 8);
  assert.deepEqual(WATER_SPRITE_CONFIG.frameStartPixels[0], { x: 91, y: 111 });
  assert.deepEqual(WATER_SPRITE_CONFIG.alignedPeakImpactPixel, {
    x: 313,
    y: 368,
  });
  assert.deepEqual(WATER_SPRITE_CONFIG.alignedVisibleBoundsPixel, {
    left: 88,
    top: 108,
    right: 412,
    bottom: 373,
  });
  assert.deepEqual(
    {
      columns: WATER_SPRITE_CONFIG.columns,
      rows: WATER_SPRITE_CONFIG.rows,
      frameCount: WATER_SPRITE_CONFIG.frameCount,
      frameWidth: WATER_SPRITE_CONFIG.frameWidth,
      frameHeight: WATER_SPRITE_CONFIG.frameHeight,
    },
    { columns: 4, rows: 2, frameCount: 8, frameWidth: 444, frameHeight: 444 }
  );
  assert.match(
    gameCss,
    /@keyframes water-sprite-play[\s\S]*background-position: 0% 0%;[\s\S]*background-position: 33\.333333% 0%;[\s\S]*background-position: 66\.666667% 0%;[\s\S]*background-position: 100% 0%;[\s\S]*background-position: 0% 100%;[\s\S]*background-position: 33\.333333% 100%;[\s\S]*background-position: 66\.666667% 100%;[\s\S]*background-position: 100% 100%;/
  );
  assert.match(gameCss, /steps\(1, end\)/);
  assert.match(gameCss, /watering-can-pour 820ms/);
  assert.match(
    gameCss,
    /@keyframes watering-can-pour[\s\S]*10%,[\s\S]*rotate\(var\(--water-can-tilt, 16deg\)\)[\s\S]*94%[\s\S]*rotate\(0deg\)/
  );
  assert.match(
    gameCss,
    /@keyframes water-sprite-play[\s\S]*10%\s*\{[\s\S]*opacity: 0;[\s\S]*12%\s*\{[\s\S]*opacity: 1;/
  );
  assert.match(
    gameCss,
    /\.watering-effect__sprite\s*\{[\s\S]*?pointer-events: none;/
  );
  assert.match(
    gameCss,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*watering-can-reduced 180ms[\s\S]*water-sprite-reduced 180ms/
  );
  assert.match(
    rendererSource,
    /this\.wateringEffect = this\.buildWateringEffect\(\)/
  );
  assert.match(rendererSource, /waterSprite\.addEventListener\("animationend"/);
  assert.match(rendererSource, /root\.classList\.remove\("is-playing"\)/);
  assert.match(rendererSource, /this\.resetWateringEffect\(\)/);
  assert.match(rendererSource, /root\.style\.removeProperty\(property\)/);
  assert.match(rendererSource, /this\.wateringEffect\.inputPoint = null/);
  assert.match(
    rendererSource,
    /renderWatering\(amount, event\)[\s\S]*event\?\.type === "pointerdown"[\s\S]*this\.resetWateringEffect\(\);[\s\S]*this\.positionWateringEffect\(pointer\);[\s\S]*void root\.offsetWidth;[\s\S]*root\.classList\.add\("is-playing"\)/
  );
  assert.match(rendererSource, /void root\.offsetWidth/);
  assert.equal(
    rendererSource.match(/this\.elements\.touchEffects\.append\(root\)/g)
      ?.length,
    1,
    "물 효과 DOM은 한 번만 생성"
  );
  assert.equal(
    rendererSource.match(/addEventListener\("animationend"/g)?.length,
    1,
    "종료 리스너는 한 번만 등록"
  );
  assert.doesNotMatch(rendererSource, /watering-effect__drop/);
  assert.doesNotMatch(rendererSource, /setTimeout\(\(\) => burst\.remove\(\)/);
  assert.equal(
    rendererSource.match(/getWaterFrameTranslation\(frameIndex\)/g)?.length,
    2,
    "프레임 여백 보정은 하나의 측정 함수에서 계산"
  );
});

test("오른쪽은 바깥 래퍼만 반전하고 물뿌리개 내부 요소만 기울인다", async () => {
  const [gameCss, rendererSource] = await Promise.all([
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
  ]);
  const wateringCss = gameCss.slice(
    gameCss.indexOf(".touch-burst {"),
    gameCss.indexOf(".growth-panel {")
  );
  const mirrorRule = gameCss.match(/\.watering-effect__mirror\s*\{([^}]*)\}/s)?.[1];
  const spriteRule = gameCss.match(/\.watering-effect__sprite\s*\{([^}]*)\}/s)?.[1];
  const reducedCanKeyframes = gameCss.slice(
    gameCss.indexOf("@keyframes watering-can-reduced"),
    gameCss.indexOf("@keyframes water-sprite-reduced")
  );

  assert.match(mirrorRule, /scaleX\(var\(--water-mirror-x\)\)/);
  assert.doesNotMatch(mirrorRule, /rotate|scaleY/);
  assert.doesNotMatch(spriteRule, /rotate/);
  assert.match(rendererSource, /canPivot\.append\(wateringCan\)/);
  assert.match(rendererSource, /mirror\.append\(canPivot, spriteAnchor\)/);
  assert.match(rendererSource, /root\.append\(mirror, gain\)/);
  assert.match(
    gameCss,
    /\.touch-burst\.is-playing \.watering-effect__can-pivot\s*\{[^}]*watering-can-pour/s
  );
  assert.match(
    gameCss,
    /\.watering-effect__can\s*\{[^}]*transform:\s*scaleX\(-1\);/s
  );
  assert.doesNotMatch(wateringCss, /scaleY\(\s*-1\s*\)/);
  assert.doesNotMatch(wateringCss, /rotate\(\s*180deg\s*\)/);
  assert.doesNotMatch(reducedCanKeyframes, /rotate/);
  assert.doesNotMatch(rendererSource, /Math\.atan2/);
  assert.match(rendererSource, /clientX: event\.clientX, clientY: event\.clientY/);
  assert.match(rendererSource, /mirror\.append\(canPivot, spriteAnchor\)/);
  assert.match(rendererSource, /root\.append\(mirror, gain\)/);
});

test("마우스와 터치는 하나의 Pointer Event 물주기 경로를 사용한다", async () => {
  const mainSource = await readFile(
    new URL("../js/main.js", import.meta.url),
    "utf8"
  );

  assert.match(
    mainSource,
    /characterZone\.addEventListener\("pointerdown"/
  );
  assert.doesNotMatch(mainSource, /addEventListener\("touchstart"/);
  assert.match(
    mainSource,
    /if \(result\.gained > 0\) \{\s*ui\.renderWatering\(result\.gained, event\);/
  );
});

test("큰 경험치 증가도 최종 기준에서 멈추고 진행률은 100%를 넘지 않는다", () => {
  const state = createInitialGameState(1_000);
  const result = addGrowthExperience(state, 10_000);
  const progress = getGrowthProgress(state.growthExperience);

  assert.equal(result.gained, GAME_CONFIG.harvestExperience);
  assert.equal(result.becameHarvestReady, true);
  assert.equal(state.growthExperience, GAME_CONFIG.harvestExperience);
  assert.equal(progress.progressPercent, 100);
  assert.equal(progress.isHarvestReady, true);
});

test("큰 숫자는 내부값을 바꾸지 않고 짧게 표시할 수 있다", () => {
  const value = 1_234_567_890;

  assert.equal(formatNumber(value), "12.3억");
  assert.equal(formatExactNumber(value), "1,234,567,890");
  assert.equal(value, 1_234_567_890);
});

test("시설 가격은 중앙 설정의 1.15배 공식을 따른다", () => {
  const facility = GAME_CONFIG.facilities[0];

  assert.equal(getNextPrice(facility, 0), 50);
  assert.equal(getNextPrice(facility, 1), 57);
  assert.equal(getNextPrice(facility, 2), 66);
});

test("오이가 부족하면 시설을 구매할 수 없다", () => {
  const state = createInitialGameState(1_000);
  const result = purchaseFacility(state, "small-garden");

  assert.equal(result.purchased, false);
  assert.equal(result.reason, "insufficient");
  assert.equal(state.facilities["small-garden"], 0);
  assert.equal(state.cucumbers, 0);
});

test("기존 시설 구매는 잔액과 자동 경험치 속도를 즉시 갱신한다", () => {
  const state = createInitialGameState(1_000);
  state.cucumbers = 1_000;

  assert.equal(purchaseFacility(state, "small-garden").purchased, true);
  assert.equal(purchaseFacility(state, "small-garden").purchased, true);
  assert.equal(state.facilities["small-garden"], 2);
  assert.equal(state.cucumbers, 893);
  assert.equal(state.perSecond, 2);
  assert.equal(calculateProductionRate(state), 2);
});

test("시간 차 기반 자동 생산은 오이 대신 경험치를 지급한다", () => {
  const state = createInitialGameState(1_000);
  state.facilities.greenhouse = 2;
  synchronizeDerivedState(state);
  const result = applyProduction(state, 2_500);

  assert.equal(result.gained, 40);
  assert.equal(state.growthExperience, 40);
  assert.equal(state.cucumbers, 0);
  assert.equal(state.totalEarned, 0);
});

test("성장 기준 15와 35에서 새싹, 애기오이, 어른오이로 전환된다", () => {
  assert.equal(getGrowthStage(0).id, "sprout");
  assert.equal(getGrowthStage(14.99).id, "sprout");
  assert.equal(getGrowthStage(15).id, "young");
  assert.equal(getGrowthStage(34.99).id, "young");
  assert.equal(getGrowthStage(35).id, "adult");
  assert.equal(getGrowthStage(50).id, "adult");
});

test("수확 전에는 보상을 지급하지 않는다", () => {
  const state = createInitialGameState(1_000);
  state.growthExperience = GAME_CONFIG.harvestExperience - 1;
  synchronizeDerivedState(state);
  const result = harvestCucumber(state);

  assert.equal(result.harvested, false);
  assert.equal(result.reward, 0);
  assert.equal(state.cucumbers, 0);
  assert.equal(state.growthExperience, GAME_CONFIG.harvestExperience - 1);
});

test("한 성장 주기 수확 보상은 정확히 한 번 지급되고 새싹으로 초기화된다", () => {
  const state = createInitialGameState(1_000);
  addGrowthExperience(state, GAME_CONFIG.harvestExperience);

  const first = harvestCucumber(state);
  const second = harvestCucumber(state);

  assert.equal(first.harvested, true);
  assert.equal(first.reward, GAME_CONFIG.harvestReward);
  assert.equal(second.harvested, false);
  assert.equal(second.reward, 0);
  assert.equal(state.cucumbers, GAME_CONFIG.harvestReward);
  assert.equal(state.totalEarned, GAME_CONFIG.harvestReward);
  assert.equal(state.growthExperience, 0);
  assert.equal(state.growthStageId, "sprout");
  assert.equal(state.harvestCount, 1);
});

test("수확 가능 상태에서는 자동 경험치가 멈추고 다음 주기로 넘기지 않는다", () => {
  const state = createInitialGameState(1_000);
  state.facilities["watering-system"] = 1;
  state.growthExperience = GAME_CONFIG.harvestExperience;
  synchronizeDerivedState(state);
  const result = applyProduction(state, 10_000);

  assert.equal(result.gained, 0);
  assert.equal(result.discarded, 500);
  assert.equal(state.growthExperience, GAME_CONFIG.harvestExperience);
  assert.equal(state.cucumbers, 0);
});

test("오프라인 경험치는 음수 시간을 0으로 처리한다", () => {
  const state = createInitialGameState(10_000);
  state.perSecond = 10;

  const reward = calculateOfflineReward(state, 5_000);
  assert.equal(reward.elapsedSeconds, 0);
  assert.equal(reward.reward, 0);
});

test("1초 미만의 짧은 이탈은 0 XP 보상 모달을 만들지 않는다", () => {
  const state = createInitialGameState(10_000);
  state.perSecond = 10;

  const reward = calculateOfflineReward(state, 10_999);
  assert.equal(reward.elapsedSeconds, 0);
  assert.equal(reward.reward, 0);
});

test("오프라인 계산은 8시간으로 제한되고 경험치는 수확 기준에서 멈춘다", () => {
  const state = createInitialGameState(1_000);
  state.facilities["small-garden"] = 10;
  synchronizeDerivedState(state);
  const now = state.lastSavedAt + 10 * 60 * 60 * 1_000;
  const reward = calculateOfflineReward(state, now);

  assert.equal(reward.elapsedSeconds, 8 * 60 * 60);
  assert.equal(reward.potentialExperience, 288_000);
  assert.equal(reward.reward, GAME_CONFIG.harvestExperience);
});

test("오프라인 경험치 적용 직후 같은 시각에는 중복 지급되지 않는다", () => {
  const state = createInitialGameState(1_000);
  state.facilities["small-garden"] = 2;
  synchronizeDerivedState(state);
  const now = 11_000;

  const first = applyOfflineReward(state, now);
  const experienceAfterFirst = state.growthExperience;
  const second = applyOfflineReward(state, now);

  assert.equal(first.reward, 20);
  assert.equal(second.reward, 0);
  assert.equal(state.growthExperience, experienceAfterFirst);
  assert.equal(state.cucumbers, 0);
  assert.equal(state.lastSavedAt, now);
});

test("저장 후 불러오기는 성장 상태와 기존 재화 및 시설을 함께 복원한다", () => {
  const storage = new MemoryStorage();
  const state = createInitialGameState(1_000);
  state.cucumbers = 123;
  state.totalEarned = 456;
  state.growthExperience = 36;
  state.harvestCount = 7;
  state.facilities["small-garden"] = 3;

  assert.equal(saveGame(state, storage, 2_000).ok, true);
  const loaded = loadGameSave(storage, 3_000);

  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.state.cucumbers, 123);
  assert.equal(loaded.state.totalEarned, 456);
  assert.equal(loaded.state.growthExperience, 36);
  assert.equal(loaded.state.growthStageId, "adult");
  assert.equal(loaded.state.harvestCount, 7);
  assert.equal(loaded.state.facilities["small-garden"], 3);
  assert.equal(loaded.state.perSecond, 3);
});

test("기존 v1 저장은 재화와 구매 내역을 유지하고 새 성장값만 기본값으로 보완한다", () => {
  const storage = new MemoryStorage(
    JSON.stringify({
      saveVersion: 1,
      cucumbers: 321,
      totalEarned: 654,
      touchYield: 1,
      facilities: { "small-garden": 4, greenhouse: 2 },
      perSecond: 999,
      growthStageId: "farm-owner",
      lastSavedAt: 1_000,
      startedAt: 1_000,
      settings: { sound: false },
    })
  );

  const loaded = loadGameSave(storage, 2_000);

  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.state.cucumbers, 321);
  assert.equal(loaded.state.totalEarned, 654);
  assert.equal(loaded.state.facilities["small-garden"], 4);
  assert.equal(loaded.state.facilities.greenhouse, 2);
  assert.equal(loaded.state.growthExperience, 0);
  assert.equal(loaded.state.growthStageId, "sprout");
  assert.equal(loaded.state.harvestCount, 0);
  assert.equal(loaded.state.settings.sound, false);
});

test("손상되거나 범위를 벗어난 저장값은 NaN, 음수, 초과 경험치 없이 복구한다", () => {
  const brokenJson = new MemoryStorage("{not-json");
  const corruptNumbers = new MemoryStorage(
    JSON.stringify({
      saveVersion: 1,
      cucumbers: -50,
      totalEarned: "NaN",
      touchYield: -1,
      growthExperience: 999_999,
      harvestCount: -4,
      facilities: { "small-garden": Number.POSITIVE_INFINITY },
      perSecond: Number.POSITIVE_INFINITY,
      growthStageId: "missing-stage",
      lastSavedAt: -1,
      startedAt: -1,
    })
  );

  const brokenResult = loadGameSave(brokenJson, 5_000);
  const corruptResult = loadGameSave(corruptNumbers, 5_000);

  assert.equal(brokenResult.status, "recovered");
  assert.equal(brokenResult.state.cucumbers, 0);
  assert.equal(corruptResult.state.cucumbers, 0);
  assert.equal(corruptResult.state.totalEarned, 0);
  assert.equal(corruptResult.state.touchYield, GAME_CONFIG.touchExperience);
  assert.equal(
    corruptResult.state.growthExperience,
    GAME_CONFIG.harvestExperience
  );
  assert.equal(corruptResult.state.growthStageId, "adult");
  assert.equal(corruptResult.state.harvestCount, 0);
  assert.equal(corruptResult.state.perSecond, 0);
});

test("초기화는 오이키우기 전용 저장 키만 제거한다", () => {
  const storage = new MemoryStorage("saved");

  assert.equal(clearGameSave(storage), true);
  assert.equal(storage.value, null);
});

let passed = 0;

for (const { name, callback } of tests) {
  try {
    await callback();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

console.log(`\n${passed}/${tests.length} tests passed`);
