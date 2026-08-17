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
