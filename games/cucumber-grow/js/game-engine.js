import { GAME_CONFIG } from "./game-config.js";
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
    Math.max(0, (stageExperience / stageRequirement) * 100)
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

export function synchronizeDerivedState(state) {
  const previousStageId = state.growthStageId;
  const stage = getGrowthStage(state.growthExperience);

  state.perSecond = calculateProductionRate(state);
  state.growthStageId = stage.id;

  return {
    stage,
    stageChanged: previousStageId !== stage.id,
    previousStageId,
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

export function addGrowthExperience(state, amount) {
  const safeAmount = toSafeNonNegativeNumber(amount);
  const previousExperience = Math.min(
    toSafeNonNegativeNumber(state.growthExperience),
    GAME_CONFIG.harvestExperience
  );
  const availableExperience = Math.max(
    0,
    GAME_CONFIG.harvestExperience - previousExperience
  );
  const gained = Math.min(safeAmount, availableExperience);
  const wasHarvestReady =
    previousExperience >= GAME_CONFIG.harvestExperience;

  state.growthExperience = Math.min(
    GAME_CONFIG.harvestExperience,
    addSafeNumbers(previousExperience, gained)
  );
  const derived = synchronizeDerivedState(state);

  return {
    gained,
    discarded: Math.max(0, safeAmount - gained),
    becameHarvestReady:
      !wasHarvestReady &&
      state.growthExperience >= GAME_CONFIG.harvestExperience,
    isHarvestReady:
      state.growthExperience >= GAME_CONFIG.harvestExperience,
    ...derived,
  };
}

export function collectTouch(state) {
  return addGrowthExperience(
    state,
    Math.max(
      GAME_CONFIG.touchExperience,
      toSafeNonNegativeNumber(
        state.touchYield,
        GAME_CONFIG.touchExperience
      )
    )
  );
}

export function applyProduction(state, elapsedMilliseconds) {
  const maximumElapsed = GAME_CONFIG.maxOfflineSeconds * 1_000;
  const safeElapsed = Math.min(
    toSafeNonNegativeNumber(elapsedMilliseconds),
    maximumElapsed
  );
  const rate = calculateProductionRate(state);
  const experience = (safeElapsed / 1_000) * rate;

  state.perSecond = rate;
  return addGrowthExperience(state, experience);
}

export function harvestCucumber(state) {
  const progress = getGrowthProgress(state.growthExperience);

  if (!progress.isHarvestReady) {
    return {
      harvested: false,
      reason: "not-ready",
      reward: 0,
      ...synchronizeDerivedState(state),
    };
  }

  state.growthExperience = 0;
  state.harvestCount = Math.min(
    Math.floor(toSafeNonNegativeNumber(state.harvestCount)) + 1,
    GAME_CONFIG.maxGameNumber
  );
  const rewardResult = grantCucumbers(state, GAME_CONFIG.harvestReward);

  return {
    harvested: true,
    reason: "harvested",
    reward: rewardResult.gained,
    harvestCount: state.harvestCount,
    stage: rewardResult.stage,
    stageChanged: rewardResult.stageChanged,
    previousStageId: rewardResult.previousStageId,
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
