import { supabase } from './supabase-client.js';
import {
  getLocalSelectedBgmTrackIds,
  hydrateBgmPreferencesFromRemote,
  saveRemoteBgmPreferences,
} from './bgm-preferences.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { getCurrentSession, showLoginRequiredPopup } = await import(
  `./auth-store.js?v=${MODULE_VERSION}`
);

const { BGM_CATALOG } = await import(`./store-data.js?v=${MODULE_VERSION}`);

const BGM_STORAGE_KEY = 'mallin_bgm_selected_v1';
const BGM_TRACK_ID_STORAGE_KEY = 'mallin_bgm_selected_track_id_v1';
const BGM_TRACK_IDS_STORAGE_KEY = 'mallin_bgm_selected_track_ids_v1';
const BGM_STATE_STORAGE_KEY = 'mallin_bgm_play_state_v3';
const BGM_STATE_STORAGE_LEGACY_KEY = 'mallin_bgm_play_state_v2';
const STORE_BGM_PREVIEW_EVENT = 'mallin:store-bgm-preview';
const BGM_RELOAD_NOTICE_ID = 'bgmReloadResumeNotice';
const BGM_WELCOME_POPUP_ID = 'bgmWelcomePopup';

let audio = null;
let playlist = [];
let currentIndex = 0;
let panelOpen = false;
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

function bindReloadResumeNoticeDismiss() {
  const dismiss = () => {
    removeReloadResumeNotice();
  };

  ['click', 'touchstart', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, dismiss, { passive: true });
  });
}

function getBasePath() {
  return String(document.body?.dataset?.base || './').trim() || './';
}

function getWelcomePopup() {
  return document.getElementById(BGM_WELCOME_POPUP_ID);
}

function closeWelcomePopup() {
  const popup = getWelcomePopup();
  if (!popup) return;

  const onKeydown = popup._onKeydown;
  if (onKeydown) {
    document.removeEventListener('keydown', onKeydown);
  }

  popup.remove();
}

async function playAfterWelcomeGesture() {
  if (!hasAuthenticatedUser()) return;

  const restored = await restorePlaybackPosition();
  if (restored) return;

  if (!playlist.length) {
    await syncPlaylistWithSelection({ autoPlay: false });
  }

  if (!playlist.length) {
    updatePanelDesc();
    renderPlaylist();
    return;
  }

  await playTrack(currentIndex, { startTime: 0, autoPlay: true });
}

function showWelcomePopup() {
  if (!hasAuthenticatedUser()) return;
  if (isPlaying && audio && !audio.paused) return;
  if (getWelcomePopup()) return;

  const base = getBasePath();

  const overlay = document.createElement('div');
  overlay.id = BGM_WELCOME_POPUP_ID;
  overlay.className = 'bgm-welcome-popup';
  overlay.innerHTML = `
    <div class="bgm-welcome-popup__backdrop"></div>
    <button
      type="button"
      class="bgm-welcome-popup__panel"
      aria-label="말린오이닷컴 환영 팝업 닫기"
    >
      <img
        class="bgm-welcome-popup__image"
        src="${base}images/emoticons/heart-4.png"
        alt="하트 이모티콘"
      />
      <strong class="bgm-welcome-popup__title">말린오이닷컴에 온 걸 환영해!</strong>
      <p class="bgm-welcome-popup__desc">팝업을 누르면 배경음악이 재생돼.</p>
      <span class="bgm-welcome-popup__hint">화면 클릭 / 터치</span>
    </button>
  `;

  document.body.appendChild(overlay);

  const panel = overlay.querySelector('.bgm-welcome-popup__panel');
  const backdrop = overlay.querySelector('.bgm-welcome-popup__backdrop');

  const dismissAndPlay = async () => {
    try {
      await playAfterWelcomeGesture();
    } catch (error) {
      console.error('[bgm] welcome popup play failed:', error);
    } finally {
      closeWelcomePopup();
    }
  };

  panel?.addEventListener('click', () => {
    dismissAndPlay();
  });

  backdrop?.addEventListener('click', () => {
    dismissAndPlay();
  });

  const onKeydown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      dismissAndPlay();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      dismissAndPlay();
    }
  };

  overlay._onKeydown = onKeydown;
  document.addEventListener('keydown', onKeydown);

  requestAnimationFrame(() => {
    overlay.classList.add('is-open');
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

  try {
    const payload = {
      trackId: track?.id || '',
      index: currentIndex,
      currentTime:
        player && Number.isFinite(player.currentTime) ? player.currentTime : 0,
      wasPlaying: Boolean(isPlaying && player && !player.paused),
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
    if (menu?.contains(event.target)) return;

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

      if (!getWelcomePopup() && (!audio || audio.paused)) {
        showWelcomePopup();
      }

      return;
    }

    closeWelcomePopup();
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

        if (!getWelcomePopup() && (!audio || audio.paused)) {
          showWelcomePopup();
        }

        return;
      }

      closeWelcomePopup();
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
    isPlaying = true;
    scheduleSavePlaybackState();
    renderPlaylist();
    updatePanelDesc();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    scheduleSavePlaybackState();
    renderPlaylist();
    updatePanelDesc();
  });

  audio.addEventListener('timeupdate', () => {
    scheduleSavePlaybackState();
  });

  audio.addEventListener('loadedmetadata', () => {
    scheduleSavePlaybackState();
  });

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

function updatePanelDesc() {
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
      const stateText =
        isActive && isPlaying ? '재생 중' : isActive ? '선택됨' : '대기 중';

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
            <p class="bgm-item__meta">${escapeHtml(track.artist || '말린오이닷컴')}</p>
            <span class="bgm-item__state">${stateText}</span>
          </div>

          <button
            type="button"
            class="bgm-item__action"
            data-bgm-index="${index}"
          >
            ${isActive && isPlaying ? '일시정지' : '재생'}
          </button>
        </div>
      `;
    })
    .join('');
}

async function loadOwnedBgmList() {
  const user = await getSessionUser();
  if (!user?.id) return [];

  const { data, error } = await supabase
    .from('user_store_items')
    .select('item_id')
    .eq('user_id', user.id);

  const selectedTrackIds = getSavedSelectedTrackIds();

  if (error) {
    console.error('[bgm] load owned bgm failed:', error);

    return BGM_CATALOG.filter(
      (item) =>
        item.isDefault && selectedTrackIds.has(String(item?.id || '').trim()),
    );
  }

  const ownedStoreIds = new Set(
    (data || []).map((row) => String(row?.item_id || '').trim()),
  );

  return [...BGM_CATALOG]
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
    );
}

function waitForSeekable(player) {
  return new Promise((resolve) => {
    if (player.readyState >= 1) {
      resolve();
      return;
    }

    const onReady = () => {
      player.removeEventListener('loadedmetadata', onReady);
      resolve();
    };

    player.addEventListener('loadedmetadata', onReady, { once: true });
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

async function setTrackSource(track) {
  const player = ensureAudio();
  if (!track) return;

  const nextTrackId = String(track.id || '');

  if (currentTrackId === nextTrackId && player.src) return;

  currentTrackId = nextTrackId;
  player.src = track.audioPath;
  player.load();

  await waitForSeekable(player);
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

  await setTrackSource(track);

  try {
    await tryAutoplayWithMutedBootstrap(player);
    isPlaying = true;
    playBlocked = false;
    removeReloadResumeNotice();
  } catch (error) {
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

  await setTrackSource(track);

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
  const player = ensureAudio();
  player.pause();
  isPlaying = false;
  savePlaybackState();
  updatePanelDesc();
  renderPlaylist();
}

async function playNextTrack() {
  if (!playlist.length) return;

  const nextIndex = (currentIndex + 1) % playlist.length;
  currentIndex = nextIndex;
  saveIndex(currentIndex);

  clearSavedPlaybackState();
  await playTrack(nextIndex, { startTime: 0, autoPlay: true });
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

function openPanel() {
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  if (!btn || !panel) return;

  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  panelOpen = true;
}

function closePanel() {
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  if (!btn || !panel) return;

  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
  panelOpen = false;
}

function bindRetryOnUserGesture() {
  if (retryBinded) return;
  retryBinded = true;

  const retry = () => {
    if (!playBlocked) return;
    if (!hasAuthenticatedUser()) return;

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

  window.addEventListener('pageshow', () => {
    if (!playBlocked) return;
    if (!hasAuthenticatedUser()) return;

    tryPlayCurrentTrack().catch((error) => {
      console.error('[bgm] pageshow retry failed:', error);
    });
  });
}

function bindSelectionWatcher() {
  if (selectionWatcherBinded) return;
  selectionWatcherBinded = true;

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

  list.onclick = async (event) => {
    const actionBtn = event.target.closest('[data-bgm-index]');
    if (!actionBtn) return;

    const index = Number(actionBtn.dataset.bgmIndex || 0);
    const isSameTrack = index === currentIndex;

    if (isSameTrack && isPlaying) {
      pauseTrack();
      return;
    }

    await playTrack(index, { startTime: 0, autoPlay: true });
  };

  currentIndex = getPreferredIndex();
  if (currentIndex < 0 || currentIndex >= playlist.length) {
    currentIndex = 0;
  }

  saveIndex(currentIndex);
  renderPlaylist();
  updatePanelDesc();
  removeReloadResumeNotice();
  showWelcomePopup();
}
