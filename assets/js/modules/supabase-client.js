import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

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

function getLocalStorage() {
  try {
    const storage = window.localStorage;
    const testKey = 'mallin:supabase-storage-test';
    storage.setItem(testKey, '1');
    storage.removeItem(testKey);
    return storage;
  } catch (error) {
    console.warn('[supabase-client] localStorage unavailable:', error);
    return null;
  }
}

const authStorage = {
  getItem(key) {
    const storage = getLocalStorage();
    return storage ? storage.getItem(key) : memoryStorage.get(key) || null;
  },
  setItem(key, value) {
    const storage = getLocalStorage();
    if (storage) {
      storage.setItem(key, value);
      return;
    }

    memoryStorage.set(key, value);
  },
  removeItem(key) {
    const storage = getLocalStorage();
    if (storage) {
      storage.removeItem(key);
      return;
    }

    memoryStorage.delete(key);
  },
};

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
