import { facilities, sleepingResidents, trees } from "./data";

export type GroundPosition = { x: number; z: number };

const PLAYER_RADIUS = 0.58;
const WORLD_RADIUS = 22.6;
const RIVER_LEFT = -7.45;
const RIVER_RIGHT = -2.95;
const BRIDGE_MIN_Z = 0.5;
const BRIDGE_MAX_Z = 3.1;
const MAX_MOVEMENT_STEP = 0.16;

function insideBox(
  x: number,
  z: number,
  centerX: number,
  centerZ: number,
  halfWidth: number,
  halfDepth: number,
) {
  return (
    Math.abs(x - centerX) < halfWidth + PLAYER_RADIUS &&
    Math.abs(z - centerZ) < halfDepth + PLAYER_RADIUS
  );
}

function isInsideWorld(x: number, z: number) {
  return Math.hypot(x, z) <= WORLD_RADIUS - PLAYER_RADIUS;
}

function isInRiver(x: number, z: number) {
  const insideRiverWidth =
    x > RIVER_LEFT - PLAYER_RADIUS && x < RIVER_RIGHT + PLAYER_RADIUS;
  const insideBridgeLane = z >= BRIDGE_MIN_Z && z <= BRIDGE_MAX_Z;
  return insideRiverWidth && !insideBridgeLane;
}

function hitsBuilding(x: number, z: number) {
  const hitsFacility = facilities.some((facility) => {
    const halfWidth = facility.id === "town-hall" ? 2.6 : 2.1;
    return insideBox(
      x,
      z,
      facility.position[0],
      facility.position[2],
      halfWidth,
      1.85,
    );
  });

  if (hitsFacility) return true;

  return sleepingResidents.some((resident) =>
    insideBox(x, z, resident.position[0], resident.position[2], 1.65, 1.5),
  );
}

function hitsTree(x: number, z: number) {
  return trees.some((tree) => {
    const trunkClearance = PLAYER_RADIUS + 0.62 * tree.scale;
    return Math.hypot(x - tree.position[0], z - tree.position[2]) < trunkClearance;
  });
}

function hitsFountain(x: number, z: number) {
  return Math.hypot(x, z) < 2.45 + PLAYER_RADIUS;
}

export function isWalkablePosition(x: number, z: number) {
  return (
    isInsideWorld(x, z) &&
    !isInRiver(x, z) &&
    !hitsBuilding(x, z) &&
    !hitsTree(x, z) &&
    !hitsFountain(x, z)
  );
}

export function moveWithWorldCollisions(
  current: GroundPosition,
  deltaX: number,
  deltaZ: number,
): GroundPosition & { collided: boolean } {
  const distance = Math.hypot(deltaX, deltaZ);
  const steps = Math.max(1, Math.ceil(distance / MAX_MOVEMENT_STEP));
  const stepX = deltaX / steps;
  const stepZ = deltaZ / steps;
  let x = current.x;
  let z = current.z;
  let collided = false;

  for (let index = 0; index < steps; index += 1) {
    if (isWalkablePosition(x + stepX, z)) {
      x += stepX;
    } else {
      collided = true;
    }

    if (isWalkablePosition(x, z + stepZ)) {
      z += stepZ;
    } else {
      collided = true;
    }
  }

  return { x, z, collided };
}

export const collisionDebug = {
  playerRadius: PLAYER_RADIUS,
  river: {
    left: RIVER_LEFT,
    right: RIVER_RIGHT,
    bridgeMinZ: BRIDGE_MIN_Z,
    bridgeMaxZ: BRIDGE_MAX_Z,
  },
};
