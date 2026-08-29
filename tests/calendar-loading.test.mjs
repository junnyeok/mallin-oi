import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  CALENDAR_LOADING_IMAGE_PATHS,
  CALENDAR_LOADING_TIMING,
  createCalendarLoadingController,
  getCalendarLoadingImageUrl,
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

function readPngMetadata(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.toString('ascii', 12, 16), 'IHDR');
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
    bitDepth: buffer[24],
    colorType: buffer[25],
  };
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
    this.currentTime = 0;
    this.nextTimerId = 1;
    this.timers = new Map();
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

  setTimeout(callback, delay = 0) {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, {
      callback,
      dueAt: this.currentTime + Math.max(0, Number(delay) || 0),
    });
    return id;
  }

  clearTimeout(id) {
    this.timers.delete(id);
  }

  advanceTime(milliseconds) {
    const targetTime = this.currentTime + milliseconds;

    while (true) {
      const nextTimer = [...this.timers.entries()]
        .filter(([, timer]) => timer.dueAt <= targetTime)
        .sort((left, right) => left[1].dueAt - right[1].dueAt)[0];
      if (!nextTimer) break;

      const [id, timer] = nextTimer;
      this.currentTime = timer.dueAt;
      this.timers.delete(id);
      timer.callback();
    }

    this.currentTime = targetTime;
  }
}

function createFakeCalendarRoot(calendarType = '') {
  const windowRef = new FakeWindow();
  const documentRef = {
    defaultView: windowRef,
    activeElement: null,
    createElement: () => new FakeElement(documentRef),
  };
  const root = new FakeElement(documentRef);
  if (calendarType) root.setAttribute('data-calendar-type', calendarType);
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

async function flushMicrotasks() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

test('세 캘린더는 손상되지 않은 투명 PNG와 정확히 매핑되고 알 수 없는 타입은 폴백 이미지를 쓰지 않는다', async () => {
  const expected = {
    study: {
      path: 'assets/images/calendar/logo-study.png',
      width: 1024,
      height: 1024,
    },
    work: {
      path: 'assets/images/calendar/logo-work.png',
      width: 568,
      height: 805,
    },
    event: {
      path: 'assets/images/calendar/logo-event.png',
      width: 992,
      height: 1035,
    },
  };

  assert.deepEqual(CALENDAR_LOADING_IMAGE_PATHS, {
    study: expected.study.path,
    work: expected.work.path,
    event: expected.event.path,
  });

  for (const [calendarType, image] of Object.entries(expected)) {
    const metadata = readPngMetadata(await readFile(image.path));
    assert.deepEqual(metadata, {
      width: image.width,
      height: image.height,
      bitDepth: 8,
      colorType: 6,
    });
    assert.ok(
      getCalendarLoadingImageUrl(calendarType).endsWith(`/${image.path}`),
    );
  }

  assert.equal(getCalendarLoadingImageUrl('unknown'), null);
  assert.equal(getCalendarLoadingImageUrl(''), null);
});

test('로딩 오버레이는 캘린더 본문을 반투명하게 덮고 세 점을 순차 표시한다', async () => {
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
  assert.match(overlayRule, /background:\s*rgba\(255, 255, 255, 0\.86\)/);
  assert.match(overlayRule, /backdrop-filter:\s*blur\(2px\)/);
  assert.match(overlayRule, /opacity:\s*0/);
  assert.match(overlayRule, /visibility:\s*hidden/);
  assert.match(overlayRule, /pointer-events:\s*none/);
  assert.match(overlayRule, /opacity 160ms ease/);
  assert.match(
    css,
    /\.calendar-loading-overlay\.is-active\s*\{[^}]*opacity:\s*1[^}]*visibility:\s*visible[^}]*pointer-events:\s*auto/s,
  );

  const contentRule =
    css.match(/\.calendar-loading-overlay__content\s*\{[^}]+\}/s)?.[0] || '';
  assert.doesNotMatch(contentRule, /opacity/);
  assert.match(contentRule, /gap:\s*var\(--space-12\)/);
  assert.match(contentRule, /transform:\s*translateY\(-8vh\)/);

  const imageRule =
    css.match(/\.calendar-loading-overlay__image\s*\{[^}]+\}/s)?.[0] || '';
  assert.match(imageRule, /aspect-ratio:\s*1/);
  assert.match(imageRule, /object-fit:\s*contain/);
  assert.match(imageRule, /object-position:\s*center/);
  assert.doesNotMatch(imageRule, /animation|transform/);
  assert.doesNotMatch(
    css,
    /calendar-cucumber-dance|dancing-cucumber|calendar-loading-overlay__sprite/,
  );
  assert.match(css, /width:\s*clamp\(108px, 18%, 132px\)/);
  assert.match(css, /width:\s*clamp\(96px, 30vw, 120px\)/);
  assert.match(
    css,
    /\.calendar-loading-overlay__label\s*\{[^}]*font-size:\s*var\(--text-h2\)/s,
  );
  assert.match(css, /animation:\s*calendar-loading-dot-bounce 1\.2s ease-in-out infinite/);
  assert.match(css, /animation-delay:\s*0s/);
  assert.match(css, /animation-delay:\s*0\.16s/);
  assert.match(css, /animation-delay:\s*0\.32s/);
  assert.match(css, /transform:\s*translateY\(-0\.18em\)/);
  assert.match(
    css,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*calendar-loading-overlay__dot[\s\S]*animation:\s*none/,
  );
});

test('최초·빈 결과·오류 경로는 aria-busy와 단일 오버레이를 정상 복구한다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot('study');
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
  const image = overlay.querySelector('.calendar-loading-overlay__image');
  const label = overlay.querySelector('.calendar-loading-overlay__label');
  const status = overlay.querySelector('.calendar-loading-overlay__status');
  assert.equal(content.getAttribute('aria-hidden'), 'true');
  assert.equal(image.getAttribute('alt'), '');
  assert.equal(image.getAttribute('decoding'), 'async');
  assert.equal(image.getAttribute('data-calendar-type'), 'study');
  assert.ok(
    image.getAttribute('src').endsWith('/assets/images/calendar/logo-study.png'),
  );
  assert.equal(image.hidden, true, '로드 전에는 깨진 이미지가 보여서는 안 된다');
  image.onload();
  assert.equal(image.hidden, false);
  assert.equal(label.querySelector('.calendar-loading-overlay__label-text').textContent, '로딩중');
  assert.equal(label.querySelectorAll('.calendar-loading-overlay__dot').length, 3);
  assert.equal(status.textContent, '캘린더를 불러오는 중입니다');

  const focusBefore = documentRef.activeElement;
  const firstLoad = deferred();
  const firstPromise = controller.runLatest(() => firstLoad.promise, {
    key: 'initial',
  });
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
  assert.equal(documentRef.activeElement, focusBefore, '포커스를 빼앗지 않아야 한다');

  firstLoad.resolve([]);
  assert.deepEqual(await firstPromise, []);
  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs * 2);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
  assert.equal(windowRef.animationFrameCount, 2, '렌더 후 다음 페인트까지 기다린다');

  const rejected = controller.runLatest(async () => {
    throw new Error('network failed');
  });
  await assert.rejects(rejected, /network failed/);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
});

test('캘린더 타입 변경 시 표시 전에 새 이미지를 적용하고 이전 이미지와 잘못된 폴백을 숨긴다', () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot('study');
  const controller = createCalendarLoadingController({
    root,
    documentRef,
    windowRef,
  });
  const image = root.querySelector('.calendar-loading-overlay__image');
  const staleStudyLoad = image.onload;
  staleStudyLoad();
  assert.equal(image.hidden, false);

  root.setAttribute('data-calendar-type', 'work');
  const workToken = controller.begin({ key: 'work' });
  assert.equal(image.hidden, true, '이전 테마 이미지는 즉시 숨겨야 한다');
  assert.equal(image.getAttribute('data-calendar-type'), 'work');
  assert.ok(
    image.getAttribute('src').endsWith('/assets/images/calendar/logo-work.png'),
  );
  staleStudyLoad();
  assert.equal(image.hidden, true, '이전 이미지의 지연 load 이벤트를 무시해야 한다');
  image.onload();
  assert.equal(image.hidden, false);
  controller.cancel(workToken);

  root.setAttribute('data-calendar-type', 'unknown');
  const unknownToken = controller.begin({ key: 'unknown' });
  assert.equal(image.hidden, true);
  assert.equal(image.getAttribute('src'), null);
  assert.equal(image.getAttribute('data-calendar-type'), null);
  controller.cancel(unknownToken);
});

test('긴 로딩만 지연 후 표시하고 완료 시 페이드아웃한 뒤 숨긴다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({
    root,
    documentRef,
    windowRef,
  });
  const loading = deferred();
  const operation = controller.runLatest(() => loading.promise, { key: 'long' });
  const overlay = root.querySelector('.calendar-loading-overlay');

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs - 1);
  assert.equal(overlay.hidden, true);
  assert.equal(overlay.classList.contains('is-active'), false);

  windowRef.advanceTime(1);
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.classList.contains('is-active'), true);
  assert.equal(controller.getState().visible, true);

  loading.resolve('loaded');
  await flushMicrotasks();
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.classList.contains('is-active'), false);
  assert.equal(controller.getState().active, true);

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.fadeDurationMs);
  assert.equal(await operation, 'loaded');
  assert.equal(overlay.hidden, true);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.deepEqual(controller.getState(), {
    active: false,
    visible: false,
    generation: 1,
    pendingKeys: [],
  });
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

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, false);

  older.resolve();
  await olderPromise;
  assert.equal(renderedMonth, '');
  assert.equal(root.getAttribute('aria-busy'), 'true');
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, false);

  latest.resolve();
  await flushMicrotasks();
  windowRef.advanceTime(CALENDAR_LOADING_TIMING.fadeDurationMs);
  await latestPromise;
  assert.equal(renderedMonth, '2026-09');
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(root.querySelector('.calendar-loading-overlay').hidden, true);
});

test('겹친 짧은 요청은 이전 표시 타이머를 정리해 나중에 다시 나타나지 않는다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({ root, documentRef, windowRef });
  const older = deferred();
  const latest = deferred();
  const olderPromise = controller.runLatest(() => older.promise, { key: 'older' });

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs - 20);
  const latestPromise = controller.runLatest(() => latest.promise, { key: 'latest' });
  older.resolve();
  latest.resolve();
  await Promise.all([olderPromise, latestPromise]);

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs * 2);
  const overlay = root.querySelector('.calendar-loading-overlay');
  assert.equal(overlay.hidden, true);
  assert.equal(overlay.classList.contains('is-active'), false);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(windowRef.timers.size, 0);
});

test('페이드아웃 중 새 요청은 이전 종료 타이머에 숨겨지지 않는다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({ root, documentRef, windowRef });
  const first = deferred();
  const second = deferred();
  const firstPromise = controller.runLatest(() => first.promise, { key: 'first' });
  const overlay = root.querySelector('.calendar-loading-overlay');

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs);
  first.resolve();
  await flushMicrotasks();
  assert.equal(overlay.classList.contains('is-active'), false);

  const secondPromise = controller.runLatest(() => second.promise, { key: 'second' });
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.classList.contains('is-active'), true);

  windowRef.advanceTime(CALENDAR_LOADING_TIMING.fadeDurationMs);
  assert.equal(overlay.hidden, false);
  assert.equal(overlay.classList.contains('is-active'), true);
  assert.equal(await firstPromise, undefined);

  second.resolve();
  await flushMicrotasks();
  windowRef.advanceTime(CALENDAR_LOADING_TIMING.fadeDurationMs);
  assert.equal(await secondPromise, undefined);
  assert.equal(overlay.hidden, true);
  assert.equal(windowRef.timers.size, 0);
});

test('컨트롤러 제거는 예약 타이머를 정리하고 이후 다시 활성화되지 않는다', async () => {
  const { root, documentRef, windowRef } = createFakeCalendarRoot();
  const controller = createCalendarLoadingController({ root, documentRef, windowRef });
  const loading = deferred();
  const operation = controller.runLatest(() => loading.promise, { key: 'destroy' });

  controller.destroy();
  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs * 2);
  assert.equal(root.querySelector('.calendar-loading-overlay'), null);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(windowRef.timers.size, 0);

  controller.begin({ key: 'after-destroy' });
  windowRef.advanceTime(CALENDAR_LOADING_TIMING.showDelayMs * 2);
  assert.equal(root.getAttribute('aria-busy'), null);
  assert.equal(windowRef.timers.size, 0);

  loading.resolve();
  assert.equal(await operation, undefined);
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
  const panelOpenHandler = groups.match(
    /function setGroupPanelOpen\(isOpen\) \{[\s\S]*?\n  \}\n\n  toggleButton/,
  )?.[0];
  assert.ok(panelOpenHandler);
  assert.match(
    panelOpenHandler,
    /window\.requestAnimationFrame\(\(\) => \{\s*dialog\.focus\(\{ preventScroll: true \}\)/,
  );
  assert.doesNotMatch(panelOpenHandler, /select\?\.focus/);
  const openHandler = groups.match(
    /toggleButton\?\.addEventListener\('click',[\s\S]*?\n\s*\}\);/,
  )?.[0];
  assert.ok(openHandler);
  assert.doesNotMatch(openHandler, /refreshCalendar|loadGroupEvents|runCalendarLoad/);
});

test('페이지별 테마 이미지를 프리로드하고 루트와 www 배포본이 일치한다', async () => {
  const [studyHtml, workHtml, eventHtml, fileList] = await Promise.all([
    readFile('calendar-study.html', 'utf8'),
    readFile('calendar-work.html', 'utf8'),
    readFile('calendar-event.html', 'utf8'),
    readFile('file-list.txt', 'utf8'),
  ]);

  for (const [type, html] of Object.entries({
    study: studyHtml,
    work: workHtml,
    event: eventHtml,
  })) {
    assert.match(
      html,
      new RegExp(
        `rel="preload"\\s+as="image"\\s+href="\\./assets/images/calendar/logo-${type}\\.png"`,
        's',
      ),
    );
    assert.doesNotMatch(html, /dancing-cucumber-sprite-sheet/);
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
    assert.match(
      html.slice(regionIndex, gridIndex),
      new RegExp(`data-calendar-type="${type}"`),
    );
  }

  const listedPaths = [
    './assets/images/calendar/logo-event.png',
    './assets/images/calendar/logo-study.png',
    './assets/images/calendar/logo-work.png',
    './images/calendar/logo-event.png',
    './images/calendar/logo-study.png',
    './images/calendar/logo-work.png',
    './www/assets/images/calendar/logo-event.png',
    './www/assets/images/calendar/logo-study.png',
    './www/assets/images/calendar/logo-work.png',
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

  for (const imagePath of Object.values(CALENDAR_LOADING_IMAGE_PATHS)) {
    const [rootImage, appImage] = await Promise.all([
      readFile(imagePath),
      readFile(`www/${imagePath}`),
    ]);
    assert.deepEqual(appImage, rootImage, `${imagePath} must stay mirrored`);
  }
});
