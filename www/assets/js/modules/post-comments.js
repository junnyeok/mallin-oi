import { initEmoticonSettingsNavigation } from './emoticon-inventory-return.js';
import { supabase } from './supabase-client.js';
import { getBlockedMemberIds, mountCommunityActions } from './community-safety.js';
import {
  getCurrentUser,
  getDisplayName,
  loginHref,
  publicProfileHref,
  saveRedirect,
} from './auth-store.js';
import { playPickleBurst } from './pickle-burst.js';
import { bindInlineEmoticonDeletion, placeCaretAfterEmoticon, stripEmoticonCaretMarkers } from './editor-emoticon.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const [
  { getCharacterEffectRenderMeta },
  { prepareCharacterEffects, renderCharacterEffectHtml },
  { listenEquipmentChanged },
  {
    loadOwnedEmoticons,
    renderOwnedEmoticonPicker,
    insertEmoticonToken,
    renderTextWithEmoticons,
    switchEmoticonPickerPack,
    createInlineEmoticonNode,
  },
] = await Promise.all([
  import(`./store-data.js?v=${MODULE_VERSION}`),
  import(`./character-effects.js?v=${MODULE_VERSION}`),
  import(`./equipment-events.js?v=${MODULE_VERSION}`),
  import(`./emoticons.js?v=${MODULE_VERSION}`),
]);

const DEFAULT_PROFILE_IMAGE = './images/logo-home.png';
const DEFAULT_CHARACTER_IMAGE = './images/characters/cucumber.png';
const commentProfileImageCache = new Map();
const commentCharacterImageCache = new Map();
const commentCharacterEffectCache = new Map();
let ownedCommentEmoticons = [];
let commentEmoticonDocumentBound = false;
let commentEmoticonUserLoggedIn = false;
async function hasCommentPickleReward(userId, commentId) {
  if (!userId || !commentId) return false;

  const { data, error } = await supabase
    .from('pickle_ledger')
    .select('id, amount')
    .eq('user_id', userId)
    .eq('reason_code', 'comment_post')
    .eq('source_comment_id', commentId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[post-comments] reward check failed:', error);
    return false;
  }

  return !!data && Number(data.amount || 0) > 0;
}

function getProfileImageSrc(url) {
  return String(url || '').trim() || DEFAULT_PROFILE_IMAGE;
}

function getCharacterImageSrc(url) {
  return String(url || '').trim() || DEFAULT_CHARACTER_IMAGE;
}

async function loadProfileAssetMap(authorIds = []) {
  const safeIds = [
    ...new Set(
      (authorIds || []).map((id) => String(id || '').trim()).filter(Boolean),
    ),
  ];

  const missingIds = safeIds.filter(
    (id) =>
      !commentProfileImageCache.has(id) || !commentCharacterImageCache.has(id),
  );

  if (missingIds.length) {
    const { data, error } = await supabase
      .from('public_profiles')
      .select(
        'id, profile_image_url, equipped_character_image_url, equipped_character_effect_item_id',
      )
      .in('id', missingIds);

    if (error) {
      console.error('[post-comments] load profile assets failed:', error);
      missingIds.forEach((id) => {
        commentProfileImageCache.set(id, DEFAULT_PROFILE_IMAGE);
        commentCharacterImageCache.set(id, DEFAULT_CHARACTER_IMAGE);
      });
    } else {
      const rows = data || [];
      const foundIds = new Set();

      rows.forEach((row) => {
        const id = String(row?.id || '').trim();
        if (!id) return;

        foundIds.add(id);
        commentProfileImageCache.set(
          id,
          getProfileImageSrc(row?.profile_image_url),
        );
        commentCharacterImageCache.set(
          id,
          getCharacterImageSrc(row?.equipped_character_image_url),
        );
        commentCharacterEffectCache.set(
          id,
          String(row?.equipped_character_effect_item_id || '').trim(),
        );
      });

      missingIds.forEach((id) => {
        if (!foundIds.has(id)) {
          commentProfileImageCache.set(id, DEFAULT_PROFILE_IMAGE);
          commentCharacterImageCache.set(id, DEFAULT_CHARACTER_IMAGE);
          commentCharacterEffectCache.set(id, '');
        }
      });
    }
  }

  const map = new Map();
  safeIds.forEach((id) => {
    map.set(id, {
      profileImageUrl:
        commentProfileImageCache.get(id) || DEFAULT_PROFILE_IMAGE,
      characterImageUrl:
        commentCharacterImageCache.get(id) || DEFAULT_CHARACTER_IMAGE,
      characterEffectItemId: commentCharacterEffectCache.get(id) || '',
    });
  });

  return map;
}

function clearCommentProfileAssetCache(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return;

  commentProfileImageCache.delete(safeUserId);
  commentCharacterImageCache.delete(safeUserId);
  commentCharacterEffectCache.delete(safeUserId);
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

function formatDateTime(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';

  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');

  return `${yy}.${mm}.${dd} ${hh}:${mi}`;
}

function renderAuthorProfileLink(
  authorId,
  authorNickname,
  className = '',
) {
  const nickname = escapeHtml(authorNickname || '익명');
  const safeAuthorId = String(authorId || '').trim();

  const characterHtml = `
  <span class="character-effect-wrap comment-author-character-effect-wrap">
    <img
      class="comment-author-character character-effect-character"
      src="${DEFAULT_CHARACTER_IMAGE}"
      alt="${nickname} 캐릭터"
    />
  </span>
`;

  if (!safeAuthorId) {
    return `
      <span class="comment-author-wrap">
        <img
          class="comment-author-avatar"
          src="${DEFAULT_PROFILE_IMAGE}"
          alt="${nickname} 프로필 사진"
        />
        <strong class="${className}">${nickname}</strong>
        ${characterHtml}
      </span>
    `;
  }

  return `
    <span class="comment-author-wrap">
      <a
        class="comment-author-avatar-link"
        href="${publicProfileHref(safeAuthorId)}"
        aria-label="${nickname} 프로필로 이동"
      >
        <img
          class="comment-author-avatar"
          src="${DEFAULT_PROFILE_IMAGE}"
          alt="${nickname} 프로필 사진"
        />
      </a>
      <a
        class="${className} comment-author-link"
        href="${publicProfileHref(safeAuthorId)}"
      >${nickname}</a>
      ${characterHtml}
    </span>
  `;
}

function isEdited(createdAt, updatedAt) {
  if (!createdAt || !updatedAt) return false;

  const created = new Date(createdAt).getTime();
  const updated = new Date(updatedAt).getTime();

  if (Number.isNaN(created) || Number.isNaN(updated)) return false;

  return updated - created >= 1000;
}

function renderDateMeta(createdAt, updatedAt) {
  const createdText = formatDateTime(createdAt);
  const updatedText = formatDateTime(updatedAt);
  const edited = isEdited(createdAt, updatedAt);

  if (edited) {
    return `
      <span class="comment-item__date">${escapeHtml(createdText)}</span>
      <span class="comment-edited-badge">수정됨</span>
      <span class="comment-item__date comment-item__date--edited">(${escapeHtml(updatedText)})</span>
    `;
  }

  return `<span class="comment-item__date">${escapeHtml(createdText)}</span>`;
}

function setFormMessage(text, type = '') {
  const el = $('commentFormMsg');
  if (!el) return;
  el.textContent = text;
  el.className = type ? `comment-form__msg ${type}` : 'comment-form__msg';
}

function getPostIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  const postId = Number(sp.get('id') || 0);
  return Number.isFinite(postId) && postId > 0 ? postId : null;
}

function nl2brSafe(text) {
  return renderTextWithEmoticons(text || '');
}

function getCommentFieldEl(textarea) {
  if (!textarea) return null;

  return (
    textarea.closest('.comment-form__field') ||
    textarea.closest('.comment-reply-form__field') ||
    textarea.closest('.comment-edit-form')
  );
}

function editorHtmlFromText(text = '') {
  return renderTextWithEmoticons(text, {
    imageClass: 'inline-emoticon inline-emoticon--editor',
  });
}

function removeCommentLivePreview(textarea) {
  const field = getCommentFieldEl(textarea);
  if (!field) return;

  const preview = field.querySelector('[data-role="comment-live-preview"]');
  if (preview) preview.remove();
}

function editorNodeToTokenText(node) {
  if (!node) return '';

  if (node.nodeType === Node.TEXT_NODE) {
    return node.nodeValue || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const el = node;

  if (el.matches?.('img[data-emoticon-code]')) {
    const code = String(el.dataset.emoticonCode || '').trim();
    return code ? `[emo:${code}]` : '';
  }

  if (el.tagName === 'BR') {
    return '\n';
  }

  let text = '';
  Array.from(el.childNodes).forEach((child) => {
    text += editorNodeToTokenText(child);
  });

  if (['DIV', 'P'].includes(el.tagName) && !text.endsWith('\n')) {
    text += '\n';
  }

  return text;
}

function editorToTokenText(editor) {
  if (!editor) return '';

  let text = '';
  Array.from(editor.childNodes).forEach((node) => {
    text += editorNodeToTokenText(node);
  });

  return stripEmoticonCaretMarkers(text)
    .replaceAll('\u00A0', ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trimEnd();
}

function syncEditorToTextarea(textarea, editor) {
  if (!textarea || !editor) return;
  textarea.value = editorToTokenText(editor);
}

function syncTextareaToEditor(textarea, editor) {
  if (!textarea || !editor) return;

  const html = editorHtmlFromText(textarea.value || '');
  editor.innerHTML = html || '';
}

function placeCaretAtEnd(editor) {
  if (!editor) return;

  editor.focus();

  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);

  selection.removeAllRanges();
  selection.addRange(range);
}

function ensureCommentRichEditor(textarea) {
  if (!textarea) return null;

  const field = getCommentFieldEl(textarea);
  if (!field) return null;

  removeCommentLivePreview(textarea);

  let editor = field.querySelector(
    `[data-role="comment-rich-editor"][data-source-key="${textarea.id || textarea.name || 'comment'}"]`,
  );

  if (!editor) {
    editor = document.createElement('div');
    editor.className = 'comment-rich-editor';
    editor.dataset.role = 'comment-rich-editor';
    editor.dataset.sourceKey = textarea.id || textarea.name || 'comment';
    editor.contentEditable = String(!textarea.disabled);
    editor.spellcheck = true;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.dataset.placeholder = textarea.placeholder || '';

    textarea.classList.add('comment-editor-source');
    textarea.setAttribute('aria-hidden', 'true');
    textarea.tabIndex = -1;

    textarea.insertAdjacentElement('afterend', editor);
  }

  if (editor.dataset.bound === '1') {
    return editor;
  }

  syncTextareaToEditor(textarea, editor);
  syncEditorToTextarea(textarea, editor);

  bindInlineEmoticonDeletion(editor);

  editor.addEventListener('input', () => {
    syncEditorToTextarea(textarea, editor);
  });

  editor.addEventListener('paste', (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  });

  editor.dataset.bound = '1';
  return editor;
}

function clearCommentEditor(textarea) {
  if (!textarea) return;

  textarea.value = '';

  const editor = ensureCommentRichEditor(textarea);
  if (editor) {
    editor.innerHTML = '';
  }
}

function focusEditorForTextarea(textarea) {
  const editor = ensureCommentRichEditor(textarea);
  if (!editor) {
    textarea?.focus();
    return;
  }

  placeCaretAtEnd(editor);
}

function bindCommentRichEditor(textarea) {
  if (!textarea || textarea.dataset.richEditorBound === '1') return;
  ensureCommentRichEditor(textarea);
  textarea.dataset.richEditorBound = '1';
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = String(value ?? '')
    .trim()
    .toLowerCase();

  return text === 'true' || text === 't' || text === '1';
}

function syncTopCommentMeta(count, isLocked = false) {
  const topMetaEl = $('postCommentMeta');
  if (!topMetaEl) return;
  topMetaEl.textContent = isLocked ? '💬 비공개' : `💬 ${Number(count || 0)}`;
}

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[post-comments] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

function groupRepliesByParent(comments = []) {
  const map = new Map();

  comments.forEach((comment) => {
    const parentId = Number(comment?.parent_comment_id || 0);
    if (!Number.isFinite(parentId) || parentId <= 0) return;

    if (!map.has(parentId)) {
      map.set(parentId, []);
    }

    map.get(parentId).push(comment);
  });

  return map;
}

function getThreadToggleLabel(count, isOpen = false) {
  const safeCount = Number(count || 0);

  if (isOpen) return '답글 접기';
  return `답글 ${safeCount}개 보기`;
}

function renderDeleteButton(commentId, isMine) {
  return `<button type="button" class="comment-action-btn is-danger"
    data-action="delete" data-comment-id="${commentId}" data-is-mine="${!!isMine}">삭제</button>`;
}

function renderReplyItem(reply, currentUserId = '') {
  const isMine =
    currentUserId &&
    reply.author_id &&
    String(currentUserId) === String(reply.author_id);

  return `
<article
  class="comment-reply-item"
  id="comment-${reply.id}"
  data-comment-id="${reply.id}"
>      <div class="comment-reply-item__head">
        <div class="comment-reply-item__meta">
          ${renderAuthorProfileLink(reply.author_id, reply.author_nickname, 'comment-reply-item__author')}
          <div class="comment-meta-inline">
            ${renderDateMeta(reply.created_at, reply.updated_at)}
          </div>
        </div>

        <div class="comment-item__tools">
          <div class="community-safety__actions comment-item__safety" data-comment-safety></div>
          ${
            isMine
              ? `
            <div class="comment-item__actions">
              ${renderDeleteButton(reply.id, true)}
            </div>
          `
              : ''
          }
        </div>
      </div>

      <div class="comment-item__view" data-role="comment-view">
        <div class="comment-item__body">${nl2brSafe(reply.body || '')}</div>
      </div>
    </article>
  `;
}

function renderCommentItem(comment, replies = [], currentUserId = '') {
  const isMine =
    currentUserId &&
    comment.author_id &&
    String(currentUserId) === String(comment.author_id);

  const canEdit = !!isMine;
  const replyCount = replies.length;

  return `
<article
  class="comment-item"
  id="comment-${comment.id}"
  data-comment-id="${comment.id}"
>      <div class="comment-item__head">
        <div class="comment-item__meta">
          ${renderAuthorProfileLink(comment.author_id, comment.author_nickname, 'comment-item__author')}
          <div class="comment-meta-inline">
            ${renderDateMeta(comment.created_at, comment.updated_at)}
          </div>
        </div>

        <div class="comment-item__tools">
          <div class="community-safety__actions comment-item__safety" data-comment-safety></div>
            <div class="comment-item__actions">
                <button
                  type="button"
                  class="comment-action-btn"
                  data-action="reply"
                  data-comment-id="${comment.id}"
                >
                  답글
                </button>

              ${
                canEdit
                  ? `
                <button
                  type="button"
                  class="comment-action-btn"
                  data-action="edit"
                  data-comment-id="${comment.id}"
                >
                  수정
                </button>
              `
                  : ''
              }

              ${isMine ? renderDeleteButton(comment.id, true) : ''}
            </div>
        </div>
      </div>

      <div class="comment-item__view" data-role="comment-view">
        <div class="comment-item__body">${nl2brSafe(comment.body || '')}</div>
      </div>

            ${
              canEdit
                ? `
        <form class="comment-edit-form" data-role="comment-edit-form" hidden>
          <textarea
            class="comment-edit-form__textarea"
            maxlength="500"
            rows="4"
            data-role="comment-edit-textarea"
          >${escapeHtml(comment.body || '')}</textarea>

          <div class="comment-edit-form__tools emoticon-picker-box">
            <div class="emoticon-tool-actions">
              <button
                type="button"
                class="comment-emoticon-toggle"
                data-action="toggle-emoticon"
                      aria-label="이모티콘 열기" aria-expanded="false"
              >
                <img src="./images/good.webp" alt="" />
              </button>
            </div>

            <div
              class="emoticon-picker"
              data-role="emoticon-panel"
              hidden
            >
            </div>
          </div>

          <div class="comment-edit-form__bottom">
            <p class="comment-edit-form__msg" data-role="comment-edit-msg"></p>

            <div class="comment-edit-form__actions">
              <button
                type="button"
                class="comment-action-btn"
                data-action="cancel-edit"
                data-comment-id="${comment.id}"
              >
                취소
              </button>
              <button
                type="submit"
                class="comment-action-btn is-primary"
                data-comment-id="${comment.id}"
              >
                저장
              </button>
            </div>
          </div>
        </form>
      `
                : ''
            }

      <form
        class="comment-reply-form"
        data-role="reply-form"
        data-parent-id="${comment.id}"
        hidden
      >
        <label class="comment-reply-form__field">
          <span class="comment-reply-form__label">답글</span>
          <textarea
            class="comment-reply-form__textarea"
            data-role="reply-textarea"
            rows="3"
            maxlength="500"
            placeholder="답글을 입력해줘. (최대 500자)"
          ></textarea>
        </label>

                <div class="comment-reply-form__tools emoticon-picker-box">
          <div class="emoticon-tool-actions">
            <button
              type="button"
              class="comment-emoticon-toggle"
              data-action="toggle-emoticon"
                      aria-label="이모티콘 열기" aria-expanded="false"
            >
              <img src="./images/good.webp" alt="" />
            </button>
          </div>

          <div
            class="emoticon-picker"
            data-role="emoticon-panel"
            hidden
          >
          </div>
        </div>

        <div class="comment-reply-form__bottom">
          <p class="comment-reply-form__msg" data-role="reply-msg"></p>
          <div class="comment-reply-form__actions">
            <button
              type="button"
              class="comment-action-btn"
              data-action="cancel-reply"
              data-comment-id="${comment.id}"
            >
              취소
            </button>
            <button
              type="submit"
              class="comment-action-btn is-primary"
              data-role="reply-submit"
            >
              등록
            </button>
          </div>
        </div>
      </form>

      ${
        replyCount > 0
          ? `
        <div class="comment-replies-wrap">
          <button
            type="button"
            class="comment-thread-toggle"
            data-action="toggle-thread"
            data-comment-id="${comment.id}"
            data-open="false"
            aria-expanded="false"
          >
            ${getThreadToggleLabel(replyCount, false)}
          </button>

          <div
            class="comment-replies"
            data-role="reply-thread-wrap"
            data-comment-id="${comment.id}"
            hidden
          >
            ${replies
              .map((reply) => renderReplyItem(reply, currentUserId))
              .join('')}
          </div>
        </div>
      `
          : ''
      }
    </article>
  `;
}

let currentSecretPassword = '';
let isPrivatePostLocked = false;
let commentRenderId = 0;

function setCommentInputDisabled(textarea, disabled) {
  if (!textarea) return;
  textarea.disabled = disabled;
  const editor = textarea.nextElementSibling;
  if (editor?.dataset.role === 'comment-rich-editor') {
    editor.contentEditable = String(!disabled);
  }
}

function setCommentFormDisabled(disabled, hintText = '') {
  const hint = $('commentLoginHint');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');
  const userBox = $('commentUserBox');

  if (userBox && disabled) {
    userBox.textContent = '작성자: 잠금 상태';
  }

  if (hint && hintText) {
    hint.textContent = hintText;
  }

  setCommentInputDisabled(textarea, !!disabled);

  if (submitBtn) {
    submitBtn.disabled = !!disabled;
  }
}

function renderLockedCommentState(unavailable = false) {
  commentRenderId += 1;
  const listEl = $('commentList');
  const countEl = $('commentCount');

  if (countEl) countEl.textContent = '0';
  syncTopCommentMeta(0, !unavailable);

  if (listEl) {
    listEl.innerHTML = unavailable
      ? '<div class="comment-empty">댓글을 불러오지 못했어.</div>'
      : '<div class="comment-empty">비밀번호를 입력해야 댓글과 답글을 볼 수 있어.</div>';
  }

  setFormMessage('');
  setCommentFormDisabled(
    true,
    unavailable ? '게시글을 불러온 뒤 댓글을 작성할 수 있어.' : '비밀글 비밀번호를 먼저 입력해야 댓글을 볼 수 있어.',
  );
  refreshCommentEmoticonUi();
}

async function loadComments(postId, secretPassword = null) {
  const [{ data, error }, blocked] = await Promise.all([
    supabase.rpc('get_post_comments', {
      p_post_id: postId,
      p_secret_password: secretPassword || null,
    }),
    getBlockedMemberIds(),
  ]);

  if (error) throw error;
  return (data || []).filter((comment) => !blocked.has(comment.author_id));
}

async function renderComments(postId, secretPassword = null) {
  const listEl = $('commentList');
  const countEl = $('commentCount');

  if (!listEl || !countEl) return;

  const renderId = ++commentRenderId;
  const isCurrent = () => listEl.isConnected && renderId === commentRenderId;
  listEl.innerHTML = `<div class="comment-empty">댓글을 불러오는 중이야.</div>`;

  try {
    const [comments, user] = await Promise.all([
      loadComments(postId, secretPassword), getCurrentUser(),
    ]);
    if (!isCurrent()) return;

    const currentUserId = user?.id || '';
    const nextCount = comments.length;

    countEl.textContent = String(nextCount);
    syncTopCommentMeta(nextCount, false);

    if (!comments.length) {
      listEl.innerHTML = `<div class="comment-empty">아직 댓글이 없어. 첫 댓글을 남겨봐.</div>`;
      refreshCommentEmoticonUi();
      return;
    }

    const repliesMap = groupRepliesByParent(comments);

    const visibleById = new Map(comments.map((comment) => [Number(comment.id), comment]));
    const rootComments = comments.filter((comment) =>
      !visibleById.has(Number(comment.parent_comment_id || 0)),
    );

    listEl.innerHTML = rootComments
      .map((comment) =>
        renderCommentItem(
          comment,
          repliesMap.get(Number(comment.id)) || [],
          currentUserId,
        ),
      )
      .join('');

    const displayedComments = [];
    for (const container of listEl.querySelectorAll('[data-comment-safety]')) {
      const item = container.closest('[data-comment-id]');
      const comment = visibleById.get(Number(item?.dataset.commentId));
      if (!comment) continue;
      displayedComments.push({ container, item, comment });
      void mountCommunityActions(container, {
        authorId: comment.author_id,
        kind: 'comment',
        compact: true,
        id: comment.id,
        secretPassword,
        onBlock: () => renderComments(postId, secretPassword),
      });
    }
    focusTargetCommentFromUrl();
    refreshCommentEmoticonUi();

    void loadProfileAssetMap(comments.map((comment) => comment.author_id)).then((profiles) => {
      if (!isCurrent()) return;
      for (const { item, comment } of displayedComments) {
        const author = item.querySelector('.comment-author-wrap');
        const profile = profiles.get(String(comment.author_id || '').trim());
        if (!author || !profile) continue;
        const { profileImageUrl, characterImageUrl, characterEffectItemId } = profile;
        const avatar = author.querySelector('.comment-author-avatar');
        const character = author.querySelector('.comment-author-character');
        if (profileImageUrl !== DEFAULT_PROFILE_IMAGE) avatar.src = profileImageUrl;
        if (characterImageUrl !== DEFAULT_CHARACTER_IMAGE) character.src = characterImageUrl;
        if (characterEffectItemId) {
          character.insertAdjacentHTML('afterend', renderCharacterEffectHtml(
            getCharacterEffectRenderMeta(characterEffectItemId, 'comment'),
          ));
        }
      }
      prepareCharacterEffects(listEl);
    }).catch((error) => console.error('[post-comments] decorate authors failed:', error));

    if (currentUserId) {
      void getMyRole().then((role) => {
        if (!isCurrent() || !role.isAdmin) return;
        for (const { container, comment } of displayedComments) {
          if (String(comment.author_id) === String(currentUserId)) continue;
          let actions = container.nextElementSibling;
          if (!actions) {
            actions = document.createElement('div');
            actions.className = 'comment-item__actions';
            container.after(actions);
          }
          actions.insertAdjacentHTML('beforeend', renderDeleteButton(comment.id, false));
        }
      }).catch((error) => console.error('[post-comments] get role failed:', error));
    }
  } catch (error) {
    if (!isCurrent()) return;
    console.error('[post-comments] render failed:', error);
    countEl.textContent = '0';
    syncTopCommentMeta(0, false);
    listEl.innerHTML = `<div class="comment-empty">댓글을 불러오지 못했어.</div>`;
  }
}

async function syncCommentFormUser() {
  const userBox = $('commentUserBox');
  const hint = $('commentLoginHint');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');

  if (!userBox || !hint || !textarea || !submitBtn) return;

  const user = await getCurrentUser();
  if (isPrivatePostLocked || !textarea.isConnected) return;

  setCommentInputDisabled(textarea, !user);
  submitBtn.disabled = false;

  if (user) {
    userBox.textContent = `작성자: ${getDisplayName(user)}`;
    hint.textContent = '로그인 상태야. 댓글과 답글을 남길 수 있어.';
    return;
  }

  userBox.textContent = '작성자: 게스트';
  hint.textContent = '댓글 작성은 로그인 후 가능해.';
}

function findCommentItemById(commentId) {
  return document.querySelector(`[data-comment-id="${commentId}"]`);
}

function setEditMode(commentId, isEditing) {
  const item = findCommentItemById(commentId);
  if (!item) return;

  const viewEl = item.querySelector('[data-role="comment-view"]');
  const formEl = item.querySelector('[data-role="comment-edit-form"]');

  if (!viewEl || !formEl) return;

  if (isEditing) {
    viewEl.hidden = true;
    formEl.hidden = false;
    refreshCommentEmoticonUi();

    const textarea = formEl.querySelector(
      '[data-role="comment-edit-textarea"]',
    );
    if (textarea) {
      focusEditorForTextarea(textarea);
    }
    return;
  }

  viewEl.hidden = false;
  formEl.hidden = true;

  const msg = formEl.querySelector('[data-role="comment-edit-msg"]');
  if (msg) msg.textContent = '';
}

function setEditMessage(commentId, text, type = '') {
  const item = findCommentItemById(commentId);
  if (!item) return;

  const msg = item.querySelector('[data-role="comment-edit-msg"]');
  if (!msg) return;

  msg.textContent = text;
  msg.className = type
    ? `comment-edit-form__msg ${type}`
    : 'comment-edit-form__msg';
}

function closeAllReplyForms() {
  const forms = document.querySelectorAll('[data-role="reply-form"]:not([hidden])');
  forms.forEach((form) => {
    form.hidden = true;

    const textarea = form.querySelector('[data-role="reply-textarea"]');
    const msg = form.querySelector('[data-role="reply-msg"]');

    if (textarea) clearCommentEditor(textarea);
    if (msg) {
      msg.textContent = '';
      msg.className = 'comment-reply-form__msg';
    }
  });
}

function toggleReplyForm(commentId, shouldOpen = true) {
  const item = document.querySelector(
    `.comment-item[data-comment-id="${commentId}"]`,
  );
  if (!item) return;

  const form = item.querySelector('[data-role="reply-form"]');
  if (!form) return;

  if (!shouldOpen) {
    form.hidden = true;

    const textarea = form.querySelector('[data-role="reply-textarea"]');
    const msg = form.querySelector('[data-role="reply-msg"]');

    if (textarea) clearCommentEditor(textarea);
    if (msg) {
      msg.textContent = '';
      msg.className = 'comment-reply-form__msg';
    }
    return;
  }

  const wasHidden = form.hidden;
  closeAllReplyForms();
  form.hidden = !wasHidden ? true : false;

  if (!form.hidden) {
    const textarea = form.querySelector('[data-role="reply-textarea"]');
    if (textarea) focusEditorForTextarea(textarea);
  }
}

function setReplyFormMessage(formEl, text, type = '') {
  if (!formEl) return;
  const msg = formEl.querySelector('[data-role="reply-msg"]');
  if (!msg) return;

  msg.textContent = text;
  msg.className = type
    ? `comment-reply-form__msg ${type}`
    : 'comment-reply-form__msg';
}

function renderCommentEmoticonPicker(emoticons, options) {
  return `
    <div class="comment-emoticon-panel__header">
      <span>이모티콘</span>
      <a class="emoticon-setting-link" href="./inventory.html#emoticon-inventory"
        aria-label="이모티콘 설정" title="이모티콘 설정">
        <img src="./images/emoticons/settings-cucumber-gear.png" alt="" />
      </a>
    </div>
    ${renderOwnedEmoticonPicker(emoticons, options)}
  `;
}

function closeAllEmoticonPanels() {
  document
    .querySelectorAll('.emoticon-picker[data-role="emoticon-panel"]')
    .forEach((panel) => {
      panel.hidden = true;
      const toggle = panel.closest('.emoticon-picker-box')?.querySelector('[data-action="toggle-emoticon"]');
      toggle?.setAttribute('aria-expanded', 'false');
      toggle?.setAttribute('aria-label', '이모티콘 열기');
    });
}

function renderCommentEmoticonPanel(panel) {
  panel.innerHTML = renderCommentEmoticonPicker(ownedCommentEmoticons, {
    emptyText:
      '장착한 이모티콘팩이 없어. 인벤토리에서 이모티콘팩을 장착해줘.',
  });
  switchEmoticonPickerPack(panel);
}

function refreshCommentEmoticonUi() {
  document
    .querySelectorAll('.emoticon-picker[data-role="emoticon-panel"]:not([hidden])')
    .forEach(renderCommentEmoticonPanel);

  document
    .querySelectorAll('.comment-emoticon-toggle[data-action="toggle-emoticon"]')
    .forEach((button) => {
      button.disabled = isPrivatePostLocked || !commentEmoticonUserLoggedIn;
    });
}

async function syncOwnedCommentEmoticons(form) {
  const user = await getCurrentUser();
  if (!form.isConnected) return;

  if (!user?.id) {
    commentEmoticonUserLoggedIn = false;
    ownedCommentEmoticons = [];
    refreshCommentEmoticonUi();
    return;
  }

  const emoticons = await loadOwnedEmoticons(user.id);
  if (!form.isConnected) return;
  commentEmoticonUserLoggedIn = true;
  ownedCommentEmoticons = emoticons;
  refreshCommentEmoticonUi();
}

function toggleEmoticonPanel(button) {
  const box = button.closest('.emoticon-picker-box');
  const panel = box?.querySelector('[data-role="emoticon-panel"]');
  if (!panel) return;

  const nextOpen = panel.hidden;
  closeAllEmoticonPanels();
  if (nextOpen) renderCommentEmoticonPanel(panel);
  panel.hidden = !nextOpen;
  button.setAttribute('aria-expanded', String(nextOpen));
  button.setAttribute('aria-label', nextOpen ? '이모티콘 닫기' : '이모티콘 열기');
}

function insertEmoticonToForm(formEl, emoticonCode) {
  const textarea = formEl?.querySelector('textarea');
  if (!textarea) return;

  const editor = ensureCommentRichEditor(textarea);
  if (!editor) {
    insertEmoticonToken(textarea, emoticonCode);
    return;
  }

  const selected = ownedCommentEmoticons.find(
    (item) =>
      String(item?.emoticon_code || '').trim() ===
      String(emoticonCode || '').trim(),
  );

  if (!selected) {
    insertEmoticonToken(textarea, emoticonCode);
    syncTextareaToEditor(textarea, editor);
    return;
  }

  editor.focus();

  const selection = window.getSelection();
  let range = null;

  if (
    selection &&
    selection.rangeCount > 0 &&
    editor.contains(selection.getRangeAt(0).commonAncestorContainer)
  ) {
    range = selection.getRangeAt(0);
  } else {
    range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
  }

  range.deleteContents();

  const img = createInlineEmoticonNode(selected);
  img.classList.remove('inline-emoticon--comment');
  img.classList.add('inline-emoticon--editor');

  range.insertNode(img);
  placeCaretAfterEmoticon(img);

  syncEditorToTextarea(textarea, editor);
}

function bindMainCommentFormExtras() {
  const form = $('commentForm');
  if (!form || form.dataset.emoticonBound === '1') return;

  form.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!button) return;

    const action = button.dataset.action || '';

    if (action === 'toggle-emoticon') {
      toggleEmoticonPanel(button);
      return;
    }

    if (action === 'select-emoticon-pack') {
      const panel = button.closest('[data-role="emoticon-panel"]');
      const packKey = String(button.dataset.packKey || '').trim();
      switchEmoticonPickerPack(panel, packKey);
      return;
    }

    if (action === 'select-emoticon') {
      const code = String(button.dataset.emoticonCode || '').trim();
      insertEmoticonToForm(form, code);
      closeAllEmoticonPanels();
    }
  });

  if (!commentEmoticonDocumentBound) {
    document.addEventListener('click', (event) => {
      if (event.target.closest('.emoticon-picker-box')) return;
      closeAllEmoticonPanels();
    });

    commentEmoticonDocumentBound = true;
  }

  const mainTextarea = form.querySelector('#commentBody');
  bindCommentRichEditor(mainTextarea);

  form.dataset.emoticonBound = '1';
}

function getTargetCommentIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  const commentId = Number(sp.get('comment') || 0);
  return Number.isFinite(commentId) && commentId > 0 ? commentId : null;
}

function focusTargetCommentFromUrl() {
  const commentId = getTargetCommentIdFromUrl();
  if (!commentId) return;

  const targetEl = document.querySelector(`[data-comment-id="${commentId}"]`);
  if (!targetEl) return;

  const hiddenReplyWrap = targetEl.closest(
    '[data-role="reply-thread-wrap"][hidden]',
  );

  if (hiddenReplyWrap) {
    const rootItem = targetEl.closest('.comment-item');
    const rootCommentId = Number(rootItem?.dataset?.commentId || 0);

    if (Number.isFinite(rootCommentId) && rootCommentId > 0) {
      toggleReplyThread(rootCommentId);
    }
  }

  document
    .querySelectorAll('.is-target-comment')
    .forEach((el) => el.classList.remove('is-target-comment'));

  targetEl.classList.add('is-target-comment');

  window.requestAnimationFrame(() => {
    targetEl.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  });

  window.setTimeout(() => {
    targetEl.classList.remove('is-target-comment');
  }, 2600);
}

function toggleReplyThread(commentId) {
  const item = document.querySelector(
    `.comment-item[data-comment-id="${commentId}"]`,
  );
  if (!item) return;

  const toggleBtn = item.querySelector(
    `[data-action="toggle-thread"][data-comment-id="${commentId}"]`,
  );
  const threadWrap = item.querySelector(
    `[data-role="reply-thread-wrap"][data-comment-id="${commentId}"]`,
  );

  if (!toggleBtn || !threadWrap) return;

  const replyCount = threadWrap.querySelectorAll('.comment-reply-item').length;
  const nextOpen = threadWrap.hidden;

  threadWrap.hidden = !nextOpen;
  toggleBtn.dataset.open = nextOpen ? 'true' : 'false';
  toggleBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  toggleBtn.textContent = getThreadToggleLabel(replyCount, nextOpen);
}

function handleCreateComment(postId) {
  const form = $('commentForm');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');

  if (!form || !textarea || !submitBtn) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (isPrivatePostLocked) {
      setFormMessage('비밀번호를 먼저 입력해줘.', 'is-error');
      return;
    }

    const user = await getCurrentUser();

    if (!user) {
      saveRedirect();
      window.location.href = loginHref();
      return;
    }

    const body = textarea.value.trim();

    if (!body) {
      setFormMessage('댓글 내용을 입력해줘.', 'is-error');
      textarea.focus();
      return;
    }

    if (body.length > 500) {
      setFormMessage('댓글은 500자 이하로 입력해줘.', 'is-error');
      textarea.focus();
      return;
    }

    setFormMessage('댓글 등록 중...');
    submitBtn.disabled = true;

    const payload = {
      post_id: postId,
      parent_comment_id: null,
      body,
      author_id: user.id,
      author_nickname: getDisplayName(user),
    };

    const { data: insertedComment, error } = await supabase
      .from('post_comments')
      .insert(payload)
      .select('id')
      .single();

    submitBtn.disabled = false;

    if (error) {
      console.error('[post-comments] insert failed:', error);
      setFormMessage(
        error.message?.includes('MALLINOI_COMMUNITY_CONTENT_RESTRICTED')
          ? '커뮤니티 운영 기준을 확인하고 댓글을 수정해 주세요.'
          : '댓글 등록에 실패했어. 잠시 후 다시 시도해줘.',
        'is-error',
      );
      return;
    }

    const rewardGranted = await hasCommentPickleReward(
      user.id,
      insertedComment?.id,
    );

    clearCommentEditor(textarea);
    setFormMessage('댓글이 등록됐어.', 'is-success');

    if (rewardGranted) {
      playPickleBurst({
        originEl: submitBtn,
        count: 9,
      });
      window.dispatchEvent(new Event('pickle-balance-changed'));
    }

    if (!form.isConnected) return;
    await Promise.all([syncCommentFormUser(), renderComments(postId, currentSecretPassword)]);
  });
}

async function handleCreateReply(replyForm, postId, parentCommentId) {
  if (isPrivatePostLocked) {
    setReplyFormMessage(replyForm, '비밀번호를 먼저 입력해줘.', 'is-error');
    return;
  }

  const textarea = replyForm.querySelector('[data-role="reply-textarea"]');
  const submitBtn = replyForm.querySelector('[data-role="reply-submit"]');

  if (!textarea || !submitBtn) return;

  const user = await getCurrentUser();

  if (!user) {
    saveRedirect();
    window.location.href = loginHref();
    return;
  }

  const body = textarea.value.trim();

  if (!body) {
    setReplyFormMessage(replyForm, '답글 내용을 입력해줘.', 'is-error');
    textarea.focus();
    return;
  }

  if (body.length > 500) {
    setReplyFormMessage(replyForm, '답글은 500자 이하로 입력해줘.', 'is-error');
    textarea.focus();
    return;
  }

  setReplyFormMessage(replyForm, '답글 등록 중...');
  submitBtn.disabled = true;

  const payload = {
    post_id: postId,
    parent_comment_id: parentCommentId,
    body,
    author_id: user.id,
    author_nickname: getDisplayName(user),
  };

  const { data: insertedReply, error } = await supabase
    .from('post_comments')
    .insert(payload)
    .select('id')
    .single();

  submitBtn.disabled = false;

  if (error) {
    console.error('[post-comments] reply insert failed:', error);
    setReplyFormMessage(
      replyForm,
      error.message?.includes('MALLINOI_COMMUNITY_CONTENT_RESTRICTED')
        ? '커뮤니티 운영 기준을 확인하고 답글을 수정해 주세요.'
        : '답글 등록에 실패했어. 잠시 후 다시 시도해줘.',
      'is-error',
    );
    return;
  }

  const rewardGranted = await hasCommentPickleReward(
    user.id,
    insertedReply?.id,
  );

  setReplyFormMessage(replyForm, '답글이 등록됐어.', 'is-success');

  if (rewardGranted) {
    playPickleBurst({
      originEl: submitBtn,
      count: 9,
    });
    window.dispatchEvent(new Event('pickle-balance-changed'));
  }

  await renderComments(postId, currentSecretPassword);
}

async function handleDeleteComment(commentId, postId, isMine = true) {
  const ok = window.confirm(
    isMine
      ? '이 댓글을 삭제할까? 답글도 함께 삭제될 수 있어.'
      : '관리자 권한으로 이 댓글을 삭제할까? 답글도 함께 삭제될 수 있어.',
  );
  if (!ok) return;

  const { error } = await supabase
    .from('post_comments')
    .delete()
    .eq('id', commentId);

  if (error) {
    console.error('[post-comments] delete failed:', error);
    alert('댓글 삭제에 실패했어.');
    return;
  }

  await renderComments(postId, currentSecretPassword);
}

async function handleSaveEdit(commentId, postId) {
  const item = findCommentItemById(commentId);
  if (!item) return;

  const textarea = item.querySelector('[data-role="comment-edit-textarea"]');
  if (!textarea) return;

  const nextBody = textarea.value.trim();

  if (!nextBody) {
    setEditMessage(commentId, '댓글 내용을 입력해줘.', 'is-error');
    textarea.focus();
    return;
  }

  if (nextBody.length > 500) {
    setEditMessage(commentId, '댓글은 500자 이하로 입력해줘.', 'is-error');
    textarea.focus();
    return;
  }

  setEditMessage(commentId, '수정 중...');

  const { error } = await supabase
    .from('post_comments')
    .update({ body: nextBody })
    .eq('id', commentId);

  if (error) {
    console.error('[post-comments] update failed:', error);
    setEditMessage(commentId,
      error.message?.includes('MALLINOI_COMMUNITY_CONTENT_RESTRICTED')
        ? '커뮤니티 운영 기준을 확인하고 댓글을 수정해 주세요.'
        : '댓글 수정에 실패했어.',
      'is-error',
    );
    return;
  }

  await renderComments(postId, currentSecretPassword);
}

function bindCommentListEvents(postId) {
  const listEl = $('commentList');
  if (!listEl || listEl.dataset.bound === '1') return;

  listEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action || '';

    if (action === 'toggle-emoticon') {
      toggleEmoticonPanel(btn);
      return;
    }

    if (action === 'select-emoticon-pack') {
      const panel = btn.closest('[data-role="emoticon-panel"]');
      const packKey = String(btn.dataset.packKey || '').trim();
      switchEmoticonPickerPack(panel, packKey);
      return;
    }

    if (action === 'select-emoticon') {
      const code = String(btn.dataset.emoticonCode || '').trim();
      const form = btn.closest('form');
      insertEmoticonToForm(form, code);
      closeAllEmoticonPanels();
      return;
    }

    const commentId = Number(btn.dataset.commentId || 0);
    if (!Number.isFinite(commentId) || commentId <= 0) return;

    if (isPrivatePostLocked && action !== 'toggle-thread') {
      alert('비밀번호를 먼저 입력해줘.');
      return;
    }

    if (action === 'toggle-thread') {
      toggleReplyThread(commentId);
      return;
    }

    if (action === 'reply') {
      const user = await getCurrentUser();
      if (!user) {
        saveRedirect();
        window.location.href = loginHref();
        return;
      }

      toggleReplyForm(commentId, true);
      refreshCommentEmoticonUi();
      return;
    }

    if (action === 'cancel-reply') {
      toggleReplyForm(commentId, false);
      return;
    }

    if (action === 'edit') {
      setEditMode(commentId, true);
      return;
    }

    if (action === 'cancel-edit') {
      setEditMode(commentId, false);
      return;
    }

    if (action === 'delete') {
      const isMine = btn.dataset.isMine === 'true';
      await handleDeleteComment(commentId, postId, isMine);
    }
  });

  listEl.addEventListener('submit', async (e) => {
    const replyForm = e.target.closest('[data-role="reply-form"]');
    if (replyForm) {
      e.preventDefault();

      const parentCommentId = Number(replyForm.dataset.parentId || 0);
      if (!Number.isFinite(parentCommentId) || parentCommentId <= 0) return;

      await handleCreateReply(replyForm, postId, parentCommentId);
      return;
    }

    const form = e.target.closest('[data-role="comment-edit-form"]');
    if (!form) return;

    e.preventDefault();

    const submitBtn = form.querySelector(
      'button[type="submit"][data-comment-id]',
    );
    const commentId = Number(submitBtn?.dataset?.commentId || 0);

    if (!Number.isFinite(commentId) || commentId <= 0) return;

    await handleSaveEdit(commentId, postId);
  });

  listEl.dataset.bound = '1';
}

export function initPostComments() {
  const form = $('commentForm');
  const textarea = $('commentBody');
  const submitBtn = $('commentSubmitBtn');
  const postId = getPostIdFromUrl();

  if (!form || !textarea || !submitBtn || !postId || form.dataset.commentsBound) return;
  form.dataset.commentsBound = '1';

  initEmoticonSettingsNavigation();
  bindCommentListEvents(postId);
  bindMainCommentFormExtras();
  handleCreateComment(postId);

  currentSecretPassword = '';
  isPrivatePostLocked = true;
  ownedCommentEmoticons = [];
  commentEmoticonUserLoggedIn = false;
  setCommentFormDisabled(true, '댓글 정보를 확인하고 있어.');
  refreshCommentEmoticonUi();

  const controller = new AbortController();
  window.addEventListener('mallin:post-access', ({ detail }) => {
    if (Number(detail?.postId) !== postId || !form.isConnected) return;

    const unavailable = detail.isAvailable === false;
    isPrivatePostLocked = unavailable || (detail.isPrivate && !detail.isUnlocked);
    if (isPrivatePostLocked) {
      currentSecretPassword = '';
      renderLockedCommentState(unavailable);
      return;
    }

    currentSecretPassword = String(detail.secretPassword || '');
    void Promise.all([
      renderComments(postId, currentSecretPassword),
      syncCommentFormUser(),
      syncOwnedCommentEmoticons(form),
    ]).catch((error) => console.error('[post-comments] sync form failed:', error));
  }, { signal: controller.signal });

  const disposeEquipmentListener = listenEquipmentChanged(async (detail = {}) => {
    if (!form.isConnected || isPrivatePostLocked) return;
    const user = await getCurrentUser();
    if (!form.isConnected || isPrivatePostLocked) return;
    const currentUserId = String(user?.id || '').trim();
    const changedUserId = String(detail?.userId || '').trim();

    if (!currentUserId) return;
    if (changedUserId && changedUserId !== currentUserId) return;

    clearCommentProfileAssetCache(currentUserId);

    await renderComments(postId, currentSecretPassword);
  });

  window.addEventListener('mallin:before-pjax-swap', () => {
    controller.abort();
    disposeEquipmentListener();
  }, { once: true });
}
