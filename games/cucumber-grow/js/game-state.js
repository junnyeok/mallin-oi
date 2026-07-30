import { GAME_CONFIG } from "./game-config.js";
import { toSafeCount, toSafeNonNegativeNumber } from "./number-format.js";

const LEGACY_CROP_FIELDS = Object.freeze([
  "growthExperience",
  "growthStageId",
  "isPlanted",
]);

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

function normalizeStableId(value, fallback) {
  if (
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value)
  ) {
    return value;
  }

  return fallback;
}

function getStageIdForExperience(experience) {
  return (
    [...GAME_CONFIG.growthStages]
      .reverse()
      .find((stage) => experience >= stage.minimumExperience)?.id ??
    GAME_CONFIG.growthStages[0].id
  );
}

function normalizeFacilities(rawFacilities) {
  return Object.fromEntries(
    GAME_CONFIG.facilities.map((facility) => [
      facility.id,
      toSafeCount(rawFacilities?.[facility.id]),
    ])
  );
}

function createUniqueId(preferredId, fallbackPrefix, usedIds) {
  let candidate = normalizeStableId(preferredId, fallbackPrefix);
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${fallbackPrefix}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

export function createEmptySlot(plotId, slotNumber) {
  return {
    slotId: `${plotId}-slot-${slotNumber}`,
    isPlanted: false,
    xp: 0,
    growthStageId: GAME_CONFIG.growthStages[0].id,
  };
}

export function createGardenPlot(plotNumber = 1) {
  const safePlotNumber = Math.max(1, toSafeCount(plotNumber) || 1);
  const plotId = `garden-${safePlotNumber}`;

  return {
    plotId,
    type: "garden",
    slots: Array.from({ length: GAME_CONFIG.slotsPerPlot }, (_, index) =>
      createEmptySlot(plotId, index + 1)
    ),
  };
}

export function createInitialGameState(now = Date.now()) {
  const safeNow = Math.floor(toSafeNonNegativeNumber(now, Date.now()));

  return {
    saveVersion: GAME_CONFIG.saveVersion,
    cucumbers: 0,
    totalEarned: 0,
    touchYield: GAME_CONFIG.touchExperience,
    harvestCount: 0,
    facilities: createEmptyFacilities(),
    perSecond: 0,
    plots: [],
    hasClaimedFreeGarden: false,
    nextPlotSequence: 1,
    autoXpCursor: 0,
    automaticXpRemainder: 0,
    lastSavedAt: safeNow,
    startedAt: safeNow,
    settings: {},
  };
}

export function detectGameStateSchema(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return "unsupported";
  }

  if (
    rawState.saveVersion === GAME_CONFIG.saveVersion &&
    Array.isArray(rawState.plots)
  ) {
    return "v2";
  }

  if (
    rawState.saveVersion === 1 ||
    (!("plots" in rawState) &&
      LEGACY_CROP_FIELDS.some((field) => field in rawState))
  ) {
    return "legacy";
  }

  return "unsupported";
}

function normalizeSlot(rawSlot, plotId, slotNumber, usedSlotIds) {
  const fallbackId = `${plotId}-slot-${slotNumber}`;
  const slotId = createUniqueId(
    rawSlot?.slotId,
    fallbackId,
    usedSlotIds
  );
  const isPlanted = rawSlot?.isPlanted === true;
  const xp = isPlanted
    ? Math.min(
        toSafeNonNegativeNumber(rawSlot?.xp),
        GAME_CONFIG.harvestExperience
      )
    : 0;

  return {
    slotId,
    isPlanted,
    xp,
    growthStageId: getStageIdForExperience(xp),
  };
}

function normalizeV2State(rawState, safeNow) {
  const initial = createInitialGameState(safeNow);
  const usedPlotIds = new Set();
  const usedSlotIds = new Set();
  const plots = rawState.plots.map((rawPlot, plotIndex) => {
    const fallbackId = `garden-${plotIndex + 1}`;
    const plotId = createUniqueId(
      rawPlot?.plotId,
      fallbackId,
      usedPlotIds
    );
    const rawSlots = Array.isArray(rawPlot?.slots) ? rawPlot.slots : [];
    const slots = Array.from(
      { length: GAME_CONFIG.slotsPerPlot },
      (_, slotIndex) =>
        normalizeSlot(
          rawSlots[slotIndex],
          plotId,
          slotIndex + 1,
          usedSlotIds
        )
    );

    return {
      plotId,
      type:
        typeof rawPlot?.type === "string" && rawPlot.type
          ? rawPlot.type
          : "garden",
      slots,
    };
  });
  let nextPlotSequence = Math.max(
    1,
    toSafeCount(rawState.nextPlotSequence)
  );

  while (usedPlotIds.has(`garden-${nextPlotSequence}`)) {
    nextPlotSequence += 1;
  }

  const startedAt = sanitizeTimestamp(rawState.startedAt, safeNow, safeNow);
  const remainder = toSafeNonNegativeNumber(
    rawState.automaticXpRemainder
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
    harvestCount: Math.floor(
      toSafeNonNegativeNumber(rawState.harvestCount)
    ),
    facilities: normalizeFacilities(rawState.facilities),
    perSecond: toSafeNonNegativeNumber(rawState.perSecond),
    plots,
    hasClaimedFreeGarden:
      rawState.hasClaimedFreeGarden === true || plots.length > 0,
    nextPlotSequence,
    autoXpCursor: toSafeCount(rawState.autoXpCursor),
    automaticXpRemainder: remainder % 1,
    lastSavedAt: sanitizeTimestamp(
      rawState.lastSavedAt,
      safeNow,
      safeNow
    ),
    startedAt,
    settings:
      rawState.settings && typeof rawState.settings === "object"
        ? { ...rawState.settings }
        : { ...initial.settings },
  };
}

function migrateLegacyState(rawState, safeNow) {
  const initial = createInitialGameState(safeNow);
  const plot = createGardenPlot(1);
  const isPlanted = rawState.isPlanted !== false;
  const xp = isPlanted
    ? Math.min(
        toSafeNonNegativeNumber(rawState.growthExperience),
        GAME_CONFIG.harvestExperience
      )
    : 0;

  plot.slots[0] = {
    ...plot.slots[0],
    isPlanted,
    xp,
    growthStageId: getStageIdForExperience(xp),
  };

  return normalizeV2State(
    {
      ...initial,
      cucumbers: rawState.cucumbers,
      totalEarned: rawState.totalEarned,
      touchYield: rawState.touchYield,
      harvestCount: rawState.harvestCount,
      facilities: rawState.facilities,
      perSecond: rawState.perSecond,
      plots: [plot],
      hasClaimedFreeGarden: true,
      nextPlotSequence: 2,
      lastSavedAt: rawState.lastSavedAt,
      startedAt: rawState.startedAt,
      settings: rawState.settings,
    },
    safeNow
  );
}

export function normalizeGameState(rawState, now = Date.now()) {
  const safeNow = Math.floor(toSafeNonNegativeNumber(now, Date.now()));
  const schema = detectGameStateSchema(rawState);

  if (schema === "v2") {
    return normalizeV2State(rawState, safeNow);
  }

  if (schema === "legacy") {
    return migrateLegacyState(rawState, safeNow);
  }

  return createInitialGameState(safeNow);
}
