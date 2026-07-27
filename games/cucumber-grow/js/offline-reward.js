import { GAME_CONFIG } from "./game-config.js";
import { grantCucumbers, synchronizeDerivedState } from "./game-engine.js";
import { toSafeNonNegativeNumber } from "./number-format.js";

// MVP는 기기의 로컬 시각을 사용한다. 실제 앱에서는 서버 시각과 서버 검증으로
// 기기 시간 변경 및 저장 데이터 조작을 방어해야 한다.
export function calculateOfflineReward(state, now = Date.now()) {
  const safeNow = toSafeNonNegativeNumber(now);
  const lastSavedAt = toSafeNonNegativeNumber(state.lastSavedAt, safeNow);
  const elapsedSeconds = Math.min(
    Math.floor(Math.max(0, safeNow - lastSavedAt) / 1_000),
    GAME_CONFIG.maxOfflineSeconds
  );
  const productionRate = toSafeNonNegativeNumber(state.perSecond);
  const reward = Math.min(
    elapsedSeconds * productionRate,
    GAME_CONFIG.maxGameNumber
  );

  return {
    elapsedSeconds,
    productionRate,
    reward: Number.isFinite(reward) ? reward : 0,
  };
}

export function applyOfflineReward(state, now = Date.now()) {
  synchronizeDerivedState(state);
  const result = calculateOfflineReward(state, now);
  const growthResult = grantCucumbers(state, result.reward);

  // 계산 시각을 즉시 전진시켜 같은 경과 시간이 메모리에서 중복 지급되지 않게 한다.
  state.lastSavedAt = toSafeNonNegativeNumber(now, state.lastSavedAt);

  return {
    ...result,
    stage: growthResult.stage,
    stageChanged: growthResult.stageChanged,
    previousStageId: growthResult.previousStageId,
  };
}
