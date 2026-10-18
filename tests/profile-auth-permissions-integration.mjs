// Run against isolated PGlite only; never uses a live database.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
const modules = process.argv[2];
assert.ok(modules && path.isAbsolute(modules));
const { PGlite } = await import(pathToFileURL(path.join(modules, '@electric-sql/pglite/dist/index.js')));
const db = new PGlite();
try {
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create table public.profiles (id uuid primary key, email text, nickname text,
      is_admin boolean default false, pickles integer default 0, created_at timestamptz default now(),
      updated_at timestamptz, real_name text, birth_key text, recovery_question text,
      recovery_answer_hash text, profile_image_url text, bio text, equipped_character_image_url text,
      bgm_selected_track_ids jsonb, bgm_current_track_id text, equipped_character_effect_item_id text,
      equipped_profile_background_item_id text, equipped_profile_frame_item_id text,
      profile_featured_bgm_item_id text);
    grant all on public.profiles to anon, authenticated, service_role;
    alter table public.profiles enable row level security;
    create policy own_select on public.profiles for select to authenticated
      using (id = current_setting('test.user_id')::uuid);
    create policy own_update on public.profiles for update to authenticated
      using (id = current_setting('test.user_id')::uuid) with check (id = current_setting('test.user_id')::uuid);
    insert into public.profiles(id,email,nickname) values
      ('11111111-1111-4111-8111-111111111111','one@example.test','before'),
      ('22222222-2222-4222-8222-222222222222','two@example.test','other');`);
  const sql = await readFile(new URL('../supabase-SQLEditor/20261018-profile-auth-permissions.sql', import.meta.url), 'utf8');
  await db.exec(sql); await db.exec(sql);
  await db.exec("set role authenticated; set test.user_id='11111111-1111-4111-8111-111111111111'");
  await db.exec("update public.profiles set nickname='after',bio='hello',updated_at=now(),bgm_current_track_id='track' where id='11111111-1111-4111-8111-111111111111'");
  for (const assignment of ["is_admin=true", "pickles=1000", "email='changed@example.test'", "id='33333333-3333-4333-8333-333333333333'", "recovery_answer_hash='changed'"]) {
    await assert.rejects(db.exec(`update public.profiles set ${assignment}`), /permission denied/);
  }
  await db.exec("update public.profiles set nickname='attacker' where id='22222222-2222-4222-8222-222222222222'");
  await assert.rejects(db.exec('truncate public.profiles'), /permission denied/);
  await assert.rejects(db.exec('delete from public.profiles'), /permission denied/);
  await db.exec('reset role; set role anon');
  await assert.rejects(db.exec('truncate public.profiles'), /permission denied/);
  await assert.rejects(db.exec("update public.profiles set nickname='attacker'"), /permission denied/);
  await db.exec("reset role; set role service_role; update public.profiles set pickles=5 where id='11111111-1111-4111-8111-111111111111'; reset role");
  const rows = (await db.query('select nickname,pickles from public.profiles order by id')).rows;
  assert.deepEqual(rows, [{nickname:'after',pickles:5},{nickname:'other',pickles:0}]);
  console.log('Profile privileges: reapply, own profile editing, protected fields, other-user isolation, anonymous writes, TRUNCATE, server writes passed.');
} finally { await db.close(); }
