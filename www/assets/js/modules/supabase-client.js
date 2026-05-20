import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/**
 * ✅ 여기에 네 프로젝트 값 넣어
 * Supabase Dashboard > Project Settings > API / Connect
 */
const SUPABASE_URL = 'https://tfztkeihdqkfzwpilyky.supabase.co';
const SUPABASE_PUBLISHABLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRmenRrZWloZHFrZnp3cGlseWt5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4NDYxNjgsImV4cCI6MjA4ODQyMjE2OH0.40iiWIFS_WOcPYgbs09Me7LUXGShODO91RnQOT3SHdQ';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
