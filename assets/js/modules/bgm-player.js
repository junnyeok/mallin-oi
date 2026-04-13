import { withAssetVersion } from './site-version.js';
import { resolveSitePath } from './auth-store.js';

const BGM_STORAGE_KEY = 'mallin_bgm_selected_v1';

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

function ensureAudio() {
  if (audio) return audio;

  audio = new Audio();
  audio.preload = 'auto';
  audio.volume = 1;

  audio.addEventListener('play', () => {
    isPlaying = true;
    renderPlaylist();
    updatePanelDesc();
  });

  audio.addEventListener('pause', () => {
    isPlaying = false;
    renderPlaylist();
    updatePanelDesc();
  });

  audio.addEventListener('ended', () => {
    playNextTrack().catch((error) => {
      console.error('[bgm] next track failed:', error);
    });
  });

  audio.addEventListener('error', () => {
    isPlaying = false;
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

async function tryPlayCurrentTrack() {
  const player = ensureAudio();
  const track = getCurrentTrack();

  if (!track) {
    isPlaying = false;
    playBlocked = false;
    updatePanelDesc();
    renderPlaylist();
    return;
  }

  if (player.src !== track.audioPath) {
    player.src = track.audioPath;
  }

  try {
    await player.play();
    isPlaying = true;
    playBlocked = false;
  } catch (error) {
    isPlaying = false;
    playBlocked = true;
    console.warn('[bgm] autoplay blocked or failed:', error);
  }

  updatePanelDesc();
  renderPlaylist();
}

async function playTrack(index = 0) {
  if (!playlist.length) return;

  const safeIndex =
    index >= 0 && index < playlist.length ? index : Math.max(0, currentIndex);

  currentIndex = safeIndex;
  saveIndex(currentIndex);

  await tryPlayCurrentTrack();
}

function pauseTrack() {
  const player = ensureAudio();
  player.pause();
  isPlaying = false;
  updatePanelDesc();
  renderPlaylist();
}

async function playNextTrack() {
  if (!playlist.length) return;

  const nextIndex = (currentIndex + 1) % playlist.length;
  currentIndex = nextIndex;
  saveIndex(currentIndex);

  await tryPlayCurrentTrack();
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
  const retry = async () => {
    if (!playBlocked) return;

    try {
      await tryPlayCurrentTrack();
    } catch (error) {
      console.error('[bgm] retry play failed:', error);
    }
  };

  ['click', 'touchstart', 'keydown'].forEach((eventName) => {
    document.addEventListener(eventName, retry, { passive: true });
  });
}

export async function initBgmPlayer() {
  const menu = $('bgmMenu');
  const btn = $('bgmBtn');
  const panel = $('bgmPanel');
  const list = $('bgmList');
  const toggleBtn = $('bgmPlayToggleBtn');

  if (!menu || !btn || !panel || !list || !toggleBtn) return;

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
  bindRetryOnUserGesture();

  btn.addEventListener('click', () => {
    if (panel.hidden) {
      openPanel();
      return;
    }

    closePanel();
  });

  toggleBtn.addEventListener('click', async () => {
    await togglePlayPause();
  });

  list.addEventListener('click', async (event) => {
    const actionBtn = event.target.closest('[data-bgm-index]');
    if (!actionBtn) return;

    const index = Number(actionBtn.dataset.bgmIndex || 0);
    const isSameTrack = index === currentIndex;

    if (isSameTrack && isPlaying) {
      pauseTrack();
      return;
    }

    await playTrack(index);
  });

  document.addEventListener('click', (event) => {
    if (!panelOpen) return;
    if (menu.contains(event.target)) return;
    closePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePanel();
    }
  });

  await tryPlayCurrentTrack();
}
