-- Only signed-in members may list today's visiting members. Keep the visit
-- table private and expose no guest identifiers, visit times or past dates.
begin;

create or replace function public.get_today_site_people(
  p_search text default '',
  p_offset integer default 0,
  p_limit integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_search text := lower(left(btrim(coalesce(p_search, '')), 100));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 100);
  v_result jsonb;
begin
  if auth.uid() is null then
    raise exception '로그인 후 오늘 방문한 회원을 볼 수 있어.' using errcode = '42501';
  end if;

  with visitors as (
    select distinct v.user_id
    from public.site_daily_visits v
    where v.visit_date = v_today
      and v.user_id is not null
  ), people as (
    select
      p.id as user_id,
      coalesce(nullif(btrim(p.nickname), ''), '회원') as nickname,
      nullif(btrim(p.profile_image_url), '') as avatar_url
    from visitors v
    join public.public_profiles p on p.id = v.user_id
  ), matching as (
    select p.*
    from people p
    where v_search = '' or strpos(lower(p.nickname), v_search) > 0
  ), page as (
    select p.*
    from matching p
    order by lower(p.nickname), p.user_id
    offset v_offset
    limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url
      ) order by lower(p.nickname), p.user_id)
      from page p
    ), '[]'::jsonb),
    'total', (select count(*) from matching),
    -- Match get_site_stats' guest deduplication, without exposing its keys.
    'guestCount', (
      select count(distinct coalesce('guest:' || v.guest_id::text, v.visitor_key))
      from public.site_daily_visits v
      where v.visit_date = v_today
        and v.user_id is null
    ),
    'date', v_today::text
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_today_site_people(text, integer, integer) from public, anon;
grant execute on function public.get_today_site_people(text, integer, integer) to authenticated;

commit;
