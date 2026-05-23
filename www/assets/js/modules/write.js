import { supabase } from './supabase-client.js';
import { loadEditablePostById } from './posts-repo.js';
import {
  loadOwnedEmoticons,
  renderOwnedEmoticonPicker,
  createInlineEmoticonNode,
  switchEmoticonPickerPack,
} from './emoticons.js';
import { playPickleBurst } from './pickle-burst.js';

const ALLOWED_CATEGORIES = new Set(['study', 'work', 'event', 'career']);
const STORAGE_BUCKET = 'post-assets';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const FILE_MAX_BYTES = 30 * 1024 * 1024;

let attachmentState = [];
let removedStoragePaths = new Set();
let savedSelectionRange = null;
let activeEmbedId = '';
let isEditorComposing = false;

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

function $(selector) {
  return document.querySelector(selector);
}

function createLocalId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
async function hasPostCreatePickleReward(userId, postId) {
  if (!userId || !postId) return false;

  const { data, error } = await supabase
    .from('pickle_ledger')
    .select('id, amount')
    .eq('user_id', userId)
    .eq('reason_code', 'post_create')
    .eq('source_post_id', postId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[write] reward check failed:', error);
    return false;
  }

  return !!data && Number(data.amount || 0) > 0;
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#96;');
}

function normalizeCategory(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();

  return ALLOWED_CATEGORIES.has(v) ? v : 'study';
}

function parseTags(input) {
  const raw = String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const clean = raw.map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);

  return [...new Set(clean)];
}

function saveRedirectHere() {
  try {
    sessionStorage.setItem(
      'redirectAfterLogin',
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {}
}

function getNicknameFromUser(user) {
  return (
    user?.user_metadata?.nickname ||
    user?.user_metadata?.display_name ||
    (user?.email ? user.email.split('@')[0] : '익명')
  );
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[write] getUser failed:', error);
    return null;
  }

  return data.user || null;
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
    console.error('[write] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

function getEditPostId() {
  const sp = new URLSearchParams(window.location.search);
  const id = Number(sp.get('edit') || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function setWriteModeUi(isEdit) {
  const titleEl = document.querySelector('.write__title');
  const descEl = document.querySelector('.write__desc');
  const submitBtn = $('#writeSubmitBtn');
  const note = $('#writeNote');

  if (titleEl) {
    titleEl.textContent = isEdit ? '게시물 수정' : '새 글쓰기';
  }

  if (descEl) {
    descEl.textContent = isEdit
      ? '기존 게시물을 수정할 수 있어.'
      : '제목, 요약, 본문을 입력해서 새 게시물을 등록해줘.';
  }

  if (submitBtn) {
    submitBtn.textContent = isEdit ? '수정 완료' : '등록하기';
  }

  if (note) {
    note.textContent = isEdit
      ? '수정 모드야. 내용을 바꾼 뒤 저장해줘.'
      : '로그인한 사용자만 글을 등록할 수 있어.';
  }
}

function setPinnedUiVisible(isAdmin) {
  const row = $('#pinnedRow');
  if (!row) return;
  row.hidden = !isAdmin;
}

function resetAttachmentInputs() {
  const fileInput = $('#writeFile');
  const imageInput = $('#writeImage');
  const videoInput = $('#writeVideo');

  if (fileInput) fileInput.value = '';
  if (imageInput) imageInput.value = '';
  if (videoInput) videoInput.value = '';
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let current = value;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

function getAttachmentLabel(type) {
  if (type === 'image') return '이미지';
  if (type === 'video') return '동영상';
  if (type === 'video-link') return '동영상 링크';
  return '파일';
}

const DIRECT_VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv|ogg)(\?.*)?$/i;

function extractYoutubeId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || '';
    }

    if (host.includes('youtube.com')) {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v') || '';
      }

      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || '';
      }

      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || '';
      }
    }

    return '';
  } catch {
    return '';
  }
}

function parseVideoLink(rawInput = '') {
  const raw = String(rawInput || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const youtubeId = extractYoutubeId(raw);

    if (youtubeId) {
      return {
        type: 'video-link',
        embedKind: 'youtube',
        title: '유튜브 동영상',
        url: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
        originalUrl: raw,
        fileName: '',
        mimeType: 'text/html',
        size: 0,
      };
    }

    if (DIRECT_VIDEO_EXT_RE.test(parsed.pathname.toLowerCase())) {
      const fileName = parsed.pathname.split('/').pop() || 'video';

      return {
        type: 'video-link',
        embedKind: 'direct',
        title: fileName,
        url: raw,
        originalUrl: raw,
        fileName,
        mimeType: 'video/*',
        size: 0,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function pushExternalVideoLink(rawUrl) {
  const parsed = parseVideoLink(rawUrl);

  if (!parsed) {
    return '지원하지 않는 동영상 링크야. 유튜브 링크나 직접 재생 가능한 mp4/webm 링크를 넣어줘.';
  }

  const item = {
    id: createLocalId(),
    type: parsed.type,
    embedKind: parsed.embedKind,
    title: parsed.title,
    fileName: parsed.fileName,
    mimeType: parsed.mimeType,
    size: parsed.size,
    url: parsed.url,
    originalUrl: parsed.originalUrl,
    previewUrl: parsed.url,
    removable: true,
  };

  attachmentState.push(item);
  renderAttachmentList();
  insertAttachmentIntoEditor(item);
  return '';
}

function getBodyEditor() {
  return $('#bodyEditor');
}

function getBodyField() {
  return $('#body');
}

function isRangeInsideBodyEditor(range) {
  const editor = getBodyEditor();

  if (!editor || !range) return false;

  const startContainer = range.startContainer;
  const endContainer = range.endContainer;
  const commonAncestor = range.commonAncestorContainer;

  if (!startContainer || !endContainer || !commonAncestor) return false;

  const startRoot =
    startContainer.nodeType === Node.DOCUMENT_NODE
      ? startContainer
      : startContainer.getRootNode?.();

  const endRoot =
    endContainer.nodeType === Node.DOCUMENT_NODE
      ? endContainer
      : endContainer.getRootNode?.();

  if (startRoot !== document || endRoot !== document) return false;

  return (
    editor.contains(startContainer) &&
    editor.contains(endContainer) &&
    editor.contains(commonAncestor)
  );
}

function preserveEditorSelectionFromEvent(event) {
  const editor = getBodyEditor();
  if (!editor) return;

  const target = event?.target;

  if (
    target?.closest?.('#writeEmoticonToggle') ||
    target?.closest?.('#writeEmoticonPanel')
  ) {
    saveCurrentSelectionRange();
  }
}

async function initWriteEmoticonPicker(user) {
  const editor = getBodyEditor();
  const toggleBtn = $('#writeEmoticonToggle');
  const panel = $('#writeEmoticonPanel');

  if (!editor || !toggleBtn || !panel) return;

  if (!user?.id) {
    toggleBtn.disabled = true;
    panel.innerHTML = renderOwnedEmoticonPicker([], {
      emptyText: '로그인 후 이모티콘을 사용할 수 있어.',
    });
    return;
  }

  const ownedEmoticons = await loadOwnedEmoticons(user.id);

  panel.innerHTML = renderOwnedEmoticonPicker(ownedEmoticons, {
    emptyText: '보유한 이모티콘이 없어.',
  });

  switchEmoticonPickerPack(panel);

  toggleBtn.disabled = ownedEmoticons.length === 0;

  const keepEditorSelection = (event) => {
    preserveEditorSelectionFromEvent(event);

    /*
      이모티콘 버튼/패널을 누르는 순간 버튼으로 포커스가 이동하면
      모바일 Safari/Chrome에서 contenteditable selection이 이전 줄로 돌아가거나 사라질 수 있다.
      기본 포커스 이동만 막고, 실제 선택 처리는 click 이벤트에서 그대로 처리한다.
    */
    event.preventDefault();
  };

  toggleBtn.addEventListener('pointerdown', keepEditorSelection);
  toggleBtn.addEventListener('mousedown', keepEditorSelection);

  panel.addEventListener('pointerdown', (event) => {
    const pickerButton = event.target.closest(
      '[data-action="select-emoticon"], [data-action="select-emoticon-pack"]',
    );

    if (!pickerButton) return;

    keepEditorSelection(event);
  });

  panel.addEventListener('mousedown', (event) => {
    const pickerButton = event.target.closest(
      '[data-action="select-emoticon"], [data-action="select-emoticon-pack"]',
    );

    if (!pickerButton) return;

    keepEditorSelection(event);
  });

  toggleBtn.addEventListener('click', () => {
    if (!ownedEmoticons.length) return;

    restoreSavedSelectionRange();
    panel.hidden = !panel.hidden;
  });

  panel.addEventListener('click', (event) => {
    const packBtn = event.target.closest(
      '[data-action="select-emoticon-pack"]',
    );

    if (packBtn) {
      const packKey = String(packBtn.dataset.packKey || '').trim();
      switchEmoticonPickerPack(panel, packKey);
      return;
    }

    const button = event.target.closest('[data-action="select-emoticon"]');
    if (!button) return;

    const code = String(button.dataset.emoticonCode || '').trim();
    const emoticon = ownedEmoticons.find((item) => item.emoticon_code === code);

    if (!emoticon) return;

    restoreSavedSelectionRange();
    editor.focus({ preventScroll: true });
    restoreSavedSelectionRange();

    const node = createInlineEmoticonNode(emoticon);
    insertInlineNodeAtCaret(node, {
      appendSpace: true,
      sync: true,
    });

    saveCurrentSelectionRange();
    panel.hidden = true;
  });

  document.addEventListener('click', (event) => {
    if (
      event.target.closest('#writeEmoticonToggle') ||
      event.target.closest('#writeEmoticonPanel')
    ) {
      return;
    }

    panel.hidden = true;
  });
}

function saveCurrentSelectionRange() {
  const editor = getBodyEditor();
  const sel = window.getSelection();

  if (!editor || !sel || !sel.rangeCount) return;

  const range = sel.getRangeAt(0);

  if (!isRangeInsideBodyEditor(range)) return;

  savedSelectionRange = range.cloneRange();
}

function restoreSavedSelectionRange() {
  if (!savedSelectionRange) return false;

  const editor = getBodyEditor();
  if (!editor) return false;

  if (!isRangeInsideBodyEditor(savedSelectionRange)) {
    savedSelectionRange = null;
    return false;
  }

  const sel = window.getSelection();
  if (!sel) return false;

  try {
    sel.removeAllRanges();
    sel.addRange(savedSelectionRange.cloneRange());
    return true;
  } catch (error) {
    console.warn('[write] restore selection failed:', error);
    savedSelectionRange = null;
    return false;
  }
}

function getSelectionContainerElement() {
  const editor = getBodyEditor();
  const sel = window.getSelection();

  if (!editor || !sel || !sel.rangeCount) return null;

  const range = sel.getRangeAt(0);
  if (!editor.contains(range.commonAncestorContainer)) return null;

  const node = sel.anchorNode || range.startContainer;
  if (!node) return null;

  return node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
}

function setToolbarButtonActive(command, active) {
  document
    .querySelectorAll(
      `.write-editor-toolbar__btn[data-editor-cmd="${command}"]`,
    )
    .forEach((btn) => btn.classList.toggle('is-active', !!active));
}

function refreshEditorToolbarState() {
  return;
}
function clearActiveEmbed() {
  activeEmbedId = '';
  document
    .querySelectorAll('.write-embed.is-active')
    .forEach((el) => el.classList.remove('is-active'));
}

function setActiveEmbed(id) {
  clearActiveEmbed();
  if (!id) return;

  activeEmbedId = id;
  const target = document.querySelector(
    `.write-embed[data-media-id="${CSS.escape(id)}"]`,
  );
  if (target) target.classList.add('is-active');
}

function getActiveEmbedElement() {
  if (!activeEmbedId) return null;
  return document.querySelector(
    `.write-embed[data-media-id="${CSS.escape(activeEmbedId)}"]`,
  );
}

function findClosestEditableBlock(node) {
  const editor = getBodyEditor();
  if (!editor || !node) return null;

  let current = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;

  while (current && current !== editor) {
    if (
      current.matches?.(
        'p, div, blockquote, li, ul, ol, h1, h2, h3, h4, h5, h6',
      ) &&
      !current.classList.contains('write-embed') &&
      !current.closest('.write-embed')
    ) {
      return current;
    }
    current = current.parentNode;
  }

  return null;
}

function applyAlignment(align) {
  const editor = getBodyEditor();
  if (!editor) return;

  const activeEmbed = getActiveEmbedElement();
  if (activeEmbed) {
    activeEmbed.setAttribute('data-align', align);
    syncBodyFromEditor();
    return;
  }

  restoreSavedSelectionRange();

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const block = findClosestEditableBlock(sel.anchorNode);

  if (block) {
    block.setAttribute('data-align', align);
    syncBodyFromEditor();
    return;
  }

  const p = document.createElement('p');
  p.setAttribute('data-align', align);
  p.innerHTML = '<br>';
  insertNodeAtCaret(p);
}

function normalizeEditorFontTags(root) {
  if (!root) return;

  root.querySelectorAll('font').forEach((fontEl) => {
    const size = String(fontEl.getAttribute('size') || '').trim();
    const color = String(fontEl.getAttribute('color') || '').trim();

    const span = document.createElement('span');

    if (size && LEGACY_FONT_SIZE_TO_PX[size]) {
      span.style.fontSize = LEGACY_FONT_SIZE_TO_PX[size];
    }

    if (color) {
      span.style.color = color;
    }

    while (fontEl.firstChild) {
      span.appendChild(fontEl.firstChild);
    }

    if (span.getAttribute('style')) {
      fontEl.replaceWith(span);
    } else {
      fontEl.replaceWith(...span.childNodes);
    }
  });
}

function applyEditorCommand(cmd, value = null) {
  const editor = getBodyEditor();
  if (!editor || !cmd) return;

  restoreSavedSelectionRange();
  editor.focus();

  const beforeState =
    cmd === 'bold' || cmd === 'italic' || cmd === 'underline'
      ? document.queryCommandState(cmd)
      : false;

  document.execCommand('styleWithCSS', false, true);
  document.execCommand(cmd, false, value);

  normalizeEditorFontTags(editor);
  saveCurrentSelectionRange();
  syncBodyFromEditor();

  if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline') {
    let afterState = false;

    try {
      afterState = document.queryCommandState(cmd);
    } catch {
      afterState = !beforeState;
    }

    setToolbarButtonActive(cmd, afterState);
  }

  refreshEditorToolbarState();
}

function applyTextColor(color) {
  const editor = getBodyEditor();
  if (!editor || !color) return;

  restoreSavedSelectionRange();
  editor.focus();

  document.execCommand('styleWithCSS', false, true);
  document.execCommand('foreColor', false, color);

  normalizeEditorFontTags(editor);
  saveCurrentSelectionRange();
  syncBodyFromEditor();
}

function applyFontSize(fontSize) {
  const editor = getBodyEditor();
  if (!editor || !fontSize) return;

  const legacySize = FONT_SIZE_TO_LEGACY[String(fontSize).trim()];
  if (!legacySize) return;

  restoreSavedSelectionRange();
  editor.focus();

  document.execCommand('styleWithCSS', false, false);
  document.execCommand('fontSize', false, legacySize);

  normalizeEditorFontTags(editor);
  saveCurrentSelectionRange();
  syncBodyFromEditor();
}

function setToolbarColorSwatch(color) {
  const swatch = $('#editorColorSwatch');
  if (!swatch) return;
  swatch.style.background = color || '#222222';
}

function buildPersistedBodyHtml(mediaItems = []) {
  const editor = getBodyEditor();
  if (!editor) return '';

  const clone = editor.cloneNode(true);
  const mediaMap = new Map(
    (Array.isArray(mediaItems) ? mediaItems : []).map((item) => [
      String(item.id),
      item,
    ]),
  );

  clone.querySelectorAll('.write-embed').forEach((node) => {
    node.classList.remove('is-active');
    node
      .querySelectorAll('.write-embed__remove')
      .forEach((btn) => btn.remove());

    const mediaId = String(node.getAttribute('data-media-id') || '');
    const item = mediaMap.get(mediaId);

    if (!item) return;

    const url = String(item.url || '').trim();
    if (!url) return;

    const type = String(item.type || '').trim();

    if (type === 'image') {
      const img = node.querySelector('img');
      if (img) img.setAttribute('src', url);
      return;
    }

    if (type === 'video') {
      const video = node.querySelector('video');
      if (video) video.setAttribute('src', url);
      return;
    }

    if (type === 'video-link') {
      const embedKind = String(item.embedKind || 'direct').trim();
      const originalUrl = String(item.originalUrl || item.url || '').trim();

      if (embedKind === 'youtube') {
        const iframe = node.querySelector('iframe');
        if (iframe) iframe.setAttribute('src', url);

        const link = node.querySelector('.write-embed__external-link');
        if (link && originalUrl) link.setAttribute('href', originalUrl);
        return;
      }

      const video = node.querySelector('video');
      if (video) video.setAttribute('src', url);

      const link = node.querySelector('.write-embed__external-link');
      if (link && (originalUrl || url)) {
        link.setAttribute('href', originalUrl || url);
      }
      return;
    }

    const link = node.querySelector('.write-embed__file-link');
    if (link) link.setAttribute('href', url);
  });

  return clone.innerHTML.trim();
}

function focusEditor() {
  const editor = getBodyEditor();
  if (!editor) return;
  editor.focus();
}

function isEditorVisuallyEmpty(root) {
  if (!root) return true;

  const clone = root.cloneNode(true);
  clone.querySelectorAll('.write-embed__remove').forEach((btn) => btn.remove());

  const hasMeaningfulNode = !!clone.querySelector(
    '.write-embed, [data-media-id], img.inline-emoticon, img[data-emoticon-code], iframe, video, a[href]',
  );

  const text = String(clone.textContent || '')
    .replace(/\u00a0/g, ' ')
    .trim();

  const html = String(clone.innerHTML || '')
    .replace(/<p[^>]*>\s*(?:<br\s*\/?>|&nbsp;|\u00a0|\s)*<\/p>/gi, '')
    .replace(/<br\s*\/?>/gi, '')
    .replace(/&nbsp;/gi, '')
    .trim();

  return !hasMeaningfulNode && !text && !html;
}

function updateEditorEmptyState(root = getBodyEditor()) {
  if (!root) return true;

  const isEmpty = isEditorVisuallyEmpty(root);
  root.classList.toggle('is-empty', isEmpty);
  return isEmpty;
}

function ensureEditorHasParagraph() {
  const editor = getBodyEditor();
  if (!editor) return;

  if (isEditorVisuallyEmpty(editor)) {
    editor.innerHTML = '';
    updateEditorEmptyState(editor);
  }
}

function syncBodyFromEditor(options = {}) {
  const { normalize = true } = options;

  const editor = getBodyEditor();
  const bodyField = getBodyField();
  if (!editor || !bodyField) return '';

  if (normalize && !isEditorComposing) {
    normalizeEditorParagraphs(editor);
  }

  const isEmpty = updateEditorEmptyState(editor);
  const html = isEmpty ? '' : editor.innerHTML.trim();

  bodyField.value = html;
  return bodyField.value;
}

function plainTextToEditorHtml(text = '') {
  const normalized = String(text || '').replace(/\r\n?/g, '\n');
  if (!normalized.trim()) return '';

  return normalized
    .split('\n')
    .map((line) => {
      const safe = escapeHtml(line);
      return safe ? `<p>${safe}</p>` : '<p><br></p>';
    })
    .join('');
}

function bodyToEditorHtml(body = '') {
  const raw = String(body || '').replace(/\r\n?/g, '\n');
  const trimmed = raw.trim();

  if (!trimmed) return '';

  const looksLikeHtml = /<([a-z][a-z0-9]*)\b[^>]*>/i.test(trimmed);
  if (looksLikeHtml) return raw;

  return plainTextToEditorHtml(raw);
}

function isMobileRichEditorInputDevice() {
  const ua = String(navigator.userAgent || '');

  const isMobileUa = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
  const isCoarsePointer =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches;

  return isMobileUa || isCoarsePointer;
}

function normalizeEditorParagraphs(root) {
  if (!root) return;

  Array.from(root.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = String(node.textContent || '').replace(/\u00a0/g, '');
      if (!value.trim()) {
        node.remove();
        return;
      }

      const p = document.createElement('p');
      p.textContent = value;
      node.replaceWith(p);
      return;
    }

    if (
      node.nodeType === Node.ELEMENT_NODE &&
      node.matches?.('div:not(.write-embed):not([data-media-id])')
    ) {
      const p = document.createElement('p');

      while (node.firstChild) {
        p.appendChild(node.firstChild);
      }

      node.replaceWith(p);
    }
  });

  root.querySelectorAll('p').forEach((p) => {
    if (!p || p.closest('.write-embed')) return;

    const html = String(p.innerHTML || '').trim();
    const text = String(p.textContent || '')
      .replace(/\u00a0/g, ' ')
      .trim();

    const hasMeaningfulChild = !!p.querySelector(
      '.write-embed, [data-media-id], img.inline-emoticon, img[data-emoticon-code], iframe, video, a[href]',
    );

    if (!html && !text && !hasMeaningfulChild) {
      p.innerHTML = '<br>';
    }
  });

  if (isEditorVisuallyEmpty(root)) {
    root.innerHTML = '';
  }

  updateEditorEmptyState(root);
}

function placeCaretAtEnd(el) {
  if (!el) return;
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);

  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(range);
}

function wrapRootTextNodeSelectionIntoParagraph(editor, range) {
  if (!editor || !range) return range;

  const startContainer = range.startContainer;

  if (
    startContainer.nodeType !== Node.TEXT_NODE ||
    startContainer.parentNode !== editor
  ) {
    return range;
  }

  const textNode = startContainer;
  const startOffset = Math.min(range.startOffset, textNode.textContent.length);
  const endOffset =
    range.endContainer === textNode
      ? Math.min(range.endOffset, textNode.textContent.length)
      : startOffset;

  const p = document.createElement('p');
  p.setAttribute('data-align', 'left');

  editor.insertBefore(p, textNode);
  p.appendChild(textNode);

  const nextRange = document.createRange();
  nextRange.setStart(textNode, startOffset);

  if (range.collapsed || range.endContainer !== textNode) {
    nextRange.collapse(true);
  } else {
    nextRange.setEnd(textNode, endOffset);
  }

  const sel = window.getSelection();
  if (sel) {
    sel.removeAllRanges();
    sel.addRange(nextRange);
  }

  return nextRange;
}

function isNodeVisuallyEmpty(node) {
  if (!node) return true;

  const text = String(node.textContent || '')
    .replace(/\u00a0/g, ' ')
    .trim();

  if (text) return false;

  return !node.querySelector?.(
    '.write-embed, [data-media-id], img.inline-emoticon, img[data-emoticon-code], iframe, video, a[href]',
  );
}

function ensureEditableBlockPlaceholder(block) {
  if (!block || !isNodeVisuallyEmpty(block)) return;
  block.innerHTML = '<br>';
}

function insertSingleParagraphAtCaret() {
  const editor = getBodyEditor();
  if (!editor) return;

  editor.focus();

  const sel = window.getSelection();
  if (!sel) return;

  if (!sel.rangeCount) {
    ensureEditorHasParagraph();
    placeCaretAtEnd(editor);
  }

  const safeSel = window.getSelection();
  if (!safeSel || !safeSel.rangeCount) return;

  let range = safeSel.getRangeAt(0);

  if (!editor.contains(range.commonAncestorContainer)) {
    ensureEditorHasParagraph();
    placeCaretAtEnd(editor);

    const fallbackSel = window.getSelection();
    if (!fallbackSel || !fallbackSel.rangeCount) return;
    range = fallbackSel.getRangeAt(0);
  }

  if (!range.collapsed) {
    range.deleteContents();
    safeSel.removeAllRanges();
    safeSel.addRange(range);
    range = safeSel.getRangeAt(0);
  }

  /*
    첫 줄 입력 직후에는 브라우저가 본문을 <p>가 아니라
    bodyEditor 바로 아래 텍스트 노드로 만들 수 있다.

    예:
    <div id="bodyEditor">안녕하세요</div>

    이 상태에서 Enter를 직접 분할하면 현재 줄을 p 블록으로 못 잡아서
    빈 줄이 하나 더 생긴 것처럼 보인다.

    따라서 Enter 처리 전에 루트 텍스트 노드를 p로 감싼 뒤
    기존 문단 분할 로직을 태운다.
  */
  range = wrapRootTextNodeSelectionIntoParagraph(editor, range);

  let block = findClosestEditableBlock(range.startContainer);

  if (!block) {
    const p = document.createElement('p');
    p.setAttribute('data-align', 'left');
    p.innerHTML = '<br>';
    editor.appendChild(p);
    block = p;

    const fallbackRange = document.createRange();
    fallbackRange.selectNodeContents(block);
    fallbackRange.collapse(true);

    safeSel.removeAllRanges();
    safeSel.addRange(fallbackRange);
    range = fallbackRange;
  }

  const align = block.getAttribute('data-align') || 'left';
  const newBlock = document.createElement(block.tagName.toLowerCase());
  newBlock.setAttribute('data-align', align);

  const splitRange = range.cloneRange();
  splitRange.setEndAfter(block.lastChild || block);

  const moved = splitRange.extractContents();

  if (moved.childNodes.length && !isNodeVisuallyEmpty(moved)) {
    newBlock.appendChild(moved);
  } else {
    newBlock.innerHTML = '<br>';
  }

  ensureEditableBlockPlaceholder(block);
  ensureEditableBlockPlaceholder(newBlock);

  block.insertAdjacentElement('afterend', newBlock);

  const caretRange = document.createRange();
  caretRange.selectNodeContents(newBlock);
  caretRange.collapse(false);

  safeSel.removeAllRanges();
  safeSel.addRange(caretRange);

  saveCurrentSelectionRange();
  syncBodyFromEditor();
  refreshEditorToolbarState();
}

function insertInlineNodeAtCaret(node, options = {}) {
  const { appendSpace = true, sync = true } = options;

  const editor = getBodyEditor();
  if (!editor || !node) return;

  restoreSavedSelectionRange();
  editor.focus({ preventScroll: true });

  if (!restoreSavedSelectionRange()) {
    ensureEditorHasParagraph();
    placeCaretAtEnd(editor);
  }

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  let range = sel.getRangeAt(0);

  if (!isRangeInsideBodyEditor(range)) {
    ensureEditorHasParagraph();
    placeCaretAtEnd(editor);

    const fallbackSel = window.getSelection();
    if (!fallbackSel || !fallbackSel.rangeCount) return;

    range = fallbackSel.getRangeAt(0);
  }

  if (!range.collapsed) {
    range.deleteContents();
  }

  /*
    본문이 완전히 비어 있거나 Range가 editor 바로 아래에 잡힌 경우,
    img가 루트에 바로 들어가면 모바일에서 커서 위치가 흔들릴 수 있다.
    그래서 p 안으로 넣어준다.
  */
  if (range.startContainer === editor) {
    const p = document.createElement('p');
    p.setAttribute('data-align', 'left');

    if (!editor.childNodes.length) {
      editor.appendChild(p);
    } else {
      const insertIndex = Math.min(range.startOffset, editor.childNodes.length);
      editor.insertBefore(p, editor.childNodes[insertIndex] || null);
    }

    range = document.createRange();
    range.selectNodeContents(p);
    range.collapse(true);
  }

  range.insertNode(node);

  let lastInsertedNode = node;

  if (appendSpace) {
    const spaceNode = document.createTextNode('\u00a0');
    node.after(spaceNode);
    lastInsertedNode = spaceNode;
  }

  const nextRange = document.createRange();
  nextRange.setStartAfter(lastInsertedNode);
  nextRange.collapse(true);

  const nextSel = window.getSelection();
  if (nextSel) {
    nextSel.removeAllRanges();
    nextSel.addRange(nextRange);
  }

  savedSelectionRange = nextRange.cloneRange();

  if (sync) {
    syncBodyFromEditor({ normalize: false });
  }

  refreshEditorToolbarState();

  if (isMobileRichEditorInputDevice()) {
    requestAnimationFrame(() => {
      const currentSel = window.getSelection();

      if (currentSel) {
        currentSel.removeAllRanges();
        currentSel.addRange(nextRange.cloneRange());
      }

      savedSelectionRange = nextRange.cloneRange();
      syncBodyFromEditor({ normalize: false });
      refreshEditorToolbarState();
    });
  }
}

function insertNodeAtCaret(node) {
  const editor = getBodyEditor();
  if (!editor || !node) return;

  editor.focus();

  if (!restoreSavedSelectionRange()) {
    placeCaretAtEnd(editor);
  }

  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return;

  const range = sel.getRangeAt(0);

  if (!editor.contains(range.commonAncestorContainer)) {
    placeCaretAtEnd(editor);
  }

  const sel2 = window.getSelection();
  if (!sel2 || !sel2.rangeCount) return;

  const safeRange = sel2.getRangeAt(0);
  safeRange.deleteContents();
  safeRange.insertNode(node);

  const br = document.createElement('br');
  node.after(br);

  const afterRange = document.createRange();
  afterRange.setStartAfter(br);
  afterRange.collapse(true);

  sel2.removeAllRanges();
  sel2.addRange(afterRange);

  saveCurrentSelectionRange();
  syncBodyFromEditor();
}

function createEmbedNodeFromHtml(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html.trim();
  return wrap.firstElementChild;
}

function createPreviewUrl(file) {
  try {
    if (!file) return '';
    return URL.createObjectURL(file);
  } catch {
    return '';
  }
}

function revokePreviewUrl(item) {
  try {
    if (item?.previewUrl?.startsWith?.('blob:')) {
      URL.revokeObjectURL(item.previewUrl);
    }
  } catch {}
}

function buildInlineEmbedHtml(item, urlOverride = '') {
  const type = String(item?.type || '').trim();
  const mediaId = escapeAttr(item?.id || '');
  const title = escapeHtml(item?.title || item?.fileName || '첨부');
  const url = escapeAttr(urlOverride || item?.url || item?.previewUrl || '');
  const label = getAttachmentLabel(type);
  const originalUrl = escapeAttr(item?.originalUrl || item?.url || '');

  if (type === 'image') {
    return `
      <figure
        class="write-embed write-embed--media"
        data-media-id="${mediaId}"
        data-media-type="image"
        data-align="left"
        contenteditable="false"
      >
        <button
          type="button"
          class="write-embed__remove write-embed__remove--floating"
          data-embed-remove="${mediaId}"
          aria-label="이미지 삭제"
        >
          삭제
        </button>
        <img
          class="write-embed__media-el"
          src="${url}"
          alt="${title}"
          loading="lazy"
        />
      </figure>
    `;
  }

  if (type === 'video') {
    return `
      <figure
        class="write-embed write-embed--media"
        data-media-id="${mediaId}"
        data-media-type="video"
        data-align="left"
        contenteditable="false"
      >
        <button
          type="button"
          class="write-embed__remove write-embed__remove--floating"
          data-embed-remove="${mediaId}"
          aria-label="동영상 삭제"
        >
          삭제
        </button>
        <video
          class="write-embed__media-el"
          src="${url}"
          controls
          playsinline
          preload="metadata"
        ></video>
      </figure>
    `;
  }

  if (type === 'video-link') {
    const embedKind = String(item?.embedKind || 'direct').trim();

    if (embedKind === 'youtube') {
      return `
        <figure
          class="write-embed write-embed--media write-embed--video-link"
          data-media-id="${mediaId}"
          data-media-type="video-link"
          data-align="left"
          contenteditable="false"
        >
          <button
            type="button"
            class="write-embed__remove write-embed__remove--floating"
            data-embed-remove="${mediaId}"
            aria-label="동영상 링크 삭제"
          >
            삭제
          </button>

          <div class="write-embed__ratio">
            <iframe
              class="write-embed__iframe"
              src="${url}"
              title="${title}"
              loading="lazy"
              referrerpolicy="strict-origin-when-cross-origin"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowfullscreen
            ></iframe>
          </div>

          <a
            class="write-embed__file-link write-embed__external-link"
            href="${originalUrl}"
            target="_blank"
            rel="noopener noreferrer"
          >
            원본 링크 열기
          </a>
        </figure>
      `;
    }

    return `
      <figure
        class="write-embed write-embed--media write-embed--video-link"
        data-media-id="${mediaId}"
        data-media-type="video-link"
        data-align="left"
        contenteditable="false"
      >
        <button
          type="button"
          class="write-embed__remove write-embed__remove--floating"
          data-embed-remove="${mediaId}"
          aria-label="동영상 링크 삭제"
        >
          삭제
        </button>

        <video
          class="write-embed__media-el"
          src="${url}"
          controls
          playsinline
          preload="metadata"
        ></video>

        <a
          class="write-embed__file-link write-embed__external-link"
          href="${originalUrl || url}"
          target="_blank"
          rel="noopener noreferrer"
        >
          원본 링크 열기
        </a>
      </figure>
    `;
  }

  return `
    <div
      class="write-embed write-embed--file"
      data-media-id="${mediaId}"
      data-media-type="file"
      data-align="left"
      contenteditable="false"
    >
      <button
        type="button"
        class="write-embed__remove write-embed__remove--floating"
        data-embed-remove="${mediaId}"
        aria-label="파일 삭제"
      >
        삭제
      </button>

      <div class="write-embed__file">
        <strong class="write-embed__file-name">${title}</strong>
        <span class="write-embed__file-desc">${label} 첨부파일</span>
        <a
          class="write-embed__file-link"
          href="${url || '#'}"
          target="_blank"
          rel="noopener noreferrer"
        >
          파일 열기
        </a>
      </div>
    </div>
  `;
}

function removeEmbedById(id) {
  if (!id) return;

  document
    .querySelectorAll(`[data-media-id="${CSS.escape(id)}"]`)
    .forEach((node) => node.remove());

  syncBodyFromEditor();
}

function insertAttachmentIntoEditor(item) {
  const node = createEmbedNodeFromHtml(buildInlineEmbedHtml(item));
  if (!node) return;

  insertNodeAtCaret(node);
}

function renderAttachmentList() {
  return;
}

function pushAttachment(file, type) {
  const item = {
    id: createLocalId(),
    type,
    title: file.name,
    fileName: file.name,
    mimeType: file.type || '',
    size: Number(file.size || 0),
    file,
    previewUrl: createPreviewUrl(file),
    removable: true,
  };

  attachmentState.push(item);
  renderAttachmentList();
  insertAttachmentIntoEditor(item);
}

function validateAttachment(file, type) {
  if (!file) return '파일을 찾지 못했어.';

  const size = Number(file.size || 0);

  if (type === 'image' && size > IMAGE_MAX_BYTES) {
    return '이미지는 10MB 이하만 가능해.';
  }

  if (type === 'video' && size > VIDEO_MAX_BYTES) {
    return '동영상은 100MB 이하만 가능해. 큰 영상은 해상도를 줄여서 다시 올리거나, 동영상 링크 삽입을 이용해줘.';
  }

  if (type === 'file' && size > FILE_MAX_BYTES) {
    return '일반 파일은 30MB 이하만 가능해. 큰 파일은 zip 압축/분할 압축 또는 외부 링크를 사용해줘.';
  }

  return '';
}

function bindAttachmentInputs(note) {
  const imageInput = $('#writeImage');
  const videoInput = $('#writeVideo');
  const fileInput = $('#writeFile');
  const videoLinkInput = $('#writeVideoLink');
  const videoLinkAddBtn = $('#writeVideoLinkAddBtn');
  const editor = getBodyEditor();
  const uploadTiles = document.querySelectorAll('.write-upload-tile');

  uploadTiles.forEach((tile) => {
    tile.addEventListener('mousedown', () => {
      saveCurrentSelectionRange();
    });
  });

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const files = Array.from(imageInput.files || []);
      ensureEditorHasParagraph();
      restoreSavedSelectionRange();

      for (const file of files) {
        const errorMsg = validateAttachment(file, 'image');
        if (errorMsg) {
          if (note) note.textContent = errorMsg;
          continue;
        }
        pushAttachment(file, 'image');
      }

      imageInput.value = '';
      saveCurrentSelectionRange();
    });
  }

  if (videoLinkAddBtn) {
    videoLinkAddBtn.addEventListener('mousedown', () => {
      saveCurrentSelectionRange();
    });

    videoLinkAddBtn.addEventListener('click', () => {
      const raw = videoLinkInput?.value?.trim() || '';

      if (!raw) {
        if (note) note.textContent = '동영상 링크를 입력해줘.';
        return;
      }

      ensureEditorHasParagraph();
      restoreSavedSelectionRange();

      const errorMsg = pushExternalVideoLink(raw);
      if (errorMsg) {
        if (note) note.textContent = errorMsg;
        return;
      }

      if (note) note.textContent = '동영상 링크를 본문에 넣었어.';
      if (videoLinkInput) videoLinkInput.value = '';
      saveCurrentSelectionRange();
    });
  }

  if (videoLinkInput) {
    videoLinkInput.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      videoLinkAddBtn?.click();
    });
  }

  if (videoInput) {
    videoInput.addEventListener('change', () => {
      const files = Array.from(videoInput.files || []);
      ensureEditorHasParagraph();
      restoreSavedSelectionRange();

      for (const file of files) {
        const errorMsg = validateAttachment(file, 'video');
        if (errorMsg) {
          if (note) note.textContent = errorMsg;
          continue;
        }
        pushAttachment(file, 'video');
      }

      videoInput.value = '';
      saveCurrentSelectionRange();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      ensureEditorHasParagraph();
      restoreSavedSelectionRange();

      for (const file of files) {
        const errorMsg = validateAttachment(file, 'file');
        if (errorMsg) {
          if (note) note.textContent = errorMsg;
          continue;
        }
        pushAttachment(file, 'file');
      }

      fileInput.value = '';
      saveCurrentSelectionRange();
    });
  }

  if (!editor) return;

  editor.addEventListener('compositionstart', () => {
    isEditorComposing = true;
  });

  editor.addEventListener('compositionend', () => {
    isEditorComposing = false;
    saveCurrentSelectionRange();
    syncBodyFromEditor({ normalize: false });
    refreshEditorToolbarState();
  });

  editor.addEventListener('click', (e) => {
    const removeBtn = e.target.closest('[data-embed-remove]');
    if (removeBtn) {
      const id = removeBtn.getAttribute('data-embed-remove');
      const found = attachmentState.find((item) => item.id === id);

      if (found?.path) {
        removedStoragePaths.add(found.path);
      }

      if (found) revokePreviewUrl(found);
      removeEmbedById(id);
      attachmentState = attachmentState.filter((item) => item.id !== id);
      renderAttachmentList();
      clearActiveEmbed();
      refreshEditorToolbarState();
      return;
    }

    const embed = e.target.closest('.write-embed');
    if (embed) {
      setActiveEmbed(embed.getAttribute('data-media-id'));
      refreshEditorToolbarState();
      return;
    }

    clearActiveEmbed();
    saveCurrentSelectionRange();
    refreshEditorToolbarState();
  });

  editor.addEventListener('mouseup', () => {
    saveCurrentSelectionRange();
    refreshEditorToolbarState();
  });

  editor.addEventListener('keyup', (event) => {
    if (isEditorComposing || event.isComposing) return;
    saveCurrentSelectionRange();
    syncBodyFromEditor({ normalize: false });
    refreshEditorToolbarState();
  });

  editor.addEventListener('focusin', () => {
    saveCurrentSelectionRange();
    refreshEditorToolbarState();
  });

  editor.addEventListener('input', (event) => {
    if (isEditorComposing || event.isComposing) return;

    saveCurrentSelectionRange();
    syncBodyFromEditor({ normalize: false });
    refreshEditorToolbarState();

    if (isMobileRichEditorInputDevice()) {
      requestAnimationFrame(() => {
        saveCurrentSelectionRange();
        syncBodyFromEditor({ normalize: false });
        refreshEditorToolbarState();
      });
    }
  });

  editor.addEventListener('blur', () => {
    syncBodyFromEditor();
    refreshEditorToolbarState();
  });

  editor.addEventListener('beforeinput', (event) => {
    if (event.isComposing || event.nativeEvent?.isComposing) return;

    const inputType = String(event.inputType || '');

    if (inputType !== 'insertParagraph' && inputType !== 'insertLineBreak') {
      return;
    }

    /*
      모바일 Safari/iOS contenteditable에서는
      beforeinput에서 preventDefault() 후 직접 selection/caret을 옮기면
      실제 DOM은 바뀌어도 파란 커서 위치가 바로 갱신되지 않는 경우가 있다.

      그래서 모바일에서는 브라우저 기본 Enter 동작을 그대로 허용한다.
      이후 input 이벤트와 아래 requestAnimationFrame에서 본문 textarea 동기화만 한다.

      PC는 기존처럼 직접 p 단위로 한 번만 분할해서
      기존 정상 동작을 유지한다.
    */
    if (isMobileRichEditorInputDevice()) {
      requestAnimationFrame(() => {
        saveCurrentSelectionRange();
        syncBodyFromEditor({ normalize: false });
        refreshEditorToolbarState();
      });

      return;
    }

    /*
      PC Enter/Return 줄바꿈은 기존 로직 유지.

      브라우저 기본 contenteditable Enter 처리를 그대로 두면
      환경에 따라 div, p, br이 섞일 수 있으므로,
      PC에서는 preventDefault() 후 직접 p 단위로 한 번만 분할한다.
    */
    event.preventDefault();
    insertSingleParagraphAtCaret();
  });
}

async function uploadSingleAttachment(user, item) {
  if (!item?.file) {
    return {
      id: item.id,
      type: item.type,
      embedKind: item.embedKind || '',
      title: item.title || item.fileName || '첨부',
      url: item.url || '',
      originalUrl: item.originalUrl || '',
      path: item.path || '',
      fileName: item.fileName || '',
      mimeType: item.mimeType || '',
      size: Number(item.size || 0),
    };
  }

  const ext = item.file.name.includes('.')
    ? item.file.name.split('.').pop()
    : 'bin';
  const safeExt = String(ext || 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;
  const path = `${user.id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, item.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: item.file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return {
    id: item.id,
    type: item.type,
    embedKind: item.embedKind || '',
    title: item.title || item.fileName || item.file.name || '첨부',
    url: publicData?.publicUrl || '',
    originalUrl: item.originalUrl || '',
    path,
    fileName: item.file.name || item.fileName || '',
    mimeType: item.file.type || item.mimeType || '',
    size: Number(item.file.size || item.size || 0),
  };
}

async function uploadAllAttachments(user, note) {
  const result = [];

  for (const item of attachmentState) {
    if (note) {
      note.textContent = `첨부 업로드 중... (${result.length + 1}/${attachmentState.length})`;
    }

    const uploaded = await uploadSingleAttachment(user, item);
    result.push(uploaded);
  }

  return result;
}

function applyUploadedMediaToEditor(mediaItems = []) {
  mediaItems.forEach((item) => {
    const node = document.querySelector(
      `[data-media-id="${CSS.escape(item.id)}"]`,
    );
    if (!node) return;

    const type = String(item.type || '').trim();
    const url = String(item.url || '').trim();
    const title = String(item.title || item.fileName || '첨부').trim();

    if (type === 'image') {
      const img = node.querySelector('img');
      if (img && url) {
        img.src = url;
        img.alt = title;
      }
      return;
    }

    if (type === 'video') {
      const video = node.querySelector('video');
      if (video && url) {
        video.src = url;
      }
      return;
    }

    const link = node.querySelector('.write-embed__file-link');
    const nameEl = node.querySelector('.write-embed__file-name');
    const descEl = node.querySelector('.write-embed__file-desc');

    if (nameEl) nameEl.textContent = title;
    if (descEl) descEl.textContent = item.fileName || title;
    if (link) {
      link.href = url || '#';
      link.textContent = '파일 열기';
    }
  });

  syncBodyFromEditor();
}

async function deleteRemovedStorageObjects() {
  const paths = [...removedStoragePaths].filter(Boolean);
  if (!paths.length) return;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  if (error) {
    console.error('[write] storage remove failed:', error);
  }

  removedStoragePaths = new Set();
}

function normalizeSecretPassword(value) {
  return String(value || '').trim();
}

async function sha256Hex(value) {
  const src = new TextEncoder().encode(String(value || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', src);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function syncPrivatePasswordUi(isEdit = false) {
  const isPrivateEl = $('#isPrivate');
  const row = $('#privatePasswordRow');
  const input = $('#privatePassword');

  if (!isPrivateEl || !row || !input) return;

  const visible = !!isPrivateEl.checked;
  row.hidden = !visible;

  if (!visible) {
    input.value = '';
    return;
  }

  input.placeholder = isEdit
    ? '새 비밀번호 입력 (비워두면 기존 비밀번호 유지)'
    : '비밀글 비밀번호 입력 (4~30자)';
}

async function loadEditablePost(postId, userId) {
  const data = await loadEditablePostById(postId);
  if (!data) return null;

  if (!data.author_id || String(data.author_id) !== String(userId)) {
    return 'FORBIDDEN';
  }

  return data;
}

function getEditorMediaIds() {
  return new Set(
    [...document.querySelectorAll('[data-media-id]')]
      .map((el) => el.getAttribute('data-media-id'))
      .filter(Boolean),
  );
}

function appendMissingExistingAttachmentsToEditor(items = []) {
  const editor = getBodyEditor();
  if (!editor) return;

  const currentIds = getEditorMediaIds();

  items.forEach((item) => {
    if (!item?.id || currentIds.has(item.id)) return;

    const node = createEmbedNodeFromHtml(buildInlineEmbedHtml(item, item.url));
    if (!node) return;

    editor.insertAdjacentHTML('beforeend', '<p><br></p>');
    editor.appendChild(node);
    editor.insertAdjacentHTML('beforeend', '<p><br></p>');
  });

  syncBodyFromEditor();
}

function fillWriteForm(post, isAdmin) {
  const titleEl = $('#title');
  const excerptEl = $('#excerpt');
  const bodyEl = $('#body');
  const editorEl = getBodyEditor();
  const categoryEl = $('#category');
  const tagsEl = $('#tags');
  const pinnedEl = $('#pinned');
  const isPrivateEl = $('#isPrivate');
  const privatePasswordEl = $('#privatePassword');

  if (titleEl) titleEl.value = post.title || '';
  if (excerptEl) excerptEl.value = post.excerpt || '';
  if (bodyEl) bodyEl.value = post.body || '';

  if (editorEl) {
    editorEl.innerHTML = bodyToEditorHtml(post.body || '');
    normalizeEditorFontTags(editorEl);
    updateEditorEmptyState(editorEl);
  }

  if (categoryEl) categoryEl.value = normalizeCategory(post.category);
  if (tagsEl) {
    tagsEl.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
  }

  if (pinnedEl) pinnedEl.checked = isAdmin ? !!post.pinned : false;
  if (isPrivateEl) isPrivateEl.checked = !!post.is_private;
  if (privatePasswordEl) privatePasswordEl.value = '';

  attachmentState = Array.isArray(post.media_items)
    ? post.media_items
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({
          id: item.id || createLocalId(),
          type: String(item.type || '').trim(),
          embedKind: String(item.embedKind || '').trim(),
          title: item.title || item.fileName || '첨부',
          url: item.url || '',
          originalUrl: item.originalUrl || '',
          previewUrl: item.url || item.originalUrl || '',
          path: item.path || '',
          fileName: item.fileName || '',
          mimeType: item.mimeType || '',
          size: Number(item.size || 0),
          removable: true,
        }))
        .filter(
          (item) => item.type && (item.url || item.path || item.originalUrl),
        )
    : [];

  removedStoragePaths = new Set();
  renderAttachmentList();
  appendMissingExistingAttachmentsToEditor(attachmentState);
  syncBodyFromEditor({ normalize: false });
  syncPrivatePasswordUi(true);
}

export async function initWrite() {
  const form = $('#writeForm');
  if (!form) return;

  const note = $('#writeNote');
  const submitBtn = $('#writeSubmitBtn');
  const editPostId = getEditPostId();
  const editor = getBodyEditor();

  setWriteModeUi(!!editPostId);
  if (editor) {
    editor.innerHTML = '';
    normalizeEditorParagraphs(editor);
    updateEditorEmptyState(editor);
  }
  syncBodyFromEditor();

  renderAttachmentList();
  bindAttachmentInputs(note);

  const isPrivateEl = $('#isPrivate');
  if (isPrivateEl) {
    isPrivateEl.addEventListener('change', () => {
      syncPrivatePasswordUi(!!editPostId);
    });
  }
  syncPrivatePasswordUi(!!editPostId);

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = './login.html';
    return;
  }

  const { isAdmin } = await getMyRole();
  await initWriteEmoticonPicker(user);
  setPinnedUiVisible(isAdmin);

  if (editPostId) {
    try {
      const editablePost = await loadEditablePost(editPostId, user.id);

      if (editablePost === 'FORBIDDEN') {
        alert('본인 글만 수정할 수 있어.');
        window.location.href = `./post.html?id=${editPostId}`;
        return;
      }

      if (!editablePost) {
        alert('수정할 게시물을 찾지 못했어.');
        navigateWithPjax(`./post.html?id=${editPostId}`);
        return;
      }

      fillWriteForm(editablePost, isAdmin);
    } catch (error) {
      console.error('[write] load editable post failed:', error);
      alert('수정 데이터를 불러오지 못했어.');
      navigateWithPjax(`./post.html?id=${editPostId}`);
      return;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = $('#title')?.value?.trim() || '';
    const excerpt = $('#excerpt')?.value?.trim() || '';
    const body = syncBodyFromEditor().trim();
    const category = normalizeCategory($('#category')?.value || 'study');
    const tags = parseTags($('#tags')?.value || '');
    const pinned = isAdmin ? !!$('#pinned')?.checked : false;
    const isPrivate = !!$('#isPrivate')?.checked;
    const privatePassword = normalizeSecretPassword(
      $('#privatePassword')?.value || '',
    );

    if (!title || !excerpt || !body) {
      if (note) note.textContent = '제목, 요약, 본문은 필수야.';
      return;
    }

    if (isPrivate) {
      if (!editPostId && privatePassword.length < 4) {
        if (note) note.textContent = '비밀글은 비밀번호를 4자 이상 입력해줘.';
        return;
      }

      if (privatePassword && privatePassword.length < 4) {
        if (note) note.textContent = '비밀글 비밀번호는 4자 이상이어야 해.';
        return;
      }
    }

    if (note) {
      note.textContent = editPostId ? '수정 준비 중...' : '등록 준비 중...';
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      const mediaItems = await uploadAllAttachments(user, note);
      const finalBody = buildPersistedBodyHtml(mediaItems);

      if (!finalBody) {
        if (note) note.textContent = '본문 내용을 다시 확인해줘.';
        return;
      }

      if (editPostId) {
        const payload = {
          title,
          excerpt,
          body: finalBody,
          category,
          tags,
          pinned,
          media_items: mediaItems,
          is_private: isPrivate,
        };

        if (isPrivate) {
          if (privatePassword) {
            payload.secret_password_hash = await sha256Hex(privatePassword);
          }
        } else {
          payload.secret_password_hash = null;
        }

        const { error } = await supabase
          .from('posts')
          .update(payload)
          .eq('id', editPostId)
          .eq('author_id', user.id);

        if (error) throw error;

        await deleteRemovedStorageObjects();

        if (note) note.textContent = '수정 완료! 상세 페이지로 이동할게.';

        setTimeout(() => {
          navigateWithPjax(`./post.html?id=${editPostId}`);
        }, 400);

        return;
      }

      const payload = {
        title,
        excerpt,
        body: finalBody,
        category,
        tags,
        pinned,
        media_items: mediaItems,
        author_id: user.id,
        author_nickname: getNicknameFromUser(user),
        is_private: isPrivate,
        secret_password_hash: isPrivate
          ? await sha256Hex(privatePassword)
          : null,
      };

      const { data, error } = await supabase
        .from('posts')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      const rewardGranted = await hasPostCreatePickleReward(user.id, data.id);

      if (note) {
        note.textContent = rewardGranted
          ? '등록 완료! 피클 지급됐어. 상세 페이지로 이동할게.'
          : '등록 완료! 상세 페이지로 이동할게.';
      }

      if (rewardGranted) {
        playPickleBurst({
          originEl: submitBtn,
          count: 10,
        });
      }

      form.reset();
      resetAttachmentInputs();

      attachmentState.forEach((item) => revokePreviewUrl(item));
      attachmentState = [];
      removedStoragePaths = new Set();

      if (editor) {
        editor.innerHTML = '';
        normalizeEditorParagraphs(editor);
        updateEditorEmptyState(editor);
      }

      renderAttachmentList();
      setPinnedUiVisible(isAdmin);
      syncPrivatePasswordUi(false);
      syncBodyFromEditor();

      setTimeout(() => {
        navigateWithPjax(`./post.html?id=${data.id}`);
      }, 700);
    } catch (error) {
      console.error('[write] save failed:', error);
      if (note) note.textContent = `저장 실패: ${error.message}`;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
