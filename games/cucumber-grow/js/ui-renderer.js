import { GAME_CONFIG, getThreatDefinitionById } from "./game-config.js";
import {
  canPurchaseGarden,
  getCropStageAsset,
  getCropVariety,
  getGrowthProgress,
  getMaximumPlotsForLevel,
  getPlayerProgress,
  getPlotHarvestYield,
  getPlotPrice,
} from "./game-engine.js";
import {
  getFacilityAffectedPlots,
  getFacilityDefinition,
  getGeneratorProgress,
  getFacilityStatus,
  isPlotIndoors,
  validateFacilityPlacement,
} from "./facility-engine.js";
import { getTurnRemainingMs } from "./turn-engine.js";
import { formatNumber } from "./number-format.js";
import { showXpGain } from "./xp-gain-effect.js";

const PHASE_LABELS = {
  day: "낮",
  night: "밤",
  preparation: "준비 시간",
};

export function getReasonMessage(reason, context = {}) {
  const messages = {
    "not-enough-water": "물이 부족합니다. 상점에서 물을 구매해 주세요.",
    "turn-not-active": "하루의 턴을 시작한 뒤에 사용할 수 있습니다.",
    "watering-can-empty": "물뿌리개가 비었습니다. 위쪽 물통을 눌러 충전하세요.",
    "watering-can-full": "물뿌리개가 이미 가득 찼습니다.",
    "water-tank-empty": "물통이 비었습니다. 상점에서 물을 구매하세요.",
    "no-hammer": "뿅망치가 없습니다. 상점에서 새 망치를 구매하세요.",
    "no-seed": "이 씨앗이 없습니다. 상점에서 씨앗을 구매하세요.",
    "unknown-seed": "선택할 수 없는 오이 씨앗입니다.",
    "no-bounty": "경찰서에서 받을 퇴치 보상금이 없습니다.",
    "not-enough-coins": "코인이 부족합니다.",
    "empty-plot": "빈 텃밭입니다. 먼저 오이를 심어 주세요.",
    "harvest-ready": "다 자란 오이는 먼저 수확해 주세요.",
    "not-ready": "아직 수확할 수 없습니다.",
    "preparation-only": "구매와 판매는 준비 시간에만 할 수 있습니다.",
    "level-limit": `현재 레벨에는 텃밭을 ${context.maximum ?? "더"}개까지 설치할 수 있습니다.`,
    "maximum-plots": "현재 버전의 최대 텃밭 수에 도달했습니다.",
    "no-threat": "지금 내쫓을 새·짐승·도둑이 없습니다.",
    "already-defeated": "이미 쓰러진 위협입니다.",
    "generator-running": "발전기가 이미 힘차게 돌아가고 있습니다.",
    "energy-full": "에너지가 가득 찼습니다.",
    "not-enough-fuel": "발전기를 돌릴 연료가 부족합니다.",
    "not-knocked-out": "먼저 뿅망치로 위협을 기절시켜 주세요.",
    "facility-occupied": "시설이 있는 칸에는 오이를 심을 수 없습니다.",
    "not-owned": "먼저 상점에서 시설을 구매해 주세요.",
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
  if (definition.id === "greenhouse") return "3×2 여섯 칸 · 밤 작물 보호";
  if (definition.id === "generator") return `연료 ${definition.fuelPerCycle} → 에너지 ${definition.energyPerCycle} · ${definition.cycleDurationMs / 1_000}초`;
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
    this.phaseBannerTimer = null;
    this.currentScene = "farm";
    this.feedbackTimers = new Set();
    this.combatEffectPool = [];
    this.wateringEffectPool = [];
    this.pendingCropLoss = new Map();
    this.seedDrag = null;
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
      nextDayButton: documentRoot.querySelector("#nextDayButton"),
      saveStatus: documentRoot.querySelector("#saveStatus"),
      toolTray: documentRoot.querySelector("#toolTray"),
      facilityInventory: documentRoot.querySelector("#facilityInventory"),
      wateringCanStatus: documentRoot.querySelector("#wateringCanStatus"),
      wateringCanMeter: documentRoot.querySelector("#wateringCanMeter"),
      hammerStatus: documentRoot.querySelector("#hammerStatus"),
      hammerDurabilityMeter: documentRoot.querySelector("#hammerDurabilityMeter"),
      hammerQuantity: documentRoot.querySelector("#hammerQuantity"),
      waterTankButton: documentRoot.querySelector("#waterTankButton"),
      waterTankStatus: documentRoot.querySelector("#waterTankStatus"),
      waterTankMeter: documentRoot.querySelector("#waterTankMeter"),
      generatorStation: documentRoot.querySelector("#generatorStation"),
      generatorStationMeter: documentRoot.querySelector("#generatorStationMeter"),
      townGateButton: documentRoot.querySelector("#townGateButton"),
      villagePoliceButton: documentRoot.querySelector("#villagePoliceButton"),
      villageShopButton: documentRoot.querySelector("#villageShopButton"),
      townBountyStatus: documentRoot.querySelector("#townBountyStatus"),
      seedDragList: documentRoot.querySelector("#seedDragList"),
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
      seedShopList: documentRoot.querySelector("#seedShopList"),
      phaseBanner: documentRoot.querySelector("#phaseBanner"),
      phaseBannerDay: documentRoot.querySelector("#phaseBannerDay"),
      phaseBannerTitle: documentRoot.querySelector("#phaseBannerTitle"),
      phaseBannerSubtitle: documentRoot.querySelector("#phaseBannerSubtitle"),
      turnReportModal: documentRoot.querySelector("#turnReportModal"),
      turnReportTitle: documentRoot.querySelector("#turnReportTitle"),
      reportHarvest: documentRoot.querySelector("#reportHarvest"),
      reportCropXp: documentRoot.querySelector("#reportCropXp"),
      reportPlayerXp: documentRoot.querySelector("#reportPlayerXp"),
      reportAnimals: documentRoot.querySelector("#reportAnimals"),
      reportThieves: documentRoot.querySelector("#reportThieves"),
      reportBounty: documentRoot.querySelector("#reportBounty"),
      turnReportConfirmButton: documentRoot.querySelector("#turnReportConfirmButton"),
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
      cloudTransition: documentRoot.querySelector("#cloudTransition"),
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

    const cropFallback = this.document.createElement("img");
    cropFallback.className = "crop-fallback";
    cropFallback.src = GAME_CONFIG.uiAssets.resources.cucumber;
    cropFallback.alt = "";
    cropFallback.setAttribute("aria-hidden", "true");
    cropFallback.hidden = true;

    const damageMeter = this.document.createElement("span");
    damageMeter.className = "crop-damage-meter";
    damageMeter.setAttribute("aria-hidden", "true");
    damageMeter.hidden = true;

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

    const facilityBadge = this.document.createElement("button");
    facilityBadge.type = "button";
    facilityBadge.className = "facility-badge";
    facilityBadge.hidden = true;

    const indoorMark = this.document.createElement("span");
    indoorMark.className = "indoor-mark";
    indoorMark.textContent = "온실 내부";
    indoorMark.hidden = true;

    button.append(emptyMarker, cropImage, cropFallback, damageMeter, cropName, plotYield, progress);
    root.append(button, facilityBadge, indoorMark);
    return {
      root,
      button,
      emptyMarker,
      cropImage,
      cropFallback,
      damageMeter,
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
    actor.className = "threat-actor is-unpositioned";
    actor.dataset.threatAction = threat.threatId;

    const healthBar = this.document.createElement("span");
    healthBar.className = "threat-health";
    healthBar.setAttribute("aria-hidden", "true");
    const healthFill = this.document.createElement("i");
    healthBar.append(healthFill);

    const sprite = this.document.createElement("span");
    sprite.className = "threat-sprite";
    sprite.setAttribute("aria-hidden", "true");
    const facing = this.document.createElement("span");
    facing.className = "threat-facing";
    facing.append(sprite);
    actor.append(healthBar, facing);
    this.elements.threatLayer.append(actor);
    return { actor, healthBar, healthFill, facing, sprite };
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
    const attackSide = threat.attackSide === -1 ? -1 : 1;
    const targetX = targetRect
      ? targetRect.left - viewportRect.left + targetRect.width * (0.5 + attackSide * 0.42)
      : width / 2;
    const targetY = targetRect
      ? targetRect.top - viewportRect.top + targetRect.height * 0.48
      : height / 2;
    const lane = Math.min(0.92, Math.max(0.08, threat.spawnLane ?? 0.5));
    const definition = getThreatDefinitionById(threat.type);
    const actorRadius = (definition?.actorSize ?? 82) / 2 + 10;
    const starts = {
      top: { x: lane * width, y: -actorRadius },
      right: { x: width + actorRadius, y: lane * height },
      bottom: { x: lane * width, y: height + actorRadius },
      left: { x: -actorRadius, y: lane * height },
    };
    const start = starts[threat.spawnEdge] ?? starts.left;
    const movementState = threat.state === "hit" ? threat.resumeState : threat.state;
    const isRetreating = movementState === "retreating";
    const progress = movementState === "approaching"
      ? Math.min(
          1,
          Math.max(
            0,
            (now - threat.spawnedAt) /
              Math.max(1, threat.approachEndsAt - threat.spawnedAt)
          )
        )
      : isRetreating
        ? Math.min(1, Math.max(0, threat.retreatFromProgress ?? 1))
        : 1;
    const eased = definition?.approachMotion === "sneak"
      ? progress * progress * (3 - 2 * progress)
      : 1 - (1 - progress) ** 2;
    const targetOffset = ((index % 3) - 1) * 7;
    const safeTargetX = Math.min(width - actorRadius, Math.max(actorRadius, targetX + targetOffset));
    const safeTargetY = Math.min(height - actorRadius, Math.max(actorRadius, targetY));
    const baseX = start.x + (safeTargetX - start.x) * eased;
    const baseY = start.y + (safeTargetY - start.y) * eased;
    const vectorX = safeTargetX - start.x;
    const vectorY = safeTargetY - start.y;
    const length = Math.max(1, Math.hypot(vectorX, vectorY));
    const perpendicularX = -vectorY / length;
    const perpendicularY = vectorX / length;
    const remaining = 1 - progress;
    let offsetX = 0;
    let offsetY = 0;
    if (movementState === "approaching") {
      switch (definition?.approachMotion) {
        case "fly":
          offsetY -= Math.sin(progress * Math.PI) * 58;
          offsetX += perpendicularX * Math.sin(progress * Math.PI * 3) * 12 * remaining;
          break;
        case "hop":
          offsetY -= Math.abs(Math.sin(progress * Math.PI * 4)) * 34;
          break;
        case "scurry":
          offsetX += perpendicularX * Math.sin(progress * Math.PI * 9) * 34 * (0.55 + remaining * 0.45);
          offsetY += perpendicularY * Math.sin(progress * Math.PI * 9) * 34 * (0.55 + remaining * 0.45);
          break;
        case "charge":
          offsetY += Math.sin(progress * Math.PI * 6) * 4;
          break;
        case "run":
          offsetX += perpendicularX * Math.sin(progress * Math.PI * 5) * 10 * remaining;
          offsetY += perpendicularY * Math.sin(progress * Math.PI * 5) * 10 * remaining;
          break;
        case "sneak":
          offsetX += perpendicularX * Math.sin(progress * Math.PI * 4) * 8 * remaining;
          offsetY += perpendicularY * Math.sin(progress * Math.PI * 4) * 8 * remaining;
          break;
        default:
          break;
      }
    }
    if (isRetreating) {
      const retreatProgress = Math.min(
        1,
        Math.max(0, (now - threat.retreatStartedAt) / Math.max(1, threat.retreatEndsAt - threat.retreatStartedAt))
      );
      const retreatEase = retreatProgress * retreatProgress * (3 - 2 * retreatProgress);
      return {
        x: baseX + (start.x - baseX) * retreatEase,
        y: baseY + (start.y - baseY) * retreatEase,
      };
    }
    return { x: baseX + offsetX, y: baseY + offsetY };
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
      const spriteState = threat.state === "stealing"
        ? "eating"
        : threat.state === "retreating"
          ? "approaching"
        : threat.state === "celebrating"
          ? "happy"
          : threat.state === "despawning" && threat.health > 0
            ? "happy"
          : threat.state;
      const stripKey = threat.state === "stealing"
        ? "stealing"
        : threat.state === "retreating"
          ? "approaching"
          : threat.state;
      const stripAsset = definition.animationStrips?.[stripKey];
      const frameState = spriteState === "despawning" ? "defeated" : spriteState;
      const frameAsset = stripAsset ?? definition.animationFrames?.[frameState]
        ?? definition.animationFrames?.approaching
        ?? definition.animationAsset;

      view.actor.dataset.state = threat.state;
      view.actor.dataset.threatType = definition.id;
      view.actor.dataset.facing = threat.attackSide === -1 ? "right" : "left";
      view.actor.dataset.spriteMode = stripAsset ? "strip" : "frame";
      view.actor.style.setProperty("--actor-size", `${definition.actorSize ?? 82}px`);
      if (position) {
        view.actor.style.setProperty("--threat-x", `${position.x}px`);
        view.actor.style.setProperty("--threat-y", `${position.y}px`);
      }
      view.sprite.style.backgroundImage = `url("${frameAsset}")`;
      view.healthFill.style.width = `${healthPercent}%`;
      view.healthFill.dataset.healthLevel =
        healthPercent > 55 ? "high" : healthPercent > 25 ? "medium" : "low";
      view.healthBar.hidden = ["defeated", "celebrating", "despawning"].includes(threat.state);
      view.actor.disabled = threat.resolved === true;
      view.actor.setAttribute(
        "aria-label",
        threat.state === "celebrating"
          ? `${definition.name}, 오이를 가져가 기뻐하는 중`
          : threat.state === "defeated"
            ? `${definition.name}, 퇴치됨`
          : `${definition.name}, 체력 ${threat.health}/${definition.maxHealth}, 눌러서 뿅망치 공격`
      );
      if (view.actor.classList.contains("is-unpositioned")) {
        const reveal = () => view.actor.classList.remove("is-unpositioned");
        this.document.defaultView?.requestAnimationFrame?.(reveal) ?? reveal();
      }
    });
  }

  renderPlot(state, plot, now) {
    const view = this.plotViews.get(plot.plotId);
    if (!view) return;
    const progress = getGrowthProgress(plot.crop.cropXp);
    const isPlanted = plot.crop.isPlanted;
    const loss = this.pendingCropLoss.get(plot.plotId);
    const lossActive = !isPlanted && loss && now < loss.endsAt;
    if (loss && !lossActive) this.pendingCropLoss.delete(plot.plotId);
    const visuallyPlanted = isPlanted || lossActive;
    const biteStage = isPlanted
      ? Math.max(0, ...state.threats
          .filter((threat) => threat.targetPlotId === plot.plotId && threat.type !== "thief" && threat.state !== "despawning")
          .map((threat) => threat.biteStage ?? 0))
      : 0;
    const anchorFacility = state.facilities.find(
      (facility) => facility.row === plot.row && facility.column === plot.column
    );

    view.root.dataset.row = String(plot.row);
    view.root.dataset.column = String(plot.column);
    view.root.dataset.stage = isPlanted ? progress.stage.id : "empty";
    view.root.dataset.variety = plot.crop.varietyId ?? GAME_CONFIG.crops.defaultVarietyId;
    view.root.dataset.damageStage = String(biteStage);
    view.damageMeter.hidden = true;
    view.root.classList.toggle("is-crop-lost", Boolean(lossActive));
    view.root.classList.toggle("is-crop-stolen", Boolean(lossActive && loss.kind === "stolen-crop"));
    view.root.classList.toggle("is-indoor", isPlotIndoors(state, plot.plotId));
    view.emptyMarker.hidden = visuallyPlanted;
    view.cropImage.hidden = !visuallyPlanted;
    view.cropFallback.hidden = !visuallyPlanted || view.cropImage.dataset.assetFailed !== "true";
    view.cropName.textContent = isPlanted
      ? getCropVariety(plot.crop.varietyId).name
      : anchorFacility
        ? "시설 칸"
        : "빈 텃밭";
    view.plotYield.textContent = `기본 수확 ${formatNumber(getPlotHarvestYield(plot))}개`;
    view.plotYield.hidden = !isPlanted;
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
      const variety = getCropVariety(plot.crop.varietyId);
      const requestedAsset = biteStage > 0
        ? variety.damagedStageAssets?.[progress.stage.id]?.[biteStage - 1]
          ?? getCropStageAsset(plot.crop, progress.stage.id)
        : getCropStageAsset(plot.crop, progress.stage.id);
      if (view.cropImage.dataset.requestedAsset !== requestedAsset) {
        view.cropImage.dataset.requestedAsset = requestedAsset;
        view.cropImage.dataset.fallbackApplied = "false";
        view.cropImage.dataset.assetFailed = "false";
        view.cropFallback.hidden = true;
        view.cropImage.hidden = false;
        view.cropImage.src = requestedAsset;
      }
    } else if (!lossActive) {
      view.cropImage.removeAttribute("src");
      delete view.cropImage.dataset.requestedAsset;
    }

    if (anchorFacility) {
      const definition = getFacilityDefinition(anchorFacility.type);
      const status = getFacilityStatus(state, anchorFacility, now);
      view.facilityBadge.hidden = false;
      view.facilityBadge.className = "facility-badge";
      view.facilityBadge.classList.toggle("is-stopped", !status.active);
      view.facilityBadge.replaceChildren();
      const image = this.document.createElement("img");
      image.src = definition.asset;
      image.alt = "";
      if (definition.id === "generator") {
        view.facilityBadge.hidden = true;
        delete view.facilityBadge.dataset.generatorAction;
      } else {
        delete view.facilityBadge.dataset.generatorAction;
        const label = this.document.createElement("span");
        label.textContent = `${definition.name} · ${status.reason}`;
        view.facilityBadge.append(image, label);
      }
    } else {
      view.facilityBadge.hidden = true;
      view.facilityBadge.className = "facility-badge";
      delete view.facilityBadge.dataset.generatorAction;
      view.facilityBadge.replaceChildren();
    }

    view.indoorMark.hidden = !isPlotIndoors(state, plot.plotId);
  }

  markCropLoss(plotId, kind, now = Date.now()) {
    this.pendingCropLoss.set(plotId, { kind, endsAt: now + 680 });
  }

  renderFacilityRanges(state) {
    this.plotViews.forEach((view) => view.root.classList.remove("is-range"));
    state.facilities.forEach((facility) => {
        getFacilityAffectedPlots(state, facility).forEach((plot) => {
          this.plotViews.get(plot.plotId)?.root.classList.add("is-range");
        });
      });
  }

  renderSeedTray(state) {
    this.elements.seedDragList.replaceChildren();
    Object.values(GAME_CONFIG.crops.varieties).forEach((variety) => {
      const count = state.seeds[variety.id] ?? 0;
      const button = this.document.createElement("button");
      button.type = "button";
      button.className = "seed-drag-item";
      button.dataset.seedDrag = variety.id;
      button.disabled = count <= 0;
      button.setAttribute("aria-label", `${variety.name} 씨앗 ${formatNumber(count)}개, 빈 텃밭으로 끌어 심기`);
      const image = this.document.createElement("img");
      image.src = variety.stageAssets.sprout;
      image.alt = "";
      const name = this.document.createElement("span");
      name.textContent = variety.name.replace("오이", "");
      const quantity = this.document.createElement("b");
      quantity.textContent = `×${formatNumber(count)}`;
      button.append(image, name, quantity);
      this.elements.seedDragList.append(button);
    });
  }

  getEmptyPlotAtPoint(state, clientX, clientY) {
    for (const plot of state.plots) {
      if (plot.crop.isPlanted) continue;
      const view = this.plotViews.get(plot.plotId);
      const rect = view?.root.getBoundingClientRect?.();
      if (!rect) continue;
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return plot.plotId;
      }
    }
    return null;
  }

  beginSeedDrag(varietyId, imageSource, clientX, clientY) {
    this.cancelSeedDrag();
    const ghost = this.document.createElement("img");
    ghost.className = "seed-drag-ghost";
    ghost.src = imageSource;
    ghost.alt = "";
    this.elements.feedbackLayer.append(ghost);
    this.seedDrag = { varietyId, ghost, plotId: null };
    this.elements.gameApp.classList.add("is-seed-dragging");
    this.moveSeedDrag(clientX, clientY);
  }

  moveSeedDrag(clientX, clientY) {
    if (!this.seedDrag) return null;
    const rootRect = this.elements.gameApp.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    this.seedDrag.ghost.style.setProperty("--drag-x", `${clientX - rootRect.left}px`);
    this.seedDrag.ghost.style.setProperty("--drag-y", `${clientY - rootRect.top}px`);
    const plotId = this.getEmptyPlotAtPoint(this.currentState, clientX, clientY);
    this.seedDrag.plotId = plotId;
    this.plotViews.forEach((view, candidateId) => {
      view.root.classList.toggle("is-seed-drop-target", candidateId === plotId);
    });
    return plotId;
  }

  finishSeedDrag() {
    if (!this.seedDrag) return null;
    const result = { varietyId: this.seedDrag.varietyId, plotId: this.seedDrag.plotId };
    this.cancelSeedDrag();
    return result;
  }

  cancelSeedDrag() {
    this.seedDrag?.ghost?.remove();
    this.seedDrag = null;
    this.elements.gameApp.classList.remove("is-seed-dragging");
    this.plotViews.forEach((view) => view.root.classList.remove("is-seed-drop-target"));
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

  renderGeneratorStation(state, now) {
    const generator = state.facilities.find((facility) => facility.type === "generator");
    this.elements.generatorStation.hidden = !generator;
    if (!generator) {
      delete this.elements.generatorStation.dataset.generatorAction;
      this.elements.generatorStationMeter.style.width = "0%";
      return;
    }
    const progress = getGeneratorProgress(generator, now);
    const status = getFacilityStatus(state, generator, now);
    this.elements.generatorStation.dataset.generatorAction = generator.facilityId;
    this.elements.generatorStation.classList.toggle("is-running", generator.active === true);
    this.elements.generatorStationMeter.style.width = `${progress}%`;
    this.elements.generatorStation.setAttribute(
      "aria-label",
      generator.active
        ? `발전기 가동 중 ${Math.round(progress)}%`
        : `${status.reason}, 발전기를 눌러 가동`
    );
  }

  renderInventoryScene(state) {
    this.elements.inventorySlotList.replaceChildren();
    const slots = [
      {
        id: "wateringCan",
        name: "물뿌리개",
        detail: `성능 +${GAME_CONFIG.tools.wateringCan.cropXp}XP · 충전 ${state.toolStatus.wateringCanCharge}/${GAME_CONFIG.tools.wateringCan.capacity}`,
        image: GAME_CONFIG.tools.wateringCan.asset,
        count: state.inventory.wateringCan,
      },
      {
        id: "hammer",
        name: "뿅망치",
        detail: `파워 ${GAME_CONFIG.tools.hammer.damage} · 내구도 ${state.toolStatus.hammerUsesRemaining}/${GAME_CONFIG.tools.hammer.usesPerItem}`,
        image: GAME_CONFIG.tools.hammer.asset,
        count: state.inventory.hammer,
      },
      {
        id: "waterTank",
        name: "물통",
        detail: `물뿌리개 최대 ${GAME_CONFIG.tools.wateringCan.capacity} 충전`,
        image: GAME_CONFIG.tools.waterTank.asset,
        count: state.inventory.waterTank,
      },
      ...GAME_CONFIG.facilities.map((definition) => ({
        id: definition.id,
        name: definition.name,
        detail: facilityDescription(definition),
        image: definition.asset,
        count: state.inventory[definition.id] ?? 0,
      })),
      ...Object.values(GAME_CONFIG.crops.varieties).map((variety) => ({
        id: `${variety.id}-seed`,
        name: `${variety.name} 씨앗`,
        detail: "오이 씨앗",
        image: GAME_CONFIG.economy.seeds[variety.id]?.asset,
        count: state.seeds[variety.id] ?? 0,
      })),
      { id: "water", name: "물", detail: "물주기와 스프링클러", image: GAME_CONFIG.uiAssets.resources.water, count: state.resources.water },
      { id: "fuel", name: "연료", detail: "발전기 가동", image: GAME_CONFIG.uiAssets.resources.fuel, count: state.resources.fuel },
      { id: "energy", name: "에너지", detail: "시설 가동", image: GAME_CONFIG.uiAssets.resources.energy, count: state.resources.energy },
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
    Object.values(GAME_CONFIG.crops.varieties).forEach((variety) => GAME_CONFIG.crops.growthStages.forEach((stage) => {
      const unlocked = highestCropXp >= stage.minimumExperience || state.harvestCount > 0;
      const entry = this.document.createElement("article");
      entry.className = "codex-entry";
      entry.classList.toggle("is-locked", !unlocked);
      const image = this.document.createElement("img");
      image.src = variety.stageAssets[stage.id];
      image.alt = unlocked ? `${variety.name} ${stage.name}` : "잠긴 오이";
      const name = this.document.createElement("strong");
      name.textContent = unlocked ? `${variety.name} · ${stage.name}` : "???";
      const detail = this.document.createElement("small");
      detail.textContent = unlocked
        ? `작물 XP ${stage.minimumExperience}부터 만날 수 있어요.`
        : `작물 XP ${stage.minimumExperience}에 발견`;
      entry.append(image, name, detail);
      this.elements.codexList.append(entry);
    }));
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
    const player = getPlayerProgress(state.playerXp);
    const eligibility = canPurchaseGarden(state);
    const nextPlot = state.plots.length + 1;
    const maximum = getMaximumPlotsForLevel(player.level);
    const reachedAbsoluteMaximum = nextPlot > GAME_CONFIG.board.maximumPurchasablePlots;
    const reachedLevelMaximum = nextPlot > maximum;

    this.elements.shopPhaseNote.textContent = state.turn.phase === "preparation"
      ? "장비를 정비하고 씨앗을 준비하세요."
      : "턴 중에도 구매할 수 있습니다. 상점을 보는 동안 농장은 잠시 멈춥니다.";
    this.elements.salePrice.textContent = formatNumber(
      GAME_CONFIG.economy.cucumberSalePrice
    );
    this.elements.sellAllButton.disabled = state.cucumbers <= 0;
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
      button.disabled = player.level < definition.unlockLevel || state.coins < definition.price;
      card.append(image, copy, button);
      this.elements.facilityShopList.append(card);
    });

    this.elements.consumableShopList.replaceChildren();
    Object.values(GAME_CONFIG.economy.consumables).forEach((item) => {
      const card = this.document.createElement("article");
      card.className = "shop-item";
      const icon = this.document.createElement("img");
      icon.src = item.asset;
      icon.alt = "";
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
      button.disabled = state.coins < item.price;
      card.append(icon, copy, button);
      this.elements.consumableShopList.append(card);
    });

    this.elements.seedShopList.replaceChildren();
    Object.values(GAME_CONFIG.economy.seeds).forEach((item) => {
      const card = this.document.createElement("article");
      card.className = "shop-item shop-item--seed";
      const image = this.document.createElement("img");
      image.src = item.asset;
      image.alt = "";
      const copy = this.document.createElement("div");
      const name = this.document.createElement("strong");
      name.textContent = item.name;
      const detail = this.document.createElement("small");
      detail.textContent = `${formatNumber(item.price)}코인 · 오이 씨앗`;
      copy.append(name, detail);
      const button = this.document.createElement("button");
      button.type = "button";
      button.dataset.buySeed = item.id;
      button.textContent = `구매 ×${formatNumber(state.seeds[item.id] ?? 0)}`;
      button.disabled = state.coins < item.price;
      card.append(image, copy, button);
      this.elements.seedShopList.append(card);
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
    const isPreparation = state.turn.phase === "preparation";
    this.elements.dayLabel.textContent = PHASE_LABELS[state.turn.phase];
    this.elements.dayLabel.hidden = isPreparation;
    this.elements.turnTimer.textContent = formatTimer(remaining);
    this.elements.turnTimer.hidden = isPreparation;
    this.elements.nextDayButton.hidden = !isPreparation;
    this.elements.nextDayButton.parentElement?.classList.toggle("is-preparation", isPreparation);
    this.elements.waterCount.textContent = formatNumber(state.resources.water);
    this.elements.fuelCount.textContent = formatNumber(state.resources.fuel);
    this.elements.energyCount.textContent = formatNumber(state.resources.energy);
    this.elements.wateringCanStatus.textContent =
      `+${GAME_CONFIG.tools.wateringCan.cropXp}XP`;
    this.elements.hammerStatus.textContent =
      `파워${GAME_CONFIG.tools.hammer.damage}`;
    this.elements.wateringCanMeter.style.width = `${Math.min(100, (state.toolStatus.wateringCanCharge / GAME_CONFIG.tools.wateringCan.capacity) * 100)}%`;
    this.elements.hammerDurabilityMeter.style.width = `${Math.min(100, (state.toolStatus.hammerUsesRemaining / GAME_CONFIG.tools.hammer.usesPerItem) * 100)}%`;
    this.elements.hammerQuantity.textContent = `×${formatNumber(state.inventory.hammer)}`;
    this.elements.hammerQuantity.setAttribute("aria-label", `보유 뿅망치 ${formatNumber(state.inventory.hammer)}개`);
    this.elements.waterTankStatus.textContent = `물 ${formatNumber(state.resources.water)}`;
    this.elements.waterTankMeter.style.width = `${Math.min(100, (state.resources.water / 120) * 100)}%`;
    this.elements.waterTankButton.disabled = false;
    this.renderGeneratorStation(state, now);
    this.elements.townBountyStatus.textContent = `보상금 ${formatNumber(state.bounties.pendingCoins)}코인`;
    this.elements.gameApp.classList.remove("phase-day", "phase-night", "phase-preparation");
    this.elements.gameApp.classList.add(`phase-${state.turn.phase}`);
    this.elements.gameApp.classList.toggle("is-sunlight-boost", state.effects.sunlightBoostEndsAt > now);
    this.ensurePlotViews(state);
    state.plots.forEach((plot) => this.renderPlot(state, plot, now));
    this.renderFacilityRanges(state);
    this.renderThreats(state, now);
    if (renderMenus) {
      this.renderSeedTray(state);
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
      shop: ["FARM MARKET", "농장 상점"],
      village: ["CUCUMBER VILLAGE", "오이 마을"],
      settings: ["GAME OPTIONS", "설정"],
    };
    if (!titles[scene]) return;
    this.lastModalTrigger = trigger;
    this.currentScene = scene;
    if (this.currentState) this.render(this.currentState, { renderMenus: true });
    this.elements.sceneEyebrow.textContent = titles[scene][0];
    this.elements.sceneTitle.textContent = titles[scene][1];
    this.elements.sceneLayer.dataset.scene = scene;
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
    delete this.elements.sceneLayer.dataset.scene;
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

  showPhaseBanner(phase, day) {
    if (!["day", "night"].includes(phase)) return;
    const windowRef = this.document.defaultView;
    windowRef?.clearTimeout(this.phaseBannerTimer);
    this.elements.phaseBanner.dataset.phase = phase;
    this.elements.phaseBannerDay.textContent = "MALLIN FARM";
    this.elements.phaseBannerTitle.textContent = phase === "day" ? "낮" : "밤";
    this.elements.phaseBannerSubtitle.textContent = phase === "day"
      ? "햇살과 함께 농장 일이 시작됩니다"
      : "달빛 아래 더 많은 위협이 몰려옵니다";
    this.elements.phaseBanner.hidden = false;
    this.elements.phaseBanner.classList.remove("is-active");
    windowRef?.requestAnimationFrame?.(() => {
      this.elements.phaseBanner.classList.add("is-active");
    });
    this.phaseBannerTimer = windowRef?.setTimeout(() => {
      this.elements.phaseBanner.hidden = true;
      this.elements.phaseBanner.classList.remove("is-active");
    }, 1_650);
  }

  showTurnReport(report) {
    if (!report) return;
    this.elements.turnReportTitle.textContent = "농장 보고";
    this.elements.reportHarvest.textContent = formatNumber(report.harvestedCucumbers);
    this.elements.reportCropXp.textContent = formatNumber(report.cropXp);
    this.elements.reportPlayerXp.textContent = formatNumber(report.playerXp);
    this.elements.reportAnimals.textContent = formatNumber(report.animalsDefeated);
    this.elements.reportThieves.textContent = formatNumber(report.thievesDefeated);
    this.elements.reportBounty.textContent = formatNumber(report.bountyCoins);
    this.elements.turnReportModal.hidden = false;
    this.elements.turnReportConfirmButton.focus();
  }

  hideTurnReport() {
    this.elements.turnReportModal.hidden = true;
  }

  showExitConfirm() {
    this.elements.exitModal.hidden = false;
    this.elements.exitCancelButton.focus();
  }

  hideExitConfirm() {
    this.elements.exitModal.hidden = true;
  }

  closeTopLayer() {
    if (!this.elements.turnReportModal.hidden) {
      this.hideTurnReport();
      return "turn-report";
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
      !this.elements.turnReportModal.hidden ||
      !this.elements.exitModal.hidden ||
      !this.elements.startScreen.hidden
    );
  }

  shouldPauseGameClock() {
    return (
      !this.elements.sceneLayer.hidden ||
      !this.elements.turnReportModal.hidden ||
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
    const windowRef = this.document.defaultView;
    const schedule = windowRef?.setTimeout?.bind(windowRef) ?? globalThis.setTimeout;
    this.elements.cloudTransition.hidden = false;
    this.elements.cloudTransition.classList.remove("is-covering", "is-opening");
    void this.elements.cloudTransition.offsetWidth;
    this.elements.cloudTransition.classList.add("is-covering");
    return new Promise((resolve) => {
      schedule(() => {
        this.elements.startScreen.hidden = true;
        this.elements.cloudTransition.classList.remove("is-covering");
        this.elements.cloudTransition.classList.add("is-opening");
      }, 640);
      schedule(() => {
        this.elements.cloudTransition.hidden = true;
        this.elements.cloudTransition.classList.remove("is-opening");
        resolve();
      }, 1_280);
    });
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
    const x = (plotRect?.left ?? 0) - layerRect.left + (plotRect?.width ?? 100) * 0.72;
    const y = (plotRect?.top ?? 0) - layerRect.top + (plotRect?.height ?? 140) * 0.31;
    const effect = this.takeEffectFromPool(this.wateringEffectPool, 5, () => {
      const root = this.document.createElement("span");
      root.className = "watering-action-effect";
      root.hidden = true;
      const can = this.document.createElement("img");
      can.src = GAME_CONFIG.tools.wateringCan.asset;
      can.alt = "";
      const stream = this.document.createElement("span");
      stream.className = "water-stream-sprite";
      root.append(can, stream);
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

  playHarvestReward(plotId, amount) {
    const view = this.plotViews.get(plotId);
    if (!view || amount <= 0) return;
    const layerRect = this.elements.feedbackLayer.getBoundingClientRect?.() ?? { left: 0, top: 0 };
    const plotRect = view.root.getBoundingClientRect?.();
    const effect = this.document.createElement("span");
    effect.className = "harvest-gain";
    const image = this.document.createElement("img");
    image.src = GAME_CONFIG.uiAssets.resources.cucumber;
    image.alt = "";
    const value = this.document.createElement("strong");
    value.textContent = `+${formatNumber(amount)}`;
    effect.append(image, value);
    effect.style.left = `${(plotRect?.left ?? 0) - layerRect.left + (plotRect?.width ?? 100) / 2}px`;
    effect.style.top = `${(plotRect?.top ?? 0) - layerRect.top + (plotRect?.height ?? 120) * .42}px`;
    this.elements.feedbackLayer.append(effect);
    const remove = () => effect.remove();
    effect.addEventListener("animationend", remove, { once: true });
    this.document.defaultView?.setTimeout(remove, 1_100);
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

  playPlotDamage(plotId, amount, kind = "yield") {
    const view = this.plotViews.get(plotId);
    if (!view || amount <= 0) return;
    const layerRect = this.elements.feedbackLayer.getBoundingClientRect?.() ?? {
      left: 0,
      top: 0,
    };
    const plotRect = view.root.getBoundingClientRect?.();
    const effect = this.document.createElement("span");
    effect.className = "damage-gain";
    effect.textContent = `-${formatNumber(amount)}`;
    effect.dataset.kind = kind;
    effect.style.left = `${(plotRect?.left ?? 0) - layerRect.left + (plotRect?.width ?? 100) / 2}px`;
    effect.style.top = `${(plotRect?.top ?? 0) - layerRect.top + (plotRect?.height ?? 120) * 0.42}px`;
    this.elements.feedbackLayer.append(effect);
    const remove = () => effect.remove();
    effect.addEventListener("animationend", remove, { once: true });
    this.document.defaultView?.setTimeout(remove, 1_050);
    view.root.classList.remove("is-feedback-error");
    view.root.classList.add("is-feedback-error");
    this.document.defaultView?.setTimeout(
      () => view.root.classList.remove("is-feedback-error"),
      360
    );
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
