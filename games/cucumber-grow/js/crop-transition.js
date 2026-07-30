export const CROP_TRANSITION_CONFIG = Object.freeze({
  plantingGuideDelayMs: 2_500,
  fallbackPaddingMs: 180,
  plantDurationMs: 680,
  evolutionOutDurationMs: 210,
  evolutionInDurationMs: 480,
  harvestDurationMs: 640,
});

const ANIMATION_NAMES = Object.freeze({
  planting: "crop-plant-in",
  evolutionOut: "crop-evolution-out",
  evolutionIn: "crop-evolution-in",
  harvest: "crop-harvest-out",
});

export function getEvolutionPath(stages, fromStageId, toStageId) {
  const fromIndex = stages.findIndex((stage) => stage.id === fromStageId);
  const toIndex = stages.findIndex((stage) => stage.id === toStageId);

  if (fromIndex < 0 || toIndex <= fromIndex) return [];
  return stages.slice(fromIndex + 1, toIndex + 1);
}

function waitForAnimation(
  element,
  animationName,
  durationMs,
  windowRef
) {
  return new Promise((resolve) => {
    let finished = false;
    let fallbackTimer = null;

    const finish = () => {
      if (finished) return;

      finished = true;
      windowRef.clearTimeout(fallbackTimer);
      element.removeEventListener("animationend", handleAnimationEnd);
      resolve();
    };
    const handleAnimationEnd = (event) => {
      if (event.target !== element || event.animationName !== animationName) {
        return;
      }

      finish();
    };

    element.addEventListener("animationend", handleAnimationEnd);
    fallbackTimer = windowRef.setTimeout(
      finish,
      durationMs + CROP_TRANSITION_CONFIG.fallbackPaddingMs
    );
  });
}

export class CropTransitionController {
  constructor({
    characterZone,
    characterButton,
    characterImage,
    effectLayer,
    plantingGuide = null,
    stages,
    documentRef = document,
    windowRef = window,
  }) {
    this.characterZone = characterZone;
    this.characterButton = characterButton;
    this.characterImage = characterImage;
    this.effectLayer = effectLayer;
    this.plantingGuide = plantingGuide;
    this.stages = stages;
    this.document = documentRef;
    this.window = windowRef;
    this.initialized = false;
    this.visualStageId = null;
    this.transitionType = null;
    this.activePromise = null;
    this.evolutionTargetIndex = -1;
    this.plantingGuideTimer = null;
    this.plantingGuideShown = false;
    this.activeEffects = new Set();
    this.suspended = false;
    this.generation = 0;
  }

  get isBusy() {
    return this.transitionType !== null;
  }

  get isEmpty() {
    return this.visualStageId === null;
  }

  showStageImmediately(stage) {
    if (!stage) return;

    this.hidePlantingGuide();
    this.characterImage.src = stage.characterAsset;
    this.characterImage.hidden = false;
    this.characterImage.dataset.stageId = stage.id;
    this.characterZone.dataset.empty = "false";
    this.characterButton.dataset.action = "water";
    this.visualStageId = stage.id;
    this.evolutionTargetIndex = this.stages.findIndex(
      (candidate) => candidate.id === stage.id
    );
  }

  showEmptyImmediately({ scheduleGuide = true } = {}) {
    this.characterImage.hidden = true;
    delete this.characterImage.dataset.stageId;
    this.characterZone.dataset.empty = "true";
    this.characterButton.dataset.action = "plant";
    this.visualStageId = null;
    this.evolutionTargetIndex = -1;

    if (scheduleGuide) {
      this.schedulePlantingGuide();
    } else {
      this.hidePlantingGuide();
    }
  }

  syncState({ isPlanted, stage }) {
    if (!this.initialized) {
      this.initialized = true;

      if (isPlanted) {
        this.showStageImmediately(stage);
      } else {
        this.showEmptyImmediately();
      }

      return Promise.resolve();
    }

    if (!isPlanted) {
      if (this.transitionType !== "harvest") {
        this.showEmptyImmediately();
      }

      return this.activePromise ?? Promise.resolve();
    }

    this.hidePlantingGuide();

    if (this.transitionType === "harvest") {
      return this.activePromise ?? Promise.resolve();
    }

    if (this.isEmpty && this.transitionType !== "planting") {
      this.showStageImmediately(stage);
      return Promise.resolve();
    }

    return this.requestEvolution(stage);
  }

  requestEvolution(targetStage) {
    const targetIndex = this.stages.findIndex(
      (stage) => stage.id === targetStage?.id
    );
    const currentIndex = this.stages.findIndex(
      (stage) => stage.id === this.visualStageId
    );

    if (targetIndex <= currentIndex || targetIndex < 0) {
      return this.activePromise ?? Promise.resolve();
    }

    this.evolutionTargetIndex = Math.max(
      this.evolutionTargetIndex,
      targetIndex
    );

    if (this.transitionType === "evolution") {
      return this.activePromise;
    }

    if (this.isBusy) {
      return this.activePromise ?? Promise.resolve();
    }

    const generation = ++this.generation;
    this.transitionType = "evolution";
    const transitionPromise = this.runEvolutionQueue(generation);
    this.activePromise = transitionPromise;
    return transitionPromise;
  }

  async runEvolutionQueue(generation) {
    try {
      while (generation === this.generation) {
        const currentIndex = this.stages.findIndex(
          (stage) => stage.id === this.visualStageId
        );

        if (
          currentIndex < 0 ||
          currentIndex >= this.evolutionTargetIndex
        ) {
          break;
        }

        const nextStage = this.stages[currentIndex + 1];
        const effect = this.createEffect("evolution");

        try {
          await this.runCharacterAnimation(
            "is-evolving-out",
            ANIMATION_NAMES.evolutionOut,
            CROP_TRANSITION_CONFIG.evolutionOutDurationMs
          );
          if (generation !== this.generation) return false;

          this.characterImage.src = nextStage.characterAsset;
          this.characterImage.dataset.stageId = nextStage.id;
          this.visualStageId = nextStage.id;

          await this.runCharacterAnimation(
            "is-evolving-in",
            ANIMATION_NAMES.evolutionIn,
            CROP_TRANSITION_CONFIG.evolutionInDurationMs
          );
        } finally {
          this.removeEffect(effect);
        }
      }

      return generation === this.generation;
    } finally {
      if (generation === this.generation) {
        this.transitionType = null;
        this.activePromise = null;
        this.evolutionTargetIndex = this.stages.findIndex(
          (stage) => stage.id === this.visualStageId
        );
      }
    }
  }

  playPlant(stage) {
    if (this.isBusy || !this.isEmpty || !stage) {
      return Promise.resolve(false);
    }

    const generation = ++this.generation;
    this.initialized = true;
    this.transitionType = "planting";
    this.showStageImmediately(stage);
    const effect = this.createEffect("planting");

    const transitionPromise = (async () => {
      try {
        await this.runCharacterAnimation(
          "is-planting",
          ANIMATION_NAMES.planting,
          CROP_TRANSITION_CONFIG.plantDurationMs
        );
        return generation === this.generation;
      } finally {
        this.removeEffect(effect);
        if (generation === this.generation) {
          this.transitionType = null;
          this.activePromise = null;
        }
      }
    })();

    this.activePromise = transitionPromise;
    return transitionPromise;
  }

  playHarvest() {
    if (this.isBusy || this.isEmpty) {
      return Promise.resolve(false);
    }

    const generation = ++this.generation;
    this.transitionType = "harvest";
    this.hidePlantingGuide();
    const effect = this.createEffect("harvest");

    const transitionPromise = (async () => {
      try {
        await this.runCharacterAnimation(
          "is-harvesting",
          ANIMATION_NAMES.harvest,
          CROP_TRANSITION_CONFIG.harvestDurationMs
        );
        if (generation !== this.generation) return false;

        this.showEmptyImmediately();
        return true;
      } finally {
        this.removeEffect(effect);
        if (generation === this.generation) {
          this.transitionType = null;
          this.activePromise = null;
        }
      }
    })();

    this.activePromise = transitionPromise;
    return transitionPromise;
  }

  runCharacterAnimation(className, animationName, durationMs) {
    this.characterImage.classList.remove(className);
    void this.characterImage.offsetWidth;
    this.characterImage.classList.add(className);

    return waitForAnimation(
      this.characterImage,
      animationName,
      durationMs,
      this.window
    ).finally(() => {
      this.characterImage.classList.remove(className);
    });
  }

  createEffect(type) {
    const effect = this.document.createElement("span");
    const ring = this.document.createElement("span");

    effect.className = `crop-transition-effect crop-transition-effect--${type}`;
    effect.dataset.transitionEffect = type;
    effect.setAttribute("aria-hidden", "true");
    ring.className = "crop-transition-effect__ring";
    effect.append(ring);

    for (let index = 0; index < 6; index += 1) {
      const particle = this.document.createElement("span");

      particle.className = "crop-transition-effect__particle";
      particle.style.setProperty("--particle-index", String(index));
      effect.append(particle);
    }

    this.effectLayer.append(effect);
    this.activeEffects.add(effect);
    return effect;
  }

  removeEffect(effect) {
    if (!effect) return;

    effect.remove();
    this.activeEffects.delete(effect);
  }

  schedulePlantingGuide({ immediate = false } = {}) {
    if (!this.plantingGuide) return;

    if (immediate && this.plantingGuideTimer !== null) {
      this.window.clearTimeout(this.plantingGuideTimer);
      this.plantingGuideTimer = null;
    }

    if (
      this.plantingGuideTimer !== null ||
      this.plantingGuideShown ||
      !this.isEmpty ||
      this.suspended
    ) {
      return;
    }

    this.plantingGuide.hidden = true;
    this.plantingGuide.classList.remove("is-visible");
    this.plantingGuideTimer = this.window.setTimeout(() => {
      this.plantingGuideTimer = null;

      if (!this.isEmpty || this.isBusy || this.suspended) return;

      this.plantingGuide.hidden = false;
      this.plantingGuide.classList.add("is-visible");
      this.plantingGuideShown = true;
    }, immediate ? 0 : CROP_TRANSITION_CONFIG.plantingGuideDelayMs);
  }

  showPlantingGuideImmediately() {
    this.schedulePlantingGuide({ immediate: true });
  }

  hidePlantingGuide() {
    this.window.clearTimeout(this.plantingGuideTimer);
    this.plantingGuideTimer = null;
    this.plantingGuideShown = false;
    if (!this.plantingGuide) return;

    this.plantingGuide.classList.remove("is-visible");
    this.plantingGuide.hidden = true;
  }

  suspend() {
    this.suspended = true;
    this.hidePlantingGuide();
  }

  resume(state) {
    this.suspended = false;
    return this.syncState(state);
  }

  reset({ isPlanted, stage }) {
    this.generation += 1;
    this.hidePlantingGuide();
    this.activeEffects.forEach((effect) => effect.remove());
    this.activeEffects.clear();
    [
      "is-planting",
      "is-evolving-out",
      "is-evolving-in",
      "is-harvesting",
    ].forEach((className) => this.characterImage.classList.remove(className));
    this.transitionType = null;
    this.activePromise = null;
    this.evolutionTargetIndex = -1;
    this.initialized = true;

    if (isPlanted) {
      this.showStageImmediately(stage);
    } else {
      this.showEmptyImmediately();
    }
  }
}
