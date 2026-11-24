function withModuleVersion(path) {
  const version = String(window.__SITE_VERSION__ || 'dev').trim();
  return `${path}?v=${encodeURIComponent(version)}`;
}

function getPageName() {
  return String(document.body?.dataset?.page || '').trim().toLowerCase();
}

function getPostsAllBaseUrl() {
  return window.location.pathname.includes('/account/')
    ? '../posts-all.html'
    : './posts-all.html';
}

async function runSafe(label, task, fallback) {
  try {
    return await task();
  } catch (error) {
    console.error(`[main] ${label} failed:`, error);
    fallback?.();
  }
}

function loadModule(path) {
  return import(withModuleVersion(path));
}

function initFeature(path, method, ...args) {
  return runSafe(method, async () => (await loadModule(path))[method](...args));
}

function applyVersionToStaticLinks(withAssetVersion) {
  document
    .querySelectorAll(
      'link[rel="stylesheet"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
    )
    .forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const versioned = withAssetVersion(href);
      if (versioned !== href) link.href = versioned;
    });
}

function renderHomeFallback(selector, message) {
  const root = document.querySelector(selector);
  if (root) root.innerHTML = `<div class="empty">${message}</div>`;
}

function initSocialAuthControls() {
  if (['login', 'signup', 'prev-mypage', 'mypage'].includes(getPageName())) {
    return initFeature('./modules/social-auth.js', 'initSocialAuthUI');
  }
}

async function initPageModules() {
  const root = document.querySelector('main');
  const page = getPageName();
  const isCurrentPage = () => root?.isConnected !== false;
  const init = (path, method, fallback) => runSafe(method, async () => {
    const module = await loadModule(path);
    // The visitor may have opened another page while a feature was downloading.
    if (isCurrentPage()) await module[method]();
  }, () => { if (isCurrentPage()) fallback?.(); });

  void init('./modules/scroll-buttons.js', 'initScrollButtons');
  if (page.startsWith('calendar-') && !document.documentElement.classList.contains('is-calendar-app-mode')) {
    void init('./modules/calendar-app-download-popup.js', 'initCalendarAppDownloadPopup');
  }
  const year = document.querySelector('#year');
  if (year) year.textContent = String(new Date().getFullYear());

  switch (page) {
    case 'home':
    case 'index':
    case 'study':
    case 'work':
    case 'event':
    case 'career': {
      const posts = document.querySelector('#latestList, #careerBestList')
        ? init('./modules/posts-ui.js', 'initPostsUI', () => {
          renderHomeFallback('#latestList', '최신 업로드를 불러오지 못했어.');
        })
        : undefined;
      if (document.getElementById('storeFeaturedGrid')) {
        void init('./modules/store.js', 'initStore', () => {
          renderHomeFallback('#storeFeaturedGrid', '상점 품목을 불러오지 못했어. 잠시 후 다시 시도해줘.');
        });
      }
      if (document.getElementById('studyCalendarPreview')) {
        void init('./modules/study-calendar.js', 'initStudyCalendar');
      }
      if (document.getElementById('workCalendarPreview')) {
        void init('./modules/work-calendar.js', 'initWorkCalendar');
      }
      if (document.getElementById('eventCalendarPreview')) {
        void init('./modules/event-calendar.js', 'initEventCalendar');
      }
      return posts;
    }
    case 'post': {
      // The comments listener must be ready when the post publishes its access state.
      const comments = init('./modules/post-comments.js', 'initPostComments');
      await runSafe('initPostDetail', async () => {
        const { initPostDetail } = await loadModule('./modules/post-detail.js');
        await comments;
        if (isCurrentPage()) await initPostDetail();
      }, () => {
        if (!isCurrentPage()) return;
        const title = document.getElementById('postTitle');
        if (title) title.textContent = '로딩 실패';
      });
      if (!isCurrentPage()) return;
      void init('./modules/post-detail-list.js', 'initPostDetailList');
      void init('./modules/post-prev-next.js', 'initPostPrevNext');
      void init('./modules/post-reactions.js', 'initPostReactions');
      break;
    }
    case 'posts-all':
      return init('./modules/posts-all.js', 'initPostsAll');
    case 'saved-articles':
      return init('./modules/saved-articles-page.js', 'initSavedArticlesPage');
    case 'community-members':
      return init('./modules/community-members.js', 'initCommunityMembers');
    case 'write':
      return init('./modules/write.js', 'initWrite');
    case 'login':
      return init('./modules/login.js', 'initLogin');
    case 'signup':
      return init('./modules/signup.js', 'initSignup');
    case 'prev-mypage':
      return init('./modules/prev-mypage.js', 'initPrevMypage');
    case 'mypage':
      return init('./modules/mypage.js', 'initMypage');
    case 'find-password':
    case 'reset-password':
      return init('./modules/account-recovery.js', 'initAccountRecovery');
    case 'profile':
    case 'profile-setting':
    case 'inventory':
      return init('./modules/profile.js', 'initProfile');
    case 'profile-history':
      return init('./modules/profile-history.js', 'initProfileHistory');
    case 'store':
    case 'store-item':
      return init('./modules/store.js', 'initStore');
    case 'suggestion':
      return init('./modules/suggestions-board.js', 'initSuggestionsBoard');
    case 'qna':
      return init('./modules/qna-board.js', 'initQnaBoard');
    case 'notifications':
      return init('./modules/notifications-page.js', 'initNotificationsPage');
    case 'calendar-work':
      return init('./modules/work-calendar.js', 'initWorkCalendar');
    case 'calendar-study':
      return init('./modules/study-calendar.js', 'initStudyCalendar');
    case 'calendar-event':
      return init('./modules/event-calendar.js', 'initEventCalendar');
    case 'calendar-groups':
      return init('./modules/calendar-groups.js', 'initCalendarGroupsPage');
  }
}

async function initWebsiteFeatures(layoutReady, authStore, pageReady) {
  // Ordinary documents already loaded these links from HTML. Only an update needs fresh URLs.
  const refreshAssets = new URLSearchParams(window.location.search).has('_updated');
  const versionReady = runSafe('site updates', async () => {
    const version = await loadModule('./modules/site-version.js');
    if (refreshAssets) applyVersionToStaticLinks(version.withAssetVersion);
    version.initSiteAutoUpdates();
    return version;
  });

  void initFeature('./modules/pwa-install.js', 'initPwaInstall', { pageReady });
  void initFeature('./modules/cursor-buddy.js', 'initCursorBuddy', {
    selector: '#cukeBuddy',
    offsetX: 8,
    offsetY: 8,
    maxRotate: 50,
  });

  const navigationReady = runSafe('page navigation', async () => {
    const { initPjaxRouter } = await loadModule('./modules/pjax-router.js');
    initPjaxRouter({
      mainSelector: 'main',
      onAfterSwap: async () => {
        if (refreshAssets) {
          const version = await versionReady;
          if (version) applyVersionToStaticLinks(version.withAssetVersion);
        }
        void initSocialAuthControls();
        const layout = await layoutReady;
        await layout?.refreshLayoutState();
        await authStore.updateAuthUI();
        void initFeature('./modules/refresh-control.js', 'initRefreshControls');
        void initFeature('./modules/service-menu.js', 'initServiceMenu');
        await initPageModules();
        void initFeature('./modules/mobile-stability.js', 'initMobileStability');
      },
    });
  });

  await layoutReady;
  void runSafe('header authentication', authStore.updateAuthUI);
  void initFeature('./modules/service-menu.js', 'initServiceMenu');
  void initFeature('./modules/search-nav.js', 'initSearchNav', {
    baseUrl: getPostsAllBaseUrl(),
    defaultTab: 'all',
  });

  void initFeature('./modules/notifications.js', 'initNotifications');
  void initFeature('./modules/pickle-status.js', 'initPickleStatus');
  void initFeature('./modules/site-stats.js', 'initSiteStats');
  // Keep audio and the two popups in order without holding up page content.
  await navigationReady;
  await initFeature('./modules/bgm-player.js', 'initBgmPlayer');
  await initFeature('./modules/career-award-popup.js', 'initCareerAwardPopup');
  await initFeature('./modules/daily-attendance-popup.js', 'initDailyAttendancePopup');
}

async function initApp() {
  const calendarType = /^calendar-(study|work|event|groups)$/.exec(getPageName())?.[1];
  if (calendarType) {
    const monthLabel = document.getElementById(`${calendarType}CalendarMonthLabel`);
    if (monthLabel) {
      const date = new Date();
      monthLabel.textContent = `${date.getFullYear()}년 ${date.getMonth() + 1}월`;
    }
    const moduleName = calendarType === 'groups' ? 'calendar-groups' : `${calendarType}-calendar`;
    void runSafe('calendar preload', () => loadModule(`./modules/${moduleName}.js`));
  }
  const modeReady = initFeature('./modules/app-calendar-mode.js', 'initCalendarAppMode');
  const layoutReady = modeReady.then(calendarMode => {
    if (calendarMode) return null;
    return runSafe('layout includes', async () => {
      const layout = await loadModule('./modules/layout-includes.js');
      await layout.initLayoutIncludes();
      return layout;
    });
  });
  void initSocialAuthControls();
  const refreshAssets = new URLSearchParams(window.location.search).has('_updated');
  const [calendarMode, authStore] = await Promise.all([
    modeReady,
    refreshAssets ? loadModule('./modules/auth-store.js') : import('./modules/auth-store.js'),
  ]);

  if (window.Capacitor?.isNativePlatform?.()) {
    if (await initFeature('./modules/social-auth-native.js', 'initSocialAuthNative')) return;
    if (await initFeature('./modules/calendar-native-widgets.js', 'initCalendarWidgetNavigation')) return;
  }

  if (await authStore.routePendingSecondFactor()) return;
  await runSafe('auth session recovery', authStore.initAuthUI);

  const pageReady = initPageModules();
  void initFeature('./modules/mobile-stability.js', 'initMobileStability');
  void initFeature('./modules/refresh-control.js', 'initRefreshControls');
  void initFeature('./modules/app-update-popup.js', 'initAppUpdatePopup');

  if (!calendarMode) {
    void runSafe('website features', () => initWebsiteFeatures(layoutReady, authStore, pageReady));
  } else if (refreshAssets) {
    void runSafe('refresh assets', async () => {
      const { withAssetVersion } = await loadModule('./modules/site-version.js');
      applyVersionToStaticLinks(withAssetVersion);
    });
  }

  await pageReady;
}

const start = () => { void runSafe('startup', initApp); };
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
