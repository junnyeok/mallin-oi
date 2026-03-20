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

function formatDateTime(value) {
  if (!value) return '';

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');

  return `${yyyy}.${mm}.${dd} ${hh}:${mi}`;
}

function isEdited(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false;

  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();

  if (Number.isNaN(created) || Number.isNaN(updated)) return false;

  return updated - created >= 1000;
}

function renderPostDateTime(post) {
  const el = $('postDateTime');
  if (!el) return;

  const createdText = formatDateTime(post.createdAt);
  const updatedText = formatDateTime(post.updatedAt);
  const edited = isEdited(post.createdAt, post.updatedAt);

  if (!createdText) {
    el.textContent = '작성일 : -';
    return;
  }

  if (edited && updatedText) {
    el.innerHTML = `
      <span class="post-datetime__label">작성일 :</span>
      <span class="post-datetime__value">${escapeHtml(createdText)}</span>
      <span class="post-edited-badge">수정됨</span>
      <span class="post-datetime__updated">(${escapeHtml(updatedText)})</span>
    `;
    return;
  }

  el.innerHTML = `
    <span class="post-datetime__label">작성일 :</span>
    <span class="post-datetime__value">${escapeHtml(createdText)}</span>
  `;
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

/* ================= 첨부 렌더 ================= */

function normalizeMediaItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      id: String(item?.id || ''),
      type: String(item?.type || '').trim(),
      title: String(item?.title || '').trim(),
      url: String(item?.url || '').trim(),
      path: String(item?.path || '').trim(),
      fileName: String(item?.fileName || '').trim(),
      mimeType: String(item?.mimeType || '').trim(),
      size: Number(item?.size || 0),
    }))
    .filter((item) => item.type && item.url);
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function getAttachmentLabel(type) {
  switch (type) {
    case 'image':
      return '사진';
    case 'video':
      return '영상';
    case 'file':
      return '파일';
    case 'link':
      return '링크';
    case 'map':
      return '지도';
    default:
      return '첨부';
  }
}

function getAttachmentIcon(type) {
  switch (type) {
    case 'image':
      return '🖼️';
    case 'video':
      return '🎬';
    case 'file':
      return '📎';
    case 'link':
      return '🔗';
    case 'map':
      return '🗺️';
    default:
      return '📄';
  }
}

function renderImageItem(item) {
  const title = item.title || item.fileName || '이미지';

  return `
    <figure class="post-attach-card post-attach-card--image">
      <a
        class="post-attach-media-link"
        href="${escapeHtml(item.url)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        <img
          class="post-attach-image"
          src="${escapeHtml(item.url)}"
          alt="${escapeHtml(title)}"
          loading="lazy"
        />
      </a>
      <figcaption class="post-attach-caption">
        <span class="post-attach-badge">🖼️ 사진</span>
        <span class="post-attach-title">${escapeHtml(title)}</span>
      </figcaption>
    </figure>
  `;
}

function renderVideoItem(item) {
  const title = item.title || item.fileName || '영상';
  const meta = [getAttachmentLabel(item.type), formatBytes(item.size)]
    .filter(Boolean)
    .join(' · ');

  return `
    <article class="post-attach-card">
      <video
        class="post-attach-video"
        controls
        preload="metadata"
        playsinline
        src="${escapeHtml(item.url)}"
      ></video>
      <div class="post-attach-info">
        <p class="post-attach-title">${escapeHtml(title)}</p>
        <p class="post-attach-meta">${escapeHtml(meta)}</p>
      </div>
    </article>
  `;
}

function renderFileItem(item) {
  const title = item.title || item.fileName || '파일';
  const meta = [
    getAttachmentLabel(item.type),
    item.fileName || '',
    formatBytes(item.size),
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <article class="post-attach-card post-attach-card--file">
      <div class="post-attach-file">
        <div class="post-attach-file__icon">📎</div>
        <div class="post-attach-file__body">
          <p class="post-attach-title">${escapeHtml(title)}</p>
          <p class="post-attach-meta">${escapeHtml(meta)}</p>
        </div>
        <a
          class="post-attach-file__btn"
          href="${escapeHtml(item.url)}"
          target="_blank"
          rel="noopener noreferrer"
          download
        >
          다운로드
        </a>
      </div>
    </article>
  `;
}

function renderLinkLikeItem(item) {
  const title =
    item.title ||
    item.fileName ||
    item.url ||
    (item.type === 'map' ? '지도 링크' : '링크');

  const badge =
    item.type === 'map'
      ? `${getAttachmentIcon(item.type)} 지도`
      : `${getAttachmentIcon(item.type)} 링크`;

  return `
    <article class="post-attach-card post-attach-card--link">
      <div class="post-attach-link">
        <div class="post-attach-link__body">
          <p class="post-attach-badge">${escapeHtml(badge)}</p>
          <p class="post-attach-title">${escapeHtml(title)}</p>
          <p class="post-attach-url">${escapeHtml(item.url)}</p>
        </div>
        <a
          class="post-attach-link__btn"
          href="${escapeHtml(item.url)}"
          target="_blank"
          rel="noopener noreferrer"
        >
          열기
        </a>
      </div>
    </article>
  `;
}

function renderAttachmentItem(item) {
  switch (item.type) {
    case 'image':
      return renderImageItem(item);
    case 'video':
      return renderVideoItem(item);
    case 'file':
      return renderFileItem(item);
    case 'link':
    case 'map':
      return renderLinkLikeItem(item);
    default:
      return '';
  }
}

function renderAttachments(items = []) {
  const mediaItems = normalizeMediaItems(items);

  if (!mediaItems.length) return '';

  const imageItems = mediaItems.filter((item) => item.type === 'image');
  const otherItems = mediaItems.filter((item) => item.type !== 'image');

  const imageSection = imageItems.length
    ? `
      <section class="post-attachments__section">
        <h3 class="post-attachments__sub">사진</h3>
        <div class="post-attach-gallery">
          ${imageItems.map(renderAttachmentItem).join('')}
        </div>
      </section>
    `
    : '';

  const otherSection = otherItems.length
    ? `
      <section class="post-attachments__section">
        <h3 class="post-attachments__sub">첨부</h3>
        <div class="post-attach-stack">
          ${otherItems.map(renderAttachmentItem).join('')}
        </div>
      </section>
    `
    : '';

  return `
    <section class="post-attachments">
      <h2 class="post-attachments__title">첨부 자료</h2>
      ${imageSection}
      ${otherSection}
    </section>
  `;
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

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = String(value ?? '')
    .trim()
    .toLowerCase();

  return text === 'true' || text === 't' || text === '1';
}

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[post-detail] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

/* ================= 게시물 관리 ================= */

async function bindOwnerActions(post) {
  const actionWrap = $('postOwnerActions');
  const editBtn = $('postEditBtn');
  const deleteBtn = $('postDeleteBtn');

  if (!actionWrap || !editBtn || !deleteBtn) return;

  actionWrap.hidden = true;
  editBtn.hidden = true;
  deleteBtn.hidden = true;
  editBtn.disabled = true;
  deleteBtn.disabled = true;

  try {
    const [user, role] = await Promise.all([getCurrentUser(), getMyRole()]);

    const isOwner =
      !!user && !!post?.authorId && String(user.id) === String(post.authorId);
    const isAdmin = !!role?.isAdmin;
    const canDelete = isOwner || isAdmin;
    const canEdit = isOwner;

    if (!canDelete && !canEdit) return;

    actionWrap.hidden = false;

    if (canEdit) {
      editBtn.hidden = false;
      editBtn.disabled = false;
      editBtn.onclick = () => {
        window.location.href = `./write.html?edit=${encodeURIComponent(post.id)}`;
      };
    }

    if (canDelete) {
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

        const { error } = await supabase
          .from('posts')
          .delete()
          .eq('id', post.id);

        if (error) {
          console.error('[post-detail] delete failed:', error);
          alert('게시물 삭제에 실패했어.');
          deleteBtn.disabled = false;
          if (!editBtn.hidden) editBtn.disabled = false;
          return;
        }

        alert('게시물이 삭제됐어.');
        window.location.href = './posts-all.html';
      };
    }
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
  renderPostDateTime(post);
  renderTags(post.tags);

  const bodyHtml = renderBodyText(post.body);
  const attachHtml = renderAttachments(
    post.mediaItems || post.media_items || [],
  );
  bodyEl.innerHTML = `${bodyHtml}${attachHtml}`;

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
