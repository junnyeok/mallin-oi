-- 20260706 그룹 캘린더 백업 날짜 범위 복사/붙여넣기

drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid);

create or replace function public.paste_group_calendar_backup_to_my_calendar(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
  p_start_date date default null,
  p_end_date date default null
)
returns table (success boolean, message text, inserted_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_is_range boolean := p_start_date is not null and p_end_date is not null;
begin
  if v_user_id is null then raise exception '로그인이 필요해요.'; end if;
  if p_calendar_type not in ('study', 'work', 'event') then raise exception '지원하지 않는 캘린더 타입이에요.'; end if;
  if (p_start_date is null) <> (p_end_date is null) then raise exception '시작일과 종료일을 모두 입력해줘.'; end if;
  if v_is_range and p_start_date > p_end_date then raise exception '시작일은 종료일보다 늦을 수 없어요.'; end if;
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
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = p_calendar_type
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
  ) then
    if v_is_range then raise exception '해당 날짜 범위에 복사할 일정이 없어요.';
    else raise exception '복사할 백업 일정이 없어요.';
    end if;
  end if;

  if p_calendar_type = 'study' then
    if v_is_range then
      delete from public.study_calendar_todos
      where user_id = v_user_id and todo_date between p_start_date and p_end_date;
    else
      delete from public.study_calendar_todos where user_id = v_user_id;
    end if;
    insert into public.study_calendar_categories (user_id, name, slug, color, is_default, sort_order)
    select distinct v_user_id, left(coalesce(nullif(e.payload->>'categoryName', ''), e.title), 20),
           coalesce(nullif(e.event_type, ''), 'etc'),
           case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#eaffd7' end,
           false, 100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'study'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    on conflict (user_id, slug) do nothing;
    insert into public.study_calendar_todos (user_id, todo_date, todo_type, category_id, todo_text, memo, is_done)
    select v_user_id, e.event_date, coalesce(nullif(e.event_type, ''), 'etc'),
           (select c.id from public.study_calendar_categories c where c.user_id = v_user_id and c.slug = coalesce(nullif(e.event_type, ''), 'etc') limit 1),
           e.title, coalesce(e.memo, ''), coalesce((e.payload->>'isDone')::boolean, false)
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'study'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;
  elsif p_calendar_type = 'work' then
    if v_is_range then
      delete from public.work_calendar_todos
      where user_id = v_user_id and work_date between p_start_date and p_end_date;
    else
      delete from public.work_calendar_todos where user_id = v_user_id;
    end if;
    insert into public.work_calendar_categories (user_id, name, slug, color, is_default, sort_order)
    select distinct v_user_id, left(coalesce(nullif(e.payload->>'categoryName', ''), e.title), 20),
           coalesce(nullif(e.event_type, ''), 'workday'),
           case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#e7f6ff' end,
           false, 100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'work'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    on conflict (user_id, slug) do nothing;
    insert into public.work_calendar_todos (user_id, work_date, work_type, category_id, work_text, memo, is_done)
    select v_user_id, e.event_date, coalesce(nullif(e.event_type, ''), 'workday'),
           (select c.id from public.work_calendar_categories c where c.user_id = v_user_id and c.slug = coalesce(nullif(e.event_type, ''), 'workday') limit 1),
           coalesce(nullif(e.payload->>'workText', ''), e.title), coalesce(e.memo, ''),
           coalesce((e.payload->>'isDone')::boolean, false)
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'work'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;
  else
    if v_is_range then
      delete from public.event_calendar_todos
      where user_id = v_user_id and event_date between p_start_date and p_end_date;
    else
      delete from public.event_calendar_todos where user_id = v_user_id;
    end if;
    insert into public.event_calendar_categories (user_id, name, slug, color, is_default, sort_order)
    select distinct v_user_id, left(coalesce(nullif(e.payload->>'categoryName', ''), e.title), 20),
           coalesce(nullif(e.event_type, ''), 'appointment'),
           case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#ffe0ef' end,
           false, 100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id and e.user_id = p_source_user_id and e.calendar_type = 'event'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
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
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;
  end if;

  get diagnostics v_count = row_count;
  return query select true,
    case when v_is_range then '선택한 날짜 범위 붙여넣기를 완료했어요.' else '캘린더 붙여넣기를 완료했어요.' end,
    v_count;
end;
$$;

revoke all on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date) from public, anon;
grant execute on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date) to authenticated;
