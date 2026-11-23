// assets/js/modules/calendar-native-widgets.js

const PLUGIN_NAME = 'CalendarWidgets';
const REFRESH_DELAY_MS = 800;

let refreshTimer = null;
let refreshPromise = null;
let queuedRefresh = null;
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
    if (!queuedRefresh) {
      queuedRefresh = refreshPromise.then(() => {
        queuedRefresh = null;
        return refreshCalendarWidgets();
      });
    }
    return queuedRefresh;
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
      const options = { currentUserId: user.id };
      if (window.Capacitor?.getPlatform?.() === 'ios' && plugin.saveWidgetGroupChoices) {
        options.onGroupChoices = async (groups) => {
          try {
            if ((await getCurrentUser())?.id === user.id) {
              await plugin.saveWidgetGroupChoices({ accountId: user.id, groups });
            }
          } catch (error) {
            console.warn('[calendar-native-widgets] group choices update failed:', error);
          }
        };
      }
      const payload = await fetchCalendarWidgetPayload(options);
      if ((await getCurrentUser())?.id !== user.id) return false;
      await plugin.saveWidgetData({
        isLoggedIn: true,
        accountId: user.id,
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
    void refreshCalendarWidgets({ force: true });
  }, REFRESH_DELAY_MS);
}

export async function consumeCalendarWidgetRoute({ navigate = true } = {}) {
  const plugin = getPlugin();
  if (!plugin?.consumePendingRoute) return false;

  try {
    const result = await plugin.consumePendingRoute();
    const href = getCalendarHref(result?.calendarType);

    // A group tap can change the group without changing the calendar type.
    if (!navigate || !href) return false;
    if (result.groupId) {
      window.location.replace(href + '&widgetGroup=' + encodeURIComponent(result.groupId));
      return true;
    }
    if (window.location.pathname === href.split('?')[0]) return false;

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

      globalThis.document?.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') scheduleCalendarWidgetRefresh();
      });

      // A cold-start URL may arrive before this document can receive events.
      return consumeCalendarWidgetRoute();
    })();
  }

  return widgetNavigationReady;
}
