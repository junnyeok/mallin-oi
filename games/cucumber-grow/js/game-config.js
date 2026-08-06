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

function threatFrames(id) {
  const base = `./assets/images/enemies/frames/${id}`;
  return {
    approaching: `${base}-approaching.png`,
    eating: `${base}-eating.png`,
    hit: `${base}-hit.png`,
    defeated: `${base}-defeated.png`,
    happy: `${base}-happy-v4.png`,
  };
}

function threatAnimationStrips(id) {
  const base = `./assets/images/enemies/animation/${id}`;
  return {
    approaching: `${base}-approach-strip-v2.png`,
    eating: `${base}-eat-strip-v2.png`,
    stealing: `${base}-eat-strip-v2.png`,
  };
}

const threatDefinitions = [
  {
    id: "bird",
    name: "새",
    maxHealth: 5,
    movementSpeed: 72,
    approachDurationMs: 6_500,
    approachMotion: "fly",
    spawnPhase: "day",
    isSilent: false,
    detectionType: "air",
    approachSound: "birdApproach",
    eatingSound: "threatEat",
    defeatSound: "birdDefeat",
    animationAsset: "./assets/images/enemies/bird-sprite.png",
    animationFrames: threatFrames("bird"),
    animationStrips: threatAnimationStrips("bird"),
    actorSize: 58,
    bountyCoins: 3,
  },
  {
    id: "squirrel",
    name: "다람쥐",
    maxHealth: 7,
    movementSpeed: 62,
    approachDurationMs: 7_200,
    approachMotion: "run",
    spawnPhase: "day",
    isSilent: false,
    detectionType: "ground-small",
    approachSound: "squirrelApproach",
    eatingSound: "threatEat",
    defeatSound: "squirrelDefeat",
    animationAsset: "./assets/images/enemies/squirrel-sprite.png",
    animationFrames: threatFrames("squirrel"),
    animationStrips: threatAnimationStrips("squirrel"),
    actorSize: 76,
    bountyCoins: 6,
  },
  {
    id: "rabbit",
    name: "토끼",
    maxHealth: 5,
    movementSpeed: 66,
    approachDurationMs: 6_800,
    approachMotion: "hop",
    spawnPhase: "day",
    isSilent: false,
    detectionType: "ground-small",
    approachSound: "rabbitApproach",
    eatingSound: "threatEat",
    defeatSound: "rabbitDefeat",
    animationAsset: "./assets/images/enemies/rabbit-sprite-v2.png",
    animationFrames: threatFrames("rabbit"),
    animationStrips: threatAnimationStrips("rabbit"),
    actorSize: 82,
    bountyCoins: 5,
  },
  {
    id: "boar",
    name: "멧돼지",
    maxHealth: 18,
    movementSpeed: 46,
    approachDurationMs: 8_500,
    approachMotion: "charge",
    spawnPhase: "night",
    isSilent: false,
    detectionType: "ground-large",
    approachSound: "boarApproach",
    eatingSound: "threatEat",
    defeatSound: "boarDefeat",
    animationAsset: "./assets/images/enemies/boar-sprite.png",
    animationFrames: threatFrames("boar"),
    animationStrips: threatAnimationStrips("boar"),
    actorSize: 108,
    bountyCoins: 15,
  },
  {
    id: "mouse",
    name: "들쥐",
    maxHealth: 5,
    movementSpeed: 70,
    approachDurationMs: 6_500,
    approachMotion: "scurry",
    spawnPhase: "night",
    isSilent: false,
    detectionType: "ground-small",
    approachSound: "mouseApproach",
    eatingSound: "threatEat",
    defeatSound: "mouseDefeat",
    animationAsset: "./assets/images/enemies/mouse-sprite-v2.png",
    animationFrames: threatFrames("mouse"),
    animationStrips: threatAnimationStrips("mouse"),
    actorSize: 56,
    bountyCoins: 4,
  },
  {
    id: "raccoon",
    name: "너구리",
    maxHealth: 10,
    movementSpeed: 54,
    approachDurationMs: 7_800,
    approachMotion: "run",
    spawnPhase: "night",
    isSilent: false,
    detectionType: "ground-medium",
    approachSound: "raccoonApproach",
    eatingSound: "threatEat",
    defeatSound: "raccoonDefeat",
    animationAsset: "./assets/images/enemies/raccoon-sprite-v2.png",
    animationFrames: threatFrames("raccoon"),
    animationStrips: threatAnimationStrips("raccoon"),
    actorSize: 84,
    bountyCoins: 9,
  },
  {
    id: "thief",
    name: "도둑",
    maxHealth: 12,
    movementSpeed: 28,
    approachDurationMs: 11_500,
    approachMotion: "sneak",
    spawnPhase: "night",
    isSilent: true,
    detectionType: "intruder",
    approachSound: null,
    eatingSound: "threatEat",
    defeatSound: "thiefDefeat",
    animationAsset: "./assets/images/enemies/thief-sprite.png",
    animationFrames: threatFrames("thief"),
    animationStrips: threatAnimationStrips("thief"),
    actorSize: 82,
    bountyCoins: 24,
  },
];

const config = {
  schemaVersion: 8,
  saveVersion: 8,
  storageKey: "mallinoi_cucumber_grow_save_v1",
  nativeStorageKey: "mallinoi_cucumber_grow_native_v8",
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
    threatRepelXp: 2,
    facilityInstallXp: 8,
  },
  economy: {
    startingCoins: 120,
    cucumberSalePrice: 3,
    plotPrices,
    baseHarvestYield: 10,
    harvestYieldIncrease: 20,
    consumables: {
      water: { id: "water", name: "물 60", amount: 60, price: 15, asset: "./assets/images/ui/resources/water-v2.png" },
      hammer: { id: "hammer", name: "뿅망치 1개", amount: 1, price: 20, asset: "./assets/images/tool-hammer.png" },
      fuel: { id: "fuel", name: "연료 15", amount: 15, price: 65, asset: "./assets/images/ui/resources/fuel-v2.png" },
      energy: { id: "energy", name: "에너지 15", amount: 15, price: 90, asset: "./assets/images/ui/resources/energy-v2.png" },
    },
    seeds: {
      basic: { id: "basic", name: "기본오이 씨앗", amount: 1, price: 5, asset: "./assets/images/ui/resources/cucumber-v2.png" },
      solar: { id: "solar", name: "태양열오이 씨앗", amount: 1, price: 35, asset: "./assets/images/ui/resources/solar-seed-v2.png" },
    },
  },
  resources: {
    startingWater: 120,
    startingFuel: 0,
    startingEnergy: 5,
    maximumEnergy: 100,
  },
  crops: {
    harvestExperience: 50,
    dayPassiveXpPerSecond: 0.25,
    defaultVarietyId: "basic",
    sunlightBoostDurationMs: 15_000,
    sunlightBoostMultiplier: 3,
    varieties: {
      basic: {
        id: "basic",
        name: "기본오이",
        startingSeeds: 10,
        stageAssets: {
          sprout: "./assets/images/cucumber-baby.png",
          young: "./assets/images/cucumber-boy.png",
          adult: "./assets/images/cucumber-adult.png",
        },
        damagedStageAssets: {
          sprout: [1, 2, 3].map((severity) => `./assets/images/crops/damaged/basic-sprout-bite-${severity}-v3.png`),
          young: [1, 2, 3].map((severity) => `./assets/images/crops/damaged/basic-young-bite-${severity}-v3.png`),
          adult: [1, 2, 3].map((severity) => `./assets/images/crops/damaged/basic-adult-bite-${severity}-v3.png`),
        },
      },
      solar: {
        id: "solar",
        name: "태양열오이",
        startingSeeds: 2,
        stageAssets: {
          sprout: "./assets/images/crops/solar/solar-sprout-v4.png",
          young: "./assets/images/crops/solar/solar-young-v4.png",
          adult: "./assets/images/crops/solar/solar-adult-v4.png",
        },
        damagedStageAssets: {
          sprout: [1, 2, 3].map((severity) => `./assets/images/crops/damaged/solar-sprout-bite-${severity}-v4.png`),
          young: [1, 2, 3].map((severity) => `./assets/images/crops/damaged/solar-young-bite-${severity}-v4.png`),
          adult: [1, 2, 3].map((severity) => `./assets/images/crops/damaged/solar-adult-bite-${severity}-v4.png`),
        },
        harvestEffect: "sunlight-boost",
      },
    },
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
  uiAssets: {
    resources: {
      cucumber: "./assets/images/ui/resources/cucumber-v2.png",
      coin: "./assets/images/ui/resources/coin-v2.png",
      water: "./assets/images/ui/resources/water-v2.png",
      fuel: "./assets/images/ui/resources/fuel-v2.png",
      energy: "./assets/images/ui/resources/energy-v2.png",
      seed: "./assets/images/ui/resources/solar-seed-v2.png",
      bounty: "./assets/images/ui/resources/bounty-v2.png",
    },
    policeStation: "./assets/images/facilities/police-station-v3.png",
    knockoutStars: "./assets/images/effects/knockout-stars-strip-v3.png",
    farmGate: "./assets/images/backgrounds/farm-gate-v4.png",
    village: "./assets/images/backgrounds/village-square-v4.png",
    menu: {
      settings: "./assets/images/ui/menu/settings-v3.png",
      farm: "./assets/images/ui/menu/farm-v3.png",
      facilities: "./assets/images/ui/menu/facilities-v3.png",
      inventory: "./assets/images/ui/menu/inventory-v3.png",
      codex: "./assets/images/ui/menu/codex-v3.png",
      shop: "./assets/images/ui/menu/shop-v3.png",
      report: "./assets/images/ui/menu/report-v3.png",
      exit: "./assets/images/ui/menu/exit-v3.png",
    },
  },
  tools: {
    wateringCan: {
      id: "wateringCan",
      name: "물뿌리개",
      asset: "./assets/images/water-gun.png",
      cropXp: 1,
      waterCost: 1,
      capacity: 30,
    },
    hammer: {
      id: "hammer",
      name: "뿅망치",
      asset: "./assets/images/tool-hammer.png",
      damage: 1,
      usesPerItem: 30,
    },
    waterTank: {
      id: "waterTank",
      name: "물통",
      asset: "./assets/images/facility-rain-barrel.png",
      refillAmount: 30,
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
      asset: "./assets/images/facilities/generator-v2.png",
      unlockLevel: 5,
      price: 600,
      placement: "terrace",
      cycleDurationMs: 10_000,
      fuelPerCycle: 2,
      energyPerCycle: 10,
      // 구버전 저장 데이터와 도감 표기를 위한 환산값이다.
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
      cropXpPerSecondAtNight: 0,
      energyPerSecond: 0.5,
    },
  ],
  turn: {
    dayDurationMs: 90_000,
    nightDurationMs: 60_000,
    phases: ["day", "night", "preparation"],
  },
  threats: {
    responseWindowMs: 13_000,
    dayIntervalMs: 13_000,
    nightIntervalMs: 10_500,
    hitDurationMs: 170,
    defeatedDisplayMs: 650,
    celebrateDurationMs: 900,
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
