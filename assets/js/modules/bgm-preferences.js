import { supabase } from './supabase-client.js';

const BGM_TRACK_ID_STORAGE_KEY = 'mallin_bgm_selected_track_id_v1';
const BGM_TRACK_IDS_STORAGE_KEY = 'mallin_bgm_selected_track_ids_v1';
const DEFAULT_BGM_TRACK_ID = 'mallin-oi-welcome';

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
  const rawSelected = profileRow?.bgm_selected_track_ids;
  const selectedTrackIds = Array.isArray(rawSelected)
    ? normalizeTrackIds(rawSelected)
    : [DEFAULT_BGM_TRACK_ID];

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
