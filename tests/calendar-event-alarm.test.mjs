import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EVENT_ALARM_PRESETS, getEventAlarmPlugin,
  normalizeAlarmSelection, makeEventAlarmSet, alarmMessage,
  makeAlarmCalendarFile, makeEventAlarm, parseAlarmDateTime, toAlarmDateTimeValue,
} from '../assets/js/modules/event-alarm.js';

process.env.TZ = 'Asia/Seoul';
const epoch = (value) => parseAlarmDateTime(value).getTime();
const example = { title: '가족식사참치회', startValue: '2026-09-27T18:00', now: epoch('2026-09-26T16:00') };

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

test('캘린더 파일은 날짜·알람·한글 제목을 UTC로 전달하고 문법 주입을 방지한다', () => {
  const alarm = makeEventAlarm({ ...example, minutes: 5, title: '가족식사참치회, 메모; \\ \nBEGIN:VEVENT ' + '오이'.repeat(60) });
  const ics = makeAlarmCalendarFile(alarm, { uid: 'test-alarm', now: example.now });
  assert.match(ics, /DTSTART:20260927T090000Z\r\n/);
  assert.match(ics, /TRIGGER;VALUE=DATE-TIME:20260927T085500Z\r\n/);
  assert.equal(ics.split('\r\n').filter((line) => line === 'BEGIN:VEVENT').length, 1);
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:가족식사참치회\\, 메모\\; \\\\ \\nBEGIN:VEVENT'));
  assert.ok(ics.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
  assert.throws(() => makeAlarmCalendarFile(alarm, { uid: 'bad\nUID:bad' }));
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

test('웹 알림 파일에 서로 다른 두 VALARM과 남은 시간 문구가 포함된다', () => {
  const pair = makeEventAlarmSet(example, [5, 10], example.now);
  const ics = makeAlarmCalendarFile(pair.alarms[0], { uid: 'two-alarms', alarms: pair.alarms, now: example.now });
  assert.equal(ics.match(/BEGIN:VALARM/g).length, 2);
  assert.match(ics, /20260927T085500Z/);
  assert.match(ics, /20260927T085000Z/);
  assert.ok(ics.replace(/\r\n /g, '').includes('일정이 5분 남았어요!'));
});
