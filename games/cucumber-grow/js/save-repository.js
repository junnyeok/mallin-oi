import { GAME_CONFIG } from "./game-config.js";
import {
  createInitialGameState,
  detectGameStateSchema,
  normalizeGameState,
} from "./game-state.js";
import { synchronizeDerivedState } from "./game-engine.js";

const SLOT_NAMES = ["slot-a", "slot-b"];

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

export function checksumText(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function parseEnvelope(rawValue) {
  if (typeof rawValue !== "string" || rawValue.length === 0) return null;
  try {
    const envelope = JSON.parse(rawValue);
    if (
      !Number.isSafeInteger(envelope?.revision) ||
      envelope.revision < 1 ||
      typeof envelope?.payload !== "string" ||
      envelope.checksum !== checksumText(envelope.payload)
    ) {
      return null;
    }
    const payload = JSON.parse(envelope.payload);
    return { envelope, payload };
  } catch {
    return null;
  }
}

function storageKey(suffix) {
  return `${GAME_CONFIG.nativeStorageKey}:${suffix}`;
}

export class AsyncLocalStorageBackend {
  constructor(storage) {
    this.storage = storage;
    this.kind = "browser";
  }

  async get(key) {
    return this.storage?.getItem?.(key) ?? null;
  }

  async set(key, value) {
    this.storage?.setItem?.(key, value);
  }

  async remove(key) {
    this.storage?.removeItem?.(key);
  }
}

export class CapacitorPreferencesBackend {
  constructor(preferencesPlugin) {
    this.preferences = preferencesPlugin;
    this.kind = "native-preferences";
  }

  async get(key) {
    const result = await this.preferences.get({ key });
    return result?.value ?? null;
  }

  async set(key, value) {
    await this.preferences.set({ key, value });
  }

  async remove(key) {
    await this.preferences.remove({ key });
  }
}

export function createStorageBackend({ preferencesPlugin, browserStorage } = {}) {
  if (preferencesPlugin?.get && preferencesPlugin?.set) {
    return new CapacitorPreferencesBackend(preferencesPlugin);
  }
  let storage = browserStorage;
  if (storage === undefined) {
    try {
      storage = globalThis.localStorage;
    } catch {
      storage = null;
    }
  }
  return new AsyncLocalStorageBackend(storage);
}

export class GameSaveRepository {
  constructor({
    backend,
    legacyStorage,
    now = () => Date.now(),
    debounceMs = GAME_CONFIG.saveDebounceMs,
    setTimer = globalThis.setTimeout?.bind(globalThis),
    clearTimer = globalThis.clearTimeout?.bind(globalThis),
  } = {}) {
    this.backend = backend ?? createStorageBackend({ browserStorage: legacyStorage });
    this.legacyStorage = legacyStorage;
    this.now = now;
    this.debounceMs = debounceMs;
    this.setTimer = setTimer;
    this.clearTimer = clearTimer;
    this.revision = 0;
    this.pendingState = null;
    this.pendingTimer = null;
    this.writeQueue = Promise.resolve({ ok: true });
    this.lastError = null;
  }

  async load(now = this.now()) {
    const slotValues = await Promise.all(
      SLOT_NAMES.map((slot) => this.backend.get(storageKey(slot)).catch(() => null))
    );
    const invalidSlotFound = slotValues.some(
      (rawValue) => rawValue !== null && parseEnvelope(rawValue) === null
    );
    const candidates = slotValues
      .map(parseEnvelope)
      .filter(Boolean)
      .sort((left, right) => right.envelope.revision - left.envelope.revision);

    if (candidates.length > 0) {
      const selected = candidates[0];
      this.revision = selected.envelope.revision;
      const sourceSchema = detectGameStateSchema(selected.payload);
      const state = normalizeGameState(selected.payload, now);
      synchronizeDerivedState(state);
      return {
        state,
        status: sourceSchema === "v4" ? "loaded" : "migrated",
        sourceSchema,
        storage: this.backend.kind,
        revision: this.revision,
        recoveredFromBackup: invalidSlotFound,
      };
    }

    const legacy = this.readLegacy(now);
    if (legacy) {
      const result = await this.persistNow(legacy.state, now);
      return {
        ...legacy,
        status: "migrated",
        storage: this.backend.kind,
        revision: result.revision ?? this.revision,
      };
    }

    return {
      state: createInitialGameState(now),
      status: slotValues.some(Boolean) ? "recovered" : "empty",
      sourceSchema: slotValues.some(Boolean) ? "invalid-envelope" : "none",
      storage: this.backend.kind,
      revision: 0,
    };
  }

  readLegacy(now) {
    let storage = this.legacyStorage;
    if (storage === undefined) {
      try {
        storage = globalThis.localStorage;
      } catch {
        storage = null;
      }
    }
    if (!storage?.getItem) return null;
    try {
      const rawValue = storage.getItem(GAME_CONFIG.storageKey);
      if (!rawValue) return null;
      const parsed = JSON.parse(rawValue);
      const sourceSchema = detectGameStateSchema(parsed);
      const state = normalizeGameState(parsed, now);
      synchronizeDerivedState(state);
      return { state, sourceSchema };
    } catch {
      return null;
    }
  }

  requestSave(state) {
    this.pendingState = state;
    if (this.pendingTimer !== null || !this.setTimer) return;
    this.pendingTimer = this.setTimer(() => {
      this.pendingTimer = null;
      void this.flush();
    }, this.debounceMs);
  }

  async flush(state = this.pendingState, now = this.now()) {
    if (this.pendingTimer !== null) {
      this.clearTimer?.(this.pendingTimer);
      this.pendingTimer = null;
    }
    if (!state) return this.writeQueue;
    this.pendingState = null;
    const sourceState = state;
    const snapshot = cloneJson(state);
    this.writeQueue = this.writeQueue.then(
      () => this.persistNow(snapshot, now),
      () => this.persistNow(snapshot, now)
    ).then((result) => {
      if (result.ok && sourceState && typeof sourceState === "object") {
        sourceState.lastSavedAt = result.savedAt;
        sourceState.schemaVersion = GAME_CONFIG.schemaVersion;
        sourceState.saveVersion = GAME_CONFIG.schemaVersion;
      }
      return result;
    });
    return this.writeQueue;
  }

  async persistNow(state, now = this.now()) {
    try {
      const snapshot = normalizeGameState(
        {
          ...cloneJson(state),
          schemaVersion: GAME_CONFIG.schemaVersion,
          saveVersion: GAME_CONFIG.schemaVersion,
          lastSavedAt: now,
        },
        now
      );
      synchronizeDerivedState(snapshot);
      const revision = this.revision + 1;
      const payload = JSON.stringify(snapshot);
      const envelope = JSON.stringify({
        revision,
        writtenAt: now,
        checksum: checksumText(payload),
        payload,
      });
      const slot = SLOT_NAMES[(revision - 1) % SLOT_NAMES.length];

      await this.backend.set(storageKey(slot), envelope);
      await this.backend.set(
        storageKey("meta"),
        JSON.stringify({ revision, slot, writtenAt: now })
      );
      this.revision = revision;
      this.lastError = null;
      return { ok: true, revision, savedAt: now, snapshot };
    } catch (error) {
      this.lastError = error;
      return { ok: false, reason: "write-failed", error };
    }
  }

  exportState(state) {
    const snapshot = normalizeGameState(cloneJson(state), this.now());
    return JSON.stringify(
      {
        format: "mallinoi-cucumber-grow-backup",
        exportedAt: this.now(),
        schemaVersion: GAME_CONFIG.schemaVersion,
        state: snapshot,
      },
      null,
      2
    );
  }

  async importState(rawText) {
    const parsed = JSON.parse(rawText);
    const payload = parsed?.format === "mallinoi-cucumber-grow-backup"
      ? parsed.state
      : parsed;
    const sourceSchema = detectGameStateSchema(payload);
    if (sourceSchema === "unsupported") {
      throw new Error("unsupported-save");
    }
    const now = this.now();
    const state = normalizeGameState(payload, now);
    synchronizeDerivedState(state);
    const result = await this.persistNow(state, now);
    if (!result.ok) throw result.error ?? new Error(result.reason);
    return { state: result.snapshot, sourceSchema, revision: result.revision };
  }
}
