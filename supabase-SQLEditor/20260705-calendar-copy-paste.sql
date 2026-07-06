-- 20260705 그룹 캘린더 백업 복사/개인 캘린더 붙여넣기

update public.calendar_groups
set is_common_calendar = false
where is_common_calendar is true;

create or replace function public.get_group_calendar_copy_sources(
  p_group_id uuid,
  p_calendar_type text
)
returns table (
  source_user_id uuid,
  nickname text,
  avatar_url text,
  backup_count integer,
  last_backed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요해요.'; end if;
  if p_calendar_type not in ('study', 'work', 'event') then raise exception '지원하지 않는 캘린더 타입이에요.'; end if;
  if not exists (
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = auth.uid() and m.status = 'active'
  ) then raise exception '이 그룹의 참여자가 아니에요.'; end if;
  if not exists (
    select 1 from public.calendar_groups g
    where g.id = p_group_id
      and case p_calendar_type when 'study' then g.allow_study when 'work' then g.allow_work else g.allow_event end
  ) then raise exception '이 그룹에서 사용할 수 없는 캘린더 타입이에요.'; end if;

  return query
  select e.user_id, coalesce(p.nickname, '알 수 없는 사용자'), null::text,
         count(*)::integer, max(e.backed_up_at)
  from public.calendar_group_shared_events e
  join public.calendar_group_members m
    on m.group_id = e.group_id and m.user_id = e.user_id and m.status = 'active'
  left join public.profiles p on p.id = e.user_id
  where e.group_id = p_group_id and e.calendar_type = p_calendar_type
  group by e.user_id, p.nickname
  order by max(e.backed_up_at) desc, coalesce(p.nickname, '알 수 없는 사용자');
end;
$$;

create or replace function public.paste_group_calendar_backup_to_my_calendar(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid
)
returns table (success boolean, message text, inserted_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
begin
  if v_user_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_calendar_type not in ('study', 'work', 'event') then raise exception '지원하지 않는 캘린더 타입이에요.'; end if;
  if not exists (
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = v_user_id and m.status = 'active'
  ) then raise exception '이 그룹의 참여자가 아니에요.'; end if;
  if not exists (
    select 1 from public.calendar_groups g
    where g.id = p_group_id
      and case p_calendar_type when 'study' then g.allow_study when 'work' then g.allow_work else g.allow_event end
  ) then raise exception '이 그룹에서 사용할 수 없는 캘린더 타입이에요.'; end if;
  if not exists (
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = p_source_user_id and m.status = 'active'
  ) then raise exception '복사할 그룹원이 현재 참여 중이 아니에요.'; end if;
  if not exists (
    select 1 from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = p_calendar_type
  ) then raise exception '복사할 백업 일정이 없어요.'; end if;

  if p_calendar_type = 'study' then
    delete from public.study_calendar_todos where user_id = v_user_id;
    insert into public.study_calendar_categories (user_id, name, slug, color, is_default, sort_order)
    select distinct v_user_id, left(coalesce(nullif(e.payload->>'categoryName', ''), e.title), 20),
           coalesce(nullif(e.event_type, ''), 'etc'),
           case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#eaffd7' end,
           false, 100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'study'
    on conflict (user_id, slug) do nothing;
    insert into public.study_calendar_todos (user_id, todo_date, todo_type, category_id, todo_text, memo, is_done)
    select v_user_id, e.event_date,
           coalesce(nullif(e.event_type, ''), 'etc'),
           (select c.id from public.study_calendar_categories c where c.user_id = v_user_id and c.slug = coalesce(nullif(e.event_type, ''), 'etc') limit 1),
           e.title, coalesce(e.memo, ''), coalesce((e.payload->>'isDone')::boolean, false)
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'study'
    order by e.event_date, e.created_at;
  elsif p_calendar_type = 'work' then
    delete from public.work_calendar_todos where user_id = v_user_id;
    insert into public.work_calendar_categories (user_id, name, slug, color, is_default, sort_order)
    select distinct v_user_id, left(coalesce(nullif(e.payload->>'categoryName', ''), e.title), 20),
           coalesce(nullif(e.event_type, ''), 'workday'),
           case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#e7f6ff' end,
           false, 100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'work'
    on conflict (user_id, slug) do nothing;
    insert into public.work_calendar_todos (user_id, work_date, work_type, category_id, work_text, memo, is_done)
    select v_user_id, e.event_date, coalesce(nullif(e.event_type, ''), 'workday'),
           (select c.id from public.work_calendar_categories c where c.user_id = v_user_id and c.slug = coalesce(nullif(e.event_type, ''), 'workday') limit 1),
           coalesce(nullif(e.payload->>'workText', ''), e.title), coalesce(e.memo, ''),
           coalesce((e.payload->>'isDone')::boolean, false)
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'work'
    order by e.event_date, e.created_at;
  else
    delete from public.event_calendar_todos where user_id = v_user_id;
    insert into public.event_calendar_categories (user_id, name, slug, color, is_default, sort_order)
    select distinct v_user_id, left(coalesce(nullif(e.payload->>'categoryName', ''), e.title), 20),
           coalesce(nullif(e.event_type, ''), 'appointment'),
           case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#ffe0ef' end,
           false, 100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'event'
    on conflict (user_id, slug) do nothing;
    insert into public.event_calendar_todos (
      user_id, event_date, event_type, category_id, event_text, memo,
      event_time, event_end_time, is_done
    )
    select v_user_id, e.event_date, coalesce(nullif(e.event_type, ''), 'appointment'),
           (select c.id from public.event_calendar_categories c where c.user_id = v_user_id and c.slug = coalesce(nullif(e.event_type, ''), 'appointment') limit 1),
           e.title, coalesce(e.memo, ''),
           coalesce(nullif(e.payload->>'eventTime', '')::time, '00:00'::time),
           nullif(e.payload->>'eventEndTime', '')::time,
           coalesce((e.payload->>'isDone')::boolean, false)
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'event'
    order by e.event_date, e.created_at;
  end if;

  get diagnostics v_count = row_count;
  return query select true, '캘린더 붙여넣기를 완료했어요.'::text, v_count;
end;
$$;

revoke all on function public.get_group_calendar_copy_sources(uuid, text) from public, anon;
revoke all on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid) from public, anon;
grant execute on function public.get_group_calendar_copy_sources(uuid, text) to authenticated;
grant execute on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid) to authenticated;
