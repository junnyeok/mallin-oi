import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  configureSecondaryAudioSession,
  shouldPlaySecondaryAudio,
} from '../assets/js/modules/completion-audio-session.js';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

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

test('프로필 자동재생은 외부 오디오 판별 뒤에만 실행한다', () => {
  const profile = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/profile.js'),
    'utf8',
  );

  assert.match(
    profile,
    /const shouldAutoPlay = await shouldPlaySecondaryAudio\(window\);[\s\S]*?if \(profileFeaturedBgmState !== state \|\| !shouldAutoPlay\) return;/,
  );
  assert.match(
    profile,
    /configureSecondaryAudioSession\(window\);[\s\S]*?await playProfileFeaturedBgm\(state\);/,
  );
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
