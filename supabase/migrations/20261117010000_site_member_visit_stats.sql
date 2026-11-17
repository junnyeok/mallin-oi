-- Match the header's daily visit count to the identifiable members listed by
-- get_today_site_people. Anonymous visit records remain unchanged.
begin;

create or replace function public.get_site_stats()
returns table(member_count integer, today_visit_count integer)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select count(*)::integer from auth.users) as member_count,
    (
      select count(distinct v.user_id)::integer
      from public.site_daily_visits v
      join public.public_profiles p on p.id = v.user_id
      where v.visit_date = (now() at time zone 'Asia/Seoul')::date
        and v.user_id is not null
    ) as today_visit_count;
$function$;

commit;
