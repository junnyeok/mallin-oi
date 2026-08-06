import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  GAME_CONFIG,
  getThreatDefinitionById,
} from "../js/game-config.js";
import {
  createGardenPlot,
  createInitialGameState,
} from "../js/game-state.js";
import {
  claimTownBounty,
  hitThreat,
  advanceThreatStates,
  spawnThreat,
} from "../js/turn-engine.js";
import { reloadWateringCan, useWateringCan } from "../js/game-engine.js";

function plant(state, index = 0) {
  state.plots[index].crop.isPlanted = true;
  state.plots[index].crop.cropXp = 0;
  return state.plots[index];
}

function createThreatState(type = "bird", now = 1_000) {
  const state = createInitialGameState(now);
  const plot = plant(state);
  const definition = getThreatDefinitionById(type);
  state.turn.phase = definition.spawnPhase;
  state.threats = [{
    threatId: `${type}-1`,
    type,
    phase: definition.spawnPhase,
    targetPlotId: plot.plotId,
    state: "approaching",
    resumeState: null,
    health: definition.maxHealth,
    maxHealth: definition.maxHealth,
    spawnedAt: now,
    approachEndsAt: now + definition.approachDurationMs,
    actionEndsAt: now + GAME_CONFIG.threats.responseWindowMs,
    hitEndsAt: 0,
    defeatedAt: 0,
    despawnAt: 0,
    spawnEdge: "left",
    spawnLane: 0.5,
    rewardGranted: false,
    resolved: false,
  }];
  return state;
}

test("도구를 선택하지 않아도 오이 터치는 물주기로 이어진다", async () => {
  const [main, ui] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
  ]);
  assert.match(main, /const result = useWateringCan\(state, plotId\)/);
  assert.doesNotMatch(main + ui, /selectedAction|equippedTool/);
});

test("위협 터치는 고유 ID 뿅망치 처리 후 즉시 반환해 물주기로 전파되지 않는다", async () => {
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  const threatBlock = main.slice(
    main.indexOf('const threatButton = target?.closest?.("[data-threat-action]")'),
    main.indexOf('const button = target?.closest?.("[data-plot-action]")')
  );
  assert.match(threatBlock, /stopPropagation/);
  assert.match(threatBlock, /hitThreat\(state, threatId\)/);
  assert.match(threatBlock, /return;/);
  assert.doesNotMatch(threatBlock, /useWateringCan/);
});

test("장비 UI는 선택 버튼이 아닌 읽기 전용 상태 목록이다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /data-tool-status="wateringCan"/);
  assert.match(html, /data-tool-status="hammer"/);
  assert.doesNotMatch(html, /data-select-action|aria-pressed="true"/);
});

test("물주기 게임 플레이 쿨타임 설정과 분기가 제거됐다", async () => {
  const engine = await readFile(new URL("../js/game-engine.js", import.meta.url), "utf8");
  assert.equal("cooldownMs" in GAME_CONFIG.tools.wateringCan, false);
  assert.equal("cooldownMs" in GAME_CONFIG.tools.hammer, false);
  assert.doesNotMatch(engine, /wateringCanUntil|reason:\s*"cooldown"/);
});

test("유효한 물주기 한 번은 물 1과 작물 XP 1을 사용한다", () => {
  const state = createInitialGameState(1_000);
  state.turn.phase = "day";
  const plot = plant(state);
  const result = useWateringCan(state, plot.plotId, 2_000);
  assert.equal(result.ok, true);
  assert.equal(result.gained, 1);
  assert.equal(plot.crop.cropXp, 1);
  assert.equal(
    state.toolStatus.wateringCanCharge,
    GAME_CONFIG.tools.wateringCan.capacity - 1
  );
  assert.equal(state.resources.water, GAME_CONFIG.resources.startingWater);
});

test("빠른 10회 물주기는 자원 범위 안에서 10회 모두 처리된다", () => {
  const state = createInitialGameState(1_000);
  state.turn.phase = "day";
  const plot = plant(state);
  const results = Array.from({ length: 10 }, (_, index) =>
    useWateringCan(state, plot.plotId, 2_000 + index)
  );
  assert.equal(results.filter((result) => result.ok).length, 10);
  assert.equal(plot.crop.cropXp, 10);
});

test("텃밭은 3열과 0 간격·단일 경계선으로 밀착 배치된다", async () => {
  const css = await readFile(new URL("../css/game.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.plot-list\s*\{[\s\S]*?gap:\s*0;/);
  assert.match(css, /border-width:\s*3px 0 0 3px/);
  assert.match(css, /\.garden-plot\.is-right-edge\s*\{\s*border-right-width:\s*3px/);
});

test("낮·밤 위협은 크기에 따라 5~18회의 망치 체력을 가진다", () => {
  assert.deepEqual(
    Object.fromEntries(GAME_CONFIG.threats.definitions.map(({ id, maxHealth }) => [id, maxHealth])),
    { bird: 5, squirrel: 7, rabbit: 5, boar: 18, mouse: 5, raccoon: 10, thief: 12 }
  );
});

test("기본 뿅망치 한 번은 위협 체력을 정확히 1 낮춘다", () => {
  const state = createThreatState("boar");
  const result = hitThreat(state, "boar-1", 2_000);
  assert.equal(GAME_CONFIG.tools.hammer.damage, 1);
  assert.equal(result.damage, 1);
  assert.equal(result.health, 17);
});

test("체력 0에서는 즉시 퇴치 처리되고 보상금은 마을 경찰서에서 한 번 수령한다", () => {
  const state = createThreatState("bird");
  const startingCoins = state.coins;
  for (let index = 0; index < 5; index += 1) hitThreat(state, "bird-1", 2_000 + index);
  assert.equal(state.threats[0].state, "defeated");
  assert.equal(state.playerXp, GAME_CONFIG.player.threatRepelXp);
  assert.equal(state.coins, startingCoins);
  assert.equal(state.bounties.pendingCoins, getThreatDefinitionById("bird").bountyCoins);
  assert.equal(hitThreat(state, "bird-1", 2_010).reason, "already-defeated");
  advanceThreatStates(state, state.threats[0].despawnAt);
  assert.equal(state.threats.length, 0);
  const claimed = claimTownBounty(state);
  assert.equal(claimed.ok, true);
  assert.equal(claimed.bountyCoins, getThreatDefinitionById("bird").bountyCoins);
  assert.equal(state.coins, startingCoins + claimed.bountyCoins);
  assert.equal(claimTownBounty(state).reason, "no-bounty");
});

test("위협은 접근·먹기·피격 뒤 퇴치되면 짧은 쓰러짐 모션 후 사라진다", () => {
  const state = createThreatState("squirrel");
  const threat = state.threats[0];
  advanceThreatStates(state, threat.approachEndsAt);
  assert.equal(threat.state, "eating");
  hitThreat(state, threat.threatId, threat.approachEndsAt + 1);
  assert.equal(threat.state, "hit");
  advanceThreatStates(state, threat.hitEndsAt);
  assert.equal(threat.state, "eating");
  while (threat.health > 0) hitThreat(state, threat.threatId, threat.hitEndsAt + threat.health);
  assert.equal(threat.state, "defeated");
  advanceThreatStates(state, threat.despawnAt);
  assert.equal(state.threats.length, 0);
});

test("한 텃밭에는 동시에 한 위협만 배정해 겹침과 과도한 출몰을 막는다", () => {
  const state = createInitialGameState(1_000);
  state.turn.phase = "day";
  plant(state);
  assert.equal(spawnThreat(state, 2_000, () => 0).spawned, true);
  const second = spawnThreat(state, 2_100, () => 0);
  assert.equal(second.spawned, false);
  assert.equal(second.reason, "all-targets-busy");
  assert.equal(GAME_CONFIG.threats.dayIntervalMs >= 13_000, true);
  assert.equal(GAME_CONFIG.threats.nightIntervalMs >= 10_000, true);
});

test("낮 위협은 장면 밖 네 방향 중 저장된 무작위 지점에서 접근한다", () => {
  const state = createInitialGameState(1_000);
  state.turn.phase = "day";
  plant(state);
  const values = [0, 0.5, 0, 0.9, 0.4];
  const result = spawnThreat(state, 2_000, () => values.shift() ?? 0);
  assert.equal(result.spawned, true);
  assert.equal(["top", "right", "bottom", "left"].includes(result.threat.spawnEdge), true);
  assert.equal(result.threat.spawnEdge, "left");
  assert.equal(result.threat.attackSide, -1);
  assert.equal(result.threat.spawnLane > 0 && result.threat.spawnLane < 1, true);
  assert.equal(result.threat.state, "approaching");
});

test("위협은 출발한 화면 가장자리와 가까운 오이 쪽에서 먹기 시작한다", () => {
  const leftState = createInitialGameState(1_000);
  leftState.turn.phase = "day";
  plant(leftState);
  const leftValues = [0, 0.5, 0, 0.99, 0.5];
  const leftThreat = spawnThreat(leftState, 2_000, () => leftValues.shift() ?? 0).threat;
  assert.equal(leftThreat.spawnEdge, "left");
  assert.equal(leftThreat.attackSide, -1);

  const rightState = createInitialGameState(1_000);
  rightState.turn.phase = "day";
  plant(rightState);
  const rightValues = [0, 0.5, 0, 0.3, 0.5];
  const rightThreat = spawnThreat(rightState, 2_000, () => rightValues.shift() ?? 0).threat;
  assert.equal(rightThreat.spawnEdge, "right");
  assert.equal(rightThreat.attackSide, 1);
});

test("도둑은 가장 느리고 조용하며 접근 사운드가 없다", () => {
  const thief = getThreatDefinitionById("thief");
  const otherSpeeds = GAME_CONFIG.threats.daytime.map(({ movementSpeed }) => movementSpeed);
  assert.equal(thief.isSilent, true);
  assert.equal(thief.approachSound, null);
  assert.equal(thief.movementSpeed < Math.min(...otherSpeeds), true);
  assert.equal(thief.approachMotion, "sneak");
});

test("캐릭터별 접근·쓰러짐 사운드와 도둑 무음 규칙이 매핑된다", async () => {
  const audioSource = await readFile(new URL("../js/audio-manager.js", import.meta.url), "utf8");
  for (const definition of GAME_CONFIG.threats.definitions) {
    if (definition.approachSound) assert.match(audioSource, new RegExp(`${definition.approachSound}:`));
    assert.match(audioSource, new RegExp(`${definition.defeatSound}:`));
  }
  assert.equal(getThreatDefinitionById("thief").approachSound, null);
});

test("공통 갉아먹는 사운드는 모든 위협에 연결된다", () => {
  assert.equal(
    GAME_CONFIG.threats.definitions.every(({ eatingSound }) => eatingSound === "threatEat"),
    true
  );
});

test("체력바는 현재 체력 비율과 상태색을 표시하고 배우와 함께 제거된다", async () => {
  const [ui, css] = await Promise.all([
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /healthPercent/);
  assert.match(ui, /체력 \$\{threat\.health\}\/\$\{definition\.maxHealth\}/);
  assert.match(ui, /view\.actor\.remove\(\)/);
  assert.match(css, /data-health-level="medium"/);
  assert.match(css, /data-health-level="low"/);
  assert.match(css, /\.threat-health[\s\S]*?pointer-events:\s*none/);
});

test("목표 오이가 사라지면 다른 심어진 텃밭을 찾고 없으면 퇴장한다", () => {
  const state = createThreatState("bird");
  state.plots.push(createGardenPlot(2));
  plant(state, 1);
  state.plots[0].crop.isPlanted = false;
  advanceThreatStates(state, 2_000);
  assert.equal(state.threats[0].targetPlotId, state.plots[1].plotId);
  assert.equal(state.threats[0].state, "approaching");
  state.plots[1].crop.isPlanted = false;
  advanceThreatStates(state, 2_100);
  assert.equal(state.threats[0].state, "despawning");
  advanceThreatStates(state, state.threats[0].despawnAt);
  assert.equal(state.threats.length, 0);
});

test("앱 백그라운드 전환은 루프·파일 사운드·포인터 상태를 정지한다", async () => {
  const [main, audio, camera] = await Promise.all([
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/audio-manager.js", import.meta.url), "utf8"),
    readFile(new URL("../js/world-camera.js", import.meta.url), "utf8"),
  ]);
  assert.match(main, /stopLoops\(\)/);
  assert.match(main, /audio\.setActive\(false\)/);
  assert.match(main, /interactionPauseStartedAt/);
  assert.match(main, /resumeInteractionClock\(now\)/);
  assert.match(audio, /stopFileSounds\(\)/);
  assert.match(camera, /gameappinactive/);
  assert.match(camera, /cancelGesture\(\)/);
});

test("제거된 위협과 전투 파티클은 DOM·타이머·오디오 풀을 제한해 정리한다", async () => {
  const [ui, audio] = await Promise.all([
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
    readFile(new URL("../js/audio-manager.js", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /takeEffectFromPool\(this\.combatEffectPool, 4/);
  assert.match(ui, /effect\.hidden = true/);
  assert.match(ui, /view\.actor\.remove\(\)/);
  assert.match(audio, /FILE_POOL_LIMITS/);
  assert.match(audio, /activeFileAudio\.clear\(\)/);
});

test("원본과 독립 모바일 배포본의 전투 코드·자산은 바이트 단위로 같다", async () => {
  const appRoot = new URL("../../../apps/cucumber-grow-mobile/dist/", import.meta.url);
  const paths = [
    "index.html",
    "css/game.css",
    "js/main.js",
    "js/turn-engine.js",
    "assets/images/enemies/bird-sprite.png",
    "assets/images/enemies/thief-sprite.png",
    "assets/sounds/combat/hammer-hit.wav",
    "assets/sounds/combat/threat-eat.wav",
  ];
  for (const relativePath of paths) {
    const [source, built] = await Promise.all([
      readFile(new URL(`../${relativePath}`, import.meta.url)),
      readFile(new URL(relativePath, appRoot)),
    ]);
    assert.equal(Buffer.compare(source, built), 0, relativePath);
  }
});

test("생성 효과음은 WebView 호환 22.05kHz 모노 PCM WAV다", async () => {
  const fileNames = [
    "hammer-swing.wav", "hammer-hit.wav", "bird-approach.wav",
    "squirrel-approach.wav", "rabbit-approach.wav", "boar-approach.wav",
    "mouse-approach.wav", "raccoon-approach.wav", "threat-eat.wav",
    "bird-defeat.wav", "squirrel-defeat.wav", "rabbit-defeat.wav",
    "boar-defeat.wav", "mouse-defeat.wav", "raccoon-defeat.wav", "thief-defeat.wav",
  ];
  for (const fileName of fileNames) {
    const data = await readFile(new URL(`../assets/sounds/combat/${fileName}`, import.meta.url));
    assert.equal(data.toString("ascii", 0, 4), "RIFF");
    assert.equal(data.toString("ascii", 8, 12), "WAVE");
    assert.equal(data.readUInt16LE(22), 1);
    assert.equal(data.readUInt32LE(24), 22_050);
    assert.equal(data.readUInt16LE(34), 16);
  }
});

test("준비 시간에는 물주기를 막고 물통을 눌러 최대 30까지 재충전한다", () => {
  const state = createInitialGameState(1_000);
  const plot = plant(state);
  assert.equal(useWateringCan(state, plot.plotId).reason, "turn-not-active");
  state.turn.phase = "day";
  state.toolStatus.wateringCanCharge = 0;
  assert.equal(useWateringCan(state, plot.plotId).reason, "watering-can-empty");
  const refill = reloadWateringCan(state);
  assert.equal(refill.ok, true);
  assert.equal(refill.charge, 30);
  assert.equal(state.resources.water, GAME_CONFIG.resources.startingWater - 30);
});

test("뿅망치 한 개는 정확히 30회 사용 후 소모된다", () => {
  const state = createThreatState("boar");
  state.threats[0].health = 100;
  state.threats[0].maxHealth = 100;
  for (let index = 0; index < 30; index += 1) {
    state.threats[0].resolved = false;
    state.threats[0].state = "approaching";
    const result = hitThreat(state, "boar-1", 2_000 + index);
    assert.equal(result.ok, true);
  }
  assert.equal(state.inventory.hammer, 0);
  assert.equal(state.toolStatus.hammerUsesRemaining, 0);
  state.threats[0].resolved = false;
  state.threats[0].state = "approaching";
  assert.equal(hitThreat(state, "boar-1", 3_000).reason, "no-hammer");
});
