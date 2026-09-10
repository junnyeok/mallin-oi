// assets/js/modules/calendar-holidays.js

const DAY_MS = 24 * 60 * 60 * 1000;
const HOLIDAY_CACHE = new Map();
const LUNAR_FORMATTER = createLunarFormatter();

const ONE_OFF_HOLIDAYS = Object.freeze({
  '2024-04-10': '국회의원선거',
  '2024-10-01': '임시공휴일',
  '2025-01-27': '임시공휴일',
  '2025-06-03': '대통령선거',
  '2026-06-03': '지방선거',
});

function createLunarFormatter() {
  try {
    return new Intl.DateTimeFormat('ko-KR-u-ca-chinese', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      timeZone: 'Asia/Seoul',
    });
  } catch {
    return null;
  }
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateKey(year, month, day) {
  return `${year}-${pad(month)}-${pad(day)}`;
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day, date };
}

function addDays(dateKey, amount) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return '';

  const date = new Date(parsed.date.getTime() + amount * DAY_MS);
  return toDateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function getWeekday(dateKey) {
  return parseDateKey(dateKey)?.date.getUTCDay() ?? -1;
}

function getLunarMonthDay(dateKey) {
  if (!LUNAR_FORMATTER) return null;
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;

  const noonInKorea = new Date(
    Date.UTC(parsed.year, parsed.month - 1, parsed.day, 3),
  );
  const parts = LUNAR_FORMATTER.formatToParts(noonInKorea);
  const monthPart = parts.find((part) => part.type === 'month')?.value || '';
  const dayPart = parts.find((part) => part.type === 'day')?.value || '';
  const month = Number(monthPart.replace(/\D/g, ''));
  const day = Number(dayPart.replace(/\D/g, ''));

  if (!month || !day || monthPart.includes('윤')) return null;
  return { month, day };
}

function findLunarDate(year, lunarMonth, lunarDay) {
  const start = Date.UTC(year, 0, 1);
  const end = Date.UTC(year + 1, 0, 1);

  for (let timestamp = start; timestamp < end; timestamp += DAY_MS) {
    const date = new Date(timestamp);
    const dateKey = toDateKey(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      date.getUTCDate(),
    );
    const lunar = getLunarMonthDay(dateKey);
    if (lunar?.month === lunarMonth && lunar.day === lunarDay) return dateKey;
  }

  return '';
}

function pushHoliday(entries, key, name, options = {}) {
  if (!key) return;
  entries.push({
    key,
    name,
    badgeLabel: options.badgeLabel || name,
    group: options.group || key,
    substitutePolicy: options.substitutePolicy || 'none',
  });
}

function addFixedHolidays(entries, year) {
  pushHoliday(entries, toDateKey(year, 1, 1), '신정');
  pushHoliday(entries, toDateKey(year, 3, 1), '삼일절', {
    substitutePolicy: year >= 2021 ? 'weekend' : 'none',
  });

  if (year >= 2026) {
    pushHoliday(entries, toDateKey(year, 5, 1), '노동절', {
      substitutePolicy: 'weekend',
    });
  }

  pushHoliday(entries, toDateKey(year, 5, 5), '어린이날', {
    substitutePolicy: year >= 2014 ? 'weekend' : 'none',
  });
  pushHoliday(entries, toDateKey(year, 6, 6), '현충일');

  if (year <= 2007 || year >= 2026) {
    pushHoliday(entries, toDateKey(year, 7, 17), '제헌절', {
      substitutePolicy: year >= 2026 ? 'weekend' : 'none',
    });
  }

  pushHoliday(entries, toDateKey(year, 8, 15), '광복절', {
    substitutePolicy: year >= 2021 ? 'weekend' : 'none',
  });
  pushHoliday(entries, toDateKey(year, 10, 3), '개천절', {
    substitutePolicy: year >= 2021 ? 'weekend' : 'none',
  });

  if (year <= 1990 || year >= 2013) {
    pushHoliday(entries, toDateKey(year, 10, 9), '한글날', {
      substitutePolicy: year >= 2021 ? 'weekend' : 'none',
    });
  }

  pushHoliday(entries, toDateKey(year, 12, 25), '성탄절', {
    substitutePolicy: year >= 2023 ? 'weekend' : 'none',
  });
}

function addLunarHolidays(entries, year) {
  const seollal = findLunarDate(year, 1, 1);
  if (seollal) {
    const group = `seollal-${year}`;
    const substitutePolicy = year >= 2014 ? 'sunday-group' : 'none';
    pushHoliday(entries, addDays(seollal, -1), '설날 연휴', {
      group,
      substitutePolicy,
    });
    pushHoliday(entries, seollal, '설날', { group, substitutePolicy });
    pushHoliday(entries, addDays(seollal, 1), '설날 연휴', {
      group,
      substitutePolicy,
    });
  }

  const buddhasBirthday = findLunarDate(year, 4, 8);
  pushHoliday(entries, buddhasBirthday, '부처님오신날', {
    substitutePolicy: year >= 2023 ? 'weekend' : 'none',
  });

  const chuseok = findLunarDate(year, 8, 15);
  if (chuseok) {
    const group = `chuseok-${year}`;
    const substitutePolicy = year >= 2014 ? 'sunday-group' : 'none';
    pushHoliday(entries, addDays(chuseok, -1), '추석 연휴', {
      group,
      substitutePolicy,
    });
    pushHoliday(entries, chuseok, '추석', { group, substitutePolicy });
    pushHoliday(entries, addDays(chuseok, 1), '추석 연휴', {
      group,
      substitutePolicy,
    });
  }
}

function addOneOffHolidays(entries, year) {
  Object.entries(ONE_OFF_HOLIDAYS).forEach(([key, name]) => {
    if (Number(key.slice(0, 4)) === year) pushHoliday(entries, key, name);
  });
}

function mergeEntries(entries) {
  const holidays = new Map();

  entries.forEach((entry) => {
    const current = holidays.get(entry.key);
    if (!current) {
      holidays.set(entry.key, {
        dateKey: entry.key,
        name: entry.name,
        badgeLabel: entry.badgeLabel,
        names: [entry.name],
        isSubstitute: false,
      });
      return;
    }

    if (!current.names.includes(entry.name)) current.names.push(entry.name);
    current.name = current.names.join(' · ');
    current.badgeLabel = current.name;
  });

  return holidays;
}

function needsSubstitute(groupEntries, allEntries) {
  const policy = groupEntries[0]?.substitutePolicy || 'none';
  if (policy === 'none') return false;

  const collidesWithAnotherHoliday = groupEntries.some((entry) =>
    allEntries.some(
      (candidate) =>
        candidate.key === entry.key && candidate.group !== entry.group,
    ),
  );

  if (policy === 'sunday-group') {
    return (
      groupEntries.some((entry) => getWeekday(entry.key) === 0) ||
      collidesWithAnotherHoliday
    );
  }

  return (
    groupEntries.some((entry) => [0, 6].includes(getWeekday(entry.key))) ||
    collidesWithAnotherHoliday
  );
}

function findSubstituteDate(afterDateKey, holidays) {
  let candidate = addDays(afterDateKey, 1);

  while (
    candidate &&
    ([0, 6].includes(getWeekday(candidate)) || holidays.has(candidate))
  ) {
    candidate = addDays(candidate, 1);
  }

  return candidate;
}

function addSubstituteHolidays(entries, holidays) {
  const groups = new Map();

  entries.forEach((entry) => {
    if (entry.substitutePolicy === 'none') return;
    const groupEntries = groups.get(entry.group) || [];
    groupEntries.push(entry);
    groups.set(entry.group, groupEntries);
  });

  [...groups.values()]
    .sort((left, right) => left[0].key.localeCompare(right[0].key))
    .forEach((groupEntries) => {
      if (!needsSubstitute(groupEntries, entries)) return;

      const lastDateKey = groupEntries
        .map((entry) => entry.key)
        .sort()
        .at(-1);
      const substituteDate = findSubstituteDate(lastDateKey, holidays);
      if (!substituteDate) return;

      const representative =
        groupEntries.find((entry) => !entry.name.endsWith('연휴')) ||
        groupEntries[0];
      holidays.set(substituteDate, {
        dateKey: substituteDate,
        name: `${representative.name} 대체공휴일`,
        badgeLabel: '대체공휴일',
        names: [`${representative.name} 대체공휴일`],
        isSubstitute: true,
      });
    });
}

function buildHolidayMap(year) {
  const entries = [];
  addFixedHolidays(entries, year);
  addLunarHolidays(entries, year);
  addOneOffHolidays(entries, year);

  const holidays = mergeEntries(entries);
  addSubstituteHolidays(entries, holidays);
  return holidays;
}

function normalizeDateKey(value) {
  if (typeof value === 'string') return parseDateKey(value) ? value : '';
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
  return toDateKey(value.getFullYear(), value.getMonth() + 1, value.getDate());
}

export function getKoreanPublicHoliday(value) {
  const dateKey = normalizeDateKey(value);
  const year = Number(dateKey.slice(0, 4));
  if (!dateKey || !year) return null;

  if (!HOLIDAY_CACHE.has(year)) {
    HOLIDAY_CACHE.set(year, buildHolidayMap(year));
  }

  return HOLIDAY_CACHE.get(year).get(dateKey) || null;
}

export function appendKoreanHolidayBadge(root, value) {
  if (!root) return null;
  const holiday = getKoreanPublicHoliday(value);
  if (!holiday) return null;

  const badge = document.createElement('span');
  badge.className = 'calendar-holiday-badge';
  badge.textContent = holiday.badgeLabel;
  badge.title = holiday.name;
  badge.setAttribute('aria-label', `${holiday.name} 공휴일`);
  root.append(badge);
  return badge;
}
