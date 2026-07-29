import { GAME_CONFIG } from "./game-config.js";
import {
  formatDateTime,
  formatDuration,
  formatExactNumber,
  formatNumber,
} from "./number-format.js";
import { getGrowthProgress, getNextPrice } from "./game-engine.js";

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
  const safeMargin = clamp(Math.min(sceneWidth, sceneHeight) * 0.02, 6, 12);
  const canSize = clamp(
    Math.min(sceneWidth * 0.22, sceneHeight * 0.22),
    64,
    92
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
  const gainHalfWidth = Math.max(42, canSize * 0.5);
  const gainBounds = {
    left: -gainHalfWidth,
    top: -Math.max(70, canSize * 0.85),
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
      growthStageSummary: documentRoot.querySelector("#growthStageSummary"),
      growthStage: documentRoot.querySelector("#growthStage"),
      growthLevel: documentRoot.querySelector("#growthLevel"),
      growthExperience: documentRoot.querySelector("#growthExperience"),
      growthTarget: documentRoot.querySelector("#growthTarget"),
      growthProgress: documentRoot.querySelector("#growthProgress"),
      growthProgressFill: documentRoot.querySelector("#growthProgressFill"),
      growthStatus: documentRoot.querySelector("#growthStatus"),
      harvestButton: documentRoot.querySelector("#harvestButton"),
      characterZone: documentRoot.querySelector("#characterZone"),
      characterButton: documentRoot.querySelector("#characterButton"),
      characterImage: documentRoot.querySelector("#characterImage"),
      tapGuide: documentRoot.querySelector("#tapGuide"),
      touchEffects: documentRoot.querySelector("#touchEffects"),
      facilityList: documentRoot.querySelector("#facilityList"),
      totalEarned: documentRoot.querySelector("#totalEarned"),
      startedAt: documentRoot.querySelector("#startedAt"),
      saveStatus: documentRoot.querySelector("#saveStatus"),
      stageToast: documentRoot.querySelector("#stageToast"),
      stageToastTitle: documentRoot.querySelector("#stageToastTitle"),
      stageToastText: documentRoot.querySelector("#stageToastText"),
      offlineModal: documentRoot.querySelector("#offlineModal"),
      offlineDuration: documentRoot.querySelector("#offlineDuration"),
      offlineReward: documentRoot.querySelector("#offlineReward"),
      offlineConfirmButton: documentRoot.querySelector("#offlineConfirmButton"),
      announcement: documentRoot.querySelector("#gameAnnouncement"),
    };
    this.facilityElements = new Map();
    this.stageToastTimer = null;
    this.characterTapTimer = null;
    this.characterTransitionTimer = null;
    this.characterAsset = this.elements.characterImage.getAttribute("src");
    this.wateringEffect = this.buildWateringEffect();
    this.handleWateringResize = () => {
      if (!this.wateringEffect.root.classList.contains("is-playing")) return;

      this.positionWateringEffect(this.wateringEffect.inputPoint);
    };
    this.document.defaultView?.addEventListener(
      "resize",
      this.handleWateringResize
    );

    this.buildFacilityCards();
    this.elements.offlineConfirmButton.addEventListener("click", () => {
      this.hideOfflineReward();
    });
  }

  buildWateringEffect() {
    const root = this.document.createElement("span");
    const mirror = this.document.createElement("span");
    const canPivot = this.document.createElement("span");
    const wateringCan = this.document.createElement("img");
    const spriteAnchor = this.document.createElement("span");
    const waterSprite = this.document.createElement("span");
    const gain = this.document.createElement("span");

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
    gain.className = "touch-gain";

    canPivot.append(wateringCan);
    spriteAnchor.append(waterSprite);
    mirror.append(canPivot, spriteAnchor);
    root.append(mirror, gain);
    this.elements.touchEffects.append(root);

    waterSprite.addEventListener("animationend", () =>
      this.resetWateringEffect()
    );

    return { root, waterSprite, gain, inputPoint: null };
  }

  applyWateringLayout(layout) {
    const { root } = this.wateringEffect;

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
    this.wateringEffect.inputPoint = {
      normalizedX: layout.normalizedX,
      normalizedY: layout.normalizedY,
    };
  }

  positionWateringEffect(pointer = null) {
    const sceneRect = this.elements.touchEffects.getBoundingClientRect();
    const layout = calculateWateringLayout(sceneRect, pointer || {});

    this.applyWateringLayout(layout);
    return layout;
  }

  resetWateringEffect() {
    const { root } = this.wateringEffect;

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
    this.wateringEffect.inputPoint = null;
  }

  buildFacilityCards() {
    const fragment = this.document.createDocumentFragment();

    GAME_CONFIG.facilities.forEach((facility) => {
      const card = this.document.createElement("article");
      card.className = "facility-card";
      card.dataset.facilityId = facility.id;
      card.setAttribute("role", "listitem");
      card.innerHTML = `
        <div class="facility-card__header">
          <span class="facility-card__icon" aria-hidden="true">${facility.icon}</span>
          <div class="facility-card__title">
            <h3>${facility.name}</h3>
            <p class="facility-card__owned">보유 <strong data-role="owned">0</strong>개</p>
          </div>
        </div>
        <div class="facility-card__stats">
          <div class="facility-card__stat">
            <span>하나당 경험치</span>
            <strong data-role="unit-production">0 XP/초</strong>
          </div>
          <div class="facility-card__stat">
            <span>현재 자동 경험치</span>
            <strong data-role="total-production">0 XP/초</strong>
          </div>
        </div>
        <div class="facility-card__purchase">
          <p class="facility-card__price">
            <span>다음 가격</span>
            <strong data-role="price">0 오이</strong>
          </p>
          <button class="buy-button" data-action="buy" type="button">구매</button>
        </div>
      `;

      this.facilityElements.set(facility.id, {
        card,
        owned: card.querySelector('[data-role="owned"]'),
        unitProduction: card.querySelector('[data-role="unit-production"]'),
        totalProduction: card.querySelector('[data-role="total-production"]'),
        price: card.querySelector('[data-role="price"]'),
        button: card.querySelector('[data-action="buy"]'),
      });
      fragment.append(card);
    });

    this.elements.facilityList.replaceChildren(fragment);
  }

  render(state) {
    const progress = getGrowthProgress(state.growthExperience);
    const { stage } = progress;
    const formattedBalance = formatNumber(state.cucumbers);
    const formattedTotal = formatNumber(state.totalEarned);
    const formattedExperience = formatNumber(progress.experience);
    const formattedTarget = formatNumber(progress.targetExperience);
    const remainingExperience = Math.max(
      0,
      Math.ceil(progress.targetExperience - progress.experience)
    );

    this.elements.cucumberCount.textContent = formattedBalance;
    this.elements.cucumberCount.title = `${formatExactNumber(
      state.cucumbers
    )}개`;
    this.elements.productionRate.textContent = formatNumber(state.perSecond);
    this.elements.touchYield.textContent = formatNumber(state.touchYield);
    this.elements.growthStageSummary.textContent = progress.isHarvestReady
      ? "수확 가능"
      : stage.name;
    this.elements.growthStage.textContent = stage.name;
    this.elements.growthLevel.textContent = `Lv.${stage.level}`;
    this.elements.growthExperience.textContent = formattedExperience;
    this.elements.growthExperience.title = `${formatExactNumber(
      progress.experience
    )} XP`;
    this.elements.growthTarget.textContent = formattedTarget;
    this.elements.growthTarget.title = `${formatExactNumber(
      progress.targetExperience
    )} XP`;
    this.elements.growthProgress.setAttribute(
      "aria-valuemin",
      String(stage.minimumExperience)
    );
    this.elements.growthProgress.setAttribute(
      "aria-valuemax",
      String(progress.targetExperience)
    );
    this.elements.growthProgress.setAttribute(
      "aria-valuenow",
      String(progress.experience)
    );
    this.elements.growthProgress.setAttribute(
      "aria-valuetext",
      progress.isHarvestReady
        ? `경험치 ${formatExactNumber(progress.experience)}, 수확 가능`
        : `경험치 ${formatExactNumber(
            progress.experience
          )}, 다음 성장까지 ${formatExactNumber(
            remainingExperience
          )}`
    );
    this.elements.growthProgressFill.style.width = `${progress.progressPercent}%`;
    this.elements.growthStatus.textContent = progress.isHarvestReady
      ? "수확 가능"
      : progress.nextStage
        ? `다음 · ${progress.nextStage.name}`
        : "성장 중";
    this.elements.growthStatus.dataset.ready = String(
      progress.isHarvestReady
    );
    this.elements.harvestButton.disabled = !progress.isHarvestReady;
    this.elements.harvestButton.textContent = progress.isHarvestReady
      ? `수확하기 · +${formatNumber(GAME_CONFIG.harvestReward)} 오이`
      : `성장 중 · ${formatNumber(remainingExperience)} XP 남음`;
    this.elements.harvestButton.setAttribute(
      "aria-label",
      progress.isHarvestReady
        ? `어른오이 수확, 오이 ${formatExactNumber(
            GAME_CONFIG.harvestReward
          )}개 획득`
        : `아직 수확할 수 없음, 다음 성장까지 ${formatExactNumber(
            remainingExperience
          )} 경험치 남음`
    );
    this.elements.characterZone.dataset.stageId = stage.id;
    this.elements.characterZone.dataset.stageLevel = String(stage.level);
    this.elements.characterZone.dataset.harvestReady = String(
      progress.isHarvestReady
    );
    this.elements.characterButton.disabled = progress.isHarvestReady;
    this.elements.characterButton.setAttribute(
      "aria-label",
      progress.isHarvestReady
        ? "성장이 끝났습니다. 아래 수확 버튼을 눌러주세요."
        : `${stage.name}에게 물을 주고 ${formatExactNumber(
            state.touchYield
          )} 경험치 획득`
    );
    this.elements.tapGuide.textContent = progress.isHarvestReady
      ? "다 자랐어요! 아래에서 수확해 주세요"
      : "오이에게 물을 주세요";
    this.updateCharacter(stage);
    this.elements.totalEarned.textContent = formattedTotal;
    this.elements.totalEarned.title = `${formatExactNumber(
      state.totalEarned
    )}개`;
    this.elements.startedAt.textContent = formatDateTime(state.startedAt);

    GAME_CONFIG.facilities.forEach((facility) => {
      const elements = this.facilityElements.get(facility.id);
      const owned = state.facilities[facility.id] ?? 0;
      const price = getNextPrice(facility, owned);
      const totalProduction = owned * facility.productionPerSecond;
      const canAfford = state.cucumbers >= price;

      elements.owned.textContent = formatNumber(owned);
      elements.unitProduction.textContent = `${formatNumber(
        facility.productionPerSecond
      )} XP/초`;
      elements.totalProduction.textContent = `${formatNumber(
        totalProduction
      )} XP/초`;
      elements.totalProduction.title = `${formatExactNumber(
        totalProduction
      )} XP/초`;
      elements.price.textContent = `${formatNumber(price)} 오이`;
      elements.price.title = `${formatExactNumber(price)} 오이`;
      elements.button.disabled = !canAfford;
      elements.button.textContent = canAfford ? "구매" : "부족";
      elements.button.setAttribute(
        "aria-label",
        `${facility.name} 구매, 가격 ${formatExactNumber(price)} 오이`
      );
    });
  }

  updateCharacter(stage) {
    if (this.characterAsset === stage.characterAsset) return;

    window.clearTimeout(this.characterTransitionTimer);
    this.characterAsset = stage.characterAsset;
    this.elements.characterImage.classList.add("is-transitioning");
    this.characterTransitionTimer = window.setTimeout(() => {
      this.elements.characterImage.src = stage.characterAsset;
      window.requestAnimationFrame(() => {
        this.elements.characterImage.classList.remove("is-transitioning");
      });
    }, 90);
  }

  renderWatering(amount, event) {
    const pointer =
      event?.type === "pointerdown" &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY)
        ? { clientX: event.clientX, clientY: event.clientY }
        : null;
    const { root, gain } = this.wateringEffect;

    this.resetWateringEffect();
    this.positionWateringEffect(pointer);
    gain.textContent = `+${formatNumber(amount)} XP`;
    void root.offsetWidth;
    root.classList.add("is-playing");

    this.elements.characterButton.classList.remove("is-tapped");
    void this.elements.characterButton.offsetWidth;
    this.elements.characterButton.classList.add("is-tapped");
    window.clearTimeout(this.characterTapTimer);
    this.characterTapTimer = window.setTimeout(
      () => this.elements.characterButton.classList.remove("is-tapped"),
      280
    );
  }

  showToast(title, message) {
    window.clearTimeout(this.stageToastTimer);
    this.elements.stageToastTitle.textContent = title;
    this.elements.stageToastText.textContent = message;
    this.elements.stageToast.hidden = false;
    this.elements.stageToast.classList.remove("is-visible");
    void this.elements.stageToast.offsetWidth;
    this.elements.stageToast.classList.add("is-visible");
    this.stageToastTimer = window.setTimeout(() => {
      this.elements.stageToast.classList.remove("is-visible");
      this.elements.stageToast.hidden = true;
    }, 2_800);
  }

  showStageUp(stage) {
    this.showToast("성장 단계 상승!", `${stage.level}단계 · ${stage.name}`);
  }

  showHarvestReady() {
    this.showToast("수확 가능!", "어른오이가 모두 자랐어요");
  }

  showHarvestReward(reward) {
    this.showToast("수확 완료!", `오이 ${formatNumber(reward)}개 획득`);
  }

  showOfflineReward({ elapsedSeconds, reward }) {
    this.elements.offlineDuration.textContent = formatDuration(elapsedSeconds);
    this.elements.offlineReward.textContent = formatNumber(reward);
    this.elements.offlineReward.title = `${formatExactNumber(reward)}개`;
    this.elements.offlineModal.hidden = false;
    this.elements.offlineConfirmButton.focus();
  }

  hideOfflineReward() {
    this.elements.offlineModal.hidden = true;
  }

  setSaveStatus(message, status = "saved") {
    this.elements.saveStatus.textContent = message;
    this.elements.saveStatus.dataset.status = status;
  }

  announce(message) {
    this.elements.announcement.textContent = "";
    window.setTimeout(() => {
      this.elements.announcement.textContent = message;
    }, 20);
  }
}
