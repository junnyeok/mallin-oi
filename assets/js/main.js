// assets/js/main.js
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

function isInAccountFolder() {
  return window.location.pathname.includes('/account/');
}

function getPostsAllBaseUrl() {
  // account/* 에서는 posts-all이 한 단계 위
  return isInAccountFolder() ? '../posts-all.html' : './posts-all.html';
}

document.addEventListener('DOMContentLoaded', async () => {
  // ✅ 1) header/footer 먼저 주입 (searchForm, auth-links 등 DOM 생성)
  try {
    await initLayoutIncludes();
  } catch (e) {
    console.error('[main] layout includes failed:', e);
  }

  // ✅ 2) 커서 버디
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

  // ✅ 3) 공통 UI들
  try {
    initPostsUI();
  } catch (e) {
    console.error('[main] posts ui failed:', e);
  }

  try {
    initPostsAll();
  } catch (e) {
    console.error('[main] posts all failed:', e);
  }

  try {
    initPostDetailList();
  } catch (e) {
    console.error('[main] post detail list failed:', e);
  }

  try {
    initPostPrevNext();
  } catch (e) {
    console.error('[main] post prev/next failed:', e);
  }

  try {
    initScrollButtons();
  } catch (e) {
    console.error('[main] scroll buttons failed:', e);
  }

  try {
    initWrite();
  } catch (e) {
    console.error('[main] write module failed:', e);
  }

  try {
    initPrevMypage();
  } catch (e) {
    console.error('[main] prev mypage module failed:', e);
  }

  try {
    initMypage();
  } catch (e) {
    console.error('[main] mypage module failed:', e);
  }

  // ✅ 4) auth (header 주입 후 실행이 안전)
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

  // ✅ 5) 검색 네비 (header 주입 후 실행이 안전)
  try {
    initSearchNav({ baseUrl: getPostsAllBaseUrl(), defaultTab: 'all' });
  } catch (e) {
    console.error('[main] search nav failed:', e);
  }

  // ✅ 6) 상세페이지면 동작 / 아니면 조용히 종료
  try {
    await initPostDetail();
  } catch (err) {
    console.error(err);
    const titleEl = document.getElementById('postTitle');
    if (titleEl) titleEl.textContent = '로딩 실패';
  }

  // ✅ 7) 뒤로가기 링크 세팅
  try {
    initBackLink();
  } catch (e) {
    console.error('[main] back link failed:', e);
  }

  // ✅ 8) year (footer가 주입된 뒤라서 여기서 세팅하는 게 안전)
  const y = document.querySelector('#year');
  if (y) y.textContent = String(new Date().getFullYear());
});
