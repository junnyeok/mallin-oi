import { GAME_CONFIG } from "./game-config.js";
import {
  GameEngine,
  collectTouch,
  findCropSlot,
  getGrowthProgress,
  harvestCucumber,
  plantCucumber,
  purchaseFirstGarden,
  synchronizeDerivedState,
} from "./game-engine.js";
import { applyOfflineReward } from "./offline-reward.js";
import { loadGameSave, saveGame } from "./save-manager.js";
import { formatExactNumber } from "./number-format.js";
import { UIRenderer } from "./ui-renderer.js?v=20260730-05";

const loadResult = loadGameSave();
const state = loadResult.state;
const ui = new UIRenderer();
const slotLocks = new Set();
const lastPointerInteractionAtBySlot = new Map();
let deferredSaveTimer = null;
let purchasePending = false;

synchronizeDerivedState(state);

function getSlotKey(plotId, slotId) {
  return `${plotId}\u0000${slotId}`;
}

function persistNow() {
  window.clearTimeout(deferredSaveTimer);
  deferredSaveTimer = null;
  saveGame(state);
}

function scheduleSave() {
  window.clearTimeout(deferredSaveTimer);
  deferredSaveTimer = window.setTimeout(persistNow, 450);
}

const engine = new GameEngine({
  state,
  onUpdate(result) {
    if (result?.reason === "production" && result.gained > 0) {
      ui.render(state);
      ui.showProductionXpGain(result.allocations);
    }
  },
});

function collectOfflineProgress() {
  const rewardResult = applyOfflineReward(state);

  saveGame(state);
  ui.render(state);

  if (rewardResult.gained > 0) {
    ui.showOfflineReward(rewardResult);
  }

  return rewardResult;
}

async function plantSlot(plotId, slotId) {
  const key = getSlotKey(plotId, slotId);

  if (slotLocks.has(key) || ui.isSlotTransitioning(plotId, slotId)) {
    return;
  }

  slotLocks.add(key);
  const result = plantCucumber(state, plotId, slotId);

  if (!result.planted) {
    slotLocks.delete(key);
    ui.render(state);
    return;
  }

  const transition = ui.playPlantTransition(
    plotId,
    slotId,
    result.stage
  );

  ui.render(state);
  ui.resetProductionXpGain(plotId, slotId);
  ui.announce("새싹을 심었습니다.");
  persistNow();

  try {
    await transition;
  } finally {
    slotLocks.delete(key);
    ui.render(state);
  }
}

function waterSlot(event, plotId, slotId) {
  const result = collectTouch(state, plotId, slotId);

  ui.render(state);
  if (result.gained > 0) {
    ui.renderWatering(event, plotId, slotId);
    ui.showXpGain(result.gained, {
      plotId,
      slotId,
      source: "watering",
    });
  }
  scheduleSave();
}

async function harvestSlot(plotId, slotId) {
  const key = getSlotKey(plotId, slotId);

  if (slotLocks.has(key) || ui.isSlotTransitioning(plotId, slotId)) {
    return;
  }

  slotLocks.add(key);
  const result = harvestCucumber(state, plotId, slotId);

  if (!result.harvested) {
    slotLocks.delete(key);
    ui.render(state);
    return;
  }

  const transition = ui.playHarvestTransition(plotId, slotId);

  ui.render(state);
  ui.resetProductionXpGain(plotId, slotId);
  ui.announce(
    `수확을 완료해 오이 ${formatExactNumber(result.reward)}개를 획득했습니다.`
  );
  persistNow();

  try {
    await transition;
  } finally {
    slotLocks.delete(key);
    ui.render(state);
  }
}

function interactWithSlot(event, plotId, slotId) {
  const key = getSlotKey(plotId, slotId);

  if (slotLocks.has(key) || ui.isSlotTransitioning(plotId, slotId)) {
    return;
  }

  engine.synchronize();
  const target = findCropSlot(state, plotId, slotId);

  if (!target) return;

  if (!target.slot.isPlanted) {
    void plantSlot(plotId, slotId);
    return;
  }

  if (getGrowthProgress(target.slot.xp).isHarvestReady) {
    void harvestSlot(plotId, slotId);
    return;
  }

  waterSlot(event, plotId, slotId);
}

function getSlotButton(event) {
  const button = event.target.closest?.(".crop-slot");

  return button && ui.elements.plotList.contains(button) ? button : null;
}

ui.elements.plotList.addEventListener("pointerdown", (event) => {
  const button = getSlotButton(event);

  if (!button) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (button.disabled) return;

  event.preventDefault();
  const { plotId, slotId } = button.dataset;
  const key = getSlotKey(plotId, slotId);

  lastPointerInteractionAtBySlot.set(key, Date.now());
  interactWithSlot(event, plotId, slotId);
});

ui.elements.plotList.addEventListener("click", (event) => {
  const button = getSlotButton(event);

  if (!button || button.disabled || event.detail !== 0) return;

  const { plotId, slotId } = button.dataset;
  const key = getSlotKey(plotId, slotId);

  if (Date.now() - (lastPointerInteractionAtBySlot.get(key) ?? 0) < 700) {
    return;
  }

  interactWithSlot(event, plotId, slotId);
});

function stopModalInput(event) {
  event.stopPropagation();
}

ui.elements.menuButton.addEventListener("pointerdown", stopModalInput);
ui.elements.menuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  ui.openMenu(event.currentTarget);
});
ui.elements.menuModal.addEventListener("pointerdown", stopModalInput);
ui.elements.menuModal.addEventListener("click", (event) => {
  event.stopPropagation();
  if (event.target === ui.elements.menuModal) ui.closeMenu();
});
ui.elements.menuCloseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  ui.closeMenu();
});
ui.elements.shopMenuButton.addEventListener("click", (event) => {
  event.stopPropagation();
  ui.showShopPanel();
});
ui.elements.shopBackButton.addEventListener("click", (event) => {
  event.stopPropagation();
  ui.showMenuPanel();
  ui.elements.shopMenuButton.focus();
});
ui.elements.gardenPurchaseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  if (purchasePending) return;

  purchasePending = true;
  ui.setPurchasePending(true);
  const result = purchaseFirstGarden(state);

  if (result.purchased) {
    persistNow();
    ui.render(state);
    ui.announce("첫 텃밭을 구매했습니다.");
  }

  purchasePending = false;
  ui.setPurchasePending(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape" || ui.elements.menuModal.hidden) return;

  event.preventDefault();
  ui.closeMenu();
});

ui.render(state);
collectOfflineProgress();

if (loadResult.status === "migrated") {
  ui.announce("기존 오이를 첫 번째 텃밭으로 안전하게 옮겼습니다.");
} else if (loadResult.status === "recovered") {
  ui.announce("저장 데이터를 읽을 수 없어 안전한 초기값으로 시작합니다.");
} else if (loadResult.status === "unavailable") {
  ui.announce("이 브라우저에서는 로컬 저장을 사용할 수 없습니다.");
}

engine.start();

window.setInterval(() => {
  if (document.hidden) return;

  engine.synchronize();
  persistNow();
}, GAME_CONFIG.autosaveIntervalMs);

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    ui.suspendTransientEffects();
    engine.pause();
    persistNow();
    return;
  }

  ui.resumeTransientEffects(state);
  collectOfflineProgress();
  engine.resume();
});

window.addEventListener("pagehide", () => {
  ui.suspendTransientEffects();
  engine.pause();
  persistNow();
});

window.addEventListener("pageshow", (event) => {
  if (!event.persisted || document.hidden || engine.isRunning) return;

  ui.resumeTransientEffects(state);
  collectOfflineProgress();
  engine.resume();
});

window.addEventListener("beforeunload", () => {
  ui.suspendTransientEffects();
  engine.pause();
  persistNow();
});
