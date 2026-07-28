import { supabase } from './supabase-client.js';
import { getCurrentUser, resolveSitePath } from './auth-store.js';
import { playPickleBurst } from './pickle-burst.js';
import {
  pauseBgmForExternalAudio,
  restoreBgmAfterExternalAudio,
} from './bgm-player.js';
import {
  CAREER_AWARD_IMAGES,
  formatCareerAwardMonth,
  sortCareerAwards,
} from './career-award-rules.js';

const POPUP_ID = 'careerAwardPopup';
const AUDIO_PATH = './assets/mp3/mallinoi-reward.mp3';
const COMPLETE_EVENT = 'mallin:career-awards-complete';
const ERROR_MESSAGE = '확인 처리에 실패했어. 잠시 후 다시 눌러줘.';

let defaultController = null;
let defaultInitPromise = null;

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function removeGlobalPopup() {
  document.getElementById(POPUP_ID)?.remove();
  if (!document.querySelector('.attendance-popup')) {
    document.documentElement.classList.remove('attendance-popup-open');
    document.body.classList.remove('attendance-popup-open');
  }
}

function createPopupElements(award) {
  removeGlobalPopup();

  const month = formatCareerAwardMonth(award.awardMonth);
  const root = document.createElement('div');
  root.id = POPUP_ID;
  root.className = 'attendance-popup career-award-popup';
  root.innerHTML = `
    <div class="attendance-popup__backdrop" aria-hidden="true"></div>
    <div class="attendance-popup__dialog">
      <section
        class="attendance-popup__content career-award-popup__content"
        role="dialog"
        aria-modal="true"
        aria-labelledby="careerAwardTitle"
        aria-describedby="careerAwardDescription careerAwardStatus"
      >
        <img class="attendance-popup__image career-award-popup__image" alt="" />
        <p class="career-award-popup__month"></p>
        <h2 class="attendance-popup__title" id="careerAwardTitle"></h2>
        <p class="attendance-popup__desc" id="careerAwardDescription">
          <strong class="career-award-popup__reward"></strong>을 받았어요!
        </p>
        <p
          class="career-award-popup__status"
          id="careerAwardStatus"
          role="status"
          aria-live="polite"
        ></p>
        <div class="attendance-popup__actions">
          <button
            type="button"
            class="attendance-popup__btn attendance-popup__btn--primary"
            data-career-award-claim
          >수령</button>
        </div>
      </section>
    </div>
  `;

  const imageEl = root.querySelector('.career-award-popup__image');
  const monthEl = root.querySelector('.career-award-popup__month');
  const titleEl = root.querySelector('#careerAwardTitle');
  const rewardEl = root.querySelector('.career-award-popup__reward');
  const statusEl = root.querySelector('#careerAwardStatus');
  const claimBtn = root.querySelector('[data-career-award-claim]');

  imageEl.src = resolveSitePath(CAREER_AWARD_IMAGES[award.rank]);
  imageEl.alt = `매달 베스트 이력 ${award.rank}위 시상 이미지`;
  imageEl.addEventListener('error', () => {
    imageEl.hidden = true;
  }, { once: true });
  monthEl.textContent = month.label;
  titleEl.textContent = `매달 베스트 이력 ${award.rank}위`;
  rewardEl.textContent = `${award.rewardAmount.toLocaleString('ko-KR')}피클`;

  document.body.appendChild(root);
  document.documentElement.classList.add('attendance-popup-open');
  document.body.classList.add('attendance-popup-open');

  return { root, claimBtn, statusEl };
}

function bindFocusPolicy(root, claimBtn) {
  const onKeyDown = (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      claimBtn.focus();
    }
  };

  root.addEventListener('keydown', onKeyDown);
  window.requestAnimationFrame(() => claimBtn.focus());

  return () => root.removeEventListener('keydown', onKeyDown);
}

export function createCareerAwardPopupController({
  supabaseClient = supabase,
  currentUserLoader = getCurrentUser,
  burstPlayer = playPickleBurst,
  soundFactory = () => new Audio(),
  pauseBgm = pauseBgmForExternalAudio,
  restoreBgm = restoreBgmAfterExternalAudio,
  onComplete = () => {
    window.dispatchEvent(new Event(COMPLETE_EVENT));
  },
} = {}) {
  let queue = [];
  let activeAward = null;
  let activePopup = null;
  let processing = false;
  let destroyed = false;
  let sound = null;
  let soundAwardKey = '';
  let pendingSoundKey = '';
  let soundAttemptKey = '';
  let soundAttemptPromise = null;
  let soundGestureCleanup = null;
  let externalBgmHandle = null;
  let focusCleanup = null;
  let previousFocus = null;

  function getAwardKey(award) {
    return `${award.awardMonth}:${award.rank}`;
  }

  async function releaseExternalBgm() {
    const handle = externalBgmHandle;
    externalBgmHandle = null;
    if (!handle) return;

    try {
      await restoreBgm(handle);
    } catch (error) {
      console.warn('[career-award-popup] BGM restore failed:', error);
    }
  }

  function clearSoundGestureRetry() {
    if (soundGestureCleanup) soundGestureCleanup();
    soundGestureCleanup = null;
  }

  function stopSound() {
    clearSoundGestureRetry();
    if (sound) {
      sound.pause();
      try {
        sound.currentTime = 0;
      } catch {
        // 메타데이터 로드 전 currentTime 변경 실패는 무시한다.
      }
    }
    pendingSoundKey = '';
    soundAttemptKey = '';
    soundAttemptPromise = null;
    releaseExternalBgm();
  }

  function tryPlaySound(award) {
    const awardKey = getAwardKey(award);
    if (destroyed || soundAwardKey === awardKey) {
      return Promise.resolve(true);
    }
    if (soundAttemptKey === awardKey && soundAttemptPromise) {
      return soundAttemptPromise;
    }

    soundAttemptKey = awardKey;
    soundAttemptPromise = (async () => {
      if (!sound) {
        sound = soundFactory();
        sound.preload = 'auto';
        sound.playsInline = true;
        sound.loop = false;
        sound.addEventListener('ended', () => {
          releaseExternalBgm();
        });
        sound.addEventListener('error', () => {
          releaseExternalBgm();
        });
      }

      sound.pause();
      try {
        sound.currentTime = 0;
      } catch {
        // 메타데이터 로드 전 currentTime 변경 실패는 무시한다.
      }
      sound.src = resolveSitePath(AUDIO_PATH);
      sound.load();
      externalBgmHandle = pauseBgm('career-award-popup');

      try {
        await sound.play();
        soundAwardKey = awardKey;
        pendingSoundKey = '';
        clearSoundGestureRetry();
        return true;
      } catch {
        pendingSoundKey = awardKey;
        await releaseExternalBgm();
        return false;
      }
    })().finally(() => {
      if (soundAttemptKey === awardKey) {
        soundAttemptKey = '';
        soundAttemptPromise = null;
      }
    });

    return soundAttemptPromise;
  }

  function armSoundGestureRetry(award) {
    const awardKey = getAwardKey(award);
    if (soundAwardKey === awardKey || soundGestureCleanup) return;

    const retry = () => {
      clearSoundGestureRetry();
      if (
        !activeAward ||
        getAwardKey(activeAward) !== awardKey ||
        pendingSoundKey !== awardKey
      ) {
        return;
      }
      tryPlaySound(activeAward).catch(() => {});
    };

    document.addEventListener('pointerdown', retry, {
      capture: true,
      once: true,
    });
    document.addEventListener('keydown', retry, {
      capture: true,
      once: true,
    });
    soundGestureCleanup = () => {
      document.removeEventListener('pointerdown', retry, true);
      document.removeEventListener('keydown', retry, true);
    };
  }

  function removePopup({ restoreFocus = false } = {}) {
    focusCleanup?.();
    focusCleanup = null;
    activePopup?.root.remove();
    activePopup = null;

    if (!document.querySelector('.attendance-popup')) {
      document.documentElement.classList.remove('attendance-popup-open');
      document.body.classList.remove('attendance-popup-open');
    }

    if (restoreFocus && previousFocus?.isConnected) {
      previousFocus.focus();
    }
  }

  async function acknowledgeAward(award) {
    const { data, error } = await supabaseClient.rpc(
      'acknowledge_my_career_award',
      {
        p_award_month: award.awardMonth,
        p_rank: award.rank,
      },
    );

    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.ok) {
      throw new Error(result?.message || ERROR_MESSAGE);
    }
    return result;
  }

  async function showNext() {
    if (destroyed || activeAward || processing) return;

    const nextAward = queue[0] || null;
    if (!nextAward) {
      removePopup({ restoreFocus: true });
      stopSound();
      onComplete();
      return;
    }

    activeAward = nextAward;
    previousFocus ||= document.activeElement;
    activePopup = createPopupElements(nextAward);
    focusCleanup = bindFocusPolicy(
      activePopup.root,
      activePopup.claimBtn,
    );

    const soundPlayed = await tryPlaySound(nextAward);
    if (!soundPlayed) armSoundGestureRetry(nextAward);

    activePopup.claimBtn.addEventListener('click', async () => {
      if (processing || !activeAward) return;

      processing = true;
      const claimBtn = activePopup.claimBtn;
      const statusEl = activePopup.statusEl;
      claimBtn.disabled = true;
      claimBtn.textContent = '확인 중...';
      statusEl.textContent = '';
      const soundStartPromise = tryPlaySound(activeAward);

      burstPlayer({
        originEl: claimBtn,
        count: isReducedMotion() ? 4 : 16,
      });

      try {
        await acknowledgeAward(activeAward);
      } catch (error) {
        console.warn('[career-award-popup] acknowledge failed:', error);
        statusEl.textContent = error?.message || ERROR_MESSAGE;
        claimBtn.disabled = false;
        claimBtn.textContent = '다시 수령';
        processing = false;
        return;
      }

      await Promise.all([
        delay(isReducedMotion() ? 100 : 550),
        Promise.race([
          soundStartPromise,
          delay(isReducedMotion() ? 150 : 900),
        ]),
      ]);
      queue.shift();
      activeAward = null;
      processing = false;
      removePopup();
      window.dispatchEvent(new Event('pickle-balance-changed'));
      await showNext();
    });
  }

  async function init() {
    if (destroyed) return;
    const user = await currentUserLoader();
    if (!user?.id) {
      queue = [];
      activeAward = null;
      removePopup();
      onComplete();
      return;
    }

    const { data, error } = await supabaseClient.rpc(
      'get_my_pending_career_awards',
    );
    if (error) throw error;

    queue = sortCareerAwards(data || []);
    await showNext();
  }

  function destroy() {
    destroyed = true;
    queue = [];
    activeAward = null;
    processing = false;
    removePopup({ restoreFocus: true });
    stopSound();
  }

  return {
    init,
    destroy,
    getState: () => ({
      queue: [...queue],
      activeAward,
      processing,
    }),
  };
}

export async function initCareerAwardPopup() {
  if (defaultInitPromise) return defaultInitPromise;

  defaultController ||= createCareerAwardPopupController();
  defaultInitPromise = defaultController.init().catch((error) => {
    defaultInitPromise = null;
    console.error('[career-award-popup] initialization failed:', error);
    removeGlobalPopup();
    window.dispatchEvent(new Event(COMPLETE_EVENT));
  });
  return defaultInitPromise;
}
