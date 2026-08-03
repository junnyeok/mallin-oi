import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { GAME_CONFIG } from "../js/game-config.js";
import { createInitialGameState } from "../js/game-state.js";
import { calculateOfflineReward } from "../js/offline-reward.js";
import {
  AsyncLocalStorageBackend,
  GameSaveRepository,
  checksumText,
} from "../js/save-repository.js";
import {
  CAMERA_DRAG_THRESHOLD_PX,
  clampCameraOffset,
  isTapGesture,
} from "../js/world-camera.js";

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }

  removeItem(key) {
    this.values.delete(key);
  }
}

test("월드 카메라는 첫 행과 마지막 행 사이에서만 이동한다", () => {
  assert.equal(clampCameraOffset(120, 500, 900), 0);
  assert.equal(clampCameraOffset(-180, 500, 900), -180);
  assert.equal(clampCameraOffset(-900, 500, 900), -400);
  assert.equal(clampCameraOffset(-30, 700, 500), 0);
});

test("짧은 탭과 카메라 드래그·취소·멀티터치를 거리로 구분한다", () => {
  assert.equal(
    isTapGesture({ deltaX: 2, deltaY: 3, durationMs: 140 }),
    true
  );
  assert.equal(
    isTapGesture({
      deltaX: 0,
      deltaY: CAMERA_DRAG_THRESHOLD_PX + 1,
      durationMs: 140,
    }),
    false
  );
  assert.equal(
    isTapGesture({ deltaX: 0, deltaY: 0, durationMs: 700 }),
    false
  );
  assert.equal(
    isTapGesture({ deltaX: 0, deltaY: 0, durationMs: 100, cancelled: true }),
    false
  );
});

test("네이티브 저장은 체크섬과 리비전이 있는 이중 슬롯으로 이전 정상본을 복구한다", async () => {
  const storage = new MemoryStorage();
  const backend = new AsyncLocalStorageBackend(storage);
  const repository = new GameSaveRepository({ backend, debounceMs: 0, now: () => 10_000 });
  const state = createInitialGameState(1_000);
  state.coins = 150;
  assert.equal((await repository.persistNow(state, 2_000)).ok, true);
  state.coins = 310;
  assert.equal((await repository.persistNow(state, 3_000)).ok, true);

  const slotAKey = `${GAME_CONFIG.nativeStorageKey}:slot-a`;
  const slotBKey = `${GAME_CONFIG.nativeStorageKey}:slot-b`;
  assert.ok(storage.getItem(slotAKey));
  assert.ok(storage.getItem(slotBKey));
  storage.setItem(slotBKey, "{broken");

  const restored = await new GameSaveRepository({ backend, now: () => 10_000 }).load(10_000);
  assert.equal(restored.state.coins, 150);
  assert.equal(restored.revision, 1);
  assert.equal(restored.recoveredFromBackup, true);
});

test("기기 시계가 크게 뒤로 가도 오프라인 보상을 만들지 않는다", () => {
  const state = createInitialGameState(10_000_000);
  const result = calculateOfflineReward(
    state,
    10_000_000 - GAME_CONFIG.maximumClockSkewMs - 1
  );
  assert.equal(result.elapsedSeconds, 0);
  assert.equal(result.clockMovedBackward, true);
});

test("기존 localStorage v3 저장은 진행을 유지한 채 v4 네이티브 슬롯으로 한 번 마이그레이션한다", async () => {
  const legacyStorage = new MemoryStorage();
  const nativeStorage = new MemoryStorage();
  const legacyState = createInitialGameState(1_000);
  legacyState.schemaVersion = 3;
  legacyState.saveVersion = 3;
  legacyState.cucumbers = 27;
  legacyState.coins = 901;
  legacyStorage.setItem(GAME_CONFIG.storageKey, JSON.stringify(legacyState));

  const repository = new GameSaveRepository({
    backend: new AsyncLocalStorageBackend(nativeStorage),
    legacyStorage,
    now: () => 5_000,
  });
  const first = await repository.load(5_000);
  assert.equal(first.status, "migrated");
  assert.equal(first.sourceSchema, "v3");
  assert.equal(first.state.cucumbers, 27);
  assert.equal(first.state.coins, 901);
  assert.equal(first.state.schemaVersion, GAME_CONFIG.schemaVersion);

  const second = await new GameSaveRepository({
    backend: new AsyncLocalStorageBackend(nativeStorage),
    legacyStorage,
    now: () => 6_000,
  }).load(6_000);
  assert.equal(second.status, "loaded");
  assert.equal(second.state.cucumbers, 27);
});

test("백업 체크섬은 내용 변경을 감지한다", () => {
  assert.equal(checksumText("cucumber"), checksumText("cucumber"));
  assert.notEqual(checksumText("cucumber"), checksumText("cucumbers"));
});

test("모바일 앱 화면은 고정 게임 장면·고정 HUD·하단 메뉴·전용 장면으로 구성된다", async () => {
  const [html, css] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../css/game.css", import.meta.url), "utf8"),
  ]);
  assert.match(html, /class="garden-viewport"/);
  assert.match(html, /id="worldCamera"/);
  assert.match(html, /class="bottom-menu"/);
  assert.match(html, /data-scene-panel="facilities"/);
  assert.match(html, /data-scene-panel="inventory"/);
  assert.match(html, /data-scene-panel="codex"/);
  assert.match(html, /data-scene-panel="shop"/);
  assert.match(html, /data-scene-panel="settings"/);
  assert.doesNotMatch(html, /<footer|<a\s/i);
  assert.match(css, /html,\s*\nbody\s*\{[\s\S]*?overflow:\s*hidden/);
  assert.match(css, /\.game-hud\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /\.bottom-menu\s*\{[\s\S]*?position:\s*absolute/);
  assert.match(css, /env\(safe-area-inset-top/);
  assert.match(css, /height:\s*100dvh/);
});

test("앱 생명주기는 타이머를 정지하고 단일 루프만 다시 시작한다", async () => {
  const main = await readFile(new URL("../js/main.js", import.meta.url), "utf8");
  assert.match(main, /if \(!started \|\| !runtimeActive \|\| tickTimer !== null\) return/);
  assert.match(main, /function stopLoops\(\)/);
  assert.match(main, /applyOfflineReward\(state, now\)/);
  assert.match(main, /addAppStateListener/);
  assert.match(main, /audio\.setActive\(false\)/);
  assert.match(main, /flushState\(\{ announceFailure: false \}\)/);
});

test("오디오·진동은 독립 설정으로 저장되고 첫 입력 뒤 활성화된다", async () => {
  const [html, main, audio] = await Promise.all([
    readFile(new URL("../index.html", import.meta.url), "utf8"),
    readFile(new URL("../js/main.js", import.meta.url), "utf8"),
    readFile(new URL("../js/audio-manager.js", import.meta.url), "utf8"),
  ]);
  assert.match(html, /id="bgmEnabled"/);
  assert.match(html, /id="sfxEnabled"/);
  assert.match(html, /id="hapticsEnabled"/);
  assert.match(html, /id="supportUrlButton"/);
  assert.match(main, /startButton\.addEventListener\("click"/);
  assert.match(main, /await audio\.unlock\(\)/);
  assert.match(audio, /stopBgm\(\)/);
  assert.match(audio, /activeFileAudio/);
});

test("모바일 래퍼는 캘린더 앱과 다른 임시 식별자·세로 방향·별도 webDir을 사용한다", async () => {
  const appRoot = new URL("../../../apps/cucumber-grow-mobile/", import.meta.url);
  const [capacitorConfig, androidManifest, androidGradle, iosProject, iosPlist, iosPrivacy] = await Promise.all([
    readFile(new URL("capacitor.config.json", appRoot), "utf8"),
    readFile(new URL("android/app/src/main/AndroidManifest.xml", appRoot), "utf8"),
    readFile(new URL("android/app/build.gradle", appRoot), "utf8"),
    readFile(new URL("ios/App/App.xcodeproj/project.pbxproj", appRoot), "utf8"),
    readFile(new URL("ios/App/App/Info.plist", appRoot), "utf8"),
    readFile(new URL("ios/App/App/PrivacyInfo.xcprivacy", appRoot), "utf8"),
  ]);
  assert.match(capacitorConfig, /"appId": "com\.mallinoi\.cucumbergrow\.dev"/);
  assert.match(capacitorConfig, /"webDir": "dist"/);
  assert.match(androidManifest, /android:screenOrientation="portrait"/);
  assert.match(androidGradle, /applicationId "com\.mallinoi\.cucumbergrow\.dev"/);
  assert.doesNotMatch(androidGradle, /com\.mallinoi\.calendar/);
  assert.match(iosProject, /PRODUCT_BUNDLE_IDENTIFIER = com\.mallinoi\.cucumbergrow\.dev/);
  assert.doesNotMatch(iosProject, /com\.mallinoi\.calendar/);
  assert.doesNotMatch(iosPlist, /UIInterfaceOrientationLandscape/);
  assert.match(iosPrivacy, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(iosPrivacy, /CA92\.1/);
  assert.match(iosPrivacy, /C617\.1/);
  assert.match(iosPrivacy, /<key>NSPrivacyTracking<\/key>\s*<false\/>/);
});
