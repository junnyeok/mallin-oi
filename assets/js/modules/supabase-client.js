import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.8/+esm';

/**
 * ✅ 여기에 네 프로젝트 값 넣어
 * Supabase Dashboard > Project Settings > API / Connect
 */
const SUPABASE_URL = 'https://tfztkeihdqkfzwpilyky.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmenRrZWloZHFrZnp3cGlseWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDYxNjgsImV4cCI6MjA4ODQyMjE2OH0.40iiWIFS_WOcPYgbs09Me7LUXGShODO91RnQOT3SHdQ';

export const SUPABASE_AUTH_STORAGE_KEY = 'sb-tfztkeihdqkfzwpilyky-auth-token';

const SUPABASE_SINGLETON_KEY = '__mallinSupabaseClient';

const memoryStorage = new Map();
const pendingRemovals = new Set();
let storageWarningShown = false;

function warnStorageFallback() {
  if (storageWarningShown) return;
  storageWarningShown = true;
  console.warn(
    '[supabase-client] persistent auth storage unavailable; using a temporary fallback',
  );
}

function getLocalStorage() {
  try {
    const storage = window.localStorage;
    const testKey = 'mallin:supabase-storage-test';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return storage;
  } catch {
    warnStorageFallback();
    return null;
  }
}

const authStorage = {
  getItem(key) {
    const storage = getLocalStorage();
    if (!storage) {
      return pendingRemovals.has(key) ? null : memoryStorage.get(key) || null;
    }

    try {
      if (pendingRemovals.has(key)) {
        storage.removeItem(key);
        pendingRemovals.delete(key);
        return null;
      }

      if (memoryStorage.has(key)) {
        const value = memoryStorage.get(key);
        storage.setItem(key, value);
        memoryStorage.delete(key);
        return value;
      }

      return storage.getItem(key);
    } catch {
      warnStorageFallback();
      return pendingRemovals.has(key) ? null : memoryStorage.get(key) || null;
    }
  },
  setItem(key, value) {
    memoryStorage.set(key, value);
    pendingRemovals.delete(key);

    const storage = getLocalStorage();
    if (!storage) return;

    try {
      storage.setItem(key, value);
      memoryStorage.delete(key);
    } catch {
      warnStorageFallback();
    }
  },
  removeItem(key) {
    memoryStorage.delete(key);
    pendingRemovals.add(key);

    const storage = getLocalStorage();
    if (!storage) return;

    try {
      storage.removeItem(key);
      pendingRemovals.delete(key);
    } catch {
      warnStorageFallback();
    }
  },
};

export function readStoredAuthSession() {
  try {
    const raw = authStorage.getItem(SUPABASE_AUTH_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearStoredAuthSession() {
  authStorage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
}

function createSupabaseSingleton() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: SUPABASE_AUTH_STORAGE_KEY,
      storage: authStorage,
    },
  });
}

const globalScope = globalThis;

if (!globalScope[SUPABASE_SINGLETON_KEY]) {
  globalScope[SUPABASE_SINGLETON_KEY] = createSupabaseSingleton();
}

export const supabase = globalScope[SUPABASE_SINGLETON_KEY];
