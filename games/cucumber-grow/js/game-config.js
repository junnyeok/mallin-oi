function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export const GAME_CONFIG = deepFreeze({
  saveVersion: 2,
  storageKey: "mallinoi_cucumber_grow_save_v1",
  autosaveIntervalMs: 5_000,
  tickIntervalMs: 250,
  priceGrowthRate: 1.15,
  maxOfflineSeconds: 8 * 60 * 60,
  maxGameNumber: Number.MAX_SAFE_INTEGER,
  maxFacilityCount: 1_000_000_000,
  slotsPerPlot: 4,
  touchExperience: 1,
  harvestExperience: 50,
  harvestReward: 1,
  additionalGardenPrice: null,
  facilities: [
    {
      id: "small-garden",
      name: "작은 텃밭",
      icon: "🌱",
      basePrice: 50,
      productionPerSecond: 1,
    },
    {
      id: "greenhouse",
      name: "비닐하우스",
      icon: "⌂",
      basePrice: 500,
      productionPerSecond: 8,
    },
    {
      id: "watering-system",
      name: "자동 급수기",
      icon: "◌",
      basePrice: 5_000,
      productionPerSecond: 50,
    },
    {
      id: "smart-farm",
      name: "스마트팜",
      icon: "▦",
      basePrice: 50_000,
      productionPerSecond: 300,
    },
    {
      id: "processing-factory",
      name: "오이 가공공장",
      icon: "⚙",
      basePrice: 500_000,
      productionPerSecond: 2_000,
    },
  ],
  growthStages: [
    {
      id: "sprout",
      level: 1,
      name: "새싹",
      minimumExperience: 0,
      characterAsset: "./assets/images/cucumber-baby.png",
    },
    {
      id: "young",
      level: 2,
      name: "애기오이",
      minimumExperience: 15,
      characterAsset: "./assets/images/cucumber-boy.png",
    },
    {
      id: "adult",
      level: 3,
      name: "어른오이",
      minimumExperience: 35,
      characterAsset: "./assets/images/cucumber.png",
    },
  ],
});
