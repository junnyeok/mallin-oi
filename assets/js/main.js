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

async function initApp() {
  let notificationsModule;
  let siteVersionModule;
  let updateBannerModule;
  let cursorBuddyModule;
  let postsUiModule;
  let postDetailModule;
  let postsAllModule;
  let searchNavModule;
  let postDetailListModule;
  let postPrevNextModule;
  let scrollButtonsModule;
  let writeModule;
  let loginModule;
  let signupModule;
  let layoutIncludesModule;
  let prevMypageModule;
  let mypageModule;
  let accountRecoveryModule;
  let authStoreModule;
  let postViewsModule;
  let postCommentsModule;
  let suggestionsBoardModule;
  let postReactionsModule;
  let profileModule;
  let storeModule;
  let dailyAttendancePopupModule;
  let profileHistoryModule;

  try {
    [
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
    ]);
  } catch (error) {
    console.error('[main] core module load failed:', error);
    return;
  }

  const {
    getVersionChangeInfo,
    markCurrentVersionApplied,
    applyVersionUpdateAndReload,
    withAssetVersion,
  } = siteVersionModule;

  const { showUpdateBanner } = updateBannerModule;
  const { initCursorBuddy } = cursorBuddyModule;
  const { initPostsUI } = postsUiModule;
  const { initPostDetail, initBackLink } = postDetailModule;
  const { initPostsAll } = postsAllModule;
  const { initSearchNav } = searchNavModule;
  const { initPostDetailList } = postDetailListModule;
  const { initPostPrevNext } = postPrevNextModule;
  const { initScrollButtons } = scrollButtonsModule;
  const { initWrite } = writeModule;
  const { initLogin } = loginModule;
  const { initSignup } = signupModule;
  const { initLayoutIncludes } = layoutIncludesModule;
  const { initPrevMypage } = prevMypageModule;
  const { initMypage } = mypageModule;
  const { initAccountRecovery } = accountRecoveryModule;
  const { initAuthUI } = authStoreModule;
  const { initPostViews } = postViewsModule;
  const { initPostComments } = postCommentsModule;
  const { initSuggestionsBoard } = suggestionsBoardModule;
  const { initPostReactions } = postReactionsModule;
  const { initProfile } = profileModule;
  const { initProfileHistory } = profileHistoryModule;
  const { initStore } = storeModule;
  const { initDailyAttendancePopup } = dailyAttendancePopupModule;
  const { initNotifications } = notificationsModule;

  document
    .querySelectorAll(
      'link[rel="stylesheet"], link[rel="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]',
    )
    .forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      link.href = withAssetVersion(href);
    });

  try {
    const versionInfo = getVersionChangeInfo();

    if (versionInfo.changed) {
      showUpdateBanner(async () => {
        await applyVersionUpdateAndReload();
      });
    } else if (versionInfo.firstVisit) {
      markCurrentVersionApplied();
    }
  } catch (e) {
    console.error('[main] site version check failed:', e);
  }

  try {
    await initLayoutIncludes();
  } catch (e) {
    console.error('[main] layout includes failed:', e);
  }

  try {
    await initAuthUI();
  } catch (e) {
    console.error('[main] auth ui failed:', e);
  }

  try {
    await initDailyAttendancePopup();
  } catch (e) {
    console.error('[main] daily attendance popup failed:', e);
  }

  try {
    initPostViews();
  } catch (e) {
    console.error('[main] post views failed:', e);
  }

  try {
    initCursorBuddy({
      selector: '#cukeBuddy',
      offsetX: 8,
      offsetY: 8,
      maxRotate: 50,
    });
  } catch (e) {
    console.error('[main] cursor buddy failed:', e);
  }

  try {
    await initPostsUI();
  } catch (e) {
    console.error('[main] posts ui failed:', e);
  }

  try {
    await initPostsAll();
  } catch (e) {
    console.error('[main] posts all failed:', e);
  }

  try {
    await initPostDetailList();
  } catch (e) {
    console.error('[main] post detail list failed:', e);
  }

  try {
    await initPostPrevNext();
  } catch (e) {
    console.error('[main] post prev/next failed:', e);
  }

  try {
    initScrollButtons();
  } catch (e) {
    console.error('[main] scroll buttons failed:', e);
  }

  try {
    await initWrite();
  } catch (e) {
    console.error('[main] write module failed:', e);
  }

  try {
    initPrevMypage();
  } catch (e) {
    console.error('[main] prev mypage module failed:', e);
  }

  try {
    await initMypage();
  } catch (e) {
    console.error('[main] mypage module failed:', e);
  }

  try {
    initLogin();
  } catch (e) {
    console.error('[main] login module failed:', e);
  }

  try {
    initSignup();
  } catch (e) {
    console.error('[main] signup module failed:', e);
  }

  try {
    initAccountRecovery();
  } catch (e) {
    console.error('[main] account recovery module failed:', e);
  }

  try {
    initSearchNav({ baseUrl: getPostsAllBaseUrl(), defaultTab: 'all' });
  } catch (e) {
    console.error('[main] search nav failed:', e);
  }

  try {
    await initPostDetail();
  } catch (err) {
    console.error(err);
    const titleEl = document.getElementById('postTitle');
    if (titleEl) titleEl.textContent = '로딩 실패';
  }

  try {
    await initPostReactions();
  } catch (e) {
    console.error('[main] post reactions failed:', e);
  }

  try {
    await initPostComments();
  } catch (e) {
    console.error('[main] post comments failed:', e);
  }

  try {
    initBackLink();
  } catch (e) {
    console.error('[main] back link failed:', e);
  }

  try {
    await initSuggestionsBoard();
  } catch (e) {
    console.error('[main] suggestions board failed:', e);
  }

  try {
    await initProfile();
  } catch (e) {
    console.error('[main] profile module failed:', e);
  }

  try {
    await initProfileHistory();
  } catch (e) {
    console.error('[main] profile history module failed:', e);
  }

  try {
    await initStore();
  } catch (e) {
    console.error('[main] store module failed:', e);
  }

  try {
    await initNotifications();
  } catch (e) {
    console.error('[main] notifications module failed:', e);
  }

  const y = document.querySelector('#year');
  if (y) y.textContent = String(new Date().getFullYear());
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp, { once: true });
} else {
  initApp();
}
