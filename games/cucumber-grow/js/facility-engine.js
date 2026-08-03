import { GAME_CONFIG } from "./game-config.js";
import {
  getNeighborPlots,
  getPlotAt,
  getRectanglePlots,
} from "./board-geometry.js";
import { getPlayerLevel, grantPlayerXp } from "./game-engine.js";
import { toSafeCount } from "./number-format.js";

export function getFacilityDefinition(type) {
  return GAME_CONFIG.facilities.find((facility) => facility.id === type) ?? null;
}

export function getFacilityAffectedPlots(state, facilityOrType, anchor = null) {
  const type =
    typeof facilityOrType === "string" ? facilityOrType : facilityOrType?.type;
  const definition = getFacilityDefinition(type);
  const row = anchor?.row ?? facilityOrType?.row;
  const column = anchor?.column ?? facilityOrType?.column;
  if (!definition || !Number.isInteger(row) || !Number.isInteger(column)) return [];

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
    row,
    column,
    active: true,
    installedAt: now,
  };
  state.inventory[type] = Math.max(0, state.inventory[type] - 1);
  state.facilities.push(facility);
  const playerResult = grantPlayerXp(state, GAME_CONFIG.player.facilityInstallXp);
  return { ...validation, facility, playerResult };
}

export function buyFacility(state, type) {
  const definition = getFacilityDefinition(type);
  if (!definition) return { ok: false, reason: "unknown-facility" };
  if (state.turn?.phase !== "preparation") {
    return { ok: false, reason: "preparation-only", definition };
  }
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

export function getFacilityStatus(state, facility) {
  const definition = getFacilityDefinition(facility.type);
  if (!definition || facility.active === false) {
    return { active: false, reason: "꺼짐" };
  }
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
  if (facility.type === "generator") {
    if (state.resources.energy >= GAME_CONFIG.resources.maximumEnergy) {
      return { active: false, reason: "에너지 가득 참" };
    }
    if (state.resources.fuel < definition.fuelPerSecond) {
      return { active: false, reason: "연료 부족" };
    }
  }
  return { active: true, reason: "작동 중" };
}
