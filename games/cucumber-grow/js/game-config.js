function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const levelThresholds = [
  0, 20, 50, 90, 140, 210, 300, 420, 570, 750, 960, 1_200,
];

const plotPrices = [
  0, 300, 540, 840, 1_200, 1_620, 2_100, 2_640, 3_240, 3_900,
  4_620, 5_400,
];

const threatDefinitions = [
  {
    id: "bird",
    name: "새",
    maxHealth: 5,
    movementSpeed: 132,
    approachDurationMs: 3_200,
    approachMotion: "fly",
    spawnPhase: "day",
    isSilent: false,
    detectionType: "air",
    approachSound: "birdApproach",
    eatingSound: "threatEat",
    defeatSound: "birdDefeat",
    animationAsset: "./assets/images/enemies/bird-sprite.png",
    yieldDamage: 2,
  },
  {
    id: "squirrel",
    name: "다람쥐",
    maxHealth: 7,
    movementSpeed: 108,
    approachDurationMs: 3_900,
    approachMotion: "run",
    spawnPhase: "day",
    isSilent: false,
    detectionType: "ground-small",
    approachSound: "squirrelApproach",
    eatingSound: "threatEat",
    defeatSound: "squirrelDefeat",
    animationAsset: "./assets/images/enemies/squirrel-sprite.png",
    yieldDamage: 4,
  },
  {
    id: "boar",
    name: "멧돼지",
    maxHealth: 15,
    movementSpeed: 82,
    approachDurationMs: 4_900,
    approachMotion: "charge",
    spawnPhase: "day",
    isSilent: false,
    detectionType: "ground-large",
    approachSound: "boarApproach",
    eatingSound: "threatEat",
    defeatSound: "boarDefeat",
    animationAsset: "./assets/images/enemies/boar-sprite.png",
    // 기존 작은 짐승과 같은 수확량 피해를 사용해 경제 수치를 새로 만들지 않는다.
    yieldDamage: 4,
  },
  {
    id: "thief",
    name: "도둑",
    maxHealth: 12,
    movementSpeed: 48,
    approachDurationMs: 7_200,
    approachMotion: "sneak",
    spawnPhase: "night",
    isSilent: true,
    detectionType: "intruder",
    approachSound: null,
    eatingSound: "threatEat",
    defeatSound: "thiefDefeat",
    animationAsset: "./assets/images/enemies/thief-sprite.png",
    cucumberDamage: 8,
    coinDamage: 12,
  },
];

const config = {
  schemaVersion: 4,
  saveVersion: 4,
  storageKey: "mallinoi_cucumber_grow_save_v1",
  nativeStorageKey: "mallinoi_cucumber_grow_native_v4",
  saveDebounceMs: 420,
  autosaveIntervalMs: 5_000,
  tickIntervalMs: 250,
  maxOfflineSeconds: 8 * 60 * 60,
  maximumClockSkewMs: 5 * 60 * 1_000,
  maxGameNumber: Number.MAX_SAFE_INTEGER,
  maxFacilityCount: 1_000_000_000,
  board: {
    columns: 3,
    maximumPurchasablePlots: 12,
  },
  player: {
    maximumLevel: 12,
    levelThresholds,
    cropEvolutionXp: 3,
    harvestXp: 12,
    threatRepelXp: 4,
    facilityInstallXp: 8,
  },
  economy: {
    startingCoins: 120,
    cucumberSalePrice: 3,
    plotPrices,
    baseHarvestYield: 10,
    harvestYieldIncrease: 20,
    consumables: {
      water: { id: "water", name: "물 30", amount: 30, price: 45 },
      fuel: { id: "fuel", name: "연료 15", amount: 15, price: 65 },
      energy: { id: "energy", name: "에너지 15", amount: 15, price: 90 },
    },
  },
  resources: {
    startingWater: 20,
    startingFuel: 0,
    startingEnergy: 5,
    maximumEnergy: 100,
  },
  crops: {
    harvestExperience: 50,
    dayPassiveXpPerSecond: 0.25,
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
        characterAsset: "./assets/images/cucumber-adult.png",
      },
    ],
  },
  tools: {
    wateringCan: {
      id: "wateringCan",
      name: "물뿌리개",
      asset: "./assets/images/water-gun.png",
      cropXp: 1,
      waterCost: 1,
    },
    hammer: {
      id: "hammer",
      name: "뿅망치",
      asset: "./assets/images/tool-hammer.png",
      damage: 1,
    },
  },
  facilities: [
    {
      id: "sprinkler",
      name: "스프링클러",
      asset: "./assets/images/facility-sprinkler.png",
      unlockLevel: 3,
      price: 240,
      placement: "single-empty",
      range: 1,
      cropXpPerSecond: 1,
      waterPerSecond: 0.25,
      stacks: false,
    },
    {
      id: "rainBarrel",
      name: "빗물통",
      asset: "./assets/images/facility-rain-barrel.png",
      unlockLevel: 3,
      price: 180,
      placement: "single-empty",
      waterPerPreparation: 18,
    },
    {
      id: "scarecrow",
      name: "허수아비",
      asset: "./assets/images/facility-scarecrow.png",
      unlockLevel: 4,
      price: 380,
      placement: "single-empty",
      range: 1,
      daytimeProtectionChance: 0.7,
    },
    {
      id: "generator",
      name: "발전기",
      asset: "./assets/images/facility-generator.png",
      unlockLevel: 5,
      price: 600,
      placement: "single-empty",
      fuelPerSecond: 0.2,
      energyPerSecond: 1,
    },
    {
      id: "greenhouse",
      name: "온실",
      asset: "./assets/images/facility-greenhouse.png",
      unlockLevel: 6,
      price: 900,
      placement: "rectangle",
      width: 3,
      height: 2,
      cropXpPerSecondAtNight: 1,
      energyPerSecond: 0.5,
    },
  ],
  turn: {
    dayDurationMs: 90_000,
    nightDurationMs: 60_000,
    phases: ["day", "night", "preparation"],
  },
  threats: {
    responseWindowMs: 10_000,
    dayIntervalMs: 20_000,
    nightIntervalMs: 25_000,
    hitDurationMs: 170,
    defeatedDisplayMs: 720,
    despawnDurationMs: 420,
    definitions: threatDefinitions,
    daytime: threatDefinitions.filter((definition) => definition.spawnPhase === "day"),
    nighttime: threatDefinitions.filter((definition) => definition.spawnPhase === "night"),
  },
};

// 기존 모듈과 저장 마이그레이션에서 사용하던 이름을 한 곳에서만 파생한다.
config.growthStages = config.crops.growthStages;
config.harvestExperience = config.crops.harvestExperience;
config.touchExperience = config.tools.wateringCan.cropXp;
config.slotsPerPlot = 1;

export const GAME_CONFIG = deepFreeze(config);

export function getThreatDefinitionById(threatType) {
  return GAME_CONFIG.threats.definitions.find(
    (definition) => definition.id === threatType
  ) ?? null;
}
