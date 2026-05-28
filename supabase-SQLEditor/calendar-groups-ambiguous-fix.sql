-- 캘린더 그룹 공유 기능 ambiguous id 수정 실행 SQL (2026-05-28)

create or replace function public.backup_my_calendar_to_group(
  p_group_id uuid,
  p_calendar_type text
)
returns table (
  event_count integer,
  backed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_count integer := 0;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_calendar_group_member(p_group_id, v_uid) then
    raise exception '그룹 멤버만 백업할 수 있습니다.';
  end if;

  select case p_calendar_type
    when 'study' then cg.allow_study
    when 'work' then cg.allow_work
    when 'event' then cg.allow_event
    else false
  end
    into v_allowed
  from public.calendar_groups cg
  where cg.id = p_group_id;

  if not coalesce(v_allowed, false) then
    raise exception '이 그룹은 해당 캘린더 연동이 꺼져 있습니다.';
  end if;

  delete from public.calendar_group_shared_events cgse
  where cgse.group_id = p_group_id
    and cgse.user_id = v_uid
    and cgse.calendar_type = p_calendar_type;

  if p_calendar_type = 'study' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id,
      t.user_id,
      'study',
      t.id::text,
      t.todo_date,
      coalesce(c.slug, t.todo_type),
      t.todo_text,
      coalesce(t.memo, ''),
      c.color,
      jsonb_build_object('isDone', t.is_done, 'categoryName', c.name),
      v_now
    from public.study_calendar_todos t
    left join public.study_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid;

  elsif p_calendar_type = 'work' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id,
      t.user_id,
      'work',
      t.id::text,
      t.work_date,
      coalesce(c.slug, t.work_type),
      coalesce(c.name, t.work_text),
      coalesce(t.memo, ''),
      c.color,
      jsonb_build_object('isDone', t.is_done, 'workText', t.work_text),
      v_now
    from public.work_calendar_todos t
    left join public.work_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid;

  elsif p_calendar_type = 'event' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id,
      t.user_id,
      'event',
      t.id::text,
      t.event_date,
      coalesce(c.slug, t.event_type),
      t.event_text,
      coalesce(t.memo, ''),
      c.color,
      jsonb_build_object('isDone', t.is_done, 'eventTime', t.event_time, 'categoryName', c.name),
      v_now
    from public.event_calendar_todos t
    left join public.event_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid;

  else
    raise exception '지원하지 않는 캘린더 타입입니다.';
  end if;

  get diagnostics v_count = row_count;

  return query
  select
    v_count::integer as event_count,
    v_now as backed_up_at;
end;
$$;

create or replace function public.get_group_calendar_view(
  p_group_id uuid,
  p_calendar_type text,
  p_start_date date,
  p_end_date date
)
returns table (
  id uuid,
  group_id uuid,
  user_id uuid,
  user_nickname text,
  calendar_type text,
  source_event_id text,
  event_date date,
  event_type text,
  title text,
  memo text,
  color text,
  payload jsonb,
  backed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if not public.is_calendar_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 볼 수 있습니다.';
  end if;

  select case p_calendar_type
    when 'study' then cg.allow_study
    when 'work' then cg.allow_work
    when 'event' then cg.allow_event
    else false
  end
    into v_allowed
  from public.calendar_groups cg
  where cg.id = p_group_id;

  if not coalesce(v_allowed, false) then
    return;
  end if;

  return query
  select
    e.id,
    e.group_id,
    e.user_id,
    coalesce(nullif(trim(p.nickname), ''), '회원') as user_nickname,
    e.calendar_type,
    e.source_event_id,
    e.event_date,
    e.event_type,
    e.title,
    e.memo,
    e.color,
    e.payload,
    e.backed_up_at
  from public.calendar_group_shared_events e
  join public.calendar_group_members m
    on m.group_id = e.group_id
   and m.user_id = e.user_id
   and m.status = 'active'
  left join public.profiles p on p.id = e.user_id
  where e.group_id = p_group_id
    and e.calendar_type = p_calendar_type
    and e.event_date between p_start_date and p_end_date
  order by e.event_date, coalesce(nullif(trim(p.nickname), ''), '회원'), e.created_at;
end;
$$;

grant execute on function public.backup_my_calendar_to_group(uuid, text) to authenticated;

grant execute on function public.get_group_calendar_view(uuid, text, date, date) to authenticated;
