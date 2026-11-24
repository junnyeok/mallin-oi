import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = (await readFile(new URL('../assets/js/modules/bgm-player.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?;\n/gm, '')
  .replace(/const \{ BGM_CATALOG \} = await import\([^;]+;/, 'const BGM_CATALOG = [];')
  .replace(/^export /gm, '');

const playbackKey = 'mallin_bgm_play_state_v3';

function harness({ session = {}, local = {}, playing = true } = {}) {
  const stored = new Map(Object.entries(session));
  const localStored = new Map(Object.entries(local));
  const storage = (values) => ({
    getItem: key => values.get(key),
    setItem: (key, value) => values.set(key, value),
    removeItem: key => values.delete(key),
  });
  const handlers = {};
  const menu = { contains: () => false };
  const panel = { hidden: false };
  const list = { innerHTML: '', querySelectorAll: () => [] };
  const button = { setAttribute() {} };
  const player = { src: 'track-1.mp3', duration: 200, readyState: 1, currentTime: playing ? 37.5 : 0, paused: !playing, pause() { this.paused = true; }, async play() { this.paused = false; } };
  const elements = {bgmMenu: menu, bgmPanel: panel, bgmBtn: button, bgmList: list};
  const context = {
    window: {__SITE_VERSION__: 'test'},
    document: {
      getElementById: id => elements[id],
      addEventListener: (type, fn) => { handlers[type] = fn; },
      createElement: () => ({setAttribute() {}, remove() { delete elements[this.id]; }}),
      body: {appendChild: (element) => { elements[element.id] = element; }},
    },
    localStorage: storage(localStored),
    sessionStorage: storage(stored),
    console, player, playing, setTimeout, clearTimeout,
  };
  const api = vm.runInNewContext(source + `
    audio = player;
    playlist = [1,2,3].map(i => ({id: 'track-'+i, title: 'Track '+i}));
    currentIndex = 0;
    currentTrackId = 'track-1';
    isPlaying = playing;
    authenticatedUserId = 'test-user';
    panelOpen = true;
    const renderRows = renderPlaylist;
    revealCurrentTrack = () => {};
    renderPlaylist = () => {};
    updatePanelDesc = () => {};
    notifyPersonalBgmPlay = () => {};
    scheduleRemotePreferenceSave = () => {};
    scheduleSavePlaybackState = () => {};
    setTrackSource = (track) => { currentTrackId = track.id; player.src = track.id+'.mp3'; };
    bindPanelGlobalEvents();
    ({pauseTrack, handleTrackAction, playAdjacentTrack, playNextTrack, togglePlaybackMode, seekTrack, previewSeek, renderRows,
      bindRetryOnUserGesture, resumeAfterNavigation, waitForBgmResumeCheck, setAuthenticatedUser,
      getAdjacentTrackIndex, getBgmPlaybackState, mode: () => playbackMode, setIndex: i => {currentIndex=i;currentTrackId=playlist[i].id;},
      reorder: () => { const id=getCurrentTrack().id; playlist.reverse(); currentIndex=playlist.findIndex(t=>t.id===id); }});
  `, context);
  return {api, player, stored, localStored, elements, handlers, menu, panel, list};
}

test('pause preserves time and same-track play resumes', async () => {
  const {api, player} = harness();
  api.pauseTrack();
  assert.equal(player.currentTime, 37.5);
  assert.equal(player.paused, true);
  await api.handleTrackAction(0);
  assert.equal(player.paused, false);
  assert.equal(player.currentTime, 37.5);
});

test('only the playing song has a seek bar, which follows pause, resume and track changes', async () => {
  const {api, player, list} = harness();
  const renderedSeekIndices = () => {
    api.renderRows();
    return Array.from(list.innerHTML.matchAll(/data-bgm-seek="(\d+)"/g), match => Number(match[1]));
  };
  assert.deepEqual(renderedSeekIndices(), [0]);
  api.pauseTrack();
  assert.deepEqual(renderedSeekIndices(), []);
  await api.handleTrackAction(0);
  assert.deepEqual(renderedSeekIndices(), [0]);
  assert.equal(player.currentTime, 37.5);
  await api.playNextTrack();
  assert.deepEqual(renderedSeekIndices(), [1]);
});

test('rerendered controls remain inside the popup event path; outside clicks close it', () => {
  const {api, handlers, menu, panel} = harness();
  api.pauseTrack();
  handlers.click({target: {}, composedPath: () => [{}, menu]});
  assert.equal(panel.hidden, false);
  handlers.click({target: {}, composedPath: () => [{}]});
  assert.equal(panel.hidden, true);
});

test('sequential next wraps last to first; previous wraps first to last', async () => {
  const {api, player} = harness();
  api.setIndex(2);
  await api.playNextTrack();
  assert.equal(api.getBgmPlaybackState().trackId, 'track-1');
  assert.equal(player.currentTime, 0);
  await api.playAdjacentTrack(-1);
  assert.equal(api.getBgmPlaybackState().trackId, 'track-3');
});

test('random next excludes current; previous/next follow actual history even after reordering', async () => {
  const {api, localStored} = harness();
  api.togglePlaybackMode();
  assert.equal(api.mode(), 'shuffle');
  assert.equal(localStored.get('mallin_bgm_playback_mode_v1'), 'shuffle');
  await api.playNextTrack();
  const randomId = api.getBgmPlaybackState().trackId;
  assert.notEqual(randomId, 'track-1');
  api.reorder();
  await api.playAdjacentTrack(-1);
  assert.equal(api.getBgmPlaybackState().trackId, 'track-1');
  await api.playNextTrack();
  assert.equal(api.getBgmPlaybackState().trackId, randomId);
  api.togglePlaybackMode();
  assert.equal(api.mode(), 'sequential');
});

test('seeking playing or paused track clamps position, persists and keeps pause state', async () => {
  const {api, player, stored} = harness();
  await api.seekTrack(0, 0.6);
  assert.equal(player.currentTime, 120);
  assert.equal(player.paused, false);
  api.pauseTrack();
  await api.seekTrack(0, 0.4);
  assert.equal(player.currentTime, 80);
  assert.equal(player.paused, true);
  assert.equal(JSON.parse(stored.get(playbackKey)).currentTime, 80);
  await api.seekTrack(0, -1);
  assert.equal(player.currentTime, 0);
  await api.seekTrack(0, 2);
  assert.equal(player.currentTime, 200);
});

test('seeking an inactive row plays that track at requested position, not the previous source', async () => {
  const {api, player} = harness();
  api.pauseTrack();
  await api.seekTrack(1, 0.75);
  assert.equal(api.getBgmPlaybackState().trackId, 'track-2');
  assert.equal(player.src, 'track-2.mp3');
  assert.equal(player.currentTime, 150);
  assert.equal(player.paused, false);
});

test('per-track slider scrubs live without rerendering the row', () => {
  const {api, player} = harness();
  const props = {};
  const input = {dataset: {bgmSeek: '0'}, value: '250', style: {setProperty: (k,v) => props[k]=v}, setAttribute() {}};
  api.previewSeek(input);
  assert.equal(player.currentTime, 50);
  assert.equal(props['--bgm-progress'], '25%');
});

test('a superseded seek never changes the newer track after metadata arrives', async () => {
  const {api, player} = harness();
  player.readyState = 0;
  const events = {};
  player.addEventListener = (type, handler) => {events[type]=handler;};
  player.removeEventListener = () => {};
  const pending = api.seekTrack(1, 0.5);
  api.setIndex(2);
  events.loadedmetadata();
  await pending;
  assert.equal(player.currentTime, 37.5);
  assert.equal(api.getBgmPlaybackState().trackId, 'track-3');
});

test('a late play result cannot undo a newer user pause', async () => {
  const {api, player} = harness();
  let resolvePlay;
  player.play = () => new Promise(resolve => {resolvePlay=resolve;});
  const pending = api.handleTrackAction(1);
  assert.equal(api.getBgmPlaybackState().isStarting, true);
  api.pauseTrack();
  resolvePlay();
  await pending;
  assert.equal(api.getBgmPlaybackState().isStarting, false);
  assert.equal(api.getBgmPlaybackState().isPlaying, false);
});

function playbackSnapshot(overrides = {}) {
  return JSON.stringify({
    userId: 'test-user', trackId: 'track-2', index: 1,
    currentTime: 52.25, wasPlaying: true, ...overrides,
  });
}

test('document navigation resumes the exact same-tab song and position', async () => {
  const {api, player, stored} = harness({
    playing: false,
    session: {[playbackKey]: playbackSnapshot()},
    local: {[playbackKey]: playbackSnapshot({ trackId: 'track-3' })},
  });
  assert.equal(api.getBgmPlaybackState().isStarting, true);
  await api.resumeAfterNavigation();
  await api.waitForBgmResumeCheck();
  assert.equal(api.getBgmPlaybackState().isStarting, false);
  assert.equal(api.getBgmPlaybackState().isPlaying, true);
  assert.equal(player.src, 'track-2.mp3');
  assert.equal(player.currentTime, 52.25);
  assert.equal(JSON.parse(stored.get(playbackKey)).userId, 'test-user');
});

test('another tab, a paused track, a different account and an unavailable track never autoplay', async () => {
  for (const storage of [
    {local: {[playbackKey]: playbackSnapshot()}},
    {session: {[playbackKey]: playbackSnapshot({ wasPlaying: false })}},
    {session: {[playbackKey]: playbackSnapshot({ userId: 'other-user' })}},
    {session: {[playbackKey]: playbackSnapshot({ trackId: 'missing' })}},
  ]) {
    const {api, player} = harness({playing: false, ...storage});
    api.setAuthenticatedUser({id: 'test-user'});
    await api.resumeAfterNavigation();
    await api.waitForBgmResumeCheck();
    assert.equal(api.getBgmPlaybackState().isStarting, false);
    assert.equal(player.paused, true);
    assert.equal(player.currentTime, 0);
  }
});

test('autoplay blocked on document navigation keeps the same song until a tap', async () => {
  const {api, player, stored, handlers, elements} = harness({
    playing: false,
    session: {[playbackKey]: playbackSnapshot()},
  });
  player.play = async () => { throw new DOMException('gesture required', 'NotAllowedError'); };
  await api.resumeAfterNavigation();
  await api.waitForBgmResumeCheck();
  assert.equal(api.getBgmPlaybackState().isStarting, true);
  assert.equal(api.getBgmPlaybackState().isPlaying, false);
  assert.ok(elements.bgmReloadResumeNotice);
  assert.equal(JSON.parse(stored.get(playbackKey)).currentTime, 52.25);

  player.play = async () => { player.paused = false; };
  api.bindRetryOnUserGesture();
  handlers.click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(api.getBgmPlaybackState().isStarting, false);
  assert.equal(api.getBgmPlaybackState().isPlaying, true);
  assert.equal(player.currentTime, 52.25);
  assert.equal(elements.bgmReloadResumeNotice, undefined);
});

test('rapid song changes ignore an interrupted old play request', async () => {
  const {api, player} = harness();
  let rejectPlay;
  player.play = () => new Promise((resolve,reject) => {rejectPlay=reject;});
  const oldRequest = api.handleTrackAction(1);
  player.play = async () => { player.paused = false; };
  await api.handleTrackAction(2);
  rejectPlay(new Error('source interrupted'));
  await oldRequest;
  assert.equal(api.getBgmPlaybackState().trackId, 'track-3');
  assert.equal(api.getBgmPlaybackState().isPlaying, true);
});

test('current track is revealed in the list without extra space or repeated scrolling', () => {
  const fn = source.slice(source.indexOf('function revealCurrentTrack('), source.indexOf('function renderPlaylist()'));
  let callback;
  const styles = {};
  const list = {children: [{}, {getBoundingClientRect: () => ({top:320})}], lastElementChild: {offsetHeight:80}, clientHeight:400, clientTop:0, scrollTop:77, style:{setProperty:(key,value)=>styles[key]=value}, getBoundingClientRect:()=>({top:200})};
  const api=vm.runInNewContext(`let panelOpen=true,currentIndex=1,lastRevealedTrackId='',revealFrame=null;${fn};({revealCurrentTrack,close:()=>panelOpen=false})`, {
    $:()=>list, getCurrentTrack:()=>({id:'last-track'}), getComputedStyle:()=>({paddingTop:'8px'}),
    requestAnimationFrame:fn=>{callback=fn;return 1;},cancelAnimationFrame:()=>{},
  });
  api.revealCurrentTrack();callback();
  assert.equal(list.scrollTop,189);
  assert.equal(Object.keys(styles).length,0);
  callback=null; api.revealCurrentTrack();
  assert.equal(callback,null);
  api.revealCurrentTrack({force:true});assert.equal(typeof callback,'function');
  api.close();callback=null;api.revealCurrentTrack({force:true});assert.equal(callback,null);
});

test('header partial avoids Live Server SVG injection that truncates account and navigation links', async () => {
  const header = await readFile(new URL('../partials/header.html', import.meta.url),'utf8');
  assert.doesNotMatch(header, /<\/svg>/i, 'Live Server injects a script at each SVG close tag but counts its length only once');
  assert.match(header, /class="auth-links"/);
  assert.match(header, /class="site-nav"/);
});
