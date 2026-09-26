import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  STUDY_COMPLETION_AUDIO_GAIN,
  STUDY_COMPLETION_PARTICLE_LIMIT,
  createStudyCompletionAudioOutput,
  createStudyCompletionCelebration,
} from '../assets/js/modules/study-completion-celebration.js';
import {
  beginCompletionAudioSession,
  endCompletionAudioSession,
  shouldPlayCompletionSound,
} from '../assets/js/modules/completion-audio-session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.className = '';
    this.dataset = {};
    this.attributes = new Map();
    this.style = {
      values: new Map(),
      setProperty: (name, value) => this.style.values.set(name, value),
    };
    this.textContent = '';
  }

  get isConnected() {
    return Boolean(this.parentNode) || this.tagName === 'BODY';
  }

  append(...elements) {
    elements.forEach((element) => {
      element.parentNode = this;
      this.children.push(element);
    });
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(
      (child) => child !== this,
    );
    this.parentNode = null;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  querySelectorAll(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    const matches = [];
    const visit = (element) => {
      if (className && element.className.split(/\s+/).includes(className)) {
        matches.push(element);
      }
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches;
  }
}

function createHarness({
  reducedMotion = false,
  playRejects = false,
  externalAudioPlaying = false,
  audioContextClass = null,
} = {}) {
  const body = new FakeElement('body');
  const documentRef = {
    baseURI: 'http://127.0.0.1:4173/',
    body,
    createElement: (tagName) => new FakeElement(tagName),
  };
  let timerId = 0;
  const timers = new Map();
  const windowRef = {
    matchMedia: () => ({ matches: reducedMotion }),
    setTimeout(callback, delay) {
      timerId += 1;
      timers.set(timerId, { callback, delay });
      return timerId;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  if (audioContextClass) windowRef.AudioContext = audioContextClass;
  const sound = {
    currentTime: 0,
    loadCalls: 0,
    pauseCalls: 0,
    playCalls: 0,
    listeners: new Map(),
    addEventListener(name, listener) {
      this.listeners.set(name, listener);
    },
    emit(name) {
      this.listeners.get(name)?.();
    },
    load() {
      this.loadCalls += 1;
    },
    pause() {
      this.pauseCalls += 1;
    },
    play() {
      this.playCalls += 1;
      return playRejects
        ? Promise.reject(new Error('autoplay blocked'))
        : Promise.resolve();
    },
  };
  const releaseOrder = [];
  const bgm = { pauseCalls: 0, restoreCalls: 0 };
  const nativeAudioSession = { beginCalls: 0, endCalls: 0 };
  const soundPermission = { checkCalls: 0 };
  const controller = createStudyCompletionCelebration({
    documentRef,
    windowRef,
    soundFactory: () => sound,
    pathResolver: (value) => value,
    pauseBgm: () => {
      bgm.pauseCalls += 1;
      return { id: bgm.pauseCalls };
    },
    restoreBgm: async () => {
      bgm.restoreCalls += 1;
      releaseOrder.push('restore-bgm');
      return true;
    },
    shouldPlaySound: async () => {
      soundPermission.checkCalls += 1;
      return !externalAudioPlaying;
    },
    beginAudioSession: async () => {
      nativeAudioSession.beginCalls += 1;
      return true;
    },
    endAudioSession: async () => {
      nativeAudioSession.endCalls += 1;
      releaseOrder.push('end-native-session');
      return true;
    },
    durationMs: 3000,
    audioEndFallbackMs: 10000,
  });

  return {
    body,
    controller,
    sound,
    bgm,
    nativeAudioSession,
    soundPermission,
    releaseOrder,
    getTimerDelays() {
      return [...timers.values()].map(({ delay }) => delay);
    },
    runTimers({ maxDelay = Infinity } = {}) {
      const ready = [...timers.entries()].filter(
        ([, { delay }]) => delay <= maxDelay,
      );
      ready.forEach(([id]) => timers.delete(id));
      ready.forEach(([, { callback }]) => callback());
    },
  };
}

async function flushPromises() {
  await new Promise((resolve) => setImmediate(resolve));
}

function createAudioOutputHarness() {
  const source = {
    connections: [],
    disconnectCalls: 0,
    connect(node) { this.connections.push(node); },
    disconnect() { this.disconnectCalls += 1; },
  };
  const compressor = {
    threshold: { value: 0 },
    knee: { value: 0 },
    ratio: { value: 0 },
    attack: { value: 0 },
    release: { value: 0 },
    connections: [],
    disconnectCalls: 0,
    connect(node) { this.connections.push(node); },
    disconnect() { this.disconnectCalls += 1; },
  };
  const output = {
    gain: { value: 0 },
    connections: [],
    disconnectCalls: 0,
    connect(node) { this.connections.push(node); },
    disconnect() { this.disconnectCalls += 1; },
  };
  const destination = {};
  const contextState = { resumeCalls: 0, closeCalls: 0, player: null };

  class FakeAudioContext {
    constructor() {
      this.state = 'suspended';
      this.destination = destination;
    }

    createMediaElementSource(player) {
      contextState.player = player;
      return source;
    }

    createDynamicsCompressor() { return compressor; }
    createGain() { return output; }

    async resume() {
      contextState.resumeCalls += 1;
      this.state = 'running';
    }

    async close() {
      contextState.closeCalls += 1;
      this.state = 'closed';
    }
  }

  return {
    FakeAudioContext,
    compressor,
    contextState,
    destination,
    output,
    source,
  };
}

function decodePngAlpha(filePath) {
  const png = fs.readFileSync(filePath);
  assert.deepEqual(
    [...png.subarray(0, 8)],
    [137, 80, 78, 71, 13, 10, 26, 10],
  );
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];

  while (offset < png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const decoded = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };

  let inputOffset = 0;
  for (let row = 0; row < height; row += 1) {
    const filter = raw[inputOffset];
    inputOffset += 1;
    const rowOffset = row * stride;
    for (let column = 0; column < stride; column += 1) {
      const source = raw[inputOffset + column];
      const left = column >= bytesPerPixel
        ? decoded[rowOffset + column - bytesPerPixel]
        : 0;
      const up = row > 0 ? decoded[rowOffset - stride + column] : 0;
      const upLeft = row > 0 && column >= bytesPerPixel
        ? decoded[rowOffset - stride + column - bytesPerPixel]
        : 0;
      let value = source;
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += Math.floor((left + up) / 2);
      else if (filter === 4) value += paeth(left, up, upLeft);
      decoded[rowOffset + column] = value & 0xff;
    }
    inputOffset += stride;
  }

  let transparentPixels = 0;
  let visiblePixels = 0;
  for (let index = 3; index < decoded.length; index += 4) {
    if (decoded[index] === 0) transparentPixels += 1;
    if (decoded[index] > 0) visiblePixels += 1;
  }
  return { width, height, transparentPixels, visiblePixels, size: png.length };
}

test('효과음 출력은 원본 파일을 바꾸지 않고 압축·메이크업 게인으로 체감 음량을 높인다', async () => {
  const harness = createAudioOutputHarness();
  const player = { volume: 0.4 };
  const audioOutput = createStudyCompletionAudioOutput({
    windowRef: { AudioContext: harness.FakeAudioContext },
    player,
  });

  assert.ok(audioOutput);
  assert.equal(player.volume, 1);
  assert.equal(harness.contextState.player, player);
  assert.equal(harness.compressor.threshold.value, -18);
  assert.equal(harness.compressor.knee.value, 6);
  assert.equal(harness.compressor.ratio.value, 4);
  assert.equal(harness.compressor.attack.value, 0.003);
  assert.equal(harness.compressor.release.value, 0.25);
  assert.equal(harness.output.gain.value, STUDY_COMPLETION_AUDIO_GAIN);
  assert.deepEqual(harness.source.connections, [harness.compressor]);
  assert.deepEqual(harness.compressor.connections, [harness.output]);
  assert.deepEqual(harness.output.connections, [harness.destination]);
  assert.equal(await audioOutput.resume(), true);
  assert.equal(harness.contextState.resumeCalls, 1);

  await audioOutput.close();
  assert.equal(harness.contextState.closeCalls, 1);
  assert.equal(harness.source.disconnectCalls, 1);
  assert.equal(harness.compressor.disconnectCalls, 1);
  assert.equal(harness.output.disconnectCalls, 1);
});

test('Web Audio를 지원하지 않아도 기본 최대 음량 재생을 유지한다', () => {
  const player = { volume: 0.2 };
  assert.equal(
    createStudyCompletionAudioOutput({ windowRef: {}, player }),
    null,
  );
  assert.equal(player.volume, 1);
});

test('완료 성공 효과는 이미지·상한 내 파티클·음원을 한 번 시작한다', async () => {
  const harness = createHarness();
  assert.equal(harness.controller.prepare(), true);
  assert.equal(harness.controller.celebrate(), true);
  await flushPromises();

  assert.equal(harness.body.children.length, 1);
  assert.equal(
    harness.controller.getState().particleCount,
    STUDY_COMPLETION_PARTICLE_LIMIT,
  );
  assert.equal(harness.sound.playCalls, 1);
  assert.equal(harness.soundPermission.checkCalls, 1);
  assert.equal(harness.bgm.pauseCalls, 1);
  assert.equal(harness.nativeAudioSession.beginCalls, 1);
  assert.equal(harness.nativeAudioSession.endCalls, 0);
  assert.deepEqual(harness.getTimerDelays(), [10000]);
});

test('외부 오디오 재생 중에는 효과음 없이 시각 축하만 표시한다', async () => {
  let audioContextCreations = 0;
  class UnexpectedAudioContext {
    constructor() { audioContextCreations += 1; }
  }
  const harness = createHarness({
    externalAudioPlaying: true,
    audioContextClass: UnexpectedAudioContext,
  });
  assert.equal(harness.controller.celebrate(), true);
  await flushPromises();

  assert.equal(harness.body.children.length, 1);
  assert.equal(harness.soundPermission.checkCalls, 1);
  assert.equal(harness.sound.playCalls, 0);
  assert.equal(harness.bgm.pauseCalls, 0);
  assert.equal(harness.nativeAudioSession.beginCalls, 0);
  assert.equal(audioContextCreations, 0);
  assert.deepEqual(harness.getTimerDelays(), [3000]);

  harness.runTimers({ maxDelay: 3000 });
  await flushPromises();
  assert.equal(harness.body.children.length, 0);
});

test('정상 재생은 3초에 종료하지 않고 실제 음원 ended에서 효과와 BGM을 정리한다', async () => {
  const harness = createHarness();
  harness.controller.celebrate();
  await flushPromises();

  harness.runTimers({ maxDelay: 3000 });
  assert.equal(harness.body.children.length, 1);
  assert.equal(harness.controller.getState().active, true);

  harness.sound.emit('ended');
  await flushPromises();
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.controller.getState().active, false);
  assert.equal(harness.bgm.restoreCalls, 1);
  assert.equal(harness.nativeAudioSession.endCalls, 1);
  assert.deepEqual(harness.releaseOrder, [
    'end-native-session',
    'restore-bgm',
  ]);
  assert.deepEqual(harness.getTimerDelays(), []);
});

test('빠른 연속 완료도 오버레이와 음원을 중첩하지 않고 현재 음원 종료 후 정리한다', async () => {
  const harness = createHarness();
  harness.controller.celebrate();
  harness.controller.celebrate();
  harness.controller.celebrate();
  await flushPromises();

  assert.equal(harness.body.children.length, 1);
  assert.equal(harness.soundPermission.checkCalls, 1);
  assert.equal(harness.sound.playCalls, 1);
  assert.ok(harness.sound.pauseCalls >= 1);
  harness.sound.emit('ended');
  await flushPromises();
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.controller.getState().active, false);
  assert.ok(harness.bgm.restoreCalls >= 1);
  assert.ok(harness.nativeAudioSession.endCalls >= 1);
});

test('ended 이벤트가 유실되면 안전 타이머가 남은 효과와 음원을 정리한다', async () => {
  const harness = createHarness();
  harness.controller.celebrate();
  await flushPromises();

  harness.runTimers({ maxDelay: 9999 });
  assert.equal(harness.body.children.length, 1);
  harness.runTimers({ maxDelay: 10000 });
  await flushPromises();
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.controller.getState().active, false);
});

test('reduced motion은 큰 이동 대신 파티클 수를 줄여 정적 축하를 유지한다', () => {
  const harness = createHarness({ reducedMotion: true });
  harness.controller.celebrate();
  assert.equal(harness.controller.getState().particleCount, 6);
  assert.equal(harness.body.children[0].dataset.reducedMotion, 'true');
});

test('음원 재생 실패는 축하 표시나 완료 흐름을 실패시키지 않는다', async () => {
  const harness = createHarness({ playRejects: true });
  assert.equal(harness.controller.celebrate(), true);
  await flushPromises();
  assert.equal(harness.body.children.length, 1);
  assert.equal(harness.sound.playCalls, 1);
  assert.equal(harness.nativeAudioSession.beginCalls, 1);
  assert.deepEqual(harness.getTimerDelays(), [3000]);
  harness.runTimers({ maxDelay: 3000 });
  await flushPromises();
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.nativeAudioSession.endCalls, 1);
});

test('네이티브 오디오 세션은 효과음이 끝난 뒤에만 반납한다', async () => {
  const harness = createHarness();
  harness.controller.celebrate();
  await flushPromises();

  assert.equal(harness.nativeAudioSession.beginCalls, 1);
  assert.equal(harness.nativeAudioSession.endCalls, 0);

  harness.sound.emit('ended');
  await flushPromises();
  assert.equal(harness.nativeAudioSession.endCalls, 1);
});

test('브라우저 fixture는 4.224초 음원 종료와 수동 ended 검증을 재현한다', () => {
  const fixture = fs.readFileSync(
    path.join(rootDir, 'tests/fixtures/study-completion-celebration-browser.html'),
    'utf8',
  );
  assert.match(fixture, /let autoEndMs = 4224/);
  assert.match(fixture, /listeners\.get\('ended'\)\?\.\(\)/);
  assert.match(fixture, /finishAudio:/);
  assert.match(fixture, /setAutoEndMs:/);
});

test('자기개발 완료 저장 성공의 미완료→완료 전환에서만 축하를 호출한다', () => {
  const study = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/study-calendar.js'),
    'utf8',
  );
  const event = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/event-calendar.js'),
    'utf8',
  );
  const work = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/work-calendar.js'),
    'utf8',
  );
  assert.match(study, /await updateTodoDone\([\s\S]*target\.done = nextDone[\s\S]*if \(nextDone\) completionCelebration\.celebrate\(\)/);
  assert.match(study, /isReadonlySharedPersonalDetail\(target, state\.userId\)/);
  assert.match(study, /pendingCompletionTodoIds\.has\(todoId\)/);
  assert.doesNotMatch(event, /study-completion-celebration/);
  assert.doesNotMatch(work, /study-completion-celebration/);
});

test('PJAX와 pagehide는 축하 DOM·타이머·음원을 정리한다', () => {
  const study = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/study-calendar.js'),
    'utf8',
  );
  assert.match(study, /mallin:before-pjax-swap/);
  assert.match(study, /pagehide/);
  assert.match(study, /completionCelebration\.destroy\(\)/);
});

test('자기개발 캘린더는 외부 오디오 판별과 네이티브 오디오 세션 브리지를 연결한다', () => {
  const study = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/study-calendar.js'),
    'utf8',
  );
  assert.match(study, /shouldPlaySound:\s*shouldPlayCompletionSound/);
  assert.match(study, /beginAudioSession:\s*beginCompletionAudioSession/);
  assert.match(study, /endAudioSession:\s*endCompletionAudioSession/);
});

test('Capacitor 네이티브 브리지는 오디오 세션 시작·반납 메서드를 호출한다', async () => {
  const calls = [];
  const plugin = {
    async isExternalAudioPlaying() {
      calls.push('check');
      return { playing: false };
    },
    async beginInterruption() {
      calls.push('begin');
      return { active: true };
    },
    async endInterruption() {
      calls.push('end');
    },
  };
  const windowRef = {
    Capacitor: {
      isNativePlatform: () => true,
      registerPlugin: (name) => {
        assert.equal(name, 'CompletionAudioSession');
        return plugin;
      },
    },
  };

  assert.equal(await shouldPlayCompletionSound(windowRef), true);
  assert.equal(await beginCompletionAudioSession(windowRef), true);
  assert.equal(await endCompletionAudioSession(windowRef), true);
  assert.deepEqual(calls, ['check', 'begin', 'end']);
});

test('Capacitor 외부 오디오 판별 실패 시에는 효과음을 안전하게 생략한다', async () => {
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

  assert.equal(await shouldPlayCompletionSound(windowRef), false);
  assert.equal(await shouldPlayCompletionSound({}), true);
});

test('iOS와 Android는 외부 오디오를 감지하고 없을 때만 기존 효과음 세션을 연다', () => {
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

  assert.match(iosPlugin, /isExternalAudioPlaying/);
  assert.match(iosPlugin, /session\.isOtherAudioPlaying/);
  assert.match(iosPlugin, /setCategory\([\s\S]*?\.playback/);
  assert.match(
    iosPlugin,
    /options:\s*\[\.mixWithOthers,\s*\.duckOthers\]/,
  );
  assert.match(iosPlugin, /notifyOthersOnDeactivation/);
  assert.match(androidPlugin, /isExternalAudioPlaying/);
  assert.match(androidPlugin, /getAudioManager\(\)\.isMusicActive\(\)/);
  assert.match(
    androidPlugin,
    /new AudioFocusRequest\.Builder\([\s\S]*?AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK[\s\S]*?\)/,
  );
  assert.match(
    androidPlugin,
    /AudioManager\.STREAM_MUSIC,\s*AudioManager\.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK/,
  );
  assert.match(androidPlugin, /abandonAudioFocusRequest|abandonAudioFocus/);
});

test('축하 CSS는 터치를 막지 않고 중앙·반응형·reduced motion을 지원한다', () => {
  const css = fs.readFileSync(
    path.join(rootDir, 'assets/css/components/study-completion-celebration.css'),
    'utf8',
  );
  assert.match(css, /position:\s*fixed/);
  assert.match(css, /place-items:\s*center/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /max-width:\s*100vw/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /study-completion-particle-twinkle/);
  assert.match(css, /transform[\s\S]*opacity/);
});

test('생성 축하 이미지는 1536×1024 RGBA PNG이며 투명·가시 픽셀이 모두 있다', () => {
  const image = decodePngAlpha(
    path.join(rootDir, 'images/calendar/study-completion-celebration.png'),
  );
  assert.deepEqual([image.width, image.height], [1536, 1024]);
  assert.ok(image.transparentPixels > 500_000);
  assert.ok(image.visiblePixels > 500_000);
  assert.ok(image.size > 100_000);
});

test('루트·www·Android·iOS 축하 코드·CSS·이미지가 바이트 단위로 같다', () => {
  const relativePaths = [
    'assets/js/modules/completion-audio-session.js',
    'assets/js/modules/study-completion-celebration.js',
    'assets/js/modules/study-calendar.js',
    'assets/css/components/study-completion-celebration.css',
    'images/calendar/study-completion-celebration.png',
  ];
  const targets = [
    'www',
    'android/app/src/main/assets/public',
    'ios/App/App/public',
  ];
  for (const relativePath of relativePaths) {
    const root = fs.readFileSync(path.join(rootDir, relativePath));
    for (const target of targets) {
      assert.deepEqual(
        fs.readFileSync(path.join(rootDir, target, relativePath)),
        root,
        `${target}/${relativePath} mismatch`,
      );
    }
  }
});
