import { loadPostById } from './posts-repo.js';
import {
  consumeViewFromList,
  countPostViewOnce,
  getDisplayViews,
  getOptimisticViews,
  wasViewFromList,
} from './post-views.js';
import { supabase } from './supabase-client.js';
import { getCurrentUser } from './auth-store.js';

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

/* ================= 권한 유틸 ================= */

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[post-detail] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    isAdmin: !!row?.is_admin,
  };
}

/* ================= 게시물 관리 ================= */

async function bindOwnerActions(post) {
  const actionWrap = $('postOwnerActions');
  const editBtn = $('postEditBtn');
  const deleteBtn = $('postDeleteBtn');

  if (!actionWrap || !editBtn || !deleteBtn) return;

  actionWrap.hidden = true;

  try {
    const [user, role] = await Promise.all([getCurrentUser(), getMyRole()]);

    const isOwner =
      !!user && !!post?.authorId && String(user.id) === String(post.authorId);
    const isAdmin = !!role?.isAdmin;

    if (!isOwner && !isAdmin) return;

    actionWrap.hidden = false;

    if (isOwner || isAdmin) {
      editBtn.hidden = false;
      editBtn.disabled = false;
      editBtn.onclick = () => {
        window.location.href = `./write.html?edit=${encodeURIComponent(post.id)}`;
      };
    } else {
      editBtn.hidden = true;
      editBtn.disabled = true;
    }

    deleteBtn.hidden = false;
    deleteBtn.disabled = false;

    deleteBtn.onclick = async () => {
      const isMyPost = isOwner;
      const ok = window.confirm(
        isMyPost
          ? '이 게시물을 삭제할까? 삭제하면 댓글도 함께 삭제돼.'
          : '관리자 권한으로 이 게시물을 삭제할까? 삭제하면 댓글도 함께 삭제돼.',
      );
      if (!ok) return;

      deleteBtn.disabled = true;
      editBtn.disabled = true;

      const { error } = await supabase.from('posts').delete().eq('id', post.id);

      if (error) {
        console.error('[post-detail] delete failed:', error);
        alert('게시물 삭제에 실패했어.');
        deleteBtn.disabled = false;
        editBtn.disabled = false;
        return;
      }

      alert('게시물이 삭제됐어.');
      window.location.href = './posts-all.html';
    };
  } catch (err) {
    console.error('[post-detail] owner action bind failed:', err);
  }
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

  let post = await loadPostById(postId);

  if (!post) {
    const titleEl = $('postTitle');
    if (titleEl) titleEl.textContent = '게시물을 찾을 수 없음';
    bodyEl.innerHTML = `<p class="post-body__hint">삭제됐거나 존재하지 않는 글이야.</p>`;
    return;
  }

  const optimisticViews = getOptimisticViews(post.id);
  if (Number.isFinite(optimisticViews)) {
    post = { ...post, views: optimisticViews };
  }

  if (wasViewFromList(post.id)) {
    consumeViewFromList(post.id);
  } else {
    const newViews = await countPostViewOnce(post.id, post.views);
    if (Number.isFinite(newViews)) {
      post = { ...post, views: newViews };
    }
  }

  syncThemeByCategory(post.category);

  const titleEl = $('postTitle');
  const excerptEl = $('postExcerpt');
  const categoryEl = $('postCategory');
  const viewsEl = $('postViews');

  if (titleEl) titleEl.textContent = post.title || '';
  if (excerptEl) excerptEl.textContent = post.excerpt || '';
  if (categoryEl) categoryEl.textContent = post.category || '';
  if (viewsEl) viewsEl.textContent = `👀 ${getDisplayViews(post)}`;

  renderAuthor(post);
  renderTags(post.tags);

  bodyEl.innerHTML = renderBodyText(post.body);
  await bindOwnerActions(post);

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
