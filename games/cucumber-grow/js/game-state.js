import { GAME_CONFIG, getThreatDefinitionById } from "./game-config.js";
import { getCoordinatesForIndex } from "./board-geometry.js";
import { toSafeCount, toSafeNonNegativeNumber } from "./number-format.js";

const LEGACY_V2_SLOTS_PER_PLOT = 4;
const LEGACY_CROP_FIELDS = ["growthExperience", "growthStageId", "isPlanted"];

const DEFAULT_SETTINGS = Object.freeze({
  bgmEnabled: true,
  bgmVolume: 0.45,
  sfxEnabled: true,
  sfxVolume: 0.72,
  hapticsEnabled: true,
  reducedMotion: false,
});

function safeTimestamp(value, fallback, now) {
  const timestamp = Math.floor(toSafeNonNegativeNumber(value, fallback));
  if (timestamp <= 0 || timestamp > now) return fallback;
  return timestamp;
}

function normalizeId(value, fallback, usedIds) {
  const preferred =
    typeof value === "string" &&
    /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value)
      ? value
      : fallback;
  let candidate = preferred;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${fallback}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}

function stageIdForCropXp(cropXp) {
  return (
    [...GAME_CONFIG.crops.growthStages]
      .reverse()
      .find((stage) => cropXp >= stage.minimumExperience)?.id ??
    GAME_CONFIG.crops.growthStages[0].id
  );
}

export function createEmptyCrop() {
  return {
    isPlanted: false,
    cropXp: 0,
    growthStageId: GAME_CONFIG.crops.growthStages[0].id,
    varietyId: GAME_CONFIG.crops.defaultVarietyId,
  };
}

function normalizeCrop(rawCrop) {
  const isPlanted = rawCrop?.isPlanted === true;
  const cropXp = isPlanted
    ? Math.min(
        toSafeNonNegativeNumber(
          rawCrop?.cropXp,
          toSafeNonNegativeNumber(
            rawCrop?.xp,
            toSafeNonNegativeNumber(rawCrop?.growthExperience)
          )
        ),
        GAME_CONFIG.crops.harvestExperience
      )
    : 0;

  return {
    isPlanted,
    cropXp,
    growthStageId: stageIdForCropXp(cropXp),
    varietyId: GAME_CONFIG.crops.varieties[rawCrop?.varietyId]
      ? rawCrop.varietyId
      : GAME_CONFIG.crops.defaultVarietyId,
  };
}

function createSeeds() {
  return Object.fromEntries(
    Object.values(GAME_CONFIG.crops.varieties).map((variety) => [
      variety.id,
      toSafeCount(variety.startingSeeds),
    ])
  );
}

function normalizeSeeds(rawSeeds) {
  const seeds = createSeeds();
  Object.keys(seeds).forEach((varietyId) => {
    if (rawSeeds && Object.prototype.hasOwnProperty.call(rawSeeds, varietyId)) {
      seeds[varietyId] = toSafeCount(rawSeeds[varietyId]);
    }
  });
  return seeds;
}

export function createGardenPlot(plotNumber = 1, rawCrop = null) {
  const order = Math.max(1, toSafeCount(plotNumber) || 1);
  const coordinate = getCoordinatesForIndex(order - 1);

  return {
    plotId: `garden-${order}`,
    order,
    row: coordinate.row,
    column: coordinate.column,
    crop: rawCrop ? normalizeCrop(rawCrop) : createEmptyCrop(),
  };
}

function createInventory() {
  return {
    wateringCan: 1,
    hammer: 1,
    waterTank: 1,
    sprinkler: 0,
    scarecrow: 0,
    generator: 0,
    greenhouse: 0,
  };
}

function normalizeInventory(rawInventory) {
  const initial = createInventory();
  const hasSavedHammer =
    rawInventory &&
    typeof rawInventory === "object" &&
    Object.prototype.hasOwnProperty.call(rawInventory, "hammer");

  Object.keys(initial).forEach((key) => {
    initial[key] = toSafeCount(rawInventory?.[key]);
  });
  initial.wateringCan = Math.max(1, initial.wateringCan);
  initial.waterTank = Math.max(1, initial.waterTank);
  if (!hasSavedHammer) initial.hammer = 1;
  return initial;
}

function createToolStatus() {
  return {
    wateringCanCharge: GAME_CONFIG.tools.wateringCan.capacity,
    hammerUsesRemaining: GAME_CONFIG.tools.hammer.usesPerItem,
  };
}

function normalizeToolStatus(rawStatus, inventory) {
  const defaults = createToolStatus();
  const charge = Math.min(
    GAME_CONFIG.tools.wateringCan.capacity,
    toSafeCount(rawStatus?.wateringCanCharge, defaults.wateringCanCharge)
  );
  const hammerUsesRemaining = inventory.hammer > 0
    ? Math.min(
        GAME_CONFIG.tools.hammer.usesPerItem,
        Math.max(
          1,
          toSafeCount(rawStatus?.hammerUsesRemaining, defaults.hammerUsesRemaining)
        )
      )
    : 0;
  return { wateringCanCharge: charge, hammerUsesRemaining };
}

function createTurnStats() {
  return {
    harvestedCucumbers: 0,
    cropXp: 0,
    playerXp: 0,
    animalsDefeated: 0,
    thievesDefeated: 0,
    bountyCoins: 0,
  };
}

function normalizeTurnStats(rawStats) {
  const stats = createTurnStats();
  Object.keys(stats).forEach((key) => {
    stats[key] = toSafeNonNegativeNumber(rawStats?.[key]);
  });
  return stats;
}

function normalizeSettings(rawSettings) {
  const source =
    rawSettings && typeof rawSettings === "object" && !Array.isArray(rawSettings)
      ? rawSettings
      : {};
  const volume = (value, fallback) =>
    Math.min(1, Math.max(0, toSafeNonNegativeNumber(value, fallback)));

  return {
    bgmEnabled: source.bgmEnabled !== false,
    bgmVolume: volume(source.bgmVolume, DEFAULT_SETTINGS.bgmVolume),
    sfxEnabled: source.sfxEnabled !== false,
    sfxVolume: volume(source.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
    hapticsEnabled: source.hapticsEnabled !== false,
    reducedMotion: source.reducedMotion === true,
  };
}

function createTurn(now) {
  return {
    day: 1,
    phase: "preparation",
    phaseStartedAt: now,
    phaseEndsAt: null,
    lastEffectAt: now,
    nextThreatAt: null,
    preparationCollectedDay: 0,
    lastCompletedDay: 0,
    stats: createTurnStats(),
    lastReport: null,
  };
}

export function createInitialGameState(now = Date.now()) {
  const safeNow = Math.floor(toSafeNonNegativeNumber(now, Date.now()));

  return {
    schemaVersion: GAME_CONFIG.schemaVersion,
    saveVersion: GAME_CONFIG.schemaVersion,
    cucumbers: 0,
    coins: GAME_CONFIG.economy.startingCoins,
    totalEarned: 0,
    playerXp: 0,
    playerLevel: 1,
    harvestCount: 0,
    plots: [createGardenPlot(1)],
    nextPlotSequence: 2,
    inventory: createInventory(),
    seeds: createSeeds(),
    toolStatus: createToolStatus(),
    baseItemsGranted: true,
    facilities: [],
    legacyFacilities: {},
    resources: {
      water: GAME_CONFIG.resources.startingWater,
      fuel: GAME_CONFIG.resources.startingFuel,
      energy: GAME_CONFIG.resources.startingEnergy,
    },
    bounties: {
      pendingCoins: 0,
      claimedCoins: 0,
    },
    effects: {
      sunlightBoostEndsAt: 0,
    },
    turn: createTurn(safeNow),
    threats: [],
    lastSavedAt: safeNow,
    startedAt: safeNow,
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function detectGameStateSchema(rawState) {
  if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) {
    return "unsupported";
  }

  if (
    (rawState.schemaVersion === GAME_CONFIG.schemaVersion ||
      rawState.saveVersion === GAME_CONFIG.schemaVersion) &&
    Array.isArray(rawState.plots)
  ) {
    return "v8";
  }

  if (
    (rawState.schemaVersion === 7 || rawState.saveVersion === 7) &&
    Array.isArray(rawState.plots)
  ) {
    return "v7";
  }

  if (
    (rawState.schemaVersion === 6 || rawState.saveVersion === 6) &&
    Array.isArray(rawState.plots)
  ) {
    return "v6";
  }

  if (
    (rawState.schemaVersion === 5 || rawState.saveVersion === 5) &&
    Array.isArray(rawState.plots)
  ) {
    return "v5";
  }

  if (
    (rawState.schemaVersion === 3 || rawState.saveVersion === 3) &&
    Array.isArray(rawState.plots)
  ) {
    return "v3";
  }

  if (
    (rawState.schemaVersion === 4 || rawState.saveVersion === 4) &&
    Array.isArray(rawState.plots)
  ) {
    return "v4";
  }

  if (
    rawState.saveVersion === 2 ||
    rawState.plots?.some?.((plot) => Array.isArray(plot?.slots))
  ) {
    return "v2";
  }

  if (
    rawState.saveVersion === 1 ||
    LEGACY_CROP_FIELDS.some((field) => field in rawState)
  ) {
    return "legacy";
  }

  return "partial";
}

function normalizePlots(rawPlots) {
  const source = Array.isArray(rawPlots) && rawPlots.length > 0
    ? rawPlots
    : [createGardenPlot(1)];
  const usedIds = new Set();
  const usedCoordinates = new Set();

  return source.map((rawPlot, index) => {
    const fallback = createGardenPlot(index + 1);
    const requestedRow = toSafeCount(rawPlot?.row);
    const requestedColumn = toSafeCount(rawPlot?.column);
    const coordinateKey = `${requestedRow}:${requestedColumn}`;
    const coordinateIsValid =
      requestedColumn < GAME_CONFIG.board.columns &&
      !usedCoordinates.has(coordinateKey);
    const coordinate = coordinateIsValid
      ? { row: requestedRow, column: requestedColumn }
      : getCoordinatesForIndex(index);
    const stableCoordinateKey = `${coordinate.row}:${coordinate.column}`;

    usedCoordinates.add(stableCoordinateKey);
    return {
      plotId: normalizeId(rawPlot?.plotId, fallback.plotId, usedIds),
      order: index + 1,
      row: coordinate.row,
      column: coordinate.column,
      crop: normalizeCrop(rawPlot?.crop ?? rawPlot?.slots?.[0]),
    };
  });
}

function normalizeFacilities(rawFacilities, plots) {
  if (!Array.isArray(rawFacilities)) return [];
  const usedIds = new Set();

  return rawFacilities
    .map((facility, index) => {
      const definition = GAME_CONFIG.facilities.find(
        (candidate) => candidate.id === facility?.type
      );
      const row = toSafeCount(facility?.row ?? facility?.anchor?.row);
      const column = toSafeCount(
        facility?.column ?? facility?.anchor?.column
      );
      const isTerrace = definition?.placement === "terrace";
      const anchorExists = isTerrace || plots.some(
        (plot) => plot.row === row && plot.column === column
      );

      if (!definition || !anchorExists) return null;
      return {
        facilityId: normalizeId(
          facility?.facilityId,
          `facility-${index + 1}`,
          usedIds
        ),
        type: definition.id,
        row: isTerrace ? -1 : row,
        column: isTerrace ? -1 : column,
        active: definition.id === "generator" ? facility?.active === true : facility?.active !== false,
        installedAt: toSafeNonNegativeNumber(facility?.installedAt),
        generatorStartedAt: definition.id === "generator"
          ? toSafeNonNegativeNumber(facility?.generatorStartedAt)
          : 0,
        generatorEndsAt: definition.id === "generator"
          ? toSafeNonNegativeNumber(facility?.generatorEndsAt)
          : 0,
      };
    })
    .filter(Boolean);
}

function normalizeTurn(rawTurn, now) {
  const fallback = createTurn(now);
  const phase = GAME_CONFIG.turn.phases.includes(rawTurn?.phase)
    ? rawTurn.phase
    : fallback.phase;
  const phaseStartedAt = safeTimestamp(
    rawTurn?.phaseStartedAt,
    fallback.phaseStartedAt,
    now
  );
  const duration =
    phase === "day"
      ? GAME_CONFIG.turn.dayDurationMs
      : phase === "night"
        ? GAME_CONFIG.turn.nightDurationMs
        : null;
  const rawEnd = toSafeNonNegativeNumber(rawTurn?.phaseEndsAt);
  const phaseEndsAt = duration === null
    ? null
    : Math.max(phaseStartedAt, rawEnd || phaseStartedAt + duration);

  return {
    day: Math.max(1, toSafeCount(rawTurn?.day) || 1),
    phase,
    phaseStartedAt,
    phaseEndsAt,
    lastEffectAt: Math.min(
      now,
      Math.max(
        phaseStartedAt,
        toSafeNonNegativeNumber(rawTurn?.lastEffectAt, phaseStartedAt)
      )
    ),
    nextThreatAt:
      phase === "preparation"
        ? null
        : Math.max(
            phaseStartedAt,
            toSafeNonNegativeNumber(
              rawTurn?.nextThreatAt,
              phaseStartedAt +
                (phase === "day"
                  ? GAME_CONFIG.threats.dayIntervalMs
                  : GAME_CONFIG.threats.nightIntervalMs)
            )
          ),
    preparationCollectedDay: toSafeCount(
      rawTurn?.preparationCollectedDay
    ),
    lastCompletedDay: toSafeCount(rawTurn?.lastCompletedDay),
    stats: normalizeTurnStats(rawTurn?.stats),
    lastReport:
      rawTurn?.lastReport && typeof rawTurn.lastReport === "object"
        ? {
            day: Math.max(1, toSafeCount(rawTurn.lastReport.day) || 1),
            ...normalizeTurnStats(rawTurn.lastReport),
          }
        : null,
  };
}

function normalizeThreats(rawThreats, plots, now) {
  if (!Array.isArray(rawThreats)) return [];
  const validPlotIds = new Set(plots.map((plot) => plot.plotId));
  const usedIds = new Set();

  return rawThreats
    .map((threat, index) => {
      if (!validPlotIds.has(threat?.targetPlotId)) return null;
      const legacyType = threat?.type === "small-animal" ? "squirrel" : threat?.type;
      const definition = getThreatDefinitionById(legacyType);
      if (!definition) return null;

      const phase = definition.spawnPhase;
      const spawnedAt = toSafeNonNegativeNumber(threat?.spawnedAt, now);
      const isLegacyThreat = typeof threat?.state !== "string";
      const allowedStates = new Set([
        "approaching",
        "eating",
        "stealing",
        "hit",
        "defeated",
        "celebrating",
        "retreating",
        "despawning",
      ]);
      const savedState = threat?.state === "knockedOut" ? "defeated" : threat?.state;
      const state = allowedStates.has(savedState)
        ? savedState
        : isLegacyThreat
          ? definition.id === "thief" ? "stealing" : "eating"
          : "approaching";
      const approachEndsAt = toSafeNonNegativeNumber(
        threat?.approachEndsAt,
        isLegacyThreat ? spawnedAt : spawnedAt + definition.approachDurationMs
      );
      const actionEndsAt = toSafeNonNegativeNumber(
        threat?.actionEndsAt,
        toSafeNonNegativeNumber(
          threat?.expiresAt,
          spawnedAt + GAME_CONFIG.threats.responseWindowMs
        )
      );
      const actionStartedAt = toSafeNonNegativeNumber(
        threat?.actionStartedAt,
        ["eating", "stealing"].includes(state) ? spawnedAt : 0
      );
      const health = Math.min(
        definition.maxHealth,
        toSafeCount(threat?.health, definition.maxHealth)
      );
      const spawnEdges = ["top", "right", "bottom", "left"];
      const spawnEdge = spawnEdges.includes(threat?.spawnEdge)
        ? threat.spawnEdge
        : spawnEdges[index % spawnEdges.length];

      return {
        threatId: normalizeId(
          threat?.threatId,
          `threat-${index + 1}`,
          usedIds
        ),
        type: definition.id,
        phase,
        targetPlotId: threat.targetPlotId,
        state,
        resumeState: ["approaching", "eating", "stealing", "retreating"].includes(threat?.resumeState)
          ? threat.resumeState
          : null,
        health: state === "defeated" ? health : Math.max(1, health),
        maxHealth: definition.maxHealth,
        spawnedAt,
        approachEndsAt,
        actionEndsAt,
        actionStartedAt,
        biteStage: definition.id === "thief"
          ? 0
          : Math.min(3, toSafeCount(threat?.biteStage)),
        hitEndsAt: toSafeNonNegativeNumber(threat?.hitEndsAt),
        defeatedAt: toSafeNonNegativeNumber(threat?.defeatedAt),
        knockedOutAt: 0,
        reviveAt: 0,
        celebrateEndsAt: toSafeNonNegativeNumber(
          threat?.celebrateEndsAt,
          state === "celebrating" ? now + GAME_CONFIG.threats.celebrateDurationMs : 0
        ),
        retreatStartedAt: toSafeNonNegativeNumber(threat?.retreatStartedAt),
        retreatEndsAt: toSafeNonNegativeNumber(threat?.retreatEndsAt),
        retreatFromProgress: Math.min(
          1,
          Math.max(0, toSafeNonNegativeNumber(threat?.retreatFromProgress, 1))
        ),
        deliveredAt: toSafeNonNegativeNumber(threat?.deliveredAt),
        despawnAt: toSafeNonNegativeNumber(
          threat?.despawnAt,
          state === "defeated" ? now + GAME_CONFIG.threats.defeatedDisplayMs : 0
        ),
        spawnEdge,
        spawnLane: Math.min(
          0.92,
          Math.max(0.08, toSafeNonNegativeNumber(threat?.spawnLane, 0.2 + (index % 4) * 0.2))
        ),
        attackSide: threat?.attackSide === -1 || (threat?.attackSide !== 1 && index % 2 === 0) ? -1 : 1,
        rewardGranted: threat?.rewardGranted === true,
        resolved: threat?.resolved === true,
      };
    })
    .filter(Boolean);
}

function getLevelForXp(playerXp) {
  let level = 1;
  GAME_CONFIG.player.levelThresholds.forEach((threshold, index) => {
    if (playerXp >= threshold) level = index + 1;
  });
  return Math.min(level, GAME_CONFIG.player.maximumLevel);
}

function normalizeV3State(rawState, now) {
  const initial = createInitialGameState(now);
  const plots = normalizePlots(rawState?.plots);
  const playerXp = toSafeNonNegativeNumber(rawState?.playerXp);
  const facilities = normalizeFacilities(rawState?.facilities, plots);
  const inventory = normalizeInventory(rawState?.inventory);
  const turn = normalizeTurn(rawState?.turn, now);
  const savedCoins = toSafeNonNegativeNumber(
    rawState?.coins,
    GAME_CONFIG.economy.startingCoins
  );

  return {
    schemaVersion: GAME_CONFIG.schemaVersion,
    saveVersion: GAME_CONFIG.schemaVersion,
    cucumbers: toSafeNonNegativeNumber(rawState?.cucumbers),
    coins: Math.min(GAME_CONFIG.maxGameNumber, savedCoins),
    totalEarned: toSafeNonNegativeNumber(rawState?.totalEarned),
    playerXp,
    playerLevel: getLevelForXp(playerXp),
    harvestCount: toSafeCount(rawState?.harvestCount),
    plots,
    nextPlotSequence: plots.length + 1,
    inventory,
    seeds: normalizeSeeds(rawState?.seeds),
    toolStatus: normalizeToolStatus(rawState?.toolStatus, inventory),
    baseItemsGranted: true,
    facilities,
    legacyFacilities:
      rawState?.legacyFacilities &&
      typeof rawState.legacyFacilities === "object" &&
      !Array.isArray(rawState.legacyFacilities)
        ? { ...rawState.legacyFacilities }
        : {},
    resources: {
      water: toSafeNonNegativeNumber(
        rawState?.resources?.water,
        GAME_CONFIG.resources.startingWater
      ),
      fuel: toSafeNonNegativeNumber(
        rawState?.resources?.fuel,
        GAME_CONFIG.resources.startingFuel
      ),
      energy: Math.min(
        GAME_CONFIG.resources.maximumEnergy,
        toSafeNonNegativeNumber(
          rawState?.resources?.energy,
          GAME_CONFIG.resources.startingEnergy
        )
      ),
    },
    bounties: {
      pendingCoins: Math.min(
        GAME_CONFIG.maxGameNumber,
        toSafeNonNegativeNumber(rawState?.bounties?.pendingCoins)
      ),
      claimedCoins: Math.min(
        GAME_CONFIG.maxGameNumber,
        toSafeNonNegativeNumber(rawState?.bounties?.claimedCoins)
      ),
    },
    effects: {
      sunlightBoostEndsAt: toSafeNonNegativeNumber(
        rawState?.effects?.sunlightBoostEndsAt
      ),
    },
    turn,
    threats:
      turn.phase === "preparation"
        ? []
        : normalizeThreats(rawState?.threats, plots, now),
    lastSavedAt: safeTimestamp(rawState?.lastSavedAt, now, now),
    startedAt: safeTimestamp(rawState?.startedAt, now, now),
    settings: normalizeSettings(rawState?.settings ?? initial.settings),
  };
}

function migrateV2State(rawState, now) {
  const migratedPlots = [];

  (Array.isArray(rawState.plots) ? rawState.plots : []).forEach(
    (legacyPlot, plotIndex) => {
      const slots = Array.isArray(legacyPlot?.slots)
        ? legacyPlot.slots
        : [];
      for (let slotIndex = 0; slotIndex < LEGACY_V2_SLOTS_PER_PLOT; slotIndex += 1) {
        const order = migratedPlots.length + 1;
        const plot = createGardenPlot(order, slots[slotIndex]);
        plot.plotId = `${legacyPlot?.plotId || `legacy-${plotIndex + 1}`}-plot-${
          slotIndex + 1
        }`;
        migratedPlots.push(plot);
      }
    }
  );

  if (migratedPlots.length === 0) migratedPlots.push(createGardenPlot(1));
  return normalizeV3State(
    {
      ...rawState,
      schemaVersion: GAME_CONFIG.schemaVersion,
      saveVersion: GAME_CONFIG.schemaVersion,
      plots: migratedPlots,
      playerXp:
        toSafeNonNegativeNumber(rawState.playerXp) ||
        toSafeCount(rawState.harvestCount) * GAME_CONFIG.player.harvestXp,
      coins:
        rawState.coins ?? GAME_CONFIG.economy.startingCoins,
      inventory: rawState.inventory,
      legacyFacilities:
        rawState.facilities && !Array.isArray(rawState.facilities)
          ? { ...rawState.facilities }
          : rawState.legacyFacilities,
      facilities: [],
      turn: createTurn(now),
      threats: [],
    },
    now
  );
}

function migrateLegacyState(rawState, now) {
  const crop = {
    isPlanted: rawState.isPlanted !== false,
    cropXp: rawState.growthExperience,
  };

  return normalizeV3State(
    {
      ...rawState,
      schemaVersion: GAME_CONFIG.schemaVersion,
      saveVersion: GAME_CONFIG.schemaVersion,
      plots: [createGardenPlot(1, crop)],
      playerXp:
        toSafeCount(rawState.harvestCount) * GAME_CONFIG.player.harvestXp,
      coins: rawState.coins ?? GAME_CONFIG.economy.startingCoins,
      inventory: rawState.inventory,
      legacyFacilities:
        rawState.facilities && typeof rawState.facilities === "object"
          ? { ...rawState.facilities }
          : {},
      facilities: [],
      turn: createTurn(now),
      threats: [],
    },
    now
  );
}

export function normalizeGameState(rawState, now = Date.now()) {
  const safeNow = Math.floor(toSafeNonNegativeNumber(now, Date.now()));
  const schema = detectGameStateSchema(rawState);

  if (["v8", "v7", "v6", "v5", "v4", "v3"].includes(schema)) return normalizeV3State(rawState, safeNow);
  if (schema === "v2") return migrateV2State(rawState, safeNow);
  if (schema === "legacy") return migrateLegacyState(rawState, safeNow);
  if (schema === "partial") return normalizeV3State(rawState, safeNow);
  return createInitialGameState(safeNow);
}
