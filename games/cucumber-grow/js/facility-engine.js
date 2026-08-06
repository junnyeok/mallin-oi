import { GAME_CONFIG } from "./game-config.js";
import {
  getNeighborPlots,
  getPlotAt,
  getRectanglePlots,
} from "./board-geometry.js";
import { getPlayerLevel, grantPlayerXp } from "./game-engine.js";
import { addSafeNumbers, toSafeCount, toSafeNonNegativeNumber } from "./number-format.js";

export function getFacilityDefinition(type) {
  return GAME_CONFIG.facilities.find((facility) => facility.id === type) ?? null;
}

export function getFacilityAffectedPlots(state, facilityOrType, anchor = null) {
  const type =
    typeof facilityOrType === "string" ? facilityOrType : facilityOrType?.type;
  const definition = getFacilityDefinition(type);
  const row = anchor?.row ?? facilityOrType?.row;
  const column = anchor?.column ?? facilityOrType?.column;
  if (!definition || definition.placement === "terrace") return [];
  if (!Number.isInteger(row) || !Number.isInteger(column)) return [];

  if (definition.placement === "rectangle") {
    return getRectanglePlots(
      state,
      row,
      column,
      definition.width,
      definition.height
    );
  }

  if (definition.range) {
    return getNeighborPlots(state, row, column, {
      range: definition.range,
      includeSelf: false,
    });
  }

  const anchorPlot = getPlotAt(state, row, column);
  return anchorPlot ? [anchorPlot] : [];
}

function getOccupiedPlotIds(state) {
  const occupied = new Set();

  (state.facilities ?? []).forEach((facility) => {
    const definition = getFacilityDefinition(facility.type);
    if (definition?.placement === "terrace") return;
    if (definition?.placement === "rectangle") {
      getFacilityAffectedPlots(state, facility).forEach((plot) => {
        occupied.add(plot.plotId);
      });
      return;
    }
    const anchor = getPlotAt(state, facility.row, facility.column);
    if (anchor) occupied.add(anchor.plotId);
  });
  return occupied;
}

export function validateFacilityPlacement(state, type, row, column) {
  const definition = getFacilityDefinition(type);
  if (!definition) return { ok: false, reason: "unknown-facility" };
  if (toSafeCount(state.inventory?.[type]) <= 0) {
    return { ok: false, reason: "not-owned", definition };
  }
  if (getPlayerLevel(state.playerXp) < definition.unlockLevel) {
    return { ok: false, reason: "level-locked", definition };
  }
  if (definition.placement === "terrace") {
    const installed = (state.facilities ?? []).find((facility) => facility.type === type);
    if (installed) return { ok: false, reason: "facility-conflict", definition };
    return { ok: true, definition, anchor: null, targets: [] };
  }
  const anchor = getPlotAt(state, row, column);
  if (!anchor) return { ok: false, reason: "invalid-anchor", definition };
  const occupiedPlotIds = getOccupiedPlotIds(state);

  if (definition.placement === "rectangle") {
    const targets = getFacilityAffectedPlots(state, type, { row, column });
    if (targets.length !== definition.width * definition.height) {
      return { ok: false, reason: "needs-six-contiguous-plots", definition };
    }
    if (targets.some((plot) => occupiedPlotIds.has(plot.plotId))) {
      return { ok: false, reason: "facility-conflict", definition, targets };
    }
    return { ok: true, definition, anchor, targets };
  }

  if (anchor.crop.isPlanted) {
    return { ok: false, reason: "empty-plot-required", definition, anchor };
  }
  if (occupiedPlotIds.has(anchor.plotId)) {
    return { ok: false, reason: "facility-conflict", definition, anchor };
  }
  return {
    ok: true,
    definition,
    anchor,
    targets: getFacilityAffectedPlots(state, type, { row, column }),
  };
}

export function placeFacility(state, type, row, column, now = Date.now()) {
  const validation = validateFacilityPlacement(state, type, row, column);
  if (!validation.ok) return validation;

  const sequence =
    (state.facilities ?? []).reduce((maximum, facility) => {
      const match = /-(\d+)$/.exec(facility.facilityId);
      return Math.max(maximum, Number(match?.[1]) || 0);
    }, 0) + 1;
  const facility = {
    facilityId: `facility-${sequence}`,
    type,
    row: validation.definition.placement === "terrace" ? -1 : row,
    column: validation.definition.placement === "terrace" ? -1 : column,
    active: type !== "generator",
    installedAt: now,
    generatorStartedAt: 0,
    generatorEndsAt: 0,
  };
  state.inventory[type] = Math.max(0, state.inventory[type] - 1);
  state.facilities.push(facility);
  const playerResult = grantPlayerXp(state, GAME_CONFIG.player.facilityInstallXp);
  return { ...validation, facility, playerResult };
}

export function buyFacility(state, type) {
  const definition = getFacilityDefinition(type);
  if (!definition) return { ok: false, reason: "unknown-facility" };
  if (getPlayerLevel(state.playerXp) < definition.unlockLevel) {
    return { ok: false, reason: "level-locked", definition };
  }
  if (state.coins < definition.price) {
    return { ok: false, reason: "not-enough-coins", definition };
  }

  state.coins -= definition.price;
  state.inventory[type] = toSafeCount(state.inventory[type]) + 1;
  return { ok: true, definition };
}

export function getFacilitiesCoveringPlot(state, plotId, type = null) {
  return (state.facilities ?? []).filter((facility) => {
    if (type && facility.type !== type) return false;
    return getFacilityAffectedPlots(state, facility).some(
      (plot) => plot.plotId === plotId
    );
  });
}

export function isPlotIndoors(state, plotId) {
  return getFacilitiesCoveringPlot(state, plotId, "greenhouse").length > 0;
}

export function getDaytimeProtectionChance(state, plotId) {
  return getFacilitiesCoveringPlot(state, plotId, "scarecrow").reduce(
    (highest, facility) =>
      Math.max(
        highest,
        getFacilityDefinition(facility.type)?.daytimeProtectionChance ?? 0
      ),
    0
  );
}

export function getGeneratorProgress(facility, now = Date.now()) {
  if (facility?.type !== "generator" || facility.active !== true) return 0;
  const startedAt = toSafeNonNegativeNumber(facility.generatorStartedAt);
  const endsAt = toSafeNonNegativeNumber(facility.generatorEndsAt);
  if (endsAt <= startedAt) return 0;
  return Math.min(100, Math.max(0, ((now - startedAt) / (endsAt - startedAt)) * 100));
}

export function startGeneratorCycle(state, facilityId, now = Date.now()) {
  completeGeneratorCycles(state, now);
  const facility = (state.facilities ?? []).find(
    (candidate) => candidate.facilityId === facilityId && candidate.type === "generator"
  );
  if (!facility) return { ok: false, reason: "unknown-facility" };
  const definition = getFacilityDefinition("generator");
  if (facility.active === true && facility.generatorEndsAt > now) {
    return { ok: false, reason: "generator-running", facility, definition };
  }
  if (state.resources.energy >= GAME_CONFIG.resources.maximumEnergy) {
    return { ok: false, reason: "energy-full", facility, definition };
  }
  if (state.resources.fuel < definition.fuelPerCycle) {
    return { ok: false, reason: "not-enough-fuel", facility, definition };
  }

  state.resources.fuel = Math.max(0, state.resources.fuel - definition.fuelPerCycle);
  facility.active = true;
  facility.generatorStartedAt = now;
  facility.generatorEndsAt = now + definition.cycleDurationMs;
  return { ok: true, facility, definition };
}

export function completeGeneratorCycles(state, now = Date.now()) {
  const completed = [];
  let generatedEnergy = 0;
  (state.facilities ?? [])
    .filter((facility) => facility.type === "generator" && facility.active === true)
    .forEach((facility) => {
      const endsAt = toSafeNonNegativeNumber(facility.generatorEndsAt);
      if (endsAt <= 0 || now < endsAt) return;
      const definition = getFacilityDefinition("generator");
      const capacity = Math.max(0, GAME_CONFIG.resources.maximumEnergy - state.resources.energy);
      const amount = Math.min(definition.energyPerCycle, capacity);
      state.resources.energy = addSafeNumbers(state.resources.energy, amount);
      generatedEnergy = addSafeNumbers(generatedEnergy, amount);
      facility.active = false;
      facility.generatorStartedAt = 0;
      facility.generatorEndsAt = 0;
      completed.push({ facility, amount, definition });
    });
  return { generatedEnergy, completed };
}

export function getFacilityStatus(state, facility, now = Date.now()) {
  const definition = getFacilityDefinition(facility.type);
  if (!definition) {
    return { active: false, reason: "꺼짐" };
  }
  if (facility.type === "generator") {
    if (facility.active === true && facility.generatorEndsAt > now) {
      return { active: true, reason: "발전 중", progress: getGeneratorProgress(facility, now) };
    }
    if (state.resources.energy >= GAME_CONFIG.resources.maximumEnergy) {
      return { active: false, reason: "에너지 가득 참", progress: 0 };
    }
    if (state.resources.fuel < definition.fuelPerCycle) {
      return { active: false, reason: "연료 부족", progress: 0 };
    }
    return { active: false, reason: "터치하여 발전", progress: 0 };
  }
  if (facility.active === false) return { active: false, reason: "꺼짐" };
  if (facility.type === "sprinkler") {
    if (state.turn.phase !== "day") return { active: false, reason: "낮에만 작동" };
    if (state.resources.water < definition.waterPerSecond) {
      return { active: false, reason: "물 부족" };
    }
  }
  if (facility.type === "greenhouse") {
    if (state.turn.phase !== "night") return { active: false, reason: "밤에 작동" };
    if (state.resources.energy < definition.energyPerSecond) {
      return { active: false, reason: "에너지 부족" };
    }
  }
  return { active: true, reason: "작동 중" };
}
