import { supabase } from './supabase-client.js';

const BGM_TRACK_ID_STORAGE_KEY = 'mallin_bgm_selected_track_id_v1';
const BGM_TRACK_IDS_STORAGE_KEY = 'mallin_bgm_selected_track_ids_v1';
const DEFAULT_BGM_TRACK_ID = 'mallin-oi-welcome';
const STORE_ITEM_ID_PATTERN = /^[a-zA-Z0-9_-]{1,100}$/;

function normalizeTrackIds(trackIds = []) {
  const safe = [...new Set(trackIds)]
    .map((value) => String(value || '').trim())
    .filter(Boolean);

  return safe;
}

export function getDefaultBgmTrackId() {
  return DEFAULT_BGM_TRACK_ID;
}

export function getLocalCurrentBgmTrackId() {
  return (
    String(localStorage.getItem(BGM_TRACK_ID_STORAGE_KEY) || '').trim() ||
    DEFAULT_BGM_TRACK_ID
  );
}

export function getLocalSelectedBgmTrackIds() {
  const raw = localStorage.getItem(BGM_TRACK_IDS_STORAGE_KEY);

  if (raw !== null) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const normalized = normalizeTrackIds(parsed);
        return new Set(normalized);
      }
    } catch (error) {
      console.warn(
        '[bgm-preferences] failed to parse local selected track ids:',
        error,
      );
    }

    return new Set();
  }

  const legacyTrackId = String(
    localStorage.getItem(BGM_TRACK_ID_STORAGE_KEY) || '',
  ).trim();

  if (legacyTrackId) {
    return new Set([legacyTrackId]);
  }

  return new Set([DEFAULT_BGM_TRACK_ID]);
}

export function applyBgmPreferencesToLocal({
  selectedTrackIds = [],
  currentTrackId = '',
} = {}) {
  const safeTrackIds = normalizeTrackIds(selectedTrackIds);
  const safeCurrentTrackId = String(currentTrackId || '').trim();

  localStorage.setItem(BGM_TRACK_IDS_STORAGE_KEY, JSON.stringify(safeTrackIds));

  if (safeCurrentTrackId) {
    localStorage.setItem(BGM_TRACK_ID_STORAGE_KEY, safeCurrentTrackId);
    return {
      selectedTrackIds: safeTrackIds,
      currentTrackId: safeCurrentTrackId,
    };
  }

  if (safeTrackIds.length) {
    localStorage.setItem(BGM_TRACK_ID_STORAGE_KEY, safeTrackIds[0]);
    return {
      selectedTrackIds: safeTrackIds,
      currentTrackId: safeTrackIds[0],
    };
  }

  localStorage.removeItem(BGM_TRACK_ID_STORAGE_KEY);

  return {
    selectedTrackIds: safeTrackIds,
    currentTrackId: '',
  };
}

export function syncLocalCurrentBgmTrackSelection(trackIds = []) {
  const safeTrackIds = normalizeTrackIds(trackIds);
  const currentTrackId = String(
    localStorage.getItem(BGM_TRACK_ID_STORAGE_KEY) || '',
  ).trim();

  if (safeTrackIds.includes(currentTrackId)) {
    return currentTrackId;
  }

  if (safeTrackIds.length) {
    localStorage.setItem(BGM_TRACK_ID_STORAGE_KEY, safeTrackIds[0]);
    return safeTrackIds[0];
  }

  localStorage.removeItem(BGM_TRACK_ID_STORAGE_KEY);
  return '';
}

export function getBgmPreferencesFromProfileRow(profileRow = null) {
  const hasSelectedColumn = Object.prototype.hasOwnProperty.call(
    profileRow || {},
    'bgm_selected_track_ids',
  );

  const hasCurrentColumn = Object.prototype.hasOwnProperty.call(
    profileRow || {},
    'bgm_current_track_id',
  );

  // 방어 코드:
  // profileRow 조회 쿼리에서 BGM 컬럼이 빠진 경우에는
  // 기본값으로 덮어쓰지 말고 현재 localStorage 값을 유지한다.
  if (!hasSelectedColumn && !hasCurrentColumn) {
    const localSelectedTrackIds = [...getLocalSelectedBgmTrackIds()];
    const localCurrentTrackId = getLocalCurrentBgmTrackId();

    return {
      selectedTrackIds: localSelectedTrackIds,
      currentTrackId:
        localCurrentTrackId || localSelectedTrackIds[0] || DEFAULT_BGM_TRACK_ID,
    };
  }

  const rawSelected = profileRow?.bgm_selected_track_ids;

  let selectedTrackIds = [];

  if (Array.isArray(rawSelected)) {
    selectedTrackIds = normalizeTrackIds(rawSelected);
  } else if (typeof rawSelected === 'string') {
    try {
      const parsed = JSON.parse(rawSelected);
      selectedTrackIds = Array.isArray(parsed)
        ? normalizeTrackIds(parsed)
        : normalizeTrackIds([rawSelected]);
    } catch (error) {
      selectedTrackIds = normalizeTrackIds([rawSelected]);
    }
  }

  if (!selectedTrackIds.length) {
    selectedTrackIds = [DEFAULT_BGM_TRACK_ID];
  }

  const currentTrackId = String(
    profileRow?.bgm_current_track_id ||
      selectedTrackIds[0] ||
      DEFAULT_BGM_TRACK_ID,
  ).trim();

  return {
    selectedTrackIds,
    currentTrackId,
  };
}

export async function hydrateBgmPreferencesFromRemote(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('bgm_selected_track_ids, bgm_current_track_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const prefs = getBgmPreferencesFromProfileRow(data);
  applyBgmPreferencesToLocal(prefs);
  return prefs;
}

export async function saveRemoteBgmPreferences(
  userId,
  { selectedTrackIds = [], currentTrackId = '' } = {},
) {
  if (!userId) return null;

  const safeTrackIds = normalizeTrackIds(selectedTrackIds);
  const syncedCurrentTrackId =
    String(currentTrackId || '').trim() || safeTrackIds[0] || '';

  const patch = {
    bgm_selected_track_ids: safeTrackIds,
    bgm_current_track_id: syncedCurrentTrackId || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);

  if (error) throw error;

  applyBgmPreferencesToLocal({
    selectedTrackIds: safeTrackIds,
    currentTrackId: syncedCurrentTrackId,
  });

  return patch;
}

export async function saveMyProfileFeaturedBgm(itemId = null) {
  const normalizedItemId =
    itemId === null ? null : String(itemId || '').trim() || null;

  if (normalizedItemId && !STORE_ITEM_ID_PATTERN.test(normalizedItemId)) {
    throw new Error('대표 BGM 상품 정보가 올바르지 않아.');
  }

  const { data, error } = await supabase.rpc('set_my_profile_featured_bgm', {
    p_item_id: normalizedItemId,
  });

  if (error) throw error;

  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.success) {
    throw new Error(result?.message || '대표 BGM을 저장하지 못했어.');
  }

  return {
    success: true,
    message: String(result.message || '').trim(),
    itemId: String(result.profile_featured_bgm_item_id || '').trim() || null,
  };
}
