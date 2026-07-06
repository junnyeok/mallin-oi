const LOCAL_CONFIG_URL = new URL('../../app-version.json', import.meta.url);
const POPUP_ID = 'app-update-popup';
const DISMISS_STORAGE_PREFIX = 'mallinoi_app_update_dismissed';
const DEFAULT_CHECK_INTERVAL_HOURS = 24;

let initializationPromise = null;

function getNativePlatform() {
  const capacitor = window.Capacitor;
  if (capacitor?.isNativePlatform?.() !== true) return '';

  const platform = String(capacitor.getPlatform?.() || '').toLowerCase();
  return platform === 'android' || platform === 'ios' ? platform : '';
}

function normalizeVersion(version) {
  return String(version || '')
    .trim()
    .split(/[+-]/, 1)[0]
    .split('.')
    .map((part) => {
      const match = part.match(/^\d+/);
      return match ? Number(match[0]) : 0;
    });
}

export function compareVersions(left, right) {
  const a = normalizeVersion(left);
  const b = normalizeVersion(right);
  const length = Math.max(a.length, b.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (a[index] || 0) - (b[index] || 0);
    if (difference !== 0) return difference > 0 ? 1 : -1;
  }

  return 0;
}

async function fetchJson(url) {
  const requestUrl = new URL(url, window.location.href);
  requestUrl.searchParams.set('_app_update_check', String(Date.now()));

  const response = await fetch(requestUrl.toString(), {
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`config load failed: ${response.status}`);
  return response.json();
}

function getDismissKey(platform, targetVersion) {
  return `${DISMISS_STORAGE_PREFIX}:${platform}:${targetVersion}`;
}

function wasRecentlyDismissed(platform, targetVersion, hours) {
  try {
    const dismissedAt = Number(
      localStorage.getItem(getDismissKey(platform, targetVersion)),
    );
    const interval = Math.max(Number(hours) || DEFAULT_CHECK_INTERVAL_HOURS, 1);
    return dismissedAt > 0 && Date.now() - dismissedAt < interval * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

function rememberDismissal(platform, targetVersion) {
  try {
    localStorage.setItem(
      getDismissKey(platform, targetVersion),
      String(Date.now()),
    );
  } catch {
    // 저장소가 막힌 환경에서는 다음 앱 시작 때 다시 안내한다.
  }
}

function ensureStylesheet() {
  if (document.querySelector('link[data-app-update-popup-style]')) return;

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../../css/components/app-update-popup.css', import.meta.url);
  link.dataset.appUpdatePopupStyle = 'true';
  document.head.appendChild(link);
}

function openStore(url) {
  const opened = window.open(url, '_system', 'noopener,noreferrer');
  if (!opened) window.location.href = url;
}

function showPopup({ platform, targetVersion, required, storeUrl }) {
  if (document.getElementById(POPUP_ID)) return;

  ensureStylesheet();
  const overlay = document.createElement('div');
  overlay.id = POPUP_ID;
  overlay.className = 'app-update-popup';
  overlay.dataset.required = String(required);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', `${POPUP_ID}-title`);
  overlay.innerHTML = `
    <div class="app-update-popup__card">
      <div class="app-update-popup__icon" aria-hidden="true">🥒</div>
      <h2 id="${POPUP_ID}-title">말린오이 캘린더 업데이트가 있어</h2>
      <p>더 안정적인 이용을 위해 최신 버전으로 업데이트해줘.</p>
      <div class="app-update-popup__actions">
        <button type="button" class="app-update-popup__update">업데이트하러 가기</button>
        ${required ? '' : '<button type="button" class="app-update-popup__later">나중에</button>'}
      </div>
    </div>
  `;

  overlay.querySelector('.app-update-popup__update')?.addEventListener('click', () => {
    openStore(storeUrl);
  });
  overlay.querySelector('.app-update-popup__later')?.addEventListener('click', () => {
    rememberDismissal(platform, targetVersion);
    overlay.remove();
  });
  document.body.appendChild(overlay);
}

async function checkForAppUpdate() {
  const platform = getNativePlatform();
  if (!platform) return;

  const localConfig = await fetchJson(LOCAL_CONFIG_URL);
  const installedVersion = String(localConfig.buildVersions?.[platform] || '').trim();
  const remoteUrl = String(localConfig.remoteConfigUrl || '').trim();
  if (!installedVersion || !remoteUrl) return;

  const remoteConfig = await fetchJson(remoteUrl);
  const platformConfig = remoteConfig.platforms?.[platform];
  const latestVersion = String(platformConfig?.latestVersion || '').trim();
  const minimumVersion = String(platformConfig?.minimumVersion || '').trim();
  const storeUrl = String(platformConfig?.storeUrl || '').trim();
  if (!latestVersion || !storeUrl || compareVersions(latestVersion, installedVersion) <= 0) {
    return;
  }

  const required =
    platformConfig.required === true ||
    (minimumVersion && compareVersions(minimumVersion, installedVersion) > 0);
  const checkIntervalHours =
    Number(remoteConfig.checkIntervalHours) || DEFAULT_CHECK_INTERVAL_HOURS;

  if (!required && wasRecentlyDismissed(platform, latestVersion, checkIntervalHours)) {
    return;
  }

  showPopup({ platform, targetVersion: latestVersion, required, storeUrl });
}

export function initAppUpdatePopup() {
  if (initializationPromise) return initializationPromise;

  initializationPromise = checkForAppUpdate().catch(() => {
    // 네트워크/설정 오류는 앱 사용을 막지 않고 조용히 무시한다.
  });
  return initializationPromise;
}
