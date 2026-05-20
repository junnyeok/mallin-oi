// assets/js/modules/calendar-widget-data.js

import { supabase } from './supabase-client.js';

function toDateKey(value) {
  if (!value) return '';

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  return String(value).slice(0, 10);
}

function normalizeWidgetItem(row = {}) {
  return {
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
  };
}

export async function fetchCalendarWidgetItems(options = {}) {
  const today = new Date();
  const defaultEnd = new Date(today);
  defaultEnd.setDate(defaultEnd.getDate() + 30);

  const startDate = toDateKey(options.startDate || today);
  const endDate = toDateKey(options.endDate || defaultEnd);

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
