import { GAME_CONFIG, getThreatDefinitionById } from "./game-config.js";
import {
  canPurchaseGarden,
  getGrowthProgress,
  getMaximumPlotsForLevel,
  getPlayerProgress,
  getPlotHarvestYield,
  getPlotPrice,
} from "./game-engine.js";
import {
  getFacilityAffectedPlots,
  getFacilityDefinition,
  getFacilityStatus,
  isPlotIndoors,
  validateFacilityPlacement,
} from "./facility-engine.js";
import { getTurnRemainingMs } from "./turn-engine.js";
import { formatDuration, formatNumber } from "./number-format.js";
import { showXpGain } from "./xp-gain-effect.js";

const PHASE_LABELS = {
  day: "낮",
  night: "밤",
  preparation: "준비 시간",
};

export function getReasonMessage(reason, context = {}) {
  const messages = {
    "not-enough-water": "물이 부족합니다. 준비 시간에 물을 구매해 주세요.",
    "not-enough-coins": "코인이 부족합니다.",
    "empty-plot": "빈 텃밭입니다. 먼저 오이를 심어 주세요.",
    "harvest-ready": "다 자란 오이는 먼저 수확해 주세요.",
    "not-ready": "아직 수확할 수 없습니다.",
    "preparation-only": "구매와 판매는 준비 시간에만 할 수 있습니다.",
    "level-limit": `현재 레벨에는 텃밭을 ${context.maximum ?? "더"}개까지 설치할 수 있습니다.`,
    "maximum-plots": "현재 버전의 최대 텃밭 수에 도달했습니다.",
    "no-threat": "지금 내쫓을 새·짐승·도둑이 없습니다.",
    "already-defeated": "이미 쓰러진 위협입니다.",
    "facility-occupied": "시설이 있는 칸에는 오이를 심을 수 없습니다.",
    "not-owned": "먼저 준비 시간 상점에서 시설을 구매해 주세요.",
    "level-locked": "플레이어 레벨이 부족합니다.",
    "invalid-anchor": "시설을 놓을 수 없는 위치입니다.",
    "empty-plot-required": "이 시설은 오이가 없는 빈 텃밭에 놓아야 합니다.",
    "facility-conflict": "다른 시설과 범위가 겹칩니다.",
    "needs-six-contiguous-plots": "온실은 연속된 3열 × 2행 텃밭 6칸이 필요합니다.",
    "nothing-to-sell": "판매할 오이가 없습니다.",
    "backup-failed": "백업 파일을 내보내지 못했습니다.",
    "invalid-backup": "읽을 수 있는 오이키우기 백업 파일이 아닙니다.",
    "external-link-failed": "지원 페이지를 안전하게 열지 못했습니다.",
  };
  return messages[reason] ?? "요청을 처리할 수 없습니다.";
}

function formatTimer(milliseconds) {
  if (milliseconds === null) return "준비 중";
  const seconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(secondsPart).padStart(2, "0")}`;
}

function facilityDescription(definition) {
  if (definition.id === "sprinkler") return "주변 8칸 · 초당 1XP · 물 0.25";
  if (definition.id === "scarecrow") return "주변 8칸 · 낮 위협 70% 방어";
  if (definition.id === "greenhouse") return "3×2 여섯 칸 · 밤 성장 · 에너지 0.5/초";
  if (definition.id === "rainBarrel") return "준비 시간마다 물 18 충전";
  if (definition.id === "generator") return "연료 0.2/초 → 에너지 1/초";
  return "농장 시설";
}

export class GameUI {
  constructor(documentRoot = document) {
    this.document = documentRoot;
    this.plotViews = new Map();
    this.threatViews = new Map();
    this.currentState = null;
    this.placementFacilityId = null;
    this.lastModalTrigger = null;
    this.toastTimer = null;
    this.currentScene = "farm";
    this.feedbackTimers = new Set();
    this.combatEffectPool = [];
    this.wateringEffectPool = [];
    this.elements = {
      gameApp: documentRoot.querySelector("#gameApp"),
      cucumberCount: documentRoot.querySelector("#cucumberCount"),
      coinCount: documentRoot.querySelector("#coinCount"),
      playerLevelLabel: documentRoot.querySelector("#playerLevelLabel"),
      playerXpLabel: documentRoot.querySelector("#playerXpLabel"),
      playerXpBar: documentRoot.querySelector("#playerXpBar"),
      dayLabel: documentRoot.querySelector("#dayLabel"),
      turnTimer: documentRoot.querySelector("#turnTimer"),
      waterCount: documentRoot.querySelector("#waterCount"),
      fuelCount: documentRoot.querySelector("#fuelCount"),
      energyCount: documentRoot.querySelector("#energyCount"),
      phaseMessage: documentRoot.querySelector("#phaseMessage"),
      nextDayButton: documentRoot.querySelector("#nextDayButton"),
      preparationDock: documentRoot.querySelector("#preparationDock"),
      saveStatus: documentRoot.querySelector("#saveStatus"),
      toolTray: documentRoot.querySelector("#toolTray"),
      facilityInventory: documentRoot.querySelector("#facilityInventory"),
      selectionHelp: documentRoot.querySelector("#selectionHelp"),
      plotList: documentRoot.querySelector("#plotList"),
      gardenWorld: documentRoot.querySelector("#gardenWorld"),
      threatLayer: documentRoot.querySelector("#threatLayer"),
      combatEffectLayer: documentRoot.querySelector("#combatEffectLayer"),
      menuButton: documentRoot.querySelector("#menuButton"),
      sceneLayer: documentRoot.querySelector("#sceneLayer"),
      sceneTitle: documentRoot.querySelector("#sceneTitle"),
      sceneEyebrow: documentRoot.querySelector("#sceneEyebrow"),
      sceneCloseButton: documentRoot.querySelector("#sceneCloseButton"),
      sceneSettingsButton: documentRoot.querySelector("#sceneSettingsButton"),
      sceneScroll: documentRoot.querySelector("#sceneScroll"),
      bottomMenu: documentRoot.querySelector(".bottom-menu"),
      facilityManagerList: documentRoot.querySelector("#facilityManagerList"),
      inventorySlotList: documentRoot.querySelector("#inventorySlotList"),
      codexList: documentRoot.querySelector("#codexList"),
      shopPhaseNote: documentRoot.querySelector("#shopPhaseNote"),
      salePrice: documentRoot.querySelector("#salePrice"),
      sellAllButton: documentRoot.querySelector("#sellAllButton"),
      plotShopDescription: documentRoot.querySelector("#plotShopDescription"),
      gardenPurchaseButton: documentRoot.querySelector("#gardenPurchaseButton"),
      facilityShopList: documentRoot.querySelector("#facilityShopList"),
      consumableShopList: documentRoot.querySelector("#consumableShopList"),
      offlineModal: documentRoot.querySelector("#offlineModal"),
      offlineDuration: documentRoot.querySelector("#offlineDuration"),
      offlineReward: documentRoot.querySelector("#offlineReward"),
      offlinePhase: documentRoot.querySelector("#offlinePhase"),
      offlineConfirmButton: documentRoot.querySelector("#offlineConfirmButton"),
      resultModal: documentRoot.querySelector("#resultModal"),
      resultPopup: documentRoot.querySelector("#resultPopup"),
      resultModalIcon: documentRoot.querySelector("#resultModalIcon"),
      resultModalEyebrow: documentRoot.querySelector("#resultModalEyebrow"),
      resultModalTitle: documentRoot.querySelector("#resultModalTitle"),
      resultModalMessage: documentRoot.querySelector("#resultModalMessage"),
      resultModalConfirmButton: documentRoot.querySelector("#resultModalConfirmButton"),
      exitModal: documentRoot.querySelector("#exitModal"),
      exitCancelButton: documentRoot.querySelector("#exitCancelButton"),
      exitConfirmButton: documentRoot.querySelector("#exitConfirmButton"),
      feedbackLayer: documentRoot.querySelector("#feedbackLayer"),
      bgmEnabled: documentRoot.querySelector("#bgmEnabled"),
      bgmVolume: documentRoot.querySelector("#bgmVolume"),
      sfxEnabled: documentRoot.querySelector("#sfxEnabled"),
      sfxVolume: documentRoot.querySelector("#sfxVolume"),
      hapticsEnabled: documentRoot.querySelector("#hapticsEnabled"),
      reducedMotion: documentRoot.querySelector("#reducedMotion"),
      exportSaveButton: documentRoot.querySelector("#exportSaveButton"),
      importSaveButton: documentRoot.querySelector("#importSaveButton"),
      importSaveInput: documentRoot.querySelector("#importSaveInput"),
      supportUrlButton: documentRoot.querySelector("#supportUrlButton"),
      appVersionLabel: documentRoot.querySelector("#appVersionLabel"),
      startScreen: documentRoot.querySelector("#startScreen"),
      startButton: documentRoot.querySelector("#startButton"),
      loadingTrack: documentRoot.querySelector("#loadingTrack"),
      loadingBar: documentRoot.querySelector("#loadingBar"),
      loadingLabel: documentRoot.querySelector("#loadingLabel"),
      toast: documentRoot.querySelector("#toast"),
      announcement: documentRoot.querySelector("#gameAnnouncement"),
    };
  }

  createPlotView(plot) {
    const root = this.document.createElement("article");
    root.className = "garden-plot";
    root.dataset.plotId = plot.plotId;
    root.dataset.row = String(plot.row);
    root.dataset.column = String(plot.column);

    const coordinate = this.document.createElement("span");
    coordinate.className = "plot-coordinate";

    const button = this.document.createElement("button");
    button.type = "button";
    button.className = "crop-button";
    button.dataset.plotAction = plot.plotId;

    const emptyMarker = this.document.createElement("span");
    emptyMarker.className = "empty-marker";
    emptyMarker.textContent = "+";
    emptyMarker.setAttribute("aria-hidden", "true");

    const cropImage = this.document.createElement("img");
    cropImage.className = "crop-image";
    cropImage.alt = "";
    cropImage.decoding = "async";

    const cropFallback = this.document.createElement("span");
    cropFallback.className = "crop-fallback";
    cropFallback.textContent = "🥒";
    cropFallback.setAttribute("aria-hidden", "true");
    cropFallback.hidden = true;

    cropImage.addEventListener("load", () => {
      cropImage.hidden = false;
      cropFallback.hidden = true;
      cropImage.dataset.assetFailed = "false";
    });
    cropImage.addEventListener("error", () => {
      if (cropImage.dataset.fallbackApplied !== "true") {
        cropImage.dataset.fallbackApplied = "true";
        cropImage.src = "./assets/images/cucumber.png";
        return;
      }
      cropImage.hidden = true;
      cropFallback.hidden = false;
      cropImage.dataset.assetFailed = "true";
    });

    const cropName = this.document.createElement("span");
    cropName.className = "crop-name";
    const plotYield = this.document.createElement("span");
    plotYield.className = "plot-yield";
    const progress = this.document.createElement("span");
    progress.className = "crop-progress";
    progress.setAttribute("role", "progressbar");
    const progressBar = this.document.createElement("i");
    progress.append(progressBar);

    const facilityBadge = this.document.createElement("span");
    facilityBadge.className = "facility-badge";
    facilityBadge.hidden = true;

    const indoorMark = this.document.createElement("span");
    indoorMark.className = "indoor-mark";
    indoorMark.textContent = "온실 내부";
    indoorMark.hidden = true;

    button.append(emptyMarker, cropImage, cropFallback, cropName, plotYield, progress);
    root.append(coordinate, button, facilityBadge, indoorMark);
    return {
      root,
      coordinate,
      button,
      emptyMarker,
      cropImage,
      cropFallback,
      cropName,
      plotYield,
      progress,
      progressBar,
      facilityBadge,
      indoorMark,
    };
  }

  ensurePlotViews(state) {
    const activeIds = new Set(state.plots.map((plot) => plot.plotId));
    const lastPlot = state.plots.at(-1) ?? null;
    const lastRow = lastPlot?.row ?? 0;
    state.plots.forEach((plot) => {
      let view = this.plotViews.get(plot.plotId);
      if (!view) {
        view = this.createPlotView(plot);
        this.plotViews.set(plot.plotId, view);
      }
      view.root.classList.toggle("is-top-edge", plot.row === 0);
      view.root.classList.toggle("is-bottom-edge", plot.row === lastRow);
      view.root.classList.toggle("is-left-edge", plot.column === 0);
      view.root.classList.toggle(
        "is-right-edge",
        plot.column === GAME_CONFIG.board.columns - 1 || plot.plotId === lastPlot?.plotId
      );
      this.elements.plotList.append(view.root);
    });
    [...this.plotViews.entries()].forEach(([plotId, view]) => {
      if (activeIds.has(plotId)) return;
      view.root.remove();
      this.plotViews.delete(plotId);
    });
  }

  createThreatView(threat) {
    const actor = this.document.createElement("button");
    actor.type = "button";
    actor.className = "threat-actor";
    actor.dataset.threatAction = threat.threatId;

    const healthBar = this.document.createElement("span");
    healthBar.className = "threat-health";
    healthBar.setAttribute("aria-hidden", "true");
    const healthFill = this.document.createElement("i");
    healthBar.append(healthFill);

    const sprite = this.document.createElement("span");
    sprite.className = "threat-sprite";
    sprite.setAttribute("aria-hidden", "true");
    actor.append(healthBar, sprite);
    this.elements.threatLayer.append(actor);
    return { actor, healthBar, healthFill, sprite };
  }

  ensureThreatViews(state) {
    const activeIds = new Set(state.threats.map((threat) => threat.threatId));
    state.threats.forEach((threat) => {
      if (!this.threatViews.has(threat.threatId)) {
        this.threatViews.set(threat.threatId, this.createThreatView(threat));
      }
    });
    [...this.threatViews.entries()].forEach(([threatId, view]) => {
      if (activeIds.has(threatId)) return;
      view.actor.remove();
      this.threatViews.delete(threatId);
    });
  }

  getThreatPosition(threat, now, index) {
    const viewport = this.elements.gardenWorld;
    const viewportRect = viewport.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
      width: viewport.clientWidth || 390,
      height: viewport.clientHeight || 600,
    };
    const width = viewportRect.width || viewport.clientWidth || 390;
    const height = viewportRect.height || viewport.clientHeight || 600;
    const targetView = this.plotViews.get(threat.targetPlotId);
    const targetRect = targetView?.root.getBoundingClientRect?.();
    const targetX = targetRect
      ? targetRect.left - viewportRect.left + targetRect.width / 2
      : width / 2;
    const targetY = targetRect
      ? targetRect.top - viewportRect.top + targetRect.height * 0.42
      : height / 2;
    const lane = Math.min(0.92, Math.max(0.08, threat.spawnLane ?? 0.5));
    const actorRadius = 52;
    const starts = {
      top: { x: lane * width, y: -actorRadius },
      right: { x: width + actorRadius, y: lane * height },
      bottom: { x: lane * width, y: height + actorRadius },
      left: { x: -actorRadius, y: lane * height },
    };
    const start = starts[threat.spawnEdge] ?? starts.left;
    const movementState = threat.state === "hit" ? threat.resumeState : threat.state;
    const progress = movementState === "approaching"
      ? Math.min(
          1,
          Math.max(
            0,
            (now - threat.spawnedAt) /
              Math.max(1, threat.approachEndsAt - threat.spawnedAt)
          )
        )
      : 1;
    const eased = 1 - (1 - progress) ** 2;
    const targetOffset = ((index % 3) - 1) * 14;
    return {
      x: start.x + (targetX + targetOffset - start.x) * eased,
      y: start.y + (targetY - start.y) * eased,
    };
  }

  renderThreats(state, now) {
    this.ensureThreatViews(state);
    state.threats.forEach((threat, index) => {
      const view = this.threatViews.get(threat.threatId);
      const definition = getThreatDefinitionById(threat.type);
      if (!view || !definition) return;
      const position = this.getThreatPosition(threat, now, index);
      const healthPercent = Math.max(
        0,
        Math.min(100, (threat.health / definition.maxHealth) * 100)
      );
      const spriteState = threat.state === "stealing" ? "eating" : threat.state;
      const frame = {
        approaching: "0%",
        eating: "33.333%",
        hit: "66.667%",
        defeated: "100%",
        despawning: "100%",
      }[spriteState] ?? "0%";

      view.actor.dataset.state = threat.state;
      view.actor.dataset.threatType = definition.id;
      view.actor.style.setProperty("--threat-x", `${position.x}px`);
      view.actor.style.setProperty("--threat-y", `${position.y}px`);
      view.sprite.style.backgroundImage = `url("${definition.animationAsset}")`;
      view.sprite.style.backgroundPosition = `${frame} 50%`;
      view.healthFill.style.width = `${healthPercent}%`;
      view.healthFill.dataset.healthLevel =
        healthPercent > 55 ? "high" : healthPercent > 25 ? "medium" : "low";
      view.healthBar.hidden = ["defeated", "despawning"].includes(threat.state);
      view.actor.setAttribute(
        "aria-label",
        `${definition.name}, 체력 ${threat.health}/${definition.maxHealth}, 눌러서 뿅망치 공격`
      );
    });
  }

  renderPlot(state, plot, now) {
    const view = this.plotViews.get(plot.plotId);
    if (!view) return;
    const progress = getGrowthProgress(plot.crop.cropXp);
    const isPlanted = plot.crop.isPlanted;
    const anchorFacility = state.facilities.find(
      (facility) => facility.row === plot.row && facility.column === plot.column
    );

    view.root.dataset.row = String(plot.row);
    view.root.dataset.column = String(plot.column);
    view.root.classList.toggle("is-indoor", isPlotIndoors(state, plot.plotId));
    view.coordinate.textContent = `${plot.row + 1}행 ${plot.column + 1}열`;
    view.emptyMarker.hidden = isPlanted;
    view.cropImage.hidden = !isPlanted;
    view.cropFallback.hidden = !isPlanted || view.cropImage.dataset.assetFailed !== "true";
    view.cropName.textContent = isPlanted
      ? progress.isHarvestReady
        ? "수확 가능"
        : progress.stage.name
      : anchorFacility
        ? "시설 칸"
        : "눌러서 심기";
    view.plotYield.textContent = `기본 수확 ${formatNumber(getPlotHarvestYield(plot))}개`;
    view.progress.hidden = !isPlanted;
    view.progressBar.style.width = `${progress.progressPercent}%`;
    view.progress.setAttribute("aria-valuemin", "0");
    view.progress.setAttribute("aria-valuemax", String(progress.stageRequirement));
    view.progress.setAttribute("aria-valuenow", String(Math.floor(progress.stageExperience)));
    view.button.setAttribute(
      "aria-label",
      isPlanted
        ? `${plot.row + 1}행 ${plot.column + 1}열 ${progress.stage.name}, ${Math.floor(plot.crop.cropXp)} 경험치, ${progress.isHarvestReady ? "수확 가능" : "물주기"}`
        : `${plot.row + 1}행 ${plot.column + 1}열 빈 텃밭, 오이 심기`
    );

    if (isPlanted) {
      const requestedAsset = progress.stage.characterAsset;
      if (view.cropImage.dataset.requestedAsset !== requestedAsset) {
        view.cropImage.dataset.requestedAsset = requestedAsset;
        view.cropImage.dataset.fallbackApplied = "false";
        view.cropImage.dataset.assetFailed = "false";
        view.cropFallback.hidden = true;
        view.cropImage.hidden = false;
        view.cropImage.src = requestedAsset;
      }
    } else {
      view.cropImage.removeAttribute("src");
      delete view.cropImage.dataset.requestedAsset;
    }

    if (anchorFacility) {
      const definition = getFacilityDefinition(anchorFacility.type);
      const status = getFacilityStatus(state, anchorFacility);
      view.facilityBadge.hidden = false;
      view.facilityBadge.classList.toggle("is-stopped", !status.active);
      view.facilityBadge.replaceChildren();
      const image = this.document.createElement("img");
      image.src = definition.asset;
      image.alt = "";
      const label = this.document.createElement("span");
      label.textContent = `${definition.name} · ${status.reason}`;
      view.facilityBadge.append(image, label);
    } else {
      view.facilityBadge.hidden = true;
      view.facilityBadge.replaceChildren();
    }

    view.indoorMark.hidden = !isPlotIndoors(state, plot.plotId);
  }

  renderFacilityRanges(state) {
    this.plotViews.forEach((view) => view.root.classList.remove("is-range"));
    state.facilities.forEach((facility) => {
        getFacilityAffectedPlots(state, facility).forEach((plot) => {
          this.plotViews.get(plot.plotId)?.root.classList.add("is-range");
        });
      });
  }

  renderInventory(state) {
    this.elements.facilityInventory.replaceChildren();
    GAME_CONFIG.facilities.forEach((definition) => {
      const owned = state.inventory[definition.id] ?? 0;
      if (owned <= 0) return;
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "tool-button";
      button.dataset.selectFacility = definition.id;
      button.setAttribute("aria-pressed", String(this.placementFacilityId === definition.id));
      button.classList.toggle("is-selected", this.placementFacilityId === definition.id);
      const art = this.document.createElement("span");
      art.className = "tool-button__art";
      const image = this.document.createElement("img");
      image.src = definition.asset;
      image.alt = "";
      const name = this.document.createElement("span");
      name.textContent = `${definition.name} ×${owned}`;
      const description = this.document.createElement("small");
      description.textContent = `×${owned}`;
      art.append(image);
      button.append(art, name, description);
      this.elements.facilityInventory.append(button);
    });
  }

  renderInventoryScene(state) {
    this.elements.inventorySlotList.replaceChildren();
    const slots = [
      {
        id: "wateringCan",
        name: "물뿌리개",
        detail: "오이를 누르면 자동 사용 · 물 1 · XP 1",
        image: GAME_CONFIG.tools.wateringCan.asset,
        count: state.inventory.wateringCan,
      },
      {
        id: "hammer",
        name: "뿅망치",
        detail: "위협을 누르면 자동 사용 · 공격력 1",
        image: GAME_CONFIG.tools.hammer.asset,
        count: state.inventory.hammer,
      },
      ...GAME_CONFIG.facilities.map((definition) => ({
        id: definition.id,
        name: definition.name,
        detail: facilityDescription(definition),
        image: definition.asset,
        count: state.inventory[definition.id] ?? 0,
      })),
      { id: "water", name: "물", detail: "물주기와 스프링클러", icon: "💧", count: state.resources.water },
      { id: "fuel", name: "연료", detail: "발전기 가동", icon: "⛽", count: state.resources.fuel },
      { id: "energy", name: "에너지", detail: "온실 가동", icon: "⚡", count: state.resources.energy },
    ];

    slots.forEach((item) => {
      const slot = this.document.createElement("article");
      slot.className = "inventory-slot";
      if (item.image) {
        const image = this.document.createElement("img");
        image.src = item.image;
        image.alt = "";
        slot.append(image);
      } else {
        const icon = this.document.createElement("span");
        icon.textContent = item.icon;
        icon.setAttribute("aria-hidden", "true");
        slot.append(icon);
      }
      const name = this.document.createElement("strong");
      name.textContent = item.name;
      const detail = this.document.createElement("small");
      detail.textContent = item.detail;
      const count = this.document.createElement("b");
      count.textContent = `×${formatNumber(item.count)}`;
      slot.append(name, detail, count);
      this.elements.inventorySlotList.append(slot);
    });
  }

  renderFacilityManager(state) {
    this.elements.facilityManagerList.replaceChildren();
    if (state.facilities.length === 0) {
      const empty = this.document.createElement("section");
      empty.className = "wood-panel";
      empty.innerHTML = "<h3>아직 설치한 시설이 없어요</h3><p>준비 시간 상점에서 시설을 산 뒤, 농장에서 설치 위치를 선택하세요.</p>";
      this.elements.facilityManagerList.append(empty);
      return;
    }
    state.facilities.forEach((facility) => {
      const definition = getFacilityDefinition(facility.type);
      const status = getFacilityStatus(state, facility);
      const row = this.document.createElement("article");
      row.className = "facility-row";
      const image = this.document.createElement("img");
      image.src = definition.asset;
      image.alt = "";
      const copy = this.document.createElement("div");
      const name = this.document.createElement("strong");
      name.textContent = `${definition.name} · ${facility.row + 1}행 ${facility.column + 1}열`;
      const detail = this.document.createElement("small");
      detail.textContent = facilityDescription(definition);
      copy.append(name, detail);
      const badge = this.document.createElement("span");
      badge.className = "facility-status";
      badge.classList.toggle("is-stopped", !status.active);
      badge.textContent = status.reason;
      row.append(image, copy, badge);
      this.elements.facilityManagerList.append(row);
    });
  }

  renderCodex(state) {
    this.elements.codexList.replaceChildren();
    const highestCropXp = Math.max(0, ...state.plots.map((plot) => plot.crop.cropXp));
    GAME_CONFIG.crops.growthStages.forEach((stage) => {
      const unlocked = highestCropXp >= stage.minimumExperience || state.harvestCount > 0;
      const entry = this.document.createElement("article");
      entry.className = "codex-entry";
      entry.classList.toggle("is-locked", !unlocked);
      const image = this.document.createElement("img");
      image.src = stage.characterAsset;
      image.alt = unlocked ? `${stage.name} 오이` : "잠긴 오이";
      const name = this.document.createElement("strong");
      name.textContent = unlocked ? stage.name : "???";
      const detail = this.document.createElement("small");
      detail.textContent = unlocked
        ? `작물 XP ${stage.minimumExperience}부터 만날 수 있어요.`
        : `작물 XP ${stage.minimumExperience}에 발견`;
      entry.append(image, name, detail);
      this.elements.codexList.append(entry);
    });
  }

  renderSettings(state) {
    const settings = state.settings;
    this.elements.bgmEnabled.checked = settings.bgmEnabled;
    this.elements.bgmVolume.value = String(Math.round(settings.bgmVolume * 100));
    this.elements.sfxEnabled.checked = settings.sfxEnabled;
    this.elements.sfxVolume.value = String(Math.round(settings.sfxVolume * 100));
    this.elements.hapticsEnabled.checked = settings.hapticsEnabled;
    this.elements.reducedMotion.checked = settings.reducedMotion;
    this.elements.gameApp.classList.toggle("is-reduced-motion", settings.reducedMotion);
  }

  renderShop(state) {
    const isPreparation = state.turn.phase === "preparation";
    const player = getPlayerProgress(state.playerXp);
    const eligibility = canPurchaseGarden(state);
    const nextPlot = state.plots.length + 1;
    const maximum = getMaximumPlotsForLevel(player.level);
    const reachedAbsoluteMaximum = nextPlot > GAME_CONFIG.board.maximumPurchasablePlots;
    const reachedLevelMaximum = nextPlot > maximum;

    this.elements.shopPhaseNote.textContent = isPreparation
      ? "준비 시간입니다. 판매·구매를 마친 뒤 준비 완료를 눌러 주세요."
      : "낮과 밤에는 농장을 관리합니다. 상점 거래는 준비 시간에 열립니다.";
    this.elements.salePrice.textContent = formatNumber(
      GAME_CONFIG.economy.cucumberSalePrice
    );
    this.elements.sellAllButton.disabled = !isPreparation || state.cucumbers <= 0;
    this.elements.plotShopDescription.textContent = reachedAbsoluteMaximum
      ? `보유 ${state.plots.length}개 · 새 확장 상한 ${GAME_CONFIG.board.maximumPurchasablePlots}개 · 기존 구매분 유지`
      : reachedLevelMaximum
        ? `보유 ${state.plots.length}개 · 레벨 ${player.level} 한도 ${maximum}개 · 다음 텃밭은 레벨 ${nextPlot}부터`
        : `보유 ${state.plots.length}개 · 레벨 ${player.level} 한도 ${maximum}개 · ` +
          `${nextPlot}번째 가격 ${formatNumber(getPlotPrice(nextPlot))}코인 · ` +
          `기본 수확 ${formatNumber(getPlotHarvestYield(nextPlot))}개`;
    this.elements.gardenPurchaseButton.disabled = !eligibility.ok;
    this.elements.gardenPurchaseButton.textContent = eligibility.ok
      ? `${formatNumber(eligibility.price)}코인으로 텃밭 구매`
      : reachedAbsoluteMaximum
        ? getReasonMessage("maximum-plots")
        : reachedLevelMaximum
          ? getReasonMessage("level-limit", { maximum })
          : getReasonMessage(eligibility.reason, { maximum });

    this.elements.facilityShopList.replaceChildren();
    GAME_CONFIG.facilities.forEach((definition) => {
      const card = this.document.createElement("article");
      card.className = "shop-item";
      const image = this.document.createElement("img");
      image.src = definition.asset;
      image.alt = "";
      const copy = this.document.createElement("div");
      const name = this.document.createElement("strong");
      name.textContent = definition.name;
      const detail = this.document.createElement("small");
      detail.textContent = `Lv.${definition.unlockLevel} · ${formatNumber(definition.price)}코인`;
      const effect = this.document.createElement("small");
      effect.textContent = facilityDescription(definition);
      copy.append(name, detail, effect);
      const button = this.document.createElement("button");
      button.type = "button";
      button.dataset.buyFacility = definition.id;
      button.textContent = `구매 ×${state.inventory[definition.id] ?? 0}`;
      button.disabled =
        !isPreparation ||
        player.level < definition.unlockLevel ||
        state.coins < definition.price;
      card.append(image, copy, button);
      this.elements.facilityShopList.append(card);
    });

    this.elements.consumableShopList.replaceChildren();
    const icons = { water: "💧", fuel: "⛽", energy: "⚡" };
    Object.values(GAME_CONFIG.economy.consumables).forEach((item) => {
      const card = this.document.createElement("article");
      card.className = "shop-item";
      const icon = this.document.createElement("span");
      icon.className = "shop-item__icon";
      icon.textContent = icons[item.id];
      const copy = this.document.createElement("div");
      const name = this.document.createElement("strong");
      name.textContent = item.name;
      const detail = this.document.createElement("small");
      detail.textContent = `${formatNumber(item.price)}코인`;
      copy.append(name, detail);
      const button = this.document.createElement("button");
      button.type = "button";
      button.dataset.buyConsumable = item.id;
      button.textContent = "구매";
      button.disabled = !isPreparation || state.coins < item.price;
      card.append(icon, copy, button);
      this.elements.consumableShopList.append(card);
    });
  }

  render(state, { now = Date.now(), renderMenus = true } = {}) {
    this.currentState = state;
    const player = getPlayerProgress(state.playerXp);
    const remaining = getTurnRemainingMs(state, now);
    this.elements.cucumberCount.textContent = formatNumber(state.cucumbers);
    this.elements.coinCount.textContent = formatNumber(state.coins);
    this.elements.playerLevelLabel.textContent = `Lv.${player.level}`;
    this.elements.playerXpLabel.textContent = player.isMaximumLevel
      ? `${formatNumber(player.experience)} XP · MAX`
      : `${formatNumber(player.earned)} / ${formatNumber(player.requirement)} XP`;
    this.elements.playerXpBar.style.width = `${player.progressPercent}%`;
    this.elements.dayLabel.textContent = `${state.turn.day}일차 · ${PHASE_LABELS[state.turn.phase]}`;
    this.elements.turnTimer.textContent = formatTimer(remaining);
    this.elements.waterCount.textContent = formatNumber(state.resources.water);
    this.elements.fuelCount.textContent = formatNumber(state.resources.fuel);
    this.elements.energyCount.textContent = formatNumber(state.resources.energy);
    this.elements.preparationDock.hidden = state.turn.phase !== "preparation";
    this.elements.gameApp.classList.remove("phase-day", "phase-night", "phase-preparation");
    this.elements.gameApp.classList.add(`phase-${state.turn.phase}`);
    this.elements.phaseMessage.textContent =
      state.turn.phase === "day"
        ? "햇살 아래 오이가 자라고 있어요!"
        : state.turn.phase === "night"
          ? "밤이에요. 도둑과 온실을 살펴보세요."
          : "상점에서 내일 쓸 자원을 준비하세요.";

    this.ensurePlotViews(state);
    state.plots.forEach((plot) => this.renderPlot(state, plot, now));
    this.renderFacilityRanges(state);
    this.renderThreats(state, now);
    if (renderMenus) {
      this.renderInventory(state);
      this.renderInventoryScene(state);
      this.renderFacilityManager(state);
      this.renderCodex(state);
      this.renderSettings(state);
      this.renderShop(state);
    }
  }

  setFacilityPlacement(facilityId = null) {
    this.placementFacilityId = getFacilityDefinition(facilityId)?.id ?? null;
    this.elements.toolTray.querySelectorAll("[data-select-facility]").forEach((button) => {
      const selected = button.dataset.selectFacility === this.placementFacilityId;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
    const definition = getFacilityDefinition(this.placementFacilityId);
    this.elements.selectionHelp.textContent = definition
      ? `${definition.name} 설치 위치를 선택하세요. ${facilityDescription(definition)}`
      : "오이를 눌러 물을 주고, 위협을 눌러 퇴치하세요.";
  }

  previewPlacement(state, type, row, column) {
    this.plotViews.forEach((view) => view.root.classList.remove("is-placement-invalid"));
    const definition = getFacilityDefinition(type);
    if (!definition) return;
    const validation = validateFacilityPlacement(state, type, row, column);
    const targetPlots = validation.targets ?? getFacilityAffectedPlots(state, type, { row, column });
    targetPlots.forEach((plot) => this.plotViews.get(plot.plotId)?.root.classList.add("is-range"));
    if (!validation.ok) {
      const anchor = state.plots.find((plot) => plot.row === row && plot.column === column);
      if (anchor) this.plotViews.get(anchor.plotId)?.root.classList.add("is-placement-invalid");
    }
  }

  openScene(scene, trigger = null) {
    if (scene === "farm") {
      this.closeScene();
      return;
    }
    const titles = {
      facilities: ["FARM MANAGEMENT", "텃밭 · 시설"],
      inventory: ["MY FARM BAG", "인벤토리"],
      codex: ["CUCUMBER BOOK", "오이 도감"],
      shop: ["PREPARATION MARKET", "농장 상점"],
      settings: ["GAME OPTIONS", "설정"],
    };
    if (!titles[scene]) return;
    this.lastModalTrigger = trigger;
    this.currentScene = scene;
    if (this.currentState) this.render(this.currentState, { renderMenus: true });
    this.elements.sceneEyebrow.textContent = titles[scene][0];
    this.elements.sceneTitle.textContent = titles[scene][1];
    this.document.querySelectorAll("[data-scene-panel]").forEach((panel) => {
      panel.hidden = panel.dataset.scenePanel !== scene;
    });
    this.elements.sceneLayer.hidden = false;
    this.elements.sceneScroll.scrollTop = 0;
    this.elements.bottomMenu.querySelectorAll("[data-scene]").forEach((button) => {
      const selected = button.dataset.scene === scene;
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    this.elements.sceneCloseButton.focus();
  }

  closeScene() {
    if (this.elements.sceneLayer.hidden) return false;
    this.elements.sceneLayer.hidden = true;
    this.currentScene = "farm";
    this.elements.bottomMenu.querySelectorAll("[data-scene]").forEach((button) => {
      const selected = button.dataset.scene === "farm";
      button.classList.toggle("is-active", selected);
      if (selected) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    this.lastModalTrigger?.focus?.();
    this.lastModalTrigger = null;
    return true;
  }

  openMenu(trigger = this.elements.menuButton) {
    this.openScene("settings", trigger);
  }

  closeMenu() {
    return this.closeScene();
  }

  showOfflineReward(result) {
    this.elements.offlineDuration.textContent = formatDuration(result.elapsedSeconds);
    this.elements.offlineReward.textContent = formatNumber(result.growthGained);
    this.elements.offlinePhase.textContent = PHASE_LABELS[result.phase];
    this.elements.offlineModal.hidden = false;
    this.elements.offlineConfirmButton.focus();
  }

  hideOfflineReward() {
    this.elements.offlineModal.hidden = true;
  }

  showResult({ icon = "✨", eyebrow = "GREAT!", title, message, kind = "success" }) {
    this.elements.resultModalIcon.textContent = icon;
    this.elements.resultModalEyebrow.textContent = eyebrow;
    this.elements.resultModalTitle.textContent = title;
    this.elements.resultModalMessage.textContent = message;
    this.elements.resultPopup.dataset.kind = kind;
    this.elements.resultModal.hidden = false;
    this.elements.resultModalConfirmButton.focus();
  }

  hideResult() {
    this.elements.resultModal.hidden = true;
  }

  showExitConfirm() {
    this.elements.exitModal.hidden = false;
    this.elements.exitCancelButton.focus();
  }

  hideExitConfirm() {
    this.elements.exitModal.hidden = true;
  }

  closeTopLayer() {
    if (!this.elements.resultModal.hidden) {
      this.hideResult();
      return "result";
    }
    if (!this.elements.offlineModal.hidden) {
      this.hideOfflineReward();
      return "offline";
    }
    if (!this.elements.exitModal.hidden) {
      this.hideExitConfirm();
      return "exit";
    }
    if (!this.elements.sceneLayer.hidden) {
      this.closeScene();
      return "scene";
    }
    return null;
  }

  isInteractionBlocked() {
    return (
      !this.elements.sceneLayer.hidden ||
      !this.elements.offlineModal.hidden ||
      !this.elements.resultModal.hidden ||
      !this.elements.exitModal.hidden ||
      !this.elements.startScreen.hidden
    );
  }

  setLoadingProgress(percent, label = "") {
    this.elements.loadingBar.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    if (label) this.elements.loadingLabel.textContent = label;
  }

  showStartButton() {
    this.setLoadingProgress(100, "농장이 준비됐어요!");
    this.elements.loadingTrack.hidden = true;
    this.elements.startButton.hidden = false;
    this.elements.startButton.focus();
  }

  hideStartScreen() {
    this.elements.startScreen.classList.add("is-leaving");
    this.document.defaultView?.setTimeout(() => {
      this.elements.startScreen.hidden = true;
    }, 380);
  }

  takeEffectFromPool(pool, limit, factory) {
    let effect = pool.find((candidate) => candidate.hidden);
    if (!effect && pool.length < limit) {
      effect = factory();
      pool.push(effect);
    }
    if (!effect) effect = pool.shift();
    else {
      const index = pool.indexOf(effect);
      if (index >= 0) pool.splice(index, 1);
    }
    pool.push(effect);
    this.document.defaultView?.clearTimeout(effect.cleanupTimer);
    effect.getAnimations?.().forEach((animation) => animation.cancel());
    effect.querySelectorAll?.("*").forEach((child) => {
      child.getAnimations?.().forEach((animation) => animation.cancel());
    });
    return effect;
  }

  playThreatHit(threatId, { clientX = null, clientY = null, defeated = false } = {}) {
    const view = this.threatViews.get(threatId);
    if (!view) return;
    const layerRect = this.elements.combatEffectLayer.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
    };
    const actorRect = view.actor.getBoundingClientRect?.();
    const x = Number.isFinite(clientX)
      ? clientX - layerRect.left
      : (actorRect?.left ?? 0) - layerRect.left + (actorRect?.width ?? 80) / 2;
    const y = Number.isFinite(clientY)
      ? clientY - layerRect.top
      : (actorRect?.top ?? 0) - layerRect.top + (actorRect?.height ?? 80) / 2;
    const effect = this.takeEffectFromPool(this.combatEffectPool, 4, () => {
      const root = this.document.createElement("span");
      root.className = "combat-hit-effect";
      root.hidden = true;
      const hammer = this.document.createElement("img");
      hammer.src = GAME_CONFIG.tools.hammer.asset;
      hammer.alt = "";
      hammer.className = "combat-hammer";
      root.append(hammer);
      for (let index = 0; index < 5; index += 1) {
        const particle = this.document.createElement("i");
        particle.style.setProperty("--particle-index", String(index));
        root.append(particle);
      }
      this.elements.combatEffectLayer.append(root);
      return root;
    });
    effect.hidden = false;
    effect.classList.remove("is-active", "is-defeat");
    effect.style.setProperty("--effect-x", `${x}px`);
    effect.style.setProperty("--effect-y", `${y}px`);
    if (defeated) effect.classList.add("is-defeat");
    this.document.defaultView?.requestAnimationFrame?.(() => effect.classList.add("is-active"));
    effect.cleanupTimer = this.document.defaultView?.setTimeout(() => {
      effect.hidden = true;
      effect.classList.remove("is-active", "is-defeat");
    }, 460);
  }

  playWateringEffect(plotId) {
    const plotView = this.plotViews.get(plotId);
    if (!plotView) return;
    const layerRect = this.elements.combatEffectLayer.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
    };
    const plotRect = plotView.root.getBoundingClientRect?.();
    const x = (plotRect?.left ?? 0) - layerRect.left + (plotRect?.width ?? 100) * 0.66;
    const y = (plotRect?.top ?? 0) - layerRect.top + (plotRect?.height ?? 140) * 0.36;
    const effect = this.takeEffectFromPool(this.wateringEffectPool, 5, () => {
      const root = this.document.createElement("span");
      root.className = "watering-action-effect";
      root.hidden = true;
      const can = this.document.createElement("img");
      can.src = GAME_CONFIG.tools.wateringCan.asset;
      can.alt = "";
      root.append(can);
      for (let index = 0; index < 4; index += 1) {
        const droplet = this.document.createElement("i");
        droplet.style.setProperty("--drop-index", String(index));
        root.append(droplet);
      }
      this.elements.combatEffectLayer.append(root);
      return root;
    });
    effect.hidden = false;
    effect.classList.remove("is-active");
    effect.style.setProperty("--effect-x", `${x}px`);
    effect.style.setProperty("--effect-y", `${y}px`);
    this.document.defaultView?.requestAnimationFrame?.(() => effect.classList.add("is-active"));
    effect.cleanupTimer = this.document.defaultView?.setTimeout(() => {
      effect.hidden = true;
      effect.classList.remove("is-active");
    }, 520);
  }

  playPlotFeedback(plotId, type, amount = 0) {
    const view = this.plotViews.get(plotId);
    if (!view) return;
    const className = type === "error" ? "is-feedback-error" : "is-feedback-success";
    view.root.getAnimations?.().forEach((animation) => animation.cancel());
    view.root.classList.remove(className);
    view.root.classList.add(className);
    if (type === "water") {
      this.playWateringEffect(plotId);
      view.cropImage.getAnimations?.().forEach((animation) => animation.cancel());
      view.cropImage.classList.remove("is-watered");
      view.cropImage.classList.add("is-watered");
      const xpEffects = this.elements.feedbackLayer.querySelectorAll?.(".xp-gain") ?? [];
      if (xpEffects.length >= 12) xpEffects[0].remove();
      showXpGain(amount, {
        container: this.elements.feedbackLayer,
        anchor: view.root,
        source: "watering",
      });
    }
    const timer = this.document.defaultView?.setTimeout(() => {
      view.root.classList.remove(className);
      view.cropImage.classList.remove("is-watered");
      this.feedbackTimers.delete(timer);
    }, 560);
    if (timer) this.feedbackTimers.add(timer);
  }

  setSaveError(message = "") {
    this.elements.saveStatus.textContent = message;
  }

  announce(message) {
    this.elements.announcement.textContent = "";
    this.document.defaultView?.setTimeout(() => {
      this.elements.announcement.textContent = message;
    }, 20);
  }

  showToast(message) {
    const windowRef = this.document.defaultView;
    windowRef?.clearTimeout(this.toastTimer);
    this.elements.toast.textContent = message;
    this.elements.toast.hidden = false;
    this.announce(message);
    this.toastTimer = windowRef?.setTimeout(() => {
      this.elements.toast.hidden = true;
    }, 2_600);
  }
}
