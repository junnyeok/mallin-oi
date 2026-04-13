import { withAssetVersion } from './site-version.js';
import { supabase } from './supabase-client.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const {
  BASIC_EMOTICON_PACK,
  CHEER_EMOTICON_PACK,
  POLICE_EMOTICON_PACK,
  THANKS_EMOTICON_PACK,
  SORRY_EMOTICON_PACK,
  CARROT_EMOTICON_PACK,
  HEART_EMOTICON_PACK,
  SAD_EMOTICON_PACK,
} = await import(`./store-data.js?v=${MODULE_VERSION}`);

const EMOTICON_MAP = new Map(
  [
    ...BASIC_EMOTICON_PACK,
    ...CHEER_EMOTICON_PACK,
    ...POLICE_EMOTICON_PACK,
    ...THANKS_EMOTICON_PACK,
    ...SORRY_EMOTICON_PACK,
    ...CARROT_EMOTICON_PACK,
    ...HEART_EMOTICON_PACK,
    ...SAD_EMOTICON_PACK,
  ].map((item) => [item.code, item]),
);

const PACK_META = [
  {
    key: 'basic',
    itemId: 'emo-basic-01',
    label: '기본',
    iconPath: BASIC_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'free-',
  },
  {
    key: 'cheer',
    itemId: 'emo-cheer-01',
    label: '응원',
    iconPath: CHEER_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'cheer-',
  },
  {
    key: 'police',
    itemId: 'emo-police-01',
    label: '경찰',
    iconPath: POLICE_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'police-',
  },
  {
    key: 'thanks',
    itemId: 'emo-thanks-01',
    label: '감사',
    iconPath: THANKS_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'thanks-',
  },
  {
    key: 'sorry',
    itemId: 'emo-sorry-01',
    label: '사과',
    iconPath: SORRY_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'sorry-',
  },
  {
    key: 'carrot',
    itemId: 'emo-carrot-01',
    label: '당근',
    iconPath: CARROT_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'carrot-',
  },

  {
    key: 'heart',
    itemId: 'emo-heart-01',
    label: '애정',
    iconPath: HEART_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'heart-',
  },

  {
    key: 'sad',
    itemId: 'emo-sad-01',
    label: '슬픔',
    iconPath: SAD_EMOTICON_PACK[0]?.imagePath || '',
    prefix: 'sad-',
  },
];

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

function getPackKeyByEmoticonCode(code = '') {
  const safeCode = String(code || '')
    .trim()
    .toLowerCase();

  const found = PACK_META.find((pack) => safeCode.startsWith(pack.prefix));
  return found?.key || 'etc';
}

function groupOwnedEmoticonsByPack(emoticons = []) {
  const grouped = new Map();

  for (const pack of PACK_META) {
    grouped.set(pack.key, []);
  }

  (emoticons || []).forEach((item) => {
    const key = getPackKeyByEmoticonCode(item?.emoticon_code);
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(item);
  });

  return PACK_META.map((pack) => ({
    ...pack,
    emoticons: grouped.get(pack.key) || [],
  })).filter((pack) => pack.emoticons.length > 0);
}

export function getEmoticonPackByItemId(itemId = '') {
  const safeItemId = String(itemId || '').trim();

  if (safeItemId === 'emo-basic-01') {
    return BASIC_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-cheer-01') {
    return CHEER_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-police-01') {
    return POLICE_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-thanks-01') {
    return THANKS_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-sorry-01') {
    return SORRY_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-carrot-01') {
    return CARROT_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-heart-01') {
    return HEART_EMOTICON_PACK;
  }

  if (safeItemId === 'emo-sad-01') {
    return SAD_EMOTICON_PACK;
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
    image_path: withAssetVersion(String(row?.image_path || '').trim()),
    display_order: Number(row?.display_order || 0),
  }));
}

export function createInlineEmoticonNode(emoticon) {
  const img = document.createElement('img');
  img.src = withAssetVersion(String(emoticon?.image_path || '').trim());
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

export function switchEmoticonPickerPack(rootEl, packKey = '') {
  if (!rootEl) return;

  const tabs = rootEl.querySelectorAll('[data-action="select-emoticon-pack"]');
  const panes = rootEl.querySelectorAll('[data-role="emoticon-pack-pane"]');

  if (!tabs.length || !panes.length) return;

  const fallbackKey =
    packKey || tabs[0]?.dataset.packKey || panes[0]?.dataset.packKey || '';

  tabs.forEach((tab) => {
    const isActive = tab.dataset.packKey === fallbackKey;
    tab.classList.toggle('is-active', isActive);
    tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });

  panes.forEach((pane) => {
    const isActive = pane.dataset.packKey === fallbackKey;
    pane.hidden = !isActive;
    pane.classList.toggle('is-active', isActive);
  });
}

export function renderOwnedEmoticonPicker(
  emoticons = [],
  { emptyText = '보유한 이모티콘이 없어.' } = {},
) {
  if (!Array.isArray(emoticons) || !emoticons.length) {
    return `<div class="emoticon-picker__empty">${escapeHtml(emptyText)}</div>`;
  }

  const packGroups = groupOwnedEmoticonsByPack(emoticons);

  if (!packGroups.length) {
    return `<div class="emoticon-picker__empty">${escapeHtml(emptyText)}</div>`;
  }

  const activePackKey = packGroups[0].key;

  const tabsHtml = packGroups
    .map(
      (pack) => `
        <button
          type="button"
          class="emoticon-picker__pack-tab ${
            pack.key === activePackKey ? 'is-active' : ''
          }"
          data-action="select-emoticon-pack"
          data-pack-key="${escapeHtml(pack.key)}"
          aria-pressed="${pack.key === activePackKey ? 'true' : 'false'}"
          title="${escapeHtml(pack.label)}"
        >
          <img
            src="${escapeHtml(withAssetVersion(pack.iconPath))}"
            alt="${escapeHtml(pack.label)}"
            class="emoticon-picker__pack-icon"
            loading="lazy"
          />
        </button>
      `,
    )
    .join('');

  const panesHtml = packGroups
    .map(
      (pack) => `
        <div
          class="emoticon-picker__pack-pane ${
            pack.key === activePackKey ? 'is-active' : ''
          }"
          data-role="emoticon-pack-pane"
          data-pack-key="${escapeHtml(pack.key)}"
          ${pack.key === activePackKey ? '' : 'hidden'}
        >
          <div class="emoticon-picker__grid">
            ${pack.emoticons
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
              .join('')}
          </div>
        </div>
      `,
    )
    .join('');

  return `
    <div class="emoticon-picker__packs" aria-label="이모티콘 팩 목록">
      ${tabsHtml}
    </div>
    <div class="emoticon-picker__body">
      ${panesHtml}
    </div>
  `;
}

export function renderTextWithEmoticons(
  text = '',
  { imageClass = 'inline-emoticon inline-emoticon--comment' } = {},
) {
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
          class="${escapeHtml(imageClass)}"
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
