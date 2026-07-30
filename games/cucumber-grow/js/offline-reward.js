import { GAME_CONFIG } from "./game-config.js";
import {
  calculateProductionRate,
  distributeAutomaticExperience,
  getAllSlots,
  synchronizeDerivedState,
} from "./game-engine.js";
import { toSafeNonNegativeNumber } from "./number-format.js";

// 로컬 전용 MVP이므로 기기의 시각을 사용한다. 서버 연동 시에는 서버가 검증한
// 마지막 활동 시각과 시설 상태를 기준으로 다시 계산해야 한다.
export function calculateOfflineReward(state, now = Date.now()) {
  const safeNow = toSafeNonNegativeNumber(now);
  const lastSavedAt = toSafeNonNegativeNumber(state.lastSavedAt, safeNow);
  const elapsedSeconds = Math.min(
    Math.floor(Math.max(0, safeNow - lastSavedAt) / 1_000),
    GAME_CONFIG.maxOfflineSeconds
  );
  const productionRate = calculateProductionRate(state);
  const potentialExperience = Math.min(
    elapsedSeconds * productionRate,
    GAME_CONFIG.maxGameNumber
  );
  const remainingCapacity = getAllSlots(state).reduce(
    (total, { slot }) =>
      slot.isPlanted
        ? Math.min(
            GAME_CONFIG.maxGameNumber,
            total +
              Math.max(
                0,
                GAME_CONFIG.harvestExperience -
                  toSafeNonNegativeNumber(slot.xp)
              )
          )
        : total,
    0
  );
  const wholeAvailable = Math.floor(
    potentialExperience +
      (toSafeNonNegativeNumber(state.automaticXpRemainder) % 1)
  );
  const reward = Math.min(wholeAvailable, remainingCapacity);

  return {
    elapsedSeconds,
    productionRate,
    potentialExperience: Number.isFinite(potentialExperience)
      ? potentialExperience
      : 0,
    reward: Number.isFinite(reward) ? reward : 0,
  };
}

export function applyOfflineReward(state, now = Date.now()) {
  synchronizeDerivedState(state);
  const result = calculateOfflineReward(state, now);
  const distribution = distributeAutomaticExperience(
    state,
    result.potentialExperience
  );

  // 같은 경과 시간이 메모리에서 다시 지급되지 않도록 계산 시각을 즉시 전진한다.
  state.lastSavedAt = toSafeNonNegativeNumber(now, state.lastSavedAt);

  return {
    ...result,
    gained: distribution.gained,
    discarded: distribution.discarded,
    allocations: distribution.allocations,
    slotChanges: distribution.slotChanges,
  };
}
