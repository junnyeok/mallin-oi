import { GAME_CONFIG } from "./game-config.js";
import { createGardenPlot } from "./game-state.js";
import {
  addSafeNumbers,
  toSafeCount,
  toSafeNonNegativeNumber,
} from "./number-format.js";

export function getFacilityById(facilityId) {
  return (
    GAME_CONFIG.facilities.find((facility) => facility.id === facilityId) ??
    null
  );
}

export function getNextPrice(facility, ownedCount) {
  if (!facility) return GAME_CONFIG.maxGameNumber;

  const safeOwnedCount = toSafeCount(ownedCount);
  const calculated =
    facility.basePrice * Math.pow(GAME_CONFIG.priceGrowthRate, safeOwnedCount);

  if (!Number.isFinite(calculated)) {
    return GAME_CONFIG.maxGameNumber;
  }

  return Math.min(Math.floor(calculated), GAME_CONFIG.maxGameNumber);
}

export function calculateProductionRate(state) {
  return GAME_CONFIG.facilities.reduce((total, facility) => {
    const owned = toSafeCount(state.facilities?.[facility.id]);
    const production = owned * facility.productionPerSecond;

    return addSafeNumbers(total, production);
  }, 0);
}

export function getGrowthStage(growthExperience) {
  const safeExperience = Math.min(
    toSafeNonNegativeNumber(growthExperience),
    GAME_CONFIG.harvestExperience
  );

  return (
    [...GAME_CONFIG.growthStages]
      .reverse()
      .find((stage) => safeExperience >= stage.minimumExperience) ??
    GAME_CONFIG.growthStages[0]
  );
}

export function getGrowthProgress(growthExperience) {
  const experience = Math.min(
    toSafeNonNegativeNumber(growthExperience),
    GAME_CONFIG.harvestExperience
  );
  const stage = getGrowthStage(experience);
  const stageIndex = GAME_CONFIG.growthStages.findIndex(
    (candidate) => candidate.id === stage.id
  );
  const nextStage = GAME_CONFIG.growthStages[stageIndex + 1] ?? null;
  const targetExperience = nextStage
    ? nextStage.minimumExperience
    : GAME_CONFIG.harvestExperience;
  const stageExperience = Math.max(0, experience - stage.minimumExperience);
  const stageRequirement = Math.max(
    1,
    targetExperience - stage.minimumExperience
  );
  const progressPercent = Math.min(
    100,
    Math.max(0, (experience / GAME_CONFIG.harvestExperience) * 100)
  );

  return {
    experience,
    stage,
    nextStage,
    targetExperience,
    stageExperience,
    stageRequirement,
    progressPercent,
    isHarvestReady: experience >= GAME_CONFIG.harvestExperience,
  };
}

export function getAllSlots(state) {
  if (!Array.isArray(state?.plots)) return [];

  return state.plots.flatMap((plot) =>
    plot.slots.map((slot) => ({
      plot,
      slot,
      plotId: plot.plotId,
      slotId: slot.slotId,
    }))
  );
}

export function findCropSlot(state, plotId, slotId) {
  const plot = state?.plots?.find(
    (candidate) => candidate.plotId === plotId
  );
  const slot = plot?.slots?.find(
    (candidate) => candidate.slotId === slotId
  );

  return plot && slot ? { plot, slot } : null;
}

export function isCropPlanted(state, plotId, slotId) {
  return findCropSlot(state, plotId, slotId)?.slot.isPlanted === true;
}

function synchronizeSlot(slot) {
  const previousStageId = slot.growthStageId;
  const stage = getGrowthStage(slot.xp);

  slot.growthStageId = stage.id;
  return {
    slotId: slot.slotId,
    stage,
    stageChanged: previousStageId !== stage.id,
    previousStageId,
  };
}

export function synchronizeDerivedState(state) {
  const slotChanges = getAllSlots(state).map(({ plotId, slot }) => ({
    plotId,
    ...synchronizeSlot(slot),
  }));

  state.perSecond = calculateProductionRate(state);
  return {
    perSecond: state.perSecond,
    slotChanges,
  };
}

export function grantCucumbers(state, amount) {
  const safeAmount = toSafeNonNegativeNumber(amount);

  if (safeAmount <= 0) {
    return {
      gained: 0,
      ...synchronizeDerivedState(state),
    };
  }

  state.cucumbers = addSafeNumbers(state.cucumbers, safeAmount);
  state.totalEarned = addSafeNumbers(state.totalEarned, safeAmount);

  return {
    gained: safeAmount,
    ...synchronizeDerivedState(state),
  };
}

export function addGrowthExperience(
  state,
  plotId,
  slotId,
  amount
) {
  const safeAmount = toSafeNonNegativeNumber(amount);
  const target = findCropSlot(state, plotId, slotId);

  if (!target) {
    return {
      gained: 0,
      discarded: safeAmount,
      becameHarvestReady: false,
      isHarvestReady: false,
      reason: "unknown-slot",
      stage: GAME_CONFIG.growthStages[0],
      stageChanged: false,
      previousStageId: null,
      plotId,
      slotId,
    };
  }

  const { slot } = target;

  if (!slot.isPlanted) {
    slot.xp = 0;
    const derived = synchronizeSlot(slot);

    return {
      gained: 0,
      discarded: safeAmount,
      becameHarvestReady: false,
      isHarvestReady: false,
      reason: "empty-slot",
      plotId,
      ...derived,
    };
  }

  const previousExperience = Math.min(
    toSafeNonNegativeNumber(slot.xp),
    GAME_CONFIG.harvestExperience
  );
  const availableExperience = Math.max(
    0,
    GAME_CONFIG.harvestExperience - previousExperience
  );
  const gained = Math.min(safeAmount, availableExperience);
  const wasHarvestReady =
    previousExperience >= GAME_CONFIG.harvestExperience;

  slot.xp = Math.min(
    GAME_CONFIG.harvestExperience,
    addSafeNumbers(previousExperience, gained)
  );
  const derived = synchronizeSlot(slot);

  return {
    gained,
    discarded: Math.max(0, safeAmount - gained),
    becameHarvestReady:
      !wasHarvestReady && slot.xp >= GAME_CONFIG.harvestExperience,
    isHarvestReady: slot.xp >= GAME_CONFIG.harvestExperience,
    reason: gained > 0 ? "gained" : "full",
    plotId,
    ...derived,
  };
}

export function collectTouch(state, plotId, slotId) {
  return addGrowthExperience(
    state,
    plotId,
    slotId,
    Math.max(
      GAME_CONFIG.touchExperience,
      toSafeNonNegativeNumber(
        state.touchYield,
        GAME_CONFIG.touchExperience
      )
    )
  );
}

function addAllocation(allocations, plotId, slotId, amount) {
  const key = `${plotId}\u0000${slotId}`;
  const current = allocations.get(key);

  if (current) {
    current.amount = addSafeNumbers(current.amount, amount);
    return;
  }

  allocations.set(key, { plotId, slotId, amount });
}

export function distributeAutomaticExperience(state, amount) {
  const generated = toSafeNonNegativeNumber(amount);
  const existingRemainder =
    toSafeNonNegativeNumber(state.automaticXpRemainder) % 1;
  const totalAvailable = addSafeNumbers(generated, existingRemainder);
  const wholeAvailable = Math.floor(totalAvailable);
  const allSlots = getAllSlots(state);
  const allocations = new Map();
  const hasEligibleSlot = allSlots.some(
    ({ slot }) =>
      slot.isPlanted &&
      toSafeNonNegativeNumber(slot.xp) < GAME_CONFIG.harvestExperience
  );

  if (!hasEligibleSlot) {
    state.automaticXpRemainder = 0;
    const derived = synchronizeDerivedState(state);
    return {
      generated,
      gained: 0,
      discarded: totalAvailable,
      allocations: [],
      ...derived,
    };
  }

  state.automaticXpRemainder = totalAvailable - wholeAvailable;

  if (wholeAvailable <= 0) {
    const derived = synchronizeDerivedState(state);
    return {
      generated,
      gained: 0,
      discarded: 0,
      allocations: [],
      ...derived,
    };
  }

  let remaining = wholeAvailable;
  let cursor = allSlots.length
    ? toSafeCount(state.autoXpCursor) % allSlots.length
    : 0;
  let consecutiveIneligible = 0;

  while (remaining > 0 && consecutiveIneligible < allSlots.length) {
    const target = allSlots[cursor];
    cursor = (cursor + 1) % allSlots.length;
    const capacity =
      target?.slot.isPlanted === true
        ? Math.max(
            0,
            GAME_CONFIG.harvestExperience -
              toSafeNonNegativeNumber(target.slot.xp)
          )
        : 0;

    if (capacity <= 0) {
      consecutiveIneligible += 1;
      continue;
    }

    const granted = Math.min(1, remaining, capacity);
    target.slot.xp = addSafeNumbers(target.slot.xp, granted);
    addAllocation(
      allocations,
      target.plotId,
      target.slotId,
      granted
    );
    remaining -= granted;
    consecutiveIneligible = 0;
  }

  state.autoXpCursor = cursor;
  const gained = [...allocations.values()].reduce(
    (total, allocation) => addSafeNumbers(total, allocation.amount),
    0
  );
  const derived = synchronizeDerivedState(state);

  return {
    generated,
    gained,
    discarded: Math.max(0, wholeAvailable - gained),
    allocations: [...allocations.values()],
    ...derived,
  };
}

export function applyProduction(state, elapsedMilliseconds) {
  const maximumElapsed = GAME_CONFIG.maxOfflineSeconds * 1_000;
  const safeElapsed = Math.min(
    toSafeNonNegativeNumber(elapsedMilliseconds),
    maximumElapsed
  );
  const rate = calculateProductionRate(state);
  const generated = (safeElapsed / 1_000) * rate;

  state.perSecond = rate;
  return distributeAutomaticExperience(state, generated);
}

export function plantCucumber(state, plotId, slotId) {
  const target = findCropSlot(state, plotId, slotId);

  if (!target) {
    return {
      planted: false,
      reason: "unknown-slot",
      plotId,
      slotId,
      stage: GAME_CONFIG.growthStages[0],
    };
  }

  if (target.slot.isPlanted) {
    return {
      planted: false,
      reason: "already-planted",
      plotId,
      ...synchronizeSlot(target.slot),
    };
  }

  target.slot.isPlanted = true;
  target.slot.xp = 0;

  return {
    planted: true,
    reason: "planted",
    plotId,
    ...synchronizeSlot(target.slot),
  };
}

export function harvestCucumber(state, plotId, slotId) {
  const target = findCropSlot(state, plotId, slotId);
  const progress = getGrowthProgress(target?.slot.xp);

  if (!target || !target.slot.isPlanted || !progress.isHarvestReady) {
    return {
      harvested: false,
      reason: target ? "not-ready" : "unknown-slot",
      reward: 0,
      plotId,
      slotId,
      stage: progress.stage,
    };
  }

  target.slot.xp = 0;
  target.slot.isPlanted = false;
  state.harvestCount = Math.min(
    Math.floor(toSafeNonNegativeNumber(state.harvestCount)) + 1,
    GAME_CONFIG.maxGameNumber
  );
  const rewardResult = grantCucumbers(state, GAME_CONFIG.harvestReward);
  const slotDerived = synchronizeSlot(target.slot);

  return {
    harvested: true,
    reason: "harvested",
    reward: rewardResult.gained,
    harvestCount: state.harvestCount,
    plotId,
    ...slotDerived,
  };
}

export function purchaseFirstGarden(state) {
  if (state.hasClaimedFreeGarden || state.plots.length > 0) {
    state.hasClaimedFreeGarden = true;
    return {
      purchased: false,
      reason: "already-claimed",
      plot: null,
    };
  }

  let sequence = Math.max(1, toSafeCount(state.nextPlotSequence) || 1);
  const usedIds = new Set(state.plots.map((plot) => plot.plotId));

  while (usedIds.has(`garden-${sequence}`)) {
    sequence += 1;
  }

  const plot = createGardenPlot(sequence);
  state.plots.push(plot);
  state.hasClaimedFreeGarden = true;
  state.nextPlotSequence = sequence + 1;

  return {
    purchased: true,
    reason: "purchased",
    plot,
  };
}

export function purchaseFacility(state, facilityId) {
  const facility = getFacilityById(facilityId);

  if (!facility) {
    return { purchased: false, reason: "unknown-facility", price: 0 };
  }

  const owned = toSafeCount(state.facilities?.[facility.id]);
  const price = getNextPrice(facility, owned);
  const balance = toSafeNonNegativeNumber(state.cucumbers);

  if (balance < price) {
    return { purchased: false, reason: "insufficient", price };
  }

  state.cucumbers = Math.max(0, balance - price);
  state.facilities[facility.id] = Math.min(
    owned + 1,
    GAME_CONFIG.maxFacilityCount
  );
  const derived = synchronizeDerivedState(state);

  return {
    purchased: true,
    reason: "purchased",
    price,
    facility,
    owned: state.facilities[facility.id],
    ...derived,
  };
}

export class GameEngine {
  constructor({
    state,
    onUpdate = () => {},
    clock = () => Date.now(),
    tickIntervalMs = GAME_CONFIG.tickIntervalMs,
  }) {
    this.state = state;
    this.onUpdate = onUpdate;
    this.clock = clock;
    this.tickIntervalMs = tickIntervalMs;
    this.lastTickAt = this.clock();
    this.timerId = null;
  }

  get isRunning() {
    return this.timerId !== null;
  }

  synchronize(now = this.clock()) {
    const safeNow = toSafeNonNegativeNumber(now, this.lastTickAt);
    const elapsed = Math.max(0, safeNow - this.lastTickAt);
    this.lastTickAt = safeNow;

    if (elapsed <= 0) return null;

    const result = applyProduction(this.state, elapsed);
    this.onUpdate({
      reason: "production",
      elapsedMilliseconds: elapsed,
      ...result,
    });
    return result;
  }

  start() {
    if (this.isRunning) return;

    this.lastTickAt = this.clock();
    this.timerId = window.setInterval(
      () => this.synchronize(),
      this.tickIntervalMs
    );
  }

  pause() {
    if (!this.isRunning) return;

    this.synchronize();
    window.clearInterval(this.timerId);
    this.timerId = null;
  }

  resume() {
    this.start();
  }
}
