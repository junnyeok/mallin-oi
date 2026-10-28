import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../assets/js/modules/calendar-native-widgets.js', import.meta.url), 'utf8');
function start(pending) {
  const destinations = [];
  let reads = 0;
  const context = vm.createContext({
    console,
    window: {
      Capacitor: { isNativePlatform: () => true, registerPlugin: () => ({
        consumePendingRoute: async () => { reads++; const calendarType = pending; pending = ''; return { calendarType }; },
      }) },
      location: { replace: href => destinations.push(href) },
    },
  });
  vm.runInContext(source.replaceAll('export ', '') + '\nglobalThis.consume = consumeCalendarWidgetRoute;', context);
  return { consume: context.consume, destinations, reads: () => reads };
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
    assert.equal(await app.consume(), true);
    assert.deepEqual(app.destinations, [`./calendar-${type}.html?app=calendar`]);
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

test('실제 홈 초기화는 명시적인 홈 이동을 우선하고 일반 위젯 실행은 유지한다', async () => {
  const launcher = readFileSync(new URL('../assets/js/modules/app-calendar.js', import.meta.url), 'utf8')
    .replace(/^import[\s\S]*?from ['"][^'"]+['"];\n/gm, '');
  for (const [search, expected] of [['?app=calendar&home=1', []], ['?app=calendar', ['./calendar-work.html?app=calendar']]]) {
    const destinations = [];
    let reads = 0;
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
          consumePendingRoute: async () => { reads++; return { calendarType: 'work' }; },
        }) },
        location: { search, replace: href => destinations.push(href) },
        clearTimeout() {}, setTimeout: () => 0,
      },
    });
    vm.runInContext(source.replaceAll('export ', '') + '\n' + launcher + '\nglobalThis.launch = initAppCalendarLauncher;', context);
    await context.launch();
    assert.equal(reads, 1);
    assert.deepEqual(destinations, expected);
  }
});
