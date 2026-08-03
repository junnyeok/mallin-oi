import { GAME_CONFIG } from "./game-config.js";
import { advanceGameTime } from "./turn-engine.js";
import { toSafeNonNegativeNumber } from "./number-format.js";

export function calculateOfflineReward(state, now = Date.now()) {
  const safeNow = toSafeNonNegativeNumber(now);
  const lastSavedAt = toSafeNonNegativeNumber(state.lastSavedAt, safeNow);
  const rawElapsedMs = safeNow - lastSavedAt;
  const elapsedSeconds = Math.min(
    GAME_CONFIG.maxOfflineSeconds,
    Math.floor(Math.max(0, rawElapsedMs) / 1_000)
  );
  return {
    elapsedSeconds,
    effectiveNow: Math.min(safeNow, lastSavedAt + elapsedSeconds * 1_000),
    clockMovedBackward: rawElapsedMs < -GAME_CONFIG.maximumClockSkewMs,
  };
}

export function applyOfflineReward(state, now = Date.now()) {
  const calculation = calculateOfflineReward(state, now);
  const progress = advanceGameTime(state, calculation.effectiveNow, {
    offline: true,
  });
  // 준비 단계는 그대로 유지하며 같은 구간이 다시 처리되지 않게 실제 현재 시각으로 전진한다.
  state.lastSavedAt = toSafeNonNegativeNumber(now, state.lastSavedAt);
  return {
    ...calculation,
    ...progress,
    reward: progress.growthGained,
    gained: progress.growthGained,
  };
}
