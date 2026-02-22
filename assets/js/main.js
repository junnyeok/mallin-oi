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

document.addEventListener('DOMContentLoaded', () => {
  initCursorBuddy({
    selector: '#cukeBuddy',
    offsetX: 8,
    offsetY: 8,
    maxRotate: 50,
  });

  initPostsUI();
  initPostsAll();
  initPostDetailList();
  initPostPrevNext();
  initScrollButtons();
  initWrite();

  initSearchNav({ baseUrl: './posts-all.html', defaultTab: 'all' });

  // ✅ 상세페이지면 동작하고, 아니면 조용히 종료됨
  initPostDetail().catch((err) => {
    console.error(err);
    const titleEl = document.getElementById('postTitle');
    if (titleEl) titleEl.textContent = '로딩 실패';
  });

  initBackLink();
});

const y = document.querySelector('#year');
if (y) y.textContent = new Date().getFullYear();
