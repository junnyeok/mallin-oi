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

  const [
    mobileStabilityModule,
    siteVersionModule,
    updateBannerModule,
    refreshControlModule,
    appCalendarModeModule,
    pwaInstallModule,
    cursorBuddyModule,
    postsUiModule,
    postDetailModule,
    postsAllModule,
    searchNavModule,
    postDetailListModule,
    postPrevNextModule,
    scrollButtonsModule,
    writeModule,
    loginModule,
    signupModule,
    layoutIncludesModule,
    prevMypageModule,
    mypageModule,
    accountRecoveryModule,
    authStoreModule,
    serviceMenuModule,
    postViewsModule,
    postCommentsModule,
    suggestionsBoardModule,
    postReactionsModule,
    profileModule,
    profileHistoryModule,
    storeModule,
    dailyAttendancePopupModule,
    notificationsModule,
    bgmPlayerModule,
    pickleStatusModule,
    pjaxRouterModule,
    qnaBoardModule,
    studyCalendarModule,
    eventCalendarModule,
    workCalendarModule,
  ] = await Promise.all([
    import(withModuleVersion('./modules/mobile-stability.js')),
    import(withModuleVersion('./modules/site-version.js')),
    import(withModuleVersion('./modules/update-banner.js')),
    import(withModuleVersion('./modules/refresh-control.js')),
    import(withModuleVersion('./modules/app-calendar-mode.js')),
    import(withModuleVersion('./modules/pwa-install.js')),
    import(withModuleVersion('./modules/cursor-buddy.js')),
    import(withModuleVersion('./modules/posts-ui.js')),
    import(withModuleVersion('./modules/post-detail.js')),
    import(withModuleVersion('./modules/posts-all.js')),
    import(withModuleVersion('./modules/search-nav.js')),
    import(withModuleVersion('./modules/post-detail-list.js')),
    import(withModuleVersion('./modules/post-prev-next.js')),
    import(withModuleVersion('./modules/scroll-buttons.js')),
    import(withModuleVersion('./modules/write.js')),
    import(withModuleVersion('./modules/login.js')),
    import(withModuleVersion('./modules/signup.js')),
    import(withModuleVersion('./modules/layout-includes.js')),
    import(withModuleVersion('./modules/prev-mypage.js')),
    import(withModuleVersion('./modules/mypage.js')),
    import(withModuleVersion('./modules/account-recovery.js')),
    import(withModuleVersion('./modules/auth-store.js')),
    import(withModuleVersion('./modules/service-menu.js')),
    import(withModuleVersion('./modules/post-views.js')),
    import(withModuleVersion('./modules/post-comments.js')),
    import(withModuleVersion('./modules/suggestions-board.js')),
    import(withModuleVersion('./modules/post-reactions.js')),
    import(withModuleVersion('./modules/profile.js')),
    import(withModuleVersion('./modules/profile-history.js')),
    import(withModuleVersion('./modules/store.js')),
    import(withModuleVersion('./modules/daily-attendance-popup.js')),
    import(withModuleVersion('./modules/notifications.js')),
    import(withModuleVersion('./modules/bgm-player.js')),
    import(withModuleVersion('./modules/pickle-status.js')),
    import(withModuleVersion('./modules/pjax-router.js')),
    import(withModuleVersion('./modules/qna-board.js')),
    import(withModuleVersion('./modules/study-calendar.js')),
    import(withModuleVersion('./modules/event-calendar.js')),
    import(withModuleVersion('./modules/work-calendar.js')),
  ]);

  coreModules = {
    mobileStabilityModule,
    siteVersionModule,
    updateBannerModule,
    refreshControlModule,
    appCalendarModeModule,
    pwaInstallModule,
    cursorBuddyModule,
    postsUiModule,
    postDetailModule,
    postsAllModule,
    searchNavModule,
    postDetailListModule,
    postPrevNextModule,
    scrollButtonsModule,
    writeModule,
    loginModule,
    signupModule,
    layoutIncludesModule,
    prevMypageModule,
    mypageModule,
    accountRecoveryModule,
    authStoreModule,
    serviceMenuModule,
    postViewsModule,
    postCommentsModule,
    suggestionsBoardModule,
    postReactionsModule,
    profileModule,
    profileHistoryModule,
    storeModule,
    dailyAttendancePopupModule,
    notificationsModule,
    bgmPlayerModule,
    pickleStatusModule,
    pjaxRouterModule,
    qnaBoardModule,
    studyCalendarModule,
    eventCalendarModule,
    workCalendarModule,
  };

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
      });

      await runSafe('store module', async () => {
        await initStore();
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

  const y = document.querySelector('#year');
  if (y) y.textContent = String(new Date().getFullYear());
}

async function initGlobalModules(modules) {
  if (globalInitialized) return;

  const {
    mobileStabilityModule,
    siteVersionModule,
    updateBannerModule,
    refreshControlModule,
    pwaInstallModule,
    appCalendarModeModule,
    cursorBuddyModule,
    searchNavModule,
    layoutIncludesModule,
    authStoreModule,
    serviceMenuModule,

    dailyAttendancePopupModule,
    notificationsModule,
    bgmPlayerModule,
    pickleStatusModule,
    pjaxRouterModule,
  } = modules;

  const { initMobileStability } = mobileStabilityModule;

  const {
    getVersionChangeInfo,
    markCurrentVersionApplied,
    applyVersionUpdateAndReload,
    withAssetVersion,
  } = siteVersionModule;

  const { showUpdateBanner } = updateBannerModule;
  const { initRefreshControls } = refreshControlModule;
  const { initPwaInstall } = pwaInstallModule;
  const { initCalendarAppMode } = appCalendarModeModule;
  const { initCursorBuddy } = cursorBuddyModule;
  const { initSearchNav } = searchNavModule;
  const { initLayoutIncludes, refreshLayoutState } = layoutIncludesModule;
  const { initAuthUI, updateAuthUI } = authStoreModule;
  const { initServiceMenu } = serviceMenuModule;
  const { initDailyAttendancePopup } = dailyAttendancePopupModule;
  const { initNotifications } = notificationsModule;
  const { initBgmPlayer } = bgmPlayerModule;
  const { initPickleStatus } = pickleStatusModule;
  const { initPjaxRouter } = pjaxRouterModule;

  applyVersionToStaticLinks(withAssetVersion);

  const calendarAppMode = calendarAppModeInitialized
    ? calendarAppModeEarlyResult
    : initCalendarAppMode();

  if (!calendarAppMode) {
    await runSafe('pwa install', async () => {
      await initPwaInstall();
    });
  }

  await runSafe('mobile stability', async () => {
    initMobileStability();
  });

  if (!calendarAppMode) {
    await runSafe('site version check', async () => {
      const versionInfo = getVersionChangeInfo();

      if (versionInfo.changed) {
        showUpdateBanner(async () => {
          await applyVersionUpdateAndReload();
        });
      } else if (versionInfo.firstVisit) {
        markCurrentVersionApplied();
      }
    });
  }

  if (!calendarAppMode) {
    await runSafe('layout includes', async () => {
      await initLayoutIncludes();
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

  await runSafe('auth ui', async () => {
    await initAuthUI();
  });

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
