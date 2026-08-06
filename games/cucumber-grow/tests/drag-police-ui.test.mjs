import assert from "node:assert/strict";
import test from "node:test";
import { access, readFile } from "node:fs/promises";

import { GAME_CONFIG } from "../js/game-config.js";
import { createInitialGameState } from "../js/game-state.js";
import { pauseTurnClock } from "../js/turn-engine.js";

function pngDimensions(data) {
  assert.equal(data.toString("ascii", 1, 4), "PNG");
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

test("상단에는 물통과 마을 문만 있고 경찰서는 마을 장면으로 이동했다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.equal(html.indexOf("id=\"waterTankButton\"") < html.indexOf("id=\"townGateButton\""), true);
  assert.equal(html.indexOf("id=\"townGateButton\"") < html.indexOf("class=\"plot-list\""), true);
  assert.doesNotMatch(html, /policeStationButton|claimBountyButton|class="police-station"/);
  assert.match(html, /data-scene-panel="village"/);
  assert.match(html, /id="villagePoliceButton"/);
  assert.match(html, /id="townGateButton"/);
});

test("씨앗 모달·안내문을 없애고 드래그 씨앗줄과 세 장비 상태를 둔다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.match(html, /id="seedDragList"/);
  assert.doesNotMatch(html, /seedPickerModal|seedOptionList|CHOOSE A SEED/);
  assert.doesNotMatch(html, /씨앗을 텃밭으로 끌어 심기/);
  assert.equal((html.match(/data-tool-status=/g) ?? []).length, 3);
  assert.match(html, /data-tool-status="waterTank"/);
  assert.match(html, /id="waterTankStatus">물 0/);
  assert.doesNotMatch(html, /waterTankReserve/);
});

test("이모지 HUD를 로컬 게임 아이콘으로 바꾸고 생성 자산은 유효한 PNG다", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  assert.doesNotMatch(html, /[🌱🏡🎒📗🛒⚙🚓📋🥒]/u);
  const assets = [
    "../assets/images/facilities/police-station-v3.png",
    "../assets/images/ui/menu/settings-v3.png",
    "../assets/images/ui/menu/farm-v3.png",
    "../assets/images/ui/menu/facilities-v3.png",
    "../assets/images/ui/menu/inventory-v3.png",
    "../assets/images/ui/menu/codex-v3.png",
    "../assets/images/ui/menu/shop-v3.png",
    "../assets/images/ui/menu/report-v3.png",
    "../assets/images/ui/menu/exit-v3.png",
    "../assets/images/backgrounds/farm-gate-v4.png",
    "../assets/images/backgrounds/village-square-v4.png",
    "../assets/images/crops/solar/solar-adult-v4.png",
    "../assets/images/enemies/frames/bird-happy-v4.png",
  ];
  for (const asset of assets) {
    const url = new URL(asset, import.meta.url);
    await access(url);
    const data = await readFile(url);
    assert.equal(data.toString("ascii", 1, 4), "PNG", asset);
  }
  const solar = pngDimensions(await readFile(new URL("../assets/images/crops/solar/solar-adult-v4.png", import.meta.url)));
  assert.equal(solar.width > 100 && solar.height > 100, true);
});

test("모든 오이 종류와 성장 단계는 3단계 전용 갉아먹힘 이미지를 가진다", async () => {
  for (const variety of Object.values(GAME_CONFIG.crops.varieties)) {
    for (const stage of GAME_CONFIG.crops.growthStages) {
      const assets = variety.damagedStageAssets[stage.id];
      assert.equal(assets.length, 3);
      for (const asset of assets) {
        await access(new URL(`..${asset.slice(1)}`, import.meta.url));
      }
    }
  }
});

test("시트 프레임은 네 개의 정확한 위치만 사용하고 첫 생성은 좌표 확정 전 숨긴다", async () => {
  const [css, ui] = await Promise.all([
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
    readFile(new URL("../js/ui-renderer.js", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(css, /threat-sheet-frames[^}]*steps\(4\)/s);
  assert.match(css, /25%,49\.999%\s*\{\s*background-position:33\.333% 0/);
  assert.match(css, /75%,100%\s*\{\s*background-position:100% 0/);
  assert.match(css, /\.threat-actor\.is-unpositioned\s*\{[^}]*visibility:hidden/);
  assert.match(ui, /className = "threat-actor is-unpositioned"/);
});

test("먹은 뒤 기뻐하는 모션과 퇴장 시각은 백그라운드 일시정지 시간만큼 이동한다", () => {
  const state = createInitialGameState(1_000);
  state.turn.phase = "day";
  state.threats = [{ celebrateEndsAt: 5_000, despawnAt: 6_000 }];
  pauseTurnClock(state, 3_000);
  assert.equal(state.threats[0].celebrateEndsAt, 8_000);
  assert.equal(state.threats[0].despawnAt, 9_000);
});
