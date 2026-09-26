import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalizeBackupPayload } from '../assets/js/modules/calendar-group-backup-comparison.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const eventSourcePayload = {
  isDone: false,
  eventTime: null,
  eventEndTime: null,
  eventRangeId: 'range-1',
  categoryName: '일정',
  shared_group_id: null,
  shared_origin_todo_id: null,
  shared_origin_user_id: null,
  shared_created_by: null,
  is_shared_copy: false,
};

test('이벤트 백업 비교는 서버가 추가한 카테고리 메타데이터를 변경으로 오인하지 않는다', () => {
  const storedPayload = {
    ...eventSourcePayload,
    categoryId: 'category-1',
    categoryIsDefault: true,
    categorySortOrder: 100,
  };

  assert.deepEqual(
    normalizeBackupPayload(eventSourcePayload, 'event'),
    normalizeBackupPayload(storedPayload, 'event'),
  );
});

test('이벤트 일정의 실제 내용이 바뀌면 새 백업이 필요하다고 구분한다', () => {
  const storedPayload = {
    ...eventSourcePayload,
    eventTime: '10:00:00',
  };

  assert.notDeepEqual(
    normalizeBackupPayload(eventSourcePayload, 'event'),
    normalizeBackupPayload(storedPayload, 'event'),
  );
});

test('이벤트 boolean 문자열은 원본 boolean과 동일하게 비교한다', () => {
  assert.deepEqual(
    normalizeBackupPayload(eventSourcePayload, 'event'),
    normalizeBackupPayload(
      {
        ...eventSourcePayload,
        isDone: 'false',
        is_shared_copy: 'false',
      },
      'event',
    ),
  );
});

test('캘린더 그룹 코드와 배포 번들이 순수 비교 모듈을 함께 사용한다', () => {
  const relativePaths = [
    'assets/js/modules/calendar-groups.js',
    'assets/js/modules/calendar-group-backup-comparison.js',
  ];
  const targets = [
    'www',
    'android/app/src/main/assets/public',
    'ios/App/App/public',
  ];

  const groupsSource = fs.readFileSync(
    path.join(rootDir, relativePaths[0]),
    'utf8',
  );
  assert.match(
    groupsSource,
    /import \{ normalizeBackupPayload \} from '\.\/calendar-group-backup-comparison\.js';/,
  );

  for (const relativePath of relativePaths) {
    const expected = fs.readFileSync(path.join(rootDir, relativePath));
    for (const target of targets) {
      assert.deepEqual(
        fs.readFileSync(path.join(rootDir, target, relativePath)),
        expected,
        `${target}/${relativePath} mismatch`,
      );
    }
  }
});

test('백업 버튼은 그룹 팝업 밖의 캘린더 상단에 두고 그룹 연동 중에만 표시한다', () => {
  const groupsSource = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/calendar-groups.js'),
    'utf8',
  );
  const copyPasteSource = fs.readFileSync(
    path.join(rootDir, 'assets/js/modules/calendar-group-copy-paste.js'),
    'utf8',
  );
  const entrySheetCss = fs.readFileSync(
    path.join(rootDir, 'assets/css/components/calendar-entry-sheet.css'),
    'utf8',
  );
  const groupsCss = fs.readFileSync(
    path.join(rootDir, 'assets/css/main/calendar-groups-main.css'),
    'utf8',
  );

  assert.match(
    groupsSource,
    /head\.append\(bar, backupButton\)/,
  );
  assert.match(
    groupsSource,
    /backupButton\.hidden = !isActive/,
  );
  assert.doesNotMatch(
    groupsSource,
    /<button class="calendar-group-bar__backup" type="button">백업<\/button>/,
  );
  assert.match(
    copyPasteSource,
    /closeButton\.insertAdjacentElement\('beforebegin', button\)/,
  );
  assert.match(
    entrySheetCss,
    /calendar-group-bar__backup--header[\s\S]*order: 4;[\s\S]*margin-left: auto;/,
  );
  assert.match(
    groupsCss,
    /calendar-group-bar__backup--header \{[\s\S]*min-height: 40px;[\s\S]*padding: 0 var\(--space-16\);[\s\S]*border-radius: var\(--radius-pill\);[\s\S]*font-weight: 900;/,
  );
  assert.match(
    groupsCss,
    /calendar-group-bar__backup\.is-backup-needed:not\(:disabled\) \{[\s\S]*animation: calendar-group-backup-needed 1\.8s ease-in-out infinite;/,
  );
});
