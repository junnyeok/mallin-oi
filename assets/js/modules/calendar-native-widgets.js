// assets/js/modules/calendar-native-widgets.js

const PLUGIN_NAME = 'CalendarWidgets';
const REFRESH_DELAY_MS = 800;

let refreshTimer = null;
let refreshPromise = null;
let authStoreModulePromise = null;
let widgetDataModulePromise = null;
let widgetNavigationReady = null;

function getRuntimeSiteVersion() {
  return String(window.__SITE_VERSION__ || 'dev').trim();
}

function withModuleVersion(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return raw;

  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}v=${encodeURIComponent(getRuntimeSiteVersion())}`;
}

function toLocalDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
  if (!['study', 'work', 'event'].includes(calendarType)) return null;
  return `/calendar-${calendarType}.html?app=calendar`;
}

function isCalendarWidgetUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'mallinoi:' && url.host === 'calendar'
      && !url.pathname && Boolean(getCalendarHref(url.searchParams.get('type')));
  } catch {
    return false;
  }
}

async function loadCalendarWidgetPayloadFetcher() {
  if (!widgetDataModulePromise) {
    widgetDataModulePromise = import(withModuleVersion('./calendar-widget-data.js'));
  }

  const widgetDataModule = await widgetDataModulePromise;
  const fetcher = widgetDataModule?.fetchCalendarWidgetPayload;

  if (typeof fetcher !== 'function') {
    throw new Error(
      '[calendar-native-widgets] fetchCalendarWidgetPayload export is missing',
    );
  }

  return fetcher;
}

async function loadCurrentUserFetcher() {
  if (!authStoreModulePromise) {
    authStoreModulePromise = import(withModuleVersion('./auth-store.js'));
  }

  const authStoreModule = await authStoreModulePromise;
  const fetcher = authStoreModule?.getCurrentUser;

  if (typeof fetcher !== 'function') {
    throw new Error('[calendar-native-widgets] getCurrentUser export is missing');
  }

  return fetcher;
}

async function saveLoggedOutPayload(plugin) {
  if (!plugin?.saveWidgetData) return;

  await plugin.saveWidgetData({
    isLoggedIn: false,
    payload: {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      today: toLocalDateKey(),
      widgets: {},
    },
  });
}

export async function refreshCalendarWidgets({ force = false } = {}) {
  const plugin = getPlugin();
  if (!plugin?.saveWidgetData) return false;

  if (refreshPromise) {
    if (!force) return refreshPromise;
    await refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      const getCurrentUser = await loadCurrentUserFetcher();
      const user = await getCurrentUser();

      if (!user) {
        await saveLoggedOutPayload(plugin);
        return true;
      }

      const fetchCalendarWidgetPayload = await loadCalendarWidgetPayloadFetcher();
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

export async function consumeCalendarWidgetRoute({ navigate = true } = {}) {
  const plugin = getPlugin();
  if (!plugin?.consumePendingRoute) return false;

  try {
    const result = await plugin.consumePendingRoute();
    const href = getCalendarHref(result?.calendarType);

    // Consume a tap on the current calendar without reloading its month or group.
    if (!navigate || !href || window.location.pathname === href.split('?')[0]) return false;

    window.location.replace(href);
    return true;
  } catch (error) {
    console.error('[calendar-native-widgets] route consume failed:', error);
    return false;
  }
}

export async function initCalendarWidgetNavigation({ discardPending = false } = {}) {
  if (!isNativeCapacitor()) return false;

  if (!widgetNavigationReady) {
    widgetNavigationReady = (async () => {
      // An explicit Home tap can leave an older request from a previous app version.
      if (discardPending) await consumeCalendarWidgetRoute({ navigate: false });

      try {
        await window.Capacitor.Plugins?.App?.addListener('appUrlOpen', event => {
          if (isCalendarWidgetUrl(event?.url)) return consumeCalendarWidgetRoute();
        });
      } catch (error) {
        console.error('[calendar-native-widgets] route listener failed:', error);
      }

      // A cold-start URL may arrive before this document can receive events.
      return consumeCalendarWidgetRoute();
    })();
  }

  return widgetNavigationReady;
}
