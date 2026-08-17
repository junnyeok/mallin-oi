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
