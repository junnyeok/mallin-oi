-- =========================================================
-- 사이트 회원 수 / 금일 방문 수 통계
-- =========================================================

create table if not exists public.site_daily_visits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  visit_date date not null,
  created_at timestamptz not null default now(),
  constraint site_daily_visits_user_date_key unique (user_id, visit_date)
);

alter table public.site_daily_visits enable row level security;
revoke all on table public.site_daily_visits from public, anon, authenticated;

create or replace function public.record_today_site_visit()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return false;
  end if;

  insert into public.site_daily_visits (user_id, visit_date)
  values (v_user_id, (now() at time zone 'Asia/Seoul')::date)
  on conflict (user_id, visit_date) do nothing;

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

revoke all on function public.record_today_site_visit() from public, anon;
grant execute on function public.record_today_site_visit() to authenticated;

revoke all on function public.get_site_stats() from public;
grant execute on function public.get_site_stats() to anon, authenticated;
