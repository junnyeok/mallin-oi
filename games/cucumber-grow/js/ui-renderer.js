import { GAME_CONFIG } from "./game-config.js";
import {
  formatDuration,
  formatExactNumber,
  formatNumber,
} from "./number-format.js";
import { getGrowthProgress } from "./game-engine.js";
import {
  createWholeXpGainAccumulator,
  showXpGain as showXpGainEffect,
} from "./xp-gain-effect.js?v=20260730-05";
import { CropTransitionController } from "./crop-transition.js?v=20260730-05";

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

// Pixel anchors are measured from the first visible alpha edge in each 444px frame.
export const WATER_SPRITE_CONFIG = Object.freeze({
  assetPath: "./assets/images/water.png",
  sheetWidth: 1776,
  sheetHeight: 888,
  columns: 4,
  rows: 2,
  frameCount: 8,
  frameWidth: 444,
  frameHeight: 444,
  animationDurationMs: 820,
  waterVisibleAtPercent: 12,
  frameStartPixels: Object.freeze([
    Object.freeze({ x: 91, y: 111 }),
    Object.freeze({ x: 78, y: 111 }),
    Object.freeze({ x: 63, y: 111 }),
    Object.freeze({ x: 62, y: 111 }),
    Object.freeze({ x: 68, y: 75 }),
    Object.freeze({ x: 60, y: 76 }),
    Object.freeze({ x: 51, y: 99 }),
    Object.freeze({ x: 53, y: 104 }),
  ]),
  // Alpha >= 32 union after every frame is translated to the shared start anchor.
  alignedVisibleBoundsPixel: Object.freeze({
    left: 88,
    top: 108,
    right: 412,
    bottom: 373,
  }),
  alignedPeakImpactPixel: Object.freeze({ x: 313, y: 368 }),
});

export const WATERING_CAN_CONFIG = Object.freeze({
  imageWidth: 1254,
  imageHeight: 1254,
  nozzleExitPixel: Object.freeze({ x: 84, y: 770 }),
  visibleBoundsPixel: Object.freeze({
    left: 84,
    top: 141,
    right: 1157,
    bottom: 1084,
  }),
  pivot: Object.freeze({ x: 0.44, y: 0.55 }),
  tiltDegrees: 16,
  tiltReachedAtPercent: 10,
});

const DEFAULT_WATERING_POINT = Object.freeze({ x: 0.35, y: 0.26 });

function mergeBounds(...boundsList) {
  return {
    left: Math.min(...boundsList.map((bounds) => bounds.left)),
    top: Math.min(...boundsList.map((bounds) => bounds.top)),
    right: Math.max(...boundsList.map((bounds) => bounds.right)),
    bottom: Math.max(...boundsList.map((bounds) => bounds.bottom)),
  };
}

function fitAxisToBounds(value, minimum, maximum) {
  return minimum <= maximum ? clamp(value, minimum, maximum) : (minimum + maximum) / 2;
}

export function getWaterFrameTranslation(frameIndex) {
  const reference = WATER_SPRITE_CONFIG.frameStartPixels[0];
  const frameStart = WATER_SPRITE_CONFIG.frameStartPixels[frameIndex];

  if (!frameStart) {
    throw new RangeError(`Unknown water frame index: ${frameIndex}`);
  }

  return {
    x:
      ((reference.x - frameStart.x) / WATER_SPRITE_CONFIG.frameWidth) *
      100,
    y:
      ((reference.y - frameStart.y) / WATER_SPRITE_CONFIG.frameHeight) *
      100,
  };
}

export function getTiltedCanNozzleOffset(canSize) {
  const nozzleX =
    1 -
    WATERING_CAN_CONFIG.nozzleExitPixel.x / WATERING_CAN_CONFIG.imageWidth;
  const nozzleY =
    WATERING_CAN_CONFIG.nozzleExitPixel.y / WATERING_CAN_CONFIG.imageHeight;
  const angle = (WATERING_CAN_CONFIG.tiltDegrees * Math.PI) / 180;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const deltaX = nozzleX - WATERING_CAN_CONFIG.pivot.x;
  const deltaY = nozzleY - WATERING_CAN_CONFIG.pivot.y;
  const rotatedX =
    WATERING_CAN_CONFIG.pivot.x + deltaX * cosine - deltaY * sine;
  const rotatedY =
    WATERING_CAN_CONFIG.pivot.y + deltaX * sine + deltaY * cosine;

  return {
    x: (rotatedX - 0.5) * canSize,
    y: (rotatedY - 0.5) * canSize,
  };
}

export function getWateringCanVisibleBounds(canSize) {
  const visible = WATERING_CAN_CONFIG.visibleBoundsPixel;
  const mirroredLeft =
    1 - visible.right / WATERING_CAN_CONFIG.imageWidth;
  const mirroredRight =
    1 - visible.left / WATERING_CAN_CONFIG.imageWidth;
  const top = visible.top / WATERING_CAN_CONFIG.imageHeight;
  const bottom = visible.bottom / WATERING_CAN_CONFIG.imageHeight;
  const corners = [
    { x: mirroredLeft, y: top },
    { x: mirroredRight, y: top },
    { x: mirroredRight, y: bottom },
    { x: mirroredLeft, y: bottom },
  ];
  const points = [];

  for (
    let degrees = 0;
    degrees <= WATERING_CAN_CONFIG.tiltDegrees;
    degrees += 1
  ) {
    const angle = (degrees * Math.PI) / 180;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);

    corners.forEach((corner) => {
      const deltaX = corner.x - WATERING_CAN_CONFIG.pivot.x;
      const deltaY = corner.y - WATERING_CAN_CONFIG.pivot.y;

      points.push({
        x:
          (WATERING_CAN_CONFIG.pivot.x - 0.5 +
            deltaX * cosine -
            deltaY * sine) *
          canSize,
        y:
          (WATERING_CAN_CONFIG.pivot.y - 0.5 +
            deltaX * sine +
            deltaY * cosine) *
          canSize,
      });
    });
  }

  return {
    left: Math.min(...points.map((point) => point.x)),
    top: Math.min(...points.map((point) => point.y)),
    right: Math.max(...points.map((point) => point.x)),
    bottom: Math.max(...points.map((point) => point.y)),
  };
}

export function getWateringSide(pointerClientX, sceneRect) {
  const sceneMidpointX = sceneRect.left + sceneRect.width / 2;

  return pointerClientX < sceneMidpointX ? "left" : "right";
}

export function calculateWateringLayout(sceneRect, pointer = {}) {
  const sceneWidth = Math.max(sceneRect.width, 1);
  const sceneHeight = Math.max(sceneRect.height, 1);
  const hasNormalizedPoint =
    Number.isFinite(pointer.normalizedX) &&
    Number.isFinite(pointer.normalizedY);
  const requestedX = clamp(
    hasNormalizedPoint
      ? pointer.normalizedX * sceneWidth
      : Number.isFinite(pointer.clientX)
        ? pointer.clientX - sceneRect.left
        : DEFAULT_WATERING_POINT.x * sceneWidth,
    0,
    sceneWidth
  );
  const requestedY = clamp(
    hasNormalizedPoint
      ? pointer.normalizedY * sceneHeight
      : Number.isFinite(pointer.clientY)
        ? pointer.clientY - sceneRect.top
        : DEFAULT_WATERING_POINT.y * sceneHeight,
    0,
    sceneHeight
  );
  const normalizedX = requestedX / sceneWidth;
  const normalizedY = requestedY / sceneHeight;
  const safeMargin = clamp(Math.min(sceneWidth, sceneHeight) * 0.02, 4, 8);
  const canSize = clamp(
    Math.min(sceneWidth * 0.3, sceneHeight * 0.3),
    36,
    54
  );
  const side = getWateringSide(sceneRect.left + requestedX, sceneRect);
  const directionSign = side === "left" ? 1 : -1;
  const nozzleOffset = getTiltedCanNozzleOffset(canSize);
  const frameStart = WATER_SPRITE_CONFIG.frameStartPixels[0];
  const peakImpact = WATER_SPRITE_CONFIG.alignedPeakImpactPixel;
  const frameStartX = frameStart.x / WATER_SPRITE_CONFIG.frameWidth;
  const frameStartY = frameStart.y / WATER_SPRITE_CONFIG.frameHeight;
  const peakImpactX = peakImpact.x / WATER_SPRITE_CONFIG.frameWidth;
  const peakImpactY = peakImpact.y / WATER_SPRITE_CONFIG.frameHeight;
  const spriteWidth = canSize * 2.35;
  const spriteHeight = spriteWidth;
  const spriteLeft = nozzleOffset.x - spriteWidth * frameStartX;
  const spriteTop = nozzleOffset.y - spriteHeight * frameStartY;
  const waterVisible = WATER_SPRITE_CONFIG.alignedVisibleBoundsPixel;
  const canVisibleBounds = getWateringCanVisibleBounds(canSize);
  const waterVisibleBounds = {
    left:
      spriteLeft +
      spriteWidth * (waterVisible.left / WATER_SPRITE_CONFIG.frameWidth),
    top:
      spriteTop +
      spriteHeight * (waterVisible.top / WATER_SPRITE_CONFIG.frameHeight),
    right:
      spriteLeft +
      spriteWidth * (waterVisible.right / WATER_SPRITE_CONFIG.frameWidth),
    bottom:
      spriteTop +
      spriteHeight * (waterVisible.bottom / WATER_SPRITE_CONFIG.frameHeight),
  };
  const directionalBounds = mergeBounds(canVisibleBounds, waterVisibleBounds);
  const mirroredDirectionalBounds =
    side === "left"
      ? directionalBounds
      : {
          left: -directionalBounds.right,
          top: directionalBounds.top,
          right: -directionalBounds.left,
          bottom: directionalBounds.bottom,
        };
  const gainHalfWidth = Math.max(24, canSize * 0.46);
  const gainBounds = {
    left: -gainHalfWidth,
    top: -Math.max(44, canSize * 0.78),
    right: gainHalfWidth,
    bottom: 0,
  };
  const localEffectBounds = mergeBounds(
    mirroredDirectionalBounds,
    gainBounds
  );
  const minimumCanX = safeMargin - localEffectBounds.left;
  const maximumCanX = sceneWidth - safeMargin - localEffectBounds.right;
  const minimumCanY = safeMargin - localEffectBounds.top;
  const maximumCanY = sceneHeight - safeMargin - localEffectBounds.bottom;
  const canX = fitAxisToBounds(requestedX, minimumCanX, maximumCanX);
  const canY = fitAxisToBounds(requestedY, minimumCanY, maximumCanY);
  const nozzleX = canX + nozzleOffset.x * directionSign;
  const nozzleY = canY + nozzleOffset.y;
  const spriteStartX =
    canX + directionSign * (spriteLeft + spriteWidth * frameStartX);
  const spriteStartY = canY + spriteTop + spriteHeight * frameStartY;
  const spriteImpactX =
    canX + directionSign * (spriteLeft + spriteWidth * peakImpactX);
  const spriteImpactY = canY + spriteTop + spriteHeight * peakImpactY;
  const correctionX = canX - requestedX;
  const correctionY = canY - requestedY;
  const effectBounds = {
    left: canX + localEffectBounds.left,
    top: canY + localEffectBounds.top,
    right: canX + localEffectBounds.right,
    bottom: canY + localEffectBounds.bottom,
  };

  return {
    side,
    inputX: requestedX,
    inputY: requestedY,
    normalizedX,
    normalizedY,
    canX,
    canY,
    canSize,
    nozzleX,
    nozzleY,
    spriteLeft,
    spriteTop,
    spriteWidth,
    spriteHeight,
    spriteStartX,
    spriteStartY,
    spriteImpactX,
    spriteImpactY,
    splashX: spriteImpactX,
    splashY: spriteImpactY,
    directionX: spriteImpactX - nozzleX,
    directionY: spriteImpactY - nozzleY,
    correctionX,
    correctionY,
    correctionDistance: Math.hypot(correctionX, correctionY),
    safeMargin,
    localEffectBounds,
    effectBounds,
    canTiltDegrees: WATERING_CAN_CONFIG.tiltDegrees,
    visualTiltDegrees:
      WATERING_CAN_CONFIG.tiltDegrees * (side === "left" ? 1 : -1),
    mirrorScaleX: side === "left" ? 1 : -1,
    mirrorScaleY: 1,
  };
}

export class UIRenderer {
  constructor(documentRoot = document) {
    this.document = documentRoot;
    this.elements = {
      cucumberCount: documentRoot.querySelector("#cucumberCount"),
      productionRate: documentRoot.querySelector("#productionRate"),
      touchYield: documentRoot.querySelector("#touchYield"),
      menuButton: documentRoot.querySelector("#menuButton"),
      plotList: documentRoot.querySelector("#plotList"),
      gardenEmptyLand: documentRoot.querySelector("#gardenEmptyLand"),
      menuModal: documentRoot.querySelector("#menuModal"),
      menuCloseButton: documentRoot.querySelector("#menuCloseButton"),
      menuPanel: documentRoot.querySelector("#menuPanel"),
      shopPanel: documentRoot.querySelector("#shopPanel"),
      shopMenuButton: documentRoot.querySelector("#shopMenuButton"),
      shopBackButton: documentRoot.querySelector("#shopBackButton"),
      gardenShopItem: documentRoot.querySelector("#gardenShopItem"),
      gardenShopTitle: documentRoot.querySelector("#gardenShopTitle"),
      gardenShopDescription: documentRoot.querySelector(
        "#gardenShopDescription"
      ),
      gardenShopPrice: documentRoot.querySelector("#gardenShopPrice"),
      gardenPurchaseButton: documentRoot.querySelector(
        "#gardenPurchaseButton"
      ),
      offlineModal: documentRoot.querySelector("#offlineModal"),
      offlineDuration: documentRoot.querySelector("#offlineDuration"),
      offlineReward: documentRoot.querySelector("#offlineReward"),
      offlineConfirmButton: documentRoot.querySelector("#offlineConfirmButton"),
      announcement: documentRoot.querySelector("#gameAnnouncement"),
    };
    this.plotViews = new Map();
    this.slotViews = new Map();
    this.currentState = null;
    this.pendingOfflineAllocations = [];
    this.lastModalTrigger = null;
    this.purchasePending = false;
    this.plotObserver = this.createPlotObserver();
    this.handleWateringResize = () => {
      this.slotViews.forEach((view) => {
        if (!view.wateringEffect.root.classList.contains("is-playing")) {
          return;
        }

        this.positionWateringEffect(view, view.wateringEffect.inputPoint);
      });
    };
    this.document.defaultView?.addEventListener(
      "resize",
      this.handleWateringResize
    );

    this.elements.offlineConfirmButton.addEventListener("click", () => {
      this.hideOfflineReward({ showGain: true });
    });
  }

  getSlotKey(plotId, slotId) {
    return `${plotId}\u0000${slotId}`;
  }

  createPlotObserver() {
    const WindowIntersectionObserver =
      this.document.defaultView?.IntersectionObserver;

    if (typeof WindowIntersectionObserver !== "function") return null;

    return new WindowIntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.dataset.visible = String(entry.isIntersecting);
        });
      },
      { rootMargin: "160px 0px" }
    );
  }

  buildWateringEffect(effectLayer) {
    const root = this.document.createElement("span");
    const mirror = this.document.createElement("span");
    const canPivot = this.document.createElement("span");
    const wateringCan = this.document.createElement("img");
    const spriteAnchor = this.document.createElement("span");
    const waterSprite = this.document.createElement("span");

    root.className = "touch-burst touch-burst--watering";
    mirror.className = "watering-effect__mirror";
    canPivot.className = "watering-effect__can-pivot";
    root.style.setProperty(
      "--water-can-pivot-x",
      `${WATERING_CAN_CONFIG.pivot.x * 100}%`
    );
    root.style.setProperty(
      "--water-can-pivot-y",
      `${WATERING_CAN_CONFIG.pivot.y * 100}%`
    );
    root.style.setProperty(
      "--water-can-tilt",
      `${WATERING_CAN_CONFIG.tiltDegrees}deg`
    );
    wateringCan.className = "watering-effect__can";
    wateringCan.src = "./assets/images/water-gun.png";
    wateringCan.alt = "";
    wateringCan.draggable = false;
    spriteAnchor.className = "watering-effect__sprite-anchor";
    waterSprite.className = "watering-effect__sprite";
    waterSprite.style.backgroundImage = `url("${WATER_SPRITE_CONFIG.assetPath}")`;
    waterSprite.style.setProperty(
      "--water-sprite-sheet-width",
      `${WATER_SPRITE_CONFIG.columns * 100}%`
    );
    waterSprite.style.setProperty(
      "--water-sprite-sheet-height",
      `${WATER_SPRITE_CONFIG.rows * 100}%`
    );
    waterSprite.style.setProperty(
      "--water-sprite-animation-duration",
      `${WATER_SPRITE_CONFIG.animationDurationMs}ms`
    );
    WATER_SPRITE_CONFIG.frameStartPixels.forEach((unusedFrame, frameIndex) => {
      const translation = getWaterFrameTranslation(frameIndex);
      const frameNumber = frameIndex + 1;
      waterSprite.style.setProperty(
        `--water-frame-${frameNumber}-offset-x`,
        `${translation.x}%`
      );
      waterSprite.style.setProperty(
        `--water-frame-${frameNumber}-offset-y`,
        `${translation.y}%`
      );
    });
    waterSprite.dataset.frameCount = String(WATER_SPRITE_CONFIG.frameCount);
    canPivot.append(wateringCan);
    spriteAnchor.append(waterSprite);
    mirror.append(canPivot, spriteAnchor);
    root.append(mirror);
    effectLayer.append(root);

    return { root, waterSprite, inputPoint: null };
  }

  createSlotView(plot, slot, plotIndex, slotIndex) {
    const button = this.document.createElement("button");
    const soilMark = this.document.createElement("span");
    const emptyCue = this.document.createElement("span");
    const progress = this.document.createElement("span");
    const progressFill = this.document.createElement("span");
    const characterImage = this.document.createElement("img");
    const transitionLayer = this.document.createElement("span");
    const xpGainLayer = this.document.createElement("span");
    const touchEffects = this.document.createElement("span");

    button.type = "button";
    button.className = "crop-slot";
    button.dataset.plotId = plot.plotId;
    button.dataset.slotId = slot.slotId;
    button.dataset.slotIndex = String(slotIndex + 1);
    soilMark.className = "crop-slot__soil-mark";
    soilMark.setAttribute("aria-hidden", "true");
    emptyCue.className = "crop-slot__empty-cue";
    emptyCue.setAttribute("aria-hidden", "true");
    progress.className = "crop-xp-bar";
    progress.setAttribute("role", "progressbar");
    progress.setAttribute("aria-valuemin", "0");
    progress.setAttribute(
      "aria-valuemax",
      String(GAME_CONFIG.harvestExperience)
    );
    progressFill.className = "crop-xp-bar__fill";
    progress.append(progressFill);
    characterImage.className = "cucumber-character";
    characterImage.width = 1254;
    characterImage.height = 1254;
    characterImage.alt = "";
    characterImage.draggable = false;
    characterImage.decoding = "async";
    transitionLayer.className = "crop-transition-layer";
    transitionLayer.setAttribute("aria-hidden", "true");
    xpGainLayer.className = "xp-gain-layer";
    xpGainLayer.setAttribute("aria-hidden", "true");
    touchEffects.className = "touch-effects";
    touchEffects.setAttribute("aria-hidden", "true");
    button.append(
      soilMark,
      emptyCue,
      progress,
      characterImage,
      transitionLayer,
      xpGainLayer,
      touchEffects
    );

    const controller = new CropTransitionController({
      characterZone: button,
      characterButton: button,
      characterImage,
      effectLayer: transitionLayer,
      stages: GAME_CONFIG.growthStages,
      documentRef: this.document,
      windowRef: this.document.defaultView,
    });
    const wateringEffect = this.buildWateringEffect(touchEffects);
    const view = {
      key: this.getSlotKey(plot.plotId, slot.slotId),
      plotId: plot.plotId,
      slotId: slot.slotId,
      plotIndex,
      slotIndex,
      button,
      progress,
      progressFill,
      characterImage,
      transitionLayer,
      xpGainLayer,
      touchEffects,
      controller,
      wateringEffect,
      productionAccumulator: createWholeXpGainAccumulator(),
      characterTapTimer: null,
      transitionPromise: null,
    };

    wateringEffect.waterSprite.addEventListener("animationend", () =>
      this.resetWateringEffect(view)
    );
    this.slotViews.set(view.key, view);
    return view;
  }

  createPlotView(plot, plotIndex) {
    const article = this.document.createElement("article");
    const label = this.document.createElement("span");
    const bed = this.document.createElement("div");
    const slotGrid = this.document.createElement("div");

    article.className = "garden-plot";
    article.dataset.plotId = plot.plotId;
    article.dataset.plotType = plot.type;
    article.dataset.visible = "true";
    label.className = "garden-plot__label";
    label.textContent = `텃밭 ${plotIndex + 1}`;
    bed.className = "garden-plot__bed";
    slotGrid.className = "crop-slot-grid";
    slotGrid.setAttribute(
      "aria-label",
      `텃밭 ${plotIndex + 1}, 작물 슬롯 4개`
    );
    plot.slots.forEach((slot, slotIndex) => {
      const slotView = this.createSlotView(
        plot,
        slot,
        plotIndex,
        slotIndex
      );

      slotGrid.append(slotView.button);
    });
    bed.append(slotGrid);
    article.append(label, bed);
    this.plotObserver?.observe(article);
    this.plotViews.set(plot.plotId, { article, label, slotGrid });
    return article;
  }

  removePlotView(plotId) {
    const plotView = this.plotViews.get(plotId);

    if (!plotView) return;

    this.plotObserver?.unobserve(plotView.article);
    [...this.slotViews.values()]
      .filter((view) => view.plotId === plotId)
      .forEach((view) => {
        view.controller.suspend();
        this.resetWateringEffect(view);
        this.document.defaultView?.clearTimeout(view.characterTapTimer);
        this.slotViews.delete(view.key);
      });
    plotView.article.remove();
    this.plotViews.delete(plotId);
  }

  ensurePlotViews(state) {
    const currentPlotIds = new Set(state.plots.map((plot) => plot.plotId));

    [...this.plotViews.keys()].forEach((plotId) => {
      if (!currentPlotIds.has(plotId)) this.removePlotView(plotId);
    });

    state.plots.forEach((plot, plotIndex) => {
      let plotView = this.plotViews.get(plot.plotId);

      if (!plotView) {
        const article = this.createPlotView(plot, plotIndex);
        this.elements.plotList.append(article);
        plotView = this.plotViews.get(plot.plotId);
      } else {
        this.elements.plotList.append(plotView.article);
      }

      plotView.label.textContent = `텃밭 ${plotIndex + 1}`;
      plotView.slotGrid.setAttribute(
        "aria-label",
        `텃밭 ${plotIndex + 1}, 작물 슬롯 4개`
      );
    });
  }

  getSlotView(plotId, slotId) {
    return this.slotViews.get(this.getSlotKey(plotId, slotId)) ?? null;
  }

  trackTransition(view, transitionPromise) {
    if (!view || !transitionPromise || view.transitionPromise === transitionPromise) {
      return transitionPromise;
    }

    view.transitionPromise = transitionPromise;
    transitionPromise.finally(() => {
      if (view.transitionPromise !== transitionPromise) return;

      view.transitionPromise = null;
      if (this.currentState) this.render(this.currentState);
    });
    return transitionPromise;
  }

  renderSlot(state, plot, slot, plotIndex, slotIndex) {
    const view = this.getSlotView(plot.plotId, slot.slotId);

    if (!view) return;

    const progress = getGrowthProgress(slot.xp);
    const { stage } = progress;
    const isPlanted = slot.isPlanted === true;
    const isHarvestReady = isPlanted && progress.isHarvestReady;
    const transition = view.controller.syncState({ isPlanted, stage });

    if (view.controller.isBusy) {
      this.trackTransition(view, transition);
    }

    view.plotIndex = plotIndex;
    view.slotIndex = slotIndex;
    view.button.dataset.stageId = stage.id;
    view.button.dataset.stageLevel = String(stage.level);
    view.button.dataset.empty = String(!isPlanted);
    view.button.dataset.harvestReady = String(isHarvestReady);
    view.button.disabled = view.controller.isBusy;
    view.progress.hidden = !isPlanted;
    view.progress.style.setProperty(
      "--crop-progress",
      `${progress.progressPercent}%`
    );
    view.progressFill.style.width = `${progress.progressPercent}%`;
    view.progress.setAttribute(
      "aria-valuenow",
      String(progress.experience)
    );
    view.progress.setAttribute(
      "aria-valuetext",
      `${formatExactNumber(progress.experience)} / ${formatExactNumber(
        GAME_CONFIG.harvestExperience
      )} 경험치`
    );
    view.progress.setAttribute(
      "aria-label",
      `텃밭 ${plotIndex + 1} ${slotIndex + 1}번 오이 성장 경험치`
    );

    const location = `텃밭 ${plotIndex + 1}, ${slotIndex + 1}번 슬롯`;
    const actionLabel = !isPlanted
      ? `${location}, 빈 슬롯, 새싹 심기`
      : isHarvestReady
        ? `${location}, 어른오이, 경험치 ${formatExactNumber(
            progress.experience
          )}/${GAME_CONFIG.harvestExperience}, 수확하기`
        : `${location}, ${stage.name}, 경험치 ${formatExactNumber(
            progress.experience
          )}/${GAME_CONFIG.harvestExperience}, 물주기 ${formatExactNumber(
            state.touchYield
          )} 경험치`;

    view.button.setAttribute("aria-label", actionLabel);
  }

  renderShop(state) {
    const freeAvailable =
      !state.hasClaimedFreeGarden && state.plots.length === 0;

    this.elements.gardenShopItem.dataset.mode = freeAvailable
      ? "free"
      : "pending";
    this.elements.gardenShopTitle.textContent = freeAvailable
      ? "첫 텃밭"
      : "추가 텃밭";
    this.elements.gardenShopDescription.textContent = freeAvailable
      ? "작물 슬롯 4개"
      : "가격 확정 후 이용 가능";
    this.elements.gardenShopPrice.textContent = freeAvailable
      ? "무료"
      : "준비 중";
    this.elements.gardenPurchaseButton.disabled =
      this.purchasePending || !freeAvailable;
    this.elements.gardenPurchaseButton.textContent = this.purchasePending
      ? "구매 중"
      : freeAvailable
        ? "무료 구매"
        : "구매 준비 중";
  }

  render(state) {
    this.currentState = state;
    const formattedBalance = formatNumber(state.cucumbers);

    this.elements.cucumberCount.textContent = formattedBalance;
    this.elements.cucumberCount.title = `${formatExactNumber(
      state.cucumbers
    )}개`;
    this.elements.productionRate.textContent = formatNumber(state.perSecond);
    this.elements.touchYield.textContent = formatNumber(state.touchYield);
    this.ensurePlotViews(state);
    this.elements.gardenEmptyLand.hidden = state.plots.length > 0;

    state.plots.forEach((plot, plotIndex) => {
      plot.slots.forEach((slot, slotIndex) =>
        this.renderSlot(state, plot, slot, plotIndex, slotIndex)
      );
    });
    this.renderShop(state);
  }

  setPurchasePending(pending) {
    this.purchasePending = pending === true;
    if (this.currentState) this.renderShop(this.currentState);
  }

  openMenu(trigger = this.elements.menuButton) {
    this.lastModalTrigger = trigger;
    this.showMenuPanel();
    this.elements.menuModal.hidden = false;
    this.elements.menuCloseButton.focus();
  }

  closeMenu() {
    this.elements.menuModal.hidden = true;
    this.lastModalTrigger?.focus?.();
    this.lastModalTrigger = null;
  }

  showMenuPanel() {
    this.elements.menuPanel.hidden = false;
    this.elements.shopPanel.hidden = true;
    this.elements.menuModal.setAttribute("aria-labelledby", "menuModalTitle");
  }

  showShopPanel() {
    this.elements.menuPanel.hidden = true;
    this.elements.shopPanel.hidden = false;
    this.elements.gardenPurchaseButton.focus();
  }

  applyWateringLayout(view, layout) {
    const { root } = view.wateringEffect;

    root.dataset.side = layout.side;
    root.dataset.inputX = String(layout.inputX);
    root.dataset.inputY = String(layout.inputY);
    root.dataset.normalizedX = String(layout.normalizedX);
    root.dataset.normalizedY = String(layout.normalizedY);
    root.dataset.canX = String(layout.canX);
    root.dataset.canY = String(layout.canY);
    root.dataset.nozzleX = String(layout.nozzleX);
    root.dataset.nozzleY = String(layout.nozzleY);
    root.dataset.spriteStartX = String(layout.spriteStartX);
    root.dataset.spriteStartY = String(layout.spriteStartY);
    root.dataset.spriteImpactX = String(layout.spriteImpactX);
    root.dataset.spriteImpactY = String(layout.spriteImpactY);
    root.dataset.splashX = String(layout.splashX);
    root.dataset.splashY = String(layout.splashY);
    root.dataset.directionX = String(layout.directionX);
    root.dataset.directionY = String(layout.directionY);
    root.dataset.correctionX = String(layout.correctionX);
    root.dataset.correctionY = String(layout.correctionY);
    root.dataset.correctionDistance = String(layout.correctionDistance);
    root.dataset.safeMargin = String(layout.safeMargin);
    root.dataset.effectLeft = String(layout.effectBounds.left);
    root.dataset.effectTop = String(layout.effectBounds.top);
    root.dataset.effectRight = String(layout.effectBounds.right);
    root.dataset.effectBottom = String(layout.effectBounds.bottom);
    root.dataset.state = "playing";
    root.style.setProperty("--effect-x", `${layout.canX}px`);
    root.style.setProperty("--effect-y", `${layout.canY}px`);
    root.style.setProperty("--water-can-size", `${layout.canSize}px`);
    root.style.setProperty("--water-sprite-left", `${layout.spriteLeft}px`);
    root.style.setProperty("--water-sprite-top", `${layout.spriteTop}px`);
    root.style.setProperty("--water-sprite-width", `${layout.spriteWidth}px`);
    root.style.setProperty("--water-sprite-height", `${layout.spriteHeight}px`);
    root.style.setProperty("--water-mirror-x", String(layout.mirrorScaleX));
    view.wateringEffect.inputPoint = {
      normalizedX: layout.normalizedX,
      normalizedY: layout.normalizedY,
    };
  }

  positionWateringEffect(view, pointer = null) {
    const sceneRect = view.touchEffects.getBoundingClientRect();
    const layout = calculateWateringLayout(sceneRect, pointer || {});

    this.applyWateringLayout(view, layout);
    return layout;
  }

  resetWateringEffect(view) {
    const { root } = view.wateringEffect;

    root.classList.remove("is-playing");
    root.dataset.state = "idle";
    [
      "--effect-x",
      "--effect-y",
      "--water-can-size",
      "--water-sprite-left",
      "--water-sprite-top",
      "--water-sprite-width",
      "--water-sprite-height",
      "--water-mirror-x",
    ].forEach((property) => root.style.removeProperty(property));
    view.wateringEffect.inputPoint = null;
  }

  isSlotTransitioning(plotId, slotId) {
    return this.getSlotView(plotId, slotId)?.controller.isBusy === true;
  }

  playPlantTransition(
    plotId,
    slotId,
    stage = GAME_CONFIG.growthStages[0]
  ) {
    const view = this.getSlotView(plotId, slotId);
    if (!view) return Promise.resolve(false);

    return this.trackTransition(view, view.controller.playPlant(stage));
  }

  playHarvestTransition(plotId, slotId) {
    const view = this.getSlotView(plotId, slotId);
    if (!view) return Promise.resolve(false);

    return this.trackTransition(view, view.controller.playHarvest());
  }

  suspendTransientEffects() {
    this.slotViews.forEach((view) => {
      view.controller.suspend();
      this.resetWateringEffect(view);
      view.xpGainLayer.replaceChildren();
    });
  }

  resumeTransientEffects(state) {
    state.plots.forEach((plot) => {
      plot.slots.forEach((slot) => {
        const view = this.getSlotView(plot.plotId, slot.slotId);
        if (!view) return;

        view.controller.resume({
          isPlanted: slot.isPlanted === true,
          stage: getGrowthProgress(slot.xp).stage,
        });
      });
    });
  }

  renderWatering(event, plotId, slotId) {
    const view = this.getSlotView(plotId, slotId);
    if (!view) return null;

    const pointer =
      event?.type === "pointerdown" &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY)
        ? { clientX: event.clientX, clientY: event.clientY }
        : null;
    const { root } = view.wateringEffect;

    this.resetWateringEffect(view);
    this.positionWateringEffect(view, pointer);
    void root.offsetWidth;
    root.classList.add("is-playing");

    view.button.classList.remove("is-tapped");
    void view.button.offsetWidth;
    view.button.classList.add("is-tapped");
    this.document.defaultView?.clearTimeout(view.characterTapTimer);
    view.characterTapTimer = this.document.defaultView?.setTimeout(
      () => view.button.classList.remove("is-tapped"),
      280
    );
    return root;
  }

  showXpGain(amount, { plotId, slotId, ...options } = {}) {
    const view = this.getSlotView(plotId, slotId);
    if (!view) return null;

    return showXpGainEffect(amount, {
      ...options,
      container: view.xpGainLayer,
      anchor: view.characterImage,
      documentRef: this.document,
      windowRef: this.document.defaultView,
    });
  }

  showProductionXpGain(allocations = []) {
    return allocations
      .map((allocation) => {
        const view = this.getSlotView(
          allocation.plotId,
          allocation.slotId
        );
        if (!view) return null;

        const readyAmount = view.productionAccumulator.add(
          allocation.amount
        );
        return readyAmount > 0
          ? this.showXpGain(readyAmount, {
              plotId: allocation.plotId,
              slotId: allocation.slotId,
              source: "production",
            })
          : null;
      })
      .filter(Boolean);
  }

  resetProductionXpGain(plotId, slotId) {
    this.getSlotView(plotId, slotId)?.productionAccumulator.reset();
  }

  showOfflineReward({ elapsedSeconds, reward, allocations = [] }) {
    this.elements.offlineDuration.textContent = formatDuration(elapsedSeconds);
    this.elements.offlineReward.textContent = formatNumber(reward);
    this.elements.offlineReward.title = `${formatExactNumber(reward)} XP`;
    this.pendingOfflineAllocations = allocations.map((allocation) => ({
      ...allocation,
    }));
    this.elements.offlineModal.hidden = false;
    this.elements.offlineConfirmButton.focus();
  }

  hideOfflineReward({ showGain = false } = {}) {
    const pendingAllocations = this.pendingOfflineAllocations;
    this.pendingOfflineAllocations = [];
    this.elements.offlineModal.hidden = true;

    if (showGain) {
      pendingAllocations.forEach((allocation) => {
        this.showXpGain(allocation.amount, {
          plotId: allocation.plotId,
          slotId: allocation.slotId,
          source: "offline",
        });
      });
    }
  }

  announce(message) {
    this.elements.announcement.textContent = "";
    window.setTimeout(() => {
      this.elements.announcement.textContent = message;
    }, 20);
  }
}
