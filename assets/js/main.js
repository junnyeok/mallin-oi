function getRuntimeSiteVersion() {
  return String(window.__SITE_VERSION__ || 'dev').trim();
}

function withModuleVersion(path = '') {
  const raw = String(path || '').trim();
  if (!raw) return raw;

  const sep = raw.includes('?') ? '&' : '?';
  return `${raw}${sep}v=${encodeURIComponent(getRuntimeSiteVersion())}`;
}

function isInAccountFolder() {
  return window.location.pathname.includes('/account/');
}

function getPostsAllBaseUrl() {
  return isInAccountFolder() ? '../posts-all.html' : './posts-all.html';
}

let coreModules = null;
let globalInitialized = false;
let calendarAppModeInitialized = false;
let calendarAppModeEarlyResult = false;

const CALENDAR_APP_DOWNLOAD_POPUP_PAGES = new Set([
  'calendar-study',
  'calendar-work',
  'calendar-event',
  'calendar-groups',
]);

const CORE_MODULE_SPECS = [
  ['mobileStabilityModule', './modules/mobile-stability.js'],
  ['siteVersionModule', './modules/site-version.js'],
  ['updateBannerModule', './modules/update-banner.js'],
  ['appUpdatePopupModule', './modules/app-update-popup.js'],
  ['refreshControlModule', './modules/refresh-control.js'],
  ['appCalendarModeModule', './modules/app-calendar-mode.js'],
  [
    'calendarAppDownloadPopupModule',
    './modules/calendar-app-download-popup.js',
  ],
  ['pwaInstallModule', './modules/pwa-install.js'],
  ['cursorBuddyModule', './modules/cursor-buddy.js'],
  ['postsUiModule', './modules/posts-ui.js'],
  ['postDetailModule', './modules/post-detail.js'],
  ['postsAllModule', './modules/posts-all.js'],
  ['searchNavModule', './modules/search-nav.js'],
  ['postDetailListModule', './modules/post-detail-list.js'],
  ['postPrevNextModule', './modules/post-prev-next.js'],
  ['scrollButtonsModule', './modules/scroll-buttons.js'],
  ['writeModule', './modules/write.js'],
  ['loginModule', './modules/login.js'],
  ['signupModule', './modules/signup.js'],
  ['layoutIncludesModule', './modules/layout-includes.js'],
  ['prevMypageModule', './modules/prev-mypage.js'],
  ['mypageModule', './modules/mypage.js'],
  ['accountRecoveryModule', './modules/account-recovery.js'],
  ['authStoreModule', './modules/auth-store.js'],
  ['serviceMenuModule', './modules/service-menu.js'],
  ['postViewsModule', './modules/post-views.js'],
  ['postCommentsModule', './modules/post-comments.js'],
  ['suggestionsBoardModule', './modules/suggestions-board.js'],
  ['postReactionsModule', './modules/post-reactions.js'],
  ['profileModule', './modules/profile.js'],
  ['profileHistoryModule', './modules/profile-history.js'],
  ['storeModule', './modules/store.js'],
  ['dailyAttendancePopupModule', './modules/daily-attendance-popup.js'],
  ['notificationsModule', './modules/notifications.js'],
  ['bgmPlayerModule', './modules/bgm-player.js'],
  ['pickleStatusModule', './modules/pickle-status.js'],
  ['siteStatsModule', './modules/site-stats.js'],
  ['pjaxRouterModule', './modules/pjax-router.js'],
  ['qnaBoardModule', './modules/qna-board.js'],
  ['studyCalendarModule', './modules/study-calendar.js'],
  ['eventCalendarModule', './modules/event-calendar.js'],
  ['workCalendarModule', './modules/work-calendar.js'],
  ['calendarGroupsModule', './modules/calendar-groups.js'],
];

async function initCalendarAppModeEarly() {
  if (calendarAppModeInitialized) return calendarAppModeEarlyResult;

  try {
    const { initCalendarAppMode } = await import(
      withModuleVersion('./modules/app-calendar-mode.js')
    );
    calendarAppModeEarlyResult = initCalendarAppMode();
    calendarAppModeInitialized = true;
    return calendarAppModeEarlyResult;
  } catch (error) {
    console.error('[main] calendar app mode load failed:', error);
    return false;
  }
}

async function loadCoreModules() {
  if (coreModules) return coreModules;

  const results = await Promise.allSettled(
    CORE_MODULE_SPECS.map(([, path]) => import(withModuleVersion(path))),
  );

  coreModules = CORE_MODULE_SPECS.reduce((modules, [key, path], index) => {
    const result = results[index];

    if (result.status === 'fulfilled') {
      modules[key] = result.value;
      return modules;
    }

    console.error(`[main] module load failed: ${path}`, result.reason);
    modules[key] = {};
    return modules;
  }, {});

  return coreModules;
}

function applyVersionToStaticLinks(withAssetVersion) {
  document
    .querySelectorAll(
      'link[rel="stylesheet"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
    )
    .forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      link.href = withAssetVersion(href);
    });
}

async function runSafe(label, fn, options = {}) {
  const { fallback } = options;

  try {
    await fn();
  } catch (error) {
    console.error(`[main] ${label} failed:`, error);
    if (typeof fallback === 'function') {
      fallback(error);
    }
  }
}

function renderHomeFallback(selector, message) {
  const root = document.querySelector(selector);
  if (!root) return;

  root.innerHTML = `<div class="empty">${message}</div>`;
}

async function initPageModules(modules) {
  const page = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  const {
    postsUiModule,
    postDetailModule,
    postsAllModule,
    postDetailListModule,
    postPrevNextModule,
    scrollButtonsModule,
    writeModule,
    loginModule,
    signupModule,
    prevMypageModule,
    mypageModule,
    accountRecoveryModule,
    postViewsModule,
    postCommentsModule,
    suggestionsBoardModule,
    postReactionsModule,
    profileModule,
    profileHistoryModule,
    storeModule,
    qnaBoardModule,
    studyCalendarModule,
    eventCalendarModule,
    workCalendarModule,
    calendarGroupsModule,
    calendarAppDownloadPopupModule,
  } = modules;

  const { initPostsUI } = postsUiModule;
  const { initPostDetail } = postDetailModule;
  const { initPostsAll } = postsAllModule;
  const { initPostDetailList } = postDetailListModule;
  const { initPostPrevNext } = postPrevNextModule;
  const { initScrollButtons } = scrollButtonsModule;
  const { initWrite } = writeModule;
  const { initLogin } = loginModule;
  const { initSignup } = signupModule;
  const { initPrevMypage } = prevMypageModule;
  const { initMypage } = mypageModule;
  const { initAccountRecovery } = accountRecoveryModule;
  const { initPostViews } = postViewsModule;
  const { initPostComments } = postCommentsModule;
  const { initSuggestionsBoard } = suggestionsBoardModule;
  const { initPostReactions } = postReactionsModule;
  const { initProfile } = profileModule;
  const { initProfileHistory } = profileHistoryModule;
  const { initStore } = storeModule;
  const { initQnaBoard } = qnaBoardModule;
  const { initStudyCalendar } = studyCalendarModule;
  const { initEventCalendar } = eventCalendarModule;
  const { initWorkCalendar } = workCalendarModule;
  const { initCalendarGroupsPage } = calendarGroupsModule;
  const { initCalendarAppDownloadPopup = () => {} } =
    calendarAppDownloadPopupModule;
  // 공통
  await runSafe('scroll buttons', async () => {
    initScrollButtons();
  });

  switch (page) {
    case 'home':
    case 'index':
    case 'study':
    case 'work':
    case 'event':
    case 'career':
      await runSafe('posts ui', async () => {
        await initPostsUI();
      }, {
        fallback: () => {
          renderHomeFallback('#latestList', '최신 업로드를 불러오지 못했어.');
        },
      });

      await runSafe('store module', async () => {
        await initStore();
      }, {
        fallback: () => {
          renderHomeFallback(
            '#storeFeaturedGrid',
            '상점 품목을 불러오지 못했어. 잠시 후 다시 시도해줘.',
          );
        },
      });

      await runSafe('study calendar', async () => {
        initStudyCalendar();
      });

      await runSafe('event calendar', async () => {
        initEventCalendar();
      });

      await runSafe('work calendar', async () => {
        initWorkCalendar();
      });
      break;

    case 'calendar-work':
      await runSafe('work calendar', async () => {
        await initWorkCalendar();
      });
      break;

    case 'calendar-study':
      await runSafe('study calendar', async () => {
        await initStudyCalendar();
      });
      break;

    case 'calendar-event':
      await runSafe('event calendar', async () => {
        await initEventCalendar();
      });
      break;

    case 'calendar-groups':
      await runSafe('calendar groups', async () => {
        await initCalendarGroupsPage();
      });
      break;

    case 'posts-all':
      await runSafe('posts all', async () => {
        await initPostsAll();
      });
      break;

    case 'qna':
      await runSafe('qna board', async () => {
        await initQnaBoard();
      });
      break;

    case 'post':
      await runSafe('post views', async () => {
        initPostViews();
      });

      await runSafe(
        'post detail',
        async () => {
          await initPostDetail();
        },
        {
          fallback: () => {
            const titleEl = document.getElementById('postTitle');
            if (titleEl) titleEl.textContent = '로딩 실패';
          },
        },
      );

      await runSafe('post detail list', async () => {
        await initPostDetailList();
      });

      await runSafe('post prev/next', async () => {
        await initPostPrevNext();
      });

      await runSafe('post reactions', async () => {
        await initPostReactions();
      });

      await runSafe('post comments', async () => {
        await initPostComments();
      });
      break;

    case 'write':
      await runSafe('write module', async () => {
        await initWrite();
      });
      break;
    case 'login':
      await runSafe('login module', async () => {
        initLogin();
      });
      break;

    case 'signup':
      await runSafe('signup module', async () => {
        initSignup();
      });
      break;

    case 'prev-mypage':
      await runSafe('prev mypage module', async () => {
        initPrevMypage();
      });
      break;

    case 'mypage':
      await runSafe('mypage module', async () => {
        await initMypage();
      });
      break;

    case 'find-password':
    case 'reset-password':
      await runSafe('account recovery module', async () => {
        initAccountRecovery();
      });
      break;

    case 'profile':
    case 'profile-setting':
    case 'inventory':
      await runSafe('profile module', async () => {
        await initProfile();
      });
      break;

    case 'profile-history':
      await runSafe('profile history module', async () => {
        await initProfileHistory();
      });
      break;

    case 'store':
    case 'store-item':
      await runSafe('store module', async () => {
        await initStore();
      });
      break;

    case 'suggestion':
      await runSafe('suggestions board', async () => {
        await initSuggestionsBoard();
      });
      break;

    default:
      break;
  }

  if (CALENDAR_APP_DOWNLOAD_POPUP_PAGES.has(page)) {
    await runSafe('calendar app download popup page retry', async () => {
      initCalendarAppDownloadPopup();
    });
  }

  const y = document.querySelector('#year');
  if (y) y.textContent = String(new Date().getFullYear());
}

async function initGlobalModules(modules) {
  if (globalInitialized) return;

  const {
    mobileStabilityModule,
    siteVersionModule,
    updateBannerModule,
    appUpdatePopupModule,
    refreshControlModule,
    pwaInstallModule,
    appCalendarModeModule,
    calendarAppDownloadPopupModule,
    cursorBuddyModule,
    searchNavModule,
    layoutIncludesModule,
    authStoreModule,
    serviceMenuModule,

    dailyAttendancePopupModule,
    notificationsModule,
    bgmPlayerModule,
    pickleStatusModule,
    siteStatsModule,
    pjaxRouterModule,
  } = modules;

  const { initMobileStability = () => {} } = mobileStabilityModule;

  const {
    getVersionChangeInfo = () => ({
      changed: false,
      firstVisit: false,
    }),
    markCurrentVersionApplied = () => {},
    applyVersionUpdateAndReload = async () => {},
    withAssetVersion = (path) => path,
  } = siteVersionModule;

  const { showUpdateBanner = () => {} } = updateBannerModule;
  const { initAppUpdatePopup = async () => {} } = appUpdatePopupModule;
  const { initRefreshControls = () => {} } = refreshControlModule;
  const { initPwaInstall = async () => {} } = pwaInstallModule;
  const { initCalendarAppMode = () => false } = appCalendarModeModule;
  const { initCalendarAppDownloadPopup = () => {} } =
    calendarAppDownloadPopupModule;
  const { initCursorBuddy = () => {} } = cursorBuddyModule;
  const { initSearchNav = () => {} } = searchNavModule;
  const {
    initLayoutIncludes = async () => {},
    refreshLayoutState = async () => {},
  } = layoutIncludesModule;
  const { initAuthUI = async () => {}, updateAuthUI = async () => {} } =
    authStoreModule;
  const { initServiceMenu = () => {} } = serviceMenuModule;
  const { initDailyAttendancePopup = async () => {} } =
    dailyAttendancePopupModule;
  const { initNotifications = async () => {} } = notificationsModule;
  const { initBgmPlayer = async () => {} } = bgmPlayerModule;
  const { initPickleStatus = async () => {} } = pickleStatusModule;
  const { initSiteStats = async () => {} } = siteStatsModule;
  const { initPjaxRouter = async () => {} } = pjaxRouterModule;

  applyVersionToStaticLinks(withAssetVersion);

  const calendarAppMode = calendarAppModeInitialized
    ? calendarAppModeEarlyResult
    : initCalendarAppMode();

  if (!calendarAppMode) {
    await runSafe('calendar app download popup', async () => {
      initCalendarAppDownloadPopup();
    });

    await runSafe('pwa install', async () => {
      await initPwaInstall();
    });
  }

  await runSafe('mobile stability', async () => {
    initMobileStability();
  });

  await runSafe('app update popup', async () => {
    await initAppUpdatePopup();
  });

  if (!calendarAppMode) {
    await runSafe('site version check', async () => {
      const versionInfo = getVersionChangeInfo();

      if (versionInfo.shouldShowUpdate) {
        showUpdateBanner(async (targetVersion) => {
          await applyVersionUpdateAndReload(targetVersion);
        }, {
          targetVersion: versionInfo.currentVersion,
        });
      } else if (versionInfo.changed) {
        markCurrentVersionApplied(versionInfo.currentVersion);
      } else if (versionInfo.firstVisit) {
        markCurrentVersionApplied();
      }
    });
  }

  // 저장된 세션 판정을 먼저 끝내 비로그인 UI가 잠깐 확정되는 것을 막는다.
  await runSafe('auth session recovery', async () => {
    await initAuthUI();
  });

  if (!calendarAppMode) {
    await runSafe('layout includes', async () => {
      await initLayoutIncludes();
      await updateAuthUI();
    });
  }

  await runSafe('refresh controls', async () => {
    initRefreshControls();
  });

  // BGM은 최대한 빨리 초기화해서
  // 새로고침 직후 자동 재생 복구 시도를 앞당긴다.
  if (!calendarAppMode) {
    await runSafe('bgm player module', async () => {
      await initBgmPlayer();
    });
  }

  if (!calendarAppMode) {
    await runSafe('service menu', async () => {
      initServiceMenu();
    });

    await runSafe('daily attendance popup', async () => {
      await initDailyAttendancePopup();
    });

    await runSafe('cursor buddy', async () => {
      initCursorBuddy({
        selector: '#cukeBuddy',
        offsetX: 8,
        offsetY: 8,
        maxRotate: 50,
      });
    });

    await runSafe('search nav', async () => {
      initSearchNav({ baseUrl: getPostsAllBaseUrl(), defaultTab: 'all' });
    });

    await runSafe('notifications module', async () => {
      await initNotifications();
    });

    await runSafe('pickle status module', async () => {
      await initPickleStatus();
    });

    await runSafe('site stats', async () => {
      void initSiteStats();
    });

    await runSafe('pjax router', async () => {
      await initPjaxRouter({
        mainSelector: 'main',
        onAfterSwap: async () => {
          applyVersionToStaticLinks(withAssetVersion);
          initMobileStability();
          await refreshLayoutState();
          initRefreshControls();
          await updateAuthUI();
          initServiceMenu();
          await initPageModules(modules);
          initMobileStability();
        },
      });
    });
  }

  globalInitialized = true;
}

async function initApp() {
  let modules;

  await initCalendarAppModeEarly();

  try {
    modules = await loadCoreModules();
  } catch (error) {
    console.error('[main] core module load failed:', error);
    return;
  }

  await initGlobalModules(modules);
  await initPageModules(modules);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}
