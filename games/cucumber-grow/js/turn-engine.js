import { GAME_CONFIG, getThreatDefinitionById } from "./game-config.js";
import {
  addCropExperience,
  consumeHammerUse,
  findPlot,
  getGrowthProgress,
  getPlotHarvestYield,
  getSunlightMultiplier,
  grantPlayerXp,
} from "./game-engine.js";
import { createEmptyCrop } from "./game-state.js";
import {
  completeGeneratorCycles,
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

function applyDayGrowthSecond(state, now) {
  let gained = 0;
  const allocations = [];

  state.plots.forEach((plot) => {
    if (!eligibleCrop(plot)) return;
    const result = addCropExperience(
      state,
      plot.plotId,
      GAME_CONFIG.crops.dayPassiveXpPerSecond * getSunlightMultiplier(state, now)
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
  // 밤에는 햇빛·시설 자동 성장이 없고 직접 물주기로만 작물이 성장한다.
  return { gained: 0, allocations: [] };
}

export function applyThreatDamage(state, threat) {
  const definition = getThreatDefinitionById(threat.type);
  if (!definition) return { damaged: false, reason: "unknown-threat" };

  const plot = findPlot(state, threat.targetPlotId);
  if (!plot?.crop?.isPlanted) return { damaged: false, reason: "crop-gone" };
  const baseYield = getPlotHarvestYield(plot);
  const varietyId = plot.crop.varietyId;
  plot.crop = createEmptyCrop();
  return {
    damaged: true,
    kind: definition.id === "thief" ? "stolen-crop" : "eaten-crop",
    amount: baseYield,
    plotId: plot.plotId,
    varietyId,
  };
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
  const target = available[0] ?? null;

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
  threat.actionStartedAt = 0;
  threat.actionEndsAt = 0;
  threat.biteStage = 0;
  return { type: "retargeted", threat };
}

export function retreatThreatsFromPlot(state, plotId, now = Date.now()) {
  const retreating = [];
  (state.threats ?? []).forEach((threat) => {
    if (
      threat.targetPlotId !== plotId ||
      threat.resolved ||
      ["defeated", "celebrating", "despawning"].includes(threat.state)
    ) return;
    const definition = getThreatDefinitionById(threat.type);
    if (!definition) return;
    const previousState = threat.state === "hit" ? threat.resumeState : threat.state;
    const approachProgress = previousState === "approaching"
      ? Math.min(1, Math.max(0, (now - threat.spawnedAt) / Math.max(1, threat.approachEndsAt - threat.spawnedAt)))
      : 1;
    threat.state = "retreating";
    threat.resumeState = null;
    threat.retreatStartedAt = now;
    threat.retreatEndsAt = now + Math.max(900, Math.round(definition.approachDurationMs * 0.48));
    threat.retreatFromProgress = approachProgress;
    threat.actionStartedAt = 0;
    threat.actionEndsAt = 0;
    threat.biteStage = 0;
    retreating.push(threat);
  });
  return { ok: true, retreating };
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

    if (threat.state === "defeated") {
      if (threat.despawnAt > 0 && now >= threat.despawnAt) {
        removed.push(threat);
        events.push({ type: "removed", threat, definition });
        return;
      }
      active.push(threat);
      return;
    }

    if (threat.state === "celebrating") {
      if (threat.celebrateEndsAt > 0 && now >= threat.celebrateEndsAt) {
        threat.state = "despawning";
        threat.despawnAt = now + GAME_CONFIG.threats.despawnDurationMs;
      }
      active.push(threat);
      return;
    }

    if (threat.state === "despawning") {
      if (threat.despawnAt > 0 && now >= threat.despawnAt) {
        removed.push(threat);
        events.push({ type: "removed", threat });
        return;
      }
      active.push(threat);
      return;
    }

    if (threat.state === "hit" && now >= threat.hitEndsAt) {
      threat.state = threat.resumeState ?? "approaching";
      threat.resumeState = null;
      events.push({ type: "recovered", threat });
    }

    if (threat.state === "hit" && threat.resumeState === "retreating") {
      active.push(threat);
      return;
    }

    if (threat.state === "retreating") {
      if (now >= threat.retreatEndsAt) {
        removed.push(threat);
        events.push({ type: "retreated", threat, definition });
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

    if (threat.state === "approaching" && now >= threat.approachEndsAt) {
      threat.state = definition.id === "thief" ? "stealing" : "eating";
      threat.actionStartedAt = now;
      threat.actionEndsAt = now + GAME_CONFIG.threats.responseWindowMs;
      threat.biteStage = 0;
      events.push({ type: "arrived", threat, definition });
    }

    if (threat.state === "eating") {
      const duration = Math.max(1, threat.actionEndsAt - threat.actionStartedAt);
      const progress = Math.min(0.999, Math.max(0, (now - threat.actionStartedAt) / duration));
      const biteStage = Math.min(3, Math.floor(progress * 4));
      if (biteStage !== threat.biteStage) {
        threat.biteStage = biteStage;
        events.push({ type: "bite-progress", threat, definition, biteStage });
      }
    }

    if (["eating", "stealing"].includes(threat.state) && now >= threat.actionEndsAt) {
      const result = applyThreatDamage(state, threat);
      threat.state = "celebrating";
      threat.resolved = true;
      threat.celebrateEndsAt = now + GAME_CONFIG.threats.celebrateDurationMs;
      threat.despawnAt = 0;
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
  const candidates = unoccupied;
  if (planted.length === 0) return { spawned: false, reason: "no-target" };
  if (candidates.length === 0) return { spawned: false, reason: "all-targets-busy" };

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
  const spawnEdge = ["top", "right", "bottom", "left"][
    Math.floor(random() * 4) % 4
  ];
  const spawnLane = 0.12 + Math.min(0.76, Math.max(0, random() * 0.76));
  const targetLane = Math.min(0.92, Math.max(0.08, (target.column + 0.5) / 3));
  const attackSide = spawnEdge === "left"
    ? -1
    : spawnEdge === "right"
      ? 1
      : spawnLane <= targetLane
        ? -1
        : 1;
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
    actionStartedAt: 0,
    actionEndsAt: 0,
    biteStage: 0,
    hitEndsAt: 0,
    defeatedAt: 0,
    knockedOutAt: 0,
    reviveAt: 0,
    celebrateEndsAt: 0,
    retreatStartedAt: 0,
    retreatEndsAt: 0,
    retreatFromProgress: 0,
    despawnAt: 0,
    spawnEdge,
    spawnLane,
    attackSide,
    rewardGranted: false,
    resolved: false,
  };
  state.threats.push(threat);
  return { spawned: true, threat, definition };
}

export function hitThreat(state, threatId, now = Date.now()) {
  if (!["day", "night"].includes(state.turn?.phase)) {
    return { ok: false, reason: "turn-not-active" };
  }
  const threat = (state.threats ?? []).find(
    (candidate) => candidate.threatId === threatId
  );
  if (!threat) return { ok: false, reason: "no-threat" };
  if (threat.resolved || ["defeated", "celebrating", "despawning"].includes(threat.state)) {
    return { ok: false, reason: "already-defeated" };
  }

  const definition = getThreatDefinitionById(threat.type);
  if (!definition) return { ok: false, reason: "no-threat" };
  const hammerResult = consumeHammerUse(state);
  if (!hammerResult.ok) return hammerResult;
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
      hammerResult,
    };
  }

  threat.state = "defeated";
  threat.resumeState = null;
  threat.defeatedAt = now;
  threat.knockedOutAt = 0;
  threat.reviveAt = 0;
  threat.celebrateEndsAt = 0;
  threat.despawnAt = now + GAME_CONFIG.threats.defeatedDisplayMs;
  threat.rewardGranted = true;
  threat.resolved = true;
  const bountyCoins = toSafeNonNegativeNumber(definition.bountyCoins);
  const playerResult = grantPlayerXp(state, GAME_CONFIG.player.threatRepelXp);
  state.bounties.pendingCoins = addSafeNumbers(state.bounties.pendingCoins, bountyCoins);
  if (state.turn.stats) {
    const countKey = definition.id === "thief" ? "thievesDefeated" : "animalsDefeated";
    state.turn.stats[countKey] = addSafeNumbers(state.turn.stats[countKey], 1);
    state.turn.stats.bountyCoins = addSafeNumbers(state.turn.stats.bountyCoins, bountyCoins);
  }
  return {
    ok: true,
    threat,
    definition,
    damage,
    health: 0,
    maxHealth: threat.maxHealth,
    defeated: true,
    playerResult,
    bountyCoins,
    hammerResult,
  };
}

export function claimTownBounty(state) {
  const bountyCoins = toSafeNonNegativeNumber(state.bounties?.pendingCoins);
  if (bountyCoins <= 0) return { ok: false, reason: "no-bounty" };
  state.coins = addSafeNumbers(state.coins, bountyCoins);
  state.totalEarned = addSafeNumbers(state.totalEarned, bountyCoins);
  state.bounties.claimedCoins = addSafeNumbers(state.bounties.claimedCoins, bountyCoins);
  state.bounties.pendingCoins = 0;
  return { ok: true, bountyCoins };
}

export function repelThreat(state, plotId = null, now = Date.now()) {
  const threat = (state.threats ?? []).find(
    (candidate) => !plotId || candidate.targetPlotId === plotId
  );
  return threat
    ? hitThreat(state, threat.threatId, now)
    : { ok: false, reason: "no-threat" };
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
    const report = {
      day: state.turn.day,
      ...(state.turn.stats ?? {}),
    };
    state.turn.phase = "preparation";
    state.turn.phaseStartedAt = at;
    state.turn.phaseEndsAt = null;
    state.turn.lastEffectAt = at;
    state.turn.nextThreatAt = null;
    state.turn.lastCompletedDay = state.turn.day;
    state.turn.lastReport = report;
    state.threats = [];
    return { changed: true, from: previous, to: "preparation", at, report };
  }

  return { changed: false, from: previous, to: previous, at };
}

export function startNextDay(state, now = Date.now()) {
  if (state.turn.phase !== "preparation") {
    return { ok: false, reason: "not-preparation" };
  }
  if (state.turn.lastCompletedDay >= state.turn.day) state.turn.day += 1;
  state.turn.phase = "day";
  state.turn.phaseStartedAt = now;
  state.turn.phaseEndsAt = now + GAME_CONFIG.turn.dayDurationMs;
  state.turn.lastEffectAt = now;
  state.turn.nextThreatAt = now + GAME_CONFIG.threats.dayIntervalMs;
  state.turn.stats = {
    harvestedCucumbers: 0,
    cropXp: 0,
    playerXp: 0,
    animalsDefeated: 0,
    thievesDefeated: 0,
    bountyCoins: 0,
  };
  return { ok: true, day: state.turn.day };
}

export function pauseTurnClock(state, pausedFor) {
  const offset = Math.max(0, toSafeNonNegativeNumber(pausedFor));
  if (offset <= 0) return 0;
  const shift = (value) => Number.isFinite(value) && value > 0 ? value + offset : value;
  (state.facilities ?? []).forEach((facility) => {
    if (facility.type !== "generator") return;
    facility.generatorStartedAt = shift(facility.generatorStartedAt);
    facility.generatorEndsAt = shift(facility.generatorEndsAt);
  });
  if (state.turn.phase === "preparation") return offset;
  state.turn.phaseStartedAt = shift(state.turn.phaseStartedAt);
  state.turn.phaseEndsAt = shift(state.turn.phaseEndsAt);
  state.turn.lastEffectAt = shift(state.turn.lastEffectAt);
  state.turn.nextThreatAt = shift(state.turn.nextThreatAt);
  (state.threats ?? []).forEach((threat) => {
    [
      "spawnedAt",
      "approachEndsAt",
      "actionStartedAt",
      "actionEndsAt",
      "hitEndsAt",
      "defeatedAt",
      "knockedOutAt",
      "reviveAt",
      "celebrateEndsAt",
      "retreatStartedAt",
      "retreatEndsAt",
      "deliveredAt",
      "despawnAt",
    ].forEach((key) => {
      threat[key] = shift(threat[key]);
    });
  });
  return offset;
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
  { random = Math.random } = {}
) {
  const safeNow = Math.max(0, toSafeNonNegativeNumber(now));
  const startedAt = Math.min(safeNow, state.turn.lastEffectAt);
  const allocations = [];
  const transitions = [];
  const expiredThreats = [];
  const threatEvents = [];
  const generatorResult = completeGeneratorCycles(state, safeNow);
  let generatedEnergy = generatorResult.generatedEnergy;
  let growthGained = 0;
  let safety = 0;

  while (state.turn.phase !== "preparation" && safety < 10_000) {
    safety += 1;
    const phaseEnd = state.turn.phaseEndsAt ?? safeNow;
    const target = Math.min(safeNow, phaseEnd);

    while (state.turn.lastEffectAt + 1_000 <= target && safety < 10_000) {
      safety += 1;
      state.turn.lastEffectAt += 1_000;
      const growth =
        state.turn.phase === "day"
          ? applyDayGrowthSecond(state, state.turn.lastEffectAt)
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

  if (state.turn.phase === "preparation") {
    state.threats = [];
  } else {
    const finalThreatAdvance = advanceThreatStates(state, safeNow);
    expiredThreats.push(...finalThreatAdvance.damages);
    threatEvents.push(...finalThreatAdvance.events);
  }
  let threatResult = null;
  if (
    state.turn.phase !== "preparation" &&
    safeNow >= toSafeNonNegativeNumber(state.turn.nextThreatAt, safeNow)
  ) {
    threatResult = spawnThreat(state, safeNow, random);
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
    completedGenerators: generatorResult.completed,
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
