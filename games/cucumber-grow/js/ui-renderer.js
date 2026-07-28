import { GAME_CONFIG } from "./game-config.js";
import {
  formatDateTime,
  formatDuration,
  formatExactNumber,
  formatNumber,
} from "./number-format.js";
import { getGrowthProgress, getNextPrice } from "./game-engine.js";

const WATERING_CENTER_TOLERANCE = 0.5;

export function getWateringSide(effectX, targetX) {
  return effectX > targetX + WATERING_CENTER_TOLERANCE ? "right" : "left";
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

    this.buildFacilityCards();
    this.elements.offlineConfirmButton.addEventListener("click", () => {
      this.hideOfflineReward();
    });
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
    const effectsRect = this.elements.touchEffects.getBoundingClientRect();
    const characterRect = this.elements.characterImage.getBoundingClientRect();
    const hasPointerPosition =
      event &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY) &&
      (event.clientX !== 0 || event.clientY !== 0);
    const rawX = hasPointerPosition
      ? event.clientX - effectsRect.left
      : effectsRect.width * 0.28;
    const rawY = hasPointerPosition
      ? event.clientY - effectsRect.top
      : effectsRect.height * 0.58;
    const clamp = (value, minimum, maximum) =>
      Math.min(Math.max(value, minimum), maximum);
    const effectMarginX = Math.min(48, effectsRect.width / 2);
    const effectMarginY = Math.min(48, effectsRect.height / 2);
    const x = clamp(
      rawX,
      effectMarginX,
      Math.max(effectMarginX, effectsRect.width - effectMarginX)
    );
    const y = clamp(
      rawY,
      effectMarginY,
      Math.max(effectMarginY, effectsRect.height - effectMarginY)
    );
    const targetX = clamp(
      characterRect.left + characterRect.width / 2 - effectsRect.left,
      0,
      effectsRect.width
    );
    const targetY = clamp(
      characterRect.top + characterRect.height / 2 - effectsRect.top,
      0,
      effectsRect.height
    );
    const deltaX = targetX - x;
    const deltaY = targetY - y;
    const angle = Math.atan2(deltaY, deltaX);
    const distance = Math.hypot(deltaX, deltaY);
    const streamLength = clamp(distance - 26, 28, 320);
    const wateringSide = getWateringSide(x, targetX);
    const burst = this.document.createElement("span");
    const direction = this.document.createElement("span");
    const wateringCan = this.document.createElement("img");
    const stream = this.document.createElement("span");
    const gain = this.document.createElement("span");

    while (this.elements.touchEffects.childElementCount >= 18) {
      this.elements.touchEffects.firstElementChild.remove();
    }

    burst.className = "touch-burst";
    burst.style.setProperty("--effect-x", `${x}px`);
    burst.style.setProperty("--effect-y", `${y}px`);
    burst.style.setProperty("--water-angle", `${angle}rad`);
    burst.style.setProperty("--water-distance", `${streamLength}px`);
    direction.className = "watering-effect";
    wateringCan.className =
      `watering-effect__can watering-effect__can--from-${wateringSide}`;
    wateringCan.src = "./assets/images/water-gun.png";
    wateringCan.alt = "";
    wateringCan.draggable = false;
    stream.className = "watering-effect__stream";
    stream.append(
      ...Array.from({ length: 4 }, () => {
        const drop = this.document.createElement("i");
        drop.className = "watering-effect__drop";
        return drop;
      })
    );
    gain.className = "touch-gain";
    gain.textContent = `+${formatNumber(amount)} XP`;
    direction.append(stream);
    burst.append(direction, wateringCan, gain);
    this.elements.touchEffects.append(burst);
    window.setTimeout(() => burst.remove(), 950);

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
