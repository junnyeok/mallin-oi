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
    getStoreItemDetailHref,
  },
] = await Promise.all([
  import(`./emoticons.js?v=${MODULE_VERSION}`),
  import(`./store-data.js?v=${MODULE_VERSION}`),
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
  commentEl.textContent = `${todayCommentCount} / 20`;
}

function updatePickleSummary(balance = 0, isVisible = false) {
  const heroPickleEl = $('profileHeroPickle');
  const sectionEl = $('profilePickleSection');
  const balanceEl = $('profilePickleBalance');

  if (balanceEl) {
    balanceEl.textContent = formatPickleAmount(balance);
  }

  if (heroPickleEl) {
    heroPickleEl.hidden = !isVisible;
    heroPickleEl.textContent = `보유 피클 ${formatPickleAmount(balance)}`;
  }

  if (sectionEl) {
    sectionEl.hidden = !isVisible;
  }
}

function renderPickleRow(entry) {
  const amount = Number(entry?.amount || 0);
  const amountText = amount > 0 ? `+${amount} 피클` : `${amount} 피클`;
  const reasonLabel = entry?.reason_label || '피클 획득';
  const description = entry?.description || '';

  return `
    <div class="profile-row profile-row--pickle">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(reasonLabel)}</div>
        <div class="profile-row__body">${escapeHtml(
          description || '피클 내역이야.',
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
      'id, nickname, email, profile_image_url, pickles, equipped_character_image_url, bgm_selected_track_ids, bgm_current_track_id',
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
      'id, nickname, profile_image_url, equipped_character_image_url, created_at, updated_at',
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

function getSafeCharacterRows(characterRows = [], skinRows = []) {
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
      is_owned: code === DEFAULT_CHARACTER_CODE ? true : false,
      store_item_id: item?.store_item_id || null,
    };
  });

  (skinRows || []).forEach((row) => {
    const code = normalizeCharacterCode(row?.character_code);
    if (
      merged.some(
        (item) => normalizeCharacterCode(item.character_code) === code,
      )
    ) {
      return;
    }

    merged.push({
      character_code: code,
      character_name:
        code === DEFAULT_CHARACTER_CODE ? DEFAULT_CHARACTER_NAME : '캐릭터',
      base_image_path: getCharacterImageSrc(row?.image_path),
      preview_image_path: getCharacterImageSrc(row?.image_path),
      display_order: 999,
      is_owned: true,
      store_item_id: null,
    });
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

function getSafeSkinRows(skinRows = []) {
  const ownedMap = new Map(
    (skinRows || []).map((row) => [
      String(row?.skin_code || '').trim() || DEFAULT_SKIN_CODE,
      {
        ...row,
        character_code: normalizeCharacterCode(row?.character_code),
        skin_code: String(row?.skin_code || '').trim() || DEFAULT_SKIN_CODE,
        skin_name: String(row?.skin_name || '').trim() || DEFAULT_SKIN_NAME,
        image_path: getCharacterImageSrc(row?.image_path),
        is_owned: true,
        store_item_id: null,
      },
    ]),
  );

  const merged = CHARACTER_SKIN_CATALOG.map((item) => {
    const skinCode = String(item?.skin_code || '').trim() || DEFAULT_SKIN_CODE;
    const owned = ownedMap.get(skinCode);

    if (owned) {
      return {
        ...item,
        ...owned,
        is_owned: true,
        store_item_id: item?.store_item_id || null,
      };
    }

    return {
      character_code: normalizeCharacterCode(item?.character_code),
      skin_code: skinCode,
      skin_name: String(item?.skin_name || '').trim() || DEFAULT_SKIN_NAME,
      image_path: getCharacterImageSrc(item?.image_path),
      display_order: Number(item?.display_order || 999),
      is_owned: skinCode === DEFAULT_SKIN_CODE ? true : false,
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

    merged.push({
      character_code: normalizeCharacterCode(row?.character_code),
      skin_code: skinCode,
      skin_name: String(row?.skin_name || '').trim() || DEFAULT_SKIN_NAME,
      image_path: getCharacterImageSrc(row?.image_path),
      display_order: Number(row?.display_order || 999),
      is_owned: true,
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

function getEquippedCharacterCode({
  characterRows = [],
  skinRows = [],
  equippedImageUrl = '',
}) {
  const safeEquippedImageUrl = getCharacterImageSrc(equippedImageUrl);

  const matchedSkin = skinRows.find(
    (row) => getCharacterImageSrc(row?.image_path) === safeEquippedImageUrl,
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
  const storeItemId = String(item?.store_item_id || '').trim();
  const detailHref = storeItemId ? getStoreItemDetailHref(storeItemId) : '';
  const metaText = isOwned
    ? isEquipped
      ? '현재 착용 중'
      : '클릭해서 착용'
    : '미보유 · 클릭하면 구매페이지로 이동';
  const extraMetaClass = isOwned ? '' : ' is-locked';

  return `
    <button
      type="button"
      class="profile-character-card ${isEquipped ? 'is-equipped' : ''} ${
        !isOwned ? 'is-locked' : ''
      }"
      data-skin-image-path="${escapeHtml(imagePath)}"
      data-skin-name="${escapeHtml(item?.skin_name || '스킨')}"
      data-owned="${isOwned ? 'true' : 'false'}"
      data-store-href="${escapeHtml(detailHref)}"
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

    listEl.innerHTML = bgmRows
      .map((track) => renderBgmCard(track, selectedTrackIds))
      .join('');

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

  const safeCharacterRows = getSafeCharacterRows(characterRows, skinRows);
  const safeSkinRows = getSafeSkinRows(skinRows);

  function getEquippedImageUrl() {
    return getCharacterImageSrc(profileRow?.equipped_character_image_url);
  }

  let selectedCharacterCode = getEquippedCharacterCode({
    characterRows: safeCharacterRows,
    skinRows: safeSkinRows,
    equippedImageUrl: getEquippedImageUrl(),
  });

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
      window.dispatchEvent(new Event('auth-changed'));
    } catch (error) {
      console.error('[profile] equip character failed:', error);
      setMsg('캐릭터 적용 중 오류가 발생했어.', 'red');
    }
  }

  function bindCharacterEvents() {
    const buttons = Array.from(
      characterListEl.querySelectorAll('[data-character-code]'),
    );

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const isOwned = button.dataset.owned === 'true';
        const storeHref = String(button.dataset.storeHref || '').trim();

        if (!isOwned) {
          if (storeHref) window.location.href = storeHref;
          return;
        }

        const nextCode = normalizeCharacterCode(button.dataset.characterCode);

        if (nextCode === selectedCharacterCode) return;

        selectedCharacterCode = nextCode;
        renderOwnCharacterInventory();
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
        const storeHref = String(button.dataset.storeHref || '').trim();

        if (!isOwned) {
          if (storeHref) window.location.href = storeHref;
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

    characterListEl.innerHTML = visibleCharacterRows
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
      skinListEl.innerHTML = filteredSkins
        .map((item) => renderCharacterSkinCard(item, equippedImageUrl))
        .join('');
    }

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
  isOwnProfile,
  nickname,
  currentUser,
  profileRow,
}) {
  const eyebrowEl = $('profileEyebrow');
  const nicknameText = $('profileNicknameText');
  const emailText = $('profileEmailText');
  const descEl = $('profileDesc');
  const form = $('profileForm');
  const formTitle = $('profileFormTitle');
  const postsTitle = $('profilePostsTitle');
  const commentsTitle = $('profileCommentsTitle');
  const avatar = $('profileAvatar');
  const heroPickleEl = $('profileHeroPickle');
  const pickleSection = $('profilePickleSection');
  const characterSection = $('profileCharacterSection');
  const inventoryWrap = $('profileCharacterInventoryWrap');

  if (heroPickleEl) {
    heroPickleEl.hidden = !isOwnProfile;
  }

  if (pickleSection) {
    pickleSection.hidden = !isOwnProfile;
  }

  if (characterSection) {
    characterSection.hidden = false;
  }

  if (inventoryWrap) {
    inventoryWrap.hidden = !isOwnProfile;
  }

  if (eyebrowEl) {
    eyebrowEl.textContent = isOwnProfile ? '내프로필' : '이용자 프로필';
  }

  if (nicknameText) {
    nicknameText.textContent = nickname || '회원';
  }

  if (emailText) {
    emailText.textContent = isOwnProfile
      ? currentUser?.email || profileRow?.email || '-'
      : '다른 이용자의 공개 프로필이야.';
  }

  if (descEl) {
    descEl.textContent = isOwnProfile
      ? '여기서는 프로필 사진, 닉네임, 내가 쓴 글/댓글을 한 번에 볼 수 있어.'
      : '여기서는 이 이용자가 작성한 글과 댓글을 볼 수 있어.';
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
}

function renderProfileNotFound() {
  const nicknameText = $('profileNicknameText');
  const emailText = $('profileEmailText');
  const descEl = $('profileDesc');
  const form = $('profileForm');
  const postList = $('profilePostList');
  const commentList = $('profileCommentList');
  const avatar = $('profileAvatar');
  const heroPickleEl = $('profileHeroPickle');
  const pickleSection = $('profilePickleSection');
  const characterSection = $('profileCharacterSection');

  if (nicknameText) nicknameText.textContent = '프로필을 찾을 수 없어';
  if (emailText) emailText.textContent = '-';
  if (descEl) {
    descEl.textContent = '존재하지 않거나 볼 수 없는 이용자 프로필이야.';
  }
  if (form) form.hidden = true;
  if (avatar) avatar.src = DEFAULT_PROFILE_IMAGE;
  if (heroPickleEl) heroPickleEl.hidden = true;
  if (pickleSection) pickleSection.hidden = true;
  if (characterSection) characterSection.hidden = true;

  if (postList) {
    postList.innerHTML = `<div class="empty">작성한 글을 불러올 수 없어.</div>`;
  }
  if (commentList) {
    commentList.innerHTML = `<div class="empty">작성한 댓글을 불러올 수 없어.</div>`;
  }
}

export async function initProfile() {
  if (document.body?.dataset?.page !== 'profile') return;

  const currentUser = await getCurrentUser();
  const targetUserIdFromUrl = getTargetUserIdFromUrl();

  if (!targetUserIdFromUrl && !currentUser) {
    window.location.href = loginHref();
    return;
  }

  const targetUserId = targetUserIdFromUrl || currentUser?.id || '';
  const isOwnProfile =
    !!currentUser &&
    !!targetUserId &&
    String(currentUser.id) === String(targetUserId);

  const nicknameInput = $('profileNickname');
  const avatar = $('profileAvatar');
  const imageFileInput = $('profileImageFile');
  const resetImageBtn = $('profileResetImageBtn');

  let profileRow = null;
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

  applyProfileModeUI({
    isOwnProfile,
    nickname: currentNickname,
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

  renderCharacterSection({
    profileRow,
    characterRows,
    skinRows: characterSkinRows,
    isOwnProfile,
  });

  renderBgmSection({
    isOwnProfile,
    ownedStoreItemIds,
    currentUser,
    profileRow,
  });

  if (isOwnProfile && nicknameInput) {
    nicknameInput.value = currentNickname;
  }
  updatePickleSummary(profileRow?.pickles || 0, isOwnProfile);

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
          isOwnProfile: true,
          nickname,
          currentUser,
          profileRow,
        });

        if (imageFileInput) imageFileInput.value = '';
        pendingDefaultImage = false;

        setMsg('프로필 저장 완료!', 'green');
        window.dispatchEvent(new Event('auth-changed'));
      } catch (error) {
        console.error('[profile] save failed:', error);
        setMsg('프로필 저장 중 오류가 발생했어.', 'red');
      }
    });
  }

  const profilePostListEl = $('profilePostList');

  const profileCommentListEl = $('profileCommentList');

  const profilePickleListEl = $('profilePickleList');

  if (isOwnProfile) {
    try {
      const pickleEntries = await loadPickleLedger(targetUserId);

      updateTodayPickleStatus(pickleEntries);

      renderPreviewList({
        items: pickleEntries,
        limit: 3,
        listEl: profilePickleListEl,
        emptyHtml: `<div class="empty">아직 받은 피클 내역이 없어.</div>`,
        renderItem: renderPickleRow,
      });
    } catch (error) {
      console.error('[profile] load pickle ledger failed:', error);

      updateTodayPickleStatus([]);

      if (profilePickleListEl) {
        profilePickleListEl.innerHTML =
          '<div class="empty">피클 내역을 불러오지 못했어.</div>';
      }
    }
  }

  try {
    const posts = await loadPostsByAuthorId(targetUserId);

    renderPreviewList({
      items: posts,
      limit: 3,
      listEl: profilePostListEl,
      emptyHtml: `<div class="empty">${
        isOwnProfile ? '아직 작성한 글이 없어.' : '아직 작성한 글이 없어.'
      }</div>`,
      renderItem: renderMyPostRow,
    });
  } catch (error) {
    console.error('[profile] load posts failed:', error);

    if (profilePostListEl) {
      profilePostListEl.innerHTML = `<div class="empty">${
        isOwnProfile
          ? '내 글 목록을 불러오지 못했어.'
          : '작성한 글 목록을 불러오지 못했어.'
      }</div>`;
    }
  }

  try {
    const { comments, postMap } =
      await loadCommentsWithPostsByAuthorId(targetUserId);

    renderPreviewList({
      items: comments,
      limit: 3,
      listEl: profileCommentListEl,
      emptyHtml: `<div class="empty">${
        isOwnProfile
          ? '아직 작성한 댓글/답글이 없어.'
          : '아직 작성한 댓글/답글이 없어.'
      }</div>`,
      renderItem: (comment) => renderMyCommentRow(comment, postMap),
    });
  } catch (error) {
    console.error('[profile] load comments failed:', error);

    if (profileCommentListEl) {
      profileCommentListEl.innerHTML = `<div class="empty">${
        isOwnProfile
          ? '내 댓글 목록을 불러오지 못했어.'
          : '작성한 댓글 목록을 불러오지 못했어.'
      }</div>`;
    }
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
