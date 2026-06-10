// assets/js/modules/calendar-native-widgets.js

import { getCurrentUser } from './auth-store.js';
import { fetchCalendarWidgetPayload } from './calendar-widget-data.js';

const PLUGIN_NAME = 'CalendarWidgets';
const REFRESH_DELAY_MS = 800;

let refreshTimer = null;
let refreshPromise = null;

function isNativeCapacitor() {
  return window.Capacitor?.isNativePlatform?.() === true;
}

function getPlugin() {
  if (!isNativeCapacitor()) return null;

  if (window.Capacitor?.registerPlugin) {
    return window.Capacitor.registerPlugin(PLUGIN_NAME);
  }

  return window.Capacitor?.Plugins?.[PLUGIN_NAME] || null;
}

function getCalendarHref(calendarType = '') {
  if (calendarType === 'work') return './calendar-work.html?app=calendar';
  if (calendarType === 'event') return './calendar-event.html?app=calendar';
  return './calendar-study.html?app=calendar';
}

async function saveLoggedOutPayload(plugin) {
  if (!plugin?.saveWidgetData) return;

  await plugin.saveWidgetData({
    isLoggedIn: false,
    payload: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      today: new Date().toISOString().slice(0, 10),
      widgets: {},
    },
  });
}

export async function refreshCalendarWidgets() {
  const plugin = getPlugin();
  if (!plugin?.saveWidgetData) return false;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const user = await getCurrentUser();

      if (!user) {
        await saveLoggedOutPayload(plugin);
        return true;
      }

      const payload = await fetchCalendarWidgetPayload();
      await plugin.saveWidgetData({
        isLoggedIn: true,
        payload,
      });

      return true;
    } catch (error) {
      console.error('[calendar-native-widgets] refresh failed:', error);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export function scheduleCalendarWidgetRefresh() {
  if (!isNativeCapacitor()) return;

  window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    void refreshCalendarWidgets();
  }, REFRESH_DELAY_MS);
}

export async function consumeCalendarWidgetRoute() {
  const plugin = getPlugin();
  if (!plugin?.consumePendingRoute) return false;

  try {
    const result = await plugin.consumePendingRoute();
    const calendarType = String(result?.calendarType || '').trim();

    if (!calendarType) return false;

    window.location.replace(getCalendarHref(calendarType));
    return true;
  } catch (error) {
    console.error('[calendar-native-widgets] route consume failed:', error);
    return false;
  }
}
