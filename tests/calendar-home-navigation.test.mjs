import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../assets/js/modules/calendar-native-widgets.js', import.meta.url), 'utf8');
function start(pending, { pathname = '/index.html', native = true } = {}) {
  const destinations = [];
  let reads = 0;
  let onUrlOpen;
  const context = vm.createContext({
    console, URL,
    window: {
      Capacitor: { isNativePlatform: () => native, registerPlugin: () => ({
        consumePendingRoute: async () => { reads++; const calendarType = pending; pending = ''; return { calendarType }; },
      }), Plugins: { App: { addListener: async (name, callback) => {
        assert.equal(name, 'appUrlOpen');
        assert.equal(onUrlOpen, undefined);
        onUrlOpen = callback;
      } } } },
      location: { pathname, replace: href => destinations.push(href) },
    },
  });
  vm.runInContext(source.replaceAll('export ', '') + '\nglobalThis.consume = consumeCalendarWidgetRoute; globalThis.init = initCalendarWidgetNavigation;', context);
  return {
    consume: context.consume, init: context.init, destinations, reads: () => reads,
    async open(url, type = '') {
      pending = type;
      await onUrlOpen?.({ url });
    },
  };
}

test('홈을 누르면 남은 위젯 요청을 소비하고 같은 캘린더로 되돌아가지 않는다', async () => {
  for (const type of ['study', 'work', 'event']) {
    const app = start(type);
    assert.equal(await app.consume({ navigate: false }), false);
    assert.equal(app.reads(), 1);
    assert.deepEqual(app.destinations, []);
    assert.equal(await app.consume(), false);
    assert.deepEqual(app.destinations, []);
  }
});

test('위젯으로 새로 시작한 경우에만 지정 캘린더로 한 번 이동한다', async () => {
  for (const type of ['study', 'work', 'event']) {
    const app = start(type);
    assert.equal(await app.init(), true);
    assert.deepEqual(app.destinations, [`/calendar-${type}.html?app=calendar`]);
    assert.equal(await app.consume(), false);
    assert.equal(app.destinations.length, 1);
  }
});

test('알 수 없거나 비어 있는 위젯 요청은 홈을 벗어나지 않는다', async () => {
  for (const type of ['', 'unknown', '../login.html']) {
    const app = start(type);
    assert.equal(await app.consume(), false);
    assert.deepEqual(app.destinations, []);
  }
});

test('실행 중인 앱은 위젯에서 지정한 세 캘린더로 각각 이동한다', async () => {
  for (const [current, tapped] of [['study', 'event'], ['event', 'work'], ['work', 'study']]) {
    const app = start('', { pathname: `/calendar-${current}.html` });
    await Promise.all([app.init(), app.init()]);
    await app.open(`mallinoi://calendar?type=${tapped}`, tapped);
    await app.open(`mallinoi://calendar?type=${tapped}`);
    assert.deepEqual(app.destinations, [`/calendar-${tapped}.html?app=calendar`]);
  }
});

test('명시적 홈 진입에서 이전 요청은 버리되 이후 위젯 탭은 처리한다', async () => {
  const app = start('work', { pathname: '/app-calendar.html' });
  assert.equal(await app.init({ discardPending: true }), false);
  assert.deepEqual(app.destinations, []);
  await app.open('mallinoi://calendar?type=event', 'event');
  assert.deepEqual(app.destinations, ['/calendar-event.html?app=calendar']);
});

test('현재 캘린더 탭은 다시 로드하지 않고 소셜 인증 주소는 무시한다', async () => {
  const app = start('', { pathname: '/calendar-study.html' });
  await app.init();
  const initialReads = app.reads();
  await app.open('mallinoi://auth/callback#request=example');
  await app.open('https://calendar/?type=study');
  await app.open('mallinoi://calendar?type=invalid');
  assert.equal(app.reads(), initialReads);
  await app.open('mallinoi://calendar?type=study', 'study');
  assert.equal(app.reads(), initialReads + 1);
  assert.deepEqual(app.destinations, []);
});

test('위젯에서 계정 페이지를 벗어날 때 앱 루트의 캘린더를 연다', async () => {
  const app = start('', { pathname: '/account/verify.html' });
  await app.init();
  await app.open('mallinoi://calendar?type=work', 'work');
  assert.deepEqual(app.destinations, ['/calendar-work.html?app=calendar']);
});

test('일반 웹에서는 네이티브 요청을 소비하거나 화면을 바꾸지 않는다', async () => {
  const app = start('study', { native: false });
  assert.equal(await app.init(), false);
  assert.equal(app.reads(), 0);
  assert.deepEqual(app.destinations, []);
});

test('실제 홈 초기화는 명시적인 홈 이동을 우선하고 일반 위젯 실행은 유지한다', async () => {
  const launcher = readFileSync(new URL('../assets/js/modules/app-calendar.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '');
  for (const [search, expected, expectedReads] of [
    ['?app=calendar&home=1', [], 2],
    ['?app=calendar', ['/calendar-work.html?app=calendar'], 1],
  ]) {
    const destinations = [];
    let reads = 0;
    let pending = 'work';
    const context = vm.createContext({
      console, URLSearchParams,
      sessionStorage: { setItem() {} },
      initSocialAuthNative: async () => false,
      initRefreshControls() {},
      document: {
        readyState: 'loading', addEventListener() {},
        documentElement: { classList: { add() {} } }, body: { dataset: {} },
        querySelectorAll: () => [], getElementById: () => null,
      },
      window: {
        Capacitor: { isNativePlatform: () => true, registerPlugin: () => ({
          consumePendingRoute: async () => { reads++; const calendarType = pending; pending = ''; return { calendarType }; },
        }) },
        location: { search, replace: href => destinations.push(href) },
        clearTimeout() {}, setTimeout: () => 0,
      },
    });
    vm.runInContext(source.replaceAll('export ', '') + '\n' + launcher + '\nglobalThis.launch = initAppCalendarLauncher;', context);
    await context.launch();
    assert.equal(reads, expectedReads);
    assert.deepEqual(destinations, expected);
  }
});
