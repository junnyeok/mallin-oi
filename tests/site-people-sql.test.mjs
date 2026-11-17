import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL('../supabase/migrations/20261117000000_site_people_today.sql', import.meta.url);
const migration = await readFile(migrationUrl, 'utf8');
const countMigration = await readFile(new URL('../supabase/migrations/20261117010000_site_member_visit_stats.sql', import.meta.url),'utf8');
let PGlite;
try {
  ({PGlite} = await import(process.env.PGLITE_MODULE_PATH || '@electric-sql/pglite'));
} catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}

test('today visitor SQL editor copy matches the migration and preserves private table access', async () => {
  assert.equal(migration, await readFile(new URL('../supabase-SQLEditor/20261117-site-people-today.sql', import.meta.url), 'utf8'));
  assert.doesNotMatch(migration, /grant\s+select|alter\s+table|update\s+public|delete\s+from|drop\s+(table|policy)/i);
});

test('today visitor RPC gates membership and exposes only current KST public profiles plus guest count', {skip: !PGlite && 'Set PGLITE_MODULE_PATH or install @electric-sql/pglite for local PostgreSQL validation'}, async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create role anon; create role authenticated;
      grant usage on schema auth to anon,authenticated;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table auth.users(id uuid primary key);
      create table public.profiles(id uuid primary key,nickname text,profile_image_url text,email text);
      create view public.public_profiles as select id,nickname,profile_image_url from public.profiles;
      grant select on public.public_profiles to anon,authenticated;
      create table public.site_daily_visits(user_id uuid,guest_id uuid,visitor_key text,visit_date date);
      alter table public.site_daily_visits enable row level security;
      revoke all on public.site_daily_visits from public,anon,authenticated;
      insert into profiles values
        ('00000000-0000-4000-8000-000000000001','오이','https://example.test/avatar.png','private1@example.test'),
        ('00000000-0000-4000-8000-000000000002','%_','', 'private2@example.test'),
        ('00000000-0000-4000-8000-000000000003','어제회원','https://example.test/old.png','private3@example.test');
      insert into auth.users select id from profiles;
      insert into site_daily_visits values
        ('00000000-0000-4000-8000-000000000001',null,'user:one',(now() at time zone 'Asia/Seoul')::date),
        ('00000000-0000-4000-8000-000000000001',null,'legacy:one',(now() at time zone 'Asia/Seoul')::date),
        ('00000000-0000-4000-8000-000000000002',null,'user:two',(now() at time zone 'Asia/Seoul')::date),
        ('00000000-0000-4000-8000-000000000003',null,'user:three',(now() at time zone 'Asia/Seoul')::date-1),
        (null,'00000000-0000-4000-8000-000000000099','guest:first',(now() at time zone 'Asia/Seoul')::date),
        (null,'00000000-0000-4000-8000-000000000099','guest:duplicate',(now() at time zone 'Asia/Seoul')::date),
        (null,null,'guest:legacy',(now() at time zone 'Asia/Seoul')::date),
        (null,null,'guest:old',(now() at time zone 'Asia/Seoul')::date-1);
    `);
    await db.exec(migration);
    await db.exec(countMigration);
    await db.exec(countMigration);
    await db.exec(migration); // Safe to reapply without changing visit data.
    const before = (await db.query('select count(*)::int as n from site_daily_visits')).rows[0].n;
    await db.exec('set role anon');
    const header = (await db.query('select * from public.get_site_stats()')).rows[0];
    assert.deepEqual(header,{member_count:3,today_visit_count:2});
    await assert.rejects(db.query('select public.get_today_site_people()'), /permission denied/);
    await db.exec('reset role; set role authenticated');
    await assert.rejects(db.query('select * from public.site_daily_visits'), /permission denied/);
    await assert.rejects(db.query('select public.get_today_site_people()'), /로그인/);
    await db.exec(`select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false)`);
    const get = async (search='',offset=0,limit=24) => (await db.query('select public.get_today_site_people($1,$2,$3) as result',[search,offset,limit])).rows[0].result;
    const result=await get();
    assert.equal(result.total,2);
    assert.equal(result.total,header.today_visit_count);
    assert.equal(result.items.length,2);
    assert.equal(result.guestCount,2);
    const today=(await db.query("select (now() at time zone 'Asia/Seoul')::date::text as date")).rows[0].date;
    assert.equal(result.date,today);
    for (const row of result.items) assert.deepEqual(Object.keys(row).sort(),['avatar_url','nickname','user_id']);
    assert.doesNotMatch(JSON.stringify(result),/private[123]|guest:|어제회원|visitor_key|created_at/);
    assert.equal((await get('%_')).total,1); // Search characters are literal, not SQL wildcards.
    assert.equal((await get('missing')).items.length,0);
    assert.equal((await get('',1,1)).items.length,1);
    assert.equal((await get('',999999,1000)).items.length,0);
    assert.equal((await get('',-1,0)).items.length,1);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from site_daily_visits')).rows[0].n,before);
  } finally { await db.close(); }
});

test('member-only count SQL copy is isolated and leaves visit records untouched',async()=>{
 assert.equal(countMigration,await readFile(new URL('../supabase-SQLEditor/20261117-site-member-visit-stats.sql',import.meta.url),'utf8'));
 assert.doesNotMatch(countMigration,/delete from|update public|drop |grant |alter table/i);
});
