import { loadPostById } from './posts-repo.js';

/* ================= 조회수(localStorage) ================= */

const VIEWS_KEY = 'viewsMap_v1';

function readViewsMap() {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeViewsMap(map) {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(map));
}

function bumpLocalView(id) {
  if (!id) return;
  const map = readViewsMap();
  map[id] = (map[id] || 0) + 1;
  writeViewsMap(map);
}

function getCombinedViews(post) {
  const base = post.views || 0;
  const map = readViewsMap();
  const extra = map[post.id] || 0;
  return base + extra;
}

function wasViewFromList(id) {
  try {
    return sessionStorage.getItem(`viewFromList:${id}`) === '1';
  } catch {
    return false;
  }
}

function consumeViewFromList(id) {
  try {
    sessionStorage.removeItem(`viewFromList:${id}`);
  } catch {}
}

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderTags(tags = []) {
  const wrap = $('postTags');
  if (!wrap) return;

  wrap.innerHTML = (tags || [])
    .map((t) => `<span class="tag">#${escapeHtml(t)}</span>`)
    .join('');
}

function renderAuthor(post) {
  const authorEl = $('postAuthor');
  if (!authorEl) return;
  authorEl.textContent = `작성자 : ${post.authorNickname || '익명'}`;
}

function renderBodyText(text) {
  const raw = String(text || '').trim();

  if (!raw) {
    return `<p class="post-body__hint">본문이 아직 없어.</p>`;
  }

  return raw
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p).replaceAll('\n', '<br />')}</p>`)
    .join('');
}

/* ================= 테마 유틸 ================= */

function getBasePath() {
  return document.body?.dataset?.base || './';
}

function getThemeInfo(category) {
  const base = getBasePath();

  const map = {
    home: {
      bodyClass: 'theme-home',
      pageCss: `${base}assets/css/pages/index.css`,
      logo: `${base}images/logo-home.png`,
      navHref: `${base}index.html`,
    },
    study: {
      bodyClass: 'theme-study',
      pageCss: `${base}assets/css/pages/study.css`,
      logo: `${base}images/logo-study.png`,
      navHref: `${base}study.html`,
    },
    work: {
      bodyClass: 'theme-work',
      pageCss: `${base}assets/css/pages/work.css`,
      logo: `${base}images/logo-work.png`,
      navHref: `${base}work.html`,
    },
    event: {
      bodyClass: 'theme-event',
      pageCss: `${base}assets/css/pages/event.css`,
      logo: `${base}images/logo-event.png`,
      navHref: `${base}event.html`,
    },
    career: {
      bodyClass: 'theme-career',
      pageCss: `${base}assets/css/pages/career.css`,
      logo: `${base}images/logo-career.png`,
      navHref: `${base}career.html`,
    },
  };

  return map[category] || map.home;
}

function ensureCategoryPageCss(category) {
  const info = getThemeInfo(category);
  const head = document.head;
  if (!head) return;

  const EXISTING_ID = 'dynamic-category-theme-css';
  let link = document.getElementById(EXISTING_ID);

  if (!link) {
    link = document.createElement('link');
    link.id = EXISTING_ID;
    link.rel = 'stylesheet';
    head.appendChild(link);
  }

  if (link.getAttribute('href') !== info.pageCss) {
    link.setAttribute('href', info.pageCss);
  }
}

function syncBodyTheme(category) {
  const info = getThemeInfo(category);
  const body = document.body;

  body.classList.remove(
    'theme-home',
    'theme-study',
    'theme-work',
    'theme-event',
    'theme-career',
  );

  body.classList.add(info.bodyClass);
  body.dataset.page = category;
}

function syncHeaderFooterLogos(category) {
  const info = getThemeInfo(category);
  const base = getBasePath();

  const headerLogo = document.getElementById('siteLogoImg');
  if (headerLogo) headerLogo.src = info.logo;

  const footerLogo = document.getElementById('footerLogoImg');
  if (footerLogo) footerLogo.src = info.logo;

  // ✅ 커서 오이는 항상 기본 홈 오이로 고정
  const buddy = document.getElementById('cukeBuddy');
  if (buddy) buddy.src = `${base}images/logo-home.png`;
}

function syncNavCurrent(category) {
  const info = getThemeInfo(category);

  document.querySelectorAll('.site-nav__link').forEach((link) => {
    link.removeAttribute('aria-current');

    const href = link.getAttribute('href') || '';
    if (href === info.navHref) {
      link.setAttribute('aria-current', 'page');
    }
  });
}

function syncThemeByCategory(category) {
  ensureCategoryPageCss(category);
  syncBodyTheme(category);
  syncHeaderFooterLogos(category);
  syncNavCurrent(category);
}

/* ================= 상세 초기화 ================= */

export async function initPostDetail() {
  const bodyEl = document.getElementById('postBody');
  if (!bodyEl) return;

  const sp = new URLSearchParams(window.location.search);
  const postId = sp.get('id');

  if (!postId) {
    const titleEl = $('postTitle');
    if (titleEl) titleEl.textContent = '잘못된 접근';
    bodyEl.innerHTML = `<p class="post-body__hint">게시글 id가 없어.</p>`;
    return;
  }

  const post = await loadPostById(postId);

  if (!post) {
    const titleEl = $('postTitle');
    if (titleEl) titleEl.textContent = '게시물을 찾을 수 없음';
    bodyEl.innerHTML = `<p class="post-body__hint">삭제됐거나 존재하지 않는 글이야.</p>`;
    return;
  }

  if (wasViewFromList(post.id)) {
    consumeViewFromList(post.id);
  } else {
    bumpLocalView(post.id);
  }

  // ✅ 카테고리 테마 반영
  syncThemeByCategory(post.category);

  const titleEl = $('postTitle');
  const excerptEl = $('postExcerpt');
  const categoryEl = $('postCategory');
  const viewsEl = $('postViews');

  if (titleEl) titleEl.textContent = post.title || '';
  if (excerptEl) excerptEl.textContent = post.excerpt || '';
  if (categoryEl) categoryEl.textContent = post.category || '';
  if (viewsEl) viewsEl.textContent = `👀 ${getCombinedViews(post)}`;

  renderAuthor(post);
  renderTags(post.tags);

  bodyEl.innerHTML = renderBodyText(post.body);

  document.title = `${post.title} | 말린오이닷컴`;
}

export function initBackLink() {
  const backBtn = document.getElementById('postBack');
  if (!backBtn) return;

  backBtn.addEventListener('click', (e) => {
    e.preventDefault();

    if (window.history.length > 1) {
      window.history.back();
      return;
    }

    window.location.href = './index.html';
  });
}
