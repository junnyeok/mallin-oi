import { GAME_CONFIG } from "./game-config.js";
import {
  createInitialGameState,
  detectGameStateSchema,
  normalizeGameState,
} from "./game-state.js";
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
    return { state: createInitialGameState(now), status: "unavailable" };
  }

  try {
    const storedValue = storage.getItem(GAME_CONFIG.storageKey);
    if (!storedValue) {
      return { state: createInitialGameState(now), status: "empty" };
    }

    const parsed = JSON.parse(storedValue);
    const schema = detectGameStateSchema(parsed);
    const state = normalizeGameState(parsed, now);
    synchronizeDerivedState(state);
    return {
      state,
      status:
        schema === "v8"
          ? "loaded"
          : ["v7", "v6", "v5", "v4", "v3", "v2", "legacy"].includes(schema)
            ? "migrated"
            : "recovered",
      sourceSchema: schema,
    };
  } catch {
    return {
      state: createInitialGameState(now),
      status: "recovered",
      sourceSchema: "invalid-json",
    };
  }
}

export function saveGame(state, storage = getBrowserStorage(), now = Date.now()) {
  if (!storage) return { ok: false, reason: "unavailable" };

  try {
    const source = JSON.parse(JSON.stringify(state));
    source.schemaVersion = GAME_CONFIG.schemaVersion;
    source.saveVersion = GAME_CONFIG.schemaVersion;
    source.lastSavedAt = now;
    const snapshot = normalizeGameState(source, now);
    synchronizeDerivedState(snapshot);
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
