import { GAME_CONFIG } from "./game-config.js";
import {
  buyConsumable,
  buySeed,
  getPlayerLevel,
  harvestCrop,
  plantCrop,
  purchaseGarden,
  reloadWateringCan,
  sellCucumbers,
  synchronizeDerivedState,
  useWateringCan,
} from "./game-engine.js";
import {
  buyFacility,
  getFacilityDefinition,
  placeFacility,
  startGeneratorCycle,
} from "./facility-engine.js";
import {
  advanceGameTime,
  claimTownBounty,
  hitThreat,
  pauseTurnClock,
  retreatThreatsFromPlot,
  startNextDay,
} from "./turn-engine.js";
import { GameSaveRepository, createStorageBackend } from "./save-repository.js";
import { GameAudioManager } from "./audio-manager.js";
import { NativeBridge } from "./native-bridge.js";
import { GameUI, getReasonMessage } from "./ui-renderer.js";
import { WorldCameraController } from "./world-camera.js";

function getBrowserStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

function formatBackupDate(date = new Date()) {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((value) => String(value).padStart(2, "0"))
    .join("");
}

const ui = new GameUI(document);
ui.setLoadingProgress(12, "저장된 농장을 찾고 있어요…");

const nativeBridge = new NativeBridge();
await nativeBridge.initialize();
ui.setLoadingProgress(30, "안전한 저장 공간을 여는 중…");

const browserStorage = getBrowserStorage();
const repository = new GameSaveRepository({
  backend: createStorageBackend({
    preferencesPlugin: nativeBridge.preferences,
    browserStorage,
  }),
  legacyStorage: browserStorage,
});

const loadedAt = Date.now();
const loadResult = await repository.load(loadedAt);
let state = loadResult.state;
pauseTurnClock(state, Math.max(0, loadedAt - state.lastSavedAt));
synchronizeDerivedState(state);

const audio = new GameAudioManager(state.settings);
audio.preload();
audio.setBgmMode(state.turn.phase === "preparation" ? "preparation" : state.turn.phase);
ui.setLoadingProgress(62, "오이와 시설을 배치하는 중…");
ui.render(state, { now: loadedAt, renderMenus: true });

let tickTimer = null;
let autosaveTimer = null;
let started = false;
let runtimeActive = false;
let resumePromise = null;
let lastPhase = state.turn.phase;
let interactionPauseStartedAt = null;
let appPauseStartedAt = null;

function shiftTimestamp(value, offset) {
  return Number.isFinite(value) && value > 0 ? value + offset : value;
}

function resumeInteractionClock(now) {
  if (interactionPauseStartedAt === null) return;
  const pausedFor = Math.max(0, now - interactionPauseStartedAt);
  interactionPauseStartedAt = null;
  if (pausedFor <= 0) return;
  state.turn.phaseStartedAt = shiftTimestamp(state.turn.phaseStartedAt, pausedFor);
  state.turn.phaseEndsAt = shiftTimestamp(state.turn.phaseEndsAt, pausedFor);
  state.turn.lastEffectAt = shiftTimestamp(state.turn.lastEffectAt, pausedFor);
  state.turn.nextThreatAt = shiftTimestamp(state.turn.nextThreatAt, pausedFor);
  state.threats.forEach((threat) => {
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
      threat[key] = shiftTimestamp(threat[key], pausedFor);
    });
  });
  (state.facilities ?? []).forEach((facility) => {
    if (facility.type !== "generator") return;
    facility.generatorStartedAt = shiftTimestamp(facility.generatorStartedAt, pausedFor);
    facility.generatorEndsAt = shiftTimestamp(facility.generatorEndsAt, pausedFor);
  });
}

async function flushState({ announceFailure = true } = {}) {
  const result = await repository.flush(state);
  if (!result.ok && announceFailure) {
    ui.setSaveError("진행을 저장하지 못했습니다. 설정에서 백업을 내보내 주세요.");
  } else if (result.ok) {
    state.lastSavedAt = result.savedAt;
    ui.setSaveError("");
  }
  return result;
}

function queueSave() {
  repository.requestSave(state);
}

function showFailure(reason, context = {}, plotId = null) {
  const message = getReasonMessage(reason, context);
  ui.showToast(message);
  if (plotId) ui.playPlotFeedback(plotId, "error");
  audio.play("failure", { minimumGapMs: 180 });
  void nativeBridge.haptic("error", state.settings.hapticsEnabled);
}

function renderAction({ message = "", sound = "button", haptic = "light", plotId = null, feedback = "success", xp = 0 } = {}) {
  synchronizeDerivedState(state);
  ui.render(state, { renderMenus: true });
  if (plotId) ui.playPlotFeedback(plotId, feedback, xp);
  if (message) ui.showToast(message);
  audio.play(sound);
  void nativeBridge.haptic(haptic, state.settings.hapticsEnabled);
  queueSave();
  camera?.refreshBounds();
}

function showProgressResult(previousLevel, actionResult, fallback = null) {
  const currentLevel = getPlayerLevel(state.playerXp);
  if (currentLevel > previousLevel) {
    audio.play("levelUp", { minimumGapMs: 300 });
    void nativeBridge.haptic("success", state.settings.hapticsEnabled);
    ui.showToast(`레벨 ${currentLevel} 달성!`);
    return;
  }
  if (actionResult?.stageChanged) {
    audio.play(actionResult.stage.id === "young" ? "grow" : "evolve", { minimumGapMs: 250 });
  }
}

function handleWaterTankReload() {
  const result = reloadWateringCan(state);
  if (!result.ok) {
    showFailure(result.reason);
    return;
  }
  renderAction({ sound: "reload", haptic: "medium" });
}

function handleStartNextDay() {
  const result = startNextDay(state);
  if (!result.ok) {
    showFailure(result.reason);
    return;
  }
  renderAction({ sound: "day", haptic: "success" });
  audio.setBgmMode("day");
  ui.showPhaseBanner("day", result.day);
}

function handleWorldTap(target, pointerEvent = null) {
  if (target?.closest?.("#waterTankButton")) {
    pointerEvent?.preventDefault?.();
    handleWaterTankReload();
    return;
  }
  if (target?.closest?.("#nextDayButton")) {
    pointerEvent?.preventDefault?.();
    handleStartNextDay();
    return;
  }
  if (target?.closest?.("#townGateButton")) {
    pointerEvent?.preventDefault?.();
    ui.openScene("village", ui.elements.townGateButton);
    return;
  }
  const generatorButton = target?.closest?.("[data-generator-action]");
  if (generatorButton) {
    pointerEvent?.preventDefault?.();
    pointerEvent?.stopPropagation?.();
    const result = startGeneratorCycle(state, generatorButton.dataset.generatorAction, Date.now());
    if (!result.ok) {
      showFailure(result.reason);
      return;
    }
    renderAction({ sound: "button", haptic: "medium" });
    return;
  }
  const threatButton = target?.closest?.("[data-threat-action]");
  if (threatButton) {
    pointerEvent?.preventDefault?.();
    pointerEvent?.stopPropagation?.();
    const threatId = threatButton.dataset.threatAction;
    const previousLevel = getPlayerLevel(state.playerXp);
    const result = hitThreat(state, threatId);
    if (!result.ok) {
      if (result.reason !== "already-defeated") showFailure(result.reason);
      return;
    }
    audio.play("hammerSwing", { minimumGapMs: 28 });
    synchronizeDerivedState(state);
    ui.render(state, { renderMenus: false });
    ui.playThreatHit(threatId, {
      clientX: pointerEvent?.clientX,
      clientY: pointerEvent?.clientY,
      defeated: result.defeated,
    });
    audio.play("hammerHit", { minimumGapMs: 24 });
    void nativeBridge.haptic("light", state.settings.hapticsEnabled);
    queueSave();
    if (result.defeated) {
      audio.play(result.definition.defeatSound, { minimumGapMs: 120 });
      showProgressResult(previousLevel, result);
    }
    return;
  }

  const button = target?.closest?.("[data-plot-action]");
  if (!button) return;
  const plotId = button.dataset.plotAction;
  const plot = state.plots.find((candidate) => candidate.plotId === plotId);
  if (!plot) return;
  const previousLevel = getPlayerLevel(state.playerXp);
  const facilityDefinition = getFacilityDefinition(ui.placementFacilityId);

  if (facilityDefinition) {
    const result = placeFacility(
      state,
      facilityDefinition.id,
      plot.row,
      plot.column
    );
    if (!result.ok) {
      showFailure(result.reason, {}, plotId);
      return;
    }
    ui.setFacilityPlacement(null);
    renderAction({
      message: `${facilityDefinition.name} 설치 완료!`,
      sound: "install",
      haptic: "success",
      plotId,
    });
    showProgressResult(previousLevel, result, `${facilityDefinition.name}을 설치했습니다.`);
    return;
  }

  if (!plot.crop.isPlanted) {
    ui.playPlotFeedback(plotId, "error");
    return;
  }

  if (plot.crop.cropXp >= GAME_CONFIG.crops.harvestExperience) {
    const result = harvestCrop(state, plotId, Date.now());
    if (!result.ok) {
      showFailure(result.reason, {}, plotId);
      return;
    }
    retreatThreatsFromPlot(state, plotId, Date.now());
    renderAction({
      sound: "harvest",
      haptic: "success",
      plotId,
    });
    ui.playHarvestReward(plotId, result.harvested);
    showProgressResult(previousLevel, result);
    return;
  }

  const result = useWateringCan(state, plotId);
  if (!result.ok) {
    showFailure(result.reason, {}, plotId);
    return;
  }
  renderAction({
    sound: "water",
    haptic: "light",
    plotId,
    feedback: "water",
    xp: result.gained,
  });
  showProgressResult(previousLevel, result);
}

const camera = new WorldCameraController({
  viewport: ui.elements.gameApp.querySelector("#gardenWorld"),
  content: ui.elements.gameApp.querySelector("#worldCamera"),
  onTap: handleWorldTap,
  onCameraMove: () => ui.renderThreats(state, Date.now()),
  isInteractionBlocked: () => ui.isInteractionBlocked(),
});
camera.mount();

let activeSeedPointerId = null;

ui.elements.toolTray.addEventListener("pointerdown", (event) => {
  const seed = event.target.closest("[data-seed-drag]");
  if (!seed || seed.disabled || activeSeedPointerId !== null) return;
  const variety = GAME_CONFIG.crops.varieties[seed.dataset.seedDrag];
  if (!variety) return;
  event.preventDefault();
  event.stopPropagation();
  activeSeedPointerId = event.pointerId;
  seed.setPointerCapture?.(event.pointerId);
  ui.beginSeedDrag(variety.id, variety.stageAssets.sprout, event.clientX, event.clientY);
  void nativeBridge.haptic("light", state.settings.hapticsEnabled);
}, { capture: true });

globalThis.addEventListener("pointermove", (event) => {
  if (event.pointerId === activeSeedPointerId) {
    event.preventDefault();
    ui.moveSeedDrag(event.clientX, event.clientY);
  }
}, { passive: false });

function finishPointerDrag(event, cancelled = false) {
  if (event.pointerId === activeSeedPointerId) {
    const drop = cancelled ? (ui.cancelSeedDrag(), null) : ui.finishSeedDrag();
    activeSeedPointerId = null;
    if (drop?.plotId) {
      const result = plantCrop(state, drop.plotId, drop.varietyId);
      if (!result.ok) showFailure(result.reason, {}, drop.plotId);
      else renderAction({ sound: "plant", haptic: "light", plotId: drop.plotId });
    }
  }
}

globalThis.addEventListener("pointerup", (event) => finishPointerDrag(event));
globalThis.addEventListener("pointercancel", (event) => finishPointerDrag(event, true));
globalThis.addEventListener("gameappinactive", () => {
  ui.cancelSeedDrag();
  activeSeedPointerId = null;
});

function handleTick() {
  const now = Date.now();
  if (ui.shouldPauseGameClock()) {
    if (interactionPauseStartedAt === null) interactionPauseStartedAt = now;
    return;
  }
  resumeInteractionClock(now);
  const result = advanceGameTime(state, now);
  result.expiredThreats.forEach(({ threat, result: damage }) => {
    if (damage.damaged) ui.markCropLoss(threat.targetPlotId, damage.kind, now);
  });
  synchronizeDerivedState(state);
  ui.render(state, { now, renderMenus: false });

  if (result.threatResult?.spawned) {
    ui.announce(`${result.threatResult.definition.name} 등장`);
    if (!result.threatResult.definition.isSilent && result.threatResult.definition.approachSound) {
      audio.play(result.threatResult.definition.approachSound, { minimumGapMs: 500 });
    }
    void nativeBridge.haptic("warning", state.settings.hapticsEnabled);
  } else if (result.threatResult?.reason === "scarecrow-protected") {
    ui.announce("허수아비가 위협을 막았습니다");
  }

  result.expiredThreats.forEach(({ threat, result: damage }) => {
    if (!damage.damaged) return;
    ui.playPlotDamage(threat.targetPlotId, damage.amount, damage.kind);
    audio.play("damage", { minimumGapMs: 350 });
    void nativeBridge.haptic("error", state.settings.hapticsEnabled);
    queueSave();
  });

  result.threatEvents
    .filter((event) => event.type === "arrived")
    .forEach((event) => {
      audio.play(event.definition.eatingSound, { minimumGapMs: 420 });
    });

  if (result.completedGenerators?.length) {
    audio.play("coin", { minimumGapMs: 250 });
    void nativeBridge.haptic("success", state.settings.hapticsEnabled);
    queueSave();
  }

  if (lastPhase !== state.turn.phase) {
    lastPhase = state.turn.phase;
    const isNight = state.turn.phase === "night";
    audio.setBgmMode(state.turn.phase === "preparation" ? "preparation" : state.turn.phase);
    audio.play(isNight ? "night" : "day", { minimumGapMs: 400 });
    void nativeBridge.haptic("medium", state.settings.hapticsEnabled);
    if (isNight || state.turn.phase === "day") {
      ui.showPhaseBanner(state.turn.phase, state.turn.day);
    } else if (state.turn.phase === "preparation") {
      const report = result.transitions.find((transition) => transition.to === "preparation")?.report
        ?? state.turn.lastReport;
      ui.showTurnReport(report);
    }
    queueSave();
  }
}

function startLoops() {
  if (!started || !runtimeActive || tickTimer !== null) return;
  tickTimer = globalThis.setInterval(handleTick, GAME_CONFIG.tickIntervalMs);
  autosaveTimer = globalThis.setInterval(
    () => void flushState({ announceFailure: false }),
    GAME_CONFIG.autosaveIntervalMs
  );
}

function stopLoops() {
  if (tickTimer !== null) globalThis.clearInterval(tickTimer);
  if (autosaveTimer !== null) globalThis.clearInterval(autosaveTimer);
  tickTimer = null;
  autosaveTimer = null;
}

async function suspendGame() {
  if (!runtimeActive) return;
  runtimeActive = false;
  appPauseStartedAt = Date.now();
  interactionPauseStartedAt = null;
  stopLoops();
  globalThis.dispatchEvent(new Event("gameappinactive"));
  audio.setActive(false);
  await flushState({ announceFailure: false });
}

async function resumeGame() {
  if (!started || runtimeActive) return;
  if (resumePromise) return resumePromise;
  resumePromise = (async () => {
    const now = Date.now();
    pauseTurnClock(state, Math.max(0, now - (appPauseStartedAt ?? now)));
    appPauseStartedAt = null;
    synchronizeDerivedState(state);
    runtimeActive = true;
    lastPhase = state.turn.phase;
    ui.render(state, { now, renderMenus: true });
    camera.refreshBounds();
    audio.setActive(true);
    startLoops();
    await flushState({ announceFailure: false });
  })().finally(() => {
    resumePromise = null;
  });
  return resumePromise;
}

ui.elements.toolTray.addEventListener("click", (event) => {
  const button = event.target.closest("[data-select-facility]");
  if (!button) return;
  const definition = getFacilityDefinition(button.dataset.selectFacility);
  if (definition?.placement === "terrace") {
    const previousLevel = getPlayerLevel(state.playerXp);
    const result = placeFacility(state, definition.id, -1, -1);
    if (!result.ok) {
      showFailure(result.reason);
      return;
    }
    ui.setFacilityPlacement(null);
    renderAction({ sound: "install", haptic: "success" });
    showProgressResult(previousLevel, result);
    return;
  }
  const nextFacility = ui.placementFacilityId === button.dataset.selectFacility
    ? null
    : button.dataset.selectFacility;
  ui.setFacilityPlacement(nextFacility);
  void nativeBridge.haptic("light", state.settings.hapticsEnabled);
});

ui.elements.bottomMenu.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scene]");
  if (!button) return;
  ui.openScene(button.dataset.scene, button);
});

ui.elements.menuButton.addEventListener("click", () => {
  ui.openScene("settings", ui.elements.menuButton);
});
ui.elements.sceneSettingsButton.addEventListener("click", () => {
  ui.openScene("settings", ui.elements.sceneSettingsButton);
});
ui.elements.sceneCloseButton.addEventListener("click", () => {
  ui.closeScene();
});

ui.elements.villagePoliceButton.addEventListener("click", () => {
  const result = claimTownBounty(state);
  if (!result.ok) {
    showFailure(result.reason);
    return;
  }
  renderAction({
    message: `경찰서 퇴치 보상금 ${result.bountyCoins}코인을 받았습니다.`,
    sound: "coin",
    haptic: "success",
  });
});

ui.elements.villageShopButton.addEventListener("click", () => {
  ui.openScene("shop", ui.elements.villageShopButton);
});

ui.elements.waterTankButton.addEventListener("click", (event) => {
  if (event.detail === 0) handleWaterTankReload();
});

ui.elements.townGateButton.addEventListener("click", (event) => {
  if (event.detail === 0) ui.openScene("village", ui.elements.townGateButton);
});

ui.elements.gardenPurchaseButton.addEventListener("click", () => {
  const result = purchaseGarden(state);
  if (!result.ok) {
    showFailure(result.reason, { maximum: result.maximum });
    return;
  }
  renderAction({ message: `${result.nextNumber}번째 텃밭을 열었습니다!`, sound: "purchase", haptic: "success" });
  camera.revealBottom();
});

ui.elements.sellAllButton.addEventListener("click", () => {
  const result = sellCucumbers(state);
  if (!result.ok) showFailure(result.reason);
  else renderAction({ message: `오이 ${result.sold}개를 팔아 ${result.earned}코인을 받았습니다.`, sound: "coin", haptic: "success" });
});

ui.elements.facilityShopList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-facility]");
  if (!button) return;
  const result = buyFacility(state, button.dataset.buyFacility);
  if (!result.ok) showFailure(result.reason);
  else renderAction({ message: `${result.definition.name}을 가방에 담았습니다.`, sound: "purchase", haptic: "success" });
});

ui.elements.consumableShopList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-consumable]");
  if (!button) return;
  const result = buyConsumable(state, button.dataset.buyConsumable);
  if (!result.ok) showFailure(result.reason);
  else renderAction({ message: `${result.item.name} 구매 완료!`, sound: "purchase", haptic: "success" });
});

ui.elements.seedShopList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-buy-seed]");
  if (!button) return;
  const result = buySeed(state, button.dataset.buySeed);
  if (!result.ok) showFailure(result.reason);
  else renderAction({ message: `${result.item.name} 구매 완료!`, sound: "purchase", haptic: "success" });
});

ui.elements.nextDayButton.addEventListener("click", (event) => {
  event.preventDefault();
  handleStartNextDay();
});

ui.elements.turnReportConfirmButton.addEventListener("click", () => {
  ui.hideTurnReport();
});
ui.elements.exitCancelButton.addEventListener("click", () => {
  ui.hideExitConfirm();
});
ui.elements.exitConfirmButton.addEventListener("click", async () => {
  await flushState({ announceFailure: false });
  const exited = await nativeBridge.exitApp();
  if (!exited) ui.hideExitConfirm();
});

function updateSettings() {
  state.settings = {
    bgmEnabled: ui.elements.bgmEnabled.checked,
    bgmVolume: Number(ui.elements.bgmVolume.value) / 100,
    sfxEnabled: ui.elements.sfxEnabled.checked,
    sfxVolume: Number(ui.elements.sfxVolume.value) / 100,
    hapticsEnabled: ui.elements.hapticsEnabled.checked,
    reducedMotion: ui.elements.reducedMotion.checked,
  };
  audio.setSettings(state.settings);
  ui.renderSettings(state);
  queueSave();
}

[
  ui.elements.bgmEnabled,
  ui.elements.bgmVolume,
  ui.elements.sfxEnabled,
  ui.elements.sfxVolume,
  ui.elements.hapticsEnabled,
  ui.elements.reducedMotion,
].forEach((input) => {
  input.addEventListener(input.type === "range" ? "input" : "change", updateSettings);
});

ui.elements.exportSaveButton.addEventListener("click", async () => {
  const backup = repository.exportState(state);
  const fileName = `mallinoi-cucumber-grow-${formatBackupDate()}.json`;
  const ok = await nativeBridge.shareBackup(backup, fileName);
  if (ok) {
    ui.showToast("진행 백업을 내보냈습니다.");
    audio.play("purchase");
  } else {
    showFailure("backup-failed");
  }
});

ui.elements.importSaveButton.addEventListener("click", () => {
  ui.elements.importSaveInput.value = "";
  ui.elements.importSaveInput.click();
});
ui.elements.importSaveInput.addEventListener("change", async () => {
  const file = ui.elements.importSaveInput.files?.[0];
  if (!file || file.size > 2_000_000) {
    showFailure("invalid-backup");
    return;
  }
  try {
    const imported = await repository.importState(await file.text());
    state = imported.state;
    synchronizeDerivedState(state);
    audio.setSettings(state.settings);
    ui.render(state, { renderMenus: true });
    camera.refreshBounds();
    ui.showToast("농장 백업을 복원했습니다.");
  } catch {
    showFailure("invalid-backup");
  }
});

ui.elements.supportUrlButton.addEventListener("click", async () => {
  const opened = await nativeBridge.openExternal("https://mallinoi.com/");
  if (!opened) showFailure("external-link-failed");
});

document.addEventListener("pointerdown", (event) => {
  const button = event.target.closest?.("button");
  if (!button || button.disabled) return;
  if (button.matches(".start-button, [data-plot-action], [data-threat-action], #waterTankButton")) return;
  audio.play("button", { minimumGapMs: 70 });
}, { capture: true });

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!ui.closeTopLayer()) ui.showExitConfirm();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") void suspendGame();
  else void resumeGame();
});
globalThis.addEventListener("pagehide", () => void suspendGame());

await nativeBridge.addAppStateListener(({ isActive }) => {
  if (isActive) void resumeGame();
  else void suspendGame();
});
await nativeBridge.addBackButtonListener(() => {
  if (!started) return;
  if (ui.closeTopLayer()) {
    return;
  }
  ui.showExitConfirm();
});
await nativeBridge.addNetworkListener(({ connected }) => {
  if (!connected) ui.showToast("오프라인으로 플레이 중입니다. 진행은 기기에 저장됩니다.");
  else ui.showToast("네트워크가 다시 연결됐습니다.");
});

const appInfo = await nativeBridge.getAppInfo();
ui.elements.appVersionLabel.textContent = `${appInfo.name ?? "오이키우기"} ${appInfo.version ?? "0.1.0"} (${appInfo.build ?? "1"})`;

await flushState({ announceFailure: false });
ui.setLoadingProgress(88, "효과음과 터치 조작을 준비하는 중…");
await nativeBridge.hideSplash();
ui.showStartButton();

ui.elements.startButton.addEventListener("click", async () => {
  if (started) return;
  started = true;
  runtimeActive = true;
  audio.setBgmMode("launch");
  await audio.unlock();
  audio.play("button", { minimumGapMs: 0 });
  await ui.hideStartScreen();
  startLoops();
  globalThis.setTimeout(() => {
    const mode = state.turn.phase === "preparation" ? "preparation" : state.turn.phase;
    audio.setBgmMode(mode);
    if (["day", "night"].includes(state.turn.phase)) {
      ui.showPhaseBanner(state.turn.phase, state.turn.day);
    }
  }, 620);
  if (
    loadResult.status === "migrated" ||
    loadResult.status === "recovered"
  ) {
    ui.showToast(
      loadResult.status === "migrated"
        ? "기존 농장 데이터를 새 앱 저장소로 옮겼습니다."
        : "복구 가능한 농장 데이터를 안전하게 열었습니다."
    );
  } else if (loadResult.recoveredFromBackup) {
    ui.showToast("손상된 최신 저장 대신 직전 정상 농장을 복구했습니다.");
  }
});
