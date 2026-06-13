// assets/js/modules/calendar-widget-data.js

export const CALENDAR_WIDGET_TYPES = ['study', 'work', 'event'];
export const CALENDAR_WIDGET_RANGES = ['fourDays', 'twoWeeks', 'month'];

export const CALENDAR_WIDGET_LABELS = {
  study: '자기개발',
  work: '업무',
  event: '이벤트',
};

const KOREAN_WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const CALENDAR_WIDGET_FALLBACK_COLORS = {
  study: '#e7f6ff',
  work: '#f5f546',
  event: '#ffc0cb',
};

let supabaseClientModule = null;

function getRuntimeVersion() {
  return encodeURIComponent(String(window.__SITE_VERSION__ || 'dev').trim());
}

function importVersioned(path) {
  return import(`${path}?v=${getRuntimeVersion()}`);
}

async function getSupabaseClient() {
  if (!supabaseClientModule) {
    supabaseClientModule = await importVersioned('./supabase-client.js');
  }

  return supabaseClientModule.supabase;
}

function toDateKey(value) {
  if (!value) return '';

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return String(value).slice(0, 10);
}

function getWidgetItemDisplayTitle(item = {}) {
  if (item.calendarType === 'work') {
    return item.categoryName || item.title || '';
  }

  return item.title || item.categoryName || '';
}

function prepareWidgetItem(item = {}) {
  const calendarType = item.calendarType || '';

  return {
    ...item,
    displayTitle: getWidgetItemDisplayTitle(item),
    displayColor:
      item.categoryColor ||
      CALENDAR_WIDGET_FALLBACK_COLORS[calendarType] ||
      '#eeeeee',
  };
}

function normalizeWidgetItem(row = {}) {
  return prepareWidgetItem({
    calendarType: row.calendar_type || '',
    id: row.item_id || '',
    date: toDateKey(row.item_date),
    categoryName: row.category_name || '',
    categoryColor: row.category_color || '',
    title: row.title || '',
    memo: row.memo || '',
    time: row.event_time || null,
    sortOrder: Number(row.sort_order || 0),
    createdAt: row.created_at || null,
  });
}

function parseDateKey(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);

  if (!year || !month || !day) return null;

  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + Number(days || 0));
  return nextDate;
}

function getMonthRange(baseDate = new Date()) {
  const startDate = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const endDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);

  return {
    startDate,
    endDate,
    startDateKey: toDateKey(startDate),
    endDateKey: toDateKey(endDate),
  };
}

function getCalendarGridRange(baseDate = new Date()) {
  const { startDate, endDate } = getMonthRange(baseDate);
  const gridStartDate = addDays(startDate, -startDate.getDay());
  const gridEndDate = addDays(endDate, 6 - endDate.getDay());

  return {
    startDate: gridStartDate,
    endDate: gridEndDate,
    startDateKey: toDateKey(gridStartDate),
    endDateKey: toDateKey(gridEndDate),
  };
}

function getTwoWeekRange(baseDate = new Date()) {
  const weekStartDate = addDays(baseDate, -baseDate.getDay());
  const weekEndDate = addDays(weekStartDate, 13);

  return {
    startDate: weekStartDate,
    endDate: weekEndDate,
    startDateKey: toDateKey(weekStartDate),
    endDateKey: toDateKey(weekEndDate),
  };
}

function getWidgetFetchRange(baseDate = new Date()) {
  const monthRange = getCalendarGridRange(baseDate);
  const twoWeekRange = getTwoWeekRange(baseDate);
  const fetchStartDate =
    parseDateKey(twoWeekRange.startDateKey) < parseDateKey(monthRange.startDateKey)
      ? twoWeekRange.startDate
      : monthRange.startDate;
  const fetchEndDate =
    parseDateKey(twoWeekRange.endDateKey) > parseDateKey(monthRange.endDateKey)
      ? twoWeekRange.endDate
      : monthRange.endDate;

  return {
    startDate: fetchStartDate,
    endDate: fetchEndDate,
    startDateKey: toDateKey(fetchStartDate),
    endDateKey: toDateKey(fetchEndDate),
  };
}

function getDateKeys(startDate, count) {
  return Array.from({ length: count }, (_, index) =>
    toDateKey(addDays(startDate, index)),
  );
}

function sortWidgetItems(items = []) {
  return [...items].sort((a, b) => {
    const dateCompare = String(a.date).localeCompare(String(b.date));
    if (dateCompare !== 0) return dateCompare;

    const timeCompare = String(a.time || '99:99').localeCompare(
      String(b.time || '99:99'),
    );
    if (timeCompare !== 0) return timeCompare;

    const sortCompare = Number(a.sortOrder || 0) - Number(b.sortOrder || 0);
    if (sortCompare !== 0) return sortCompare;

    return String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
  });
}

function groupItemsByDate(items = []) {
  return sortWidgetItems(items).reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});
}

function getRangeDateKeys(range, baseDate) {
  if (range === 'fourDays') return getDateKeys(baseDate, 4);
  if (range === 'twoWeeks') return getDateKeys(getTwoWeekRange(baseDate).startDate, 14);

  const { startDate, endDate } = getCalendarGridRange(baseDate);
  const dayCount = Math.round((endDate - startDate) / 86400000) + 1;
  return getDateKeys(startDate, dayCount);
}

export function buildCalendarWidgetPayload(items = [], options = {}) {
  const baseDate = parseDateKey(toDateKey(options.today || new Date())) || new Date();
  const today = toDateKey(baseDate);
  const monthRange = getMonthRange(baseDate);

  const filteredItems = sortWidgetItems(
    items
      .filter((item) => CALENDAR_WIDGET_TYPES.includes(item.calendarType))
      .map(prepareWidgetItem),
  );

  const widgets = {};

  CALENDAR_WIDGET_TYPES.forEach((calendarType) => {
    const typeItems = filteredItems.filter(
      (item) => item.calendarType === calendarType,
    );
    const typeGroups = groupItemsByDate(typeItems);

    widgets[calendarType] = {};

    CALENDAR_WIDGET_RANGES.forEach((range) => {
      const dateKeys = getRangeDateKeys(range, baseDate);

      widgets[calendarType][range] = {
        calendarType,
        calendarLabel: CALENDAR_WIDGET_LABELS[calendarType],
        range,
        today,
        month: {
          year: baseDate.getFullYear(),
          month: baseDate.getMonth() + 1,
          startDate: monthRange.startDateKey,
          endDate: monthRange.endDateKey,
        },
        days: dateKeys.map((dateKey) => {
          const isCurrentMonth =
            dateKey >= monthRange.startDateKey && dateKey <= monthRange.endDateKey;

          return {
            date: dateKey,
            weekday: KOREAN_WEEKDAYS[(parseDateKey(dateKey) || baseDate).getDay()],
            isToday: dateKey === today,
            isCurrentMonth,
            items: range === 'month' && !isCurrentMonth ? [] : typeGroups[dateKey] || [],
          };
        }),
      };
    });
  });

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    today,
    widgets,
  };
}

export async function fetchCalendarWidgetItems(options = {}) {
  const supabase = await getSupabaseClient();
  const today = new Date();
  const defaultRange = getWidgetFetchRange(today);

  const startDate = toDateKey(options.startDate || defaultRange.startDate);
  const endDate = toDateKey(options.endDate || defaultRange.endDate);

  const { data, error } = await supabase.rpc('get_my_calendar_widget_items', {
    p_start_date: startDate,
    p_end_date: endDate,
  });

  if (error) {
    console.error('[calendar-widget-data] fetch failed:', error.message);
    throw error;
  }

  return (data || []).map(normalizeWidgetItem);
}

export async function fetchCalendarWidgetPayload(options = {}) {
  const items = await fetchCalendarWidgetItems(options);

  return buildCalendarWidgetPayload(items, {
    today: options.today || new Date(),
  });
}
