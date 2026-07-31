import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  compareVersions,
  fetchJsonResource,
  getAndroidStoreDecision,
  getDismissKey,
  getIosStoreDecision,
  getInstalledAppInfo,
  getNativePlatform,
  getStoreLinks,
  getUpdateDecision,
  isAllowedStoreUrl,
  normalizeVersion,
  openStore,
  parseIosLookupResponse,
  runSingleFlight,
  wasRecentlyDismissed,
  withTimeout,
} from '../assets/js/modules/app-update-popup.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const installed = { id: 'com.mallinoi.calendar', version: '1.0.14', build: 18 };
const androidConfig = {
  latestVersion: '1.0.15',
  latestBuild: 19,
  minimumVersion: '1.0.7',
  minimumBuild: 12,
  forceUpdate: false,
  storeUrl:
    'https://play.google.com/store/apps/details?id=com.mallinoi.calendar',
};
const androidAvailable = {
  updateAvailability: 2,
  availableVersionCode: 19,
  updatePriority: 0,
};
const iosConfig = {
  latestVersion: '1.0.15',
  minimumVersion: '1.0.7',
  forceUpdate: false,
  storeUrl: 'https://apps.apple.com/kr/app/id6774468038',
};

function iosLookup(version = '1.0.15') {
  return {
    resultCount: 1,
    results: [
      {
        trackId: 6774468038,
        bundleId: 'com.mallinoi.calendar',
        version,
      },
    ],
  };
}

test('숫자 단위 버전 비교: 1.0.9 < 1.0.10', () => {
  assert.equal(compareVersions('1.0.9', '1.0.10'), -1);
});

test('누락된 0 단위는 동일: 1.2 = 1.2.0', () => {
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
});

test('v 접두사와 빌드 메타데이터를 안전하게 정규화한다', () => {
  assert.deepEqual(normalizeVersion(' v1.0.15+20 '), [1, 0, 15]);
});

test('설치 버전과 빌드는 Capacitor App getInfo 응답에서 읽는다', async () => {
  const originalWindow = globalThis.window;
  globalThis.window = {
    Capacitor: {
      Plugins: {
        App: {
          async getInfo() {
            return {
              id: 'com.mallinoi.calendar',
              version: '1.0.14',
              build: '20',
            };
          },
        },
      },
    },
  };
  try {
    assert.deepEqual(await getInstalledAppInfo(), {
      id: 'com.mallinoi.calendar',
      version: '1.0.14',
      build: 20,
    });
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test('잘못된 버전 문자열은 업데이트로 판단하지 않는다', () => {
  assert.equal(compareVersions('not-a-version', '1.0.0'), null);
  assert.equal(compareVersions('1.0.15-beta', '1.0.14'), null);
  assert.equal(getIosStoreDecision(installed, iosLookup('latest'), iosConfig), null);
});

test('iOS 설치 버전과 스토어 버전이 같으면 안내하지 않는다', () => {
  const decision = getIosStoreDecision(installed, iosLookup('1.0.14'), iosConfig);
  assert.equal(decision.hasUpdate, false);
  assert.equal(decision.status, 'notAvailable');
});

test('iOS 설치 버전이 더 높으면 다운그레이드 안내를 하지 않는다', () => {
  const decision = getIosStoreDecision(installed, iosLookup('1.0.13'), iosConfig);
  assert.equal(decision.hasUpdate, false);
  assert.equal(decision.status, 'installedIsNewer');
});

test('iOS 스토어 버전이 더 높으면 안내 대상으로 판단한다', () => {
  const decision = getIosStoreDecision(installed, iosLookup(), iosConfig);
  assert.equal(decision.hasUpdate, true);
  assert.equal(decision.latestVersion, '1.0.15');
  assert.equal(decision.target, 'version:1.0.15');
});

test('Android Play가 업데이트 가능이라고 응답한 경우만 안내한다', () => {
  const decision = getAndroidStoreDecision(
    installed,
    androidAvailable,
    androidConfig,
  );
  assert.equal(decision.hasUpdate, true);
  assert.equal(decision.latestBuild, 19);
  assert.equal(decision.target, 'build:19');
});

test('Android Play가 업데이트 없음이라고 응답하면 안내하지 않는다', () => {
  const decision = getAndroidStoreDecision(
    installed,
    { updateAvailability: 1, availableVersionCode: 18 },
    androidConfig,
  );
  assert.equal(decision.hasUpdate, false);
  assert.equal(decision.status, 'notAvailable');
});

test('Play Store 미소유·API 불가 상태는 조용히 건너뛴다', () => {
  const decision = getAndroidStoreDecision(
    installed,
    { updateAvailability: 0, status: 'unavailable', errorCode: -10 },
    androidConfig,
  );
  assert.equal(decision.hasUpdate, false);
  assert.equal(decision.status, 'unavailable');
});

test('Play 확인 불가 상태는 24시간 성공 간격으로 덮지 않고 실패 재시도 간격을 유지한다', () => {
  const source = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/app-update-popup.js'),
    'utf8',
  );
  assert.match(
    source,
    /if \(decision\.status === 'unavailable'\) \{[\s\S]*?return;[\s\S]*?updateState\.nextCheckAt\s*=/,
  );
});

test('Play 응답 빌드와 원격 표시 정보가 다르면 Play 빌드를 우선한다', () => {
  const decision = getAndroidStoreDecision(installed, androidAvailable, {
    ...androidConfig,
    latestVersion: '1.0.99',
    latestBuild: 99,
    forceUpdate: true,
  });
  assert.equal(decision.hasUpdate, true);
  assert.equal(decision.configConflict, true);
  assert.equal(decision.required, false);
  assert.equal(decision.latestLabel, 'Google Play 제공 빌드 19');
});

test('iOS Lookup 정상 응답은 App Store ID와 Bundle ID를 검증한다', () => {
  assert.deepEqual(parseIosLookupResponse(iosLookup()), { version: '1.0.15' });
  const wrongBundle = iosLookup();
  wrongBundle.results[0].bundleId = 'com.example.other';
  assert.equal(parseIosLookupResponse(wrongBundle), null);
});

test('iOS 결과 없음과 잘못된 응답은 업데이트로 판단하지 않는다', () => {
  assert.equal(parseIosLookupResponse({ resultCount: 0, results: [] }), null);
  assert.equal(parseIosLookupResponse({ resultCount: 1, results: [{}] }), null);
});

test('네트워크 오류와 타임아웃은 호출자에게 실패로 전달된다', async () => {
  await assert.rejects(
    fetchJsonResource('https://itunes.apple.com/lookup?id=6774468038', {
      fetchImpl: async () => {
        throw new Error('offline');
      },
    }),
    /offline/,
  );
  await assert.rejects(
    withTimeout(new Promise(() => {}), 5, 'mock store'),
    /mock store timed out/,
  );
});

test('동일 대상 버전은 나중에 선택 기간 안에 다시 표시하지 않는다', () => {
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
  };
  const now = Date.UTC(2026, 6, 31, 0, 0, 0);
  values.set(getDismissKey('ios', 'version:1.0.15'), String(now - 1000));
  assert.equal(
    wasRecentlyDismissed('ios', 'version:1.0.15', 24, { storage, now }),
    true,
  );
});

test('새 대상 버전은 이전 닫기 기록과 무관하게 표시할 수 있다', () => {
  const oldKey = getDismissKey('ios', 'version:1.0.15');
  const storage = { getItem: (key) => (key === oldKey ? String(Date.now()) : null) };
  assert.equal(
    wasRecentlyDismissed('ios', 'version:1.0.16', 24, { storage }),
    false,
  );
});

test('Android와 iOS의 공식 스토어 URL을 선택한다', () => {
  const android = getStoreLinks('android', androidConfig);
  const ios = getStoreLinks('ios', iosConfig);
  assert.equal(
    android.primary,
    'market://details?id=com.mallinoi.calendar',
  );
  assert.equal(
    android.fallback,
    'https://play.google.com/store/apps/details?id=com.mallinoi.calendar',
  );
  assert.equal(
    ios.primary,
    'itms-apps://itunes.apple.com/app/id6774468038',
  );
  assert.equal(ios.fallback, 'https://apps.apple.com/kr/app/id6774468038');
});

test('허용되지 않은 외부 스토어 URL은 거부한다', () => {
  assert.equal(isAllowedStoreUrl('android', 'https://example.com/app'), false);
  assert.equal(
    isAllowedStoreUrl('ios', 'https://apps.apple.com/kr/app/id123'),
    false,
  );
});

test('스토어 딥링크 실패 시 HTTPS 주소로 폴백한다', async () => {
  const opened = [];
  const launcher = {
    async openUrl({ url }) {
      opened.push(url);
      return { completed: url.startsWith('https://') };
    },
  };
  const result = await openStore('android', androidConfig, launcher);
  assert.equal(result, androidConfig.storeUrl);
  assert.deepEqual(opened, [
    'market://details?id=com.mallinoi.calendar',
    androidConfig.storeUrl,
  ]);
});

test('스토어 앱과 HTTPS 열기가 모두 실패하면 재시도 가능한 오류가 된다', async () => {
  await assert.rejects(
    openStore('ios', iosConfig, {
      async openUrl() {
        return { completed: false };
      },
    }),
    /could not be opened/,
  );
});

test('일반 웹 브라우저에서는 네이티브 플랫폼으로 판정하지 않는다', () => {
  assert.equal(
    getNativePlatform({
      isNativePlatform: () => false,
      getPlatform: () => 'web',
    }),
    '',
  );
});

test('시작·포그라운드 중복 요청은 single-flight로 하나만 실행한다', async () => {
  const state = { checkPromise: null };
  let calls = 0;
  let finish;
  const pending = new Promise((resolve) => {
    finish = resolve;
  });
  const task = async () => {
    calls += 1;
    await pending;
    return 'done';
  };
  const first = runSingleFlight(state, 'checkPromise', task);
  const second = runSingleFlight(state, 'checkPromise', task);
  assert.equal(first, second);
  finish();
  assert.equal(await first, 'done');
  assert.equal(calls, 1);
  assert.equal(state.checkPromise, null);
});

test('기존 최소 버전·강제 업데이트 정책은 스토어 대상과 일치할 때 유지된다', () => {
  const forcedAndroid = getAndroidStoreDecision(installed, androidAvailable, {
    ...androidConfig,
    forceUpdate: true,
  });
  assert.equal(forcedAndroid.required, true);

  const legacyDecision = getUpdateDecision(
    { version: '1.0.5', build: 10 },
    androidConfig,
  );
  assert.equal(legacyDecision.hasUpdate, true);
  assert.equal(legacyDecision.required, true);
});
