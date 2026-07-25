let postsRepoModule = null;
let postViewsModule = null;
let careerBestCarouselCleanup = null;

const KST_TIME_ZONE = 'Asia/Seoul';
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const CAREER_BEST_LIMIT = 5;
const CAREER_BEST_AUTOPLAY_MS = 10000;
const CAREER_BEST_MOBILE_MEDIA = '(max-width: 640px)';
const REDUCED_MOTION_MEDIA = '(prefers-reduced-motion: reduce)';
const CAREER_BEST_SWIPE_MIN_PX = 45;

const kstMonthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: 'numeric',
});

const kstDateFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: KST_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getRuntimeVersion() {
  return encodeURIComponent(String(window.__SITE_VERSION__ || 'dev').trim());
}

function importVersioned(path) {
  return import(`${path}?v=${getRuntimeVersion()}`);
}

async function ensurePostsUiDeps() {
  if (postsRepoModule && postViewsModule) return;

  [postsRepoModule, postViewsModule] = await Promise.all([
    importVersioned('./posts-repo.js'),
    importVersioned('./post-views.js'),
  ]);
}

function getPageCategory() {
  return document.body.dataset.page || 'home';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getDateParts(formatter, value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
}

export function getKstMonthRange(now = new Date()) {
  const parts = getDateParts(kstMonthFormatter, now);
  if (!parts?.year || !parts?.month) {
    throw new Error('한국 시간 기준 월을 계산하지 못했어.');
  }

  const startMs =
    Date.UTC(parts.year, parts.month - 1, 1, 0, 0, 0, 0) - KST_OFFSET_MS;
  const endMs =
    Date.UTC(parts.year, parts.month, 1, 0, 0, 0, 0) - KST_OFFSET_MS;

  return {
    year: parts.year,
    month: parts.month,
    startMs,
    endMs,
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
  };
}

function formatKstDate(value) {
  const parts = getDateParts(kstDateFormatter, value);
  if (!parts?.year || !parts?.month || !parts?.day) return '';

  return `${parts.year}.${String(parts.month).padStart(2, '0')}.${String(
    parts.day,
  ).padStart(2, '0')}`;
}

function getSafeCount(value) {
  const count = Number(value || 0);
  return Number.isFinite(count) && count > 0 ? count : 0;
}

function getCreatedTime(post) {
  const time = new Date(post?.createdAt || 0).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function comparePostIdsDesc(a, b) {
  const aId = Number(a?.id);
  const bId = Number(b?.id);

  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return bId - aId;
  }

  return String(b?.id || '').localeCompare(String(a?.id || ''), 'ko', {
    numeric: true,
  });
}

export function selectCareerMonthlyBest(
  posts,
  monthRange,
  limit = CAREER_BEST_LIMIT,
) {
  const source = Array.isArray(posts) ? posts : [];
  const safeLimit = Math.max(0, Number(limit) || 0);

  return source
    .filter((post) => {
      const createdTime = getCreatedTime(post);

      return (
        String(post?.category || '').toLowerCase() === 'career' &&
        !post?.isPrivate &&
        !post?.isDeleted &&
        !post?.deletedAt &&
        createdTime >= monthRange.startMs &&
        createdTime < monthRange.endMs
      );
    })
    .map((post) => {
      const bestViews = getSafeCount(post.views);
      const bestLikesCount = getSafeCount(post.likesCount);
      const bestFreshCount = getSafeCount(post.dislikesCount);
      const bestCommentCount = getSafeCount(post.commentCount);

      return {
        ...post,
        bestViews,
        bestLikesCount,
        bestFreshCount,
        bestCommentCount,
        bestScore:
          bestViews + bestLikesCount + bestFreshCount + bestCommentCount,
      };
    })
    .sort((a, b) => {
      if (a.bestScore !== b.bestScore) return b.bestScore - a.bestScore;
      if (a.bestViews !== b.bestViews) return b.bestViews - a.bestViews;
      if (a.bestLikesCount !== b.bestLikesCount) {
        return b.bestLikesCount - a.bestLikesCount;
      }
      if (a.bestFreshCount !== b.bestFreshCount) {
        return b.bestFreshCount - a.bestFreshCount;
      }
      if (a.bestCommentCount !== b.bestCommentCount) {
        return b.bestCommentCount - a.bestCommentCount;
      }

      const createdDiff = getCreatedTime(b) - getCreatedTime(a);
      if (createdDiff !== 0) return createdDiff;

      return comparePostIdsDesc(a, b);
    })
    .slice(0, safeLimit);
}

function scopePosts(posts, pageCategory) {
  if (pageCategory === 'home') return posts;
  if (pageCategory === 'post') return posts;
  return posts.filter((p) => p.category === pageCategory);
}

function getViews(post) {
  return postViewsModule.getDisplayViews(post);
}

function getTitle(post) {
  return `${post.isPrivate ? '🔒 ' : ''}${post.title}`;
}

function getAuthorNickname(post) {
  return String(post?.authorNickname || '익명').trim() || '익명';
}

function getCommentCount(post) {
  return Number(post?.commentCount || 0);
}

function getReactionCount(post) {
  return Number(post?.totalReactionsCount || 0);
}

function getCategoryLabel(category) {
  const map = {
    study: 'study',
    work: 'work',
    event: 'event',
    career: 'career',
  };

  return map[String(category || '').toLowerCase()] || 'study';
}

function getEmptyMessage(pageCategory) {
  if (pageCategory === 'career') {
    return '등록된 이력 게시물이 아직 없어. 첫 이력을 남겨봐!';
  }

  return '등록된 게시물이 아직 없어.';
}

function getLoadErrorMessage(pageCategory) {
  if (pageCategory === 'career') {
    return '이력 게시물을 불러오지 못했어. 잠시 후 다시 시도해줘.';
  }

  return '최신 업로드를 불러오지 못했어.';
}

function getSafePreviewUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';

  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
      ? parsed.href
      : '';
  } catch {
    return '';
  }
}

function getYoutubeThumbnail(item) {
  if (String(item?.embedKind || '').toLowerCase() !== 'youtube') return '';

  const url = getSafePreviewUrl(item?.url || item?.originalUrl);
  if (!url) return '';

  try {
    const parsed = new URL(url);
    const allowedHosts = new Set([
      'youtube.com',
      'www.youtube.com',
      'youtube-nocookie.com',
      'www.youtube-nocookie.com',
    ]);

    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return '';

    const match = parsed.pathname.match(/^\/embed\/([a-zA-Z0-9_-]{6,20})/);
    if (!match) return '';

    return `https://i.ytimg.com/vi/${encodeURIComponent(match[1])}/hqdefault.jpg`;
  } catch {
    return '';
  }
}

function getCareerBestPreview(post) {
  const items = Array.isArray(post?.mediaItems) ? post.mediaItems : [];

  for (const item of items) {
    if (String(item?.type || '').toLowerCase() !== 'image') continue;

    const url = getSafePreviewUrl(item.url || item.originalUrl);
    if (url) return { kind: 'image', url };
  }

  for (const item of items) {
    const type = String(item?.type || '').toLowerCase();
    if (type !== 'video' && type !== 'video-link') continue;

    const thumbnailUrl = getYoutubeThumbnail(item);
    if (thumbnailUrl) {
      return { kind: 'image', url: thumbnailUrl, isVideo: true };
    }

    const url = getSafePreviewUrl(item.url || item.originalUrl);
    if (url) return { kind: 'video', url };
  }

  return { kind: 'none', url: '' };
}

function getRankLabel(rank) {
  const medals = ['🥇', '🥈', '🥉'];
  return `${medals[rank - 1] || '🏅'} ${rank}위`;
}

function renderCareerBestMedia(post) {
  const preview = getCareerBestPreview(post);
  const safeTitle = escapeHtml(post.title || '이력 게시물');
  const fallbackIcon = preview.isVideo
    ? '🎬'
    : preview.kind === 'image'
      ? '🖼️'
      : preview.kind === 'video'
        ? '🎬'
        : '📝';
  const previewKind = preview.isVideo ? 'video-thumbnail' : preview.kind;
  const fallbackText =
    preview.kind === 'none' ? '미디어 없는 이력' : '미리보기를 표시할 수 없어';

  let mediaHtml = '';

  if (preview.kind === 'image') {
    mediaHtml = `
      <img
        class="career-best-card__media-el"
        data-career-best-media
        src="${escapeHtml(preview.url)}"
        alt="${safeTitle} 미리보기"
        loading="lazy"
        decoding="async"
      />
    `;
  }

  if (preview.kind === 'video') {
    mediaHtml = `
      <video
        class="career-best-card__media-el"
        data-career-best-media
        src="${escapeHtml(preview.url)}"
        muted
        playsinline
        preload="metadata"
        aria-label="${safeTitle} 영상 미리보기"
      ></video>
    `;
  }

  return `
    <div class="career-best-card__media" data-preview-kind="${previewKind}">
      <div class="career-best-card__media-fallback" aria-hidden="true">
        <span class="career-best-card__media-icon">${fallbackIcon}</span>
        <span>${fallbackText}</span>
      </div>
      ${mediaHtml}
    </div>
  `;
}

function renderCareerBestCard(post, index) {
  const rank = index + 1;
  const rankClass = rank <= 3 ? ` career-best-card--top-${rank}` : '';
  const author = getAuthorNickname(post);
  const date = formatKstDate(post.createdAt);
  const href =
    post.url || `./post.html?id=${encodeURIComponent(String(post.id || ''))}`;
  const accessibleTitle = `${rank}위 ${post.title || '제목 없는 이력'}, 합산 점수 ${post.bestScore}`;

  return `
    <a
      class="career-best-card${rankClass}"
      href="${escapeHtml(href)}"
      data-best-rank="${rank}"
      data-best-post-id="${escapeHtml(post.id)}"
      data-best-score="${post.bestScore}"
      aria-label="${escapeHtml(accessibleTitle)}"
    >
      ${renderCareerBestMedia(post)}
      <span class="career-best-card__rank">${getRankLabel(rank)}</span>
      <div class="career-best-card__body">
        <strong class="career-best-card__title">${escapeHtml(getTitle(post))}</strong>
        <div class="career-best-card__byline">
          <span class="career-best-card__author">${escapeHtml(author)}</span>
          <time datetime="${escapeHtml(post.createdAt || '')}">${escapeHtml(date)}</time>
        </div>
        <div class="career-best-card__stats" aria-label="게시물 통계">
          <span class="career-best-card__stat">
            <span class="career-best-card__stat-label">👀 조회</span>
            <strong>${post.bestViews}</strong>
          </span>
          <span class="career-best-card__stat">
            <span class="career-best-card__stat-label">👍 좋아요</span>
            <strong>${post.bestLikesCount}</strong>
          </span>
          <span class="career-best-card__stat">
            <span class="career-best-card__stat-label">💡 참신</span>
            <strong>${post.bestFreshCount}</strong>
          </span>
          <span class="career-best-card__stat">
            <span class="career-best-card__stat-label">💬 댓글</span>
            <strong>${post.bestCommentCount}</strong>
          </span>
        </div>
        <span class="career-best-card__stat career-best-card__stat--score">
          <span class="career-best-card__stat-label">🏆 합산 점수</span>
          <strong>${post.bestScore}</strong>
        </span>
      </div>
    </a>
  `;
}

function bindCareerBestMediaFallbacks(listEl) {
  listEl.querySelectorAll('[data-career-best-media]').forEach((media) => {
    media.addEventListener(
      'error',
      () => {
        media.hidden = true;
      },
      { once: true },
    );
  });
}

function cleanupCareerBestCarousel() {
  const cleanup = careerBestCarouselCleanup;
  careerBestCarouselCleanup = null;
  cleanup?.();
}

export function getCareerBestSwipeDirection(
  diffX,
  diffY,
  viewportWidth,
) {
  const horizontalDistance = Math.abs(Number(diffX) || 0);
  const verticalDistance = Math.abs(Number(diffY) || 0);
  const minimumDistance = Math.max(
    CAREER_BEST_SWIPE_MIN_PX,
    (Number(viewportWidth) || 0) * 0.12,
  );

  if (
    horizontalDistance < minimumDistance ||
    horizontalDistance <= verticalDistance * 1.2
  ) {
    return 0;
  }

  return Number(diffX) < 0 ? 1 : -1;
}

function initCareerBestCarousel(listEl) {
  cleanupCareerBestCarousel();

  const viewportEl = listEl.querySelector('[data-career-best-viewport]');
  const trackEl = listEl.querySelector('[data-career-best-track]');
  const controlsEl = listEl.querySelector('[data-career-best-controls]');
  const prevBtn = listEl.querySelector('[data-career-best-prev]');
  const nextBtn = listEl.querySelector('[data-career-best-next]');
  const statusEl = listEl.querySelector('[data-career-best-status]');
  const cardEls = Array.from(listEl.querySelectorAll('.career-best-card'));

  if (
    !viewportEl ||
    !trackEl ||
    !controlsEl ||
    !prevBtn ||
    !nextBtn ||
    !statusEl ||
    !cardEls.length
  ) {
    return;
  }

  const mobileMedia = window.matchMedia(CAREER_BEST_MOBILE_MEDIA);
  const reducedMotionMedia = window.matchMedia(REDUCED_MOTION_MEDIA);
  const eventController = new AbortController();
  const { signal } = eventController;

  let currentIndex = 0;
  let autoTimer = null;
  let instantFrame = null;
  let isMobile = false;
  let isDestroyed = false;
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStarted = false;
  let suppressClickUntil = 0;

  function clearAutoPlay() {
    if (autoTimer === null) return;
    window.clearTimeout(autoTimer);
    autoTimer = null;
  }

  function updateCardAccessibility() {
    cardEls.forEach((card, index) => {
      const isCurrent = index === currentIndex;

      if (!isMobile) {
        card.removeAttribute('aria-current');
        card.removeAttribute('aria-hidden');
        card.removeAttribute('tabindex');
        card.inert = false;
        return;
      }

      if (isCurrent) {
        card.setAttribute('aria-current', 'true');
        card.removeAttribute('aria-hidden');
        card.removeAttribute('tabindex');
        card.inert = false;
        return;
      }

      card.removeAttribute('aria-current');
      card.setAttribute('aria-hidden', 'true');
      card.tabIndex = -1;
      card.inert = true;
    });
  }

  function updateControls() {
    const hasMultipleCards = cardEls.length > 1;

    controlsEl.hidden = !isMobile || !hasMultipleCards;
    prevBtn.disabled = !hasMultipleCards;
    nextBtn.disabled = !hasMultipleCards;
    statusEl.textContent = `${currentIndex + 1} / ${cardEls.length}`;
    statusEl.setAttribute(
      'aria-label',
      `현재 ${currentIndex + 1}위, 전체 ${cardEls.length}개`,
    );
  }

  function setTrackPosition({ animate = true } = {}) {
    if (instantFrame !== null) {
      window.cancelAnimationFrame(instantFrame);
      instantFrame = null;
    }

    if (!isMobile) {
      listEl.classList.remove('career-best--carousel');
      listEl.removeAttribute('aria-roledescription');
      trackEl.classList.remove('career-best__track--instant');
      trackEl.style.removeProperty('transform');
      updateCardAccessibility();
      updateControls();
      return;
    }

    listEl.classList.add('career-best--carousel');
    listEl.setAttribute('aria-roledescription', '캐러셀');

    if (!animate) {
      trackEl.classList.add('career-best__track--instant');
    }

    trackEl.style.transform = `translate3d(-${currentIndex * 100}%, 0, 0)`;
    updateCardAccessibility();
    updateControls();

    if (!animate) {
      instantFrame = window.requestAnimationFrame(() => {
        trackEl.classList.remove('career-best__track--instant');
        instantFrame = null;
      });
    }
  }

  function canAutoPlay() {
    return (
      isMobile &&
      cardEls.length > 1 &&
      !document.hidden &&
      !reducedMotionMedia.matches &&
      listEl.isConnected
    );
  }

  function scheduleAutoPlay() {
    clearAutoPlay();
    if (!canAutoPlay()) return;

    autoTimer = window.setTimeout(() => {
      autoTimer = null;

      if (!listEl.isConnected) {
        if (careerBestCarouselCleanup === destroy) {
          cleanupCareerBestCarousel();
        }
        return;
      }

      goToSlide(currentIndex + 1, { resetTimer: false });
      scheduleAutoPlay();
    }, CAREER_BEST_AUTOPLAY_MS);
  }

  function goToSlide(index, { animate = true, resetTimer = true } = {}) {
    if (!isMobile || cardEls.length < 1) return;

    currentIndex =
      ((Number(index) || 0) % cardEls.length + cardEls.length) % cardEls.length;
    setTrackPosition({ animate });

    if (resetTimer) {
      scheduleAutoPlay();
    }
  }

  function applyResponsiveMode() {
    const nextIsMobile = mobileMedia.matches;

    if (nextIsMobile && !isMobile) {
      currentIndex = 0;
    }

    isMobile = nextIsMobile;
    clearAutoPlay();
    setTrackPosition({ animate: false });
    scheduleAutoPlay();
  }

  function handleVisibilityChange() {
    if (document.hidden) {
      clearAutoPlay();
      return;
    }

    scheduleAutoPlay();
  }

  function handlePageShow() {
    if (isDestroyed) return;
    applyResponsiveMode();
  }

  function handleTouchStart(event) {
    if (!isMobile || cardEls.length <= 1) return;

    const touch = event.changedTouches[0];
    touchStartX = touch.clientX;
    touchStartY = touch.clientY;
    touchStarted = true;
  }

  function handleTouchEnd(event) {
    if (!touchStarted || !isMobile || cardEls.length <= 1) return;

    touchStarted = false;
    const touch = event.changedTouches[0];
    const diffX = touch.clientX - touchStartX;
    const diffY = touch.clientY - touchStartY;
    const direction = getCareerBestSwipeDirection(
      diffX,
      diffY,
      viewportEl.clientWidth,
    );

    if (!direction) return;

    suppressClickUntil = window.performance.now() + 500;
    goToSlide(currentIndex + direction);
  }

  function handleTouchCancel() {
    touchStarted = false;
  }

  function preventClickAfterSwipe(event) {
    if (window.performance.now() >= suppressClickUntil) return;

    event.preventDefault();
    event.stopPropagation();
  }

  function destroy() {
    if (isDestroyed) return;
    isDestroyed = true;

    clearAutoPlay();
    if (instantFrame !== null) {
      window.cancelAnimationFrame(instantFrame);
      instantFrame = null;
    }

    eventController.abort();
    mobileMedia.removeEventListener('change', applyResponsiveMode);
    reducedMotionMedia.removeEventListener('change', applyResponsiveMode);
    listEl.classList.remove('career-best--carousel');
    listEl.removeAttribute('aria-roledescription');
    trackEl.classList.remove('career-best__track--instant');
    trackEl.style.removeProperty('transform');
    isMobile = false;
    updateCardAccessibility();
    controlsEl.hidden = true;
  }

  prevBtn.addEventListener('click', () => goToSlide(currentIndex - 1), {
    signal,
  });
  nextBtn.addEventListener('click', () => goToSlide(currentIndex + 1), {
    signal,
  });
  viewportEl.addEventListener('touchstart', handleTouchStart, {
    passive: true,
    signal,
  });
  viewportEl.addEventListener('touchend', handleTouchEnd, {
    passive: true,
    signal,
  });
  viewportEl.addEventListener('touchcancel', handleTouchCancel, {
    passive: true,
    signal,
  });
  viewportEl.addEventListener('click', preventClickAfterSwipe, {
    capture: true,
    signal,
  });
  document.addEventListener('visibilitychange', handleVisibilityChange, {
    signal,
  });
  window.addEventListener('pagehide', clearAutoPlay, { signal });
  window.addEventListener('pageshow', handlePageShow, { signal });
  window.addEventListener(
    'mallin:before-pjax-swap',
    cleanupCareerBestCarousel,
    { signal },
  );
  mobileMedia.addEventListener('change', applyResponsiveMode);
  reducedMotionMedia.addEventListener('change', applyResponsiveMode);

  listEl.setAttribute('role', 'region');
  listEl.setAttribute('aria-label', '이번 달 베스트 이력');
  listEl.setAttribute('aria-live', 'off');
  careerBestCarouselCleanup = destroy;
  applyResponsiveMode();
}

function renderCareerBest(posts, listEl, monthRange) {
  cleanupCareerBestCarousel();
  const bestPosts = selectCareerMonthlyBest(posts, monthRange);
  listEl.setAttribute('aria-busy', 'false');

  if (!bestPosts.length) {
    listEl.removeAttribute('role');
    listEl.removeAttribute('aria-label');
    listEl.removeAttribute('aria-roledescription');
    listEl.setAttribute('aria-live', 'polite');
    listEl.innerHTML = `
      <p class="panel__desc career-best__state">
        아직 이번 달의 베스트 이력이 없어. 첫 번째 주인공이 되어봐!
      </p>
    `;
    return;
  }

  listEl.innerHTML = `
    <div class="career-best__viewport" data-career-best-viewport>
      <div class="career-best__track" data-career-best-track>
        ${bestPosts.map(renderCareerBestCard).join('')}
      </div>
    </div>
    <div class="career-best__controls" data-career-best-controls hidden>
      <button
        type="button"
        class="career-best__nav"
        data-career-best-prev
        aria-label="이전 베스트 이력 보기"
      >‹</button>
      <span class="career-best__status" data-career-best-status></span>
      <button
        type="button"
        class="career-best__nav"
        data-career-best-next
        aria-label="다음 베스트 이력 보기"
      >›</button>
    </div>
  `;
  bindCareerBestMediaFallbacks(listEl);
  initCareerBestCarousel(listEl);
}

function renderCareerBestError(listEl) {
  if (!listEl) return;

  cleanupCareerBestCarousel();
  listEl.removeAttribute('role');
  listEl.removeAttribute('aria-label');
  listEl.removeAttribute('aria-roledescription');
  listEl.setAttribute('aria-live', 'polite');
  listEl.setAttribute('aria-busy', 'false');
  listEl.innerHTML = `
    <p class="panel__desc career-best__state">
      이번 달 베스트 이력을 불러오지 못했어. 잠시 후 다시 시도해줘.
    </p>
  `;
}

function renderLatestList(posts, listEl, pageCategory) {
  if (!posts.length) {
    listEl.innerHTML = `<p class="panel__desc">${getEmptyMessage(
      pageCategory
    )}</p>`;
    return;
  }

  listEl.innerHTML = posts
    .map(
      (p) => `
      <a
        class="mini__row"
        href="${escapeHtml(p.url)}"
        data-id="${escapeHtml(p.id)}"
        data-views="${getViews(p)}"
      >
        <span class="mini__title">${escapeHtml(getTitle(p))}</span>
        <span class="mini__meta">
          ${escapeHtml(postsRepoModule.formatMMDD(p.date))} · ${escapeHtml(
        getAuthorNickname(p)
      )} · 👀 ${getViews(p)} · 👍 ${getReactionCount(p)} · 💬 ${getCommentCount(
        p
      )} · ${escapeHtml(getCategoryLabel(p.category))}
        </span>
      </a>
    `
    )
    .join('');
}

export async function initPostsUI() {
  cleanupCareerBestCarousel();

  const latestEl = document.querySelector('#latestList');
  const careerBestEl = document.querySelector('#careerBestList');
  const careerBestTitleEl = document.querySelector('#careerBestTitle');

  if (!latestEl && !careerBestEl) return;

  const pageCategory = getPageCategory();
  let monthRange = null;

  if (careerBestEl) {
    try {
      monthRange = getKstMonthRange();
      if (careerBestTitleEl) {
        careerBestTitleEl.textContent = `🏆 ${monthRange.month}월 베스트 이력`;
      }
    } catch (error) {
      console.error('[posts-ui] KST month range failed:', error);
      renderCareerBestError(careerBestEl);
    }
  }

  let allPosts = [];
  try {
    await ensurePostsUiDeps();
    allPosts = await postsRepoModule.loadPosts();
  } catch (error) {
    console.error('[posts-ui] loadPosts failed:', error);
    if (latestEl) {
      latestEl.innerHTML = `<p class="panel__desc">${getLoadErrorMessage(
        pageCategory,
      )}</p>`;
    }
    renderCareerBestError(careerBestEl);
    return;
  }

  if (careerBestEl && monthRange) {
    try {
      renderCareerBest(allPosts, careerBestEl, monthRange);
    } catch (error) {
      console.error('[posts-ui] renderCareerBest failed:', error);
      renderCareerBestError(careerBestEl);
    }
  }

  if (latestEl) {
    const scoped = scopePosts(allPosts, pageCategory);
    const latest = postsRepoModule.sortByDateDesc(scoped).slice(0, 12);

    renderLatestList(latest, latestEl, pageCategory);
  }
}
