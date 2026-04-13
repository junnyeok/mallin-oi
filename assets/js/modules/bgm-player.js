import { supabase } from './supabase-client.js';
import { withAssetVersion } from './site-version.js';
import {
  getCurrentUser,
  loginHref,
  resolveSitePath,
  saveRedirect,
} from './auth-store.js';

const BGM_STORAGE_KEY = 'mallin_bgm_selected_v1';
const BGM_STATE_STORAGE_KEY = 'mallin_bgm_play_state_v2';

const BGM_CATALOG = [
  {
    id: 'mallin-oi-welcome',
    title: '말린오이닷컴 환영 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion(
      resolveSitePath('assets/mp3/mallin_oi_welcome.mp3'),
    ),
    coverPath: withAssetVersion(
      resolveSitePath('images/emoticons/heart-6.png'),
    ),
    isOwned: true,
  },
];

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

function getSavedIndex() {
  const raw = Number(localStorage.getItem(BGM_STORAGE_KEY) || 0);
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return raw;
}

function saveIndex(index) {
  localStorage.setItem(BGM_STORAGE_KEY, String(index));
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
    const raw = sessionStorage.getItem(BGM_STATE_STORAGE_KEY);
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
    sessionStorage.removeItem(BGM_STATE_STORAGE_KEY);
  } catch (error) {
    console.error('[bgm] failed to clear playback state:', error);
  }
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
  saveRedirect();
  window.location.href = loginHref();
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
    if (session?.user) return;

    stopAndResetPlayback();
    closePanel();
    renderLoginRequiredState();
  });

  window.addEventListener('auth-changed', async () => {
    const user = await getCurrentUser();

    if (user) return;

    stopAndResetPlayback();
    closePanel();
    renderLoginRequiredState();
  });
}

function ensureAudio() {
  if (audio) return audio;

  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 1;

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
    setPanelDesc('등록된 배경음악이 없어.');
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
    list.innerHTML = `<div class="bgm-empty">등록된 배경음악이 아직 없어.</div>`;
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
  // 나중에 상점/DB 연동할 때 여기서 구매한 BGM 목록을 합치면 됨
  return BGM_CATALOG.filter((item) => item.isOwned);
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
      await player.play();
      isPlaying = true;
      playBlocked = false;
    } catch (error) {
      isPlaying = false;
      playBlocked = true;
      console.warn('[bgm] autoplay blocked while restoring:', error);
    }
  }

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
    await player.play();
    isPlaying = true;
    playBlocked = false;
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

  const retry = async () => {
    if (!playBlocked) return;

    try {
      const user = await getCurrentUser();
      if (!user) return;

      await tryPlayCurrentTrack();
    } catch (error) {
      console.error('[bgm] retry play failed:', error);
    }
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

export async function initBgmPlayer() {
  const menu = $('bgmMenu');
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  const list = $('bgmList');
  const toggleBtn = $('bgmPlayToggleBtn');

  if (!menu || !btn || !panel || !list || !toggleBtn) return;

  bindRetryOnUserGesture();
  bindPageLifecycleSave();
  bindPanelGlobalEvents();
  bindAuthWatcher();

  const user = await getCurrentUser();

  if (!user) {
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

  playlist = await loadOwnedBgmList();

  if (!playlist.length) {
    setPanelDesc('등록된 배경음악이 없어.');
    renderPlaylist();
    return;
  }

  const savedIndex = getSavedIndex();
  currentIndex =
    savedIndex >= 0 && savedIndex < playlist.length ? savedIndex : 0;

  renderPlaylist();
  updatePanelDesc();

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

  const restored = await restorePlaybackPosition();

  if (!restored) {
    await tryPlayCurrentTrack();
  }
}
