-- Permanent earned XP. Source records remain untouched; unique keys make replay safe.
begin;
create table if not exists public.member_xp_events (
 user_id uuid not null references auth.users(id) on delete cascade,
 activity text not null check(activity in ('post','comment','attendance','reaction_given','reaction_received')),
 source_key text not null,
 xp integer not null check(xp > 0),
 earned_at timestamptz not null default now(),
 primary key(user_id,activity,source_key)
);
alter table public.member_xp_events enable row level security;
revoke all on public.member_xp_events from public,anon,authenticated;

create or replace function public.record_member_activity_xp() returns trigger
language plpgsql security definer set search_path='' as $$
declare owner_id uuid;
begin
 if tg_table_name='posts' then
  insert into public.member_xp_events values(new.author_id,'post',new.id::text,20,new.created_at) on conflict do nothing;
 elsif tg_table_name='post_comments' then
  insert into public.member_xp_events select new.author_id,'comment',new.id::text,5,new.created_at
   where exists(select 1 from auth.users where id=new.author_id) on conflict do nothing;
 elsif tg_table_name='pickle_ledger' then
  if new.reason_code='attendance' and new.amount>0 then
  insert into public.member_xp_events values(new.user_id,'attendance',new.awarded_on::text,10,new.created_at) on conflict do nothing;
  end if;
 elsif tg_table_name='post_reactions' then
  select author_id into owner_id from public.posts where id=new.post_id;
  if owner_id is not null and owner_id<>new.user_id then
   insert into public.member_xp_events values
    (new.user_id,'reaction_given',new.post_id::text,2,new.created_at),
    (owner_id,'reaction_received',new.post_id::text||':'||new.user_id::text,3,new.created_at)
    on conflict do nothing;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function public.record_member_activity_xp() from public,anon,authenticated;
drop trigger if exists member_xp_post on public.posts;
create trigger member_xp_post after insert on public.posts for each row execute function public.record_member_activity_xp();
drop trigger if exists member_xp_comment on public.post_comments;
create trigger member_xp_comment after insert on public.post_comments for each row execute function public.record_member_activity_xp();
drop trigger if exists member_xp_attendance on public.pickle_ledger;
create trigger member_xp_attendance after insert on public.pickle_ledger for each row execute function public.record_member_activity_xp();
drop trigger if exists member_xp_reaction on public.post_reactions;
create trigger member_xp_reaction after insert on public.post_reactions for each row execute function public.record_member_activity_xp();

insert into public.member_xp_events
 select author_id,'post',id::text,20,created_at from public.posts
 on conflict do nothing;
insert into public.member_xp_events
 select c.author_id,'comment',c.id::text,5,c.created_at from public.post_comments c join auth.users u on u.id=c.author_id
 on conflict do nothing;
insert into public.member_xp_events
 select user_id,'attendance',awarded_on::text,10,min(created_at) from public.pickle_ledger
 where reason_code='attendance' and amount>0 group by user_id,awarded_on on conflict do nothing;
insert into public.member_xp_events
 select r.user_id,'reaction_given',r.post_id::text,2,r.created_at from public.post_reactions r
 join public.posts p on p.id=r.post_id where p.author_id<>r.user_id on conflict do nothing;
insert into public.member_xp_events
 select p.author_id,'reaction_received',r.post_id::text||':'||r.user_id::text,3,r.created_at from public.post_reactions r
 join public.posts p on p.id=r.post_id where p.author_id<>r.user_id on conflict do nothing;

-- Only public profile fields and aggregate XP, never private activity details.
create or replace view public.public_member_levels as
 with totals as (select user_id,sum(xp)::bigint as total_xp from public.member_xp_events group by user_id),
 levels as (select p.id,p.nickname,p.profile_image_url,p.equipped_character_image_url,
 p.equipped_character_effect_item_id,p.equipped_profile_background_item_id,p.equipped_profile_frame_item_id,
 coalesce(t.total_xp,0)::bigint as total_xp,
 floor((1+sqrt(1+coalesce(t.total_xp,0)::numeric/12.5))/2)::integer as level
 from public.public_profiles p left join totals t on t.user_id=p.id)
 select l.*, (total_xp-50::bigint*(level-1)*level) as level_xp,100::bigint*level as next_level_xp from levels l;
grant select on public.public_member_levels to anon,authenticated;
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
      nullif(btrim(p.profile_image_url), '') as avatar_url, p.total_xp, p.level, p.level_xp, p.next_level_xp
    from visitors v
    join public.public_member_levels p on p.id = v.user_id
  ), matching as (
    select p.*
    from people p
    where v_search = '' or strpos(lower(p.nickname), v_search) > 0
  ), page as (
    select p.*
    from matching p
    order by p.total_xp desc, lower(p.nickname), p.user_id
    offset v_offset
    limit v_limit
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', p.user_id,
        'nickname', p.nickname,
        'avatar_url', p.avatar_url, 'total_xp',p.total_xp, 'level',p.level, 'level_xp',p.level_xp, 'next_level_xp',p.next_level_xp
      ) order by p.total_xp desc, lower(p.nickname), p.user_id)
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


notify pgrst,'reload schema';
commit;
