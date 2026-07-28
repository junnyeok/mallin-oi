import { GAME_CONFIG } from "./game-config.js";
import { toSafeCount, toSafeNonNegativeNumber } from "./number-format.js";

function sanitizeTimestamp(value, fallback, now) {
  const timestamp = toSafeNonNegativeNumber(value, fallback);

  if (timestamp <= 0 || timestamp > now) {
    return fallback;
  }

  return Math.floor(timestamp);
}

function createEmptyFacilities() {
  return Object.fromEntries(
    GAME_CONFIG.facilities.map((facility) => [facility.id, 0])
  );
}

export function createInitialGameState(now = Date.now()) {
  const safeNow = Math.floor(toSafeNonNegativeNumber(now, Date.now()));

  return {
    saveVersion: GAME_CONFIG.saveVersion,
    cucumbers: 0,
    totalEarned: 0,
    touchYield: GAME_CONFIG.touchExperience,
    growthExperience: 0,
    harvestCount: 0,
    facilities: createEmptyFacilities(),
    perSecond: 0,
    growthStageId: GAME_CONFIG.growthStages[0].id,
    lastSavedAt: safeNow,
    startedAt: safeNow,
    settings: {},
  };
}

export function normalizeGameState(rawState, now = Date.now()) {
  const safeNow = Math.floor(toSafeNonNegativeNumber(now, Date.now()));

  if (
    !rawState ||
    typeof rawState !== "object" ||
    rawState.saveVersion !== GAME_CONFIG.saveVersion
  ) {
    return createInitialGameState(safeNow);
  }

  const initial = createInitialGameState(safeNow);
  const startedAt = sanitizeTimestamp(rawState.startedAt, safeNow, safeNow);
  const facilities = Object.fromEntries(
    GAME_CONFIG.facilities.map((facility) => [
      facility.id,
      toSafeCount(rawState.facilities?.[facility.id]),
    ])
  );

  return {
    saveVersion: GAME_CONFIG.saveVersion,
    cucumbers: toSafeNonNegativeNumber(rawState.cucumbers),
    totalEarned: toSafeNonNegativeNumber(rawState.totalEarned),
    touchYield: Math.max(
      GAME_CONFIG.touchExperience,
      toSafeNonNegativeNumber(
        rawState.touchYield,
        GAME_CONFIG.touchExperience
      )
    ),
    growthExperience: Math.min(
      toSafeNonNegativeNumber(rawState.growthExperience),
      GAME_CONFIG.harvestExperience
    ),
    harvestCount: Math.floor(
      toSafeNonNegativeNumber(rawState.harvestCount)
    ),
    facilities,
    perSecond: toSafeNonNegativeNumber(rawState.perSecond),
    growthStageId:
      typeof rawState.growthStageId === "string"
        ? rawState.growthStageId
        : initial.growthStageId,
    lastSavedAt: sanitizeTimestamp(rawState.lastSavedAt, safeNow, safeNow),
    startedAt,
    settings:
      rawState.settings && typeof rawState.settings === "object"
        ? { ...rawState.settings }
        : {},
  };
}
