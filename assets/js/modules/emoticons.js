import { supabase } from './supabase-client.js';
import { BASIC_EMOTICON_PACK, CHEER_EMOTICON_PACK } from './store-data.js';

const EMOTICON_MAP = new Map(
  [...BASIC_EMOTICON_PACK, ...CHEER_EMOTICON_PACK].map((item) => [
    item.code,
    item,
  ]),
);

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function nl2br(text = '') {
  return escapeHtml(text).replaceAll('\n', '<br />');
}

export function getEmoticonPackByItemId(itemId = '') {
  const safeItemId = String(itemId || '').trim();

  if (safeItemId === 'emo-basic-01') {
    return BASIC_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-cheer-01') {
    return CHEER_EMOTICON_PACK;
  }

  return [];
}

export async function loadOwnedEmoticons(userId) {
  const safeUserId = String(userId || '').trim();
  if (!safeUserId) return [];

  const { data, error } = await supabase
    .from('user_emoticons')
    .select('emoticon_code, emoticon_label, image_path, display_order')
    .eq('user_id', safeUserId)
    .order('display_order', { ascending: true });

  if (error) {
    console.error('[emoticons] loadOwnedEmoticons failed:', error);
    return [];
  }

  return (data || []).map((row) => ({
    emoticon_code: String(row?.emoticon_code || '').trim(),
    emoticon_label: String(row?.emoticon_label || '이모티콘').trim(),
    image_path: String(row?.image_path || '').trim(),
    display_order: Number(row?.display_order || 0),
  }));
}

export function createInlineEmoticonNode(emoticon) {
  const img = document.createElement('img');
  img.src = String(emoticon?.image_path || '').trim();
  img.alt = String(emoticon?.emoticon_label || '이모티콘').trim();
  img.className = 'inline-emoticon';
  img.setAttribute(
    'data-emoticon-code',
    String(emoticon?.emoticon_code || '').trim(),
  );
  img.setAttribute('contenteditable', 'false');
  img.setAttribute('draggable', 'false');
  return img;
}

export function insertEmoticonToken(textarea, emoticonCode = '') {
  if (!textarea) return;

  const safeCode = String(emoticonCode || '').trim();
  if (!safeCode) return;

  const token = `[emo:${safeCode}]`;
  const start = textarea.selectionStart ?? textarea.value.length;
  const end = textarea.selectionEnd ?? textarea.value.length;
  const prev = textarea.value.slice(0, start);
  const next = textarea.value.slice(end);

  textarea.value = `${prev}${token}${next}`;

  const nextCursor = start + token.length;
  textarea.focus();
  textarea.setSelectionRange(nextCursor, nextCursor);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export function renderOwnedEmoticonPicker(
  emoticons = [],
  { emptyText = '보유한 이모티콘이 없어.' } = {},
) {
  if (!Array.isArray(emoticons) || !emoticons.length) {
    return `<div class="emoticon-picker__empty">${escapeHtml(emptyText)}</div>`;
  }

  return emoticons
    .map(
      (item) => `
        <button
          type="button"
          class="emoticon-picker__item"
          data-action="select-emoticon"
          data-emoticon-code="${escapeHtml(item.emoticon_code)}"
          title="${escapeHtml(item.emoticon_label)}"
        >
          <img
            src="${escapeHtml(item.image_path)}"
            alt="${escapeHtml(item.emoticon_label)}"
            class="emoticon-picker__img"
            loading="lazy"
          />
        </button>
      `,
    )
    .join('');
}

export function renderTextWithEmoticons(text = '') {
  const raw = String(text || '');
  const tokenRegex = /\[emo:([a-z0-9-]+)\]/gi;

  let lastIndex = 0;
  let html = '';
  let match;

  while ((match = tokenRegex.exec(raw)) !== null) {
    const [token, codeRaw] = match;
    const code = String(codeRaw || '')
      .trim()
      .toLowerCase();

    html += nl2br(raw.slice(lastIndex, match.index));

    const catalog = EMOTICON_MAP.get(code);
    if (catalog) {
      html += `
        <img
          src="${escapeHtml(catalog.imagePath)}"
          alt="${escapeHtml(catalog.label)}"
          class="inline-emoticon inline-emoticon--comment"
          loading="lazy"
        />
      `;
    } else {
      html += escapeHtml(token);
    }

    lastIndex = match.index + token.length;
  }

  html += nl2br(raw.slice(lastIndex));
  return html;
}
