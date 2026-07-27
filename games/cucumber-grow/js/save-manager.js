import { GAME_CONFIG } from "./game-config.js";
import { createInitialGameState, normalizeGameState } from "./game-state.js";
import { synchronizeDerivedState } from "./game-engine.js";

function getBrowserStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadGameSave(storage = getBrowserStorage(), now = Date.now()) {
  if (!storage) {
    return {
      state: createInitialGameState(now),
      status: "unavailable",
    };
  }

  try {
    const storedValue = storage.getItem(GAME_CONFIG.storageKey);

    if (!storedValue) {
      return {
        state: createInitialGameState(now),
        status: "empty",
      };
    }

    const parsed = JSON.parse(storedValue);
    const hasSupportedVersion =
      parsed &&
      typeof parsed === "object" &&
      parsed.saveVersion === GAME_CONFIG.saveVersion;
    const state = normalizeGameState(parsed, now);
    synchronizeDerivedState(state);

    return {
      state,
      status: hasSupportedVersion ? "loaded" : "recovered",
    };
  } catch {
    return {
      state: createInitialGameState(now),
      status: "recovered",
    };
  }
}

export function saveGame(
  state,
  storage = getBrowserStorage(),
  now = Date.now()
) {
  if (!storage) {
    return { ok: false, reason: "unavailable" };
  }

  const snapshot = normalizeGameState(
    {
      ...state,
      facilities: { ...state.facilities },
      settings: { ...state.settings },
      saveVersion: GAME_CONFIG.saveVersion,
      lastSavedAt: now,
    },
    now
  );
  synchronizeDerivedState(snapshot);

  try {
    storage.setItem(GAME_CONFIG.storageKey, JSON.stringify(snapshot));
    Object.assign(state, snapshot);
    return { ok: true, savedAt: snapshot.lastSavedAt };
  } catch {
    return { ok: false, reason: "write-failed" };
  }
}

export function clearGameSave(storage = getBrowserStorage()) {
  if (!storage) return false;

  try {
    storage.removeItem(GAME_CONFIG.storageKey);
    return true;
  } catch {
    return false;
  }
}
