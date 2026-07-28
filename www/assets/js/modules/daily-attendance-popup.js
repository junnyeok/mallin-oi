// assets/js/modules/daily-attendance-popup.js
import { supabase } from './supabase-client.js';
import { getCurrentUser, resolveSitePath } from './auth-store.js';
import { playPickleBurst } from './pickle-burst.js';

const POPUP_ID = 'dailyAttendancePopup';
const CAREER_AWARD_POPUP_ID = 'careerAwardPopup';
const CAREER_AWARD_COMPLETE_EVENT = 'mallin:career-awards-complete';
const ATTENDANCE_REWARD_AMOUNT = 10;
const WEEKLY_BONUS_AMOUNT = 50;
const DEFAULT_WEEK_DAYS = [
  { key: 'mon', label: '월', checked: false },
  { key: 'tue', label: '화', checked: false },
  { key: 'wed', label: '수', checked: false },
  { key: 'thu', label: '목', checked: false },
  { key: 'fri', label: '금', checked: false },
  { key: 'sat', label: '토', checked: false },
  { key: 'sun', label: '일', checked: false },
];

function getSeoulNow() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date());

  const map = {};
  parts.forEach((part) => {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  });

  return {
    todayKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour || 0),
  };
}

function normalizeWeekDays(days) {
  if (!Array.isArray(days) || days.length !== 7) {
    return DEFAULT_WEEK_DAYS;
  }

  return DEFAULT_WEEK_DAYS.map((fallback, index) => {
    const day = days[index] || {};
    return {
      key: String(day.key || fallback.key),
      label: String(day.label || fallback.label),
      checked: !!day.checked,
    };
  });
}

async function hasClaimedAttendanceToday(userId, todayKey) {
  const { count, error } = await supabase
    .from('pickle_ledger')
    .select('id', { head: true, count: 'exact' })
    .eq('user_id', userId)
    .eq('reason_code', 'attendance')
    .eq('awarded_on', todayKey);

  if (error) {
    console.error('[daily-attendance-popup] attendance check failed:', error);
    return true;
  }

  return Number(count || 0) > 0;
}

async function claimDailyAttendance() {
  const { data, error } = await supabase.rpc('claim_daily_attendance');

  if (error) {
    console.error(
      '[daily-attendance-popup] claim_daily_attendance error:',
      error,
    );
    return {
      ok: false,
      amount: 0,
      message: '출석 체크 처리 중 오류가 발생했어.',
      balance: null,
      weeklyBonusAwarded: false,
      weeklyBonusAlreadyAwarded: false,
      weeklyBonusAmount: 0,
      weekDays: DEFAULT_WEEK_DAYS,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    ok: !!row?.ok,
    amount: Number(row?.amount || 0),
    message: String(row?.message || '').trim(),
    balance: row?.balance ?? null,
    weeklyBonusAwarded: !!row?.weekly_bonus_awarded,
    weeklyBonusAlreadyAwarded: !!row?.weekly_bonus_already_awarded,
    weeklyBonusAmount: Number(row?.weekly_bonus_amount || 0),
    weekDays: normalizeWeekDays(row?.week_days),
  };
}

function removePopup() {
  const existing = document.getElementById(POPUP_ID);
  if (existing) existing.remove();
  document.documentElement.classList.remove('attendance-popup-open');
  document.body.classList.remove('attendance-popup-open');
}

function createPopup() {
  removePopup();

  const overlay = document.createElement('div');
  overlay.className = 'attendance-popup';
  overlay.id = POPUP_ID;

  overlay.innerHTML = `
    <div class="attendance-popup__backdrop"></div>
    <div
      class="attendance-popup__dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="attendancePopupTitle"
      aria-describedby="attendancePopupDesc"
    >
      <div class="attendance-popup__content">
        <img
          class="attendance-popup__image"
          id="attendancePopupImage"
          src="${resolveSitePath('./images/emoticons/carrot-9.png')}"
          alt="출석체크 안내 이미지"
        />
        <h2 class="attendance-popup__title" id="attendancePopupTitle">오늘 출석 체크</h2>
        <p class="attendance-popup__desc" id="attendancePopupDesc">
          출석체크 버튼을 누르면 ${ATTENDANCE_REWARD_AMOUNT}피클을 받을 수 있어.
        </p>
        <div class="attendance-popup__actions" id="attendancePopupActions">
          <button type="button" class="attendance-popup__btn attendance-popup__btn--primary" id="attendanceClaimBtn">
            출석체크
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  document.documentElement.classList.add('attendance-popup-open');
  document.body.classList.add('attendance-popup-open');

  return {
    root: overlay,
    imageEl: overlay.querySelector('#attendancePopupImage'),
    titleEl: overlay.querySelector('#attendancePopupTitle'),
    descEl: overlay.querySelector('#attendancePopupDesc'),
    actionsEl: overlay.querySelector('#attendancePopupActions'),
    claimBtn: overlay.querySelector('#attendanceClaimBtn'),
  };
}

function renderWeekBoard(weekDays = DEFAULT_WEEK_DAYS) {
  const days = normalizeWeekDays(weekDays);

  return `
    <div class="attendance-popup__week" aria-label="이번 주 출석 현황">
      <div class="attendance-popup__week-title">이번 주 출석</div>
      <div class="attendance-popup__week-days">
        ${days
          .map(
            (day) => `
              <div class="attendance-popup__day ${
                day.checked ? 'attendance-popup__day--checked' : ''
              }">
                <span class="attendance-popup__day-label">${day.label}</span>
                <span class="attendance-popup__day-check" aria-hidden="true">${
                  day.checked ? '✓' : ''
                }</span>
              </div>
            `,
          )
          .join('')}
      </div>
    </div>
  `;
}

function getBonusMessage(result = {}) {
  if (result.weeklyBonusAwarded) {
    const amount = Number(result.weeklyBonusAmount || WEEKLY_BONUS_AMOUNT);
    return `주간 출석 보너스 +${amount}피클도 지급됐어.`;
  }

  if (result.weeklyBonusAlreadyAwarded) {
    return '이번 주 출석 보너스는 이미 지급됐어.';
  }

  return '';
}

function renderCompletedState(popup, result = {}) {
  if (!popup) return;

  popup.imageEl.src = resolveSitePath('./images/emoticons/heart-6.png');
  popup.imageEl.alt = '출석 완료 이미지';
  popup.titleEl.textContent = '출석 완료';
  popup.descEl.textContent =
    result.message ||
    `오늘 출석 체크로 ${ATTENDANCE_REWARD_AMOUNT}피클 지급이 완료됐어.`;

  const existingWeek = popup.root.querySelector('.attendance-popup__week');
  if (existingWeek) existingWeek.remove();

  const existingBonus = popup.root.querySelector('.attendance-popup__bonus');
  if (existingBonus) existingBonus.remove();

  popup.descEl.insertAdjacentHTML('afterend', renderWeekBoard(result.weekDays));

  const bonusMessage = getBonusMessage(result);
  if (bonusMessage) {
    popup.root
      .querySelector('.attendance-popup__week')
      ?.insertAdjacentHTML(
        'afterend',
        `<p class="attendance-popup__bonus">${bonusMessage}</p>`,
      );
  }

  popup.actionsEl.innerHTML = `
    <button type="button" class="attendance-popup__btn attendance-popup__btn--primary" id="attendanceCloseBtn">
      닫기
    </button>
  `;

  const closeBtn = popup.actionsEl.querySelector('#attendanceCloseBtn');
  closeBtn?.addEventListener('click', () => {
    removePopup();
    window.dispatchEvent(new Event('auth-changed'));
  });
}

function renderFailedState(popup, result = {}) {
  if (!popup) return;

  popup.imageEl.src = resolveSitePath('./images/emoticons/carrot-9.png');
  popup.imageEl.alt = '출석 오류 이미지';
  popup.titleEl.textContent = '출석 오류';
  popup.descEl.textContent =
    result.message || '출석 체크 처리 중 오류가 발생했어.';

  const existingWeek = popup.root.querySelector('.attendance-popup__week');
  if (existingWeek) existingWeek.remove();

  const existingBonus = popup.root.querySelector('.attendance-popup__bonus');
  if (existingBonus) existingBonus.remove();

  popup.descEl.insertAdjacentHTML('afterend', renderWeekBoard(result.weekDays));

  popup.actionsEl.innerHTML = `
    <button type="button" class="attendance-popup__btn attendance-popup__btn--primary" id="attendanceCloseBtn">
      닫기
    </button>
  `;

  const closeBtn = popup.actionsEl.querySelector('#attendanceCloseBtn');
  closeBtn?.addEventListener('click', () => {
    removePopup();
  });
}

export async function initDailyAttendancePopup() {
  if (document.getElementById(CAREER_AWARD_POPUP_ID)) {
    window.addEventListener(
      CAREER_AWARD_COMPLETE_EVENT,
      () => {
        initDailyAttendancePopup().catch((error) => {
          console.error(
            '[daily-attendance-popup] deferred initialization failed:',
            error,
          );
        });
      },
      { once: true },
    );
    return;
  }

  const user = await getCurrentUser();
  if (!user?.id) {
    removePopup();
    return;
  }

  const { todayKey, hour } = getSeoulNow();

  if (hour < 8) {
    removePopup();
    return;
  }

  const claimedToday = await hasClaimedAttendanceToday(user.id, todayKey);
  if (claimedToday) {
    removePopup();
    return;
  }

  const popup = createPopup();

  popup.claimBtn?.addEventListener('click', async () => {
    popup.claimBtn.disabled = true;
    popup.claimBtn.textContent = '처리 중...';

    const result = await claimDailyAttendance();

    if (!result.ok) {
      renderFailedState(popup, result);
      return;
    }

    if (Number(result.amount || 0) > 0) {
      playPickleBurst({
        originEl: popup.claimBtn,
        count: result.weeklyBonusAwarded ? 18 : 12,
      });

      window.dispatchEvent(new Event('pickle-balance-changed'));
    }

    renderCompletedState(popup, result);
  });
}
