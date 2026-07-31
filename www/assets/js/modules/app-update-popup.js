const LOCAL_CONFIG_URL = new URL('../../app-version.json', import.meta.url);
const POPUP_ID = 'app-update-popup';
const DISMISS_STORAGE_PREFIX = 'mallinoi_app_update_dismissed';
const DEFAULT_CHECK_INTERVAL_HOURS = 24;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;
const DEFAULT_FAILURE_RETRY_MINUTES = 15;
const UPDATE_STATE_KEY = '__mallinAppUpdateState';

const ANDROID_PACKAGE_ID = 'com.mallinoi.calendar';
const IOS_BUNDLE_ID = 'com.mallinoi.calendar';
const IOS_APP_STORE_ID = '6774468038';
const IOS_STORE_COUNTRY = 'kr';

const PLAY_UPDATE_AVAILABILITY = Object.freeze({
  UNKNOWN: 0,
  NOT_AVAILABLE: 1,
  AVAILABLE: 2,
  IN_PROGRESS: 3,
});

const updateState = (globalThis[UPDATE_STATE_KEY] ||= {
  initializationPromise: null,
  checkPromise: null,
  foregroundListenerBound: false,
  lastCheckedAt: 0,
  nextCheckAt: 0,
  checkIntervalHours: DEFAULT_CHECK_INTERVAL_HOURS,
});

export function getNativePlatform(capacitor = globalThis.window?.Capacitor) {
  if (capacitor?.isNativePlatform?.() !== true) return '';

  const platform = String(capacitor.getPlatform?.() || '').toLowerCase();
  return platform === 'android' || platform === 'ios' ? platform : '';
}

export function normalizeVersion(version) {
  const normalized = String(version ?? '')
    .trim()
    .replace(/^v\s*/i, '')
    .split('+', 1)[0];

  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null;

  const parts = normalized.split('.').map(Number);
  return parts.every((part) => Number.isSafeInteger(part) && part >= 0)
    ? parts
    : null;
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  if (!a || !b) return null;

  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }
  return 0;
}

export function normalizeBuild(build) {
  if (build === null || build === undefined || build === '') return null;
  if (typeof build === 'string' && !/^\d+$/.test(build.trim())) return null;
  const value = Number(build);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function getPositiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function isAllowedRemoteConfigUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'mallin-oi.com' ||
        parsed.hostname === 'www.mallin-oi.com') &&
      parsed.pathname === '/assets/app-version.json' &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export async function withTimeout(
  promise,
  timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  label = 'request',
) {
  let timeoutId;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timeoutId = globalThis.setTimeout(() => {
          const error = new Error(`${label} timed out`);
          error.name = 'TimeoutError';
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

export async function fetchJsonResource(
  url,
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    acceptedContentTypes = ['application/json'],
    cacheBust = true,
  } = {},
) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');

  const baseUrl = globalThis.window?.location?.href || LOCAL_CONFIG_URL.href;
  const requestUrl = new URL(url, baseUrl);
  if (cacheBust) {
    requestUrl.searchParams.set('_app_update_check', String(Date.now()));
  }

  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(requestUrl.toString(), {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response?.ok) {
      throw new Error(`JSON request failed: ${response?.status ?? 'unknown'}`);
    }

    const contentType = String(response.headers?.get?.('content-type') || '')
      .toLowerCase();
    if (
      !acceptedContentTypes.some((allowed) =>
        contentType.includes(String(allowed).toLowerCase()),
      )
    ) {
      throw new Error('response is not an allowed JSON content type');
    }

    return await response.json();
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function mergeUpdateConfig(localConfig, remoteConfig) {
  return {
    ...localConfig,
    ...remoteConfig,
    platforms: {
      android: {
        ...localConfig?.platforms?.android,
        ...remoteConfig?.platforms?.android,
      },
      ios: {
        ...localConfig?.platforms?.ios,
        ...remoteConfig?.platforms?.ios,
      },
    },
  };
}

async function loadUpdateConfig() {
  const localConfig = await fetchJsonResource(LOCAL_CONFIG_URL);
  const remoteUrl = String(localConfig?.remoteConfigUrl || '').trim();
  if (!remoteUrl) return localConfig;
  if (!isAllowedRemoteConfigUrl(remoteUrl)) {
    console.warn('[app-update] remote config URL is not allowed');
    return localConfig;
  }

  try {
    const remoteConfig = await fetchJsonResource(remoteUrl);
    return mergeUpdateConfig(localConfig, remoteConfig);
  } catch (error) {
    console.warn('[app-update] remote config unavailable; using bundled policy:', error);
    return localConfig;
  }
}

export async function getInstalledAppInfo() {
  const appPlugin = globalThis.window?.Capacitor?.Plugins?.App;
  if (typeof appPlugin?.getInfo !== 'function') {
    throw new Error('Capacitor App plugin is unavailable');
  }

  const info = await appPlugin.getInfo();
  const version = String(info?.version || '').trim();
  const build = normalizeBuild(info?.build);
  if (!normalizeVersion(version) || build === null) {
    throw new Error('installed app version is invalid');
  }

  return {
    id: String(info?.id || '').trim(),
    version,
    build,
  };
}

export function getUpdateDecision(installed, platformConfig) {
  const installedBuild = normalizeBuild(installed?.build);
  const latestBuild = normalizeBuild(platformConfig?.latestBuild);
  const minimumBuild = normalizeBuild(platformConfig?.minimumBuild);
  const latestVersion = String(platformConfig?.latestVersion || '').trim();
  const minimumVersion = String(platformConfig?.minimumVersion || '').trim();

  let hasUpdate;
  let belowMinimum;
  if (installedBuild !== null && latestBuild !== null) {
    hasUpdate = installedBuild < latestBuild;
    belowMinimum = minimumBuild !== null && installedBuild < minimumBuild;
  } else {
    const latestComparison = compareVersions(latestVersion, installed?.version);
    const minimumComparison = minimumVersion
      ? compareVersions(minimumVersion, installed?.version)
      : 0;
    if (latestComparison === null || minimumComparison === null) return null;
    hasUpdate = latestComparison > 0;
    belowMinimum = minimumComparison > 0;
  }

  return {
    hasUpdate,
    required:
      hasUpdate && (belowMinimum || platformConfig?.forceUpdate === true),
    target: latestBuild !== null ? `build:${latestBuild}` : `version:${latestVersion}`,
    latestVersion,
  };
}

export function parseAndroidUpdateInfo(payload) {
  const availability = normalizeBuild(payload?.updateAvailability);
  const availableBuild = normalizeBuild(payload?.availableVersionCode);
  if (
    availability === PLAY_UPDATE_AVAILABILITY.AVAILABLE ||
    availability === PLAY_UPDATE_AVAILABILITY.IN_PROGRESS
  ) {
    if (availableBuild === null) return null;
    return {
      status: 'updateAvailable',
      availableBuild,
      updatePriority: normalizeBuild(payload?.updatePriority),
      stalenessDays: normalizeBuild(payload?.clientVersionStalenessDays),
    };
  }
  if (availability === PLAY_UPDATE_AVAILABILITY.NOT_AVAILABLE) {
    return { status: 'notAvailable', availableBuild: null };
  }
  if (availability === PLAY_UPDATE_AVAILABILITY.UNKNOWN) {
    return { status: 'unavailable', availableBuild: null };
  }
  return null;
}

function isBelowMinimum(installed, config) {
  const installedBuild = normalizeBuild(installed?.build);
  const minimumBuild = normalizeBuild(config?.minimumBuild);
  if (installedBuild !== null && minimumBuild !== null) {
    return installedBuild < minimumBuild;
  }

  if (!config?.minimumVersion) return false;
  return compareVersions(config.minimumVersion, installed?.version) === 1;
}

export function getAndroidStoreDecision(installed, storePayload, config = {}) {
  const storeInfo = parseAndroidUpdateInfo(storePayload);
  if (!storeInfo) return null;
  if (storeInfo.status !== 'updateAvailable') {
    return {
      hasUpdate: false,
      source: 'google-play',
      status: storeInfo.status,
    };
  }

  const installedBuild = normalizeBuild(installed?.build);
  if (installedBuild === null || storeInfo.availableBuild <= installedBuild) {
    return {
      hasUpdate: false,
      source: 'google-play',
      status: 'notNewer',
    };
  }

  const configuredBuild = normalizeBuild(config?.latestBuild);
  const configuredVersion = normalizeVersion(config?.latestVersion)
    ? String(config.latestVersion).trim()
    : '';
  const configMatchesStore = configuredBuild === storeInfo.availableBuild;
  const latestLabel =
    configMatchesStore && configuredVersion
      ? `${configuredVersion} (빌드 ${storeInfo.availableBuild})`
      : `Google Play 제공 빌드 ${storeInfo.availableBuild}`;

  return {
    hasUpdate: true,
    source: 'google-play',
    target: `build:${storeInfo.availableBuild}`,
    latestVersion: configuredVersion && configMatchesStore ? configuredVersion : '',
    latestBuild: storeInfo.availableBuild,
    latestLabel,
    required:
      isBelowMinimum(installed, config) ||
      (config?.forceUpdate === true && configMatchesStore),
    configConflict:
      configuredBuild !== null && configuredBuild !== storeInfo.availableBuild,
  };
}

export function parseIosLookupResponse(payload) {
  if (!payload || normalizeBuild(payload.resultCount) === null) return null;
  if (payload.resultCount < 1 || !Array.isArray(payload.results)) return null;

  const result = payload.results.find(
    (item) =>
      String(item?.trackId) === IOS_APP_STORE_ID &&
      String(item?.bundleId || '') === IOS_BUNDLE_ID,
  );
  const version = String(result?.version || '').trim();
  if (!result || !normalizeVersion(version)) return null;

  return { version };
}

export function getIosStoreDecision(installed, lookupPayload, config = {}) {
  const storeInfo = parseIosLookupResponse(lookupPayload);
  if (!storeInfo) return null;

  const comparison = compareVersions(storeInfo.version, installed?.version);
  if (comparison === null) return null;
  if (comparison <= 0) {
    return {
      hasUpdate: false,
      source: 'app-store',
      status: comparison === 0 ? 'notAvailable' : 'installedIsNewer',
    };
  }

  const configMatchesStore =
    compareVersions(config?.latestVersion, storeInfo.version) === 0;
  return {
    hasUpdate: true,
    source: 'app-store',
    target: `version:${storeInfo.version}`,
    latestVersion: storeInfo.version,
    latestBuild: null,
    latestLabel: storeInfo.version,
    required:
      isBelowMinimum(installed, config) ||
      (config?.forceUpdate === true && configMatchesStore),
    configConflict:
      Boolean(normalizeVersion(config?.latestVersion)) && !configMatchesStore,
  };
}

async function queryAndroidStore(timeoutMs) {
  const plugin = globalThis.window?.Capacitor?.Plugins?.StoreUpdate;
  if (typeof plugin?.getUpdateInfo !== 'function') {
    throw new Error('Google Play update bridge is unavailable');
  }
  return withTimeout(
    plugin.getUpdateInfo(),
    timeoutMs,
    'Google Play update check',
  );
}

function getIosLookupUrl(config = {}) {
  const configuredCountry = String(config.storeCountry || '').toLowerCase();
  const country = /^[a-z]{2}$/.test(configuredCountry)
    ? configuredCountry
    : IOS_STORE_COUNTRY;
  const url = new URL('https://itunes.apple.com/lookup');
  url.searchParams.set('id', IOS_APP_STORE_ID);
  url.searchParams.set('country', country);
  url.searchParams.set('entity', 'software');
  return url;
}

async function queryIosStore(config, timeoutMs) {
  return fetchJsonResource(getIosLookupUrl(config), {
    timeoutMs,
    acceptedContentTypes: ['application/json', 'text/javascript'],
  });
}

export function isAllowedStoreUrl(platform, value) {
  try {
    const url = new URL(String(value || ''));
    if (url.username || url.password) return false;

    if (platform === 'android') {
      if (url.protocol === 'market:') {
        return (
          url.hostname === 'details' &&
          url.searchParams.get('id') === ANDROID_PACKAGE_ID
        );
      }
      return (
        url.protocol === 'https:' &&
        url.hostname === 'play.google.com' &&
        url.pathname === '/store/apps/details' &&
        url.searchParams.get('id') === ANDROID_PACKAGE_ID
      );
    }

    if (platform === 'ios') {
      const allowedHost =
        url.hostname === 'apps.apple.com' || url.hostname === 'itunes.apple.com';
      return (
        allowedHost &&
        (url.protocol === 'https:' || url.protocol === 'itms-apps:') &&
        url.pathname.includes(`/id${IOS_APP_STORE_ID}`)
      );
    }
  } catch {
    return false;
  }
  return false;
}

export function getStoreLinks(platform, config = {}) {
  if (platform === 'android') {
    const configuredUrl = String(config.storeUrl || '').trim();
    return {
      primary: `market://details?id=${ANDROID_PACKAGE_ID}`,
      fallback: isAllowedStoreUrl('android', configuredUrl)
        ? configuredUrl
        : `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE_ID}`,
    };
  }
  if (platform === 'ios') {
    const configuredUrl = String(config.storeUrl || '').trim();
    return {
      primary: `itms-apps://itunes.apple.com/app/id${IOS_APP_STORE_ID}`,
      fallback: isAllowedStoreUrl('ios', configuredUrl)
        ? configuredUrl
        : `https://apps.apple.com/${IOS_STORE_COUNTRY}/app/id${IOS_APP_STORE_ID}`,
    };
  }
  return null;
}

export async function openStore(
  platform,
  config = {},
  launcher = globalThis.window?.Capacitor?.Plugins?.AppLauncher,
) {
  const links = getStoreLinks(platform, config);
  if (!links) throw new Error('unsupported store platform');
  if (typeof launcher?.openUrl !== 'function') {
    throw new Error('Capacitor AppLauncher plugin is unavailable');
  }

  for (const url of [links.primary, links.fallback]) {
    if (!isAllowedStoreUrl(platform, url)) continue;
    try {
      const result = await launcher.openUrl({ url });
      if (result?.completed === true) return url;
    } catch (error) {
      console.warn('[app-update] store URL open attempt failed:', error);
    }
  }

  throw new Error('store app and HTTPS fallback could not be opened');
}

export function getDismissKey(platform, target) {
  return `${DISMISS_STORAGE_PREFIX}:${platform}:${target}`;
}

export function wasRecentlyDismissed(
  platform,
  target,
  hours,
  { storage = globalThis.localStorage, now = Date.now() } = {},
) {
  try {
    const dismissedAt = Number(storage?.getItem(getDismissKey(platform, target)));
    const interval = getPositiveNumber(hours, DEFAULT_CHECK_INTERVAL_HOURS);
    return (
      dismissedAt > 0 && now - dismissedAt < interval * 60 * 60 * 1000
    );
  } catch {
    return false;
  }
}

function rememberDismissal(platform, target) {
  try {
    globalThis.localStorage?.setItem(
      getDismissKey(platform, target),
      String(Date.now()),
    );
  } catch {
    // 저장소가 막힌 환경에서는 앱 기능을 계속 사용하도록 조용히 닫는다.
  }
}

function ensureStylesheet() {
  if (document.querySelector('link[data-app-update-popup-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL(
    '../../css/components/app-update-popup.css',
    import.meta.url,
  );
  link.dataset.appUpdatePopupStyle = 'true';
  document.head.appendChild(link);
}

function restoreFocus(element) {
  if (element?.isConnected && typeof element.focus === 'function') {
    element.focus({ preventScroll: true });
  }
}

export function showPopup({ platform, installed, decision, platformConfig }) {
  if (document.getElementById(POPUP_ID)) return false;
  ensureStylesheet();

  const previousFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.id = POPUP_ID;
  overlay.className = 'app-update-popup';
  overlay.dataset.required = String(decision.required);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', `${POPUP_ID}-title`);
  overlay.setAttribute(
    'aria-describedby',
    `${POPUP_ID}-versions ${POPUP_ID}-description`,
  );
  overlay.innerHTML = `
    <div class="app-update-popup__card">
      <div class="app-update-popup__icon" aria-hidden="true">🥒</div>
      <h2 id="${POPUP_ID}-title">말린오이 캘린더 업데이트가 있어</h2>
      <dl id="${POPUP_ID}-versions" class="app-update-popup__versions">
        <div>
          <dt>현재 버전</dt>
          <dd class="app-update-popup__current-version"></dd>
        </div>
        <div>
          <dt>최신 버전</dt>
          <dd class="app-update-popup__latest-version"></dd>
        </div>
      </dl>
      <p id="${POPUP_ID}-description">더 안정적인 이용을 위해 최신 버전으로 업데이트해줘.</p>
      <p class="app-update-popup__error" role="alert" hidden></p>
      <div class="app-update-popup__actions">
        <button type="button" class="app-update-popup__update">업데이트</button>
        ${
          decision.required
            ? ''
            : '<button type="button" class="app-update-popup__later">나중에</button>'
        }
      </div>
    </div>
  `;

  const currentElement = overlay.querySelector(
    '.app-update-popup__current-version',
  );
  const latestElement = overlay.querySelector(
    '.app-update-popup__latest-version',
  );
  if (currentElement) {
    currentElement.textContent = `${installed.version} (빌드 ${installed.build})`;
  }
  if (latestElement) latestElement.textContent = decision.latestLabel;

  const updateButton = overlay.querySelector('.app-update-popup__update');
  const laterButton = overlay.querySelector('.app-update-popup__later');
  const errorElement = overlay.querySelector('.app-update-popup__error');

  const closePopup = () => {
    rememberDismissal(platform, decision.target);
    document.removeEventListener('keydown', handleKeydown);
    overlay.remove();
    restoreFocus(previousFocus);
  };

  const handleKeydown = (event) => {
    if (event.key === 'Escape' && !decision.required) {
      event.preventDefault();
      closePopup();
      return;
    }
    if (event.key !== 'Tab') return;

    const focusable = [...overlay.querySelectorAll('button:not([disabled])')];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  updateButton?.addEventListener('click', async () => {
    if (updateButton.disabled) return;
    updateButton.disabled = true;
    updateButton.setAttribute('aria-busy', 'true');
    if (errorElement) errorElement.hidden = true;
    try {
      await openStore(platform, platformConfig);
    } catch (error) {
      console.warn('[app-update] store open failed:', error);
      if (errorElement) {
        errorElement.hidden = false;
        errorElement.textContent =
          '스토어를 열지 못했어. 네트워크를 확인하고 다시 시도해줘.';
      }
    } finally {
      updateButton.disabled = false;
      updateButton.removeAttribute('aria-busy');
    }
  });
  laterButton?.addEventListener('click', closePopup);
  document.addEventListener('keydown', handleKeydown);
  document.body.appendChild(overlay);
  updateButton?.focus({ preventScroll: true });
  return true;
}

async function checkForAppUpdate({ ignoreInterval = false } = {}) {
  const platform = getNativePlatform();
  if (!platform || document.getElementById(POPUP_ID)) return;
  if (globalThis.navigator?.onLine === false) {
    console.info('[app-update] check skipped while offline');
    return;
  }

  if (!ignoreInterval && Date.now() < Number(updateState.nextCheckAt || 0)) {
    return;
  }

  // 실패한 요청도 짧은 포그라운드 반복으로 재호출되지 않게 시작 시각을 기록한다.
  updateState.lastCheckedAt = Date.now();
  updateState.nextCheckAt =
    updateState.lastCheckedAt + DEFAULT_FAILURE_RETRY_MINUTES * 60 * 1000;
  const [installed, config] = await Promise.all([
    getInstalledAppInfo(),
    loadUpdateConfig(),
  ]);
  const expectedId = platform === 'android' ? ANDROID_PACKAGE_ID : IOS_BUNDLE_ID;
  if (installed.id && installed.id !== expectedId) {
    throw new Error('installed app identifier does not match update configuration');
  }

  updateState.checkIntervalHours = getPositiveNumber(
    config?.checkIntervalHours,
    DEFAULT_CHECK_INTERVAL_HOURS,
  );
  updateState.nextCheckAt =
    updateState.lastCheckedAt +
    getPositiveNumber(
      config?.failureRetryMinutes,
      DEFAULT_FAILURE_RETRY_MINUTES,
    ) *
      60 *
      1000;
  const platformConfig = config?.platforms?.[platform] || {};
  const timeoutMs = getPositiveNumber(
    config?.requestTimeoutMs,
    DEFAULT_REQUEST_TIMEOUT_MS,
  );

  let decision;
  if (platform === 'android') {
    const storePayload = await queryAndroidStore(timeoutMs);
    decision = getAndroidStoreDecision(installed, storePayload, platformConfig);
  } else {
    const lookupPayload = await queryIosStore(platformConfig, timeoutMs);
    decision = getIosStoreDecision(installed, lookupPayload, platformConfig);
  }

  if (!decision) {
    console.warn('[app-update] store response was invalid; no popup shown');
    return;
  }
  if (decision.status === 'unavailable') {
    console.info('[app-update] store check unavailable; retry interval kept');
    return;
  }
  updateState.nextCheckAt =
    Date.now() + updateState.checkIntervalHours * 60 * 60 * 1000;
  if (decision.configConflict) {
    console.warn(
      '[app-update] store and remote latest-version metadata differ; store result wins',
      {
        platform,
        configuredVersion: platformConfig.latestVersion,
        configuredBuild: platformConfig.latestBuild,
        storeVersion: decision.latestVersion,
        storeBuild: decision.latestBuild,
      },
    );
  }
  if (!decision.hasUpdate) return;

  if (
    !decision.required &&
    wasRecentlyDismissed(
      platform,
      decision.target,
      updateState.checkIntervalHours,
    )
  ) {
    return;
  }

  showPopup({ platform, installed, decision, platformConfig });
}

export function runSingleFlight(state, key, task) {
  if (state[key]) return state[key];
  state[key] = Promise.resolve()
    .then(task)
    .finally(() => {
      state[key] = null;
    });
  return state[key];
}

function runUpdateCheck(options) {
  return runSingleFlight(updateState, 'checkPromise', () =>
    checkForAppUpdate(options).catch((error) =>
      console.warn('[app-update] check skipped:', error),
    ),
  );
}

function bindForegroundCheck() {
  if (updateState.foregroundListenerBound) return;
  const appPlugin = globalThis.window?.Capacitor?.Plugins?.App;
  if (typeof appPlugin?.addListener !== 'function') {
    console.warn('[app-update] foreground listener unavailable');
    return;
  }

  updateState.foregroundListenerBound = true;
  Promise.resolve(
    appPlugin.addListener('appStateChange', (state) => {
      if (state?.isActive) void runUpdateCheck();
    }),
  ).catch((error) => {
    updateState.foregroundListenerBound = false;
    console.warn('[app-update] foreground listener registration failed:', error);
  });
}

export function initAppUpdatePopup() {
  if (updateState.initializationPromise) return updateState.initializationPromise;
  if (!getNativePlatform()) return Promise.resolve();

  updateState.initializationPromise = Promise.resolve().then(() => {
    bindForegroundCheck();
    // 업데이트 확인은 로그인·캘린더 초기화를 막지 않도록 백그라운드로 시작한다.
    void runUpdateCheck({ ignoreInterval: true });
  });
  return updateState.initializationPromise;
}
