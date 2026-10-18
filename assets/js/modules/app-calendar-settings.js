import { initCalendarAppMode } from './app-calendar-mode.js';

initCalendarAppMode();

// 앱 내부의 알려진 화면으로만 돌아간다. 외부 URL은 복귀 주소로 사용하지 않는다.
const returnPages = new Set([
  'app-calendar.html',
  'calendar-study.html',
  'calendar-work.html',
  'calendar-event.html',
]);
const from = new URLSearchParams(window.location.search).get('from');
const returnPage = returnPages.has(from) ? from : 'app-calendar.html';
document.getElementById('appCalendarSettingsBack').href = `./${returnPage}?app=calendar`;

const appearance = window.CalendarAppearance;
const options = document.getElementById('calendarAppearanceOptions');
const status = document.getElementById('calendarAppearanceStatus');

function showAppearance() {
  options.querySelectorAll('input').forEach(input => {
    input.checked = input.value === appearance.get();
  });
}

if (appearance?.available) {
  await appearance.ready;
  showAppearance();
  options.disabled = false;
  options.addEventListener('change', async event => {
    options.disabled = true;
    status.textContent = '';
    try {
      await appearance.set(event.target.value);
      status.textContent = `${appearance.get() === 'dark' ? '다크' : '라이트'} 모드로 변경했어요.`;
    } catch (error) {
      status.textContent = error.message;
    } finally {
      showAppearance();
      options.disabled = false;
    }
  });
} else {
  status.textContent = '화면 모드는 말린오이 캘린더 앱에서 변경할 수 있어요.';
}
