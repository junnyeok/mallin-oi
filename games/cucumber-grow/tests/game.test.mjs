import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { GAME_CONFIG } from "../js/game-config.js";
import {
  GameEngine,
  addGrowthExperience,
  applyProduction,
  calculateProductionRate,
  collectTouch,
  distributeAutomaticExperience,
  findCropSlot,
  getAllSlots,
  getGardenPurchasePricing,
  getGrowthProgress,
  getGrowthStage,
  harvestCucumber,
  plantCucumber,
  purchaseGarden,
  synchronizeDerivedState,
} from "../js/game-engine.js";
import {
  createGardenPlot,
  createInitialGameState,
  detectGameStateSchema,
  normalizeGameState,
} from "../js/game-state.js";
import {
  applyOfflineReward,
  calculateOfflineReward,
} from "../js/offline-reward.js";
import { clearGameSave, loadGameSave, saveGame } from "../js/save-manager.js";
import {
  calculateCropWateringTarget,
  calculateWateringLayout,
  CROP_WATER_TARGETS,
  getPlotSurfaceJoin,
  getWateringSide,
  WATERING_CAN_CONFIG,
  WATERING_LAYOUT_CONFIG,
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

function createOwnedState(now = 1_000) {
  const state = createInitialGameState(now);
  const purchase = purchaseGarden(state);

  assert.equal(purchase.purchased, true);
  return state;
}

function getSlotAddress(state, plotIndex = 0, slotIndex = 0) {
  const plot = state.plots[plotIndex];
  const slot = plot.slots[slotIndex];

  return { plotId: plot.plotId, slotId: slot.slotId, plot, slot };
}

function plantAt(state, plotIndex = 0, slotIndex = 0) {
  const address = getSlotAddress(state, plotIndex, slotIndex);
  const result = plantCucumber(state, address.plotId, address.slotId);

  assert.equal(result.planted, true);
  return address;
}

function legacyState(overrides = {}) {
  return {
    saveVersion: 1,
    cucumbers: 173,
    totalEarned: 240,
    touchYield: 2,
    growthExperience: 18,
    isPlanted: true,
    harvestCount: 7,
    facilities: {
      "small-garden": 2,
      greenhouse: 1,
      "watering-system": 0,
      "smart-farm": 0,
      "processing-factory": 0,
    },
    perSecond: 10,
    growthStageId: "young",
    lastSavedAt: 8_000,
    startedAt: 1_000,
    settings: { sound: false },
    ...overrides,
  };
}

test("신규 이용자는 텃밭 0개와 반복 무료 구매 가능 상태로 시작한다", () => {
  const state = createInitialGameState(1_000);

  assert.equal(state.saveVersion, 2);
  assert.equal(state.plots.length, 0);
  assert.equal(state.hasClaimedFreeGarden, false);
  assert.equal(state.nextPlotSequence, 1);
  assert.equal(state.cucumbers, 0);
});

test("저장 데이터가 없으면 텃밭을 자동 지급하지 않는다", () => {
  const storage = new MemoryStorage();
  const result = loadGameSave(storage, 1_000);

  assert.equal(result.status, "empty");
  assert.equal(result.state.plots.length, 0);
  assert.equal(result.state.hasClaimedFreeGarden, false);
});

test("텃밭 정가 100오이와 현재 0오이 차감 정책을 한 설정에서 계산한다", () => {
  assert.equal(GAME_CONFIG.gardenPurchase.listPrice, 100);
  assert.equal(GAME_CONFIG.gardenPurchase.temporaryFree, true);
  assert.deepEqual(getGardenPurchasePricing(), {
    listPrice: 100,
    isTemporaryFree: true,
    price: 0,
  });
  assert.deepEqual(getGardenPurchasePricing({ temporaryFree: false }), {
    listPrice: 100,
    isTemporaryFree: false,
    price: 100,
  });
});

for (const balance of [0, 56]) {
  test(`무료 모드는 보유 오이 ${balance}개를 유지하며 텃밭을 반복 구매한다`, () => {
    const state = createInitialGameState(1_000);
    state.cucumbers = balance;

    for (let expectedCount = 1; expectedCount <= 5; expectedCount += 1) {
      const result = purchaseGarden(state);

      assert.equal(result.purchased, true);
      assert.equal(result.price, 0);
      assert.equal(state.cucumbers, balance);
      assert.equal(state.plots.length, expectedCount);
      assert.equal(result.plot.type, "garden");
      assert.equal(result.plot.slots.length, 4);
      assert.ok(result.plot.slots.every((slot) => !slot.isPlanted));
    }

    const plotIds = state.plots.map((plot) => plot.plotId);
    const slotIds = getAllSlots(state).map(({ slotId }) => slotId);

    assert.equal(new Set(plotIds).size, 5);
    assert.equal(new Set(slotIds).size, 20);
  });
}

test("hasClaimedFreeGarden 이전 값은 두 번째 이후 구매를 막지 않는다", () => {
  const state = createInitialGameState(1_000);

  state.hasClaimedFreeGarden = true;
  assert.equal(purchaseGarden(state).purchased, true);
  assert.equal(purchaseGarden(state).purchased, true);
  assert.equal(state.plots.length, 2);
});

test("무료 구매한 다섯 텃밭은 저장·새로고침 후 유지되고 계속 구매된다", () => {
  const storage = new MemoryStorage();
  const state = createInitialGameState(1_000);

  for (let index = 0; index < 5; index += 1) {
    assert.equal(purchaseGarden(state).purchased, true);
  }
  saveGame(state, storage, 2_000);
  const reloaded = loadGameSave(storage, 3_000);

  assert.equal(reloaded.state.plots.length, 5);
  assert.equal(purchaseGarden(reloaded.state).purchased, true);
  assert.equal(reloaded.state.plots.length, 6);
});

test("유료 모드는 99오이 구매를 거절하고 상태를 바꾸지 않는다", () => {
  const state = createInitialGameState(1_000);
  state.cucumbers = 99;
  const result = purchaseGarden(state, { temporaryFree: false });

  assert.equal(result.purchased, false);
  assert.equal(result.reason, "insufficient");
  assert.equal(state.cucumbers, 99);
  assert.equal(state.plots.length, 0);
  assert.equal(state.nextPlotSequence, 1);
});

test("유료 모드는 100오이를 정확히 차감하고 텃밭 하나를 추가한다", () => {
  const state = createInitialGameState(1_000);
  state.cucumbers = 100;
  const result = purchaseGarden(state, { temporaryFree: false });

  assert.equal(result.purchased, true);
  assert.equal(result.price, 100);
  assert.equal(state.cucumbers, 0);
  assert.equal(state.plots.length, 1);
});

test("구매 저장 실패는 오이·텃밭·순번을 모두 원래대로 되돌린다", () => {
  const state = createOwnedState();
  state.cucumbers = 100;
  const beforePlot = state.plots[0];
  const failingStorage = {
    setItem() {
      throw new Error("quota exceeded");
    },
  };
  const result = purchaseGarden(state, {
    temporaryFree: false,
    persist: () => saveGame(state, failingStorage, 2_000),
  });

  assert.equal(result.purchased, false);
  assert.equal(result.reason, "save-failed");
  assert.equal(state.cucumbers, 100);
  assert.deepEqual(state.plots, [beforePlot]);
  assert.equal(state.nextPlotSequence, 2);
});

test("여러 텃밭의 ID·순서·4슬롯 상태를 저장하고 복원한다", () => {
  const storage = new MemoryStorage();
  const state = createOwnedState();

  state.plots.push(createGardenPlot(2), createGardenPlot(3));
  state.nextPlotSequence = 4;
  plantAt(state, 0, 0);
  plantAt(state, 1, 2);
  state.plots[0].slots[0].xp = 9;
  state.plots[1].slots[2].xp = 34;
  saveGame(state, storage, 2_000);

  const loaded = loadGameSave(storage, 3_000).state;
  const plotIds = loaded.plots.map((plot) => plot.plotId);
  const slotIds = getAllSlots(loaded).map(({ slotId }) => slotId);

  assert.deepEqual(plotIds, ["garden-1", "garden-2", "garden-3"]);
  assert.equal(new Set(plotIds).size, 3);
  assert.equal(new Set(slotIds).size, 12);
  assert.ok(loaded.plots.every((plot) => plot.slots.length === 4));
  assert.equal(loaded.plots[0].slots[0].xp, 9);
  assert.equal(loaded.plots[1].slots[2].xp, 34);
});

test("중복되거나 잘못된 저장 ID도 충돌 없는 안정 ID로 정규화한다", () => {
  const raw = {
    ...createInitialGameState(1_000),
    plots: [
      {
        plotId: "same",
        type: "garden",
        slots: Array.from({ length: 4 }, () => ({
          slotId: "same-slot",
          isPlanted: false,
        })),
      },
      {
        plotId: "same",
        type: "garden",
        slots: [],
      },
    ],
  };
  const state = normalizeGameState(raw, 2_000);
  const plotIds = state.plots.map((plot) => plot.plotId);
  const slotIds = getAllSlots(state).map(({ slotId }) => slotId);

  assert.equal(new Set(plotIds).size, 2);
  assert.equal(new Set(slotIds).size, 8);
  assert.ok(state.plots.every((plot) => plot.slots.length === 4));
});

for (const [experience, expectedStage] of [
  [0, "sprout"],
  [15, "young"],
  [35, "adult"],
  [50, "adult"],
]) {
  test(`v1 ${expectedStage} ${experience}XP 작물을 첫 텃밭 첫 슬롯으로 옮긴다`, () => {
    const storage = new MemoryStorage(
      JSON.stringify(legacyState({ growthExperience: experience }))
    );
    const result = loadGameSave(storage, 10_000);
    const firstSlot = result.state.plots[0].slots[0];

    assert.equal(result.status, "migrated");
    assert.equal(result.state.plots.length, 1);
    assert.equal(firstSlot.isPlanted, true);
    assert.equal(firstSlot.xp, experience);
    assert.equal(firstSlot.growthStageId, expectedStage);
    assert.ok(result.state.plots[0].slots.slice(1).every((slot) => !slot.isPlanted));
    assert.equal(result.state.hasClaimedFreeGarden, true);
  });
}

test("v1 빈 작물도 첫 텃밭의 빈 첫 슬롯으로 보존한다", () => {
  const state = normalizeGameState(
    legacyState({ isPlanted: false, growthExperience: 42 }),
    10_000
  );

  assert.equal(state.plots.length, 1);
  assert.equal(state.plots[0].slots[0].isPlanted, false);
  assert.equal(state.plots[0].slots[0].xp, 0);
  assert.equal(state.hasClaimedFreeGarden, true);
});

test("v1에 isPlanted가 없으면 과거 작물을 잃지 않게 심어진 것으로 본다", () => {
  const raw = legacyState();
  delete raw.isPlanted;
  const state = normalizeGameState(raw, 10_000);

  assert.equal(state.plots[0].slots[0].isPlanted, true);
  assert.equal(state.plots[0].slots[0].xp, 18);
});

test("마이그레이션은 재화·시설·수확 기록·시각·설정을 보존한다", () => {
  const state = normalizeGameState(legacyState(), 10_000);

  assert.equal(state.cucumbers, 173);
  assert.equal(state.totalEarned, 240);
  assert.equal(state.touchYield, 2);
  assert.equal(state.harvestCount, 7);
  assert.equal(state.facilities["small-garden"], 2);
  assert.equal(state.facilities.greenhouse, 1);
  assert.equal(state.lastSavedAt, 8_000);
  assert.equal(state.startedAt, 1_000);
  assert.equal(state.settings.sound, false);
  assert.equal(calculateProductionRate(state), 10);
});

test("마이그레이션 저장을 반복 로드해도 텃밭이 늘어나지 않는다", () => {
  const storage = new MemoryStorage(JSON.stringify(legacyState()));
  const migrated = loadGameSave(storage, 10_000);

  assert.equal(saveGame(migrated.state, storage, 11_000).ok, true);
  const once = loadGameSave(storage, 12_000);
  assert.equal(saveGame(once.state, storage, 13_000).ok, true);
  const twice = loadGameSave(storage, 14_000);

  assert.equal(once.status, "loaded");
  assert.equal(twice.status, "loaded");
  assert.equal(twice.state.plots.length, 1);
  assert.equal(twice.state.plots[0].slots[0].xp, 18);
});

test("저장 형식은 명시적으로 v2·legacy·unsupported를 판별한다", () => {
  assert.equal(detectGameStateSchema(createInitialGameState()), "v2");
  assert.equal(detectGameStateSchema(legacyState()), "legacy");
  assert.equal(detectGameStateSchema({ saveVersion: 99 }), "unsupported");
  assert.equal(detectGameStateSchema(null), "unsupported");
});

test("빈 슬롯 첫 입력은 심기만 하고 XP를 지급하지 않는다", () => {
  const state = createOwnedState();
  const address = getSlotAddress(state);
  const result = plantCucumber(state, address.plotId, address.slotId);

  assert.equal(result.planted, true);
  assert.equal(address.slot.isPlanted, true);
  assert.equal(address.slot.xp, 0);
  assert.equal(state.cucumbers, 0);
});

test("심은 뒤 다음 물주기부터 대상 슬롯에만 1XP를 지급한다", () => {
  const state = createOwnedState();
  const first = plantAt(state, 0, 0);
  const second = plantAt(state, 0, 1);
  const result = collectTouch(state, first.plotId, first.slotId);

  assert.equal(result.gained, 1);
  assert.equal(first.slot.xp, 1);
  assert.equal(second.slot.xp, 0);
});

test("네 슬롯은 서로 다른 XP와 성장 단계를 독립적으로 유지한다", () => {
  const state = createOwnedState();

  for (let index = 0; index < 4; index += 1) plantAt(state, 0, index);
  const amounts = [2, 15, 34, 50];
  amounts.forEach((amount, index) => {
    const { plotId, slotId } = getSlotAddress(state, 0, index);
    addGrowthExperience(state, plotId, slotId, amount);
  });

  assert.deepEqual(
    state.plots[0].slots.map((slot) => slot.xp),
    amounts
  );
  assert.deepEqual(
    state.plots[0].slots.map((slot) => slot.growthStageId),
    ["sprout", "young", "young", "adult"]
  );
});

test("슬롯별 새싹→애기오이→어른오이 두 단계 진화 기준이 유지된다", () => {
  assert.equal(getGrowthStage(14).id, "sprout");
  assert.equal(getGrowthStage(15).id, "young");
  assert.equal(getGrowthStage(34).id, "young");
  assert.equal(getGrowthStage(35).id, "adult");
  assert.equal(getGrowthProgress(50).isHarvestReady, true);
});

test("성장 막대는 각 단계 시작점에서 0으로 초기화되고 해당 단계 요구량만 사용한다", () => {
  const scenarios = [
    [0, "sprout", 0, 15, 0, false],
    [14, "sprout", 14, 15, (14 / 15) * 100, false],
    [15, "young", 0, 20, 0, false],
    [34, "young", 19, 20, 95, false],
    [35, "adult", 0, 15, 0, false],
    [50, "adult", 15, 15, 100, true],
  ];

  scenarios.forEach(
    ([xp, stageId, stageExperience, stageRequirement, percent, ready]) => {
      const progress = getGrowthProgress(xp);

      assert.equal(progress.stage.id, stageId);
      assert.equal(progress.stageExperience, stageExperience);
      assert.equal(progress.stageRequirement, stageRequirement);
      assert.equal(progress.progressPercent, percent);
      assert.equal(progress.isHarvestReady, ready);
    }
  );
});

test("한 번에 단계 기준을 초과한 XP는 다음 단계 경험치로 안전하게 이월한다", () => {
  const state = createOwnedState();
  const address = plantAt(state);

  addGrowthExperience(state, address.plotId, address.slotId, 14);
  const result = addGrowthExperience(state, address.plotId, address.slotId, 22);
  const progress = getGrowthProgress(address.slot.xp);

  assert.equal(result.gained, 22);
  assert.equal(address.slot.xp, 36);
  assert.equal(address.slot.growthStageId, "adult");
  assert.equal(progress.stageExperience, 1);
  assert.equal(progress.stageRequirement, 15);
});

test("기존 누적 XP 저장값은 재접속 후 단계와 단계별 표시 경험치를 함께 보존한다", () => {
  const state = createOwnedState(1_000);
  const address = plantAt(state);
  const storage = new MemoryStorage();

  addGrowthExperience(state, address.plotId, address.slotId, 18);
  assert.equal(saveGame(state, storage, 2_000).ok, true);
  const loaded = loadGameSave(storage, 3_000).state;
  const loadedSlot = loaded.plots[0].slots[0];
  const progress = getGrowthProgress(loadedSlot.xp);

  assert.equal(loadedSlot.xp, 18);
  assert.equal(loadedSlot.growthStageId, "young");
  assert.equal(progress.stageExperience, 3);
  assert.equal(progress.stageRequirement, 20);
});

test("다 자란 슬롯 수확은 그 슬롯만 비우고 보유 오이를 정확히 1 늘린다", () => {
  const state = createOwnedState();
  const first = plantAt(state, 0, 0);
  const second = plantAt(state, 0, 1);

  addGrowthExperience(state, first.plotId, first.slotId, 50);
  addGrowthExperience(state, second.plotId, second.slotId, 17);
  const before = state.cucumbers;
  const result = harvestCucumber(state, first.plotId, first.slotId);

  assert.equal(GAME_CONFIG.harvestReward, 1);
  assert.equal(result.harvested, true);
  assert.equal(result.reward, 1);
  assert.equal(state.cucumbers, before + 1);
  assert.equal(first.slot.isPlanted, false);
  assert.equal(first.slot.xp, 0);
  assert.equal(second.slot.isPlanted, true);
  assert.equal(second.slot.xp, 17);
});

test("같은 성숙 슬롯을 두 번 수확해도 보상은 한 번만 지급된다", () => {
  const state = createOwnedState();
  const address = plantAt(state);

  addGrowthExperience(state, address.plotId, address.slotId, 50);
  assert.equal(
    harvestCucumber(state, address.plotId, address.slotId).harvested,
    true
  );
  assert.equal(
    harvestCucumber(state, address.plotId, address.slotId).harvested,
    false
  );
  assert.equal(state.cucumbers, 1);
  assert.equal(state.harvestCount, 1);
});

test("수확 후에는 별도 심기 호출 전까지 빈 상태가 유지된다", () => {
  const state = createOwnedState();
  const address = plantAt(state);

  addGrowthExperience(state, address.plotId, address.slotId, 50);
  harvestCucumber(state, address.plotId, address.slotId);
  assert.equal(address.slot.isPlanted, false);
  assert.equal(address.slot.xp, 0);
  assert.equal(
    plantCucumber(state, address.plotId, address.slotId).planted,
    true
  );
  assert.equal(address.slot.xp, 0);
});

test("자동 XP는 작물 수와 무관하게 기존 전역 총량만 생성한다", () => {
  const state = createOwnedState();

  state.facilities["small-garden"] = 1;
  for (let index = 0; index < 4; index += 1) plantAt(state, 0, index);
  const result = applyProduction(state, 4_000);

  assert.equal(result.generated, 4);
  assert.equal(result.gained, 4);
  assert.equal(
    state.plots[0].slots.reduce((total, slot) => total + slot.xp, 0),
    4
  );
  assert.deepEqual(
    state.plots[0].slots.map((slot) => slot.xp),
    [1, 1, 1, 1]
  );
});

test("라운드로빈은 안정적인 슬롯 순서와 다음 커서를 유지한다", () => {
  const state = createOwnedState();

  for (let index = 0; index < 4; index += 1) plantAt(state, 0, index);
  const first = distributeAutomaticExperience(state, 5);
  const second = distributeAutomaticExperience(state, 3);

  assert.equal(first.gained, 5);
  assert.deepEqual(
    state.plots[0].slots.map((slot) => slot.xp),
    [2, 2, 2, 2]
  );
  assert.equal(second.gained, 3);
  assert.equal(state.autoXpCursor, 0);
});

test("250ms 자동 생산은 소수 누적 후 확정된 정수 XP만 배분한다", () => {
  const state = createOwnedState();
  const address = plantAt(state);

  state.facilities["small-garden"] = 1;
  assert.equal(applyProduction(state, 250).gained, 0);
  assert.equal(applyProduction(state, 250).gained, 0);
  assert.equal(applyProduction(state, 250).gained, 0);
  assert.equal(address.slot.xp, 0);
  assert.equal(applyProduction(state, 250).gained, 1);
  assert.equal(address.slot.xp, 1);
  assert.equal(state.automaticXpRemainder, 0);
});

test("빈 슬롯과 성숙 슬롯은 자동 XP 대상에서 제외되고 다른 슬롯에 재배분된다", () => {
  const state = createOwnedState();
  const mature = plantAt(state, 0, 0);
  const growing = plantAt(state, 0, 2);

  addGrowthExperience(state, mature.plotId, mature.slotId, 50);
  const result = distributeAutomaticExperience(state, 4);

  assert.equal(result.gained, 4);
  assert.equal(mature.slot.xp, 50);
  assert.equal(state.plots[0].slots[1].xp, 0);
  assert.equal(growing.slot.xp, 4);
});

test("모든 슬롯이 비었거나 성숙하면 자동 XP를 잘못 보관하거나 지급하지 않는다", () => {
  const emptyState = createOwnedState();
  const emptyResult = distributeAutomaticExperience(emptyState, 3.75);

  assert.equal(emptyResult.gained, 0);
  assert.equal(emptyState.automaticXpRemainder, 0);

  const matureState = createOwnedState();
  const mature = plantAt(matureState);
  addGrowthExperience(matureState, mature.plotId, mature.slotId, 50);
  const matureResult = distributeAutomaticExperience(matureState, 4);

  assert.equal(matureResult.gained, 0);
  assert.equal(mature.slot.xp, 50);
});

test("오프라인 XP도 전역 총량 한 번만 라운드로빈 배분한다", () => {
  const state = createOwnedState(1_000);

  state.facilities["small-garden"] = 1;
  for (let index = 0; index < 4; index += 1) plantAt(state, 0, index);
  state.lastSavedAt = 1_000;
  const preview = calculateOfflineReward(state, 5_000);
  const result = applyOfflineReward(state, 5_000);

  assert.equal(preview.potentialExperience, 4);
  assert.equal(preview.reward, 4);
  assert.equal(result.gained, 4);
  assert.equal(result.allocations.length, 4);
  assert.deepEqual(
    state.plots[0].slots.map((slot) => slot.xp),
    [1, 1, 1, 1]
  );
});

test("오프라인 보상 적용 시각을 전진시켜 같은 구간을 중복 지급하지 않는다", () => {
  const state = createOwnedState(1_000);
  const address = plantAt(state);

  state.facilities["small-garden"] = 1;
  state.lastSavedAt = 1_000;
  assert.equal(applyOfflineReward(state, 4_000).gained, 3);
  assert.equal(applyOfflineReward(state, 4_000).gained, 0);
  assert.equal(address.slot.xp, 3);
});

test("오프라인 시간은 8시간 상한과 전체 남은 용량을 넘지 않는다", () => {
  const state = createOwnedState(1_000);
  const address = plantAt(state);

  state.facilities["processing-factory"] = 1;
  state.lastSavedAt = 1_000;
  const result = applyOfflineReward(
    state,
    1_000 + (GAME_CONFIG.maxOfflineSeconds + 100) * 1_000
  );

  assert.equal(result.elapsedSeconds, GAME_CONFIG.maxOfflineSeconds);
  assert.equal(result.gained, GAME_CONFIG.harvestExperience);
  assert.equal(address.slot.xp, GAME_CONFIG.harvestExperience);
});

test("파생 생산량과 슬롯 단계는 저장값을 신뢰하지 않고 다시 계산한다", () => {
  const state = createOwnedState();
  const address = plantAt(state);

  state.facilities.greenhouse = 2;
  state.perSecond = 999_999;
  address.slot.xp = 16;
  address.slot.growthStageId = "adult";
  synchronizeDerivedState(state);

  assert.equal(state.perSecond, 16);
  assert.equal(address.slot.growthStageId, "young");
});

test("게임 엔진 tick도 총 XP 한 번만 적용하고 콜백에 슬롯 배분을 전달한다", () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    setInterval() {
      return 1;
    },
    clearInterval() {},
  };

  try {
    const state = createOwnedState();
    const address = plantAt(state);
    const updates = [];
    let now = 1_000;

    state.facilities["small-garden"] = 1;
    const engine = new GameEngine({
      state,
      clock: () => now,
      onUpdate: (update) => updates.push(update),
    });
    now = 3_000;
    const result = engine.synchronize();

    assert.equal(result.gained, 2);
    assert.equal(address.slot.xp, 2);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].allocations[0].slotId, address.slotId);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("성장 단계별 물 도착점은 실제 캐릭터 표시 영역의 머리·잎을 따른다", () => {
  const sceneRect = { left: 100, top: 500, width: 320, height: 520 };
  const scrolledSceneRect = { ...sceneRect, top: 120 };

  for (const [stageId, anchor] of Object.entries(CROP_WATER_TARGETS)) {
    const characterRect = {
      left: 145,
      top: 600,
      width: 44,
      height: 44,
    };
    const scrolledCharacterRect = { ...characterRect, top: 220 };
    const target = calculateCropWateringTarget(
      sceneRect,
      characterRect,
      stageId
    );
    const scrolledTarget = calculateCropWateringTarget(
      scrolledSceneRect,
      scrolledCharacterRect,
      stageId
    );

    assert.equal(target.targetX, 45 + 44 * anchor.x);
    assert.equal(target.targetY, 100 + 44 * anchor.y);
    assert.equal(target.cropSize, 44);
    assert.deepEqual(scrolledTarget, target);

    const layout = calculateWateringLayout(sceneRect, target);

    assert.ok(layout.canY < layout.targetY);
    assert.ok(layout.targetErrorDistance < 0.001);
  }
});

test("320px·390px·430px에서 물뿌리개는 새싹 표시 크기를 직접 따른다", () => {
  for (const viewportWidth of [320, 390, 430]) {
    const cropSize = Math.min(54, Math.max(40, viewportWidth * 0.12));
    const sceneRect = {
      left: 0,
      top: 0,
      width: viewportWidth,
      height: 620,
    };
    const layout = calculateWateringLayout(sceneRect, {
      targetX: viewportWidth * 0.25,
      targetY: 130,
      cropSize,
    });

    assert.equal(layout.canSize, cropSize);
    assert.ok(layout.canSize >= 40 && layout.canSize <= 54);
    assert.ok(layout.canSize > 38);
    assert.equal(
      layout.spriteWidth,
      layout.canSize * WATERING_LAYOUT_CONFIG.spriteToCanScale
    );
    assert.equal(layout.spriteHeight, layout.spriteWidth);
    assert.ok(layout.targetErrorDistance < 0.001);
  }

  assert.equal(WATERING_LAYOUT_CONFIG.minimumCanSize, 40);
  assert.equal(WATERING_LAYOUT_CONFIG.maximumCanSize, 64);
});

test("확대된 물뿌리개 출구와 물줄기 시작점은 연결되고 마지막 물방울은 작물에 닿는다", () => {
  const sceneRect = { left: 100, top: 50, width: 320, height: 520 };
  const layout = calculateWateringLayout(sceneRect, {
    targetX: 92,
    targetY: 130,
    cropSize: 48,
  });

  assert.equal(getWateringSide(180, sceneRect), "left");
  assert.equal(getWateringSide(300, sceneRect), "right");
  assert.ok(layout.canY < layout.targetY);
  assert.ok(layout.directionY > 0);
  assert.ok(Math.abs(layout.directionX) > 0);
  assert.ok(layout.targetErrorDistance < 0.001);
  assert.ok(Math.abs(layout.spriteStartX - layout.nozzleX) < 0.001);
  assert.ok(Math.abs(layout.spriteStartY - layout.nozzleY) < 0.001);
  assert.equal(layout.splashX, layout.spriteImpactX);
  assert.equal(layout.splashY, layout.spriteImpactY);
  assert.equal(WATERING_CAN_CONFIG.tiltDegrees, 16);
  assert.equal(WATER_SPRITE_CONFIG.frameCount, 8);
});

test("네 슬롯과 좌우 가장자리에서는 방향을 반전하며 확대 효과 전체를 안전 범위에 둔다", () => {
  for (const sceneRect of [
    { left: 0, top: 0, width: 320, height: 520 },
    { left: 0, top: 0, width: 430, height: 720 },
  ]) {
    for (const [targetX, preferredSide] of [
      [sceneRect.width * 0.2, "right"],
      [sceneRect.width * 0.42, "left"],
      [sceneRect.width * 0.58, "right"],
      [sceneRect.width * 0.82, "left"],
    ]) {
      const layout = calculateWateringLayout(sceneRect, {
        targetX,
        targetY: 135,
        cropSize: 48,
        preferredSide,
      });

      assert.equal(layout.side, preferredSide);
      assert.ok(layout.effectBounds.left >= layout.safeMargin - 0.001);
      assert.ok(layout.effectBounds.top >= layout.safeMargin - 0.001);
      assert.ok(
        layout.effectBounds.right <= sceneRect.width - layout.safeMargin + 0.001
      );
      assert.ok(
        layout.effectBounds.bottom <= sceneRect.height - layout.safeMargin + 0.001
      );
      assert.ok(layout.targetErrorDistance < 0.001);
    }
  }
});

test("텃밭 접합 정보는 홀수 세 번째·다섯 번째를 다음 행 왼쪽에 유지한다", () => {
  const threePlots = Array.from({ length: 3 }, (_, index) =>
    getPlotSurfaceJoin(index, 3)
  );
  const fivePlots = Array.from({ length: 5 }, (_, index) =>
    getPlotSurfaceJoin(index, 5)
  );

  assert.deepEqual(
    threePlots.map(({ row, column }) => [row, column]),
    [[0, 0], [0, 1], [1, 0]]
  );
  assert.deepEqual(
    fivePlots.map(({ row, column }) => [row, column]),
    [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]]
  );
  assert.equal(threePlots[0].edges.right, false);
  assert.equal(threePlots[0].edges.bottom, false);
  assert.equal(threePlots[1].corners.bottomRight, true);
  assert.equal(threePlots[2].corners.bottomLeft, true);
  assert.equal(fivePlots[4].edges.right, true);
});

test("HTML에는 제거 대상 안내·알림·수확 버튼이 없고 HUD와 메뉴만 유지된다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const body = html.match(/<body>([\s\S]*)<\/body>/)?.[1] ?? "";

  assert.match(body, /id="cucumberCount"/);
  assert.match(body, /id="productionRate"/);
  assert.match(body, /id="touchYield"/);
  assert.match(body, /id="menuButton"/);
  assert.doesNotMatch(body, /id="stageToast"|id="harvestButton"/);
  assert.doesNotMatch(body, /오이에게 물을 주세요/);
  assert.doesNotMatch(body, /다 자랐어요!\s*수확/);
  assert.doesNotMatch(body, /빈 밭을 톡/);
  assert.doesNotMatch(body, /수확하고\s*\+50/);
  assert.equal(body.match(/id="menuButton"/g)?.length, 1);
});

test("상점은 100오이 정가와 현재 무료 상태를 구분하고 반복 구매를 유지한다", async () => {
  const [html, renderer, main] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /id="shopMenuButton"[\s\S]*상점/);
  assert.match(html, /id="gardenPurchaseButton"[\s\S]*무료 구매/);
  assert.match(renderer, /GAME_CONFIG\.gardenPurchase/);
  assert.match(renderer, /정가 \$\{formattedListPrice\}오이 · 현재 무료/);
  assert.doesNotMatch(renderer, /가격 확정 후 이용 가능|구매 준비 중/);
  assert.match(renderer, /gardenPurchaseButton\.disabled = this\.purchasePending/);
  assert.match(main, /purchasePending[\s\S]*purchaseGarden\(state, \{ persist: persistNow \}\)/);
  assert.match(main, /requestAnimationFrame/);
  assert.match(main, /save-failed/);
  assert.match(main, /menuModal\.addEventListener\("pointerdown", stopModalInput\)/);
  assert.equal(GAME_CONFIG.gardenPurchase.listPrice, 100);
  assert.equal(GAME_CONFIG.gardenPurchase.temporaryFree, true);
});

test("탑다운 밭은 2×2 슬롯 단위를 빈틈 없는 연속 표면으로 왼쪽부터 배치한다", async () => {
  const [html, css, renderer] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
  ]);

  assert.match(html, /class="sky-header"/);
  assert.match(html, /id="plotList"/);
  assert.match(css, /body\s*\{[\s\S]*overflow-x:\s*hidden;[\s\S]*overflow-y:\s*auto;/);
  assert.match(css, /\.sky-header\s*\{[\s\S]*position:\s*fixed;/);
  assert.match(css, /\.crop-slot-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,/);
  assert.match(
    css,
    /\.crop-slot-grid\s*\{[^}]*grid-template-rows:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[^}]*height:\s*100%;/s
  );
  assert.match(
    css,
    /\.plot-list\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2,[^}]*gap:\s*0;/s
  );
  assert.match(css, /\.plot-list\s*\{[^}]*overflow:\s*hidden;[^}]*border-radius:/s);
  assert.match(css, /\.garden-plot\s*\{[^}]*aspect-ratio:\s*1;/s);
  assert.doesNotMatch(css, /\.garden-plot:last-child:nth-child\(odd\)/);
  assert.doesNotMatch(
    css,
    /\.garden-plot\s*\{[^}]*(?:justify-self|grid-column):/s
  );
  assert.match(css, /\.garden-plot\[data-edge-right="false"\]/);
  assert.match(css, /\.garden-plot\[data-corner-top-left="true"\]/);
  assert.match(css, /drop-shadow\(/);
  assert.match(renderer, /getPlotSurfaceJoin\(\s*plotIndex,\s*state\.plots\.length/s);
  assert.match(
    css,
    /\.garden-world\s*\{[^}]*env\(safe-area-inset-bottom\)\s*\+\s*44px/s
  );
  assert.match(
    css,
    /\.garden-world\s*\{[^}]*padding:\s*clamp\(16px,\s*5dvh,\s*36px\)/s
  );
  assert.match(renderer, /GAME_CONFIG\.slotsPerPlot|plot\.slots\.forEach/);
  assert.doesNotMatch(renderer, /garden-plot__label/);
  assert.doesNotMatch(css, /\.garden-plot__label\s*\{/);
  assert.match(renderer, /article\.setAttribute\("aria-label", `텃밭/);
  assert.doesNotMatch(css, /\.game-shell\s*\{[^}]*overflow:\s*hidden;/s);
  assert.doesNotMatch(css, /\.garden-plot\s*\{[^}]*transform:\s*scale/s);
  assert.doesNotMatch(css, /\.garden-plot\s*\{[^}]*margin:\s*-/s);
});

test("메뉴 버튼의 평상시 보더는 없고 비노란색 키보드 포커스는 유지된다", async () => {
  const css = await readFile(new URL("../css/game.css", import.meta.url), "utf8");
  const menuRule = css.match(/\.menu-button\s*\{([^}]*)\}/)?.[1] ?? "";
  const focusRule =
    css.match(/\.menu-button:focus-visible\s*\{([^}]*)\}/)?.[1] ?? "";

  assert.match(menuRule, /border:\s*0;/);
  assert.match(menuRule, /min-width:\s*48px;/);
  assert.match(menuRule, /min-height:\s*48px;/);
  assert.doesNotMatch(menuRule, /color-sun|244,\s*198,\s*78/);
  assert.match(focusRule, /outline-color:\s*var\(--color-leaf-700\);/);
});

test("성체 단계는 투명 정사각형 cucumber-adult 전용 자산을 사용한다", async () => {
  const [configSource, adultAsset] = await Promise.all([
    readFile(new URL("../js/game-config.js", import.meta.url), "utf8"),
    readFile(new URL("../assets/images/cucumber-adult.png", import.meta.url)),
  ]);
  const adultStage = GAME_CONFIG.growthStages.find(
    (stage) => stage.id === "adult"
  );

  assert.equal(adultStage.characterAsset, "./assets/images/cucumber-adult.png");
  assert.doesNotMatch(
    configSource,
    /id:\s*"adult"[\s\S]*?characterAsset:\s*"\.\/assets\/images\/cucumber\.png"/
  );
  assert.ok(adultAsset.byteLength > 0);
});

test("슬롯별 XP 막대는 심어진 슬롯의 현재 단계 XP만 표시하고 접근성 값도 같은 기준을 쓴다", async () => {
  const [renderer, css] = await Promise.all([
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
  ]);

  assert.match(renderer, /progress\.setAttribute\("role", "progressbar"\)/);
  assert.match(renderer, /view\.progress\.hidden = !isPlanted/);
  assert.match(renderer, /progress\.progressPercent/);
  assert.match(renderer, /progress\.stageExperience/);
  assert.match(renderer, /progress\.stageRequirement/);
  assert.match(renderer, /aria-valuenow/);
  assert.match(renderer, /aria-valuetext/);
  assert.match(css, /\.crop-xp-bar\s*\{[\s\S]*height:\s*5px;/);
  assert.match(css, /bottom:\s*calc\(var\(--crop-visible-top\)/);
  assert.match(css, /\.crop-xp-bar__fill\s*\{[\s\S]*#f2b935[\s\S]*#ffe47c/);
});

test("빈 슬롯·수확 슬롯 유도 효과와 화면 밖·reduced-motion 완화가 존재한다", async () => {
  const [renderer, css] = await Promise.all([
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
  ]);

  assert.match(css, /empty-slot-pulse/);
  assert.match(css, /harvest-ready-bob/);
  assert.match(css, /\.garden-plot\[data-visible="false"\][\s\S]*animation-play-state:\s*paused/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /animation:\s*none !important/);
  assert.match(renderer, /IntersectionObserver/);
  assert.match(renderer, /addEventListener\(\s*"resize",\s*this\.handleWateringResize/s);
  assert.match(renderer, /addEventListener\(\s*"scroll",\s*this\.handleWateringResize/s);
});

test("슬롯별 컨트롤러·효과 레이어·전환 Promise를 재사용하고 제거 시 정리한다", async () => {
  const renderer = await readFile(
    new URL("../js/ui-renderer.js", import.meta.url),
    "utf8"
  );

  assert.match(renderer, /this\.slotViews = new Map\(\)/);
  assert.match(renderer, /new CropTransitionController\(/);
  assert.match(renderer, /buildWateringEffect\(touchEffects\)/);
  assert.match(renderer, /gardenWorld\.append\(slotView\.touchEffects\)/);
  assert.match(renderer, /productionAccumulator: createWholeXpGainAccumulator\(\)/);
  assert.match(renderer, /view\.controller\.suspend\(\)/);
  assert.match(renderer, /view\.touchEffects\.remove\(\)/);
  assert.match(renderer, /root\.style\.removeProperty\(property\)/);
  assert.match(renderer, /if \(key !== "state"\) delete root\.dataset\[key\]/);
  assert.match(renderer, /this\.slotViews\.delete\(view\.key\)/);
  assert.doesNotMatch(renderer, /#characterButton|#characterImage|#harvestButton/);
});

test("pointerdown과 합성 click의 중복, 슬롯별 전환 잠금, 수확 후 즉시 재심기를 방지한다", async () => {
  const main = await readFile(
    new URL("../js/main.js", import.meta.url),
    "utf8"
  );

  assert.match(main, /const slotLocks = new Set\(\)/);
  assert.match(main, /lastPointerInteractionAtBySlot/);
  assert.match(main, /event\.detail !== 0/);
  assert.match(main, /< 700/);
  assert.match(main, /if \(!target\.slot\.isPlanted\)[\s\S]*return;[\s\S]*isHarvestReady[\s\S]*return;/);
  assert.match(main, /try \{[\s\S]*await transition;[\s\S]*finally \{[\s\S]*slotLocks\.delete\(key\)/);
  assert.doesNotMatch(main, /addEventListener\("touchstart"/);
});

test("게임은 기존 내부 이미지·CSS만 사용하고 외부 라이브러리를 추가하지 않는다", async () => {
  const [html, renderer, packageJson] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(html, /https?:\/\//);
  assert.match(renderer, /\.\/assets\/images\/water-gun\.png/);
  assert.match(renderer, /\.\/assets\/images\/water\.png/);
  assert.equal(JSON.parse(packageJson).dependencies, undefined);
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
