import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = (await readFile(new URL('../assets/js/modules/bgm-player.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/const \{ BGM_CATALOG \} = await import\([^;]+;/, 'const BGM_CATALOG = [];')
  .replace(/^export /gm, '');

function harness() {
  const stored = new Map();
  const storage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) };
  const handlers = {};
  const menu = { contains: () => false };
  const panel = { hidden: false };
  const button = { setAttribute() {} };
  const player = { currentTime: 37.5, paused: false, pause() { this.paused = true; }, async play() { this.paused = false; } };
  const context = { window: {__SITE_VERSION__: 'test'}, document: {getElementById: id => ({bgmMenu: menu, bgmPanel: panel, bgmBtn: button})[id], addEventListener: (type, fn) => { handlers[type] = fn; }}, localStorage: storage, sessionStorage: storage, console, player };
  const api = vm.runInNewContext(source + `
    audio = player;
    playlist = [{id: 'track-1', title: 'Track'}];
    currentIndex = 0;
    isPlaying = true;
    panelOpen = true;
    renderPlaylist = () => {};
    updatePanelDesc = () => {};
    notifyPersonalBgmPlay = () => {};
    setTrackSource = () => {};
    removeReloadResumeNotice = () => {};
    bindPanelGlobalEvents();
    ({pauseTrack, stopTrack, handleTrackAction});
  `, context);
  return {api, player, stored, handlers, menu, panel};
}

test('pause preserves time, same-track play resumes, stop resets and saves zero', async () => {
  const {api, player, stored} = harness();
  api.pauseTrack();
  assert.equal(player.currentTime, 37.5);
  assert.equal(player.paused, true);
  await api.handleTrackAction(0);
  assert.equal(player.paused, false);
  assert.equal(player.currentTime, 37.5);
  api.stopTrack();
  assert.equal(player.currentTime, 0);
  assert.equal(player.paused, true);
  const saved = JSON.parse(stored.get('mallin_bgm_play_state_v3'));
  assert.equal(saved.currentTime, 0);
  assert.equal(saved.wasPlaying, false);
  await api.handleTrackAction(0);
  assert.equal(player.currentTime, 0);
  assert.equal(player.paused, false);
});

test('rerendered controls remain inside the popup event path; outside clicks close it', () => {
  const {api, handlers, menu, panel} = harness();
  api.pauseTrack();
  handlers.click({target: {}, composedPath: () => [{}, menu]});
  assert.equal(panel.hidden, false);
  api.stopTrack();
  handlers.click({target: {}, composedPath: () => [{}, menu]});
  assert.equal(panel.hidden, false);
  handlers.click({target: {}, composedPath: () => [{}]});
  assert.equal(panel.hidden, true);
});

test('per-track stop resets the active track and leaves other tracks untouched', async () => {
  const {api, player} = harness();
  await api.handleTrackAction(1, 'stop');
  assert.equal(player.paused, false);
  assert.equal(player.currentTime, 37.5);
  await api.handleTrackAction(0, 'stop');
  assert.equal(player.paused, true);
  assert.equal(player.currentTime, 0);
});
