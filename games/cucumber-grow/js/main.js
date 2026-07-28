import { GAME_CONFIG } from "./game-config.js";
import {
  GameEngine,
  collectTouch,
  harvestCucumber,
  purchaseFacility,
  synchronizeDerivedState,
} from "./game-engine.js";
import { applyOfflineReward } from "./offline-reward.js";
import { clearGameSave, loadGameSave, saveGame } from "./save-manager.js";
import { createInitialGameState } from "./game-state.js";
import { formatExactNumber } from "./number-format.js";
import { UIRenderer } from "./ui-renderer.js?v=20260728-04";

const loadResult = loadGameSave();
const state = loadResult.state;
const ui = new UIRenderer();
let deferredSaveTimer = null;
let isResetting = false;
let isHarvesting = false;
let lastKeyboardWaterAt = 0;

synchronizeDerivedState(state);

function reportSaveResult(result) {
  if (!result.ok) {
    ui.setSaveStatus("저장 사용 불가", "error");
    return;
  }

  const time = new Date(result.savedAt).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  ui.setSaveStatus(`${time} 저장됨`);
}

function persistNow() {
  if (isResetting) return;

  window.clearTimeout(deferredSaveTimer);
  deferredSaveTimer = null;
  reportSaveResult(saveGame(state));
}

function scheduleSave() {
  window.clearTimeout(deferredSaveTimer);
  deferredSaveTimer = window.setTimeout(persistNow, 450);
}

function handleGrowthChange(result) {
  if (result?.becameHarvestReady) {
    ui.showHarvestReady();
    ui.announce("어른오이가 모두 자라 수확할 수 있습니다.");
    return;
  }

  if (result?.stageChanged) {
    ui.showStageUp(result.stage);
    ui.announce(`성장 단계가 ${result.stage.name}(으)로 올랐습니다.`);
  }
}

const engine = new GameEngine({
  state,
  onUpdate(result) {
    ui.render(state);
    handleGrowthChange(result);
  },
});

function collectOfflineProgress() {
  const rewardResult = applyOfflineReward(state);
  const saveResult = saveGame(state);

  reportSaveResult(saveResult);
  ui.render(state);
  handleGrowthChange(rewardResult);

  if (rewardResult.reward > 0) {
    ui.showOfflineReward(rewardResult);
  }

  return rewardResult;
}

collectOfflineProgress();

if (loadResult.status === "recovered") {
  ui.setSaveStatus("손상 데이터 초기화", "error");
  ui.announce("저장 데이터를 읽을 수 없어 안전한 초기값으로 시작합니다.");
} else if (loadResult.status === "unavailable") {
  ui.setSaveStatus("저장 사용 불가", "error");
}

ui.render(state);
engine.start();

function waterCucumber(event) {
  engine.synchronize();
  const result = collectTouch(state);

  ui.render(state);
  if (result.gained > 0) {
    ui.renderWatering(result.gained, event);
  }
  handleGrowthChange(result);
  scheduleSave();
}

ui.elements.characterButton.addEventListener("pointerdown", (event) => {
  if (event.pointerType === "mouse" && event.button !== 0) return;

  event.preventDefault();
  waterCucumber(event);
});

ui.elements.characterButton.addEventListener("keydown", (event) => {
  if ((event.key !== "Enter" && event.key !== " ") || event.repeat) return;

  event.preventDefault();
  lastKeyboardWaterAt = Date.now();
  waterCucumber(event);
});

ui.elements.characterButton.addEventListener("click", (event) => {
  if (event.detail !== 0 || Date.now() - lastKeyboardWaterAt < 700) return;

  waterCucumber(event);
});

ui.elements.harvestButton.addEventListener("click", () => {
  if (isHarvesting) return;

  isHarvesting = true;
  engine.synchronize();
  const result = harvestCucumber(state);

  if (!result.harvested) {
    ui.render(state);
    ui.announce("아직 수확할 수 없습니다.");
    isHarvesting = false;
    return;
  }

  ui.render(state);
  ui.showHarvestReward(result.reward);
  ui.announce(
    `수확을 완료해 오이 ${formatExactNumber(result.reward)}개를 획득했습니다.`
  );
  persistNow();
  isHarvesting = false;
});

ui.elements.facilityList.addEventListener("click", (event) => {
  const button = event.target.closest('[data-action="buy"]');

  if (!button) return;

  const card = button.closest("[data-facility-id]");
  const facilityId = card?.dataset.facilityId;

  engine.synchronize();
  const result = purchaseFacility(state, facilityId);

  if (!result.purchased) {
    if (result.reason === "insufficient") {
      ui.announce(
        `오이가 부족합니다. ${formatExactNumber(result.price)}개가 필요합니다.`
      );
    }
    ui.render(state);
    return;
  }

  ui.render(state);
  ui.announce(
    `${result.facility.name}을(를) 구매했습니다. 현재 ${formatExactNumber(
      result.owned
    )}개입니다.`
  );
  handleGrowthChange(result);
  persistNow();
});

document.querySelector("#resetButton").addEventListener("click", () => {
  const confirmed = window.confirm(
    "오이키우기 데이터를 모두 초기화할까요?\n이 게임의 로컬 저장 데이터만 삭제됩니다."
  );

  if (!confirmed) return;

  isResetting = true;
  engine.pause();
  window.clearTimeout(deferredSaveTimer);

  if (!clearGameSave()) {
    isResetting = false;
    ui.setSaveStatus("초기화 실패", "error");
    ui.announce("로컬 저장 데이터 초기화에 실패했습니다.");
    engine.resume();
    return;
  }

  Object.assign(state, createInitialGameState());
  synchronizeDerivedState(state);
  ui.hideOfflineReward();
  ui.render(state);
  isResetting = false;
  reportSaveResult(saveGame(state));
  ui.announce("오이키우기 데이터가 초기화되었습니다.");
  engine.resume();
});

window.setInterval(() => {
  if (document.hidden) return;

  engine.synchronize();
  persistNow();
}, GAME_CONFIG.autosaveIntervalMs);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    engine.pause();
    persistNow();
    return;
  }

  collectOfflineProgress();
  engine.resume();
});

window.addEventListener("pagehide", () => {
  engine.pause();
  persistNow();
});

window.addEventListener("pageshow", (event) => {
  if (!event.persisted || document.hidden || engine.isRunning) return;

  collectOfflineProgress();
  engine.resume();
});

window.addEventListener("beforeunload", () => {
  engine.pause();
  persistNow();
});
