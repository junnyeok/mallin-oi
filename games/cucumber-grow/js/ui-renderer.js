import { GAME_CONFIG } from "./game-config.js";
import {
  formatDateTime,
  formatDuration,
  formatExactNumber,
  formatNumber,
} from "./number-format.js";
import { getGrowthStage, getNextPrice } from "./game-engine.js";

export class UIRenderer {
  constructor(documentRoot = document) {
    this.document = documentRoot;
    this.elements = {
      cucumberCount: documentRoot.querySelector("#cucumberCount"),
      productionRate: documentRoot.querySelector("#productionRate"),
      touchYield: documentRoot.querySelector("#touchYield"),
      growthStage: documentRoot.querySelector("#growthStage"),
      characterZone: documentRoot.querySelector("#characterZone"),
      characterButton: documentRoot.querySelector("#characterButton"),
      touchEffects: documentRoot.querySelector("#touchEffects"),
      facilityList: documentRoot.querySelector("#facilityList"),
      totalEarned: documentRoot.querySelector("#totalEarned"),
      startedAt: documentRoot.querySelector("#startedAt"),
      saveStatus: documentRoot.querySelector("#saveStatus"),
      stageToast: documentRoot.querySelector("#stageToast"),
      stageToastText: documentRoot.querySelector("#stageToastText"),
      offlineModal: documentRoot.querySelector("#offlineModal"),
      offlineDuration: documentRoot.querySelector("#offlineDuration"),
      offlineReward: documentRoot.querySelector("#offlineReward"),
      offlineConfirmButton: documentRoot.querySelector("#offlineConfirmButton"),
      announcement: documentRoot.querySelector("#gameAnnouncement"),
    };
    this.facilityElements = new Map();
    this.stageToastTimer = null;

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
            <span>하나당 생산</span>
            <strong data-role="unit-production">0/초</strong>
          </div>
          <div class="facility-card__stat">
            <span>현재 총생산</span>
            <strong data-role="total-production">0/초</strong>
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
    const stage = getGrowthStage(state.totalEarned);
    const formattedBalance = formatNumber(state.cucumbers);
    const formattedTotal = formatNumber(state.totalEarned);

    this.elements.cucumberCount.textContent = formattedBalance;
    this.elements.cucumberCount.title = `${formatExactNumber(
      state.cucumbers
    )}개`;
    this.elements.productionRate.textContent = formatNumber(state.perSecond);
    this.elements.touchYield.textContent = formatNumber(state.touchYield);
    this.elements.growthStage.textContent = stage.name;
    this.elements.characterZone.dataset.stageId = stage.id;
    this.elements.characterZone.dataset.stageLevel = String(stage.level);
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
      )}/초`;
      elements.totalProduction.textContent = `${formatNumber(
        totalProduction
      )}/초`;
      elements.totalProduction.title = `${formatExactNumber(
        totalProduction
      )}/초`;
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

  renderTouchGain(amount, event) {
    const effectsRect = this.elements.touchEffects.getBoundingClientRect();
    const hasPointerPosition =
      event &&
      Number.isFinite(event.clientX) &&
      Number.isFinite(event.clientY) &&
      (event.clientX !== 0 || event.clientY !== 0);
    const x = hasPointerPosition
      ? event.clientX - effectsRect.left
      : effectsRect.width / 2;
    const y = hasPointerPosition
      ? event.clientY - effectsRect.top
      : effectsRect.height * 0.46;
    const gain = this.document.createElement("span");

    while (this.elements.touchEffects.childElementCount >= 24) {
      this.elements.touchEffects.firstElementChild.remove();
    }

    gain.className = "touch-gain";
    gain.textContent = `+${formatNumber(amount)}`;
    gain.style.setProperty("--gain-x", `${x}px`);
    gain.style.setProperty("--gain-y", `${y}px`);
    this.elements.touchEffects.append(gain);
    window.setTimeout(() => gain.remove(), 850);

    this.elements.characterButton.classList.remove("is-tapped");
    void this.elements.characterButton.offsetWidth;
    this.elements.characterButton.classList.add("is-tapped");
    window.setTimeout(
      () => this.elements.characterButton.classList.remove("is-tapped"),
      280
    );
  }

  showStageUp(stage) {
    window.clearTimeout(this.stageToastTimer);
    this.elements.stageToastText.textContent = `${stage.level}단계 · ${stage.name}`;
    this.elements.stageToast.hidden = false;
    this.elements.stageToast.classList.remove("is-visible");
    void this.elements.stageToast.offsetWidth;
    this.elements.stageToast.classList.add("is-visible");
    this.stageToastTimer = window.setTimeout(() => {
      this.elements.stageToast.classList.remove("is-visible");
      this.elements.stageToast.hidden = true;
    }, 2_800);
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
