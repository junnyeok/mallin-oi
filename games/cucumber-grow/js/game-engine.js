import { GAME_CONFIG } from "./game-config.js";
import { createGardenPlot } from "./game-state.js";
import {
  addSafeNumbers,
  toSafeCount,
  toSafeNonNegativeNumber,
} from "./number-format.js";

export function getGrowthStage(cropXp) {
  const experience = Math.min(
    toSafeNonNegativeNumber(cropXp),
    GAME_CONFIG.crops.harvestExperience
  );

  return (
    [...GAME_CONFIG.crops.growthStages]
      .reverse()
      .find((stage) => experience >= stage.minimumExperience) ??
    GAME_CONFIG.crops.growthStages[0]
  );
}

export function getGrowthProgress(cropXp) {
  const experience = Math.min(
    toSafeNonNegativeNumber(cropXp),
    GAME_CONFIG.crops.harvestExperience
  );
  const stage = getGrowthStage(experience);
  const stageIndex = GAME_CONFIG.crops.growthStages.findIndex(
    (candidate) => candidate.id === stage.id
  );
  const nextStage = GAME_CONFIG.crops.growthStages[stageIndex + 1] ?? null;
  const targetExperience = nextStage
    ? nextStage.minimumExperience
    : GAME_CONFIG.crops.harvestExperience;
  const stageExperience = Math.max(0, experience - stage.minimumExperience);
  const stageRequirement = Math.max(1, targetExperience - stage.minimumExperience);

  return {
    experience,
    stage,
    nextStage,
    targetExperience,
    stageExperience,
    stageRequirement,
    progressPercent: Math.min(100, (stageExperience / stageRequirement) * 100),
    isHarvestReady: experience >= GAME_CONFIG.crops.harvestExperience,
  };
}

export function getPlayerLevel(playerXp) {
  const safeXp = toSafeNonNegativeNumber(playerXp);
  let level = 1;

  GAME_CONFIG.player.levelThresholds.forEach((threshold, index) => {
    if (safeXp >= threshold) level = index + 1;
  });
  return Math.min(level, GAME_CONFIG.player.maximumLevel);
}

export function getPlayerProgress(playerXp) {
  const experience = toSafeNonNegativeNumber(playerXp);
  const level = getPlayerLevel(experience);
  const currentThreshold = GAME_CONFIG.player.levelThresholds[level - 1];
  const nextThreshold = GAME_CONFIG.player.levelThresholds[level] ?? null;
  const requirement = nextThreshold === null
    ? 0
    : Math.max(1, nextThreshold - currentThreshold);
  const earned = Math.max(0, experience - currentThreshold);

  return {
    level,
    experience,
    currentThreshold,
    nextThreshold,
    earned,
    requirement,
    progressPercent:
      nextThreshold === null ? 100 : Math.min(100, (earned / requirement) * 100),
    isMaximumLevel: nextThreshold === null,
  };
}

export function grantPlayerXp(state, amount) {
  const gained = toSafeNonNegativeNumber(amount);
  const previousLevel = getPlayerLevel(state.playerXp);
  state.playerXp = addSafeNumbers(state.playerXp, gained);
  state.playerLevel = getPlayerLevel(state.playerXp);
  return {
    gained,
    previousLevel,
    level: state.playerLevel,
    leveledUp: state.playerLevel > previousLevel,
  };
}

export function findPlot(state, plotId) {
  return state?.plots?.find((plot) => plot.plotId === plotId) ?? null;
}

export function getAllSlots(state) {
  return (state?.plots ?? []).map((plot) => ({
    plot,
    crop: plot.crop,
    slot: plot.crop,
    plotId: plot.plotId,
    slotId: `${plot.plotId}-crop`,
  }));
}

export function findCropSlot(state, plotId) {
  const plot = findPlot(state, plotId);
  return plot
    ? { plot, crop: plot.crop, slot: plot.crop, slotId: `${plotId}-crop` }
    : null;
}

export function isCropPlanted(state, plotId) {
  return findPlot(state, plotId)?.crop?.isPlanted === true;
}

export function synchronizeDerivedState(state) {
  const plotChanges = (state.plots ?? []).map((plot) => {
    const previousStageId = plot.crop.growthStageId;
    const stage = getGrowthStage(plot.crop.cropXp);
    plot.crop.growthStageId = stage.id;
    return {
      plotId: plot.plotId,
      stage,
      previousStageId,
      stageChanged: previousStageId !== stage.id,
    };
  });

  state.playerLevel = getPlayerLevel(state.playerXp);
  state.perSecond = calculateProductionRate(state);
  return { playerLevel: state.playerLevel, perSecond: state.perSecond, plotChanges };
}

export function plantCrop(state, plotId) {
  const plot = findPlot(state, plotId);
  if (!plot) return { ok: false, reason: "unknown-plot" };
  if (plot.crop.isPlanted) return { ok: false, reason: "already-planted" };
  if (state.facilities?.some((facility) => facility.row === plot.row && facility.column === plot.column && facility.type !== "greenhouse")) {
    return { ok: false, reason: "facility-occupied" };
  }

  plot.crop.isPlanted = true;
  plot.crop.cropXp = 0;
  plot.crop.growthStageId = GAME_CONFIG.crops.growthStages[0].id;
  plot.crop.yieldPenalty = 0;
  return { ok: true, plotId, crop: plot.crop };
}

export function addCropExperience(state, plotId, amount, { grantEvolutionXp = true } = {}) {
  const plot = findPlot(state, plotId);
  const requested = toSafeNonNegativeNumber(amount);
  if (!plot) return { gained: 0, discarded: requested, reason: "unknown-plot" };
  if (!plot.crop.isPlanted) {
    return { gained: 0, discarded: requested, reason: "empty-plot", plotId };
  }

  const previousXp = Math.min(
    toSafeNonNegativeNumber(plot.crop.cropXp),
    GAME_CONFIG.crops.harvestExperience
  );
  const previousStage = getGrowthStage(previousXp);
  const available = GAME_CONFIG.crops.harvestExperience - previousXp;
  const gained = Math.min(requested, Math.max(0, available));
  plot.crop.cropXp = Math.min(
    GAME_CONFIG.crops.harvestExperience,
    addSafeNumbers(previousXp, gained)
  );
  const stage = getGrowthStage(plot.crop.cropXp);
  plot.crop.growthStageId = stage.id;
  const crossedStages = Math.max(0, stage.level - previousStage.level);
  const playerResult =
    grantEvolutionXp && crossedStages > 0
      ? grantPlayerXp(
          state,
          crossedStages * GAME_CONFIG.player.cropEvolutionXp
        )
      : null;

  return {
    gained,
    discarded: Math.max(0, requested - gained),
    reason: gained > 0 ? "gained" : "full",
    plotId,
    stage,
    previousStageId: previousStage.id,
    stageChanged: previousStage.id !== stage.id,
    crossedStages,
    playerResult,
    becameHarvestReady:
      previousXp < GAME_CONFIG.crops.harvestExperience &&
      plot.crop.cropXp >= GAME_CONFIG.crops.harvestExperience,
    isHarvestReady:
      plot.crop.cropXp >= GAME_CONFIG.crops.harvestExperience,
  };
}

export function addGrowthExperience(state, plotId, slotIdOrAmount, maybeAmount) {
  const amount = maybeAmount === undefined ? slotIdOrAmount : maybeAmount;
  return addCropExperience(state, plotId, amount);
}

export function useWateringCan(state, plotId, now = Date.now()) {
  const tool = GAME_CONFIG.tools.wateringCan;
  if (toSafeNonNegativeNumber(state.resources?.water) < tool.waterCost) {
    return { ok: false, reason: "not-enough-water" };
  }
  const plot = findPlot(state, plotId);
  if (!plot?.crop?.isPlanted) return { ok: false, reason: "empty-plot" };
  if (getGrowthProgress(plot.crop.cropXp).isHarvestReady) {
    return { ok: false, reason: "harvest-ready" };
  }

  state.resources.water = Math.max(0, state.resources.water - tool.waterCost);
  return { ok: true, usedAt: now, ...addCropExperience(state, plotId, tool.cropXp) };
}

export function collectTouch(state, plotId, _slotId, now = Date.now()) {
  return useWateringCan(state, plotId, now);
}

export function getPlotHarvestYield(plotOrOrder) {
  const order = Math.max(
    1,
    toSafeCount(
      typeof plotOrOrder === "object" ? plotOrOrder?.order : plotOrOrder
    ) || 1
  );
  return (
    GAME_CONFIG.economy.baseHarvestYield +
    (order - 1) * GAME_CONFIG.economy.harvestYieldIncrease
  );
}

export function harvestCrop(state, plotId) {
  const plot = findPlot(state, plotId);
  if (!plot?.crop?.isPlanted) return { ok: false, reason: "empty-plot" };
  if (!getGrowthProgress(plot.crop.cropXp).isHarvestReady) {
    return { ok: false, reason: "not-ready" };
  }

  const baseYield = getPlotHarvestYield(plot);
  const penalty = Math.min(baseYield - 1, toSafeCount(plot.crop.yieldPenalty));
  const harvested = Math.max(1, baseYield - penalty);
  state.cucumbers = addSafeNumbers(state.cucumbers, harvested);
  state.totalEarned = addSafeNumbers(state.totalEarned, harvested);
  state.harvestCount = toSafeCount(state.harvestCount) + 1;
  const playerResult = grantPlayerXp(state, GAME_CONFIG.player.harvestXp);
  plot.crop = {
    isPlanted: false,
    cropXp: 0,
    growthStageId: GAME_CONFIG.crops.growthStages[0].id,
    yieldPenalty: 0,
  };

  return { ok: true, harvested, baseYield, penalty, playerResult, plotId };
}

export function harvestCropSlot(state, plotId) {
  return harvestCrop(state, plotId);
}

export function getMaximumPlotsForLevel(level) {
  return Math.min(
    GAME_CONFIG.board.maximumPurchasablePlots,
    Math.max(1, toSafeCount(level) || 1)
  );
}

export function getPlotPrice(plotNumber) {
  const index = Math.max(0, toSafeCount(plotNumber) - 1);
  return (
    GAME_CONFIG.economy.plotPrices[index] ?? GAME_CONFIG.maxGameNumber
  );
}

export function canPurchaseGarden(state) {
  const nextNumber = (state.plots?.length ?? 0) + 1;
  const maximum = getMaximumPlotsForLevel(getPlayerLevel(state.playerXp));
  const price = getPlotPrice(nextNumber);

  if (state.turn?.phase !== "preparation") {
    return { ok: false, reason: "preparation-only", nextNumber, maximum, price };
  }
  if (nextNumber > GAME_CONFIG.board.maximumPurchasablePlots) {
    return { ok: false, reason: "maximum-plots", nextNumber, maximum, price };
  }
  if (nextNumber > maximum) {
    return { ok: false, reason: "level-limit", nextNumber, maximum, price };
  }
  if (state.coins < price) {
    return { ok: false, reason: "not-enough-coins", nextNumber, maximum, price };
  }
  return { ok: true, nextNumber, maximum, price };
}

export function purchaseGarden(state) {
  const eligibility = canPurchaseGarden(state);
  if (!eligibility.ok) return eligibility;

  state.coins = Math.max(0, state.coins - eligibility.price);
  const plot = createGardenPlot(eligibility.nextNumber);
  state.plots.push(plot);
  state.nextPlotSequence = state.plots.length + 1;
  return { ...eligibility, plot };
}

export function sellCucumbers(state, amount = state.cucumbers) {
  if (state.turn?.phase !== "preparation") {
    return { ok: false, reason: "preparation-only" };
  }
  const sold = Math.min(toSafeCount(state.cucumbers), toSafeCount(amount));
  if (sold <= 0) return { ok: false, reason: "nothing-to-sell" };
  const earned = sold * GAME_CONFIG.economy.cucumberSalePrice;
  state.cucumbers -= sold;
  state.coins = addSafeNumbers(state.coins, earned);
  return { ok: true, sold, earned };
}

export function buyConsumable(state, consumableId) {
  if (state.turn?.phase !== "preparation") {
    return { ok: false, reason: "preparation-only" };
  }
  const item = GAME_CONFIG.economy.consumables[consumableId];
  if (!item) return { ok: false, reason: "unknown-item" };
  if (state.coins < item.price) return { ok: false, reason: "not-enough-coins" };

  state.coins -= item.price;
  if (consumableId === "energy") {
    state.resources.energy = Math.min(
      GAME_CONFIG.resources.maximumEnergy,
      state.resources.energy + item.amount
    );
  } else {
    state.resources[consumableId] = addSafeNumbers(
      state.resources[consumableId],
      item.amount
    );
  }
  return { ok: true, item };
}

export function calculateProductionRate(state) {
  if (state?.turn?.phase !== "day") return 0;
  return (state?.plots ?? []).filter(
    (plot) => plot.crop.isPlanted && !getGrowthProgress(plot.crop.cropXp).isHarvestReady
  ).length * GAME_CONFIG.crops.dayPassiveXpPerSecond;
}

export function distributeAutomaticExperience(state, amount) {
  let remaining = toSafeNonNegativeNumber(amount);
  const allocations = [];
  let gained = 0;

  for (const plot of state.plots ?? []) {
    if (remaining <= 0) break;
    if (!plot.crop.isPlanted || getGrowthProgress(plot.crop.cropXp).isHarvestReady) continue;
    const result = addCropExperience(state, plot.plotId, remaining);
    if (result.gained > 0) {
      allocations.push({ plotId: plot.plotId, slotId: `${plot.plotId}-crop`, amount: result.gained });
      gained += result.gained;
      remaining -= result.gained;
    }
  }
  return { gained, discarded: remaining, allocations, plotChanges: [] };
}

export function grantCucumbers(state, amount) {
  const gained = toSafeNonNegativeNumber(amount);
  state.cucumbers = addSafeNumbers(state.cucumbers, gained);
  state.totalEarned = addSafeNumbers(state.totalEarned, gained);
  return { gained, ...synchronizeDerivedState(state) };
}

export function getFacilityById(facilityId) {
  return GAME_CONFIG.facilities.find((facility) => facility.id === facilityId) ?? null;
}

export function getNextPrice(facility) {
  return facility?.price ?? GAME_CONFIG.maxGameNumber;
}

export class GameEngine {
  constructor(state, callbacks = {}) {
    this.state = state;
    this.callbacks = callbacks;
    this.timer = null;
  }

  tick(deltaSeconds = GAME_CONFIG.tickIntervalMs / 1_000) {
    const amount = calculateProductionRate(this.state) * deltaSeconds;
    const result = distributeAutomaticExperience(this.state, amount);
    this.callbacks.onTick?.(result);
    return result;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), GAME_CONFIG.tickIntervalMs);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
  }
}
