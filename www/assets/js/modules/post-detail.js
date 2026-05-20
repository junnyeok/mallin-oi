import { loadPostById } from './posts-repo.js';
import { getDisplayViews, incrementPostView } from './post-views.js';
import { supabase } from './supabase-client.js';
import { getCurrentUser, publicProfileHref } from './auth-store.js';

const DEFAULT_PROFILE_IMAGE = './images/logo-home.png';
const DEFAULT_CHARACTER_IMAGE = './images/characters/cucumber.png';
const profileImageCache = new Map();
const characterImageCache = new Map();
const characterEffectCache = new Map();
const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { getCharacterEffectByItemId } = await import(
  `./store-data.js?v=${MODULE_VERSION}`
);

const { listenEquipmentChanged } = await import(
  `./equipment-events.js?v=${MODULE_VERSION}`
);

function getProfileImageSrc(url) {
  return String(url || '').trim() || DEFAULT_PROFILE_IMAGE;
}

function getCharacterImageSrc(url) {
  return String(url || '').trim() || DEFAULT_CHARACTER_IMAGE;
}

async function loadProfileImageUrl(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return DEFAULT_PROFILE_IMAGE;

  if (profileImageCache.has(safeUserId)) {
    return profileImageCache.get(safeUserId);
  }

  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, profile_image_url')
    .eq('id', safeUserId)
    .maybeSingle();

  if (error) {
    console.error('[post-detail] load profile image failed:', error);
    profileImageCache.set(safeUserId, DEFAULT_PROFILE_IMAGE);
    return DEFAULT_PROFILE_IMAGE;
  }

  const imageUrl = getProfileImageSrc(data?.profile_image_url);
  profileImageCache.set(safeUserId, imageUrl);
  return imageUrl;
}

async function loadCharacterImageUrl(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return DEFAULT_CHARACTER_IMAGE;

  if (characterImageCache.has(safeUserId)) {
    return characterImageCache.get(safeUserId);
  }

  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, equipped_character_image_url')
    .eq('id', safeUserId)
    .maybeSingle();

  if (error) {
    console.error('[post-detail] load character image failed:', error);
    characterImageCache.set(safeUserId, DEFAULT_CHARACTER_IMAGE);
    return DEFAULT_CHARACTER_IMAGE;
  }

  const imageUrl = getCharacterImageSrc(data?.equipped_character_image_url);
  characterImageCache.set(safeUserId, imageUrl);
  return imageUrl;
}

function clearProfileAssetCache(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return;

  profileImageCache.delete(safeUserId);
  characterImageCache.delete(safeUserId);
  characterEffectCache.delete(safeUserId);
}

async function refreshAuthorEquipmentIfMine(post) {
  if (!post?.authorId) return;

  const user = await getCurrentUser();
  const currentUserId = String(user?.id || '').trim();
  const authorId = String(post.authorId || '').trim();

  if (!currentUserId || currentUserId !== authorId) return;

  clearProfileAssetCache(currentUserId);
  await renderAuthor(post);
}

async function loadCharacterEffectItemId(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return '';

  if (characterEffectCache.has(safeUserId)) {
    return characterEffectCache.get(safeUserId);
  }

  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, equipped_character_effect_item_id')
    .eq('id', safeUserId)
    .maybeSingle();

  if (error) {
    console.error('[post-detail] load character effect failed:', error);
    characterEffectCache.set(safeUserId, '');
    return '';
  }

  const effectItemId = String(
    data?.equipped_character_effect_item_id || '',
  ).trim();

  characterEffectCache.set(safeUserId, effectItemId);
  return effectItemId;
}

function renderCharacterEffectImg(effectItemId = '') {
  const effect = getCharacterEffectByItemId(effectItemId);
  if (!effect) return '';

  return `
    <img
      class="character-effect-img character-effect-img--heart"
      src="${escapeHtml(effect.imagePath)}"
      alt=""
      aria-hidden="true"
    />
  `;
}

function $(id) {
  return document.getElementById(id);
}

function navigateWithPjax(url) {
  const href = String(url || '').trim();
  if (!href) return;

  const tempLink = document.createElement('a');
  tempLink.href = href;
  tempLink.style.display = 'none';
  document.body.appendChild(tempLink);
  tempLink.click();
  tempLink.remove();
}

function getPostListHref(category = 'home') {
  const normalized = normalizeCategory(category);

  if (normalized === 'home') {
    return './posts-all.html';
  }

  return `./posts-all.html?tab=${encodeURIComponent(normalized)}`;
}

function redirectToPostList(category = 'home') {
  window.location.replace(getPostListHref(category));
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function emitPostAccessState(post, secretPassword = '') {
  window.dispatchEvent(
    new CustomEvent('mallin:post-access', {
      detail: {
        postId: Number(post?.id || 0),
        isPrivate: !!post?.isPrivate,
        isUnlocked: !!post?.isUnlocked,
        secretPassword: String(secretPassword || ''),
      },
    }),
  );
}

/* =========================
  THEME SYNC
========================= */

function normalizeCategory(category) {
  const value = String(category || '')
    .trim()
    .toLowerCase();

  if (value === 'study') return 'study';
  if (value === 'work') return 'work';
  if (value === 'event') return 'event';
  if (value === 'career') return 'career';
  return 'home';
}

function getThemeLogoSrc(category, base = './') {
  const safeBase = String(base || './');

  const map = {
    home: `${safeBase}images/logo-home.png`,
    study: `${safeBase}images/logo-study.png`,
    work: `${safeBase}images/logo-work.png`,
    event: `${safeBase}images/logo-event.png`,
    career: `${safeBase}images/logo-career.png`,
  };

  return map[normalizeCategory(category)] || map.home;
}

function getPageHrefByCategory(category, base = './') {
  const safeBase = String(base || './');
  const normalized = normalizeCategory(category);

  const map = {
    home: `${safeBase}index.html`,
    study: `${safeBase}study.html`,
    work: `${safeBase}work.html`,
    event: `${safeBase}event.html`,
    career: `${safeBase}career.html`,
  };

  return map[normalized] || map.home;
}

function syncThemeByCategory(category) {
  const normalized = normalizeCategory(category);
  const body = document.body;
  if (!body) return;

  body.classList.remove(
    'theme-home',
    'theme-study',
    'theme-work',
    'theme-event',
    'theme-career',
  );
  body.classList.add(`theme-${normalized}`);

  const base = body.dataset.base || './';

  const logoSrc = getThemeLogoSrc(normalized, base);
  const currentHref = getPageHrefByCategory(normalized, base);

  const headerLogo = document.getElementById('siteLogoImg');
  if (headerLogo) {
    headerLogo.src = logoSrc;
  }

  const footerLogo = document.getElementById('footerLogoImg');
  if (footerLogo) {
    footerLogo.src = logoSrc;
  }

  const navLinks = document.querySelectorAll('.site-nav__link');
  navLinks.forEach((link) => {
    link.removeAttribute('aria-current');
    link.classList.remove('is-active');

    const href = link.getAttribute('href') || '';
    if (href === currentHref) {
      link.setAttribute('aria-current', 'page');
      link.classList.add('is-active');
    }
  });

  const listBtn = document.getElementById('postListBtn');
  if (listBtn) {
    // 게시물 상세 페이지의 "목록" 버튼은 게시물 카테고리와 상관없이
    // 항상 전체게시물 페이지의 "전체" 탭으로 이동시킨다.
    listBtn.href = `${base}posts-all.html`;
  }
}

/* =========================
  RENDER
========================= */

function renderTags(tags = []) {
  const wrap = $('postTags');
  if (!wrap) return;

  wrap.innerHTML = (tags || [])
    .map((t) => `<span class="tag">#${escapeHtml(t)}</span>`)
    .join('');
}

async function renderAuthor(post) {
  const authorEl = $('postAuthor');
  if (!authorEl) return;

  const nickname = escapeHtml(post.authorNickname || '익명');
  const privateMark = post.isPrivate
    ? ' <span class="post-author__lock">🔒</span>'
    : '';

  if (post.authorId) {
    const [profileImageUrl, characterImageUrl, characterEffectItemId] =
      await Promise.all([
        loadProfileImageUrl(post.authorId),
        loadCharacterImageUrl(post.authorId),
        loadCharacterEffectItemId(post.authorId),
      ]);

    const characterEffectHtml = renderCharacterEffectImg(characterEffectItemId);
    authorEl.innerHTML = `
  <span class="post-author__label">작성자 :</span>
  <span class="post-author__value">
    <a
      class="post-author__avatar-link"
      href="${publicProfileHref(post.authorId)}"
      aria-label="${nickname} 프로필로 이동"
    >
      <img
        class="post-author__avatar"
        src="${escapeHtml(profileImageUrl)}"
        alt="${nickname} 프로필 사진"
      />
    </a>
    <a
      class="post-author__link"
      href="${publicProfileHref(post.authorId)}"
    >${nickname}</a>${privateMark}
    <span class="character-effect-wrap post-author__character-effect-wrap">
  <img
    class="post-author__character"
    src="${escapeHtml(characterImageUrl)}"
    alt="${nickname} 캐릭터"
  />
  ${characterEffectHtml}
</span>
  </span>
`;
    return;
  }

  const characterEffectHtml = '';

  authorEl.innerHTML = `
  <span class="post-author__label">작성자 :</span>
  <span class="post-author__value">
    <img
      class="post-author__avatar"
      src="${escapeHtml(DEFAULT_PROFILE_IMAGE)}"
      alt="${nickname} 프로필 사진"
    />
    <span>${nickname}</span>${privateMark}
    <span class="character-effect-wrap post-author__character-effect-wrap">
  <img
    class="post-author__character"
    src="${escapeHtml(DEFAULT_CHARACTER_IMAGE)}"
    alt="${nickname} 캐릭터"
  />
  ${characterEffectHtml}
</span>
  </span>
`;
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

  if (!edited) {
    el.textContent = `작성일 : ${createdText}`;
    return;
  }

  el.textContent = `작성일 : ${createdText} · 수정됨 (${updatedText})`;
}

function isSafeUrl(url = '') {
  const value = String(url || '').trim();
  if (!value) return false;

  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('/') ||
    value.startsWith('./') ||
    value.startsWith('../') ||
    value.startsWith('blob:')
  );
}

function isSafeIframeUrl(url = '') {
  const value = String(url || '').trim();
  if (!value) return false;

  try {
    const parsed = new URL(value, window.location.origin);
    const host = parsed.hostname.toLowerCase();

    const allowedHosts = new Set([
      'www.youtube.com',
      'youtube.com',
      'www.youtube-nocookie.com',
      'youtube-nocookie.com',
    ]);

    return allowedHosts.has(host) && parsed.pathname.startsWith('/embed/');
  } catch {
    return false;
  }
}

function sanitizeNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return document.createTextNode(node.textContent || '');
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return document.createTextNode('');
  }

  const tag = String(node.tagName || '').toLowerCase();

  const allowedTags = new Set([
    'div',
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    'blockquote',
    'ul',
    'ol',
    'li',
    'figure',
    'img',
    'video',
    'source',
    'iframe',
    'a',
  ]);

  if (!allowedTags.has(tag)) {
    const frag = document.createDocumentFragment();
    [...node.childNodes].forEach((child) => {
      frag.appendChild(sanitizeNode(child));
    });
    return frag;
  }

  const clean = document.createElement(tag);

  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    if (isSafeUrl(href)) {
      clean.setAttribute('href', href);
      clean.setAttribute('target', '_blank');
      clean.setAttribute('rel', 'noopener noreferrer');
    }
    if (node.className) clean.className = node.className;
  }

  if (tag === 'img') {
    const src = node.getAttribute('src') || '';
    if (isSafeUrl(src)) clean.setAttribute('src', src);
    clean.setAttribute('alt', node.getAttribute('alt') || '');
    clean.setAttribute('loading', 'lazy');
    if (node.className) clean.className = node.className;
  }

  if (tag === 'video') {
    const src = node.getAttribute('src') || '';
    if (isSafeUrl(src)) clean.setAttribute('src', src);
    clean.setAttribute('controls', '');
    clean.setAttribute('playsinline', '');
    clean.setAttribute('preload', 'metadata');
    if (node.className) clean.className = node.className;
  }

  if (tag === 'source') {
    const src = node.getAttribute('src') || '';
    if (isSafeUrl(src)) clean.setAttribute('src', src);
    const type = node.getAttribute('type') || '';
    if (type) clean.setAttribute('type', type);
  }

  if (tag === 'iframe') {
    const src = node.getAttribute('src') || '';
    if (!isSafeIframeUrl(src)) {
      return document.createTextNode('');
    }

    clean.setAttribute('src', src);
    clean.setAttribute('loading', 'lazy');
    clean.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    clean.setAttribute(
      'allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
    );
    clean.setAttribute('allowfullscreen', '');

    const title = node.getAttribute('title') || '동영상';
    clean.setAttribute('title', title);

    if (node.className) clean.className = node.className;
  }

  if (
    [
      'div',
      'p',
      'blockquote',
      'figure',
      'ul',
      'ol',
      'li',
      'strong',
      'b',
      'em',
      'i',
      'u',
    ].includes(tag)
  ) {
    if (node.className) clean.className = node.className;
  }

  const mediaId = node.getAttribute?.('data-media-id');
  if (mediaId) clean.setAttribute('data-media-id', mediaId);

  const dataAlign = node.getAttribute?.('data-align');
  if (['left', 'center', 'right'].includes(dataAlign)) {
    clean.setAttribute('data-align', dataAlign);
  }

  [...node.childNodes].forEach((child) => {
    clean.appendChild(sanitizeNode(child));
  });

  return clean;
}

function sanitizeRichHtml(html = '') {
  const parser = new DOMParser();
  const doc = parser.parseFromString(String(html || ''), 'text/html');
  const frag = document.createDocumentFragment();

  [...doc.body.childNodes].forEach((child) => {
    frag.appendChild(sanitizeNode(child));
  });

  const wrap = document.createElement('div');
  wrap.appendChild(frag);
  return wrap.innerHTML;
}

function renderBodyText(text = '') {
  const raw = String(text || '').trim();
  if (!raw) return `<div class="post-body__text"></div>`;

  const looksLikeHtml = /<([a-z][a-z0-9]*)\b[^>]*>/i.test(raw);

  if (!looksLikeHtml) {
    const safe = escapeHtml(raw).replaceAll('\n', '<br />');
    return `<div class="post-body__text">${safe}</div>`;
  }

  return `<div class="post-body__text">${sanitizeRichHtml(raw)}</div>`;
}

function collectEmbeddedMediaIds(body = '') {
  const raw = String(body || '').trim();
  if (!raw) return new Set();

  const parser = new DOMParser();
  const doc = parser.parseFromString(raw, 'text/html');

  return new Set(
    [...doc.querySelectorAll('[data-media-id]')]
      .map((el) => el.getAttribute('data-media-id'))
      .filter(Boolean),
  );
}

function filterStandaloneAttachments(items = [], body = '') {
  const embeddedIds = collectEmbeddedMediaIds(body);

  return (Array.isArray(items) ? items : []).filter((item) => {
    if (!item?.id) return true;
    return !embeddedIds.has(String(item.id));
  });
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function shortenUrl(url, max = 72) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

function renderAttachmentCaption(title, url) {
  const safeTitle = escapeHtml(title || '첨부');
  const safeUrl = escapeAttr(url || '');
  const shortUrl = escapeHtml(shortenUrl(url || ''));

  return `
    <figcaption class="post-attach__caption">
      <strong class="post-attach__name">${safeTitle}</strong>
      <a
        class="post-attach__url"
        href="${safeUrl}"
        target="_blank"
        rel="noopener noreferrer"
        title="${safeUrl}"
      >
        ${shortUrl}
      </a>
    </figcaption>
  `;
}

function renderFileAttachment(title, url) {
  const safeTitle = escapeHtml(title || '첨부');
  const safeUrl = escapeAttr(url || '');
  const shortUrl = escapeHtml(shortenUrl(url || ''));

  return `
    <div class="post-attach post-attach--file">
      <div class="post-attach__file-card">
        <div class="post-attach__file-head">
          <span class="post-attach__file-badge">링크</span>
          <strong class="post-attach__name">${safeTitle}</strong>
        </div>

        <a
          class="post-attach__url"
          href="${safeUrl}"
          target="_blank"
          rel="noopener noreferrer"
          title="${safeUrl}"
        >
          ${shortUrl}
        </a>

        <div class="post-attach__file-actions">
          <a
            class="post-attach__open-btn"
            href="${safeUrl}"
            target="_blank"
            rel="noopener noreferrer"
          >
            열기
          </a>
        </div>
      </div>
    </div>
  `;
}

function renderAttachments(items = []) {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return '';

  const rows = list
    .map((item) => {
      const type = String(item?.type || '').trim();
      const title = item?.title || item?.fileName || '첨부';
      const url = String(item?.url || '').trim();

      if (!url) return '';

      const safeUrl = escapeAttr(url);
      const safeTitle = escapeAttr(title);

      if (type === 'image') {
        return `
          <figure class="post-attach post-attach--image">
            <a
              class="post-attach__media-link"
              href="${safeUrl}"
              target="_blank"
              rel="noopener noreferrer"
            >
              <img
                src="${safeUrl}"
                alt="${safeTitle}"
                loading="lazy"
                decoding="async"
              />
            </a>
            ${renderAttachmentCaption(title, url)}
          </figure>
        `;
      }

      if (type === 'video') {
        return `
          <figure class="post-attach post-attach--video">
            <video
              src="${safeUrl}"
              controls
              playsinline
              preload="metadata"
            ></video>
            ${renderAttachmentCaption(title, url)}
          </figure>
        `;
      }

      return renderFileAttachment(title, url);
    })
    .filter(Boolean)
    .join('');

  if (!rows) return '';
  return `<div class="post-attachments">${rows}</div>`;
}

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
        navigateWithPjax(`./write.html?edit=${encodeURIComponent(post.id)}`);
      };
    }

    if (canDelete) {
      deleteBtn.hidden = false;
      deleteBtn.disabled = false;

      deleteBtn.onclick = async () => {
        const ok = window.confirm(
          canEdit
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
        redirectToPostList(post.category);
      };
    }
  } catch (err) {
    console.error('[post-detail] owner action bind failed:', err);
  }
}

function showSecretBox(show) {
  const box = $('postSecretBox');
  if (!box) return;
  box.hidden = !show;
}

function setSecretMessage(text, isError = false) {
  const msg = $('postSecretMsg');
  if (!msg) return;
  msg.textContent = text;
  msg.style.color = isError ? '#d93025' : 'var(--color-text-sub)';
}

function renderLockedState() {
  const bodyEl = $('postBody');
  const attachWrap = $('postAttachments');

  showSecretBox(true);

  if (bodyEl) {
    bodyEl.innerHTML = `<p class="post-body__hint">비밀번호를 입력해야 본문을 볼 수 있어.</p>`;
  }

  if (attachWrap) {
    attachWrap.innerHTML = '';
  }
}

function renderUnlockedState(post) {
  const bodyEl = $('postBody');
  const attachWrap = $('postAttachments');

  showSecretBox(false);

  if (bodyEl) {
    bodyEl.innerHTML = renderBodyText(post.body || '');
  }

  if (attachWrap) {
    const restAttachments = filterStandaloneAttachments(
      post.mediaItems || [],
      post.body || '',
    );

    attachWrap.innerHTML = renderAttachments(restAttachments);
  }
}

async function applyPost(post) {
  syncThemeByCategory(post.category || 'home');

  const titleEl = $('postTitle');
  const excerptEl = $('postExcerpt');
  const categoryEl = $('postCategory');
  const viewsEl = $('postViews');
  const reactionMetaEl = $('postReactionMeta');
  const commentMetaEl = $('postCommentMeta');

  if (titleEl) titleEl.textContent = post.title || '';
  if (excerptEl) excerptEl.textContent = post.excerpt || '';

  if (categoryEl) {
    categoryEl.textContent = post.isPrivate
      ? `${post.category || ''} · 비밀글`
      : post.category || '';
  }

  if (viewsEl) {
    viewsEl.textContent = `👀 ${getDisplayViews(post)}`;
  }

  if (reactionMetaEl) {
    reactionMetaEl.textContent = `👍 ${Number(post.totalReactionsCount || 0)}`;
  }

  if (commentMetaEl) {
    commentMetaEl.textContent =
      post.isPrivate && !post.isUnlocked
        ? '💬 비공개'
        : `💬 ${Number(post.commentCount || 0)}`;
  }

  await renderAuthor(post);
  renderPostDateTime(post);
  renderTags(post.tags);

  if (post.isPrivate && !post.isUnlocked) {
    renderLockedState();
  } else {
    renderUnlockedState(post);
  }

  await bindOwnerActions(post);
  document.title = `${post.title} | 말린오이닷컴`;
}

export async function initPostDetail() {
  const bodyEl = document.getElementById('postBody');
  if (!bodyEl) return;

  const sp = new URLSearchParams(window.location.search);
  const postId = sp.get('id');

  if (!postId) {
    alert('잘못된 접근이야. 전체 게시물로 이동할게.');
    redirectToPostList('home');
    return;
  }

  let post = await loadPostById(postId);
  let activePost = post;

  if (!post) {
    alert('삭제됐거나 존재하지 않는 글이야. 전체 게시물로 이동할게.');
    redirectToPostList('home');
    return;
  }

  const newViews = await incrementPostView(post.id);
  if (Number.isFinite(newViews)) {
    post = { ...post, views: newViews };
  }

  await applyPost(post);
  activePost = post;
  emitPostAccessState(post, '');

  listenEquipmentChanged(async (detail = {}) => {
    const user = await getCurrentUser();
    const currentUserId = String(user?.id || '').trim();
    const changedUserId = String(detail?.userId || '').trim();

    if (!currentUserId) return;
    if (changedUserId && changedUserId !== currentUserId) return;

    await refreshAuthorEquipmentIfMine(activePost);
  });

  const secretForm = $('postSecretForm');
  const secretInput = $('postSecretPassword');

  if (secretForm && secretInput) {
    secretInput.value = '';

    secretForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const pw = secretInput.value.trim();
      if (!pw) {
        setSecretMessage('비밀번호를 입력해줘.', true);
        secretInput.focus();
        return;
      }

      setSecretMessage('확인 중...');

      try {
        const unlockedPost = await loadPostById(postId, pw);

        if (!unlockedPost) {
          setSecretMessage('게시물을 찾지 못했어.', true);
          return;
        }

        if (unlockedPost.isPrivate && !unlockedPost.isUnlocked) {
          setSecretMessage('비밀번호가 일치하지 않아.', true);
          secretInput.focus();
          return;
        }

        secretInput.value = '';
        setSecretMessage('');
        activePost = unlockedPost;
        await applyPost(unlockedPost);
        emitPostAccessState(unlockedPost, pw);
      } catch (error) {
        console.error('[post-detail] unlock failed:', error);
        setSecretMessage('비밀번호 확인 중 오류가 발생했어.', true);
      }
    });
  }
}
