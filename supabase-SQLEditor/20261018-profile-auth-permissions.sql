-- 2026-10-18: preflight for social login found unrestricted profile UPDATE grants.
-- Changes privileges only. Existing rows, RLS policies and server-side RPCs are preserved.
begin;

revoke insert, update, delete, truncate, references, trigger
  on table public.profiles from public, anon, authenticated;

-- Clear any explicit protected-column grants as well as the table-level UPDATE grant.
revoke update (id, email, is_admin, pickles, created_at, real_name, birth_key,
  recovery_question, recovery_answer_hash)
  on table public.profiles from public, anon, authenticated;

-- Only fields written by the existing profile, nickname and music UI are editable.
-- Existing ownership triggers continue to validate equipped items.
grant update (nickname, updated_at, profile_image_url, bio,
  equipped_character_image_url, bgm_selected_track_ids, bgm_current_track_id,
  equipped_character_effect_item_id, equipped_profile_background_item_id,
  equipped_profile_frame_item_id, profile_featured_bgm_item_id)
  on table public.profiles to authenticated;

commit;
