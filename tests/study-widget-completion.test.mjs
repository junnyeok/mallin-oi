import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(rootDir, relativePath), 'utf8');

test('위젯 데이터는 조회한 일정의 완료 여부를 공통 payload에 보존한다', () => {
  const source = read('assets/js/modules/calendar-widget-data.js');

  assert.match(source, /isDone:\s*Boolean\(row\.is_done\)/);
  assert.match(
    source,
    /function normalizeStudyWidgetRow[\s\S]*?is_done:\s*row\.is_done/,
  );
});

test('iOS 자기개발 위젯은 완료 일정 배지를 연하게 하고 얇은 기본 취소선을 표시한다', () => {
  const source = read(
    'ios/App/MallinoiCalendarWidgets/MallinoiCalendarWidgets.swift',
  );

  assert.match(source, /let isDone:\s*Bool\?/);
  assert.match(
    source,
    /Text\(displayTitle\(for:\s*item\)\)\s*\.strikethrough\(calendarType == "study" && item\.isDone == true\)\s*\.font/,
  );
  assert.match(
    source,
    /\.opacity\(calendarType == "study" && item\.isDone == true \? 0\.62 : 1\)/,
  );
  assert.doesNotMatch(source, /Rectangle\(\)[\s\S]*?\.frame\(height:\s*calendarType == "study"/);
});

test('Android 자기개발 위젯은 완료 일정 제목에 취소선 span을 적용한다', () => {
  const source = read(
    'android/app/src/main/java/com/mallinoi/calendar/CalendarWidgetProvider.java',
  );

  assert.match(
    source,
    /"study"\.equals\(calendarType\) && item\.optBoolean\("isDone", false\)/,
  );
  assert.match(source, /new StrikethroughSpan\(\)/);
});

test('공통 위젯 payload는 앱과 같은 대한민국 공휴일 정보를 날짜별로 포함한다', () => {
  const source = read('assets/js/modules/calendar-widget-data.js');

  assert.match(
    source,
    /import \{ getKoreanPublicHoliday \} from '\.\/calendar-holidays\.js';/,
  );
  assert.match(
    source,
    /function getWidgetDayHoliday\(dateKey\)[\s\S]*?badgeLabel: holiday\.badgeLabel,[\s\S]*?isSubstitute: Boolean\(holiday\.isSubstitute\)/,
  );
  assert.match(source, /holiday:\s*getWidgetDayHoliday\(dateKey\)/);
});

test('iOS 위젯은 캘린더 종류에 따라 공휴일 배지를 요구 순서로 표시한다', () => {
  const source = read(
    'ios/App/MallinoiCalendarWidgets/MallinoiCalendarWidgets.swift',
  );
  const studyHolidayIndex = source.indexOf(
    'if calendarType != "work", let holiday = day.holiday',
  );
  const itemListIndex = source.indexOf(
    'ForEach(Array(visibleItems.prefix(maxVisibleItems)))',
  );
  const workMemoIndex = source.indexOf('if hasWorkMemo, let item = visibleItems.first');
  const workHolidayIndex = source.indexOf(
    'if calendarType == "work", let holiday = day.holiday',
  );

  assert.match(source, /let holiday:\s*CalendarWidgetHoliday\?/);
  assert.ok(studyHolidayIndex > 0 && studyHolidayIndex < itemListIndex);
  assert.ok(workHolidayIndex > workMemoIndex);
  assert.match(
    source,
    /if calendarType != "work" && day\.holiday != nil \{ return 1 \}/,
  );
  assert.match(source, /Color\(red: 198 \/ 255, green: 40 \/ 255, blue: 40 \/ 255\)/);
});

test('Android 위젯도 캘린더 종류에 따라 공휴일을 일정 앞뒤의 전용 배지로 표시한다', () => {
  const provider = read(
    'android/app/src/main/java/com/mallinoi/calendar/CalendarWidgetProvider.java',
  );
  const layout = read('android/app/src/main/res/layout/widget_calendar_day.xml');
  const badge = read(
    'android/app/src/main/res/drawable/widget_holiday_badge_background.xml',
  );

  assert.match(provider, /day\.optJSONObject\("holiday"\)/);
  assert.match(provider, /holiday\.optString\("badgeLabel", holiday\.optString\("name", ""\)\)/);
  assert.match(provider, /hasHoliday && !"work"\.equals\(calendarType\)/);
  assert.match(provider, /hasHoliday && "work"\.equals\(calendarType\)/);
  assert.ok(
    layout.indexOf('widgetDayHolidayBefore') < layout.indexOf('widgetDayEventRow1'),
  );
  assert.ok(
    layout.indexOf('widgetDayEventRow2') < layout.indexOf('widgetDayHolidayAfter'),
  );
  assert.match(badge, /android:color="#FFF4F4"/);
  assert.match(badge, /android:color="#E59A9A"/);
  assert.match(provider, /Color\.rgb\(198, 40, 40\)/);
});
