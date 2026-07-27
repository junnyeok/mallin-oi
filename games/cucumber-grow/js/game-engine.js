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

export function getGrowthStage(totalEarned) {
  const safeTotal = toSafeNonNegativeNumber(totalEarned);

  return (
    [...GAME_CONFIG.growthStages]
      .reverse()
      .find((stage) => safeTotal >= stage.minimumTotalEarned) ??
    GAME_CONFIG.growthStages[0]
  );
}

export function synchronizeDerivedState(state) {
  const previousStageId = state.growthStageId;
  const stage = getGrowthStage(state.totalEarned);

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

export function collectTouch(state) {
  return grantCucumbers(
    state,
    Math.max(1, toSafeNonNegativeNumber(state.touchYield, 1))
  );
}

export function applyProduction(state, elapsedMilliseconds) {
  const maximumElapsed = GAME_CONFIG.maxOfflineSeconds * 1_000;
  const safeElapsed = Math.min(
    toSafeNonNegativeNumber(elapsedMilliseconds),
    maximumElapsed
  );
  const rate = calculateProductionRate(state);
  const production = (safeElapsed / 1_000) * rate;

  state.perSecond = rate;
  return grantCucumbers(state, production);
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
