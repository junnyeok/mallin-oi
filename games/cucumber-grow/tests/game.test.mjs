import assert from "node:assert/strict";
import { GAME_CONFIG } from "../js/game-config.js";
import {
  applyProduction,
  calculateProductionRate,
  collectTouch,
  getGrowthStage,
  getNextPrice,
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

test("초기 상태는 재화와 생산량이 0이고 터치 획득량은 1이다", () => {
  const state = createInitialGameState(1_000);

  assert.equal(state.cucumbers, 0);
  assert.equal(state.perSecond, 0);
  assert.equal(state.touchYield, 1);
});

test("빠른 연속 터치는 매번 정확히 누적된다", () => {
  const state = createInitialGameState(1_000);

  for (let index = 0; index < 100; index += 1) {
    collectTouch(state);
  }

  assert.equal(state.cucumbers, 100);
  assert.equal(state.totalEarned, 100);
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

test("시설을 연속 구매하면 잔액과 생산량이 즉시 갱신된다", () => {
  const state = createInitialGameState(1_000);
  state.cucumbers = 1_000;

  assert.equal(purchaseFacility(state, "small-garden").purchased, true);
  assert.equal(purchaseFacility(state, "small-garden").purchased, true);
  assert.equal(state.facilities["small-garden"], 2);
  assert.equal(state.cucumbers, 893);
  assert.equal(state.perSecond, 2);
  assert.equal(calculateProductionRate(state), 2);
});

test("시간 차 기반 자동 생산이 느린 틱에서도 정확히 반영된다", () => {
  const state = createInitialGameState(1_000);
  state.facilities.greenhouse = 2;
  synchronizeDerivedState(state);
  const result = applyProduction(state, 2_500);

  assert.equal(result.gained, 40);
  assert.equal(state.cucumbers, 40);
  assert.equal(state.totalEarned, 40);
});

test("성장 단계는 누적 획득량 기준이며 소비해도 내려가지 않는다", () => {
  const state = createInitialGameState(1_000);
  state.totalEarned = 10_000;
  state.cucumbers = 50;
  synchronizeDerivedState(state);

  assert.equal(state.growthStageId, "farm-owner");
  assert.equal(getGrowthStage(state.totalEarned).name, "농장주 오이");
});

test("오프라인 보상은 음수 시간을 0으로 처리한다", () => {
  const state = createInitialGameState(10_000);
  state.perSecond = 10;

  const reward = calculateOfflineReward(state, 5_000);
  assert.equal(reward.elapsedSeconds, 0);
  assert.equal(reward.reward, 0);
});

test("1초 미만의 짧은 이탈은 0개 보상 모달을 만들지 않는다", () => {
  const state = createInitialGameState(10_000);
  state.perSecond = 10;

  const reward = calculateOfflineReward(state, 10_999);
  assert.equal(reward.elapsedSeconds, 0);
  assert.equal(reward.reward, 0);
});

test("오프라인 보상은 최대 8시간으로 제한된다", () => {
  const state = createInitialGameState(1_000);
  state.facilities["small-garden"] = 10;
  synchronizeDerivedState(state);
  const now = state.lastSavedAt + 10 * 60 * 60 * 1_000;
  const reward = calculateOfflineReward(state, now);

  assert.equal(reward.elapsedSeconds, 8 * 60 * 60);
  assert.equal(reward.reward, 288_000);
});

test("오프라인 보상 적용 직후 같은 시각에는 중복 지급되지 않는다", () => {
  const state = createInitialGameState(1_000);
  state.facilities["small-garden"] = 2;
  synchronizeDerivedState(state);
  const now = 11_000;

  const first = applyOfflineReward(state, now);
  const balanceAfterFirst = state.cucumbers;
  const second = applyOfflineReward(state, now);

  assert.equal(first.reward, 20);
  assert.equal(second.reward, 0);
  assert.equal(state.cucumbers, balanceAfterFirst);
  assert.equal(state.lastSavedAt, now);
});

test("저장 후 불러오기는 전용 키와 버전으로 상태를 복원한다", () => {
  const storage = new MemoryStorage();
  const state = createInitialGameState(1_000);
  state.cucumbers = 123;
  state.totalEarned = 456;
  state.facilities["small-garden"] = 3;

  assert.equal(saveGame(state, storage, 2_000).ok, true);
  const loaded = loadGameSave(storage, 3_000);

  assert.equal(loaded.status, "loaded");
  assert.equal(loaded.state.cucumbers, 123);
  assert.equal(loaded.state.totalEarned, 456);
  assert.equal(loaded.state.facilities["small-garden"], 3);
  assert.equal(loaded.state.perSecond, 3);
});

test("손상된 저장 데이터는 NaN이나 음수 없이 초기 상태로 복구한다", () => {
  const brokenJson = new MemoryStorage("{not-json");
  const corruptNumbers = new MemoryStorage(
    JSON.stringify({
      saveVersion: 1,
      cucumbers: -50,
      totalEarned: "NaN",
      touchYield: -1,
      facilities: { "small-garden": Number.POSITIVE_INFINITY },
      perSecond: Number.POSITIVE_INFINITY,
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
  assert.equal(corruptResult.state.touchYield, 1);
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
