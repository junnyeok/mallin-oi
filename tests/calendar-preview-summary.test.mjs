import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { summarizePreview } from '../assets/js/modules/calendar-preview-summary.js';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('미리보기 요약은 이번 달만 세고 오늘·완료·남은 일정일을 구분한다', () => {
  const result = summarizePreview({
    '2026-09-30': [{ text: '지난달' }],
    '2026-10-01': [{ text: '완료', done: true }],
    '2026-10-12': [{ text: '오늘 1' }, { text: '오늘 2', done: true }],
    '2026-10-13': [{ text: '내일' }],
    '2026-11-01': [{ text: '다음달' }],
  }, '2026-10-12');
  assert.equal(result.total, 4);
  assert.equal(result.today, 2);
  assert.equal(result.done, 2);
  assert.equal(result.remainingDays, 2);
  assert.deepEqual(result.upcoming.map((item) => item.text), ['오늘 1', '내일']);
});

test('세 종류의 시간 필드를 정렬하고 다가오는 미완료 일정은 최대 3개 표시한다', () => {
  const store = { '2026-10-12': [
    { text: '시간 미지정' },
    { text: '업무', startTime: '15:00' },
    { text: '자기개발', todoTime: '09:00' },
    { text: '이벤트', eventTime: '12:00' },
    { text: '완료', done: true, todoTime: '08:00' },
  ] };
  const before = JSON.stringify(store);
  assert.deepEqual(summarizePreview(store, '2026-10-12').upcoming.map((item) => item.text), ['자기개발', '이벤트', '업무']);
  assert.equal(JSON.stringify(store), before, '요약은 원본 데이터를 수정하지 않는다');
});

test('일정이 없는 계정은 빈 상태이며 가상 데이터를 채우지 않는다', () => {
  assert.deepEqual(summarizePreview({}, '2026-10-12'), {
    total: 0, today: 0, done: 0, remainingDays: 0, upcoming: [],
  });
});

test('페이지별 요약·빈 상태·오류 연결과 상세 페이지 스타일 격리를 유지한다', () => {
  for (const kind of ['study', 'work', 'event']) {
    const html = read(kind + '.html');
    assert.match(html, /section-dashboard/);
    assert.ok(html.includes('data-calendar-summary="' + kind + '"'));
    assert.ok(html.includes('data-calendar-upcoming="' + kind + '"'));
    assert.match(html, /section-landing.css/);
    assert.doesNotMatch(read('calendar-' + kind + '.html'), /section-landing.css/);
    const module = read('assets/js/modules/' + kind + '-calendar.js');
    assert.match(module, /status: 'signed-out'/);
    assert.match(module, /status: 'error'/);
    assert.equal(read('www/assets/js/modules/' + kind + '-calendar.js'), module);
  }
  assert.match(read('career.html'), /careerBestList/);
  assert.match(read('career.html'), /careerGuideTitle/);
  assert.match(read('career.html'), /id="latestList"/);
});

test('추가 공유 자산의 원본과 www 사본이 일치한다', () => {
  for (const path of ['assets/js/modules/calendar-preview-summary.js', 'assets/css/main/section-landing.css', 'assets/css/main/home-landing.css']) {
    assert.equal(read(path), read('www/' + path));
  }
});

test('홈은 기존 상품·게시물 연결을 보존하고 실제 페이지로 연결한다', () => {
  const html = read('index.html');
  for (const id of ['featuredStoreSection', 'storePrevBtn', 'storeNextBtn', 'storeFeaturedViewport', 'storeFeaturedGrid', 'storeFeaturedStatus', 'latestUploadSection', 'latestList']) {
    assert.equal((html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
  }
  for (const page of ['study', 'work', 'event', 'career', 'write', 'profile', 'inventory', 'store']) {
    assert.ok(html.includes('href="./' + page + '.html"'));
    assert.ok(read(page + '.html'));
  }
  assert.match(read('www/index.html'), /app-calendar/);
  assert.doesNotMatch(read('www/index.html'), /home-welcome/);
});
