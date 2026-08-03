import { GAME_CONFIG, getThreatDefinitionById } from "./game-config.js";
import {
  addCropExperience,
  findPlot,
  getGrowthProgress,
  grantPlayerXp,
} from "./game-engine.js";
import {
  getDaytimeProtectionChance,
  getFacilityAffectedPlots,
  getFacilityDefinition,
  getFacilityStatus,
  isPlotIndoors,
} from "./facility-engine.js";
import { addSafeNumbers, toSafeNonNegativeNumber } from "./number-format.js";

function eligibleCrop(plot) {
  return (
    plot?.crop?.isPlanted === true &&
    !getGrowthProgress(plot.crop.cropXp).isHarvestReady
  );
}

function applyGeneratorSecond(state) {
  let generated = 0;
  (state.facilities ?? [])
    .filter((facility) => facility.type === "generator")
    .forEach((facility) => {
      const definition = getFacilityDefinition(facility.type);
      if (!getFacilityStatus(state, facility).active) return;
      state.resources.fuel = Math.max(
        0,
        state.resources.fuel - definition.fuelPerSecond
      );
      const availableCapacity = Math.max(
        0,
        GAME_CONFIG.resources.maximumEnergy - state.resources.energy
      );
      const amount = Math.min(definition.energyPerSecond, availableCapacity);
      state.resources.energy += amount;
      generated += amount;
    });
  return generated;
}

function applyDayGrowthSecond(state) {
  let gained = 0;
  const allocations = [];

  state.plots.forEach((plot) => {
    if (!eligibleCrop(plot)) return;
    const result = addCropExperience(
      state,
      plot.plotId,
      GAME_CONFIG.crops.dayPassiveXpPerSecond
    );
    gained += result.gained;
    if (result.gained > 0) allocations.push({ plotId: plot.plotId, amount: result.gained, source: "day" });
  });

  const sprinklerTargets = new Set();
  (state.facilities ?? [])
    .filter((facility) => facility.type === "sprinkler")
    .forEach((facility) => {
      const definition = getFacilityDefinition(facility.type);
      const targets = getFacilityAffectedPlots(state, facility).filter(eligibleCrop);
      if (targets.length === 0 || !getFacilityStatus(state, facility).active) return;
      state.resources.water = Math.max(
        0,
        state.resources.water - definition.waterPerSecond
      );
      targets.forEach((plot) => sprinklerTargets.add(plot.plotId));
    });

  // 같은 작물에는 스프링클러가 여러 대여도 초당 1XP만 적용한다.
  sprinklerTargets.forEach((plotId) => {
    const result = addCropExperience(
      state,
      plotId,
      getFacilityDefinition("sprinkler").cropXpPerSecond
    );
    gained += result.gained;
    if (result.gained > 0) allocations.push({ plotId, amount: result.gained, source: "sprinkler" });
  });

  return { gained, allocations };
}

function applyNightGrowthSecond(state) {
  let gained = 0;
  const allocations = [];

  (state.facilities ?? [])
    .filter((facility) => facility.type === "greenhouse")
    .forEach((facility) => {
      const definition = getFacilityDefinition(facility.type);
      const targets = getFacilityAffectedPlots(state, facility).filter(eligibleCrop);
      if (targets.length === 0 || !getFacilityStatus(state, facility).active) return;
      state.resources.energy = Math.max(
        0,
        state.resources.energy - definition.energyPerSecond
      );
      targets.forEach((plot) => {
        const result = addCropExperience(
          state,
          plot.plotId,
          definition.cropXpPerSecondAtNight
        );
        gained += result.gained;
        if (result.gained > 0) allocations.push({ plotId: plot.plotId, amount: result.gained, source: "greenhouse" });
      });
    });
  return { gained, allocations };
}

export function applyThreatDamage(state, threat) {
  const definition = getThreatDefinitionById(threat.type);
  if (!definition) return { damaged: false, reason: "unknown-threat" };

  if (threat.phase === "day") {
    const plot = findPlot(state, threat.targetPlotId);
    if (!plot?.crop?.isPlanted) return { damaged: false, reason: "crop-gone" };
    plot.crop.yieldPenalty = addSafeNumbers(
      plot.crop.yieldPenalty,
      definition.yieldDamage
    );
    return { damaged: true, kind: "yield", amount: definition.yieldDamage };
  }

  const cucumberLoss = Math.min(state.cucumbers, definition.cucumberDamage);
  state.cucumbers -= cucumberLoss;
  if (cucumberLoss > 0) {
    return { damaged: true, kind: "cucumbers", amount: cucumberLoss };
  }
  const coinLoss = Math.min(state.coins, definition.coinDamage);
  state.coins -= coinLoss;
  return { damaged: coinLoss > 0, kind: "coins", amount: coinLoss };
}

function isActiveCropTarget(state, plotId) {
  return state.plots.some(
    (plot) => plot.plotId === plotId && plot.crop?.isPlanted === true
  );
}

function retargetThreat(state, threat, now) {
  if (isActiveCropTarget(state, threat.targetPlotId)) return null;
  const occupiedTargets = new Set(
    (state.threats ?? [])
      .filter((candidate) => candidate.threatId !== threat.threatId)
      .map((candidate) => candidate.targetPlotId)
  );
  const planted = state.plots.filter((plot) => plot.crop?.isPlanted === true);
  const available = planted.filter((plot) => !occupiedTargets.has(plot.plotId));
  const target = available[0] ?? planted[0] ?? null;

  if (!target) {
    threat.state = "despawning";
    threat.resolved = true;
    threat.despawnAt = now + GAME_CONFIG.threats.despawnDurationMs;
    return { type: "retreating", threat };
  }

  const definition = getThreatDefinitionById(threat.type);
  threat.targetPlotId = target.plotId;
  threat.state = "approaching";
  threat.resumeState = null;
  threat.spawnedAt = now;
  threat.approachEndsAt = now + Math.round(definition.approachDurationMs * 0.65);
  threat.actionEndsAt = now + GAME_CONFIG.threats.responseWindowMs;
  return { type: "retargeted", threat };
}

export function advanceThreatStates(state, now = Date.now()) {
  const events = [];
  const damages = [];
  const removed = [];
  const active = [];

  (state.threats ?? []).forEach((threat) => {
    const definition = getThreatDefinitionById(threat.type);
    if (!definition) {
      removed.push(threat);
      return;
    }

    if (["defeated", "despawning"].includes(threat.state)) {
      if (threat.despawnAt > 0 && now >= threat.despawnAt) {
        removed.push(threat);
        events.push({ type: "removed", threat });
        return;
      }
      active.push(threat);
      return;
    }

    const retargetEvent = retargetThreat(state, threat, now);
    if (retargetEvent) events.push(retargetEvent);
    if (threat.state === "despawning") {
      active.push(threat);
      return;
    }

    if (threat.state === "hit" && now >= threat.hitEndsAt) {
      threat.state = threat.resumeState ?? "approaching";
      threat.resumeState = null;
      events.push({ type: "recovered", threat });
    }

    if (threat.state === "approaching" && now >= threat.approachEndsAt) {
      threat.state = definition.id === "thief" ? "stealing" : "eating";
      events.push({ type: "arrived", threat, definition });
    }

    if (["eating", "stealing"].includes(threat.state) && now >= threat.actionEndsAt) {
      const result = applyThreatDamage(state, threat);
      threat.state = "despawning";
      threat.resolved = true;
      threat.despawnAt = now + GAME_CONFIG.threats.despawnDurationMs;
      damages.push({ threat, result });
      events.push({ type: "damaged", threat, result, definition });
    }

    active.push(threat);
  });

  state.threats = active;
  return { events, damages, removed };
}

export function resolveExpiredThreats(state, now = Date.now()) {
  return advanceThreatStates(state, now).damages;
}

export function spawnThreat(state, now = Date.now(), random = Math.random) {
  if (!['day', 'night'].includes(state.turn.phase)) {
    return { spawned: false, reason: "inactive-phase" };
  }
  const planted = state.plots.filter((plot) => plot.crop.isPlanted);
  const unoccupied = planted.filter(
    (plot) => !state.threats.some((threat) => threat.targetPlotId === plot.plotId)
  );
  const candidates = unoccupied.length > 0 ? unoccupied : planted;
  if (candidates.length === 0) return { spawned: false, reason: "no-target" };

  const target = candidates[Math.floor(random() * candidates.length) % candidates.length];
  if (state.turn.phase === "day") {
    const protectionChance = getDaytimeProtectionChance(state, target.plotId);
    if (random() < protectionChance) {
      return { spawned: false, reason: "scarecrow-protected", targetPlotId: target.plotId };
    }
  }

  const definitions =
    state.turn.phase === "day"
      ? GAME_CONFIG.threats.daytime
      : GAME_CONFIG.threats.nighttime;
  const definition = definitions[Math.floor(random() * definitions.length) % definitions.length];
  const sequence = (state.threats ?? []).reduce((maximum, threat) => {
    const match = /-(\d+)$/.exec(threat.threatId);
    return Math.max(maximum, Number(match?.[1]) || 0);
  }, 0) + 1;
  const threat = {
    threatId: `threat-${state.turn.day}-${sequence}`,
    type: definition.id,
    phase: definition.spawnPhase,
    targetPlotId: target.plotId,
    state: "approaching",
    resumeState: null,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    spawnedAt: now,
    approachEndsAt: now + definition.approachDurationMs,
    actionEndsAt: now + GAME_CONFIG.threats.responseWindowMs,
    hitEndsAt: 0,
    defeatedAt: 0,
    despawnAt: 0,
    spawnEdge: ["top", "right", "bottom", "left"][
      Math.floor(random() * 4) % 4
    ],
    spawnLane: 0.12 + Math.min(0.76, Math.max(0, random() * 0.76)),
    rewardGranted: false,
    resolved: false,
  };
  state.threats.push(threat);
  return { spawned: true, threat, definition };
}

export function hitThreat(state, threatId, now = Date.now()) {
  const threat = (state.threats ?? []).find(
    (candidate) => candidate.threatId === threatId
  );
  if (!threat) return { ok: false, reason: "no-threat" };
  if (threat.resolved || ["defeated", "despawning"].includes(threat.state)) {
    return { ok: false, reason: "already-defeated" };
  }

  const definition = getThreatDefinitionById(threat.type);
  if (!definition) return { ok: false, reason: "no-threat" };
  const previousHealth = Math.max(0, threat.health);
  const damage = Math.min(previousHealth, GAME_CONFIG.tools.hammer.damage);
  threat.health = Math.max(0, previousHealth - damage);

  if (threat.health > 0) {
    if (threat.state !== "hit") threat.resumeState = threat.state;
    threat.state = "hit";
    threat.hitEndsAt = now + GAME_CONFIG.threats.hitDurationMs;
    return {
      ok: true,
      threat,
      definition,
      damage,
      health: threat.health,
      maxHealth: threat.maxHealth,
      defeated: false,
    };
  }

  threat.state = "defeated";
  threat.resumeState = null;
  threat.defeatedAt = now;
  threat.despawnAt = now + GAME_CONFIG.threats.defeatedDisplayMs;
  const playerResult = threat.rewardGranted
    ? null
    : grantPlayerXp(state, GAME_CONFIG.player.threatRepelXp);
  threat.rewardGranted = true;
  threat.resolved = true;
  return {
    ok: true,
    threat,
    definition,
    damage,
    health: 0,
    maxHealth: threat.maxHealth,
    defeated: true,
    playerResult,
  };
}

export function repelThreat(state, plotId = null, now = Date.now()) {
  const threat = (state.threats ?? []).find(
    (candidate) => !plotId || candidate.targetPlotId === plotId
  );
  return threat
    ? hitThreat(state, threat.threatId, now)
    : { ok: false, reason: "no-threat" };
}

function collectPreparationWater(state) {
  if (state.turn.preparationCollectedDay === state.turn.day) return 0;
  const collected = (state.facilities ?? [])
    .filter((facility) => facility.type === "rainBarrel" && facility.active !== false)
    .reduce(
      (total, facility) =>
        total + getFacilityDefinition(facility.type).waterPerPreparation,
      0
    );
  state.resources.water = addSafeNumbers(state.resources.water, collected);
  state.turn.preparationCollectedDay = state.turn.day;
  return collected;
}

export function transitionPhase(state, at = Date.now()) {
  const previous = state.turn.phase;
  resolveExpiredThreats(state, at);

  if (previous === "day") {
    state.turn.phase = "night";
    state.turn.phaseStartedAt = at;
    state.turn.phaseEndsAt = at + GAME_CONFIG.turn.nightDurationMs;
    state.turn.lastEffectAt = at;
    state.turn.nextThreatAt = at + GAME_CONFIG.threats.nightIntervalMs;
    return { changed: true, from: previous, to: "night", at };
  }

  if (previous === "night") {
    state.turn.phase = "preparation";
    state.turn.phaseStartedAt = at;
    state.turn.phaseEndsAt = null;
    state.turn.lastEffectAt = at;
    state.turn.nextThreatAt = null;
    const waterCollected = collectPreparationWater(state);
    return { changed: true, from: previous, to: "preparation", at, waterCollected };
  }

  return { changed: false, from: previous, to: previous, at };
}

export function startNextDay(state, now = Date.now()) {
  if (state.turn.phase !== "preparation") {
    return { ok: false, reason: "not-preparation" };
  }
  state.turn.day += 1;
  state.turn.phase = "day";
  state.turn.phaseStartedAt = now;
  state.turn.phaseEndsAt = now + GAME_CONFIG.turn.dayDurationMs;
  state.turn.lastEffectAt = now;
  state.turn.nextThreatAt = now + GAME_CONFIG.threats.dayIntervalMs;
  return { ok: true, day: state.turn.day };
}

export function getTurnRemainingMs(state, now = Date.now()) {
  if (state.turn.phase === "preparation" || state.turn.phaseEndsAt === null) {
    return null;
  }
  return Math.max(0, state.turn.phaseEndsAt - now);
}

export function advanceGameTime(
  state,
  now = Date.now(),
  { offline = false, random = Math.random } = {}
) {
  const safeNow = Math.max(0, toSafeNonNegativeNumber(now));
  const startedAt = Math.min(safeNow, state.turn.lastEffectAt);
  const allocations = [];
  const transitions = [];
  const expiredThreats = [];
  const threatEvents = [];
  let generatedEnergy = 0;
  let growthGained = 0;
  let safety = 0;

  while (state.turn.phase !== "preparation" && safety < 10_000) {
    safety += 1;
    const phaseEnd = state.turn.phaseEndsAt ?? safeNow;
    const target = Math.min(safeNow, phaseEnd);

    while (state.turn.lastEffectAt + 1_000 <= target && safety < 10_000) {
      safety += 1;
      state.turn.lastEffectAt += 1_000;
      generatedEnergy += applyGeneratorSecond(state);
      const growth =
        state.turn.phase === "day"
          ? applyDayGrowthSecond(state)
          : applyNightGrowthSecond(state);
      growthGained += growth.gained;
      allocations.push(...growth.allocations);
      const threatAdvance = advanceThreatStates(state, state.turn.lastEffectAt);
      expiredThreats.push(...threatAdvance.damages);
      threatEvents.push(...threatAdvance.events);
    }

    if (safeNow >= phaseEnd) {
      transitions.push(transitionPhase(state, phaseEnd));
      continue;
    }
    break;
  }

  const finalThreatAdvance = advanceThreatStates(state, safeNow);
  expiredThreats.push(...finalThreatAdvance.damages);
  threatEvents.push(...finalThreatAdvance.events);
  let threatResult = null;
  if (
    !offline &&
    state.turn.phase !== "preparation" &&
    safeNow >= toSafeNonNegativeNumber(state.turn.nextThreatAt, safeNow)
  ) {
    threatResult = spawnThreat(state, safeNow, random);
    state.turn.nextThreatAt =
      safeNow +
      (state.turn.phase === "day"
        ? GAME_CONFIG.threats.dayIntervalMs
        : GAME_CONFIG.threats.nightIntervalMs);
  } else if (offline && state.turn.phase !== "preparation") {
    state.turn.nextThreatAt =
      safeNow +
      (state.turn.phase === "day"
        ? GAME_CONFIG.threats.dayIntervalMs
        : GAME_CONFIG.threats.nightIntervalMs);
  }

  return {
    elapsedSeconds: Math.max(0, Math.floor((safeNow - startedAt) / 1_000)),
    growthGained,
    generatedEnergy,
    allocations,
    transitions: transitions.filter((transition) => transition.changed),
    expiredThreats,
    threatEvents,
    threatResult,
    phase: state.turn.phase,
  };
}

export function getPlotEnvironment(state, plotId) {
  return isPlotIndoors(state, plotId) ? "indoor" : "outdoor";
}
