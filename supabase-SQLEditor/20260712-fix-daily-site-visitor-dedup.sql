-- =========================================================
-- 2026-07-12 금일 방문자 중복 집계 방지
-- 익명/회원 방문자 일일 1회 집계 및 기존 중복 데이터 정리
-- =========================================================

-- =========================================================
-- 1) 사전 확인
-- =========================================================

select
  'today_raw_rows' as check_name,
  count(*)::integer as row_count
from public.site_daily_visits
where visit_date = (now() at time zone 'Asia/Seoul')::date;

select
  'duplicate_user_visits' as check_name,
  visit_date,
  user_id,
  count(*)::integer as row_count
from public.site_daily_visits
where user_id is not null
group by visit_date, user_id
having count(*) > 1
order by visit_date desc, row_count desc
limit 50;

select
  'duplicate_visitor_keys' as check_name,
  visit_date,
  visitor_key,
  count(*)::integer as row_count
from public.site_daily_visits
where visitor_key is not null
group by visit_date, visitor_key
having count(*) > 1
order by visit_date desc, row_count desc
limit 50;

-- =========================================================
-- 2) 중복 데이터 정리
--    기준: 같은 날짜/같은 식별자는 created_at이 가장 오래된 1건만 유지
-- =========================================================

begin;

alter table public.site_daily_visits
  add column if not exists guest_id uuid;

update public.site_daily_visits
set guest_id = replace(visitor_key, 'guest:', '')::uuid
where guest_id is null
  and visitor_key ~ '^guest:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

update public.site_daily_visits
set guest_id = id
where guest_id is null
  and user_id is null;

with ranked as (
  select
    id,
    row_number() over (
      partition by visit_date, user_id
      order by created_at asc, id asc
    ) as row_number
  from public.site_daily_visits
  where user_id is not null
)
delete from public.site_daily_visits v
using ranked r
where v.id = r.id
  and r.row_number > 1;

with ranked as (
  select
    id,
    row_number() over (
      partition by visit_date, guest_id
      order by created_at asc, id asc
    ) as row_number
  from public.site_daily_visits
  where user_id is null
    and guest_id is not null
)
delete from public.site_daily_visits v
using ranked r
where v.id = r.id
  and r.row_number > 1;

update public.site_daily_visits
set visitor_key = 'user:' || user_id::text
where user_id is not null
  and visitor_key is distinct from 'user:' || user_id::text;

update public.site_daily_visits
set visitor_key = 'guest:' || guest_id::text
where user_id is null
  and guest_id is not null
  and visitor_key is distinct from 'guest:' || guest_id::text;

with ranked as (
  select
    id,
    row_number() over (
      partition by visit_date, visitor_key
      order by created_at asc, id asc
    ) as row_number
  from public.site_daily_visits
  where visitor_key is not null
)
delete from public.site_daily_visits v
using ranked r
where v.id = r.id
  and r.row_number > 1;

-- =========================================================
-- 3) constraint/index 생성
-- =========================================================

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

create unique index if not exists site_daily_visits_visit_date_guest_id_anon_uidx
  on public.site_daily_visits (visit_date, guest_id)
  where user_id is null
    and guest_id is not null;

alter table public.site_daily_visits enable row level security;
revoke all on table public.site_daily_visits from public, anon, authenticated;

-- =========================================================
-- 4) RPC 함수 생성 또는 교체
-- =========================================================

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
  v_user_visit_id uuid;
  v_guest_visit_id uuid;
begin
  if p_guest_id is not null then
    v_guest_key := 'guest:' || p_guest_id::text;
  end if;

  if v_user_id is not null then
    v_user_key := 'user:' || v_user_id::text;
  end if;

  if v_user_id is null and p_guest_id is null then
    return false;
  end if;

  if v_user_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'site_daily_visits:' || v_visit_date::text || ':' || v_user_key,
        0
      )
    );
  end if;

  if v_guest_key is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(
        'site_daily_visits:' || v_visit_date::text || ':' || v_guest_key,
        0
      )
    );
  end if;

  if v_user_id is not null then
    select id
      into v_user_visit_id
    from public.site_daily_visits
    where visit_date = v_visit_date
      and user_id = v_user_id
    order by created_at asc, id asc
    limit 1
    for update;

    if v_user_visit_id is not null then
      update public.site_daily_visits
      set
        visitor_key = v_user_key,
        guest_id = coalesce(guest_id, p_guest_id)
      where id = v_user_visit_id;

      if p_guest_id is not null then
        delete from public.site_daily_visits
        where visit_date = v_visit_date
          and user_id is null
          and (
            guest_id = p_guest_id
            or visitor_key = v_guest_key
          );
      end if;

      return true;
    end if;

    if p_guest_id is not null then
      select id
        into v_guest_visit_id
      from public.site_daily_visits
      where visit_date = v_visit_date
        and user_id is null
        and (
          guest_id = p_guest_id
          or visitor_key = v_guest_key
        )
      order by created_at asc, id asc
      limit 1
      for update;

      if v_guest_visit_id is not null then
        update public.site_daily_visits
        set
          user_id = v_user_id,
          guest_id = p_guest_id,
          visitor_key = v_user_key
        where id = v_guest_visit_id;

        return true;
      end if;
    end if;

    insert into public.site_daily_visits (user_id, guest_id, visitor_key, visit_date)
    values (v_user_id, p_guest_id, v_user_key, v_visit_date)
    on conflict on constraint site_daily_visits_visit_date_visitor_key_key
    do update
      set
        user_id = excluded.user_id,
        guest_id = coalesce(public.site_daily_visits.guest_id, excluded.guest_id);

    if p_guest_id is not null then
      delete from public.site_daily_visits
      where visit_date = v_visit_date
        and user_id is null
        and (
          guest_id = p_guest_id
          or visitor_key = v_guest_key
        );
    end if;

    return true;
  end if;

  if exists (
    select 1
    from public.site_daily_visits
    where visit_date = v_visit_date
      and guest_id = p_guest_id
      and user_id is not null
  ) then
    return true;
  end if;

  insert into public.site_daily_visits (user_id, guest_id, visitor_key, visit_date)
  values (null, p_guest_id, v_guest_key, v_visit_date)
  on conflict on constraint site_daily_visits_visit_date_visitor_key_key
  do nothing;

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
      from (
        select distinct
          coalesce(
            'user:' || user_id::text,
            'guest:' || guest_id::text,
            visitor_key
          ) as daily_visitor_key
        from public.site_daily_visits
        where visit_date = (now() at time zone 'Asia/Seoul')::date
      ) unique_daily_visitors
      where daily_visitor_key is not null
    ) as today_visit_count;
$$;

-- =========================================================
-- 5) 권한 설정
-- =========================================================

revoke all on function public.record_today_site_visit(uuid) from public;
grant execute on function public.record_today_site_visit(uuid) to anon, authenticated;

revoke all on function public.get_site_stats() from public;
grant execute on function public.get_site_stats() to anon, authenticated;

commit;

-- =========================================================
-- 6) 최종 검증 SELECT
-- =========================================================

select
  'today_unique_visitors' as check_name,
  count(*)::integer as row_count
from (
  select distinct
    coalesce(
      'user:' || user_id::text,
      'guest:' || guest_id::text,
      visitor_key
    ) as daily_visitor_key
  from public.site_daily_visits
  where visit_date = (now() at time zone 'Asia/Seoul')::date
) unique_daily_visitors
where daily_visitor_key is not null;

select
  'remaining_duplicate_user_visits' as check_name,
  visit_date,
  user_id,
  count(*)::integer as row_count
from public.site_daily_visits
where user_id is not null
group by visit_date, user_id
having count(*) > 1
order by visit_date desc, row_count desc
limit 50;

select
  'remaining_duplicate_anonymous_visits' as check_name,
  visit_date,
  guest_id,
  count(*)::integer as row_count
from public.site_daily_visits
where user_id is null
  and guest_id is not null
group by visit_date, guest_id
having count(*) > 1
order by visit_date desc, row_count desc
limit 50;
