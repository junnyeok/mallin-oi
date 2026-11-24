import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

import {
  configureSecondaryAudioSession,
  shouldPlaySecondaryAudio,
} from '../assets/js/modules/completion-audio-session.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profileSource = fs.readFileSync(
  path.join(rootDir, 'assets/js/modules/profile.js'),
  'utf8',
);

function createProfilePlayer({
  isPlaying = false,
  isStarting = false,
  resumeCheck = Promise.resolve(),
} = {}) {
  const personalPlayback = { isPlaying, isStarting };
  const calls = [];
  let resolveExternalAudioCheck;
  const externalAudioCheck = new Promise((resolve) => {
    resolveExternalAudioCheck = resolve;
  });
  const profileAudioSource = profileSource.slice(
    profileSource.indexOf('async function playProfileFeaturedBgm('),
    profileSource.indexOf('function escapeHtml('),
  );
  const init = runInNewContext(`${profileAudioSource}\ninitProfileFeaturedBgm`, {
    AbortController,
    Audio: class extends EventTarget {
      paused = true;

      async play() {
        this.paused = false;
        calls.push('play featured BGM');
      }
    },
    window: new EventTarget(),
    document: { body: { dataset: { page: 'profile' } } },
    $: () => new EventTarget(),
    profileFeaturedBgmState: null,
    profileFeaturedBgmResumeHandle: null,
    PERSONAL_BGM_PLAY_EVENT: 'mallin:personal-bgm-play',
    PROFILE_FEATURED_BGM_SOURCE: 'profile-featured-bgm',
    destroyProfileFeaturedBgm: async () => {},
    getProfileFeaturedBgmTrack: () => ({
      audioPath: 'featured.mp3',
      coverPath: 'featured.png',
    }),
    isUsableProfileBgmTrack: () => true,
    updateProfileFeaturedBgmUi: () => {},
    shouldPlaySecondaryAudio: () => externalAudioCheck,
    getBgmPlaybackState: () => personalPlayback,
    waitForBgmResumeCheck: () => resumeCheck,
    configureSecondaryAudioSession: () => calls.push('configure audio session'),
    pauseBgmForExternalAudio: () => calls.push('pause personal BGM'),
  });

  return { init, calls, resolveExternalAudioCheck, personalPlayback };
}

function createNativeWindow(isPlaying) {
  return {
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: (name) => {
        assert.equal(name, 'CompletionAudioSession');
        return {
          async isExternalAudioPlaying() {
            return { playing: isPlaying };
          },
        };
      },
    },
  };
}

test('네이티브 외부 오디오 재생 여부에 따라 대표 BGM 자동재생을 결정한다', async () => {
  assert.equal(await shouldPlaySecondaryAudio(createNativeWindow(true)), false);
  assert.equal(await shouldPlaySecondaryAudio(createNativeWindow(false)), true);
});

test('네이티브 판별 실패 시 외부 오디오 보호를 위해 자동재생을 생략한다', async () => {
  const windowRef = {
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: () => ({
        async isExternalAudioPlaying() {
          throw new Error('unavailable');
        },
      }),
    },
  };

  assert.equal(await shouldPlaySecondaryAudio(windowRef), false);
});

test('웹 오디오 세션은 ambient로 설정해 다른 오디오를 중단하지 않는다', () => {
  const audioSession = { type: 'auto' };
  assert.equal(
    configureSecondaryAudioSession({ navigator: { audioSession } }),
    true,
  );
  assert.equal(audioSession.type, 'ambient');
  assert.equal(configureSecondaryAudioSession({}), false);
});

test('외부 오디오가 재생 중이면 대표 BGM을 시작하지 않는다', async () => {
  const profile = createProfilePlayer();
  const ready = profile.init();
  profile.resolveExternalAudioCheck(false);
  await ready;
  assert.deepEqual(profile.calls, []);
});

test('내 BGM 재생이나 이어재생이 진행 중이면 대표 BGM이 개입하지 않는다', async () => {
  for (const playback of [{ isPlaying: true }, { isStarting: true }]) {
    const profile = createProfilePlayer(playback);
    const ready = profile.init();
    profile.resolveExternalAudioCheck(true);
    await ready;
    assert.deepEqual(profile.calls, []);
  }
});

test('자동재생 판단 중에 시작된 내 BGM을 유지한다', async () => {
  const profile = createProfilePlayer();
  const ready = profile.init();
  await Promise.resolve();
  assert.deepEqual(profile.calls, []);
  profile.personalPlayback.isPlaying = true;
  profile.resolveExternalAudioCheck(true);
  await ready;
  assert.deepEqual(profile.calls, []);
});

test('내 BGM이 멈춰 있고 외부 오디오도 없으면 대표 BGM을 재생한다', async () => {
  const profile = createProfilePlayer();
  const ready = profile.init();
  profile.resolveExternalAudioCheck(true);
  await ready;
  assert.deepEqual(profile.calls, [
    'configure audio session',
    'pause personal BGM',
    'play featured BGM',
  ]);
});

test('내 BGM을 이어재생할 수 없다고 확인되면 대표 BGM을 시작한다', async () => {
  let finishResumeCheck;
  const resumeCheck = new Promise((resolve) => {
    finishResumeCheck = resolve;
  });
  const profile = createProfilePlayer({ isStarting: true, resumeCheck });
  const ready = profile.init();
  profile.resolveExternalAudioCheck(true);
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(profile.calls, []);
  profile.personalPlayback.isStarting = false;
  finishResumeCheck();
  await ready;
  assert.deepEqual(profile.calls, [
    'configure audio session',
    'pause personal BGM',
    'play featured BGM',
  ]);
});

test('루트와 www의 프로필 오디오 모듈이 일치한다', () => {
  for (const relativePath of [
    'assets/js/modules/completion-audio-session.js',
    'assets/js/modules/profile.js',
  ]) {
    assert.deepEqual(
      fs.readFileSync(path.join(rootDir, relativePath)),
      fs.readFileSync(path.join(rootDir, 'www', relativePath)),
    );
  }
});

test('iOS와 Android 네이티브 브리지가 외부 오디오를 감지한다', () => {
  const iosPlugin = fs.readFileSync(
    path.join(rootDir, 'ios/App/App/CompletionAudioSessionPlugin.swift'),
    'utf8',
  );
  const androidPlugin = fs.readFileSync(
    path.join(
      rootDir,
      'android/app/src/main/java/com/mallinoi/calendar/CompletionAudioSessionPlugin.java',
    ),
    'utf8',
  );

  assert.match(iosPlugin, /session\.isOtherAudioPlaying/);
  assert.match(androidPlugin, /getAudioManager\(\)\.isMusicActive\(\)/);
});
