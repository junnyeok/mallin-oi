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

async function loadCoreModules() {
  if (coreModules) return coreModules;

  const [
    siteVersionModule,
    updateBannerModule,
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
    pjaxRouterModule,
  ] = await Promise.all([
    import(withModuleVersion('./modules/site-version.js')),
    import(withModuleVersion('./modules/update-banner.js')),
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
    import(withModuleVersion('./modules/pjax-router.js')),
  ]);

  coreModules = {
    siteVersionModule,
    updateBannerModule,
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
    pjaxRouterModule,
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
  } = modules;

  const { initPostsUI } = postsUiModule;
  const { initPostDetail, initBackLink } = postDetailModule;
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

  await runSafe('post views', async () => {
    initPostViews();
  });

  await runSafe('posts ui', async () => {
    await initPostsUI();
  });

  await runSafe('posts all', async () => {
    await initPostsAll();
  });

  await runSafe('post detail list', async () => {
    await initPostDetailList();
  });

  await runSafe('post prev/next', async () => {
    await initPostPrevNext();
  });

  await runSafe('scroll buttons', async () => {
    initScrollButtons();
  });

  await runSafe('write module', async () => {
    await initWrite();
  });

  await runSafe('prev mypage module', async () => {
    initPrevMypage();
  });

  await runSafe('mypage module', async () => {
    await initMypage();
  });

  await runSafe('login module', async () => {
    initLogin();
  });

  await runSafe('signup module', async () => {
    initSignup();
  });

  await runSafe('account recovery module', async () => {
    initAccountRecovery();
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

  await runSafe('post reactions', async () => {
    await initPostReactions();
  });

  await runSafe('post comments', async () => {
    await initPostComments();
  });

  await runSafe('back link', async () => {
    initBackLink();
  });

  await runSafe('suggestions board', async () => {
    await initSuggestionsBoard();
  });

  await runSafe('profile module', async () => {
    await initProfile();
  });

  await runSafe('profile history module', async () => {
    await initProfileHistory();
  });

  await runSafe('store module', async () => {
    await initStore();
  });

  const y = document.querySelector('#year');
  if (y) y.textContent = String(new Date().getFullYear());
}

async function initGlobalModules(modules) {
  if (globalInitialized) return;

  const {
    siteVersionModule,
    updateBannerModule,
    cursorBuddyModule,
    searchNavModule,
    layoutIncludesModule,
    authStoreModule,
    dailyAttendancePopupModule,
    notificationsModule,
    bgmPlayerModule,
    pjaxRouterModule,
  } = modules;

  const {
    getVersionChangeInfo,
    markCurrentVersionApplied,
    applyVersionUpdateAndReload,
    withAssetVersion,
  } = siteVersionModule;

  const { showUpdateBanner } = updateBannerModule;
  const { initCursorBuddy } = cursorBuddyModule;
  const { initSearchNav } = searchNavModule;
  const { initLayoutIncludes, refreshLayoutState } = layoutIncludesModule;
  const { initAuthUI } = authStoreModule;
  const { initDailyAttendancePopup } = dailyAttendancePopupModule;
  const { initNotifications } = notificationsModule;
  const { initBgmPlayer } = bgmPlayerModule;
  const { initPjaxRouter } = pjaxRouterModule;

  applyVersionToStaticLinks(withAssetVersion);

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

  await runSafe('layout includes', async () => {
    await initLayoutIncludes();
  });

  await runSafe('auth ui', async () => {
    await initAuthUI();
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

  await runSafe('bgm player module', async () => {
    await initBgmPlayer();
  });

  await runSafe('pjax router', async () => {
    await initPjaxRouter({
      mainSelector: 'main',
      onAfterSwap: async () => {
        applyVersionToStaticLinks(withAssetVersion);
        await refreshLayoutState();
        await initPageModules(modules);
      },
    });
  });

  globalInitialized = true;
}

async function initApp() {
  let modules;

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
