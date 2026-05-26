import { supabase } from './supabase-client.js';
import { loadPostsByAuthorId, formatMMDD } from './posts-repo.js';
import { getCurrentUser, loginHref } from './auth-store.js';
import {
  applyBgmPreferencesToLocal,
  getBgmPreferencesFromProfileRow,
  getLocalCurrentBgmTrackId,
  getLocalSelectedBgmTrackIds,
  saveRemoteBgmPreferences,
  syncLocalCurrentBgmTrackSelection,
} from './bgm-preferences.js';

const PROFILE_BUCKET = 'profile-images';
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROFILE_IMAGE = './images/logo-home.png';
const DEFAULT_CHARACTER_IMAGE = './images/characters/cucumber.png';
const DEFAULT_CHARACTER_CODE = 'char-cucumber';
const DEFAULT_CHARACTER_NAME = '기본오이';
const DEFAULT_SKIN_CODE = 'char-cucumber-basic';
const DEFAULT_SKIN_NAME = '기본오이';
const DEFAULT_BGM_TRACK_ID = 'mallin-oi-welcome';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const [
  { renderTextWithEmoticons },
  {
    BGM_CATALOG,
    CHARACTER_CATALOG,
    CHARACTER_SKIN_CATALOG,
    CHARACTER_EFFECT_CATALOG,
    PROFILE_BACKGROUND_CATALOG,
    getStoreItemDetailHref,
    getSkinParentRequirementBySkinCode,
    getCharacterEffectByItemId,
    getProfileBackgroundByItemId,
    PROFILE_FRAME_CATALOG,
    getProfileFrameByItemId,
  },
  { emitEquipmentChanged },
] = await Promise.all([
  import(`./emoticons.js?v=${MODULE_VERSION}`),
  import(`./store-data.js?v=${MODULE_VERSION}`),
  import(`./equipment-events.js?v=${MODULE_VERSION}`),
]);

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getTargetUserIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  return String(sp.get('user') || '').trim();
}

function trimCommentPreview(text, max = 70) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '(내용 없음)';

  const parts = clean.split(/(\[emo:[a-z0-9-]+\])/gi).filter(Boolean);

  let result = '';
  let length = 0;
  let truncated = false;

  for (const part of parts) {
    const isToken = /^\[emo:[a-z0-9-]+\]$/i.test(part);
    const unitLength = isToken ? 2 : part.length;

    if (length + unitLength > max) {
      if (!isToken) {
        const remain = Math.max(0, max - length);
        if (remain > 0) {
          result += part.slice(0, remain);
        }
      }
      truncated = true;
      break;
    }

    result += part;
    length += unitLength;
  }

  return truncated ? `${result}...` : result;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';

  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';

  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(
    2,
    '0',
  )}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isValidNickname(v) {
  return String(v || '').trim().length >= 2;
}

function normalizeProfileBio(value, { preserveLineBreaks = false } = {}) {
  const raw = String(value ?? '');

  const normalized = preserveLineBreaks
    ? raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    : raw.replace(/\s+/g, ' ');

  const trimmed = normalized.trim();
  if (!trimmed) return '';

  return trimmed.slice(0, 100);
}

function getOwnProfileBioPlaceholder() {
  return '이 자리에 자기소개를 작성할 수 있어. 프로필 설정을 이용해!';
}

function setMsg(text, color = 'var(--color-text-sub)') {
  const el = $('profileMsg');
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

function getProfileImageSrc(url) {
  return String(url || '').trim() || DEFAULT_PROFILE_IMAGE;
}

function getCharacterImageSrc(url) {
  return String(url || '').trim() || DEFAULT_CHARACTER_IMAGE;
}

function formatPickleAmount(value) {
  return `${Number(value || 0)} 🥒`;
}

function getSeoulDateKey() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  return formatter.format(new Date());
}

function updateTodayPickleStatus(entries = []) {
  const postEl = $('profileTodayPostPickle');
  const commentEl = $('profileTodayCommentPickle');

  if (!postEl || !commentEl) return;

  const todayKey = getSeoulDateKey();

  const todayEntries = (entries || []).filter(
    (entry) => String(entry?.awarded_on || '') === todayKey,
  );

  const todayPostCount = todayEntries.filter(
    (entry) =>
      entry?.reason_code === 'post_create' && Number(entry?.amount || 0) > 0,
  ).length;

  const todayCommentCount = todayEntries.filter(
    (entry) =>
      entry?.reason_code === 'comment_post' && Number(entry?.amount || 0) > 0,
  ).length;

  postEl.textContent = `${todayPostCount} / 5`;
  commentEl.textContent = `${todayCommentCount} / 10`;
}

function getTodayPicklePopupStats(entries = []) {
  const todayKey = getSeoulDateKey();

  const todayEntries = (entries || []).filter(
    (entry) => String(entry?.awarded_on || '') === todayKey,
  );

  const attendanceDone = todayEntries.some(
    (entry) =>
      entry?.reason_code === 'attendance' && Number(entry?.amount || 0) > 0,
  );

  const postCount = todayEntries.filter(
    (entry) =>
      entry?.reason_code === 'post_create' && Number(entry?.amount || 0) > 0,
  ).length;

  const commentCount = todayEntries.filter(
    (entry) =>
      entry?.reason_code === 'comment_post' && Number(entry?.amount || 0) > 0,
  ).length;

  return {
    attendanceDone,
    postCount,
    commentCount,
  };
}

function closePicklePanel() {
  const btn = $('pickleBtn');
  const panel = $('picklePanel');

  if (!btn || !panel) return;

  panel.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}

function openPicklePanel() {
  const btn = $('pickleBtn');
  const panel = $('picklePanel');

  if (!btn || !panel) return;

  panel.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
}

function initPicklePopup({
  pageName = '',
  isOwnProfile = false,
  balance = 0,
  entries = [],
} = {}) {
  const menu = $('pickleMenu');
  const btn = $('pickleBtn');
  const panel = $('picklePanel');
  const closeBtn = $('pickleCloseBtn');
  const balanceEl = $('pickleBalanceValue');
  const attendanceEl = $('pickleAttendanceStatus');
  const postEl = $('picklePostStatus');
  const commentEl = $('pickleCommentStatus');

  if (!menu || !btn || !panel) return;

  const shouldShow = pageName === 'profile' && isOwnProfile;

  menu.hidden = !shouldShow;
  if (!shouldShow) {
    closePicklePanel();
    return;
  }

  const { attendanceDone, postCount, commentCount } =
    getTodayPicklePopupStats(entries);

  if (balanceEl) {
    balanceEl.textContent = formatPickleAmount(balance);
  }

  if (attendanceEl) {
    attendanceEl.textContent = attendanceDone ? '완료 ✅' : '미완료 ❌';
  }

  if (postEl) {
    postEl.textContent = `${postCount} / 5`;
  }

  if (commentEl) {
    commentEl.textContent = `${commentCount} / 20`;
  }

  btn.onclick = (event) => {
    event.preventDefault();

    const isOpen = !panel.hidden;
    if (isOpen) {
      closePicklePanel();
      return;
    }

    openPicklePanel();
  };

  closeBtn?.addEventListener('click', () => {
    closePicklePanel();
  });

  panel.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  document.addEventListener('click', (event) => {
    if (panel.hidden) return;
    if (menu.contains(event.target)) return;
    closePicklePanel();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closePicklePanel();
    }
  });
}

function updatePickleSummary(balance = 0, isVisible = false) {
  const balanceEl = $('profilePickleBalance');
  const sectionEl = $('profilePickleSection');

  if (balanceEl) {
    balanceEl.textContent = formatPickleAmount(balance);
  }

  if (sectionEl) {
    sectionEl.hidden = !isVisible;
  }
}

function getPickleReasonLabel(entry) {
  const label = String(entry?.reason_label || '').trim();
  if (label) return label;

  if (entry?.reason_code === 'weekly_attendance_bonus') {
    return '주간 출석 보너스';
  }

  return '피클 획득';
}

function getPickleDescription(entry) {
  const description = String(entry?.description || '').trim();
  if (description) return description;

  if (entry?.reason_code === 'weekly_attendance_bonus') {
    return '월요일부터 일요일까지 7일 출석을 완료해서 보너스를 받았어.';
  }

  return '피클 내역이야.';
}

function renderPickleRow(entry) {
  const amount = Number(entry?.amount || 0);
  const amountText = amount > 0 ? `+${amount} 피클` : `${amount} 피클`;
  const reasonLabel = getPickleReasonLabel(entry);
  const description = getPickleDescription(entry);

  return `
    <div class="profile-row profile-row--pickle">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(reasonLabel)}</div>
        <div class="profile-row__body">${escapeHtml(
          description,
        )}</div>
      </div>
      <div class="profile-row__side">
        <span class="profile-row__amount">${escapeHtml(amountText)}</span>
        <span class="profile-row__meta">${formatDateTime(
          entry?.created_at,
        )}</span>
      </div>
    </div>
  `;
}

async function loadPickleLedger(userId) {
  const { data, error } = await supabase
    .from('pickle_ledger')
    .select(
      'id, amount, reason_code, reason_label, description, source_post_id, source_comment_id, awarded_on, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderMyPostRow(post) {
  return `
    <a class="profile-row" href="${post.url}">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(post.title)}</div>
        <div class="profile-row__body">${escapeHtml(
          post.excerpt || '(요약 없음)',
        )}</div>
      </div>
      <span class="profile-row__meta">
        ${formatMMDD(post.date)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

function renderMyCommentRow(comment, postMap) {
  const post = postMap.get(Number(comment.post_id));
  const postTitle = post?.title || `게시물 #${comment.post_id}`;
  const postCategory = post?.category || '-';
  const postUrl = `./post.html?id=${encodeURIComponent(comment.post_id)}`;
  const isPrivatePost = !!post?.is_private;

  const preview = isPrivatePost
    ? '비밀 게시글의 댓글은 프로필에서 내용이 표시되지 않아.'
    : trimCommentPreview(comment.body);

  return `
    <a class="profile-row" href="${postUrl}">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(postTitle)}</div>
        <div class="profile-row__body">
          ${renderTextWithEmoticons(preview, {
            imageClass: 'inline-emoticon inline-emoticon--compact',
          })}
        </div>      </div>
      <span class="profile-row__meta">
        ${formatDateTime(comment.created_at)} · ${escapeHtml(postCategory)}
      </span>
    </a>
  `;
}

function renderPreviewList({
  items = [],
  limit = 3,
  listEl,
  emptyHtml = '',
  renderItem,
}) {
  if (!listEl) return;

  if (!items.length) {
    listEl.innerHTML = emptyHtml;
    return;
  }

  listEl.innerHTML = items.slice(0, limit).map(renderItem).join('');
}

async function loadProfileRow(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      [
        'id',
        'nickname',
        'bio',
        'profile_image_url',
        'equipped_character_image_url',
        'equipped_character_effect_item_id',
        'bgm_selected_track_ids',
        'bgm_current_track_id',
        'created_at',
        'updated_at',
        'equipped_profile_background_item_id',
        'equipped_profile_frame_item_id',
      ].join(', '),
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadPublicProfileRow(userId) {
  const { data, error } = await supabase
    .from('public_profiles')
    .select(
      'id, nickname, bio, profile_image_url, equipped_character_image_url, equipped_character_effect_item_id, equipped_profile_background_item_id, equipped_profile_frame_item_id, created_at, updated_at',
    )
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadOwnedCharacters(userId) {
  const { data, error } = await supabase
    .from('user_characters')
    .select(
      'id, character_code, character_name, base_image_path, preview_image_path, acquired_reason, acquired_at, display_order',
    )
    .eq('user_id', userId)
    .order('display_order', { ascending: true })
    .order('acquired_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadCharacterInventory(userId) {
  const { data, error } = await supabase
    .from('user_character_skins')
    .select(
      'id, character_code, skin_code, skin_name, image_path, acquired_reason, acquired_at, display_order',
    )
    .eq('user_id', userId)
    .order('display_order', { ascending: true })
    .order('acquired_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadOwnedStoreItemIdsByUserId(userId) {
  const { data, error } = await supabase
    .from('user_store_items')
    .select('item_id')
    .eq('user_id', userId);

  if (error) throw error;

  return new Set((data || []).map((row) => String(row?.item_id || '').trim()));
}

function renderCharacterEffectImage(effectItemId = '') {
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

function renderEquippedCharacterEffectOnPreview(effectItemId = '') {
  const previewEl = $('profileCharacterImage');
  if (!previewEl) return;

  const wrapEl = previewEl.closest('.character-effect-wrap');
  if (!wrapEl) return;

  wrapEl
    .querySelectorAll('.character-effect-img')
    .forEach((node) => node.remove());

  const effectHtml = renderCharacterEffectImage(effectItemId);
  if (!effectHtml) return;

  previewEl.insertAdjacentHTML('afterend', effectHtml);
}

function getOwnedCharacterEffectRows(ownedStoreItemIds = new Set()) {
  return CHARACTER_EFFECT_CATALOG.map((item) => ({
    ...item,
    isOwned: ownedStoreItemIds.has(item.itemId),
  })).sort(
    (a, b) => Number(a?.displayOrder || 999) - Number(b?.displayOrder || 999),
  );
}

function renderCharacterEffectCard(item, equippedEffectItemId = '') {
  const isOwned = item?.isOwned === true;
  const isEquipped =
    String(item?.itemId || '').trim() ===
    String(equippedEffectItemId || '').trim();

  const detailHref = getStoreItemDetailHref(item.itemId);

  const metaText = !isOwned
    ? '미보유 · 클릭하면 구매페이지로 이동'
    : isEquipped
      ? '현재 장착 중 · 클릭하면 해제'
      : '클릭해서 장착';

  return `
    <button
      type="button"
      class="profile-character-card profile-character-effect-card ${isEquipped ? 'is-equipped' : ''} ${!isOwned ? 'is-locked' : ''}"
      data-character-effect-item-id="${escapeHtml(item.itemId)}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
    >
            <div class="profile-character-effect-card__thumb">
        <img
          class="profile-character-effect-card__image"
          src="${escapeHtml(item.imagePath)}"
          alt=""
          aria-hidden="true"
        />
      </div>

      <div class="profile-character-card__name">
        ${escapeHtml(item.name)}
      </div>

      <div class="profile-character-card__meta ${!isOwned ? 'is-locked' : ''}">
        ${metaText}
      </div>
    </button>
  `;
}

function renderCharacterEffectSection({
  isOwnProfile = false,
  profileRow = null,
  ownedStoreItemIds = new Set(),
}) {
  const wrapEl = $('profileCharacterEffectWrap');
  const listEl = $('profileCharacterEffectList');

  renderEquippedCharacterEffectOnPreview(
    profileRow?.equipped_character_effect_item_id,
  );

  if (!wrapEl || !listEl) return;

  wrapEl.hidden = !isOwnProfile;
  if (!isOwnProfile) return;

  const rows = getOwnedCharacterEffectRows(ownedStoreItemIds);
  const equippedEffectItemId = String(
    profileRow?.equipped_character_effect_item_id || '',
  ).trim();

  const sortedRows = sortEquippedItemFirst(
    rows,
    (item) =>
      String(item?.itemId || '').trim() === String(equippedEffectItemId).trim(),
  );

  listEl.innerHTML = sortedRows
    .map((item) => renderCharacterEffectCard(item, equippedEffectItemId))
    .join('');

  applyInventoryLimitByIds(
    'profileCharacterEffectWrap',
    'profileCharacterEffectList',
  );

  Array.from(
    listEl.querySelectorAll('[data-character-effect-item-id]'),
  ).forEach((button) => {
    button.addEventListener('click', async () => {
      const isOwned = button.dataset.owned === 'true';
      const storeHref = String(button.dataset.storeHref || '').trim();
      const effectItemId = String(
        button.dataset.characterEffectItemId || '',
      ).trim();

      if (!isOwned) {
        if (storeHref) window.location.href = storeHref;
        return;
      }

      const isEquipped =
        effectItemId ===
        String(profileRow?.equipped_character_effect_item_id || '').trim();

      const nextEffectItemId = isEquipped ? null : effectItemId;

      setMsg(isEquipped ? '캐릭터 효과 해제 중...' : '캐릭터 효과 장착 중...');

      try {
        await updateProfileRow(profileRow.id, {
          equipped_character_effect_item_id: nextEffectItemId,
          updated_at: new Date().toISOString(),
        });

        profileRow = {
          ...profileRow,
          equipped_character_effect_item_id: nextEffectItemId,
        };

        renderEquippedCharacterEffectOnPreview(nextEffectItemId);
        renderCharacterEffectSection({
          isOwnProfile,
          profileRow,
          ownedStoreItemIds,
        });

        setMsg(
          isEquipped ? '캐릭터 효과 해제 완료!' : '캐릭터 효과 장착 완료!',
          'green',
        );

        emitEquipmentChanged({
          userId: profileRow.id,
          source: 'profile-character-effect',
          changed: ['characterEffect'],
        });

        window.dispatchEvent(new Event('auth-changed'));

        window.dispatchEvent(new Event('auth-changed'));
      } catch (error) {
        console.error('[profile] equip character effect failed:', error);
        setMsg('캐릭터 효과 저장 중 오류가 발생했어.', 'red');
      }
    });
  });
}

function getDefaultBgmTrackId() {
  return (
    String(
      BGM_CATALOG.find((track) => track?.isDefault)?.id || DEFAULT_BGM_TRACK_ID,
    ).trim() || DEFAULT_BGM_TRACK_ID
  );
}

function normalizeCharacterCode(value) {
  return String(value || '').trim() || DEFAULT_CHARACTER_CODE;
}

function getSafeCharacterRows(characterRows = []) {
  const ownedMap = new Map(
    (characterRows || []).map((row) => [
      normalizeCharacterCode(row?.character_code),
      {
        ...row,
        character_code: normalizeCharacterCode(row?.character_code),
        character_name: String(row?.character_name || '').trim() || '캐릭터',
        base_image_path: getCharacterImageSrc(
          row?.base_image_path || row?.preview_image_path,
        ),
        preview_image_path: getCharacterImageSrc(
          row?.preview_image_path || row?.base_image_path,
        ),
        is_owned: true,
        store_item_id: null,
      },
    ]),
  );

  const merged = CHARACTER_CATALOG.map((item) => {
    const code = normalizeCharacterCode(item?.character_code);
    const owned = ownedMap.get(code);

    if (owned) {
      return {
        ...item,
        ...owned,
        is_owned: true,
        store_item_id: item?.store_item_id || null,
      };
    }

    return {
      character_code: code,
      character_name: String(item?.character_name || '').trim() || '캐릭터',
      base_image_path: getCharacterImageSrc(item?.base_image_path),
      preview_image_path: getCharacterImageSrc(item?.preview_image_path),
      display_order: Number(item?.display_order || 999),
      is_owned: code === DEFAULT_CHARACTER_CODE,
      store_item_id: item?.store_item_id || null,
    };
  });

  if (!merged.length) {
    merged.push({
      character_code: DEFAULT_CHARACTER_CODE,
      character_name: DEFAULT_CHARACTER_NAME,
      base_image_path: DEFAULT_CHARACTER_IMAGE,
      preview_image_path: DEFAULT_CHARACTER_IMAGE,
      display_order: 1,
      is_owned: true,
      store_item_id: null,
    });
  }

  return merged.sort((a, b) => {
    const orderDiff =
      Number(a?.display_order || 999) - Number(b?.display_order || 999);
    if (orderDiff !== 0) return orderDiff;

    return String(a?.character_name || '').localeCompare(
      String(b?.character_name || ''),
      'ko',
    );
  });
}

function getSafeSkinRows(skinRows = [], characterRows = []) {
  const ownedCharacterCodeSet = new Set(
    (characterRows || [])
      .filter((row) => row?.is_owned !== false)
      .map((row) => normalizeCharacterCode(row?.character_code)),
  );

  const ownedMap = new Map(
    (skinRows || []).map((row) => {
      const skinCode = String(row?.skin_code || '').trim() || DEFAULT_SKIN_CODE;
      const requirement = getSkinParentRequirementBySkinCode(skinCode);

      return [
        skinCode,
        {
          ...row,
          character_code: normalizeCharacterCode(row?.character_code),
          skin_code: skinCode,
          skin_name: String(row?.skin_name || '').trim() || DEFAULT_SKIN_NAME,
          image_path: getCharacterImageSrc(row?.image_path),
          is_owned: true,
          is_parent_owned:
            !requirement ||
            ownedCharacterCodeSet.has(
              normalizeCharacterCode(requirement.character_code),
            ),
          required_character_name: requirement?.character_name || '',
          required_store_item_id: requirement?.parent_store_item_id || null,
          store_item_id: null,
        },
      ];
    }),
  );

  const merged = CHARACTER_SKIN_CATALOG.map((item) => {
    const skinCode = String(item?.skin_code || '').trim() || DEFAULT_SKIN_CODE;
    const requirement = getSkinParentRequirementBySkinCode(skinCode);
    const owned = ownedMap.get(skinCode);

    if (owned) {
      return {
        ...item,
        ...owned,
        is_owned: true,
        is_parent_owned:
          !requirement ||
          ownedCharacterCodeSet.has(
            normalizeCharacterCode(requirement.character_code),
          ),
        required_character_name: requirement?.character_name || '',
        required_store_item_id: requirement?.parent_store_item_id || null,
        store_item_id: item?.store_item_id || null,
      };
    }

    return {
      character_code: normalizeCharacterCode(item?.character_code),
      skin_code: skinCode,
      skin_name: String(item?.skin_name || '').trim() || DEFAULT_SKIN_NAME,
      image_path: getCharacterImageSrc(item?.image_path),
      display_order: Number(item?.display_order || 999),
      is_owned: skinCode === DEFAULT_SKIN_CODE,
      is_parent_owned:
        !requirement ||
        ownedCharacterCodeSet.has(
          normalizeCharacterCode(requirement.character_code),
        ),
      required_character_name: requirement?.character_name || '',
      required_store_item_id: requirement?.parent_store_item_id || null,
      store_item_id: item?.store_item_id || null,
    };
  });

  (skinRows || []).forEach((row) => {
    const skinCode = String(row?.skin_code || '').trim() || DEFAULT_SKIN_CODE;
    if (
      merged.some((item) => String(item?.skin_code || '').trim() === skinCode)
    ) {
      return;
    }

    const requirement = getSkinParentRequirementBySkinCode(skinCode);

    merged.push({
      character_code: normalizeCharacterCode(row?.character_code),
      skin_code: skinCode,
      skin_name: String(row?.skin_name || '').trim() || DEFAULT_SKIN_NAME,
      image_path: getCharacterImageSrc(row?.image_path),
      display_order: Number(row?.display_order || 999),
      is_owned: true,
      is_parent_owned:
        !requirement ||
        ownedCharacterCodeSet.has(
          normalizeCharacterCode(requirement.character_code),
        ),
      required_character_name: requirement?.character_name || '',
      required_store_item_id: requirement?.parent_store_item_id || null,
      store_item_id: null,
    });
  });

  if (!merged.length) {
    merged.push({
      character_code: DEFAULT_CHARACTER_CODE,
      skin_code: DEFAULT_SKIN_CODE,
      skin_name: DEFAULT_SKIN_NAME,
      image_path: DEFAULT_CHARACTER_IMAGE,
      display_order: 1,
      is_owned: true,
      is_parent_owned: true,
      required_character_name: '',
      required_store_item_id: null,
      store_item_id: null,
    });
  }

  return merged.sort((a, b) => {
    const orderDiff =
      Number(a?.display_order || 999) - Number(b?.display_order || 999);
    if (orderDiff !== 0) return orderDiff;

    return String(a?.skin_name || '').localeCompare(
      String(b?.skin_name || ''),
      'ko',
    );
  });
}

const INVENTORY_MOBILE_QUERY = '(max-width: 700px)';

const INVENTORY_LIMIT_TARGETS = [
  {
    wrapId: 'profileCharacterCharacterWrap',
    listId: 'profileCharacterList',
  },
  {
    wrapId: 'profileCharacterSkinWrap',
    listId: 'profileCharacterSkinList',
  },
  {
    wrapId: 'profileCharacterEffectWrap',
    listId: 'profileCharacterEffectList',
  },
  {
    wrapId: 'profileBackgroundWrap',
    listId: 'profileBackgroundList',
  },
  {
    wrapId: 'profileBgmWrap',
    listId: 'profileBgmList',
  },
];

const INVENTORY_HASH_TARGET_MAP = {
  'character-inventory': 'profileCharacterCharacterWrap',
  'skin-inventory': 'profileCharacterSkinWrap',
  'character-effect-inventory': 'profileCharacterEffectWrap',
  'profile-background-inventory': 'profileBackgroundWrap',
  'bgm-inventory': 'profileBgmWrap',
};

let inventoryResizeTimer = null;
let inventoryLimitResizeBound = false;
let inventoryInitialHashScrolled = false;

function sortEquippedItemFirst(items = [], isEquippedFn) {
  return [...items]
    .map((item, index) => ({
      item,
      index,
      isEquipped: !!isEquippedFn?.(item),
    }))
    .sort((a, b) => {
      if (a.isEquipped !== b.isEquipped) {
        return a.isEquipped ? -1 : 1;
      }

      return a.index - b.index;
    })
    .map((entry) => entry.item);
}

function getInventoryGridColumnCount(listEl) {
  if (!listEl) return 0;

  const gridTemplateColumns = window
    .getComputedStyle(listEl)
    .gridTemplateColumns.trim();

  if (!gridTemplateColumns || gridTemplateColumns === 'none') {
    return 0;
  }

  return gridTemplateColumns.split(/\s+/).filter(Boolean).length;
}

function getInventoryVisibleLimitByViewport(listEl) {
  const isMobile = window.matchMedia(INVENTORY_MOBILE_QUERY).matches;

  if (isMobile) {
    return 4;
  }

  const columnCount = getInventoryGridColumnCount(listEl);

  if (columnCount > 0) {
    return Math.max(columnCount * 2, 4);
  }

  if (listEl?.classList?.contains('profile-character-grid--bgm')) {
    return 8;
  }

  return 6;
}

function removeInventoryMoreButton(wrapEl) {
  wrapEl
    ?.querySelectorAll(':scope > .inventory-more-area')
    .forEach((node) => node.remove());
}

function applyInventoryLimit({ wrapEl, listEl } = {}) {
  if (!wrapEl || !listEl) return;

  bindInventoryLimitResize();

  const cards = Array.from(listEl.children).filter((node) =>
    node.classList.contains('profile-character-card'),
  );

  removeInventoryMoreButton(wrapEl);

  cards.forEach((card) => {
    card.classList.remove('inventory-item-hidden');
  });

  if (!cards.length) return;

  const visibleLimit = getInventoryVisibleLimitByViewport(listEl);
  const needsMoreButton = cards.length > visibleLimit;
  const isExpanded = wrapEl.dataset.inventoryExpanded === 'true';

  if (!needsMoreButton) {
    wrapEl.dataset.inventoryExpanded = 'false';
    return;
  }

  cards.forEach((card, index) => {
    card.classList.toggle(
      'inventory-item-hidden',
      !isExpanded && index >= visibleLimit,
    );
  });

  const hiddenCount = Math.max(cards.length - visibleLimit, 0);
  const moreArea = document.createElement('div');
  moreArea.className = 'inventory-more-area';

  const moreButton = document.createElement('button');
  moreButton.type = 'button';
  moreButton.className = 'inventory-more-btn';
  moreButton.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
  moreButton.textContent = isExpanded ? '접기' : `더보기 ${hiddenCount}개`;

  moreButton.addEventListener('click', () => {
    const nextExpanded = wrapEl.dataset.inventoryExpanded !== 'true';
    wrapEl.dataset.inventoryExpanded = nextExpanded ? 'true' : 'false';
    applyInventoryLimit({ wrapEl, listEl });
  });

  moreArea.appendChild(moreButton);
  wrapEl.appendChild(moreArea);
}

function applyInventoryLimitByIds(wrapId, listId) {
  applyInventoryLimit({
    wrapEl: $(wrapId),
    listEl: $(listId),
  });
}

function refreshInventoryLimits() {
  INVENTORY_LIMIT_TARGETS.forEach(({ wrapId, listId }) => {
    applyInventoryLimitByIds(wrapId, listId);
  });
}

function bindInventoryLimitResize() {
  if (inventoryLimitResizeBound) return;

  inventoryLimitResizeBound = true;

  window.addEventListener('resize', () => {
    window.clearTimeout(inventoryResizeTimer);

    inventoryResizeTimer = window.setTimeout(() => {
      refreshInventoryLimits();
    }, 120);
  });
}

function getInventoryHashTargetElement() {
  const rawHash = decodeURIComponent(
    String(window.location.hash || '')
      .replace(/^#/, '')
      .trim(),
  );

  if (!rawHash) return null;

  return (
    document.getElementById(rawHash) ||
    document.getElementById(INVENTORY_HASH_TARGET_MAP[rawHash] || '')
  );
}

function scrollInventoryHashTargetOnce() {
  if (inventoryInitialHashScrolled) return;
  if (String(document.body?.dataset?.page || '') !== 'inventory') return;

  const targetEl = getInventoryHashTargetElement();
  if (!targetEl) return;

  inventoryInitialHashScrolled = true;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      targetEl.scrollIntoView({
        block: 'start',
        behavior: 'auto',
      });
    });
  });
}

function getNormalizedEquippedImageUrl({
  characterRows = [],
  skinRows = [],
  equippedImageUrl = '',
}) {
  const safeEquippedImageUrl = getCharacterImageSrc(equippedImageUrl);

  const usableOwnedSkin = (skinRows || []).find((row) => {
    return (
      row?.is_owned !== false &&
      row?.is_parent_owned !== false &&
      getCharacterImageSrc(row?.image_path) === safeEquippedImageUrl
    );
  });

  if (usableOwnedSkin) {
    return safeEquippedImageUrl;
  }

  const ownedCharacter = (characterRows || []).find((row) => {
    if (row?.is_owned === false) return false;

    return (
      getCharacterImageSrc(row?.base_image_path) === safeEquippedImageUrl ||
      getCharacterImageSrc(row?.preview_image_path) === safeEquippedImageUrl
    );
  });

  if (ownedCharacter) {
    return getCharacterImageSrc(
      ownedCharacter?.preview_image_path || ownedCharacter?.base_image_path,
    );
  }

  return DEFAULT_CHARACTER_IMAGE;
}

function getEquippedCharacterCode({
  characterRows = [],
  skinRows = [],
  equippedImageUrl = '',
}) {
  const safeEquippedImageUrl = getCharacterImageSrc(equippedImageUrl);

  const matchedSkin = skinRows.find(
    (row) =>
      row?.is_owned !== false &&
      row?.is_parent_owned !== false &&
      getCharacterImageSrc(row?.image_path) === safeEquippedImageUrl,
  );

  if (matchedSkin) {
    return normalizeCharacterCode(matchedSkin.character_code);
  }

  return normalizeCharacterCode(characterRows?.[0]?.character_code);
}

function renderOwnedCharacterCard(
  item,
  { isSelected = false, isEquipped = false } = {},
) {
  const isOwned = item?.is_owned !== false;
  const storeItemId = String(item?.store_item_id || '').trim();
  const detailHref = storeItemId ? getStoreItemDetailHref(storeItemId) : '';
  const metaText = isOwned
    ? isEquipped
      ? '현재 착용 캐릭터'
      : '보유 중'
    : '미보유 · 클릭하면 구매페이지로 이동';
  const extraMetaClass = isOwned ? '' : ' is-locked';

  return `
    <button
      type="button"
      class="profile-character-card ${isSelected ? 'is-selected' : ''} ${
        isEquipped ? 'is-equipped' : ''
      } ${!isOwned ? 'is-locked' : ''}"
      data-character-code="${escapeHtml(normalizeCharacterCode(item?.character_code))}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
    >
      <img
        class="profile-character-card__thumb"
        src="${escapeHtml(
          getCharacterImageSrc(
            item?.preview_image_path || item?.base_image_path,
          ),
        )}"
        alt="${escapeHtml(item?.character_name || '캐릭터')}"
      />
      <div class="profile-character-card__name">
        ${escapeHtml(item?.character_name || '캐릭터')}
      </div>
      <div class="profile-character-card__meta${extraMetaClass}">
        ${metaText}
      </div>
    </button>
  `;
}

function renderCharacterSkinCard(item, equippedImageUrl = '') {
  const imagePath = getCharacterImageSrc(item?.image_path);
  const isEquipped = imagePath === getCharacterImageSrc(equippedImageUrl);
  const isOwned = item?.is_owned !== false;
  const canEquip = item?.is_parent_owned !== false;

  const storeItemId = String(item?.store_item_id || '').trim();
  const detailHref = storeItemId ? getStoreItemDetailHref(storeItemId) : '';

  const requiredCharacterName = String(
    item?.required_character_name || '',
  ).trim();
  const requiredStoreItemId = String(item?.required_store_item_id || '').trim();
  const requiredStoreHref = requiredStoreItemId
    ? getStoreItemDetailHref(requiredStoreItemId)
    : '';

  let metaText = '클릭해서 착용';
  if (!isOwned) {
    metaText = '미보유 · 클릭하면 구매페이지로 이동';
  } else if (!canEquip) {
    metaText = requiredCharacterName
      ? `${requiredCharacterName} 필요 · 클릭하면 구매페이지로 이동`
      : '기본 캐릭터 필요';
  } else if (isEquipped) {
    metaText = '현재 착용 중';
  }

  const extraMetaClass = isOwned && canEquip ? '' : ' is-locked';

  return `
    <button
      type="button"
      class="profile-character-card ${isEquipped ? 'is-equipped' : ''} ${
        !isOwned || !canEquip ? 'is-locked' : ''
      }"
      data-skin-code="${escapeHtml(String(item?.skin_code || '').trim())}"
      data-skin-image-path="${escapeHtml(imagePath)}"
      data-skin-name="${escapeHtml(item?.skin_name || '스킨')}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-can-equip="${canEquip ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
      data-required-store-href="${escapeHtml(requiredStoreHref)}"
      data-required-character-name="${escapeHtml(requiredCharacterName)}"
    >
      <img
        class="profile-character-card__thumb"
        src="${escapeHtml(imagePath)}"
        alt="${escapeHtml(item?.skin_name || '스킨')}"
      />
      <div class="profile-character-card__name">
        ${escapeHtml(item?.skin_name || '스킨')}
      </div>
      <div class="profile-character-card__meta${extraMetaClass}">
        ${metaText}
      </div>
    </button>
  `;
}

function renderCharacterInventoryItem(item, equippedImageUrl = '') {
  const imagePath = getCharacterImageSrc(item?.image_path);
  const isEquipped = imagePath === getCharacterImageSrc(equippedImageUrl);

  return `
    <div class="profile-character-card ${isEquipped ? 'is-equipped' : ''}">
      <img
        class="profile-character-card__thumb"
        src="${escapeHtml(imagePath)}"
        alt="${escapeHtml(item?.skin_name || '캐릭터')}"
      />
      <div class="profile-character-card__name">
        ${escapeHtml(item?.skin_name || '캐릭터')}
      </div>
      <div class="profile-character-card__meta">
        ${isEquipped ? '현재 착용 중' : '보유 중'}
      </div>
    </div>
  `;
}

function setProfileBackgroundStyle(targetEl, backgroundItemId = '') {
  if (!targetEl) return;

  const background = getProfileBackgroundByItemId(backgroundItemId);

  if (!background) {
    targetEl.classList.remove('has-profile-background');
    targetEl.style.removeProperty('--profile-bg-desktop');
    targetEl.style.removeProperty('--profile-bg-mobile');
    return;
  }

  targetEl.classList.add('has-profile-background');
  targetEl.style.setProperty(
    '--profile-bg-desktop',
    `url("${background.pcImagePath}")`,
  );
  targetEl.style.setProperty(
    '--profile-bg-mobile',
    `url("${background.mobileImagePath || background.pcImagePath}")`,
  );
}

function applyProfileBackground(profileRow = {}) {
  const pageName = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  const equippedBackgroundItemId = String(
    profileRow?.equipped_profile_background_item_id || '',
  ).trim();

  document.querySelectorAll('.profile-card').forEach((cardEl) => {
    if (cardEl.classList.contains('inventory-card')) return;

    // 프로필 설정 페이지는 꾸미기 결과를 보여주는 곳이 아니므로
    // 장착된 프로필 배경 이미지를 적용하지 않는다.
    if (pageName === 'profile-setting') {
      setProfileBackgroundStyle(cardEl, '');
      return;
    }

    setProfileBackgroundStyle(cardEl, equippedBackgroundItemId);
  });

  document
    .querySelectorAll('.inventory-profile-preview')
    .forEach((previewEl) => {
      setProfileBackgroundStyle(previewEl, equippedBackgroundItemId);
    });
}

function renderProfileBackgroundCard(item, equippedBackgroundItemId = '') {
  const isOwned = item?.isOwned === true;
  const isEquipped =
    String(item?.itemId || '').trim() ===
    String(equippedBackgroundItemId || '').trim();

  const detailHref = getStoreItemDetailHref(item.itemId);

  const metaText = !isOwned
    ? '미보유 · 클릭하면 구매페이지로 이동'
    : isEquipped
      ? '현재 장착 중 · 클릭하면 해제'
      : '클릭해서 장착';

  return `
    <button
      type="button"
      class="profile-character-card profile-background-card ${isEquipped ? 'is-equipped' : ''} ${!isOwned ? 'is-locked' : ''}"
      data-profile-background-item-id="${escapeHtml(item.itemId)}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
    >
      <div class="profile-background-card__thumb">
        <img
          class="profile-background-card__image"
          src="${escapeHtml(item.thumbImagePath || item.pcImagePath || '')}"
          alt="${escapeHtml(item.name || '프로필배경')}"
        />
      </div>

      <div class="profile-character-card__name">
        ${escapeHtml(item.name || '프로필배경')}
      </div>

      <div class="profile-character-card__meta ${!isOwned ? 'is-locked' : ''}">
        ${metaText}
      </div>
    </button>
  `;
}

function renderProfileBackgroundSection({
  isOwnProfile = false,
  profileRow = null,
  ownedStoreItemIds = new Set(),
}) {
  applyProfileBackground(profileRow);

  const wrapEl = $('profileBackgroundWrap');
  const listEl = $('profileBackgroundList');

  if (!wrapEl || !listEl) return;

  wrapEl.hidden = !isOwnProfile;
  if (!isOwnProfile) return;

  const equippedBackgroundItemId = String(
    profileRow?.equipped_profile_background_item_id || '',
  ).trim();

  const rows = PROFILE_BACKGROUND_CATALOG.map((item) => ({
    ...item,
    isOwned: ownedStoreItemIds.has(item.itemId),
  })).sort(
    (a, b) => Number(a?.displayOrder || 999) - Number(b?.displayOrder || 999),
  );

  const sortedRows = sortEquippedItemFirst(
    rows,
    (item) =>
      String(item?.itemId || '').trim() ===
      String(equippedBackgroundItemId).trim(),
  );

  listEl.innerHTML = sortedRows
    .map((item) => renderProfileBackgroundCard(item, equippedBackgroundItemId))
    .join('');

  applyInventoryLimitByIds('profileBackgroundWrap', 'profileBackgroundList');

  Array.from(
    listEl.querySelectorAll('[data-profile-background-item-id]'),
  ).forEach((button) => {
    button.addEventListener('click', async () => {
      const isOwned = button.dataset.owned === 'true';
      const storeHref = String(button.dataset.storeHref || '').trim();
      const backgroundItemId = String(
        button.dataset.profileBackgroundItemId || '',
      ).trim();

      if (!isOwned) {
        if (storeHref) window.location.href = storeHref;
        return;
      }

      const isEquipped =
        backgroundItemId ===
        String(profileRow?.equipped_profile_background_item_id || '').trim();

      const nextBackgroundItemId = isEquipped ? null : backgroundItemId;

      setMsg(isEquipped ? '프로필배경 해제 중...' : '프로필배경 장착 중...');

      try {
        await updateProfileRow(profileRow.id, {
          equipped_profile_background_item_id: nextBackgroundItemId,
          updated_at: new Date().toISOString(),
        });

        profileRow = {
          ...profileRow,
          equipped_profile_background_item_id: nextBackgroundItemId,
        };

        applyProfileBackground(profileRow);

        renderProfileBackgroundSection({
          isOwnProfile,
          profileRow,
          ownedStoreItemIds,
        });

        setMsg(
          isEquipped ? '프로필배경 해제 완료!' : '프로필배경 장착 완료!',
          'green',
        );

        emitEquipmentChanged({
          userId: profileRow.id,
          source: 'profile-background',
          changed: ['profileBackground'],
        });

        window.dispatchEvent(new Event('auth-changed'));
      } catch (error) {
        console.error('[profile] equip profile background failed:', error);
        setMsg('프로필배경 저장 중 오류가 발생했어.', 'red');
      }
    });
  });
}

function setProfileFrameStyle(targetEl, frameItemId = '') {
  if (!targetEl) return;

  const frame = getProfileFrameByItemId(frameItemId);

  if (!frame) {
    targetEl.classList.remove('has-profile-frame');
    targetEl.style.removeProperty('--profile-frame-desktop');
    targetEl.style.removeProperty('--profile-frame-mobile');
    return;
  }

  targetEl.classList.add('has-profile-frame');
  targetEl.style.setProperty(
    '--profile-frame-desktop',
    `url("${frame.pcImagePath}")`,
  );
  targetEl.style.setProperty(
    '--profile-frame-mobile',
    `url("${frame.mobileImagePath || frame.pcImagePath}")`,
  );
}

function applyProfileFrame(profileRow = {}) {
  const equippedFrameItemId = String(
    profileRow?.equipped_profile_frame_item_id || '',
  ).trim();

  document.querySelectorAll('.profile-card').forEach((cardEl) => {
    if (cardEl.classList.contains('inventory-card')) return;
    setProfileFrameStyle(cardEl, equippedFrameItemId);
  });

  document
    .querySelectorAll('.inventory-profile-preview')
    .forEach((previewEl) => {
      setProfileFrameStyle(previewEl, equippedFrameItemId);
    });
}

function renderProfileFrameCard(item, equippedFrameItemId = '') {
  const isOwned = item?.isOwned === true;
  const isEquipped =
    String(item?.itemId || '').trim() ===
    String(equippedFrameItemId || '').trim();

  const detailHref = getStoreItemDetailHref(item.itemId);

  const metaText = !isOwned
    ? '미보유 · 클릭하면 구매페이지로 이동'
    : isEquipped
      ? '현재 장착 중 · 클릭하면 해제'
      : '클릭해서 장착';

  return `
    <button
      type="button"
      class="profile-character-card profile-frame-card ${isEquipped ? 'is-equipped' : ''} ${!isOwned ? 'is-locked' : ''}"
      data-profile-frame-item-id="${escapeHtml(item.itemId)}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
    >
      <div class="profile-background-card__thumb">
        <img
          class="profile-background-card__image"
          src="${escapeHtml(item.thumbImagePath || item.pcImagePath || '')}"
          alt="${escapeHtml(item.name || '프로필테두리')}"
        />
      </div>

      <div class="profile-character-card__name">
        ${escapeHtml(item.name || '프로필테두리')}
      </div>

      <div class="profile-character-card__meta ${!isOwned ? 'is-locked' : ''}">
        ${metaText}
      </div>
    </button>
  `;
}

function renderProfileFrameSection({
  isOwnProfile = false,
  profileRow = null,
  ownedStoreItemIds = new Set(),
}) {
  applyProfileFrame(profileRow);

  const wrapEl = $('profileFrameWrap');
  const listEl = $('profileFrameList');

  if (!wrapEl || !listEl) return;

  wrapEl.hidden = !isOwnProfile;
  if (!isOwnProfile) return;

  const equippedFrameItemId = String(
    profileRow?.equipped_profile_frame_item_id || '',
  ).trim();

  const rows = PROFILE_FRAME_CATALOG.map((item) => ({
    ...item,
    isOwned: ownedStoreItemIds.has(item.itemId),
  })).sort(
    (a, b) => Number(a?.displayOrder || 999) - Number(b?.displayOrder || 999),
  );

  const sortedRows = sortEquippedItemFirst(
    rows,
    (item) =>
      String(item?.itemId || '').trim() === String(equippedFrameItemId).trim(),
  );

  listEl.innerHTML = sortedRows
    .map((item) => renderProfileFrameCard(item, equippedFrameItemId))
    .join('');

  applyInventoryLimitByIds('profileFrameWrap', 'profileFrameList');

  Array.from(listEl.querySelectorAll('[data-profile-frame-item-id]')).forEach(
    (button) => {
      button.addEventListener('click', async () => {
        const isOwned = button.dataset.owned === 'true';
        const storeHref = String(button.dataset.storeHref || '').trim();
        const frameItemId = String(
          button.dataset.profileFrameItemId || '',
        ).trim();

        if (!isOwned) {
          if (storeHref) window.location.href = storeHref;
          return;
        }

        const isEquipped =
          frameItemId ===
          String(profileRow?.equipped_profile_frame_item_id || '').trim();

        const nextFrameItemId = isEquipped ? null : frameItemId;

        setMsg(
          isEquipped ? '프로필테두리 해제 중...' : '프로필테두리 장착 중...',
        );

        try {
          await updateProfileRow(profileRow.id, {
            equipped_profile_frame_item_id: nextFrameItemId,
            updated_at: new Date().toISOString(),
          });

          profileRow = {
            ...profileRow,
            equipped_profile_frame_item_id: nextFrameItemId,
          };

          applyProfileFrame(profileRow);

          renderProfileFrameSection({
            isOwnProfile,
            profileRow,
            ownedStoreItemIds,
          });

          setMsg(
            isEquipped ? '프로필테두리 해제 완료!' : '프로필테두리 장착 완료!',
            'green',
          );

          emitEquipmentChanged({
            userId: profileRow.id,
            source: 'profile-frame',
            changed: ['profileFrame'],
          });

          window.dispatchEvent(new Event('auth-changed'));
        } catch (error) {
          console.error('[profile] equip profile frame failed:', error);
          setMsg('프로필테두리 저장 중 오류가 발생했어.', 'red');
        }
      });
    },
  );
}

function renderBgmCard(track, selectedTrackIds = new Set()) {
  const isOwned = track?.is_owned !== false;
  const isSelected = selectedTrackIds.has(String(track?.id || '').trim());
  const detailHref = track?.storeItemId
    ? getStoreItemDetailHref(track.storeItemId)
    : '';

  const metaText = isOwned
    ? isSelected
      ? '선택됨 · 클릭하면 제외'
      : '클릭해서 선택'
    : '미보유 · 클릭하면 구매페이지로 이동';

  return `
    <button
      type="button"
      class="profile-character-card profile-bgm-card ${isSelected ? 'is-selected' : ''} ${!isOwned ? 'is-locked' : ''}"
      data-bgm-track-id="${escapeHtml(track?.id || '')}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
    >
      <div class="profile-bgm-card__thumb">
        <img
          class="profile-bgm-card__thumb-image"
          src="${escapeHtml(track?.coverPath || '')}"
          alt="${escapeHtml(track?.title || 'BGM')}"
        />
      </div>

      <div class="profile-character-card__name">
        ${escapeHtml(track?.title || 'BGM')}
      </div>

      <div class="profile-character-card__meta ${!isOwned ? 'is-locked' : ''}">
        ${metaText}
      </div>
    </button>
  `;
}

function renderBgmSection({
  isOwnProfile = false,
  ownedStoreItemIds = new Set(),
  currentUser = null,
  profileRow = null,
}) {
  const wrapEl = $('profileBgmWrap');
  const listEl = $('profileBgmList');

  if (!wrapEl || !listEl) return;

  wrapEl.hidden = !isOwnProfile;
  if (!isOwnProfile) return;

  const bgmRows = [...BGM_CATALOG]
    .map((track) => ({
      ...track,
      is_owned:
        !!track?.isDefault ||
        !track?.storeItemId ||
        ownedStoreItemIds.has(track.storeItemId),
    }))
    .sort(
      (a, b) => Number(a?.displayOrder || 0) - Number(b?.displayOrder || 0),
    );

  const ownedTrackIdSet = new Set(
    bgmRows
      .filter((track) => track?.is_owned)
      .map((track) => String(track?.id || '').trim())
      .filter(Boolean),
  );

  const bgmPreferenceUserId = String(
    currentUser?.id || profileRow?.id || '',
  ).trim();

  function getNormalizedSelectedTrackIds() {
    return new Set(
      [...getLocalSelectedBgmTrackIds()].filter((trackId) =>
        ownedTrackIdSet.has(trackId),
      ),
    );
  }

  function renderList() {
    const selectedTrackIds = getNormalizedSelectedTrackIds();

    const currentTrackId = String(getLocalCurrentBgmTrackId() || '').trim();

    const sortedBgmRows = sortEquippedItemFirst(bgmRows, (track) => {
      const trackId = String(track?.id || '').trim();

      return trackId === currentTrackId || selectedTrackIds.has(trackId);
    });

    listEl.innerHTML = sortedBgmRows
      .map((track) => renderBgmCard(track, selectedTrackIds))
      .join('');

    applyInventoryLimitByIds('profileBgmWrap', 'profileBgmList');

    Array.from(listEl.querySelectorAll('[data-bgm-track-id]')).forEach(
      (button) => {
        button.addEventListener('click', async () => {
          const isOwned = button.dataset.owned === 'true';
          const storeHref = String(button.dataset.storeHref || '').trim();
          const trackId = String(button.dataset.bgmTrackId || '').trim();

          if (!isOwned) {
            if (storeHref) window.location.href = storeHref;
            return;
          }

          if (!trackId) return;

          const nextSelectedTrackIds = getNormalizedSelectedTrackIds();
          const wasSelected = nextSelectedTrackIds.has(trackId);

          if (wasSelected) {
            nextSelectedTrackIds.delete(trackId);
          } else {
            nextSelectedTrackIds.add(trackId);
          }

          const nextIds = [...nextSelectedTrackIds];
          const nextCurrentTrackId = syncLocalCurrentBgmTrackSelection(nextIds);

          try {
            await saveRemoteBgmPreferences(bgmPreferenceUserId, {
              selectedTrackIds: nextIds,
              currentTrackId: nextCurrentTrackId,
            });

            renderList();

            setMsg(
              wasSelected ? 'BGM 선택 해제 완료!' : 'BGM 선택 완료!',
              'green',
            );

            emitEquipmentChanged({
              userId: bgmPreferenceUserId,
              source: 'profile-bgm',
              changed: ['bgm'],
            });

            window.dispatchEvent(new Event('bgm-selection-changed'));
          } catch (error) {
            console.error('[profile] save bgm preferences failed:', error);
            setMsg('BGM 선택 저장 중 오류가 발생했어.', 'red');
          }
        });
      },
    );
  }

  renderList();
}

function shouldAutoScrollToBgmInventory() {
  const hash = decodeURIComponent(
    String(window.location.hash || '').replace('#', ''),
  );
  const params = new URLSearchParams(window.location.search);
  const section = String(params.get('section') || '')
    .trim()
    .toLowerCase();

  return (
    hash === 'bgm-inventory' || section === 'bgm' || section === 'bgm-inventory'
  );
}

function scrollToBgmInventorySection() {
  const target =
    document.getElementById('bgm-inventory') ||
    document.getElementById('profileBgmWrap');

  if (!target) return;

  const scroll = () => {
    target.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  };

  requestAnimationFrame(() => {
    window.setTimeout(scroll, 80);
  });

  window.setTimeout(scroll, 350);
}

function renderCharacterSection({
  profileRow,
  characterRows = [],
  skinRows = [],
  isOwnProfile = false,
}) {
  const sectionEl = $('profileCharacterSection');
  const titleEl = $('profileCharacterTitle');
  const previewEl = $('profileCharacterImage');
  const characterWrapEl = $('profileCharacterCharacterWrap');
  const characterListEl = $('profileCharacterList');
  const skinWrapEl = $('profileCharacterSkinWrap');
  const skinTitleEl = $('profileCharacterSkinTitle');
  const skinListEl = $('profileCharacterSkinList');
  const ownedOnlyToggleEl = $('profileOwnedOnlyToggle');

  if (!sectionEl || !previewEl) return;

  const safeCharacterRows = getSafeCharacterRows(characterRows);
  const safeSkinRows = getSafeSkinRows(skinRows, safeCharacterRows);

  if (!isOwnProfile) {
    const publicEquippedImageUrl = getCharacterImageSrc(
      profileRow?.equipped_character_image_url,
    );

    previewEl.src = publicEquippedImageUrl;
    previewEl.alt = '이용자 캐릭터';

    if (titleEl) {
      titleEl.textContent = '캐릭터';
    }

    if (characterWrapEl) {
      characterWrapEl.hidden = true;
    }

    if (skinWrapEl) {
      skinWrapEl.hidden = true;
    }

    renderEquippedCharacterEffectOnPreview(
      profileRow?.equipped_character_effect_item_id,
    );

    return;
  }

  function getEquippedImageUrl() {
    return getNormalizedEquippedImageUrl({
      characterRows: safeCharacterRows,
      skinRows: safeSkinRows,
      equippedImageUrl: profileRow?.equipped_character_image_url,
    });
  }

  let selectedCharacterCode = getEquippedCharacterCode({
    characterRows: safeCharacterRows,
    skinRows: safeSkinRows,
    equippedImageUrl: getEquippedImageUrl(),
  });

  const normalizedEquippedImageUrl = getEquippedImageUrl();

  if (
    isOwnProfile &&
    profileRow?.id &&
    getCharacterImageSrc(profileRow?.equipped_character_image_url) !==
      normalizedEquippedImageUrl
  ) {
    updateProfileRow(profileRow.id, {
      equipped_character_image_url: normalizedEquippedImageUrl,
      updated_at: new Date().toISOString(),
    })
      .then(() => {
        profileRow = {
          ...profileRow,
          equipped_character_image_url: normalizedEquippedImageUrl,
        };
      })
      .catch((error) => {
        console.error('[profile] normalize equipped character failed:', error);
      });
  }

  previewEl.src = getEquippedImageUrl();
  previewEl.alt = isOwnProfile ? '내 캐릭터' : '이용자 캐릭터';

  if (titleEl) {
    titleEl.textContent = isOwnProfile ? '내 캐릭터' : '캐릭터';
  }

  if (characterWrapEl) {
    characterWrapEl.hidden = !isOwnProfile;
  }

  if (skinWrapEl) {
    skinWrapEl.hidden = !isOwnProfile;
  }

  if (!isOwnProfile || !characterListEl || !skinListEl) return;
  let ownedOnly = false;

  if (ownedOnlyToggleEl) {
    ownedOnlyToggleEl.checked = false;
  }

  function getSelectedCharacter() {
    return (
      safeCharacterRows.find(
        (row) =>
          normalizeCharacterCode(row?.character_code) === selectedCharacterCode,
      ) || safeCharacterRows[0]
    );
  }

  function getPreviewImageForCharacter(characterCode) {
    const safeCode = normalizeCharacterCode(characterCode);
    const equippedImageUrl = getEquippedImageUrl();

    const equippedCharacterCode = getEquippedCharacterCode({
      characterRows: safeCharacterRows,
      skinRows: safeSkinRows,
      equippedImageUrl,
    });

    if (safeCode === equippedCharacterCode) {
      return equippedImageUrl;
    }

    const characterRow = safeCharacterRows.find(
      (row) => normalizeCharacterCode(row?.character_code) === safeCode,
    );

    if (characterRow?.preview_image_path) {
      return getCharacterImageSrc(characterRow.preview_image_path);
    }

    if (characterRow?.base_image_path) {
      return getCharacterImageSrc(characterRow.base_image_path);
    }

    const firstSkin = safeSkinRows.find(
      (row) => normalizeCharacterCode(row?.character_code) === safeCode,
    );

    return getCharacterImageSrc(
      firstSkin?.image_path || DEFAULT_CHARACTER_IMAGE,
    );
  }

  async function equipCharacterSkin(imagePath, skinName) {
    const nextImagePath = getCharacterImageSrc(imagePath);

    if (nextImagePath === getEquippedImageUrl()) {
      setMsg('이미 착용 중인 캐릭터야.');
      return;
    }

    setMsg('캐릭터 적용 중...');

    try {
      await updateProfileRow(profileRow.id, {
        equipped_character_image_url: nextImagePath,
        updated_at: new Date().toISOString(),
      });

      profileRow = {
        ...profileRow,
        equipped_character_image_url: nextImagePath,
      };

      previewEl.src = nextImagePath;
      renderOwnCharacterInventory();
      setMsg(`${skinName || '캐릭터'} 착용 완료!`, 'green');

      emitEquipmentChanged({
        userId: profileRow.id,
        source: 'profile-character',
        changed: ['character', 'skin'],
      });

      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('[profile] equip character failed:', error);
      setMsg('캐릭터 적용 중 오류가 발생했어.', 'red');
    }
  }

  function getDefaultSkinForCharacter(characterCode) {
    const safeCode = normalizeCharacterCode(characterCode);

    const sameCharacterSkins = safeSkinRows.filter(
      (item) => normalizeCharacterCode(item?.character_code) === safeCode,
    );

    const ownedEquippableSkins = sameCharacterSkins.filter(
      (item) => item?.is_owned !== false && item?.is_parent_owned !== false,
    );

    if (!ownedEquippableSkins.length) return null;

    const exactDefaultSkin =
      safeCode === DEFAULT_CHARACTER_CODE
        ? ownedEquippableSkins.find(
            (item) =>
              String(item?.skin_code || '').trim() === DEFAULT_SKIN_CODE,
          )
        : null;

    const basicSkin = ownedEquippableSkins.find((item) =>
      String(item?.skin_code || '')
        .trim()
        .endsWith('-basic'),
    );

    return exactDefaultSkin || basicSkin || ownedEquippableSkins[0] || null;
  }

  async function equipDefaultSkinForCharacter(characterCode) {
    const safeCode = normalizeCharacterCode(characterCode);

    selectedCharacterCode = safeCode;

    const selectedCharacter =
      safeCharacterRows.find(
        (row) => normalizeCharacterCode(row?.character_code) === safeCode,
      ) || safeCharacterRows[0];

    const selectedCharacterName =
      selectedCharacter?.character_name || DEFAULT_CHARACTER_NAME;

    const defaultSkin = getDefaultSkinForCharacter(safeCode);

    if (!defaultSkin) {
      renderOwnCharacterInventory();
      setMsg(`${selectedCharacterName}의 보유 중인 기본 스킨이 없어.`);
      return;
    }

    await equipCharacterSkin(
      defaultSkin.image_path,
      defaultSkin.skin_name || selectedCharacterName,
    );
  }

  function bindCharacterEvents() {
    const buttons = Array.from(
      characterListEl.querySelectorAll('[data-character-code]'),
    );

    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        const isOwned = button.dataset.owned === 'true';
        const storeHref = String(button.dataset.storeHref || '').trim();

        if (!isOwned) {
          if (storeHref) window.location.href = storeHref;
          return;
        }

        const nextCode = normalizeCharacterCode(button.dataset.characterCode);

        await equipDefaultSkinForCharacter(nextCode);
      });
    });
  }

  function bindSkinEvents() {
    const buttons = Array.from(
      skinListEl.querySelectorAll('[data-skin-image-path]'),
    );

    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        const isOwned = button.dataset.owned === 'true';
        const canEquip = button.dataset.canEquip === 'true';
        const storeHref = String(button.dataset.storeHref || '').trim();
        const requiredStoreHref = String(
          button.dataset.requiredStoreHref || '',
        ).trim();
        const requiredCharacterName = String(
          button.dataset.requiredCharacterName || '',
        ).trim();

        if (!isOwned) {
          if (storeHref) window.location.href = storeHref;
          return;
        }

        if (!canEquip) {
          if (requiredStoreHref) {
            window.location.href = requiredStoreHref;
            return;
          }

          setMsg(
            requiredCharacterName
              ? `${requiredCharacterName}를 먼저 구매해야 착용할 수 있어.`
              : '기본 캐릭터를 먼저 구매해야 착용할 수 있어.',
            'red',
          );
          return;
        }

        const imagePath = button.dataset.skinImagePath || '';
        const skinName = button.dataset.skinName || '캐릭터';
        await equipCharacterSkin(imagePath, skinName);
      });
    });
  }

  function renderOwnCharacterInventory() {
    const equippedImageUrl = getEquippedImageUrl();

    const equippedCharacterCode = getEquippedCharacterCode({
      characterRows: safeCharacterRows,
      skinRows: safeSkinRows,
      equippedImageUrl,
    });

    const selectedCharacter = getSelectedCharacter();
    const selectedCharacterName =
      selectedCharacter?.character_name || DEFAULT_CHARACTER_NAME;

    previewEl.src = getPreviewImageForCharacter(selectedCharacterCode);
    previewEl.alt = `${selectedCharacterName} 미리보기`;

    const visibleCharacterRows = ownedOnly
      ? safeCharacterRows.filter((item) => item?.is_owned !== false)
      : safeCharacterRows;

    if (
      !visibleCharacterRows.some(
        (item) =>
          normalizeCharacterCode(item?.character_code) ===
          selectedCharacterCode,
      )
    ) {
      const firstOwnedCharacter =
        visibleCharacterRows.find((item) => item?.is_owned !== false) ||
        visibleCharacterRows[0] ||
        safeCharacterRows[0];

      selectedCharacterCode = normalizeCharacterCode(
        firstOwnedCharacter?.character_code,
      );
    }

    const sortedCharacterRows = sortEquippedItemFirst(
      visibleCharacterRows,
      (item) =>
        normalizeCharacterCode(item?.character_code) === equippedCharacterCode,
    );

    characterListEl.innerHTML = sortedCharacterRows
      .map((item) =>
        renderOwnedCharacterCard(item, {
          isSelected:
            normalizeCharacterCode(item?.character_code) ===
            selectedCharacterCode,
          isEquipped:
            normalizeCharacterCode(item?.character_code) ===
            equippedCharacterCode,
        }),
      )
      .join('');

    applyInventoryLimitByIds(
      'profileCharacterCharacterWrap',
      'profileCharacterList',
    );

    const filteredSkins = safeSkinRows.filter((item) => {
      const isSameCharacter =
        normalizeCharacterCode(item?.character_code) === selectedCharacterCode;

      if (!isSameCharacter) return false;
      if (ownedOnly && item?.is_owned === false) return false;
      return true;
    });

    if (skinTitleEl) {
      skinTitleEl.textContent = `${selectedCharacterName} 스킨`;
    }

    if (!filteredSkins.length) {
      skinListEl.innerHTML = `
    <div class="profile-character-empty">
      ${
        ownedOnly
          ? '보유 중인 스킨이 없어.'
          : '아직 이 캐릭터에 표시할 스킨이 없어.'
      }
    </div>
  `;
    } else {
      const sortedSkins = sortEquippedItemFirst(
        filteredSkins,
        (item) =>
          getCharacterImageSrc(item?.image_path) ===
          getCharacterImageSrc(equippedImageUrl),
      );

      skinListEl.innerHTML = sortedSkins
        .map((item) => renderCharacterSkinCard(item, equippedImageUrl))
        .join('');
    }

    applyInventoryLimitByIds(
      'profileCharacterSkinWrap',
      'profileCharacterSkinList',
    );

    bindCharacterEvents();
    bindSkinEvents();
  }

  ownedOnlyToggleEl?.addEventListener('change', () => {
    ownedOnly = !!ownedOnlyToggleEl.checked;
    renderOwnCharacterInventory();
  });
  renderOwnCharacterInventory();
}

async function loadCommentsWithPostsByAuthorId(userId) {
  const { data: comments, error } = await supabase
    .from('post_comments')
    .select('id, post_id, body, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const postIds = Array.from(
    new Set(
      (comments || []).map((item) => Number(item.post_id)).filter(Boolean),
    ),
  );

  let postRows = [];
  if (postIds.length) {
    const { data, error: postError } = await supabase
      .from('posts')
      .select('id, title, category, is_private')
      .in('id', postIds);

    if (postError) throw postError;
    postRows = data || [];
  }

  return {
    comments: comments || [],
    postMap: new Map(postRows.map((post) => [Number(post.id), post])),
  };
}

async function uploadProfileImage(user, file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeExt = String(ext || 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;
  const path = `${user.id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

async function updateProfileRow(userId, patch) {
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);

  if (error) throw error;
}

function applyProfileModeUI({
  pageName = 'profile',
  isOwnProfile,
  nickname,
  bio = '',
  currentUser,
  profileRow,
}) {
  const isSettingPage = pageName === 'profile-setting';

  const eyebrowEl = $('profileEyebrow');
  const nicknameText = $('profileNicknameText');
  const emailText = $('profileEmailText');
  const descEl = $('profileDesc');
  const form = $('profileForm');
  const formTitle = $('profileFormTitle');
  const postsTitle = $('profilePostsTitle');
  const commentsTitle = $('profileCommentsTitle');
  const avatar = $('profileAvatar');
  const characterSection = $('profileCharacterSection');
  const inventoryWrap = $('profileCharacterInventoryWrap');
  const profileSettingLink = $('profileSettingLink');
  const profileHistoryLink = $('profileHistoryLink');
  const profileInventoryLink = $('profileInventoryLink');

  if (characterSection) {
    characterSection.hidden = false;
  }

  if (inventoryWrap) {
    inventoryWrap.hidden = !isOwnProfile;
  }

  const safeBio = normalizeProfileBio(bio, { preserveLineBreaks: true });

  if (eyebrowEl) {
    if (isSettingPage) {
      eyebrowEl.textContent = '프로필 설정';
      eyebrowEl.hidden = false;
    } else {
      eyebrowEl.textContent = '';
      eyebrowEl.hidden = true;
    }
  }

  if (nicknameText) {
    nicknameText.textContent = nickname || '회원';
  }

  if (emailText) {
    if (isSettingPage && isOwnProfile) {
      emailText.textContent = currentUser?.email || profileRow?.email || '-';
      emailText.hidden = false;
    } else {
      emailText.textContent = '';
      emailText.hidden = true;
    }
  }

  if (descEl) {
    if (isSettingPage) {
      descEl.textContent =
        '여기서 프로필 사진, 닉네임, 자기소개를 변경할 수 있어.';
      descEl.hidden = false;
    } else if (isOwnProfile) {
      descEl.textContent = safeBio || getOwnProfileBioPlaceholder();
      descEl.hidden = false;
    } else if (safeBio) {
      descEl.textContent = safeBio;
      descEl.hidden = false;
    } else {
      descEl.textContent = '';
      descEl.hidden = true;
    }
  }

  if (form) {
    form.hidden = !isOwnProfile;
  }

  if (formTitle) {
    formTitle.textContent = '프로필 설정';
  }

  if (postsTitle) {
    postsTitle.textContent = isOwnProfile ? '내가 쓴 글' : '작성한 글';
  }

  if (commentsTitle) {
    commentsTitle.textContent = isOwnProfile
      ? '내가 쓴 댓글/답글'
      : '작성한 댓글/답글';
  }

  if (avatar) {
    avatar.src = getProfileImageSrc(profileRow?.profile_image_url);
  }

  if (profileSettingLink) {
    profileSettingLink.hidden = !isOwnProfile || isSettingPage;
  }

  if (profileHistoryLink) {
    profileHistoryLink.hidden = !isOwnProfile || isSettingPage;
  }

  if (profileInventoryLink) {
    profileInventoryLink.hidden = !isOwnProfile || isSettingPage;
  }
}

function renderProfileNotFound() {
  const nicknameText = $('profileNicknameText');
  const emailText = $('profileEmailText');
  const descEl = $('profileDesc');
  const form = $('profileForm');
  const postList = $('profilePostList');
  const commentList = $('profileCommentList');
  const avatar = $('profileAvatar');
  const characterSection = $('profileCharacterSection');

  if (nicknameText) nicknameText.textContent = '프로필을 찾을 수 없어';
  if (emailText) emailText.textContent = '-';
  if (descEl) {
    descEl.textContent = '존재하지 않거나 볼 수 없는 이용자 프로필이야.';
  }
  if (form) form.hidden = true;
  if (avatar) avatar.src = DEFAULT_PROFILE_IMAGE;
  if (characterSection) characterSection.hidden = true;

  if (postList) {
    postList.innerHTML = `<div class="empty">작성한 글을 불러올 수 없어.</div>`;
  }
  if (commentList) {
    commentList.innerHTML = `<div class="empty">작성한 댓글을 불러올 수 없어.</div>`;
  }
}

export async function initProfile() {
  const pageName = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  const isInventoryPage = pageName === 'inventory';
  const isProfileSettingPage = pageName === 'profile-setting';

  if (!['profile', 'profile-setting', 'inventory'].includes(pageName)) return;

  const currentUser = await getCurrentUser();
  const targetUserIdFromUrl =
    isInventoryPage || isProfileSettingPage ? '' : getTargetUserIdFromUrl();

  if (!targetUserIdFromUrl && !currentUser) {
    window.location.href = loginHref();
    return;
  }

  if ((isInventoryPage || isProfileSettingPage) && !currentUser) {
    window.location.href = loginHref();
    return;
  }

  const targetUserId =
    isInventoryPage || isProfileSettingPage
      ? currentUser?.id || ''
      : targetUserIdFromUrl || currentUser?.id || '';

  const isOwnProfile =
    !!currentUser &&
    !!targetUserId &&
    String(currentUser.id) === String(targetUserId);

  const nicknameInput = $('profileNickname');
  const bioInput = $('profileBio');
  const avatar = $('profileAvatar');
  const imageFileInput = $('profileImageFile');
  const resetImageBtn = $('profileResetImageBtn');

  let profileRow = null;
  let pickleEntries = [];
  let pendingDefaultImage = false;

  try {
    profileRow = isOwnProfile
      ? await loadProfileRow(targetUserId)
      : await loadPublicProfileRow(targetUserId);
  } catch (error) {
    console.error('[profile] load profile failed:', error);
  }

  if (!profileRow) {
    renderProfileNotFound();
    return;
  }

  if (isOwnProfile) {
    try {
      applyBgmPreferencesToLocal(getBgmPreferencesFromProfileRow(profileRow));
    } catch (error) {
      console.error('[profile] apply remote bgm preferences failed:', error);
    }
  }

  const currentNickname =
    profileRow?.nickname ||
    currentUser?.user_metadata?.nickname ||
    currentUser?.user_metadata?.display_name ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '회원');

  const currentBio = normalizeProfileBio(profileRow?.bio, {
    preserveLineBreaks: true,
  });

  applyProfileModeUI({
    pageName,
    isOwnProfile,
    nickname: currentNickname,
    bio: currentBio,
    currentUser,
    profileRow,
  });
  let characterRows = [];
  let characterSkinRows = [];
  let ownedStoreItemIds = new Set();

  if (isOwnProfile) {
    try {
      characterRows = await loadOwnedCharacters(targetUserId);
    } catch (error) {
      console.error('[profile] load owned characters failed:', error);
    }

    try {
      characterSkinRows = await loadCharacterInventory(targetUserId);
    } catch (error) {
      console.error('[profile] load character skins failed:', error);
    }

    try {
      ownedStoreItemIds = await loadOwnedStoreItemIdsByUserId(targetUserId);
    } catch (error) {
      console.error('[profile] load owned store items failed:', error);
    }
  }

  if (isOwnProfile) {
    try {
      pickleEntries = await loadPickleLedger(targetUserId);
    } catch (error) {
      console.error('[profile] load pickle ledger failed:', error);
    }
  }

  renderCharacterSection({
    profileRow,
    characterRows,
    skinRows: characterSkinRows,
    isOwnProfile,
  });

  renderCharacterEffectSection({
    isOwnProfile,
    profileRow,
    ownedStoreItemIds,
  });

  renderProfileBackgroundSection({
    isOwnProfile,
    profileRow,
    ownedStoreItemIds,
  });

  renderProfileFrameSection({
    isOwnProfile,
    profileRow,
    ownedStoreItemIds,
  });

  renderBgmSection({
    isOwnProfile,
    ownedStoreItemIds,
    currentUser,
    profileRow,
  });

  refreshInventoryLimits();
  scrollInventoryHashTargetOnce();

  if (isInventoryPage && shouldAutoScrollToBgmInventory()) {
    scrollToBgmInventorySection();
  }

  if (isOwnProfile && nicknameInput) {
    nicknameInput.value = currentNickname;
  }

  if (isOwnProfile && bioInput) {
    bioInput.value = currentBio;
  }
  updatePickleSummary(profileRow?.pickles || 0, isOwnProfile);

  // 피클 버튼/팝업은 공통 헤더 모듈(pickle-status.js)에서 처리

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });

  if (isOwnProfile) {
    resetImageBtn?.addEventListener('click', () => {
      pendingDefaultImage = true;
      if (imageFileInput) imageFileInput.value = '';
      if (avatar) avatar.src = DEFAULT_PROFILE_IMAGE;
      setMsg('기본 이미지로 변경할 준비가 됐어. 저장 버튼을 눌러줘.');
    });

    imageFileInput?.addEventListener('change', () => {
      pendingDefaultImage = false;

      const file = imageFileInput.files?.[0];
      if (!file) return;

      if (file.size > PROFILE_IMAGE_MAX_BYTES) {
        setMsg('프로필 사진은 5MB 이하만 올릴 수 있어.', 'red');
        imageFileInput.value = '';
        return;
      }

      if (!file.type.startsWith('image/')) {
        setMsg('이미지 파일만 올릴 수 있어.', 'red');
        imageFileInput.value = '';
        return;
      }

      if (avatar) {
        avatar.src = URL.createObjectURL(file);
      }
      renderCharacterSection({
        profileRow,
        inventoryRows: [],
        isOwnProfile,
      });
    });

    const form = $('profileForm');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nickname = nicknameInput?.value?.trim() || '';
      const bio = normalizeProfileBio(bioInput?.value, {
        preserveLineBreaks: true,
      });
      const file = imageFileInput?.files?.[0] || null;

      if (!isValidNickname(nickname)) {
        setMsg('닉네임은 2글자 이상 입력해줘.', 'red');
        nicknameInput?.focus();
        return;
      }

      if (file && file.size > PROFILE_IMAGE_MAX_BYTES) {
        setMsg('프로필 사진은 5MB 이하만 올릴 수 있어.', 'red');
        return;
      }

      setMsg('프로필 저장 중...');

      try {
        const currentMetaNickname =
          currentUser?.user_metadata?.nickname ||
          currentUser?.user_metadata?.display_name ||
          '';

        if (nickname !== currentMetaNickname) {
          const { error: metaError } = await supabase.auth.updateUser({
            data: {
              ...(currentUser?.user_metadata || {}),
              nickname,
            },
          });

          if (metaError) throw metaError;
        }

        const patch = {
          nickname,
          bio: bio || null,
          updated_at: new Date().toISOString(),
        };

        if (pendingDefaultImage) {
          patch.profile_image_url = null;
        } else if (file) {
          const uploadedUrl = await uploadProfileImage(currentUser, file);
          patch.profile_image_url = uploadedUrl;
        }

        await updateProfileRow(currentUser.id, patch);

        profileRow = {
          ...profileRow,
          ...patch,
        };

        applyProfileModeUI({
          pageName,
          isOwnProfile: true,
          nickname,
          bio: profileRow?.bio || '',
          currentUser,
          profileRow,
        });

        if (imageFileInput) imageFileInput.value = '';
        if (bioInput) {
          bioInput.value = normalizeProfileBio(profileRow?.bio, {
            preserveLineBreaks: true,
          });
        }
        pendingDefaultImage = false;

        setMsg('프로필 저장 완료!', 'green');
        window.dispatchEvent(new Event('auth-changed'));
      } catch (error) {
        console.error('[profile] save failed:', error);
        setMsg('프로필 저장 중 오류가 발생했어.', 'red');
      }
    });
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
