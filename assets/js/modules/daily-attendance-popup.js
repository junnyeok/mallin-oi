// assets/js/modules/daily-attendance-popup.js
import { supabase } from './supabase-client.js';
import { getCurrentUser, resolveSitePath } from './auth-store.js';

const POPUP_ID = 'dailyAttendancePopup';

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
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    ok: !!row?.ok,
    amount: Number(row?.amount || 0),
    message: String(row?.message || '').trim(),
    balance: row?.balance ?? null,
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
          오전 8시 이후 출석체크 버튼을 누르면 100피클을 받을 수 있어.
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

function renderCompletedState(popup, message) {
  if (!popup) return;

  popup.imageEl.src = resolveSitePath('./images/emoticons/heart-6.png');
  popup.imageEl.alt = '출석 완료 이미지';
  popup.titleEl.textContent = '출석 완료';
  popup.descEl.textContent = message || '피클 지급이 완료됐어.';
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

export async function initDailyAttendancePopup() {
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

    renderCompletedState(
      popup,
      result.message || '오늘 출석 체크 피클 지급이 완료됐어.',
    );
  });
}
