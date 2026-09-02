// assets/js/modules/scroll-buttons.js
/* =================================================
  scroll-buttons.js

  [post.html]
  - TOP: 맨 위
  - 댓글: 좋아요/댓글 영역
  - END: 다른 게시물 영역

  [index / study / work / event / career]
  - PC / 모바일: TOP / END
    - END: 최신 업로드 패널이 있으면 해당 패널
    - 최신 업로드 패널이 없으면 마지막 콘텐츠 또는 페이지 하단

  [posts-all.html]
  - TOP / END(카테고리 탭)

  [write.html]
  - TOP / 본문 / END(등록 버튼)

  [mypage.html]
  - TOP / POST / END

  [store.html / store-item.html]
  - TOP / END

  [mallin-plus.html]
  - TOP / END

  [notifications.html]
  - TOP / END

  [calendar-groups.html]
  - TOP / END(그룹 만들기 패널)
================================================= */

let scrollFabCleanup = null;
const SCROLL_FAB_LOGO_URL = new URL(
  '../../../images/logo-home.png',
  import.meta.url,
).href;

function cleanupScrollFabEvents() {
  if (typeof scrollFabCleanup === 'function') {
    scrollFabCleanup();
    scrollFabCleanup = null;
  }
}

function isMobileViewport() {
  return (
    window.matchMedia?.('(max-width: 700px)').matches ||
    window.matchMedia?.('(hover: none) and (pointer: coarse)').matches
  );
}

function getPageType() {
  const path = window.location.pathname.toLowerCase();

  if (path.includes('post.html')) return 'post';
  if (path.includes('posts-all.html')) return 'posts-all';
  if (path.includes('write.html')) return 'write';
  if (path.includes('mypage.html')) return 'mypage';
  if (path.includes('profile-history.html')) return 'profile-history';
  if (path.includes('profile-setting.html')) return 'profile';
  if (path.includes('inventory.html')) return 'profile';
  if (path.includes('profile.html')) return 'profile';
  if (path.includes('store-item.html')) return 'store-item';
  if (path.includes('store.html')) return 'store';
  if (path.includes('calendar-study.html')) return 'calendar';
  if (path.includes('calendar-work.html')) return 'calendar';
  if (path.includes('calendar-event.html')) return 'calendar';
  if (path.includes('calendar-groups.html')) return 'calendar-groups';
  if (path.includes('suggestion.html')) return 'suggestion';
  if (path.includes('qna.html')) return 'qna';
  if (path.includes('notifications.html')) return 'notifications';
  if (path.includes('mallin-plus.html')) return 'mallin-plus';

  const page = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  if (page === 'qna') return 'qna';
  if (page === 'post') return 'post';
  if (page === 'write') return 'write';
  if (page === 'mypage') return 'mypage';
  if (page === 'profile-history') return 'profile-history';
  if (
    page === 'profile' ||
    page === 'profile-setting' ||
    page === 'inventory'
  ) {
    return 'profile';
  }
  if (page === 'store-item') return 'store-item';
  if (page === 'store') return 'store';
  if (page === 'mallin-plus') return 'mallin-plus';

  if (
    page === 'calendar-study' ||
    page === 'calendar-work' ||
    page === 'calendar-event'
  ) {
    return 'calendar';
  }

  if (page === 'calendar-groups') return 'calendar-groups';

  if (page === 'suggestion') return 'suggestion';
  if (page === 'notifications') return 'notifications';
  if (page === 'posts-all' || page === 'postsall' || page === 'all') {
    return 'posts-all';
  }

  if (
    page === 'home' ||
    page === 'index' ||
    page === 'study' ||
    page === 'work' ||
    page === 'event' ||
    page === 'career'
  ) {
    return 'home-like';
  }

  return 'other';
}

function isNativeCapacitorApp() {
  const capacitor = window.Capacitor;
  if (!capacitor) return false;

  if (typeof capacitor.isNativePlatform === 'function') {
    return capacitor.isNativePlatform() === true;
  }

  if (typeof capacitor.getPlatform === 'function') {
    return capacitor.getPlatform() !== 'web';
  }

  return capacitor.platform === 'ios' || capacitor.platform === 'android';
}

function shouldSkipScrollButtons(pageType) {
  return (
    isNativeCapacitorApp() &&
    (pageType === 'calendar' || pageType === 'calendar-groups')
  );
}

function findLatestPanel() {
  const latestList = document.getElementById('latestList');
  if (!latestList) return null;
  return latestList.closest('.panel') || latestList;
}

function findLastMainContent() {
  const mainEl =
    document.querySelector('.site-main') || document.querySelector('main');
  if (!mainEl) return null;

  const candidates = Array.from(
    mainEl.querySelectorAll('.panel, section, article'),
  ).filter((el) => {
    if (!el) return false;
    if (el.closest('[data-include]')) return false;
    return true;
  });

  return candidates[candidates.length - 1] || mainEl;
}

function getHomeLikeTargets() {
  const latestPanel =
    document.getElementById('latestUploadSection') || findLatestPanel();

  return {
    bottomScrollEl: latestPanel || findLastMainContent(),
    hasLatestPanel: Boolean(latestPanel),
  };
}

function getPostTargets() {
  const reactionSection = document.querySelector('#postReactionsSection');
  const commentSection = document.querySelector('#postCommentsSection');
  const pagerSection = document.querySelector('.post-pager');

  const commentScrollEl = reactionSection || pagerSection || commentSection;
  const commentStateEl = reactionSection || commentSection || commentScrollEl;

  const bottomScrollEl =
    document.querySelector('#postOtherPostsSection') || null;

  return {
    commentSection,
    commentScrollEl,
    commentStateEl,
    bottomScrollEl,
  };
}

function getPostsAllTargets() {
  const bottomScrollEl =
    document.querySelector('.posts-all__tabs') ||
    document.querySelector('.posts-all-tabs') ||
    document.querySelector('[data-posts-all-tabs]') ||
    document.querySelector('.posts-tabs') ||
    document.querySelector('.category-tabs') ||
    null;

  return {
    bottomScrollEl,
  };
}

function getWriteTargets() {
  const bodyField = document.getElementById('body');
  const bodyRow = bodyField?.closest('.write-row') || bodyField || null;

  const submitBtn = document.getElementById('writeSubmitBtn');
  const submitArea =
    submitBtn?.closest('.write-actions') ||
    submitBtn?.closest('.write-form__bottom') ||
    submitBtn?.closest('.write-row') ||
    submitBtn?.parentElement ||
    submitBtn ||
    null;

  return {
    commentSection: bodyRow,
    commentScrollEl: bodyRow,
    commentStateEl: bodyRow,
    bottomScrollEl: submitArea,
  };
}

function getMypageTargets() {
  return {
    commentSection: null,
    commentScrollEl: null,
    commentStateEl: null,
  };
}

function getProfileTargets() {
  return {
    commentSection: null,
    commentScrollEl: null,
    commentStateEl: null,
  };
}

function getSuggestionTargets() {
  const bottomScrollEl =
    document.getElementById('suggestionList') ||
    document.getElementById('suggestionSection') ||
    null;

  return {
    bottomScrollEl,
  };
}

function getQnaTargets() {
  const bottomScrollEl =
    document.getElementById('suggestionList') ||
    document.getElementById('qnaSection') ||
    null;

  return {
    bottomScrollEl,
  };
}

function getCalendarGroupsTargets() {
  const bottomScrollEl =
    document.getElementById('calendarGroupCreatePanel')?.closest('.panel') ||
    document.getElementById('calendarGroupForm')?.closest('.panel') ||
    findLastMainContent();

  return {
    bottomScrollEl,
  };
}

function createFabButton(type, text, icon, ariaLabel) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'scroll-fab__btn';
  btn.setAttribute('data-scroll-fab', type);
  btn.setAttribute('aria-label', ariaLabel);

  const iconEl = document.createElement('span');
  iconEl.className = 'scroll-fab__icon';
  iconEl.setAttribute('aria-hidden', 'true');

  if (type === 'top' || type === 'bottom') {
    const logo = document.createElement('img');
    logo.className = 'scroll-fab__logo';
    if (type === 'bottom') logo.classList.add('scroll-fab__logo--end');
    logo.src = SCROLL_FAB_LOGO_URL;
    logo.alt = '';
    iconEl.appendChild(logo);
  } else {
    iconEl.textContent = icon;
  }

  const textEl = document.createElement('span');
  textEl.className = 'scroll-fab__text';
  textEl.textContent = text;

  btn.append(iconEl, textEl);
  return btn;
}

function getAbsoluteTop(el, extraOffset = 16) {
  if (!el) return 0;
  const rect = el.getBoundingClientRect();
  return Math.max(0, window.pageYOffset + rect.top - extraOffset);
}

function updateSectionButtonState(btn, stateEl, activeOffset) {
  if (!btn) return;

  btn.disabled = false;
  btn.removeAttribute('disabled');
  btn.removeAttribute('aria-disabled');
  btn.classList.remove('is-disabled');
}

export function initScrollButtons(options = {}) {
  cleanupScrollFabEvents();

  const {
    topOffset = 60,
    bottomOffset = 240,
    sectionActiveOffset = 120,
    bottomActiveOffset = 160,
    scrollBehavior = 'smooth',
  } = options;

  const existingWrap = document.querySelector('[data-scroll-fab="wrap"]');
  if (existingWrap) existingWrap.remove();

  const pageType = getPageType();
  if (pageType === 'other') return;
  if (shouldSkipScrollButtons(pageType)) return;

  const prefersReduced =
    window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const behavior = prefersReduced ? 'auto' : scrollBehavior;

  const wrap = document.createElement('div');
  wrap.className = 'scroll-fab';
  wrap.setAttribute('data-scroll-fab', 'wrap');

  const btnTop = createFabButton('top', 'TOP', '', '상단으로 이동');
  const btnBottom = createFabButton('bottom', 'END', '', '하단으로 이동');

  let btnMajor = null;
  let btnComment = null;

  let majorScrollEl = null;
  let majorStateEl = null;

  let commentSection = null;
  let commentScrollEl = null;
  let commentStateEl = null;

  let bottomScrollEl = null;

  if (pageType === 'post') {
    const postTargets = getPostTargets();
    commentSection = postTargets.commentSection;
    commentScrollEl = postTargets.commentScrollEl;
    commentStateEl = postTargets.commentStateEl;
    bottomScrollEl = postTargets.bottomScrollEl;

    if (commentSection && commentScrollEl) {
      btnComment = createFabButton(
        'comment',
        '댓글',
        '💬',
        '댓글 영역으로 이동',
      );
    }

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '다른 게시물로 이동');
    }
  }

  if (pageType === 'home-like') {
    const homeTargets = getHomeLikeTargets();
    bottomScrollEl = homeTargets.bottomScrollEl;

    if (homeTargets.hasLatestPanel) {
      btnBottom.setAttribute('aria-label', '최신 업로드로 이동');
    } else if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '마지막 콘텐츠로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'posts-all') {
    const postsAllTargets = getPostsAllTargets();
    bottomScrollEl = postsAllTargets.bottomScrollEl;

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '카테고리 목록으로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'write') {
    const writeTargets = getWriteTargets();
    commentSection = writeTargets.commentSection;
    commentScrollEl = writeTargets.commentScrollEl;
    commentStateEl = writeTargets.commentStateEl;
    bottomScrollEl = writeTargets.bottomScrollEl;

    if (commentSection && commentScrollEl) {
      btnComment = createFabButton(
        'comment',
        '본문',
        '💬',
        '본문 입력칸으로 이동',
      );
    }

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '등록 버튼으로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'mypage') {
    const mypageTargets = getMypageTargets();
    commentSection = mypageTargets.commentSection;
    commentScrollEl = mypageTargets.commentScrollEl;
    commentStateEl = mypageTargets.commentStateEl;

    btnBottom.setAttribute('aria-label', '하단으로 이동');
  }

  if (pageType === 'profile') {
    const profileTargets = getProfileTargets();
    commentSection = profileTargets.commentSection;
    commentScrollEl = profileTargets.commentScrollEl;
    commentStateEl = profileTargets.commentStateEl;

    btnBottom.setAttribute('aria-label', '하단으로 이동');
  }

  if (
    pageType === 'store' ||
    pageType === 'store-item' ||
    pageType === 'mallin-plus'
  ) {
    btnBottom.setAttribute('aria-label', '페이지 하단으로 이동');
  }

  if (pageType === 'calendar') {
    btnBottom.setAttribute('aria-label', '페이지 하단으로 이동');
  }

  if (pageType === 'calendar-groups') {
    const calendarGroupsTargets = getCalendarGroupsTargets();
    bottomScrollEl = calendarGroupsTargets.bottomScrollEl;
    btnBottom.setAttribute(
      'aria-label',
      bottomScrollEl ? '그룹 만들기 영역으로 이동' : '페이지 하단으로 이동',
    );
  }

  if (pageType === 'suggestion') {
    const suggestionTargets = getSuggestionTargets();
    bottomScrollEl = suggestionTargets.bottomScrollEl;

    if (pageType === 'qna') {
      const qnaTargets = getQnaTargets();
      bottomScrollEl = qnaTargets.bottomScrollEl;
    }

    if (bottomScrollEl) {
      btnBottom.setAttribute('aria-label', '건의사항 목록으로 이동');
    } else {
      btnBottom.setAttribute('aria-label', '하단으로 이동');
    }
  }

  if (pageType === 'profile-history') {
    btnBottom.setAttribute('aria-label', '페이지 하단으로 이동');
  }

  wrap.appendChild(btnTop);
  if (btnMajor) wrap.appendChild(btnMajor);
  if (btnComment) wrap.appendChild(btnComment);
  wrap.appendChild(btnBottom);

  document.body.appendChild(wrap);

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior });
  }

  function scrollToMajorTarget() {
    if (!btnMajor || !majorScrollEl) return;

    const targetTop = getAbsoluteTop(majorScrollEl, 16);
    window.scrollTo({
      top: targetTop,
      behavior,
    });
  }

  function scrollToCommentTarget() {
    if (!btnComment || !commentScrollEl) return;

    const targetTop = getAbsoluteTop(commentScrollEl, 16);
    window.scrollTo({
      top: targetTop,
      behavior,
    });
  }

  function scrollToBottomTarget() {
    const pageTypeNow = getPageType();

    if (pageTypeNow === 'post' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({ top: targetTop, behavior });
      return;
    }

    if (pageTypeNow === 'home-like' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({ top: targetTop, behavior });
      return;
    }

    if (pageTypeNow === 'suggestion' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({ top: targetTop, behavior });
      return;
    }

    if (pageTypeNow === 'posts-all' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({ top: targetTop, behavior });
      return;
    }

    if (pageTypeNow === 'calendar-groups' && bottomScrollEl) {
      const targetTop = getAbsoluteTop(bottomScrollEl, 16);
      window.scrollTo({ top: targetTop, behavior });
      return;
    }

    if (pageTypeNow === 'write' && bottomScrollEl) {
      const submitBtn = document.getElementById('writeSubmitBtn');
      const writeNote = document.getElementById('writeNote');

      const targetEl = submitBtn || bottomScrollEl;
      const targetRect = targetEl.getBoundingClientRect();

      const noteRect = writeNote?.getBoundingClientRect?.() || null;
      const contentBottom = noteRect
        ? Math.max(targetRect.bottom, noteRect.bottom)
        : targetRect.bottom;

      const absoluteBottom = window.pageYOffset + contentBottom;

      const extraBottomSpace = isMobileViewport() ? 96 : 64;

      const targetTop = Math.max(
        0,
        absoluteBottom - window.innerHeight + extraBottomSpace,
      );

      window.scrollTo({
        top: targetTop,
        behavior,
      });
      return;
    }

    const maxY = Math.max(
      document.documentElement.scrollHeight,
      document.body.scrollHeight,
    );

    window.scrollTo({
      top: maxY,
      behavior,
    });
  }

  btnTop.addEventListener('click', scrollToTop);
  if (btnMajor) btnMajor.addEventListener('click', scrollToMajorTarget);
  if (btnComment) btnComment.addEventListener('click', scrollToCommentTarget);
  btnBottom.addEventListener('click', scrollToBottomTarget);

  function updateCommentButtonState() {
    if (!btnComment) return;

    btnComment.disabled = false;
    btnComment.removeAttribute('disabled');
    btnComment.removeAttribute('aria-disabled');
    btnComment.classList.remove('is-disabled');
  }

  function updateState() {
    const buttons = [btnTop, btnMajor, btnComment, btnBottom].filter(Boolean);

    buttons.forEach((btn) => {
      btn.disabled = false;
      btn.removeAttribute('disabled');
      btn.removeAttribute('aria-disabled');
      btn.classList.remove('is-disabled');
    });
  }

  let rafId = null;
  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      updateState();
    });
  }

  let resizeTimer = null;
  let lastViewportWidth = window.innerWidth;

  function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);

    resizeTimer = setTimeout(() => {
      const nextWidth = window.innerWidth;
      const widthChanged = Math.abs(nextWidth - lastViewportWidth) > 40;

      lastViewportWidth = nextWidth;

      // 모바일 Safari/Chrome은 주소창 접힘/펼침만으로 resize가 자주 발생함.
      // 폭 변화가 거의 없으면 버튼 재생성을 하지 않고 상태만 갱신한다.
      if (isMobileViewport() && !widthChanged) {
        updateState();
        return;
      }

      initScrollButtons(options);
    }, 160);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  scrollFabCleanup = () => {
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    if (resizeTimer) {
      clearTimeout(resizeTimer);
      resizeTimer = null;
    }

    window.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
  };

  updateState();
}
