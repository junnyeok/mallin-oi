import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import {
  STUDY_COMPLETION_PARTICLE_LIMIT,
  createStudyCompletionCelebration,
} from '../assets/js/modules/study-completion-celebration.js';

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

function createHarness({ reducedMotion = false, playRejects = false } = {}) {
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
  const bgm = { pauseCalls: 0, restoreCalls: 0 };
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
  assert.equal(harness.bgm.pauseCalls, 1);
  assert.deepEqual(harness.getTimerDelays(), [10000]);
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
  assert.deepEqual(harness.getTimerDelays(), []);
});

test('빠른 연속 완료도 오버레이와 음원을 중첩하지 않고 현재 음원 종료 후 정리한다', async () => {
  const harness = createHarness();
  harness.controller.celebrate();
  harness.controller.celebrate();
  harness.controller.celebrate();
  await flushPromises();

  assert.equal(harness.body.children.length, 1);
  assert.ok(harness.sound.pauseCalls >= 3);
  harness.sound.emit('ended');
  await flushPromises();
  assert.equal(harness.body.children.length, 0);
  assert.equal(harness.controller.getState().active, false);
  assert.ok(harness.bgm.restoreCalls >= 1);
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
  assert.deepEqual(harness.getTimerDelays(), [3000]);
  harness.runTimers({ maxDelay: 3000 });
  assert.equal(harness.body.children.length, 0);
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
    'assets/js/modules/study-completion-celebration.js',
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
