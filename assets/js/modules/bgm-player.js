import { loadItemOrder, getItemOrder, sortByItemOrder, appendItemOrderButton } from './inventory-order.js';
import { supabase } from './supabase-client.js';
import {
  getCurrentSession,
  showLoginRequiredPopup,
} from './auth-store.js';
import {
  getLocalSelectedBgmTrackIds,
  hydrateBgmPreferencesFromRemote,
  saveRemoteBgmPreferences,
} from './bgm-preferences.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { BGM_CATALOG } = await import(`./store-data.js?v=${MODULE_VERSION}`);

const BGM_STORAGE_KEY = 'mallin_bgm_selected_v1';
const BGM_TRACK_ID_STORAGE_KEY = 'mallin_bgm_selected_track_id_v1';
const BGM_TRACK_IDS_STORAGE_KEY = 'mallin_bgm_selected_track_ids_v1';
const BGM_STATE_STORAGE_KEY = 'mallin_bgm_play_state_v3';
const BGM_STATE_STORAGE_LEGACY_KEY = 'mallin_bgm_play_state_v2';
const STORE_BGM_PREVIEW_EVENT = 'mallin:store-bgm-preview';
export const PERSONAL_BGM_PLAY_EVENT = 'mallin:personal-bgm-play';
const BGM_RELOAD_NOTICE_ID = 'bgmReloadResumeNotice';
const BGM_MODE_STORAGE_KEY = 'mallin_bgm_playback_mode_v1';

let playbackMode = localStorage.getItem(BGM_MODE_STORAGE_KEY) === 'shuffle' ? 'shuffle' : 'sequential';
let shuffleHistory = [];
let shuffleCursor = -1;
const trackDurations = new Map();
let scrubbingSeek = null;
let playbackRequest = 0;
let audio = null;
let playlist = [];
let currentIndex = 0;
let panelOpen = false;
let lastRevealedTrackId = '';
let revealFrame = null;
let playBlocked = false;
let isPlaying = false;
let currentTrackId = '';
let saveStateTimer = null;
let retryBinded = false;
let lifecycleBinded = false;
let panelEventsBinded = false;
let authWatcherBinded = false;
let selectionWatcherBinded = false;
let storePreviewWatcherBinded = false;
let storePreviewResumeState = null;
let authenticatedUserId = '';
let externalPlaybackSession = null;
let externalPlaybackSessionSequence = 0;

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isReloadNavigation() {
  try {
    const navEntry = performance.getEntriesByType?.('navigation')?.[0];
    if (navEntry && navEntry.type) {
      return navEntry.type === 'reload';
    }

    if (performance.navigation) {
      return performance.navigation.type === 1;
    }
  } catch (error) {
    console.warn('[bgm] reload navigation detect failed:', error);
  }

  return false;
}

function getReloadResumeNotice() {
  return document.getElementById(BGM_RELOAD_NOTICE_ID);
}

function removeReloadResumeNotice() {
  const notice = getReloadResumeNotice();
  if (notice) {
    notice.remove();
  }
}

function showReloadResumeNotice() {
  if (getReloadResumeNotice()) return;

  const notice = document.createElement('div');
  notice.id = BGM_RELOAD_NOTICE_ID;
  notice.className = 'bgm-reload-notice';
  notice.setAttribute('role', 'dialog');
  notice.setAttribute('aria-live', 'polite');
  notice.setAttribute('aria-label', 'BGM 이어재생 안내');

  notice.innerHTML = `
    <div class="bgm-reload-notice__backdrop"></div>
    <div class="bgm-reload-notice__panel">
      <strong class="bgm-reload-notice__title">BGM이 일시정지됐어</strong>
      <p class="bgm-reload-notice__text">
        브라우저 정책 때문에 새로고침 후에는 자동으로 이어재생되지 않을 수 있어.
        화면을 한 번 클릭하거나 터치하면 이어서 재생할게.
      </p>
      <p class="bgm-reload-notice__hint">화면 클릭 / 터치 시 닫힘</p>
    </div>
  `;

  document.body.appendChild(notice);
}

function maybeShowReloadResumeNotice(savedState) {
  if (!playBlocked) return;
  if (!savedState?.wasPlaying) return;
  if (!isReloadNavigation()) return;

  showReloadResumeNotice();
}

function shouldUseReloadResumeFlow(savedState = getSavedPlaybackState()) {
  if (!hasAuthenticatedUser()) return false;
  if (!isReloadNavigation()) return false;
  if (!savedState?.wasPlaying) return false;
  return true;
}

function bindReloadResumeNoticeDismiss() {
  const dismiss = async () => {
    const notice = getReloadResumeNotice();
    if (!notice) return;
    if (!hasAuthenticatedUser()) {
      removeReloadResumeNotice();
      return;
    }

    try {
      await restorePlaybackPosition();
    } catch (error) {
      console.error('[bgm] reload resume restore failed:', error);
    } finally {
      removeReloadResumeNotice();
    }
  };

  ['click', 'touchstart', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, dismiss);
  });
}

function getSavedTrackId() {
  return String(localStorage.getItem(BGM_TRACK_ID_STORAGE_KEY) || '').trim();
}

function getDefaultTrackId() {
  return String(BGM_CATALOG.find((track) => track?.isDefault)?.id || '').trim();
}

async function getSessionUser() {
  const session = await getCurrentSession();
  return session?.user || null;
}

function setAuthenticatedUser(user) {
  authenticatedUserId = String(user?.id || '').trim();
}

function hasAuthenticatedUser() {
  return !!authenticatedUserId;
}

function getSavedSelectedTrackIds() {
  return getLocalSelectedBgmTrackIds();
}

function getSavedIndex() {
  const raw = Number(localStorage.getItem(BGM_STORAGE_KEY) || 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

function getPreferredIndex() {
  const savedTrackId = getSavedTrackId();

  if (savedTrackId) {
    const matchedIndex = playlist.findIndex(
      (track) => track.id === savedTrackId,
    );
    if (matchedIndex >= 0) return matchedIndex;
  }

  return getSavedIndex();
}

function saveIndex(index) {
  localStorage.setItem(BGM_STORAGE_KEY, String(index));

  const track = playlist[index];
  if (track?.id) {
    localStorage.setItem(BGM_TRACK_ID_STORAGE_KEY, track.id);
  }

  scheduleRemotePreferenceSave();
}

function getCurrentTrack() {
  return playlist[currentIndex] || null;
}

function setPanelDesc(text) {
  const desc = $('bgmPanelDesc');
  if (desc) desc.textContent = text;
}

function getSavedPlaybackState() {
  try {
    const raw =
      localStorage.getItem(BGM_STATE_STORAGE_KEY) ||
      sessionStorage.getItem(BGM_STATE_STORAGE_KEY) ||
      sessionStorage.getItem(BGM_STATE_STORAGE_LEGACY_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      trackId: String(parsed.trackId || ''),
      index: Number.isFinite(Number(parsed.index)) ? Number(parsed.index) : 0,
      currentTime: Number.isFinite(Number(parsed.currentTime))
        ? Number(parsed.currentTime)
        : 0,
      wasPlaying: Boolean(parsed.wasPlaying),
      savedAt: Number.isFinite(Number(parsed.savedAt))
        ? Number(parsed.savedAt)
        : Date.now(),
    };
  } catch (error) {
    console.error('[bgm] failed to read playback state:', error);
    return null;
  }
}

function savePlaybackState() {
  const track = getCurrentTrack();
  const player = audio;
  const suspendedState = externalPlaybackSession?.shouldResume
    ? externalPlaybackSession
    : null;

  try {
    const payload = {
      trackId: suspendedState?.trackId || track?.id || '',
      index: Number.isFinite(suspendedState?.index)
        ? suspendedState.index
        : currentIndex,
      currentTime:
        suspendedState && Number.isFinite(suspendedState.currentTime)
          ? suspendedState.currentTime
          : player && Number.isFinite(player.currentTime)
            ? player.currentTime
            : 0,
      wasPlaying: Boolean(
        suspendedState || (isPlaying && player && !player.paused),
      ),
      savedAt: Date.now(),
    };

    localStorage.setItem(BGM_STATE_STORAGE_KEY, JSON.stringify(payload));
    sessionStorage.setItem(BGM_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('[bgm] failed to save playback state:', error);
  }
}

function scheduleSavePlaybackState() {
  if (saveStateTimer) return;

  saveStateTimer = window.setTimeout(() => {
    saveStateTimer = null;
    savePlaybackState();
  }, 250);
}

function clearSavedPlaybackState() {
  try {
    localStorage.removeItem(BGM_STATE_STORAGE_KEY);
    sessionStorage.removeItem(BGM_STATE_STORAGE_KEY);
    sessionStorage.removeItem(BGM_STATE_STORAGE_LEGACY_KEY);
  } catch (error) {
    console.error('[bgm] failed to clear playback state:', error);
  }
}

let remotePreferenceSaveTimer = null;

function scheduleRemotePreferenceSave() {
  if (remotePreferenceSaveTimer) {
    window.clearTimeout(remotePreferenceSaveTimer);
  }

  remotePreferenceSaveTimer = window.setTimeout(async () => {
    remotePreferenceSaveTimer = null;

    try {
      const user = await getSessionUser();
      if (!user?.id) return;

      const selectedTrackIds = [...getSavedSelectedTrackIds()];
      const track = getCurrentTrack();

      await saveRemoteBgmPreferences(user.id, {
        selectedTrackIds,
        currentTrackId: track?.id || '',
      });
    } catch (error) {
      console.error('[bgm] remote preference save failed:', error);
    }
  }, 150);
}

function stopAndResetPlayback() {
  playbackRequest += 1;
  shuffleHistory = [];
  shuffleCursor = -1;
  scrubbingSeek = null;
  externalPlaybackSession = null;

  if (audio) {
    try {
      audio.pause();
    } catch (error) {
      console.warn('[bgm] failed to pause audio:', error);
    }

    try {
      audio.currentTime = 0;
    } catch (error) {
      console.warn('[bgm] failed to reset currentTime:', error);
    }

    audio.removeAttribute('src');
    audio.load();
  }

  isPlaying = false;
  playBlocked = false;
  currentTrackId = '';
  clearSavedPlaybackState();
  removeReloadResumeNotice();
}

function renderLoginRequiredState() {
  const list = $('bgmList');
  const toggleBtn = $('bgmPlayToggleBtn');

  if (toggleBtn) toggleBtn.disabled = true;
  ['bgmModeBtn', 'bgmPreviousBtn', 'bgmNextBtn'].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = true;
  });

  setPanelDesc('로그인 후 BGM을 들을 수 있어.');

  if (list) {
    list.innerHTML = `
      <div class="bgm-empty">
        로그인 후 배경음악을 재생할 수 있어.
      </div>
    `;
  }
}

function moveToLoginForBgm() {
  showLoginRequiredPopup({
    title: '로그인이 필요해',
    message: 'BGM은 로그인 후 재생할 수 있어.',
  });
}

function bindPanelGlobalEvents() {
  if (panelEventsBinded) return;
  panelEventsBinded = true;

  document.addEventListener('click', (event) => {
    if (!panelOpen) return;

    const menu = $('bgmMenu');
    // Playlist rendering can detach the clicked button before this event bubbles.
    if (event.composedPath().includes(menu) || menu?.contains(event.target)) return;

    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel();
    }
  });
}

function bindAuthWatcher() {
  if (authWatcherBinded) return;
  authWatcherBinded = true;

  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user?.id) {
      setAuthenticatedUser(session.user);
      return;
    }

    if (event !== 'SIGNED_OUT') {
      return;
    }

    setAuthenticatedUser(null);
    stopAndResetPlayback();
    closePanel();
    renderLoginRequiredState();
  });

  window.addEventListener('auth-changed', async () => {
    try {
      const user = await getSessionUser();

      if (user?.id) {
        setAuthenticatedUser(user);
        return;
      }

      setAuthenticatedUser(null);
      stopAndResetPlayback();
      closePanel();
      renderLoginRequiredState();
    } catch (error) {
      console.error('[bgm] auth-changed sync failed:', error);
    }
  });
}

function ensureAudio() {
  if (audio) return audio;

  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 1;
  audio.playsInline = true;

  audio.addEventListener('play', () => {
    externalPlaybackSession = null;
    isPlaying = true;
    scheduleSavePlaybackState();
    renderPlaylist();
    updatePanelDesc();

    window.dispatchEvent(
      new CustomEvent(PERSONAL_BGM_PLAY_EVENT, {
        detail: {
          state: 'playing',
          trackId: getCurrentTrack()?.id || '',
        },
      }),
    );
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    scheduleSavePlaybackState();
    renderPlaylist();
    updatePanelDesc();
  });

  audio.addEventListener('timeupdate', () => {
    scheduleSavePlaybackState();
    updateSeekControls();
  });

  const updateDuration = () => {
    if (currentTrackId && Number.isFinite(audio.duration) && audio.duration > 0) {
      trackDurations.set(currentTrackId, audio.duration);
    }
    scheduleSavePlaybackState();
    updateSeekControls();
  };
  audio.addEventListener('loadedmetadata', updateDuration);
  audio.addEventListener('durationchange', updateDuration);

  audio.addEventListener('ended', () => {
    playNextTrack().catch((error) => {
      console.error('[bgm] next track failed:', error);
    });
  });

  audio.addEventListener('error', () => {
    isPlaying = false;
    scheduleSavePlaybackState();
    setPanelDesc('BGM 파일을 재생하지 못했어.');
    renderPlaylist();
  });

  return audio;
}

function renderPlaybackIcon(action) {
  const shapes = {
    play: '<path d="M8 5.5a1 1 0 0 1 1.5-.86l10 5.75a1 1 0 0 1 0 1.72l-10 5.75A1 1 0 0 1 8 17Z"/>',
    pause: '<rect x="6" y="5" width="4" height="14" rx="1.3"/><rect x="14" y="5" width="4" height="14" rx="1.3"/>',
    previous: '<rect x="5" y="5" width="3" height="14" rx="1"/><path d="M18 5.5v13L8 12Z"/>',
    next: '<rect x="16" y="5" width="3" height="14" rx="1"/><path d="M6 5.5v13L16 12Z"/>',
    shuffle: '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h2c5 0 5 12 10 12h6m-4-4 4 4-4 3M3 18h2c1.4 0 2.5-1.2 3.5-3M12 8c1-1.2 1.8-2 3-2h6m-4-3 4 3-4 4"/></g>',
    sequential: '<g fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V6h16m-4-4 4 4-4 4M20 15v3H4m4-4-4 4 4 4"/></g>',
  };
  return `<svg class="bgm-control-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${shapes[action] || shapes.play}</svg>`;
}

function updatePanelDesc() {
  const toggleBtn = $('bgmPlayToggleBtn');
  if (toggleBtn) {
    const label = isPlaying ? '일시정지' : '재생';
    toggleBtn.innerHTML = renderPlaybackIcon(isPlaying ? 'pause' : 'play');
    toggleBtn.setAttribute('aria-label', label);
    toggleBtn.title = label;
  }
  const disabled = !hasAuthenticatedUser() || !playlist.length;
  ['bgmPlayToggleBtn', 'bgmModeBtn', 'bgmPreviousBtn', 'bgmNextBtn'].forEach((id) => {
    const button = $(id);
    if (button) button.disabled = disabled;
  });
  const modeButton = $('bgmModeBtn');
  if (modeButton) {
    const label = playbackMode === 'shuffle'
      ? '랜덤 재생 중 · 순차 반복 재생으로 전환'
      : '순차 반복 재생 중 · 랜덤 재생으로 전환';
    modeButton.innerHTML = renderPlaybackIcon(playbackMode);
    modeButton.setAttribute('aria-label', label);
    modeButton.setAttribute('aria-pressed', String(playbackMode === 'shuffle'));
    modeButton.title = label;
  }
  const track = getCurrentTrack();

  if (!track) {
    setPanelDesc('선택한 배경음악이 없어. 프로필에서 BGM을 골라줘.');
    return;
  }

  if (isPlaying) {
    setPanelDesc(`지금 재생 중: ${track.title}`);
    return;
  }

  if (playBlocked) {
    setPanelDesc(
      '자동재생이 브라우저에서 막혔어. 화면을 한 번 터치하거나 클릭하면 바로 재생할게.',
    );
    return;
  }

  setPanelDesc(`현재 선택된 곡: ${track.title}`);
}

// Scroll only the BGM list, leaving the page and the saved playlist order alone.
function revealCurrentTrack({ force = false } = {}) {
  if (!panelOpen) return;
  const id = getCurrentTrack()?.id;
  if (!id || (!force && id === lastRevealedTrackId)) return;
  if (revealFrame !== null) cancelAnimationFrame(revealFrame);
  revealFrame = requestAnimationFrame(() => {
    revealFrame = null;
    if (!panelOpen) return;
    const list = $('bgmList');
    const card = list?.children[currentIndex];
    if (!list || !card) return;
    const padding = parseFloat(getComputedStyle(list).paddingTop) || 0;
    // Native scroll limits keep the final song at the bottom without empty space.
    list.scrollTop += card.getBoundingClientRect().top - list.getBoundingClientRect().top - list.clientTop - padding;
    lastRevealedTrackId = getCurrentTrack()?.id || '';
  });
}

function renderPlaylist() {
  const list = $('bgmList');
  if (!list) return;

  if (!playlist.length) {
    list.innerHTML = `<div class="bgm-empty">선택한 배경음악이 아직 없어.</div>`;
    return;
  }

  list.innerHTML = playlist
    .map((track, index) => {
      const isActive = index === currentIndex;
      const activeClass = isActive ? ' is-active' : '';
      const playingClass = isActive && isPlaying ? ' is-playing' : '';

      return `
        <div class="bgm-item${activeClass}${playingClass}">
          <div class="bgm-item__cover" aria-hidden="true">
            <img
              class="bgm-item__cover-image"
              src="${track.coverPath}"
              alt="${escapeHtml(track.title)}"
              loading="lazy"
            />
          </div>

          <div class="bgm-item__body">
            <p class="bgm-item__title">${escapeHtml(track.title)}</p>
            <div class="bgm-item__controls">

          <button
            type="button"
            class="bgm-item__action bgm-player-control"
            data-bgm-index="${index}"
            aria-label="${escapeHtml(track.title)} ${isActive && isPlaying ? '일시정지' : '재생'}"
            title="${isActive && isPlaying ? '일시정지' : '재생'}"
          >
            ${renderPlaybackIcon(isActive && isPlaying ? 'pause' : 'play')}
          </button>
          <div class="bgm-item__seek">
            <input type="range" class="bgm-item__progress" data-bgm-seek="${index}"
              min="0" max="1000" step="1" value="0"
              aria-label="${escapeHtml(track.title)} 재생 위치" aria-valuetext="0:00"
            />
            <span class="bgm-item__rail" aria-hidden="true"><span class="bgm-item__thumb"></span></span>
            <span class="bgm-item__time" aria-hidden="true">0:00</span>
          </div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');
  const items = playlist.map(track => ({id: track.id, label: track.title}));
  list.querySelectorAll('.bgm-item').forEach((card, index) => {
    appendItemOrderButton(card, {userId: authenticatedUserId, type: 'bgm', items, itemId: playlist[index].id});
    card.querySelector('.bgm-item__controls').append(card.querySelector('.item-order-button'));
  });
  updateSeekControls();
  revealCurrentTrack();
}


async function loadOwnedBgmList() {
  const user = await getSessionUser();
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from('user_store_items')
    .select('item_id')
    .eq('user_id', user.id);

  const selectedTrackIds = getSavedSelectedTrackIds();
  const order = await loadItemOrder(user.id, 'bgm');

  if (error) {
    console.error('[bgm] load owned bgm failed:', error);

    return sortByItemOrder(BGM_CATALOG.filter(
      (item) =>
        item.isDefault && selectedTrackIds.has(String(item?.id || '').trim()),
    ), order);
  }

  const ownedStoreIds = new Set(
    (data || []).map((row) => String(row?.item_id || '').trim()),
  );

  return sortByItemOrder([...BGM_CATALOG]
    .filter((item) => {
      const isOwned =
        item?.isDefault ||
        !item?.storeItemId ||
        ownedStoreIds.has(item.storeItemId);

      if (!isOwned) return false;

      return selectedTrackIds.has(String(item?.id || '').trim());
    })
    .sort(
      (a, b) => Number(a?.displayOrder || 0) - Number(b?.displayOrder || 0),
    ), order);
}

function waitForSeekable(player) {
  if (player.readyState >= 1) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      player.removeEventListener('loadedmetadata', onReady);
      player.removeEventListener('error', onError);
    };
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error('BGM metadata unavailable')); };
    const timer = setTimeout(onError, 10000);
    player.addEventListener('loadedmetadata', onReady, { once: true });
    player.addEventListener('error', onError, { once: true });
  });
}

async function tryAutoplayWithMutedBootstrap(player) {
  const originalMuted = player.muted;
  const originalVolume = player.volume;

  try {
    player.muted = true;
    player.volume = 0;

    await player.play();

    // 재생 시작 자체가 성공한 뒤 원래 상태 복구
    // 약간의 지연을 줘야 브라우저가 재생 시작을 먼저 인정하는 경우가 있음
    await new Promise((resolve) => window.setTimeout(resolve, 60));

    player.muted = originalMuted;
    player.volume = originalVolume;

    return true;
  } catch (error) {
    player.muted = originalMuted;
    player.volume = originalVolume;
    throw error;
  }
}

function setTrackSource(track, { waitForMetadata = true } = {}) {
  const player = ensureAudio();
  if (!track) return;

  const nextTrackId = String(track.id || '');

  if (currentTrackId === nextTrackId && player.src) return;

  currentTrackId = nextTrackId;
  player.src = track.audioPath;
  player.load();

  if (waitForMetadata) return waitForSeekable(player);
}

async function syncPlaylistWithSelection({ autoPlay = false } = {}) {
  const nextPlaylist = await loadOwnedBgmList();
  const nextTrackIds = new Set(
    nextPlaylist.map((track) => String(track?.id || '').trim()).filter(Boolean),
  );

  const savedState = getSavedPlaybackState();
  const restoreTargetTrackId = String(
    currentTrackId || savedState?.trackId || '',
  ).trim();

  const shouldResetTrack = restoreTargetTrackId
    ? !nextTrackIds.has(restoreTargetTrackId)
    : false;

  playlist = nextPlaylist;

  if (!playlist.length) {
    stopAndResetPlayback();
    setPanelDesc('선택한 배경음악이 없어. 프로필에서 BGM을 골라줘.');
    renderPlaylist();
    return;
  }

  const preferredIndex = getPreferredIndex();
  currentIndex =
    preferredIndex >= 0 && preferredIndex < playlist.length
      ? preferredIndex
      : 0;

  saveIndex(currentIndex);
  renderPlaylist();
  updatePanelDesc();

  if (shouldResetTrack) {
    clearSavedPlaybackState();

    if (autoPlay) {
      await playTrack(currentIndex, { startTime: 0, autoPlay: true });
      return;
    }

    currentTrackId = '';
    return;
  }

  if (autoPlay) {
    clearSavedPlaybackState();
    await playTrack(currentIndex, { startTime: 0, autoPlay: true });
  }
}

async function restorePlaybackPosition() {
  const player = ensureAudio();
  const track = getCurrentTrack();
  const savedState = getSavedPlaybackState();

  if (!track || !savedState) return false;
  if (savedState.trackId !== track.id) return false;

  await setTrackSource(track);

  const duration = Number.isFinite(player.duration) ? player.duration : 0;
  const maxSeekTime = duration > 1 ? Math.max(0, duration - 0.35) : 0;
  const safeTime =
    maxSeekTime > 0
      ? Math.min(Math.max(0, savedState.currentTime || 0), maxSeekTime)
      : Math.max(0, savedState.currentTime || 0);

  try {
    if (safeTime > 0) {
      player.currentTime = safeTime;
    }
  } catch (error) {
    console.warn('[bgm] failed to restore currentTime:', error);
  }

  isPlaying = false;
  playBlocked = false;
  renderPlaylist();
  updatePanelDesc();

  if (savedState.wasPlaying) {
    notifyPersonalBgmPlay('restore');

    try {
      await tryAutoplayWithMutedBootstrap(player);
      isPlaying = true;
      playBlocked = false;
      removeReloadResumeNotice();
    } catch (error) {
      isPlaying = false;
      playBlocked = true;
      maybeShowReloadResumeNotice(savedState);
      console.warn('[bgm] autoplay blocked while restoring:', error);
    }
  } else {
    removeReloadResumeNotice();
  }

  savePlaybackState();
  renderPlaylist();
  updatePanelDesc();
  return true;
}

async function tryPlayCurrentTrack() {
  const request = ++playbackRequest;
  const player = ensureAudio();
  const track = getCurrentTrack();

  if (!track) {
    isPlaying = false;
    playBlocked = false;
    clearSavedPlaybackState();
    updatePanelDesc();
    renderPlaylist();
    return;
  }

  notifyPersonalBgmPlay('play');

  setTrackSource(track, { waitForMetadata: false });

  try {
    await player.play();
    if (request !== playbackRequest || currentTrackId !== track.id) return;
    isPlaying = true;
    playBlocked = false;
    removeReloadResumeNotice();
  } catch (error) {
    if (request !== playbackRequest || currentTrackId !== track.id) return;
    isPlaying = false;
    playBlocked = true;
    console.warn('[bgm] autoplay blocked or failed:', error);
  }

  savePlaybackState();
  updatePanelDesc();
  renderPlaylist();
}

async function playTrack(index = 0, options = {}) {
  if (!playlist.length) return;

  const { startTime = 0, autoPlay = true } = options;

  const safeIndex =
    index >= 0 && index < playlist.length ? index : Math.max(0, currentIndex);

  currentIndex = safeIndex;
  saveIndex(currentIndex);

  const track = getCurrentTrack();
  const player = ensureAudio();

  if (startTime > 0) await setTrackSource(track);
  else setTrackSource(track, { waitForMetadata: false });

  try {
    if (startTime > 0) {
      const duration = Number.isFinite(player.duration) ? player.duration : 0;
      const maxSeekTime = duration > 1 ? Math.max(0, duration - 0.35) : 0;
      const safeTime =
        maxSeekTime > 0
          ? Math.min(Math.max(0, startTime), maxSeekTime)
          : Math.max(0, startTime);

      player.currentTime = safeTime;
    } else {
      player.currentTime = 0;
    }
  } catch (error) {
    console.warn('[bgm] failed to set currentTime:', error);
  }

  if (!autoPlay) {
    player.pause();
    isPlaying = false;
    playBlocked = false;
    savePlaybackState();
    updatePanelDesc();
    renderPlaylist();
    return;
  }

  await tryPlayCurrentTrack();
}

function pauseTrack() {
  playbackRequest += 1;
  playBlocked = false;
  const player = ensureAudio();
  player.pause();
  isPlaying = false;
  savePlaybackState();
  updatePanelDesc();
  renderPlaylist();
}

async function handleTrackAction(index) {
  if (index === currentIndex) {
    if (isPlaying) pauseTrack();
    else await tryPlayCurrentTrack();
    return;
  }
  await playTrack(index, { startTime: 0, autoPlay: true });
}

function notifyPersonalBgmPlay(reason = 'play') {
  externalPlaybackSession = null;

  window.dispatchEvent(
    new CustomEvent(PERSONAL_BGM_PLAY_EVENT, {
      detail: {
        state: 'request',
        reason: String(reason || 'play'),
        trackId: getCurrentTrack()?.id || '',
      },
    }),
  );
}

export function getBgmPlaybackState() {
  const player = audio;
  const track = getCurrentTrack();

  return {
    isPlaying: Boolean(isPlaying && player && !player.paused),
    isSuspendedForExternalAudio: Boolean(externalPlaybackSession),
    trackId: String(track?.id || currentTrackId || '').trim(),
    currentTime:
      player && Number.isFinite(player.currentTime) ? player.currentTime : 0,
  };
}

export function pauseBgmForExternalAudio(source = 'external-audio') {
  const normalizedSource = String(source || 'external-audio').trim();

  if (
    externalPlaybackSession &&
    externalPlaybackSession.source === normalizedSource
  ) {
    return {
      id: externalPlaybackSession.id,
      source: externalPlaybackSession.source,
    };
  }

  const player = audio;
  const track = getCurrentTrack();
  const savedState = getSavedPlaybackState();
  const isActuallyPlaying = Boolean(isPlaying && player && !player.paused);
  const shouldResumeReloadState = Boolean(
    getReloadResumeNotice() && savedState?.wasPlaying,
  );

  externalPlaybackSessionSequence += 1;
  externalPlaybackSession = {
    id: externalPlaybackSessionSequence,
    source: normalizedSource,
    shouldResume: isActuallyPlaying || shouldResumeReloadState,
    trackId: String(track?.id || savedState?.trackId || '').trim(),
    index: Number.isFinite(currentIndex)
      ? currentIndex
      : Number(savedState?.index) || 0,
    currentTime:
      player && Number.isFinite(player.currentTime) && player.currentTime > 0
        ? player.currentTime
        : Math.max(0, Number(savedState?.currentTime) || 0),
  };

  removeReloadResumeNotice();

  if (isActuallyPlaying) {
    pauseTrack();
  } else {
    savePlaybackState();
  }

  return {
    id: externalPlaybackSession.id,
    source: externalPlaybackSession.source,
  };
}

export async function restoreBgmAfterExternalAudio(
  handle,
  { resume = true } = {},
) {
  const handleId = Number(handle?.id);
  if (!externalPlaybackSession || externalPlaybackSession.id !== handleId) {
    return false;
  }

  const resumeState = externalPlaybackSession;
  externalPlaybackSession = null;

  if (!resume || !resumeState.shouldResume) {
    savePlaybackState();
    return false;
  }

  const user = await getSessionUser();
  if (!user) return false;

  if (!playlist.length) {
    await syncPlaylistWithSelection({ autoPlay: false });
  }

  let nextIndex = Number.isFinite(resumeState.index)
    ? resumeState.index
    : currentIndex;

  if (resumeState.trackId) {
    const matchedIndex = playlist.findIndex(
      (track) => track.id === resumeState.trackId,
    );
    if (matchedIndex >= 0) nextIndex = matchedIndex;
  }

  if (nextIndex < 0 || nextIndex >= playlist.length) {
    nextIndex = 0;
  }

  await playTrack(nextIndex, {
    startTime: Math.max(0, Number(resumeState.currentTime) || 0),
    autoPlay: true,
  });

  return Boolean(isPlaying && audio && !audio.paused);
}

function getAdjacentTrackIndex(direction) {
  if (playlist.length < 2) return 0;
  if (playbackMode !== 'shuffle') {
    return (currentIndex + direction + playlist.length) % playlist.length;
  }

  const currentId = getCurrentTrack()?.id;
  if (shuffleHistory[shuffleCursor] !== currentId) {
    shuffleHistory = [currentId];
    shuffleCursor = 0;
  }
  // Keep actual listening history so Previous reverses a random Next.
  const historyId = shuffleHistory[shuffleCursor + direction];
  const historyIndex = playlist.findIndex((track) => track.id === historyId);
  if (historyIndex >= 0) {
    shuffleCursor += direction;
    return historyIndex;
  }
  if (direction < 0) return currentIndex;

  const choices = playlist.map((_, index) => index).filter((index) => index !== currentIndex);
  const nextIndex = choices[Math.floor(Math.random() * choices.length)];
  shuffleHistory = shuffleHistory.slice(0, shuffleCursor + 1);
  shuffleHistory.push(playlist[nextIndex].id);
  shuffleCursor += 1;
  return nextIndex;
}

function togglePlaybackMode() {
  playbackMode = playbackMode === 'shuffle' ? 'sequential' : 'shuffle';
  shuffleHistory = [];
  shuffleCursor = -1;
  localStorage.setItem(BGM_MODE_STORAGE_KEY, playbackMode);
  updatePanelDesc();
}

async function playAdjacentTrack(direction) {
  if (!playlist.length) return;
  const nextIndex = getAdjacentTrackIndex(direction);
  clearSavedPlaybackState();
  await playTrack(nextIndex, { startTime: 0, autoPlay: true });
}

async function playNextTrack() {
  await playAdjacentTrack(1);
}

function formatPlaybackTime(seconds) {
  const value = Math.max(0, Math.floor(Number(seconds) || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function paintSeekControl(input, ratio, duration = 0) {
  const fraction = Math.min(1, Math.max(0, ratio));
  input.style.setProperty('--bgm-progress', `${fraction * 100}%`);
  input.parentElement?.style?.setProperty('--bgm-progress', `${fraction * 100}%`);
  const text = duration > 0
    ? `${formatPlaybackTime(fraction * duration)} / ${formatPlaybackTime(duration)}`
    : `${Math.round(fraction * 100)}%`;
  input.setAttribute('aria-valuetext', text);
  input.title = text;
  const time = input.parentElement?.querySelector('.bgm-item__time');
  if (time) time.textContent = duration > 0 ? text : '—:—';
}

function updateSeekControls() {
  const list = $('bgmList');
  if (!list) return;
  list.querySelectorAll('[data-bgm-seek]').forEach((input) => {
    // Never replace the thumb under a user's finger or keyboard focus.
    if (scrubbingSeek === input) return;
    const track = playlist[Number(input.dataset.bgmSeek)];
    const loaded = track?.id === currentTrackId;
    const duration = loaded && Number.isFinite(audio?.duration) && audio.duration > 0
      ? audio.duration : trackDurations.get(track?.id) || 0;
    const ratio = loaded && duration > 0 ? audio.currentTime / duration : 0;
    input.value = String(Math.round(ratio * 1000));
    paintSeekControl(input, ratio, duration);
  });
}

function previewSeek(input) {
  const track = playlist[Number(input.dataset.bgmSeek)];
  const ratio = Number(input.value) / 1000;
  const loaded = track?.id === currentTrackId;
  const duration = loaded && Number.isFinite(audio?.duration) && audio.duration > 0
    ? audio.duration : trackDurations.get(track?.id) || 0;
  paintSeekControl(input, ratio, duration);
  if (loaded && duration > 0) {
    audio.currentTime = ratio * duration;
    scheduleSavePlaybackState();
  }
}

async function seekTrack(index, ratio) {
  const track = playlist[index];
  if (!track) return;
  const player = ensureAudio();
  const alreadyLoaded = currentTrackId === track.id && Boolean(player.src);
  if (!alreadyLoaded) {
    currentIndex = index;
    saveIndex(currentIndex);
    setTrackSource(track, { waitForMetadata: false });
    // Request playback inside the user's gesture, before awaiting metadata (iOS).
    void tryPlayCurrentTrack();
  }
  try {
    await waitForSeekable(player);
    // A different track may have been selected while this file was loading.
    if (currentTrackId !== track.id || getCurrentTrack()?.id !== track.id) return;
    if (!Number.isFinite(player.duration) || player.duration <= 0) return;
    player.currentTime = Math.min(1, Math.max(0, ratio)) * player.duration;
    savePlaybackState();
    updateSeekControls();
  } catch (error) {
    console.warn('[bgm] seek failed:', error);
  }
}

async function togglePlayPause() {
  const player = ensureAudio();

  if (!playlist.length) return;

  if (isPlaying && !player.paused) {
    pauseTrack();
    return;
  }

  await tryPlayCurrentTrack();
}

function applyPlaylistOrder() {
  const playingId = playlist[currentIndex]?.id;
  playlist = sortByItemOrder(playlist, getItemOrder(authenticatedUserId, 'bgm'));
  currentIndex = Math.max(0, playlist.findIndex(track => track.id === playingId));
  // Only reorder the list; do not reload audio or reset playback time.
  saveIndex(currentIndex);
  renderPlaylist();
}

function openPanel() {
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  if (!btn || !panel) return;

  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  panelOpen = true;
  revealCurrentTrack({ force: true });
  const userId = authenticatedUserId;
  if (userId) loadItemOrder(userId, 'bgm').then(() => {
    if (authenticatedUserId === userId) {
      applyPlaylistOrder();
      revealCurrentTrack({ force: true });
    }
  });
}

function closePanel() {
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  if (!btn || !panel) return;

  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  panelOpen = false;
}

function bindBgmSettingsQuickLink() {
  const link = document.querySelector('.bgm-panel__quick-link');
  if (!link || link.dataset.bgmSettingsBound === 'true') return;

  link.dataset.bgmSettingsBound = 'true';

  try {
    const url = new URL(
      link.getAttribute('href') || './inventory.html',
      window.location.href,
    );
    url.hash = 'bgm-inventory';
    link.href = url.href;
  } catch (error) {
    console.warn('[bgm] failed to normalize settings link:', error);
    link.setAttribute('href', './inventory.html#bgm-inventory');
  }

  link.addEventListener('click', () => {
    closePanel();
  });
}

function bindRetryOnUserGesture() {
  if (retryBinded) return;
  retryBinded = true;

  const retry = () => {
    if (!playBlocked) return;
    if (!hasAuthenticatedUser()) return;
    if (externalPlaybackSession) return;

    tryPlayCurrentTrack().catch((error) => {
      console.error('[bgm] retry play failed:', error);
    });
  };

  ['click', 'touchstart', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, retry, { passive: true });
  });
}

function bindPageLifecycleSave() {
  if (lifecycleBinded) return;
  lifecycleBinded = true;

  const persist = () => {
    savePlaybackState();
  };

  window.addEventListener('pagehide', persist);
  window.addEventListener('beforeunload', persist);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      persist();
    }
  });
}

function bindSelectionWatcher() {
  if (selectionWatcherBinded) return;
  selectionWatcherBinded = true;
  window.addEventListener('mallin:item-order-changed', event => {
    if (event.detail?.userId !== authenticatedUserId || event.detail?.type !== 'bgm') return;
    applyPlaylistOrder();
  });


  window.addEventListener('bgm-selection-changed', async () => {
    const user = await getSessionUser();
    if (!user) return;

    const shouldKeepPlaying = Boolean(isPlaying && audio && !audio.paused);
    await syncPlaylistWithSelection({ autoPlay: shouldKeepPlaying });
  });
}

function bindStorePreviewWatcher() {
  if (storePreviewWatcherBinded) return;
  storePreviewWatcherBinded = true;

  window.addEventListener(STORE_BGM_PREVIEW_EVENT, async (event) => {
    const state = String(event?.detail?.state || '').trim();
    const player = ensureAudio();

    if (state === 'start') {
      if (storePreviewResumeState) return;

      const track = getCurrentTrack();
      const shouldResume = Boolean(track && isPlaying && !player.paused);

      storePreviewResumeState = {
        shouldResume,
        trackId: track?.id || '',
        index: currentIndex,
        currentTime:
          Number.isFinite(player.currentTime) && player.currentTime > 0
            ? player.currentTime
            : 0,
      };

      if (shouldResume) {
        pauseTrack();

        try {
          if (storePreviewResumeState.currentTime > 0) {
            player.currentTime = storePreviewResumeState.currentTime;
          }
        } catch (error) {
          console.warn(
            '[bgm] failed to keep currentTime on preview start:',
            error,
          );
        }

        savePlaybackState();
      }

      return;
    }

    if (state === 'stop') {
      const resumeState = storePreviewResumeState;
      storePreviewResumeState = null;

      if (!resumeState?.shouldResume) return;

      const user = await getSessionUser();
      if (!user) return;

      if (!playlist.length) {
        await syncPlaylistWithSelection({ autoPlay: false });
      }

      let nextIndex = Number.isFinite(resumeState.index)
        ? resumeState.index
        : currentIndex;

      if (resumeState.trackId) {
        const matchedIndex = playlist.findIndex(
          (track) => track.id === resumeState.trackId,
        );
        if (matchedIndex >= 0) {
          nextIndex = matchedIndex;
        }
      }

      if (nextIndex < 0 || nextIndex >= playlist.length) {
        nextIndex = 0;
      }

      await playTrack(nextIndex, {
        startTime: Math.max(0, Number(resumeState.currentTime) || 0),
        autoPlay: true,
      });
    }
  });
}

export async function initBgmPlayer() {
  const menu = $('bgmMenu');
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  const list = $('bgmList');
  const toggleBtn = $('bgmPlayToggleBtn');

  if (!menu || !btn || !panel || !list || !toggleBtn) return;

  // Inject SVG only after the header partial is fetched: Live Server otherwise
  // injects its reload script at every </svg> and truncates the response body.
  for (const [id, icon] of [['bgmModeBtn', playbackMode], ['bgmPreviousBtn', 'previous'], ['bgmPlayToggleBtn', 'play'], ['bgmNextBtn', 'next']]) {
    const control = $(id);
    if (control) control.innerHTML = renderPlaybackIcon(icon);
  }

  bindBgmSettingsQuickLink();

  bindRetryOnUserGesture();
  bindReloadResumeNoticeDismiss();
  bindPageLifecycleSave();
  bindPanelGlobalEvents();
  bindAuthWatcher();
  bindSelectionWatcher();
  bindStorePreviewWatcher();

  const user = await getSessionUser();
  setAuthenticatedUser(user);

  if (!user) {
    setAuthenticatedUser(null);
    stopAndResetPlayback();
    closePanel();
    renderLoginRequiredState();

    btn.onclick = (event) => {
      event.preventDefault();
      moveToLoginForBgm();
    };

    toggleBtn.onclick = (event) => {
      event.preventDefault();
      moveToLoginForBgm();
    };

    list.onclick = (event) => {
      event.preventDefault();
      moveToLoginForBgm();
    };

    return;
  }

  toggleBtn.disabled = false;

  try {
    await hydrateBgmPreferencesFromRemote(user.id);
  } catch (error) {
    console.error('[bgm] hydrate remote preferences failed:', error);
  }

  await syncPlaylistWithSelection({ autoPlay: false });

  if (!playlist.length) {
    setPanelDesc('등록된 배경음악이 없어.');
    renderPlaylist();
    return;
  }

  btn.onclick = () => {
    if (panel.hidden) {
      openPanel();
      return;
    }

    closePanel();
  };

  toggleBtn.onclick = async () => {
    await togglePlayPause();
  };

  const modeButton = $('bgmModeBtn');
  if (modeButton) modeButton.onclick = togglePlaybackMode;
  const previousButton = $('bgmPreviousBtn');
  if (previousButton) previousButton.onclick = () => playAdjacentTrack(-1);
  const nextButton = $('bgmNextBtn');
  if (nextButton) nextButton.onclick = playNextTrack;

  list.onpointerdown = (event) => {
    scrubbingSeek = event.target.closest('[data-bgm-seek]');
  };
  const releaseSeek = () => { scrubbingSeek = null; };
  list.onpointerup = releaseSeek;
  list.onpointercancel = releaseSeek;
  list.onkeydown = (event) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
      scrubbingSeek = event.target.closest('[data-bgm-seek]');
    }
  };
  list.onkeyup = releaseSeek;
  list.oninput = (event) => {
    const input = event.target.closest('[data-bgm-seek]');
    if (input) previewSeek(input);
  };
  list.onchange = async (event) => {
    const input = event.target.closest('[data-bgm-seek]');
    if (input) await seekTrack(Number(input.dataset.bgmSeek), Number(input.value) / 1000);
  };
  list.addEventListener('focusout', () => {
    releaseSeek();
    updateSeekControls();
  });

  list.onclick = async (event) => {
    const actionBtn = event.target.closest('[data-bgm-index]');
    if (!actionBtn) return;

    const index = Number(actionBtn.dataset.bgmIndex || 0);
    await handleTrackAction(index);
  };

  currentIndex = getPreferredIndex();
  if (currentIndex < 0 || currentIndex >= playlist.length) {
    currentIndex = 0;
  }

  saveIndex(currentIndex);
  renderPlaylist();
  updatePanelDesc();

  const savedState = getSavedPlaybackState();

  if (shouldUseReloadResumeFlow(savedState)) {
    showReloadResumeNotice();
    return;
  }

  removeReloadResumeNotice();
}
