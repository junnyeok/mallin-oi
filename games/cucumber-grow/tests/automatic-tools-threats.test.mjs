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
  hitThreat,
  advanceThreatStates,
  spawnThreat,
} from "../js/turn-engine.js";
import { useWateringCan } from "../js/game-engine.js";

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
  const plot = plant(state);
  const result = useWateringCan(state, plot.plotId, 2_000);
  assert.equal(result.ok, true);
  assert.equal(result.gained, 1);
  assert.equal(plot.crop.cropXp, 1);
  assert.equal(state.resources.water, GAME_CONFIG.resources.startingWater - 1);
});

test("빠른 10회 물주기는 자원 범위 안에서 10회 모두 처리된다", () => {
  const state = createInitialGameState(1_000);
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

test("위협 최대 체력은 새 5·다람쥐 7·멧돼지 15·도둑 12다", () => {
  assert.deepEqual(
    Object.fromEntries(GAME_CONFIG.threats.definitions.map(({ id, maxHealth }) => [id, maxHealth])),
    { bird: 5, squirrel: 7, boar: 15, thief: 12 }
  );
});

test("기본 뿅망치 한 번은 위협 체력을 정확히 1 낮춘다", () => {
  const state = createThreatState("boar");
  const result = hitThreat(state, "boar-1", 2_000);
  assert.equal(GAME_CONFIG.tools.hammer.damage, 1);
  assert.equal(result.damage, 1);
  assert.equal(result.health, 14);
});

test("체력 0의 쓰러짐과 보상은 빠른 추가 입력에도 한 번뿐이다", () => {
  const state = createThreatState("bird");
  for (let index = 0; index < 5; index += 1) hitThreat(state, "bird-1", 2_000 + index);
  assert.equal(state.threats[0].state, "defeated");
  assert.equal(state.playerXp, GAME_CONFIG.player.threatRepelXp);
  assert.equal(hitThreat(state, "bird-1", 2_010).reason, "already-defeated");
  assert.equal(state.playerXp, GAME_CONFIG.player.threatRepelXp);
});

test("위협은 접근·먹기·피격·쓰러짐·제거 상태를 순서대로 전환한다", () => {
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

test("낮 위협은 장면 밖 네 방향 중 저장된 무작위 지점에서 접근한다", () => {
  const state = createInitialGameState(1_000);
  plant(state);
  const values = [0, 0.5, 0, 0.9, 0.4];
  const result = spawnThreat(state, 2_000, () => values.shift() ?? 0);
  assert.equal(result.spawned, true);
  assert.equal(["top", "right", "bottom", "left"].includes(result.threat.spawnEdge), true);
  assert.equal(result.threat.spawnEdge, "left");
  assert.equal(result.threat.spawnLane > 0 && result.threat.spawnLane < 1, true);
  assert.equal(result.threat.state, "approaching");
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
    "squirrel-approach.wav", "boar-approach.wav", "threat-eat.wav",
    "bird-defeat.wav", "squirrel-defeat.wav", "boar-defeat.wav", "thief-defeat.wav",
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
