import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { inflateSync } from 'node:zlib';

import {
  CALENDAR_LOADING_SPRITE,
  createCalendarLoadingController,
} from '../assets/js/modules/calendar-loading.js';

const ROOT_FILES = [
  'calendar-study.html',
  'calendar-work.html',
  'calendar-event.html',
  'assets/css/components/calendar-loading.css',
  'assets/js/modules/calendar-loading.js',
  'assets/js/modules/calendar-groups.js',
  'assets/js/modules/study-calendar.js',
  'assets/js/modules/work-calendar.js',
  'assets/js/modules/event-calendar.js',
];

function decodeRgbaPng(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const bitDepth = buffer[24];
  const colorType = buffer[25];
  const idat = [];
  let offset = 8;

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'IDAT') idat.push(buffer.subarray(offset + 8, offset + 8 + length));
    offset += 12 + length;
    if (type === 'IEND') break;
  }

  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const encoded = inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(width * height * bytesPerPixel);

  for (let y = 0; y < height; y += 1) {
    const filter = encoded[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    const pixelStart = y * stride;
    assert.ok(filter >= 0 && filter <= 4, `unsupported PNG filter ${filter}`);
    for (let x = 0; x < stride; x += 1) {
      const raw = encoded[rowStart + x];
      const left = x >= bytesPerPixel ? pixels[pixelStart + x - bytesPerPixel] : 0;
      const up = y > 0 ? pixels[pixelStart + x - stride] : 0;
      const upLeft =
        y > 0 && x >= bytesPerPixel
          ? pixels[pixelStart + x - stride - bytesPerPixel]
          : 0;
      let value = raw;

      if (filter === 1) value += left;
      if (filter === 2) value += up;
      if (filter === 3) value += Math.floor((left + up) / 2);
      if (filter === 4) {
        const prediction = left + up - upLeft;
        const leftDistance = Math.abs(prediction - left);
        const upDistance = Math.abs(prediction - up);
        const diagonalDistance = Math.abs(prediction - upLeft);
        value +=
          leftDistance <= upDistance && leftDistance <= diagonalDistance
            ? left
            : upDistance <= diagonalDistance
              ? up
              : upLeft;
      }
      pixels[pixelStart + x] = value & 0xff;
    }
  }

  return { width, height, bitDepth, colorType, pixels };
}

function getFrameBytes(image, frameIndex) {
  const { columns, frameWidth, frameHeight } = CALENDAR_LOADING_SPRITE;
  const frameX = (frameIndex % columns) * frameWidth;
  const frameY = Math.floor(frameIndex / columns) * frameHeight;
  const frame = Buffer.alloc(frameWidth * frameHeight * 4);

  for (let y = 0; y < frameHeight; y += 1) {
    const sourceStart = ((frameY + y) * image.width + frameX) * 4;
    const targetStart = y * frameWidth * 4;
    image.pixels.copy(
      frame,
      targetStart,
      sourceStart,
      sourceStart + frameWidth * 4,
    );
  }

  return frame;
}

class FakeClassList {
  constructor(owner) {
    this.owner = owner;
    this.values = new Set();
  }

  add(...values) {
    values.forEach((value) => this.values.add(value));
    this.owner._className = [...this.values].join(' ');
  }

  remove(...values) {
    values.forEach((value) => this.values.delete(value));
    this.owner._className = [...this.values].join(' ');
  }

  contains(value) {
    return this.values.has(value);
  }

  replaceFromString(value) {
    this.values = new Set(String(value || '').split(/\s+/).filter(Boolean));
    this.owner._className = [...this.values].join(' ');
  }
}

class FakeElement {
  constructor(ownerDocument) {
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.hidden = false;
    this.textContent = '';
    this._className = '';
    this.classList = new FakeClassList(this);
  }

  set className(value) {
    this.classList.replaceFromString(value);
  }

  get className() {
    return this._className;
  }

  append(...children) {
    children.forEach((child) => {
      child.parentNode = this;
      this.children.push(child);
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

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  querySelector(selector) {
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    for (const child of this.children) {
      if (className && child.classList.contains(className)) return child;
      const nested = child.querySelector(selector);
      if (nested) return nested;
    }
    return null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const className = selector.startsWith('.') ? selector.slice(1) : '';
    for (const child of this.children) {
      if (className && child.classList.contains(className)) matches.push(child);
      matches.push(...child.querySelectorAll(selector));
    }
    return matches;
  }
}

class FakeWindow {
  constructor() {
    this.listeners = new Map();
    this.animationFrameCount = 0;
  }

  requestAnimationFrame(callback) {
    this.animationFrameCount += 1;
    queueMicrotask(() => callback(this.animationFrameCount * 16));
    return this.animationFrameCount;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }
}

function createFakeCalendarRoot() {
  const windowRef = new FakeWindow();
  const documentRef = {
    defaultView: windowRef,
    activeElement: null,
    createElement: () => new FakeElement(documentRef),
  };
  const root = new FakeElement(documentRef);
  documentRef.activeElement = root;
  return { root, documentRef, windowRef };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test('저장소 PNG는 1280×1280 RGBA의 4×4, 16개 비중복 프레임이다', async () => {
  const buffer = await readFile(
    'images/calendar/dancing-cucumber-sprite-sheet.png',
  );
  const image = decodeRgbaPng(buffer);
  assert.equal(
    createHash('sha256').update(buffer).digest('hex'),
    '2db6c66dc02cfb9d86f69d5315c3745f2846cc0eaa261556a73c1044d94dba7b',
    '스프라이트 원본 해시가 유지되어야 한다',
  );

  assert.deepEqual(
    {
      width: image.width,
      height: image.height,
      bitDepth: image.bitDepth,
      colorType: image.colorType,
    },
    { width: 1280, height: 1280, bitDepth: 8, colorType: 6 },
  );
  assert.deepEqual(CALENDAR_LOADING_SPRITE, {
    path: './images/calendar/dancing-cucumber-sprite-sheet.png',
    sheetWidth: 1280,
    sheetHeight: 1280,
    columns: 4,
    rows: 4,
    frameCount: 16,
    frameWidth: 320,
    frameHeight: 320,
    cycleDurationMs: 5000,
    frameOrder: 'row-major',
  });

  const frames = Array.from({ length: 16 }, (_, index) =>
    getFrameBytes(image, index),
  );
  const signatures = frames.map((frame) => frame.toString('base64'));
  assert.equal(new Set(signatures).size, 16, '빈 프레임이나 완전 중복이 없어야 한다');
  frames.forEach((frame, index) => {
    let visiblePixelCount = 0;
    for (let offset = 3; offset < frame.length; offset += 4) {
      if (frame[offset] > 0) visiblePixelCount += 1;
    }
    assert.ok(visiblePixelCount > 30_000, `${index}번 프레임에 캐릭터가 있어야 한다`);
  });
});

test('스프라이트는 행 우선 16프레임을 단계형으로 정확히 5초 순환한다', async () => {
  const css = await readFile(
    'assets/css/components/calendar-loading.css',
    'utf8',
  );
  const positions = [
    '0% 0%',
    '33.333333% 0%',
    '66.666667% 0%',
    '100% 0%',
    '0% 33.333333%',
    '33.333333% 33.333333%',
    '66.666667% 33.333333%',
    '100% 33.333333%',
    '0% 66.666667%',
    '33.333333% 66.666667%',
    '66.666667% 66.666667%',
    '100% 66.666667%',
    '0% 100%',
    '33.333333% 100%',
    '66.666667% 100%',
    '100% 100%',
  ];

  let previousIndex = -1;
  positions.forEach((position) => {
    const index = css.indexOf(`background-position: ${position};`, previousIndex + 1);
    assert.ok(index > previousIndex, `${position} 프레임 순서가 필요하다`);
    previousIndex = index;
  });
  assert.match(css, /animation:\s*calendar-cucumber-dance 5s steps\(1, end\) infinite/);
  assert.match(css, /background-size:\s*400% 400%/);
  assert.match(css, /\.calendar-loading-overlay\[hidden\]\s*\{\s*display:\s*none;/s);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;[\s\S]*background-position:\s*0% 0%;/,
  );
  assert.doesNotMatch(
    css.slice(0, css.indexOf('.calendar-loading-overlay.is-active')),
    /animation:\s*calendar-cucumber-dance/,
  );
});

test('로딩 오버레이는 캘린더 본문만 불투명하게 덮고 세 점을 순차 표시한다', async () => {
  const css = await readFile(
    'assets/css/components/calendar-loading.css',
    'utf8',
  );

  const regionRule = css.match(/\.calendar-loading-region\s*\{[^}]+\}/s)?.[0] || '';
  const overlayRule = css.match(/\.calendar-loading-overlay\s*\{[^}]+\}/s)?.[0] || '';
  assert.match(regionRule, /position:\s*relative/);
  assert.match(regionRule, /isolation:\s*isolate/);
  assert.match(regionRule, /min-height:\s*730px/);
  assert.match(regionRule, /background:\s*var\(--color-surface\)/);
  assert.match(overlayRule, /position:\s*absolute/);
  assert.doesNotMatch(overlayRule, /position:\s*fixed/);
  assert.match(overlayRule, /inset:\s*0/);
  assert.match(overlayRule, /background:\s*var\(--color-surface\)/);
  assert.match(overlayRule, /pointer-events:\s*auto/);
  assert.doesNotMatch(overlayRule, /opacity|color-mix|transparent/);

  assert.match(css, /width:\s*clamp\(176px, 52%, 184px\)/);
  assert.match(css, /animation:\s*calendar-loading-dot-bounce 1\.2s ease-in-out infinite/);
  assert.match(css, /animation-delay:\s*0s/);
  assert.match(css, /animation-delay:\s*0\.16s/);
  assert.match(css, /animation-delay:\s*0\.32s/);
  assert.match(css, /transform:\s*translateY\(-0\.18em\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*calendar-loading-overlay__sprite[\s\S]*animation:\s*none[\s\S]*calendar-loading-overlay__dot[\s\S]*animation:\s*none/,
  );
});

test('최초·빈 결과·오류 경로는 aria-busy와 단일 오버레이를 정상 복구한다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({
    root,
    documentRef,
    windowRef,
  });
  const sameController = createCalendarLoadingController({
    root,
    documentRef,
    windowRef,
  });
  assert.equal(sameController, controller);
  assert.equal(root.querySelectorAll('.calendar-loading-overlay').length, 1);
  assert.equal(windowRef.listeners.get('mallin:before-pjax-swap')?.size, 1);
  const overlay = root.querySelector('.calendar-loading-overlay');
  const content = overlay.querySelector('.calendar-loading-overlay__content');
  const label = overlay.querySelector('.calendar-loading-overlay__label');
  const status = overlay.querySelector('.calendar-loading-overlay__status');
  assert.equal(content.getAttribute('aria-hidden'), 'true');
  assert.equal(label.querySelector('.calendar-loading-overlay__label-text').textContent, '로딩중');
  assert.equal(label.querySelectorAll('.calendar-loading-overlay__dot').length, 3);
  assert.equal(status.textContent, '캘린더를 불러오는 중입니다');

  const focusBefore = documentRef.activeElement;
  const firstLoad = deferred();
  const firstPromise = controller.runLatest(() => firstLoad.promise, {
    key: 'initial',
  });
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, false);
  assert.equal(documentRef.activeElement, focusBefore, '포커스를 빼앗지 않아야 한다');

  firstLoad.resolve([]);
  assert.deepEqual(await firstPromise, []);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
  assert.equal(windowRef.animationFrameCount, 2, '렌더 후 다음 페인트까지 기다린다');

  await assert.rejects(
    controller.runLatest(async () => {
      throw new Error('network failed');
    }),
    /network failed/,
  );
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
});

test('빠른 연속 요청에서 이전 완료와 결과가 최신 로딩을 덮어쓰지 않는다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({
    root,
    documentRef,
    windowRef,
  });
  const older = deferred();
  const latest = deferred();
  let renderedMonth = '';

  const olderPromise = controller.runLatest(async ({ isCurrent }) => {
    await older.promise;
    if (isCurrent()) renderedMonth = '2026-08';
  }, { key: 'month:2026-08' });
  const latestPromise = controller.runLatest(async ({ isCurrent }) => {
    await latest.promise;
    if (isCurrent()) renderedMonth = '2026-09';
  }, { key: 'month:2026-09' });

  older.resolve();
  await olderPromise;
  assert.equal(renderedMonth, '');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, false);

  latest.resolve();
  await latestPromise;
  assert.equal(renderedMonth, '2026-09');
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
});

test('현재와 동일한 요청만 중복 실행하지 않고 재방문한 최신 대상은 다시 요청한다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({ root, documentRef, windowRef });
  const first = deferred();
  let callCount = 0;
  const task = async () => {
    callCount += 1;
    await first.promise;
  };
  const firstPromise = controller.runLatest(task, { key: 'same-month' });
  const duplicatePromise = controller.runLatest(task, { key: 'same-month' });
  assert.equal(duplicatePromise, firstPromise);
  assert.equal(callCount, 1);

  const other = controller.runLatest(async () => {}, { key: 'other-month' });
  await other;
  const revisited = controller.runLatest(async () => {
    callCount += 1;
  }, { key: 'same-month' });
  await revisited;
  assert.equal(callCount, 2);
  first.resolve();
  await firstPromise;
});

test('세 캘린더의 최초·이전·다음·그룹 적용 로딩 경로와 단순 설정 열기를 구분한다', async () => {
  const [study, work, event, groups] = await Promise.all([
    readFile('assets/js/modules/study-calendar.js', 'utf8'),
    readFile('assets/js/modules/work-calendar.js', 'utf8'),
    readFile('assets/js/modules/event-calendar.js', 'utf8'),
    readFile('assets/js/modules/calendar-groups.js', 'utf8'),
  ]);

  for (const [type, source] of Object.entries({ study, work, event })) {
    assert.match(
      source,
      new RegExp(`getElementById\\('${type}CalendarLoadingRegion'\\)`),
    );
    assert.match(source, /createCalendarLoadingController\(\{ root: loadingRegion \}\)/);
    assert.match(source, new RegExp(`key: '${type}:initial-load'`));
    assert.match(source, /void changeMonth\(-1\)/);
    assert.match(source, /void changeMonth\(1\)/);
    assert.match(source, /await state\.group\?\.refresh\?\.\(\{ reason: 'month-navigation' \}\)/);
    assert.match(source, /runCalendarLoad: loadingController\?\.runLatest/);
  }

  assert.match(groups, /refreshCalendar\(\{ reason: 'group-selection' \}\)/);
  assert.match(groups, /refreshCalendar\(\{ reason: 'group-backup' \}\)/);
  assert.match(groups, /loadId !== state\.groupLoadId/);
  assert.match(groups, /selectedGroup\.id !== state\.selectedGroup\?\.id/);
  const openHandler = groups.match(
    /toggleButton\?\.addEventListener\('click',[\s\S]*?\n\s*\}\);/,
  )?.[0];
  assert.ok(openHandler);
  assert.doesNotMatch(openHandler, /refreshCalendar|loadGroupEvents|runCalendarLoad/);
});

test('페이지 프리로드·서비스 워커 프리캐시·루트와 www 배포본이 일치한다', async () => {
  const [studyHtml, workHtml, eventHtml, serviceWorker, fileList] =
    await Promise.all([
      readFile('calendar-study.html', 'utf8'),
      readFile('calendar-work.html', 'utf8'),
      readFile('calendar-event.html', 'utf8'),
      readFile('sw.js', 'utf8'),
      readFile('file-list.txt', 'utf8'),
    ]);
  const spritePath = './images/calendar/dancing-cucumber-sprite-sheet.png';

  for (const [type, html] of Object.entries({
    study: studyHtml,
    work: workHtml,
    event: eventHtml,
  })) {
    assert.match(html, /rel="preload"\s+as="image"\s+href="\.\/images\/calendar\/dancing-cucumber-sprite-sheet\.png"/s);
    assert.match(html, /assets\/css\/components\/calendar-loading\.css/);
    const toolbarIndex = html.indexOf(`${type}-calendar-toolbar`);
    const regionIndex = html.indexOf(`id="${type}CalendarLoadingRegion"`);
    const gridIndex = html.indexOf(`id="${type}CalendarGrid"`);
    const selectedIndex = html.indexOf(`${type}-calendar-selected`);
    assert.ok(toolbarIndex < regionIndex, '월 이동 툴바는 로딩 영역 밖에 있어야 한다');
    assert.ok(regionIndex < gridIndex, '요일·날짜 그리드는 로딩 영역 안에 있어야 한다');
    assert.ok(gridIndex < selectedIndex, '선택 날짜 영역은 로딩 영역 밖에 있어야 한다');
    assert.match(
      html.slice(regionIndex, selectedIndex),
      /class="calendar-loading-region__grid[^"\n]*"/,
    );
  }
  assert.ok(serviceWorker.includes(`'${spritePath}'`));
  assert.equal(serviceWorker.match(/dancing-cucumber-sprite-sheet\.png/g)?.length, 1);

  const listedPaths = [
    './images/calendar/dancing-cucumber-sprite-sheet.png',
    './www/images/calendar/dancing-cucumber-sprite-sheet.png',
    './assets/css/components/calendar-loading.css',
    './www/assets/css/components/calendar-loading.css',
    './assets/js/modules/calendar-loading.js',
    './www/assets/js/modules/calendar-loading.js',
    './tests/calendar-loading.test.mjs',
  ];
  listedPaths.forEach((path) => {
    assert.equal(
      fileList.split('\n').filter((line) => line === path).length,
      1,
      `${path} must be listed exactly once`,
    );
  });

  for (const rootPath of ROOT_FILES) {
    const [rootFile, appFile] = await Promise.all([
      readFile(rootPath),
      readFile(`www/${rootPath}`),
    ]);
    assert.deepEqual(appFile, rootFile, `${rootPath} must stay mirrored`);
  }

  const [rootSprite, appSprite] = await Promise.all([
    readFile('images/calendar/dancing-cucumber-sprite-sheet.png'),
    readFile('www/images/calendar/dancing-cucumber-sprite-sheet.png'),
  ]);
  assert.deepEqual(appSprite, rootSprite);
});
