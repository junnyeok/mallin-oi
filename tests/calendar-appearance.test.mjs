import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../assets/js/calendar-appearance.js', import.meta.url), 'utf8');
function start({ native = false, url = 'https://mallin-oi.com/calendar-study.html', stored = null, plugin = {}, failStorage = false } = {}) {
  const values = new Map([['mallin:calendar-appearance', stored]]);
  const events = [];
  const document = { documentElement: { dataset: {} } };
  const window = { dispatchEvent: event => events.push(event.detail) };
  if (native) window.Capacitor = { isNativePlatform: () => true, registerPlugin: () => plugin };
  vm.runInNewContext(source, {
    window, document, location: new URL(url), URLSearchParams,
    CustomEvent: class { constructor(type, { detail }) { this.type = type; this.detail = detail; } },
    localStorage: {
      getItem: key => { if (failStorage) throw Error('disabled'); return values.get(key); },
      setItem: (key, value) => { if (failStorage) throw Error('disabled'); values.set(key, value); },
    },
  });
  return { api: window.CalendarAppearance, dataset: document.documentElement.dataset, values, events };
}

test('일반 사이트는 앱의 저장된 다크 설정과 app 쿼리에 영향받지 않는다', async () => {
  for (const url of ['https://mallin-oi.com/calendar-work.html?app=calendar', 'http://127.0.0.1:5500/calendar-work.html']) {
    const { api, dataset, values } = start({ url, stored: 'dark' });
    assert.equal(api.available, false);
    assert.equal(api.get(), 'light');
    assert.equal(dataset.calendarAppearance, undefined);
    await assert.rejects(api.set('dark'), /앱에서/);
    assert.equal(values.get('mallin:calendar-appearance'), 'dark');
  }
});

test('로컬 앱 미리보기는 첫 화면에 저장값을 적용하고 전환 후 재시작에도 유지한다', async () => {
  const url = 'http://127.0.0.1:5500/app-calendar-settings.html?app=calendar';
  const app = start({ url, stored: 'dark' });
  assert.equal(app.dataset.calendarAppearance, 'dark');
  await app.api.set('light');
  assert.equal(app.dataset.calendarAppearance, 'light');
  assert.equal(start({ url, stored: app.values.get('mallin:calendar-appearance') }).api.get(), 'light');
  await assert.rejects(app.api.set('invalid'), /화면 모드/);
  assert.equal(app.api.get(), 'light');
});

test('네이티브 공유 설정이 웹 캐시보다 우선하며 저장 성공 후에만 화면이 바뀐다', async () => {
  let saved = 'dark';
  let release;
  const app = start({ native: true, stored: 'light', plugin: {
    getAppearance: async () => ({ appearance: saved }),
    setAppearance: ({ appearance }) => new Promise(resolve => { release = () => { saved = appearance; resolve(); }; }),
  } });
  await app.api.ready;
  assert.equal(app.api.get(), 'dark');
  assert.equal(app.values.get('mallin:calendar-appearance'), 'dark');
  const pending = app.api.set('light');
  await Promise.resolve();
  assert.equal(app.api.get(), 'dark');
  release();
  await pending;
  assert.equal(saved, 'light');
  assert.equal(app.api.get(), 'light');
});

test('위젯 설정 저장 실패 시 기존 모드를 보존하고 실패를 알린다', async () => {
  const app = start({ native: true, stored: 'light', plugin: {
    getAppearance: async () => ({ appearance: 'light' }),
    setAppearance: async () => { throw Error('native write failed'); },
  } });
  await assert.rejects(app.api.set('dark'), /저장하지 못했어요/);
  assert.equal(app.api.get(), 'light');
  assert.equal(app.values.get('mallin:calendar-appearance'), 'light');
});

test('웹 저장소가 막혀도 네이티브 설정으로 변경 및 재시작 복구가 가능하다', async () => {
  let saved = 'light';
  const plugin = {
    getAppearance: async () => ({ appearance: saved }),
    setAppearance: async ({ appearance }) => { saved = appearance; },
  };
  const app = start({ native: true, plugin, failStorage: true });
  await app.api.set('dark');
  assert.equal(app.api.get(), 'dark');
  const reopened = start({ native: true, plugin, failStorage: true });
  await reopened.api.ready;
  assert.equal(reopened.api.get(), 'dark');
});

test('구버전 플러그인과 잘못된 저장값은 화면을 중단시키지 않는다', async () => {
  const app = start({ native: true, stored: 'broken' });
  await app.api.ready;
  assert.equal(app.api.get(), 'light');
  await assert.rejects(app.api.set('dark'), /저장하지 못했어요/);
  assert.equal(app.api.get(), 'light');
});

test('로컬 미리보기 저장 실패는 성공처럼 표시하지 않는다', async () => {
  const app = start({ url: 'http://localhost/app-calendar.html', failStorage: true });
  await assert.rejects(app.api.set('dark'), /저장할 수 없어요/);
  assert.equal(app.api.get(), 'light');
});
