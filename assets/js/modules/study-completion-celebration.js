export const STUDY_COMPLETION_IMAGE_PATH =
  './images/calendar/study-completion-celebration.png';
export const STUDY_COMPLETION_AUDIO_PATH = './assets/mp3/mallinoi-reward.mp3';
export const STUDY_COMPLETION_PARTICLE_LIMIT = 18;

const PARTICLES = ['🎉', '🎊', '✨', '⭐', '💚'];

function stopAudio(audio) {
  if (!audio) return;
  audio.pause?.();
  try {
    audio.currentTime = 0;
  } catch {
    // 메타데이터가 준비되기 전 currentTime 변경 실패는 무시한다.
  }
}

export function createStudyCompletionCelebration({
  documentRef = document,
  windowRef = window,
  soundFactory = () => new Audio(),
  pathResolver = (path) => new URL(path, documentRef.baseURI).href,
  pauseBgm = () => null,
  restoreBgm = async () => false,
  shouldPlaySound = async () => true,
  beginAudioSession = async () => false,
  endAudioSession = async () => false,
  imagePath = STUDY_COMPLETION_IMAGE_PATH,
  audioPath = STUDY_COMPLETION_AUDIO_PATH,
  durationMs = 3000,
  audioEndFallbackMs = 10000,
  particleLimit = STUDY_COMPLETION_PARTICLE_LIMIT,
} = {}) {
  let overlay = null;
  let cleanupTimer = 0;
  let audio = null;
  let bgmHandle = null;
  let nativeAudioSessionActive = false;
  let pendingAudioRelease = Promise.resolve();
  let destroyed = false;
  let runSequence = 0;
  let activePlaybackSequence = 0;

  function isReducedMotion() {
    return Boolean(
      windowRef?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches,
    );
  }

  function queueAudioRelease() {
    const handle = bgmHandle;
    const shouldEndAudioSession = nativeAudioSessionActive;
    bgmHandle = null;
    nativeAudioSessionActive = false;

    if (!handle && !shouldEndAudioSession) return pendingAudioRelease;

    pendingAudioRelease = pendingAudioRelease
      .catch(() => {})
      .then(async () => {
        if (shouldEndAudioSession) {
          try {
            await endAudioSession();
          } catch {
            // 네이티브 오디오 세션 반납 실패도 일정 저장을 막지 않는다.
          }
        }

        if (handle) {
          try {
            await restoreBgm(handle);
          } catch {
            // 사이트 BGM 복원 실패는 일정 저장 결과에 영향을 주지 않는다.
          }
        }
      });

    return pendingAudioRelease;
  }

  function clearTimer() {
    if (!cleanupTimer) return;
    windowRef.clearTimeout(cleanupTimer);
    cleanupTimer = 0;
  }

  function scheduleCleanup(sequence, delayMs) {
    if (
      destroyed ||
      sequence !== runSequence ||
      !overlay?.isConnected
    ) return;
    clearTimer();
    cleanupTimer = windowRef.setTimeout(() => {
      if (sequence !== runSequence) return;
      cleanupTimer = 0;
      cleanup();
    }, Math.max(0, Number(delayMs) || 0));
  }

  function removeOverlay() {
    clearTimer();
    overlay?.remove?.();
    overlay = null;
  }

  function stopPlayback() {
    activePlaybackSequence = 0;
    stopAudio(audio);
    void queueAudioRelease();
  }

  function cleanup() {
    removeOverlay();
    stopPlayback();
  }

  function ensureAudio() {
    if (audio) return audio;
    audio = soundFactory();
    audio.preload = 'auto';
    audio.playsInline = true;
    audio.loop = false;
    audio.src = pathResolver(audioPath);
    audio.addEventListener?.('ended', () => {
      const sequence = activePlaybackSequence;
      activePlaybackSequence = 0;
      if (sequence && sequence === runSequence && !destroyed) {
        cleanup();
        return;
      }
      void queueAudioRelease();
    });
    audio.addEventListener?.('error', () => {
      const sequence = activePlaybackSequence;
      activePlaybackSequence = 0;
      void queueAudioRelease();
      scheduleCleanup(sequence, durationMs);
    });
    return audio;
  }

  function prepare() {
    if (destroyed) return false;
    try {
      ensureAudio().load?.();
      return true;
    } catch {
      return false;
    }
  }

  async function playSound(sequence) {
    await pendingAudioRelease.catch(() => {});
    if (destroyed || sequence !== runSequence) return false;

    let soundAllowed = false;
    try {
      soundAllowed = Boolean(await shouldPlaySound());
    } catch {
      soundAllowed = false;
    }

    if (destroyed || sequence !== runSequence || !soundAllowed) return false;

    const player = ensureAudio();
    stopAudio(player);
    player.src = pathResolver(audioPath);
    try {
      player.load?.();
    } catch {
      // 일부 WebView에서는 명시적 load가 없어도 play가 가능하다.
    }

    bgmHandle = pauseBgm('study-completion-celebration');

    try {
      nativeAudioSessionActive = Boolean(await beginAudioSession());
    } catch {
      nativeAudioSessionActive = false;
    }

    if (destroyed || sequence !== runSequence) {
      stopAudio(player);
      await queueAudioRelease();
      return false;
    }

    activePlaybackSequence = sequence;

    try {
      await player.play();
      if (destroyed || sequence !== runSequence) {
        activePlaybackSequence = 0;
        stopAudio(player);
        await queueAudioRelease();
        return false;
      }
      return true;
    } catch {
      if (activePlaybackSequence === sequence) activePlaybackSequence = 0;
      await queueAudioRelease();
      return false;
    }
  }

  function createOverlay(reducedMotion) {
    const root = documentRef.createElement('div');
    root.className = 'study-completion-celebration';
    root.dataset.reducedMotion = reducedMotion ? 'true' : 'false';

    const image = documentRef.createElement('img');
    image.className = 'study-completion-celebration__image';
    image.src = pathResolver(imagePath);
    image.alt = '';
    image.setAttribute('aria-hidden', 'true');
    image.decoding = 'async';

    const particleCount = Math.min(
      STUDY_COMPLETION_PARTICLE_LIMIT,
      Math.max(0, Number(particleLimit) || 0),
      reducedMotion ? 6 : STUDY_COMPLETION_PARTICLE_LIMIT,
    );
    const particles = documentRef.createElement('div');
    particles.className = 'study-completion-celebration__particles';
    particles.setAttribute('aria-hidden', 'true');

    for (let index = 0; index < particleCount; index += 1) {
      const particle = documentRef.createElement('span');
      const angle = (Math.PI * 2 * index) / Math.max(1, particleCount);
      const distanceX = 24 + (index % 4) * 5;
      const distanceY = 18 + (index % 3) * 5;
      particle.className = 'study-completion-celebration__particle';
      particle.textContent = PARTICLES[index % PARTICLES.length];
      particle.style.setProperty(
        '--celebration-x',
        `${Math.round(Math.cos(angle) * distanceX)}vw`,
      );
      particle.style.setProperty(
        '--celebration-y',
        `${Math.round(Math.sin(angle) * distanceY)}vh`,
      );
      particle.style.setProperty(
        '--celebration-rotate',
        `${(index % 2 === 0 ? 1 : -1) * (80 + index * 19)}deg`,
      );
      particle.style.setProperty(
        '--celebration-delay',
        `${(index % 6) * 35}ms`,
      );
      particles.append(particle);
    }

    const status = documentRef.createElement('p');
    status.className = 'study-completion-celebration__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.textContent = '일정 완료! 잘했어!';

    root.append(image, particles, status);
    return root;
  }

  function celebrate() {
    if (destroyed || !documentRef.body) return false;

    runSequence += 1;
    const sequence = runSequence;
    cleanup();
    const reducedMotion = isReducedMotion();
    overlay = createOverlay(reducedMotion);
    documentRef.body.append(overlay);

    scheduleCleanup(sequence, audioEndFallbackMs);
    void playSound(sequence)
      .then((started) => {
        if (!started) scheduleCleanup(sequence, durationMs);
      })
      .catch(() => {
        scheduleCleanup(sequence, durationMs);
      });
    return true;
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    runSequence += 1;
    cleanup();
    audio = null;
  }

  return {
    celebrate,
    cleanup,
    destroy,
    prepare,
    getState: () => ({
      active: Boolean(overlay?.isConnected),
      destroyed,
      particleCount: overlay?.querySelectorAll?.(
        '.study-completion-celebration__particle',
      )?.length || 0,
    }),
  };
}
