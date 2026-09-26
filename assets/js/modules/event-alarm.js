// Event alarm choices are local to this device and committed with the event save.
export const EVENT_ALARM_PRESETS = Object.freeze([
  { minutes: 0, label: '이벤트 시간' },
  { minutes: 5, label: '5분 전' },
  { minutes: 10, label: '10분 전' },
  { minutes: 15, label: '15분 전' },
  { minutes: 30, label: '30분 전' },
  { minutes: 60, label: '1시간 전' },
  { minutes: 120, label: '2시간 전' },
  { minutes: 1440, label: '1일 전' },
  { minutes: 2880, label: '2일 전' },
  { minutes: 10080, label: '1주 전' },
]);

export function normalizeAlarmSelection(values = []) {
  if (!Array.isArray(values) || values.length > 2) throw new Error('알람은 최대 두 개까지 지정할 수 있어요.');
  const result = [];
  for (const value of values) {
    if (value === null || value === undefined) continue;
    if (!EVENT_ALARM_PRESETS.some((item) => item.minutes === value)) throw new Error('알람 시간을 다시 선택해 주세요.');
    if (!result.includes(value)) result.push(value);
  }
  return result;
}

export function alarmOptionLabel(value) {
  return EVENT_ALARM_PRESETS.find((item) => item.minutes === value)?.label || '없음';
}

export function alarmMessage(title, minutes) {
  const amount = minutes >= 10080 ? `${minutes / 10080}주` : minutes >= 1440 ? `${minutes / 1440}일`
    : minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`;
  return minutes === 0 ? `‘${title}’ 일정이 시작돼요!` : `‘${title}’ 일정이 ${amount} 남았어요!`;
}

export function makeEventAlarmSet(event, selection, now = Date.now()) {
  const offsets = normalizeAlarmSelection(selection);
  if (!offsets.length) return { selection: [], alarms: [], skipped: 0 };
  const alarms = offsets.map((minutes) => {
    const alarm = makeEventAlarm({ ...event, minutes, now: -Infinity });
    return { ...alarm, minutes, message: alarmMessage(alarm.title, minutes) };
  });
  return { selection: offsets, alarms: alarms.filter((item) => item.fireAt > now),
    skipped: alarms.filter((item) => item.fireAt <= now).length };
}

export function parseAlarmDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(String(value || ''));
  if (!match) throw new Error('시작 날짜와 시간을 먼저 지정해 주세요.');
  const [year, month, day, hour, minute] = match.slice(1).map(Number);
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (year < 2000 || year > 9999 || date.getFullYear() !== year ||
      date.getMonth() !== month - 1 || date.getDate() !== day ||
      date.getHours() !== hour || date.getMinutes() !== minute) {
    throw new Error('유효한 날짜와 시간을 지정해 주세요.');
  }
  return date;
}

export function toAlarmDateTimeValue(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function makeEventAlarm({ title, startValue, endValue, minutes, now = Date.now() }) {
  const text = String(title || '').trim();
  if (!text) throw new Error('일정 제목을 먼저 입력해 주세요.');
  if (text.length > 200) throw new Error('알람 제목은 200자 이내로 입력해 주세요.');
  const start = parseAlarmDateTime(startValue);
  if (!EVENT_ALARM_PRESETS.some((preset) => preset.minutes === minutes)) {
    throw new Error('알람 시간을 선택해 주세요.');
  }
  const fire = new Date(start.getTime() - minutes * 60_000);
  if (fire.getTime() <= now) throw new Error('이미 지난 시각이에요. 앞으로 울릴 알람 시간을 지정해 주세요.');
  let end = new Date(start.getTime() + 60_000);
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endValue || '')) {
    const parsed = parseAlarmDateTime(endValue);
    if (parsed > start) end = parsed;
  }
  return { title: text, fireAt: fire.getTime(), startAt: start.getTime(), endAt: end.getTime() };
}

function escapeICal(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldICalLine(line) {
  const encoder = new TextEncoder();
  const parts = [];
  let part = '';
  let length = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (length + size > 75) {
      parts.push(part);
      part = ' ';
      length = 1;
    }
    part += character;
    length += size;
  }
  parts.push(part);
  return parts.join('\r\n');
}

export function makeAlarmCalendarFile(alarm, { uid, now = Date.now(), alarms = [alarm] }) {
  if (!/^[a-zA-Z0-9-]+$/.test(uid || '')) throw new Error('Invalid calendar identifier');
  const stamp = (value) => new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Mallinoi//Event Alarm//KO',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:${uid}@mallinoi.calendar`, `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(alarm.startAt)}`, `DTEND:${stamp(alarm.endAt)}`,
    `SUMMARY:${escapeICal(alarm.title)}`,
    ...alarms.flatMap((item) => [
      'BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER;VALUE=DATE-TIME:${stamp(item.fireAt)}`,
      `DESCRIPTION:${escapeICal(item.message || item.title)}`, 'END:VALARM',
    ]), 'END:VEVENT', 'END:VCALENDAR',
  ].map(foldICalLine).join('\r\n') + '\r\n';
}

export function getEventAlarmPlugin(windowRef = window) {
  const capacitor = windowRef.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  return capacitor.registerPlugin?.('EventAlarms') || capacitor.Plugins?.EventAlarms || null;
}
