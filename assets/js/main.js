import { initCursorBuddy } from './modules/cursor-buddy.js';
import { initPostsUI } from './modules/posts-ui.js';
import { initPostDetail, initBackLink } from './modules/post-detail.js';
import { initPostsAll } from './modules/posts-all.js';
import { initSearchNav } from './modules/search-nav.js';
import { initPostDetailList } from './modules/post-detail-list.js';
import { initPostPrevNext } from './modules/post-prev-next.js';
import { initScrollButtons } from './modules/scroll-buttons.js';
import { initWrite } from './modules/write.js';
import { initLogin } from './modules/login.js';
import { initSignup } from './modules/signup.js';
import { initLayoutIncludes } from './modules/layout-includes.js';
import { initPrevMypage } from './modules/prev-mypage.js';
import { initMypage } from './modules/mypage.js';
import { initAccountRecovery } from './modules/account-recovery.js';
import { initAuthUI } from './modules/auth-store.js';
import { initPostViews } from './modules/post-views.js?v=20260311-1325';
import { initPostComments } from './modules/post-comments.js';

function isInAccountFolder() {
  return window.location.pathname.includes('/account/');
}

function getPostsAllBaseUrl() {
  return isInAccountFolder() ? '../posts-all.html' : './posts-all.html';
}

document.addEventListener('DOMContentLoaded', async () => {
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
    await initPostComments();
  } catch (e) {
    console.error('[main] post comments failed:', e);
  }

  try {
    initBackLink();
  } catch (e) {
    console.error('[main] back link failed:', e);
  }

  const y = document.querySelector('#year');
  if (y) y.textContent = String(new Date().getFullYear());
});
