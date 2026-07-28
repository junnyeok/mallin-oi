import assert from "node:assert/strict";
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
import { getWateringSide } from "../js/ui-renderer.js";

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

test("물뿌리개 방향은 게임 무대 안의 오이 중심을 기준으로 정한다", () => {
  assert.equal(getWateringSide(40, 100), "left");
  assert.equal(getWateringSide(160, 100), "right");
  assert.equal(getWateringSide(100, 100), "left");
  assert.equal(getWateringSide(100.001, 100), "left");

  const stageLeftInViewport = 800;
  const clickXInViewport = 840;
  const characterCenterInViewport = 920;

  assert.equal(
    getWateringSide(
      clickXInViewport - stageLeftInViewport,
      characterCenterInViewport - stageLeftInViewport
    ),
    "left"
  );
});

test("오른쪽 물뿌리개는 X축만 반전하고 Y축은 뒤집지 않는다", async () => {
  const gameCss = await readFile(
    new URL("../css/game.css", import.meta.url),
    "utf8"
  );

  assert.match(
    gameCss,
    /\.watering-effect__can--from-right\s*\{[^}]*--water-can-scale-x:\s*1;/s
  );
  assert.match(
    gameCss,
    /@keyframes watering-can-pop[\s\S]*scaleX\(var\(--water-can-scale-x\)\)/
  );
  assert.doesNotMatch(gameCss, /scale\(\s*-1(?:\s*,|\s*\))/);
});

test("마우스와 터치는 하나의 Pointer Event 물주기 경로를 사용한다", async () => {
  const mainSource = await readFile(
    new URL("../js/main.js", import.meta.url),
    "utf8"
  );

  assert.match(mainSource, /addEventListener\("pointerdown"/);
  assert.doesNotMatch(mainSource, /addEventListener\("touchstart"/);
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
