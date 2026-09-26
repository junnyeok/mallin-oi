import assert from 'node:assert/strict';
import test from 'node:test';
import { getCalendarAppStoreUrl } from '../assets/js/modules/calendar-app-download-popup.js';
import {
  EVENT_ALARM_PRESETS, getEventAlarmPlugin,
  normalizeAlarmSelection, makeEventAlarmSet, alarmMessage,
  makeEventAlarm, parseAlarmDateTime, toAlarmDateTimeValue,
} from '../assets/js/modules/event-alarm.js';

process.env.TZ = 'Asia/Seoul';
const epoch = (value) => parseAlarmDateTime(value).getTime();
const example = { title: '가족식사참치회', startValue: '2026-09-27T18:00', now: epoch('2026-09-26T16:00') };

test('Android 웹의 다운로드 동의는 캘린더 Google Play 페이지로 연결된다', () => {
  const url = new URL(getCalendarAppStoreUrl('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36'));
  assert.equal(url.origin, 'https://play.google.com');
  assert.equal(url.pathname, '/store/apps/details');
  assert.equal(url.searchParams.get('id'), 'com.mallinoi.calendar');
});

test('iPhone·iPad 및 PC 웹의 다운로드 동의는 캘린더 App Store 페이지로 연결된다', () => {
  for (const ua of ['Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',
    'Mozilla/5.0 (iPad; CPU OS 26_0 like Mac OS X)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', '']) {
    const url = new URL(getCalendarAppStoreUrl(ua));
    assert.equal(url.origin, 'https://apps.apple.com');
    assert.ok(url.pathname.endsWith('/id6774468038'));
  }
});

test('요청한 모든 분 전 선택과 제목을 보존하며 18:00의 5분 전은 같은 날짜 17:55다', () => {
  assert.deepEqual(EVENT_ALARM_PRESETS.map((item) => item.minutes), [0, 5, 10, 15, 30, 60, 120, 1440, 2880, 10080]);
  for (const { minutes } of EVENT_ALARM_PRESETS) {
    const result = makeEventAlarm({ ...example, minutes, now: epoch('2026-09-01T00:00') });
    assert.equal(result.title, example.title);
    assert.equal(result.fireAt, epoch(example.startValue) - minutes * 60000);
  }
  assert.equal(toAlarmDateTimeValue(new Date(makeEventAlarm({ ...example, minutes: 5 }).fireAt)), '2026-09-27T17:55');
});

test('자정·월말·연말·윤년 경계를 정확히 넘는다', () => {
  for (const [startValue, expected] of [
    ['2027-01-01T00:00', '2026-12-31T23:55'],
    ['2026-10-01T00:03', '2026-09-30T23:58'],
    ['2028-03-01T00:00', '2028-02-29T23:55'],
  ]) assert.equal(makeEventAlarm({ ...example, startValue, minutes: 5 }).fireAt, epoch(expected));
});

test('종료 시각이 없으면 유효한 일정 범위를 만들고 지정된 종료 시각은 보존한다', () => {
  const result = makeEventAlarm({ ...example, minutes: 5 });
  assert.equal(result.endAt - result.startAt, 60000);
  assert.equal(makeEventAlarm({ ...example, minutes: 5, endValue: '2026-09-27T20:00' }).endAt, epoch('2026-09-27T20:00'));
});

test('잘못된 날짜·빈 제목·시간 미지정·이미 지난 시각은 등록을 차단한다', () => {
  for (const value of ['2026-02-29T12:00', '2026-13-01T12:00', '2026-09-31T12:00', '2026-09-27T24:00', '2026-09-27', '2026-09-27T18:00:00']) {
    assert.throws(() => parseAlarmDateTime(value));
  }
  for (const patch of [{ title: ' ' }, { title: '가'.repeat(201) }, { minutes: 7 }, { startValue: '2026-09-27' }, { now: epoch('2026-09-27T17:55') }]) {
    assert.throws(() => makeEventAlarm({ ...example, minutes: 5, ...patch }));
  }
});

test('웹은 네이티브 브리지로 오인하지 않고 앱에서는 EventAlarms를 등록한다', () => {
  assert.equal(getEventAlarmPlugin({}), null);
  assert.equal(getEventAlarmPlugin({ Capacitor: { isNativePlatform: () => false } }), null);
  const plugin = {};
  assert.equal(getEventAlarmPlugin({ Capacitor: { isNativePlatform: () => true, registerPlugin: (name) => { assert.equal(name, 'EventAlarms'); return plugin; } } }), plugin);
});


test('두 알람 선택은 0을 보존하고 중복을 제거하며 첫 없음이면 두 번째를 당긴다', () => {
  assert.deepEqual(normalizeAlarmSelection([0, 5]), [0, 5]);
  assert.deepEqual(normalizeAlarmSelection([5, 5]), [5]);
  assert.deepEqual(normalizeAlarmSelection([null, 10]), [10]);
  assert.deepEqual(normalizeAlarmSelection([null, null]), []);
  assert.throws(() => normalizeAlarmSelection([5, 10, 15]));
  assert.throws(() => normalizeAlarmSelection([1]));
});

test('두 알람은 정확한 문구와 각각의 날짜를 갖고 지난 시각은 예약하지 않는다', () => {
  const pair = makeEventAlarmSet(example, [5, 10], example.now);
  assert.equal(pair.alarms.length, 2);
  assert.equal(pair.alarms[0].message, '‘가족식사참치회’ 일정이 5분 남았어요!');
  assert.equal(pair.alarms[1].fireAt, epoch('2026-09-27T17:50'));
  assert.equal(alarmMessage('가족식사참치회', 0), '‘가족식사참치회’ 일정이 시작돼요!');
  assert.equal(alarmMessage('회의', 10080), '‘회의’ 일정이 1주 남았어요!');
  const partlyExpired = makeEventAlarmSet(example, [5, 10080], example.now);
  assert.equal(partlyExpired.skipped, 1);
  assert.deepEqual(partlyExpired.selection, [5, 10080]);
  assert.equal(partlyExpired.alarms.length, 1);
  assert.deepEqual(makeEventAlarmSet({ title: '', startValue: '' }, []), { selection: [], alarms: [], skipped: 0 });
});
