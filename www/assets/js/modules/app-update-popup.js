const LOCAL_CONFIG_URL = new URL('../../app-version.json', import.meta.url);
const POPUP_ID = 'app-update-popup';
const DISMISS_STORAGE_PREFIX = 'mallinoi_app_update_dismissed';
const DEFAULT_CHECK_INTERVAL_HOURS = 24;
const REQUEST_TIMEOUT_MS = 8000;
const UPDATE_STATE_KEY = '__mallinAppUpdateState';

const updateState = (globalThis[UPDATE_STATE_KEY] ||= {
  initializationPromise: null,
  checkPromise: null,
  foregroundListenerBound: false,
  lastCheckedAt: 0,
});

function getNativePlatform() {
  const capacitor = window.Capacitor;
  if (capacitor?.isNativePlatform?.() !== true) return '';

  const platform = String(capacitor.getPlatform?.() || '').toLowerCase();
  return platform === 'android' || platform === 'ios' ? platform : '';
}

function normalizeVersion(version) {
  const normalized = String(version || '')
    .trim()
    .replace(/^v\s*/i, '')
    .split(/[+-]/, 1)[0];

  if (!/^\d+(?:\.\d+)*$/.test(normalized)) return null;
  return normalized.split('.').map((part) => Number(part));
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

function normalizeBuild(build) {
  const value = Number(build);
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

async function fetchJson(url) {
  const requestUrl = new URL(url, window.location.href);
  requestUrl.searchParams.set('_app_update_check', String(Date.now()));
  const controller = new AbortController();
  const timeoutId = window.setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS,
  );

  try {
    const response = await fetch(requestUrl.toString(), {
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache, no-store, max-age=0',
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`config load failed: ${response.status}`);

    const contentType = String(response.headers.get('content-type') || '');
    if (!contentType.toLowerCase().includes('json')) {
      throw new Error('config response is not JSON');
    }
    return await response.json();
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function getInstalledAppInfo() {
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (typeof appPlugin?.getInfo !== 'function') {
    throw new Error('Capacitor App plugin is unavailable');
  }

  const info = await appPlugin.getInfo();
  const version = String(info?.version || '').trim();
  const build = normalizeBuild(info?.build);
  if (!normalizeVersion(version) || build === null) {
    throw new Error('installed app version is invalid');
  }
  return { version, build };
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
    target: latestBuild !== null ? String(latestBuild) : latestVersion,
    latestVersion,
  };
}

function getDismissKey(platform, target) {
  return `${DISMISS_STORAGE_PREFIX}:${platform}:${target}`;
}

function wasRecentlyDismissed(platform, target, hours) {
  try {
    const dismissedAt = Number(
      localStorage.getItem(getDismissKey(platform, target)),
    );
    const interval = Math.max(Number(hours) || DEFAULT_CHECK_INTERVAL_HOURS, 1);
    return (
      dismissedAt > 0 && Date.now() - dismissedAt < interval * 60 * 60 * 1000
    );
  } catch {
    return false;
  }
}

function rememberDismissal(platform, target) {
  try {
    localStorage.setItem(getDismissKey(platform, target), String(Date.now()));
  } catch {
    // 저장소가 막힌 환경에서는 다음 앱 시작 때 다시 안내한다.
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

async function openStore(url) {
  const storeUrl = String(url || '').trim();
  if (!/^https:\/\//i.test(storeUrl)) {
    throw new Error('store URL is invalid');
  }

  const launcher = window.Capacitor?.Plugins?.AppLauncher;
  if (typeof launcher?.openUrl === 'function') {
    await launcher.openUrl({ url: storeUrl });
    return;
  }

  const opened = window.open(storeUrl, '_system', 'noopener,noreferrer');
  if (!opened) window.location.assign(storeUrl);
}

function showPopup({ platform, decision, storeUrl }) {
  if (document.getElementById(POPUP_ID)) return;
  ensureStylesheet();

  const overlay = document.createElement('div');
  overlay.id = POPUP_ID;
  overlay.className = 'app-update-popup';
  overlay.dataset.required = String(decision.required);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', `${POPUP_ID}-title`);
  overlay.innerHTML = `
    <div class="app-update-popup__card">
      <div class="app-update-popup__icon" aria-hidden="true">🥒</div>
      <h2 id="${POPUP_ID}-title">말린오이 캘린더 업데이트가 있어</h2>
      <p>더 안정적인 이용을 위해 최신 버전으로 업데이트해줘.</p>
      <p class="app-update-popup__error" role="alert" hidden></p>
      <div class="app-update-popup__actions">
        <button type="button" class="app-update-popup__update">업데이트하러 가기</button>
        ${
          decision.required
            ? ''
            : '<button type="button" class="app-update-popup__later">나중에</button>'
        }
      </div>
    </div>
  `;

  const updateButton = overlay.querySelector('.app-update-popup__update');
  const errorElement = overlay.querySelector('.app-update-popup__error');
  updateButton?.addEventListener('click', async () => {
    updateButton.disabled = true;
    try {
      await openStore(storeUrl);
    } catch (error) {
      console.warn('[app-update] store open failed:', error);
      if (errorElement) {
        errorElement.hidden = false;
        errorElement.textContent =
          '스토어를 열지 못했어. 잠시 후 다시 시도해줘.';
      }
    } finally {
      updateButton.disabled = false;
    }
  });
  overlay
    .querySelector('.app-update-popup__later')
    ?.addEventListener('click', () => {
      rememberDismissal(platform, decision.target);
      overlay.remove();
    });
  document.body.appendChild(overlay);
}

async function checkForAppUpdate({ ignoreInterval = false } = {}) {
  const platform = getNativePlatform();
  if (!platform || document.getElementById(POPUP_ID)) return;

  const intervalMs = DEFAULT_CHECK_INTERVAL_HOURS * 60 * 60 * 1000;
  if (!ignoreInterval && Date.now() - updateState.lastCheckedAt < intervalMs)
    return;

  const localConfig = await fetchJson(LOCAL_CONFIG_URL);
  const remoteUrl = String(localConfig?.remoteConfigUrl || '').trim();
  if (!/^https:\/\//i.test(remoteUrl))
    throw new Error('remote config URL is invalid');

  const [installed, remoteConfig] = await Promise.all([
    getInstalledAppInfo(),
    fetchJson(remoteUrl),
  ]);
  updateState.lastCheckedAt = Date.now();

  const platformConfig = remoteConfig?.platforms?.[platform];
  const storeUrl = String(platformConfig?.storeUrl || '').trim();
  const decision = getUpdateDecision(installed, platformConfig);
  if (!decision) {
    console.warn('[app-update] invalid version config');
    return;
  }
  if (!decision.hasUpdate) return;
  if (!/^https:\/\//i.test(storeUrl)) {
    console.warn('[app-update] invalid store URL');
    return;
  }

  const hours =
    Number(remoteConfig.checkIntervalHours) || DEFAULT_CHECK_INTERVAL_HOURS;
  if (
    !decision.required &&
    wasRecentlyDismissed(platform, decision.target, hours)
  )
    return;
  showPopup({ platform, decision, storeUrl });
}

function runUpdateCheck(options) {
  if (updateState.checkPromise) return updateState.checkPromise;
  updateState.checkPromise = checkForAppUpdate(options)
    .catch((error) => console.warn('[app-update] check skipped:', error))
    .finally(() => {
      updateState.checkPromise = null;
    });
  return updateState.checkPromise;
}

function bindForegroundCheck() {
  if (updateState.foregroundListenerBound) return;
  const appPlugin = window.Capacitor?.Plugins?.App;
  if (typeof appPlugin?.addListener !== 'function') return;

  updateState.foregroundListenerBound = true;
  appPlugin.addListener('appStateChange', (state) => {
    if (state?.isActive) void runUpdateCheck();
  });
}

export function initAppUpdatePopup() {
  if (updateState.initializationPromise)
    return updateState.initializationPromise;
  if (!getNativePlatform()) return Promise.resolve();

  updateState.initializationPromise = Promise.resolve().then(() => {
    bindForegroundCheck();
    return runUpdateCheck({ ignoreInterval: true });
  });
  return updateState.initializationPromise;
}
