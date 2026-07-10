-- =========================================================
-- 비회원 포함 일일 방문자 중복 방지 집계 기능
-- =========================================================

create table if not exists public.site_daily_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  visitor_key text,
  visit_date date not null,
  created_at timestamptz not null default now()
);

alter table public.site_daily_visits
  add column if not exists visitor_key text;

alter table public.site_daily_visits
  alter column user_id drop not null;

update public.site_daily_visits
set visitor_key = 'user:' || user_id::text
where visitor_key is null
  and user_id is not null;

update public.site_daily_visits
set visitor_key = 'guest:' || id::text
where visitor_key is null;

alter table public.site_daily_visits
  alter column visitor_key set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_daily_visits_visitor_key_format_check'
      and conrelid = 'public.site_daily_visits'::regclass
  ) then
    alter table public.site_daily_visits
      add constraint site_daily_visits_visitor_key_format_check
      check (visitor_key ~ '^(user|guest):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'site_daily_visits_visit_date_visitor_key_key'
      and conrelid = 'public.site_daily_visits'::regclass
  ) then
    alter table public.site_daily_visits
      add constraint site_daily_visits_visit_date_visitor_key_key
      unique (visit_date, visitor_key);
  end if;
end;
$$;

alter table public.site_daily_visits enable row level security;
revoke all on table public.site_daily_visits from public, anon, authenticated;

drop function if exists public.record_today_site_visit();

create or replace function public.record_today_site_visit(p_guest_id uuid default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_visit_date date := (now() at time zone 'Asia/Seoul')::date;
  v_user_key text;
  v_guest_key text;
begin
  if p_guest_id is not null then
    v_guest_key := 'guest:' || p_guest_id::text;
  end if;

  if v_user_id is not null then
    v_user_key := 'user:' || v_user_id::text;

    insert into public.site_daily_visits (user_id, visitor_key, visit_date)
    values (v_user_id, v_user_key, v_visit_date)
    on conflict (visit_date, visitor_key) do nothing;

    if v_guest_key is not null then
      delete from public.site_daily_visits
      where visit_date = v_visit_date
        and visitor_key = v_guest_key;
    end if;

    return true;
  end if;

  if v_guest_key is null then
    return false;
  end if;

  insert into public.site_daily_visits (user_id, visitor_key, visit_date)
  values (null, v_guest_key, v_visit_date)
  on conflict (visit_date, visitor_key) do nothing;

  return true;
end;
$$;

create or replace function public.get_site_stats()
returns table (member_count integer, today_visit_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::integer from auth.users) as member_count,
    (
      select count(*)::integer
      from public.site_daily_visits
      where visit_date = (now() at time zone 'Asia/Seoul')::date
    ) as today_visit_count;
$$;

revoke all on function public.record_today_site_visit(uuid) from public;
grant execute on function public.record_today_site_visit(uuid) to anon, authenticated;

revoke all on function public.get_site_stats() from public;
grant execute on function public.get_site_stats() to anon, authenticated;
