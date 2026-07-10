// sw.js

const SITE_VERSION = '20260710-03';

const STATIC_CACHE = `mallin-static-${SITE_VERSION}`;
const HTML_CACHE = `mallin-html-${SITE_VERSION}`;

const OFFLINE_URL = './offline.html';

const APP_SHELL_FILES = [
  './',
  './index.html',
  './privacy.html',
  './app-calendar.html',
  './prev-mypage.html',
  './mypage.html',
  './calendar-study.html',
  './calendar-work.html',
  './calendar-event.html',
  './calendar-groups.html',
  './offline.html',

  './site.webmanifest',
  './assets/version.json',
  './assets/app-version.json',

  './assets/css/00-reset.css',
  './assets/css/01-tokens.css',
  './assets/css/02-base.css',
  './assets/css/03-layout.css',
  './assets/css/utilities.css',

  './assets/css/components/forms.css',
  './assets/css/components/cursor-buddy.css',
  './assets/css/components/nav.css',
  './assets/css/components/footer.css',
  './assets/css/components/search-btn.css',
  './assets/css/components/scroll-buttons.css',
  './assets/css/components/write-btn.css',
  './assets/css/components/auth-links.css',
  './assets/css/components/update-banner.css',
  './assets/css/components/app-update-popup.css',
  './assets/css/components/pwa-install.css',
  './assets/css/components/refresh-control.css',

  './assets/css/main/main.css',
  './assets/css/main/mypage-main.css',
  './assets/css/main/privacy-main.css',
  './assets/css/main/store-main.css',
  './assets/css/main/calendar-study-main.css',
  './assets/css/main/calendar-work-main.css',
  './assets/css/main/calendar-event-main.css',
  './assets/css/main/app-calendar-main.css',
  './assets/css/main/calendar-groups-main.css',

  './assets/js/boot.js',
  './assets/js/main.js',
  './assets/js/modules/app-update-popup.js',
  './assets/js/modules/mypage.js',
  './assets/js/modules/pwa-install.js',
  './assets/js/modules/refresh-control.js',
  './assets/js/modules/calendar-native-widgets.js',
  './assets/js/modules/calendar-widget-data.js',
  './assets/js/modules/calendar-groups.js',

  './images/favicon.ico',
  './images/favicon-16x16.png',
  './images/favicon-32x32.png',
  './images/apple-touch-icon.png',
  './images/android-chrome-192x192.png',
  './images/android-chrome-512x512.png',
  './images/logo-home.png',
  './images/logo-word.png',
  './images/logo-study.png',
  './images/logo-work.png',
  './images/logo-event.png',
];

function isSupabaseRequest(url) {
  return (
    url.hostname.includes('supabase.co') ||
    url.pathname.includes('/auth/v1/') ||
    url.pathname.includes('/rest/v1/') ||
    url.pathname.includes('/storage/v1/') ||
    url.pathname.includes('/realtime/v1/')
  );
}

function isHtmlRequest(request) {
  const accept = request.headers.get('accept') || '';
  return request.mode === 'navigate' || accept.includes('text/html');
}

function isStaticAsset(url) {
  return (
    url.pathname.includes('/assets/') ||
    url.pathname.includes('/images/') ||
    url.pathname.endsWith('/site.webmanifest')
  );
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);

    if (response && response.ok) {
      const cache = await caches.open(HTML_CACHE);
      cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL, { ignoreSearch: true });
    if (offline) return offline;

    throw error;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response && response.ok) {
        cache.put(request, response.clone());
      }

      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await fetchPromise;
  if (response) return response;

  const cachedWithoutVersion = await cache.match(request, { ignoreSearch: true });
  if (cachedWithoutVersion) return cachedWithoutVersion;

  return caches.match(OFFLINE_URL, { ignoreSearch: true });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(APP_SHELL_FILES))
      .then(() => self.skipWaiting())
      .catch((error) => {
        console.warn('[sw] install cache failed:', error);
      }),
  );
});

self.addEventListener('activate', (event) => {
  const allowCaches = new Set([STATIC_CACHE, HTML_CACHE]);

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((cacheName) => !allowCaches.has(cacheName))
            .map((cacheName) => caches.delete(cacheName)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (isSupabaseRequest(url)) {
    return;
  }

  if (url.origin !== self.location.origin) {
    return;
  }

  if (isHtmlRequest(request)) {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
