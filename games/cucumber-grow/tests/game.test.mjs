import assert from "node:assert/strict";
import test from "node:test";
import { readFile, access } from "node:fs/promises";
import { GAME_CONFIG } from "../js/game-config.js";
import {
  getCoordinatesForIndex,
  getNeighborCoordinates,
} from "../js/board-geometry.js";
import {
  createGardenPlot,
  createInitialGameState,
  detectGameStateSchema,
  normalizeGameState,
} from "../js/game-state.js";
import {
  addCropExperience,
  buyConsumable,
  canPurchaseGarden,
  getGrowthProgress,
  getMaximumPlotsForLevel,
  getPlayerLevel,
  getPlotHarvestYield,
  getPlotPrice,
  harvestCrop,
  plantCrop,
  purchaseGarden,
  sellCucumbers,
  useWateringCan,
} from "../js/game-engine.js";
import {
  buyFacility,
  getDaytimeProtectionChance,
  getFacilityAffectedPlots,
  getFacilityStatus,
  placeFacility,
  validateFacilityPlacement,
} from "../js/facility-engine.js";
import {
  advanceGameTime,
  applyThreatDamage,
  advanceThreatStates,
  hitThreat,
  resolveExpiredThreats,
  spawnThreat,
  startNextDay,
  transitionPhase,
} from "../js/turn-engine.js";
import { applyOfflineReward } from "../js/offline-reward.js";
import { loadGameSave, saveGame } from "../js/save-manager.js";

class MemoryStorage {
  constructor(initial = {}) {
    this.values = new Map(Object.entries(initial));
    this.writeCount = 0;
  }
  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }
  setItem(key, value) {
    this.values.set(key, String(value));
    this.writeCount += 1;
  }
  removeItem(key) {
    this.values.delete(key);
  }
}

function withPlots(count, now = 10_000) {
  const state = createInitialGameState(now);
  state.plots = Array.from({ length: count }, (_, index) =>
    createGardenPlot(index + 1)
  );
  state.nextPlotSequence = count + 1;
  return state;
}

function plant(state, plotIndex, xp = 0) {
  const plot = state.plots[plotIndex];
  plot.crop.isPlanted = true;
  plot.crop.cropXp = xp;
  plot.crop.growthStageId = getGrowthProgress(xp).stage.id;
  return plot;
}

function setPreparation(state, now = 10_000) {
  state.turn.phase = "preparation";
  state.turn.phaseStartedAt = now;
  state.turn.phaseEndsAt = null;
  state.turn.lastEffectAt = now;
  state.turn.nextThreatAt = null;
}

function setLevel(state, level) {
  state.playerXp = GAME_CONFIG.player.levelThresholds[level - 1];
  state.playerLevel = level;
}

test("신규 사용자는 텃밭 하나와 기본 도구를 한 번 지급받는다", () => {
  const state = createInitialGameState(1_000);
  assert.equal(state.schemaVersion, GAME_CONFIG.schemaVersion);
  assert.equal(state.plots.length, 1);
  assert.equal(state.inventory.wateringCan, 1);
  assert.equal(state.inventory.hammer, 1);
  assert.equal(state.baseItemsGranted, true);
  assert.equal(state.settings.bgmEnabled, true);
  assert.equal(state.settings.hapticsEnabled, true);
});

test("텃밭 하나에는 독립 작물 객체 하나만 존재한다", () => {
  const plot = createGardenPlot(1);
  assert.deepEqual(Object.keys(plot.crop).sort(), [
    "cropXp",
    "growthStageId",
    "isPlanted",
    "yieldPenalty",
  ]);
  assert.equal("slots" in plot, false);
});

test("3열 좌표는 네 번째와 일곱 번째 텃밭에서 새 행을 시작한다", () => {
  assert.deepEqual(getCoordinatesForIndex(0), { row: 0, column: 0 });
  assert.deepEqual(getCoordinatesForIndex(2), { row: 0, column: 2 });
  assert.deepEqual(getCoordinatesForIndex(3), { row: 1, column: 0 });
  assert.deepEqual(getCoordinatesForIndex(6), { row: 2, column: 0 });
});

test("레벨별 텃밭 한도는 레벨 수와 같고 설정 상한을 넘지 않는다", () => {
  assert.equal(getMaximumPlotsForLevel(1), 1);
  assert.equal(getMaximumPlotsForLevel(5), 5);
  assert.equal(getMaximumPlotsForLevel(999), 12);
});

test("레벨 제한을 넘는 텃밭 구매는 이유와 함께 차단된다", () => {
  const state = createInitialGameState(1_000);
  setPreparation(state);
  state.coins = 10_000;
  const result = canPurchaseGarden(state);
  assert.equal(result.ok, false);
  assert.equal(result.reason, "level-limit");
  assert.equal(state.plots.length, 1);
});

test("레벨 5는 정확히 다섯 텃밭까지 구매할 수 있다", () => {
  const state = createInitialGameState(1_000);
  setPreparation(state);
  setLevel(state, 5);
  state.coins = 100_000;
  while (state.plots.length < 5) assert.equal(purchaseGarden(state).ok, true);
  assert.equal(state.plots.length, 5);
  assert.equal(purchaseGarden(state).reason, "level-limit");
});

test("텃밭별 수확량은 10, 30, 50 이후 20씩 증가한다", () => {
  assert.equal(getPlotHarvestYield(1), 10);
  assert.equal(getPlotHarvestYield(2), 30);
  assert.equal(getPlotHarvestYield(3), 50);
  assert.equal(getPlotHarvestYield(12), 230);
});

test("텃밭 가격은 설정 배열의 점진적 가격을 사용한다", () => {
  assert.equal(getPlotPrice(1), 0);
  assert.equal(getPlotPrice(2), 300);
  assert.equal(getPlotPrice(3), 540);
  assert.equal(getPlotPrice(12), 5_400);
});

test("cropXp 성장과 playerXp 레벨은 별도 필드로 증가한다", () => {
  const state = createInitialGameState(1_000);
  plant(state, 0, 14);
  const result = addCropExperience(state, state.plots[0].plotId, 1);
  assert.equal(state.plots[0].crop.cropXp, 15);
  assert.equal(state.playerXp, GAME_CONFIG.player.cropEvolutionXp);
  assert.equal(result.stage.id, "young");
});

test("물뿌리개는 쿨타임 없이 빠른 10회 터치를 모두 XP로 처리한다", () => {
  const state = createInitialGameState(1_000);
  plant(state, 0);
  const results = Array.from({ length: 10 }, (_, index) =>
    useWateringCan(state, state.plots[0].plotId, 2_000 + index)
  );
  assert.equal(results.every((result) => result.ok), true);
  assert.equal(GAME_CONFIG.tools.wateringCan.cropXp, 1);
  assert.equal(state.plots[0].crop.cropXp, 10);
  assert.equal(state.resources.water, GAME_CONFIG.resources.startingWater - 10);
});

test("수확은 텃밭 순서별 수확량과 피해 감산을 적용하고 playerXp를 준다", () => {
  const state = withPlots(3);
  const plot = plant(state, 2, 50);
  plot.crop.yieldPenalty = 4;
  const result = harvestCrop(state, plot.plotId);
  assert.equal(result.harvested, 46);
  assert.equal(state.cucumbers, 46);
  assert.equal(state.playerXp, GAME_CONFIG.player.harvestXp);
  assert.equal(plot.crop.isPlanted, false);
});

test("스프링클러 중심의 범위는 자기 자신을 뺀 정확한 8방향이다", () => {
  const coordinates = getNeighborCoordinates(1, 1);
  assert.equal(coordinates.length, 8);
  assert.equal(coordinates.some(({ row, column }) => row === 1 && column === 1), false);
  assert.deepEqual(
    new Set(coordinates.map(({ row, column }) => `${row}:${column}`)),
    new Set(["0:0", "0:1", "0:2", "1:0", "1:2", "2:0", "2:1", "2:2"])
  );
});

test("게임판 모서리 스프링클러는 존재 가능한 3칸에만 연결된다", () => {
  const state = withPlots(9);
  const facility = { type: "sprinkler", row: 0, column: 0 };
  const targets = getFacilityAffectedPlots(state, facility);
  assert.deepEqual(
    targets.map((plot) => `${plot.row}:${plot.column}`).sort(),
    ["0:1", "1:0", "1:1"]
  );
});

test("겹친 스프링클러는 같은 작물에 초당 XP를 중복 적용하지 않는다", () => {
  const state = withPlots(9, 10_000);
  const target = plant(state, 4);
  state.facilities = [
    { facilityId: "facility-1", type: "sprinkler", row: 0, column: 0, active: true },
    { facilityId: "facility-2", type: "sprinkler", row: 0, column: 2, active: true },
  ];
  state.resources.water = 10;
  state.turn.phase = "day";
  state.turn.lastEffectAt = 10_000;
  state.turn.phaseEndsAt = 100_000;
  advanceGameTime(state, 11_000, { random: () => 0.99 });
  assert.equal(target.crop.cropXp, 1.25);
});

test("허수아비는 이름 하드코딩 없이 주변 낮 위협 확률을 70% 낮춘다", () => {
  const state = withPlots(9, 10_000);
  const target = plant(state, 4);
  state.facilities = [
    { facilityId: "facility-1", type: "scarecrow", row: 0, column: 0, active: true },
  ];
  assert.equal(getDaytimeProtectionChance(state, target.plotId), 0.7);
  const result = spawnThreat(state, 11_000, () => 0.1);
  assert.equal(result.spawned, false);
  assert.equal(result.reason, "scarecrow-protected");
});

test("온실은 유효한 3×2 여섯 칸의 기존 작물을 지우지 않고 설치된다", () => {
  const state = withPlots(6);
  setLevel(state, 6);
  state.inventory.greenhouse = 1;
  plant(state, 0, 12);
  const validation = validateFacilityPlacement(state, "greenhouse", 0, 0);
  assert.equal(validation.ok, true);
  assert.equal(validation.targets.length, 6);
  const result = placeFacility(state, "greenhouse", 0, 0, 12_000);
  assert.equal(result.ok, true);
  assert.equal(state.plots[0].crop.cropXp, 12);
  assert.equal(state.plots[0].crop.isPlanted, true);
});

test("온실은 여섯 칸이 없거나 기존 시설과 충돌하면 설치를 막는다", () => {
  const tooSmall = withPlots(5);
  setLevel(tooSmall, 6);
  tooSmall.inventory.greenhouse = 1;
  assert.equal(
    validateFacilityPlacement(tooSmall, "greenhouse", 0, 0).reason,
    "needs-six-contiguous-plots"
  );

  const conflict = withPlots(6);
  setLevel(conflict, 6);
  conflict.inventory.greenhouse = 1;
  conflict.facilities.push({ facilityId: "facility-1", type: "rainBarrel", row: 0, column: 1, active: true });
  assert.equal(
    validateFacilityPlacement(conflict, "greenhouse", 0, 0).reason,
    "facility-conflict"
  );
});

test("온실은 밤에 에너지가 있을 때만 내부 작물을 초당 성장시킨다", () => {
  const running = withPlots(6, 10_000);
  const crop = plant(running, 0);
  running.facilities = [{ facilityId: "facility-1", type: "greenhouse", row: 0, column: 0, active: true }];
  running.resources.energy = 1;
  running.turn.phase = "night";
  running.turn.lastEffectAt = 10_000;
  running.turn.phaseEndsAt = 100_000;
  advanceGameTime(running, 11_000);
  assert.equal(crop.crop.cropXp, 1);
  assert.equal(running.resources.energy, 0.5);

  const stopped = withPlots(6, 10_000);
  const stoppedCrop = plant(stopped, 0);
  stopped.facilities = [{ facilityId: "facility-1", type: "greenhouse", row: 0, column: 0, active: true }];
  stopped.resources.energy = 0;
  stopped.turn.phase = "night";
  stopped.turn.lastEffectAt = 10_000;
  stopped.turn.phaseEndsAt = 100_000;
  advanceGameTime(stopped, 11_000);
  assert.equal(stoppedCrop.crop.cropXp, 0);
  assert.equal(getFacilityStatus(stopped, stopped.facilities[0]).reason, "에너지 부족");
});

test("빗물통은 밤 종료 시 준비 단계에서 하루 한 번 물을 충전한다", () => {
  const state = withPlots(1, 10_000);
  state.facilities = [{ facilityId: "facility-1", type: "rainBarrel", row: 0, column: 0, active: true }];
  state.resources.water = 0;
  state.turn.phase = "night";
  const first = transitionPhase(state, 20_000);
  assert.equal(first.to, "preparation");
  assert.equal(state.resources.water, 18);
  assert.equal(transitionPhase(state, 21_000).changed, false);
  assert.equal(state.resources.water, 18);
});

test("발전기는 연료를 소비해 시설 에너지를 실제 생산한다", () => {
  const state = withPlots(1, 10_000);
  state.facilities = [{ facilityId: "facility-1", type: "generator", row: 0, column: 0, active: true }];
  state.resources.fuel = 1;
  state.resources.energy = 0;
  state.turn.phase = "day";
  state.turn.lastEffectAt = 10_000;
  state.turn.phaseEndsAt = 100_000;
  advanceGameTime(state, 11_000);
  assert.equal(state.resources.fuel, 0.8);
  assert.equal(state.resources.energy, 1);
});

test("낮→밤→준비 단계는 저장된 종료 시각으로 전환된다", () => {
  const state = createInitialGameState(10_000);
  state.turn.phaseEndsAt = 11_000;
  state.turn.lastEffectAt = 10_000;
  const dayResult = advanceGameTime(state, 11_000, { offline: true });
  assert.equal(dayResult.transitions[0].to, "night");
  const nightEnd = state.turn.phaseEndsAt;
  const nightResult = advanceGameTime(state, nightEnd, { offline: true });
  assert.equal(nightResult.transitions[0].to, "preparation");
  assert.equal(state.turn.phaseEndsAt, null);
});

test("준비 단계는 시간이 지나도 자동으로 건너뛰지 않는다", () => {
  const state = createInitialGameState(10_000);
  setPreparation(state, 10_000);
  advanceGameTime(state, 999_999, { offline: true });
  assert.equal(state.turn.phase, "preparation");
  assert.equal(state.turn.day, 1);
  assert.equal(startNextDay(state, 1_000_000).ok, true);
  assert.equal(state.turn.phase, "day");
  assert.equal(state.turn.day, 2);
});

test("낮 위협을 방치하면 해당 작물 수확량이 줄어든다", () => {
  const state = createInitialGameState(10_000);
  const plot = plant(state, 0);
  const threat = {
    threatId: "threat-1",
    type: "bird",
    phase: "day",
    targetPlotId: plot.plotId,
    state: "eating",
    health: 5,
    maxHealth: 5,
    spawnedAt: 10_000,
    approachEndsAt: 10_000,
    actionEndsAt: 11_000,
    despawnAt: 0,
    resolved: false,
  };
  state.threats = [threat];
  const resolved = resolveExpiredThreats(state, 11_000);
  assert.equal(resolved.length, 1);
  assert.equal(plot.crop.yieldPenalty, 2);
});

test("밤 도둑을 방치하면 게임 내부 오이만 잃는다", () => {
  const state = createInitialGameState(10_000);
  state.cucumbers = 20;
  const result = applyThreatDamage(state, {
    type: "thief",
    phase: "night",
    targetPlotId: state.plots[0].plotId,
  });
  assert.equal(result.kind, "cucumbers");
  assert.equal(state.cucumbers, 12);
});

test("뿅망치는 체력을 1씩 줄이고 0에서 보상·제거를 한 번만 처리한다", () => {
  const state = createInitialGameState(10_000);
  const plot = plant(state, 0);
  state.threats = [{
    threatId: "threat-1",
    type: "bird",
    phase: "day",
    targetPlotId: plot.plotId,
    state: "approaching",
    health: 5,
    maxHealth: 5,
    spawnedAt: 10_000,
    approachEndsAt: 13_200,
    actionEndsAt: 20_000,
    spawnEdge: "left",
    spawnLane: 0.5,
    resolved: false,
    rewardGranted: false,
  }];
  const hits = Array.from({ length: 5 }, (_, index) =>
    hitThreat(state, "threat-1", 11_000 + index)
  );
  assert.deepEqual(hits.map((result) => result.health), [4, 3, 2, 1, 0]);
  assert.equal(hits.at(-1).defeated, true);
  assert.equal(state.playerXp, GAME_CONFIG.player.threatRepelXp);
  assert.equal(hitThreat(state, "threat-1", 11_100).reason, "already-defeated");
  assert.equal(state.playerXp, GAME_CONFIG.player.threatRepelXp);
  advanceThreatStates(state, 12_000);
  assert.equal(state.threats.length, 0);
  assert.equal(hitThreat(state, "threat-1", 12_001).reason, "no-threat");
});

test("배경 복귀 오프라인 진행은 새 위협을 폭주시지 않고 준비를 유지한다", () => {
  const state = createInitialGameState(10_000);
  state.lastSavedAt = 10_000;
  state.turn.phaseEndsAt = 11_000;
  const result = applyOfflineReward(state, 1_000_000);
  assert.equal(result.phase, "preparation");
  assert.equal(state.threats.length, 0);
  assert.equal(state.lastSavedAt, 1_000_000);
});

test("v2의 4슬롯 텃밭은 작물 손실 없이 독립 텃밭 네 개로 마이그레이션된다", () => {
  const storage = new MemoryStorage({
    [GAME_CONFIG.storageKey]: JSON.stringify({
      saveVersion: 2,
      cucumbers: 108,
      plots: [{
        plotId: "garden-1",
        slots: [
          { slotId: "a", isPlanted: true, xp: 0 },
          { slotId: "b", isPlanted: true, xp: 15 },
          { slotId: "c", isPlanted: false, xp: 0 },
          { slotId: "d", isPlanted: true, xp: 50 },
        ],
      }],
      harvestCount: 2,
      facilities: { greenhouse: 1 },
      lastSavedAt: 9_000,
    }),
  });
  const result = loadGameSave(storage, 10_000);
  assert.equal(result.status, "migrated");
  assert.equal(result.state.plots.length, 4);
  assert.deepEqual(result.state.plots.map((plot) => plot.crop.cropXp), [0, 15, 0, 50]);
  assert.deepEqual(result.state.plots.map((plot) => plot.crop.isPlanted), [true, true, false, true]);
  assert.equal(result.state.cucumbers, 108);
  assert.equal(result.state.legacyFacilities.greenhouse, 1);
});

test("기존 보유 텃밭은 새 레벨 한도를 넘어도 삭제·잠금되지 않는다", () => {
  const state = normalizeGameState({
    schemaVersion: 3,
    saveVersion: 3,
    playerXp: 0,
    plots: Array.from({ length: 8 }, (_, index) => createGardenPlot(index + 1)),
  }, 10_000);
  setPreparation(state);
  assert.equal(state.plots.length, 8);
  assert.equal(canPurchaseGarden(state).reason, "level-limit");
  assert.equal(state.plots.every((plot) => plot.crop), true);
});

test("마이그레이션과 기본 도구 보충은 반복 저장·로드해도 중복 지급되지 않는다", () => {
  const legacy = {
    saveVersion: 1,
    isPlanted: true,
    growthExperience: 15,
    cucumbers: 4,
  };
  const storage = new MemoryStorage({
    [GAME_CONFIG.storageKey]: JSON.stringify(legacy),
  });
  const first = loadGameSave(storage, 10_000);
  assert.equal(saveGame(first.state, storage, 10_000).ok, true);
  const second = loadGameSave(storage, 11_000);
  assert.equal(second.status, "loaded");
  assert.equal(second.state.plots.length, 1);
  assert.equal(second.state.inventory.wateringCan, 1);
  assert.equal(second.state.inventory.hammer, 1);
});

test("부분 손상 저장은 가능한 재화와 작물을 복구한다", () => {
  const raw = {
    cucumbers: 7,
    coins: 44,
    plots: [{ plotId: "broken id!", crop: { isPlanted: true, cropXp: 35 } }],
  };
  assert.equal(detectGameStateSchema(raw), "partial");
  const state = normalizeGameState(raw, 10_000);
  assert.equal(state.cucumbers, 7);
  assert.equal(state.coins, 44);
  assert.equal(state.plots[0].crop.cropXp, 35);
  assert.match(state.plots[0].plotId, /^garden-/);
});

test("저장 직후 새로고침은 좌표·작물·시설·턴·자원을 동일하게 복원한다", () => {
  const state = withPlots(6, 10_000);
  setLevel(state, 6);
  plant(state, 4, 22);
  state.facilities = [{ facilityId: "facility-1", type: "greenhouse", row: 0, column: 0, active: true, installedAt: 10_000 }];
  state.resources = { water: 9.5, fuel: 3, energy: 8 };
  state.turn.phase = "night";
  state.turn.phaseEndsAt = 70_000;
  state.turn.lastEffectAt = 10_000;
  const storage = new MemoryStorage();
  assert.equal(saveGame(state, storage, 11_000).ok, true);
  const restored = loadGameSave(storage, 11_000).state;
  assert.deepEqual(restored.plots.map(({ row, column }) => [row, column]), state.plots.map(({ row, column }) => [row, column]));
  assert.equal(restored.plots[4].crop.cropXp, 22);
  assert.equal(restored.facilities[0].type, "greenhouse");
  assert.equal(restored.turn.phase, "night");
  assert.deepEqual(restored.resources, state.resources);
});

test("준비 상점은 오이 판매와 물·연료·에너지 구매를 실제 반영한다", () => {
  const state = createInitialGameState(10_000);
  setPreparation(state);
  state.cucumbers = 10;
  assert.deepEqual(sellCucumbers(state), { ok: true, sold: 10, earned: 30 });
  const coinsAfterSale = state.coins;
  assert.equal(buyConsumable(state, "water").ok, true);
  assert.equal(state.resources.water, 50);
  assert.equal(state.coins, coinsAfterSale - 45);
});

test("시설 구매는 해금 레벨·가격·준비 단계를 모두 검사한다", () => {
  const state = createInitialGameState(10_000);
  setPreparation(state);
  state.coins = 10_000;
  assert.equal(buyFacility(state, "greenhouse").reason, "level-locked");
  setLevel(state, 6);
  const result = buyFacility(state, "greenhouse");
  assert.equal(result.ok, true);
  assert.equal(state.inventory.greenhouse, 1);
  assert.equal(state.coins, 9_100);
});

test("저장된 오이는 타이머 시작 전 현재 단계 이미지로 최초 렌더하도록 연결된다", async () => {
  const mainSource = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const uiSource = await readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8");
  assert.ok(mainSource.indexOf("ui.render(state") < mainSource.indexOf("globalThis.setInterval"));
  assert.match(uiSource, /cropImage\.src = requestedAsset/);
  assert.match(uiSource, /cropImage\.addEventListener\("error"/);
  assert.match(uiSource, /cucumber\.png/);
});

test("모바일 HUD에서 전역 자동·물주기 XP 수치를 제거한다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /자동 경험치|물주기 경험치|productionRate|touchYield/);
  assert.match(html, /보유 오이/);
  assert.match(html, /보유 코인/);
  assert.match(html, /playerLevelLabel/);
  assert.match(html, /dayLabel/);
});

test("3열 CSS와 문서가 아닌 월드 카메라 입력을 보장한다", async () => {
  const css = await readFile(new URL("../css/game.css", import.meta.url), "utf8");
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /html,\s*\nbody\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.garden-viewport[\s\S]*?overflow:\s*hidden[\s\S]*?touch-action:\s*none/);
  assert.match(css, /\.plot-list[\s\S]*?touch-action:\s*none/);
  assert.match(main, /WorldCameraController/);
});

test("설정·이미지는 로컬이고 외부 URL은 허용된 지원 주소만 사용한다", async () => {
  const paths = GAME_CONFIG.facilities.map((facility) =>
    new URL(`..\/${facility.asset.replace("./", "")}`, import.meta.url)
  );
  for (const path of paths) await access(path);
  const sources = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
  ]);
  const sourceText = sources.join("\n");
  assert.doesNotMatch(sourceText, /supabase/i);
  const urls = sourceText.match(/https?:\/\/[^"'\s)]+/gi) ?? [];
  assert.deepEqual(urls, ["https://mallinoi.com/"]);
});
