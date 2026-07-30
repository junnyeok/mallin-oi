-- 2026-07-30 캘린더 붙여넣기 카테고리 충돌·덮어쓰기·중복 실행 수정
-- 인증된 그룹원이 열람 가능한 백업 일정만 자신의 독립 일정으로 추가한다.

create table if not exists public.calendar_paste_operations (
  user_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  calendar_type text not null,
  source_user_id uuid not null references auth.users(id) on delete cascade,
  start_date date,
  end_date date,
  inserted_count integer not null,
  completed_at timestamptz not null default now(),
  primary key (user_id, operation_id),
  constraint calendar_paste_operations_type_check
    check (calendar_type in ('study', 'work', 'event')),
  constraint calendar_paste_operations_date_pair_check
    check ((start_date is null) = (end_date is null)),
  constraint calendar_paste_operations_date_order_check
    check (start_date is null or start_date <= end_date),
  constraint calendar_paste_operations_count_check
    check (inserted_count >= 0)
);

create index if not exists calendar_paste_operations_completed_idx
  on public.calendar_paste_operations (completed_at);

alter table public.calendar_paste_operations enable row level security;
revoke all on table public.calendar_paste_operations from public, anon, authenticated;

drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid);
drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date);
drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid);

create function public.paste_group_calendar_backup_to_my_calendar(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_operation_id uuid default null
)
returns table (success boolean, message text, inserted_count integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer := 0;
  v_is_range boolean := p_start_date is not null and p_end_date is not null;
  v_previous public.calendar_paste_operations%rowtype;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_calendar_type not in ('study', 'work', 'event') then
    raise exception '지원하지 않는 캘린더 타입이에요.';
  end if;
  if (p_start_date is null) <> (p_end_date is null) then
    raise exception '시작일과 종료일을 모두 입력해줘.';
  end if;
  if v_is_range and p_start_date > p_end_date then
    raise exception '시작일은 종료일보다 늦을 수 없어요.';
  end if;

  if not exists (
    select 1
    from public.calendar_group_members m
    where m.group_id = p_group_id
      and m.user_id = v_user_id
      and m.status = 'active'
  ) then
    raise exception '이 그룹의 참여자가 아니에요.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.calendar_groups g
    where g.id = p_group_id
      and case p_calendar_type
        when 'study' then g.allow_study
        when 'work' then g.allow_work
        else g.allow_event
      end
  ) then
    raise exception '이 그룹에서 사용할 수 없는 캘린더 타입이에요.' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.calendar_group_members m
    where m.group_id = p_group_id
      and m.user_id = p_source_user_id
      and m.status = 'active'
  ) then
    raise exception '복사할 그룹원이 현재 참여 중이 아니에요.' using errcode = '42501';
  end if;

  if p_operation_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
    );

    delete from public.calendar_paste_operations
    where completed_at < now() - interval '90 days';

    select *
      into v_previous
    from public.calendar_paste_operations o
    where o.user_id = v_user_id
      and o.operation_id = p_operation_id;

    if found then
      if v_previous.group_id is distinct from p_group_id
        or v_previous.calendar_type is distinct from p_calendar_type
        or v_previous.source_user_id is distinct from p_source_user_id
        or v_previous.start_date is distinct from p_start_date
        or v_previous.end_date is distinct from p_end_date
      then
        raise exception '이미 사용한 붙여넣기 요청 식별자예요.';
      end if;

      return query select true, '이미 완료한 붙여넣기 요청이에요.', v_previous.inserted_count;
      return;
    end if;
  end if;

  if not exists (
    select 1
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = p_calendar_type
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
  ) then
    if v_is_range then
      raise exception '해당 날짜 범위에 복사할 일정이 없어요.';
    end if;
    raise exception '복사할 백업 일정이 없어요.';
  end if;

  if p_calendar_type = 'study' then
    insert into public.study_calendar_categories (
      user_id, name, slug, color, is_default, sort_order
    )
    select distinct
      v_user_id,
      left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20),
      coalesce(nullif(trim(e.event_type), ''), 'etc'),
      case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#eaffd7' end,
      false,
      100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'study'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
      and not exists (
        select 1
        from public.study_calendar_categories c
        where c.user_id = v_user_id
          and (
            lower(trim(c.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))
            or c.slug = coalesce(nullif(trim(e.event_type), ''), 'etc')
          )
      )
    on conflict do nothing;

    insert into public.study_calendar_todos (
      user_id, todo_date, todo_time, todo_end_date, todo_end_time,
      todo_type, category_id, todo_text, memo, is_done
    )
    select
      v_user_id,
      e.event_date,
      nullif(e.payload->>'todoTime', '')::time,
      case
        when nullif(e.payload->>'todoTime', '') is not null
          and nullif(e.payload->>'todoEndDate', '') is not null
          and nullif(e.payload->>'todoEndTime', '') is not null
        then (e.payload->>'todoEndDate')::date
        else null
      end,
      case
        when nullif(e.payload->>'todoTime', '') is not null
          and nullif(e.payload->>'todoEndDate', '') is not null
          and nullif(e.payload->>'todoEndTime', '') is not null
        then (e.payload->>'todoEndTime')::time
        else null
      end,
      coalesce(c.slug, nullif(trim(e.event_type), ''), 'etc'),
      c.id,
      e.title,
      coalesce(e.memo, ''),
      case lower(coalesce(e.payload->>'isDone', 'false'))
        when 'true' then true when '1' then true when 't' then true when 'yes' then true when 'on' then true
        else false
      end
    from public.calendar_group_shared_events e
    left join lateral (
      select category.id, category.slug
      from public.study_calendar_categories category
      where category.user_id = v_user_id
        and (
          lower(trim(category.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))
          or category.slug = coalesce(nullif(trim(e.event_type), ''), 'etc')
        )
      order by
        (lower(trim(category.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))) desc,
        category.created_at
      limit 1
    ) c on true
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'study'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;

  elsif p_calendar_type = 'work' then
    insert into public.work_calendar_categories (
      user_id, name, slug, color, start_time, end_time, ends_next_day,
      is_default, sort_order
    )
    select distinct
      v_user_id,
      left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20),
      coalesce(nullif(trim(e.event_type), ''), 'workday'),
      case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#e7f6ff' end,
      nullif(e.payload->>'categoryStartTime', '')::time,
      case
        when nullif(e.payload->>'categoryStartTime', '') is not null
        then nullif(e.payload->>'categoryEndTime', '')::time
        else null
      end,
      case
        when nullif(e.payload->>'categoryStartTime', '') is not null
          and nullif(e.payload->>'categoryEndTime', '') is not null
        then (e.payload->>'categoryEndTime')::time < (e.payload->>'categoryStartTime')::time
        else false
      end,
      false,
      100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'work'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
      and not exists (
        select 1
        from public.work_calendar_categories c
        where c.user_id = v_user_id
          and (
            lower(trim(c.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))
            or c.slug = coalesce(nullif(trim(e.event_type), ''), 'workday')
          )
      )
    on conflict do nothing;

    insert into public.work_calendar_todos (
      user_id, work_date, work_type, category_id, work_text, memo, is_done
    )
    select
      v_user_id,
      e.event_date,
      coalesce(c.slug, nullif(trim(e.event_type), ''), 'workday'),
      c.id,
      coalesce(nullif(e.payload->>'workText', ''), e.title),
      coalesce(e.memo, ''),
      case lower(coalesce(e.payload->>'isDone', 'false'))
        when 'true' then true when '1' then true when 't' then true when 'yes' then true when 'on' then true
        else false
      end
    from public.calendar_group_shared_events e
    left join lateral (
      select category.id, category.slug
      from public.work_calendar_categories category
      where category.user_id = v_user_id
        and (
          lower(trim(category.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))
          or category.slug = coalesce(nullif(trim(e.event_type), ''), 'workday')
        )
      order by
        (lower(trim(category.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))) desc,
        category.created_at
      limit 1
    ) c on true
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'work'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;

  else
    insert into public.event_calendar_categories (
      user_id, name, slug, color, is_default, sort_order
    )
    select distinct
      v_user_id,
      left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20),
      coalesce(nullif(trim(e.event_type), ''), 'appointment'),
      case when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then e.color else '#ffe0ef' end,
      false,
      100
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'event'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
      and not exists (
        select 1
        from public.event_calendar_categories c
        where c.user_id = v_user_id
          and (
            lower(trim(c.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))
            or c.slug = coalesce(nullif(trim(e.event_type), ''), 'appointment')
          )
      )
    on conflict do nothing;

    with source_events as (
      select
        e.*,
        case
          when coalesce(e.payload->>'eventRangeId', '') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          then e.payload->>'eventRangeId'
          else null
        end as old_range_id
      from public.calendar_group_shared_events e
      where e.group_id = p_group_id
        and e.user_id = p_source_user_id
        and e.calendar_type = 'event'
        and (not v_is_range or e.event_date between p_start_date and p_end_date)
    ),
    range_keys as (
      select distinct old_range_id
      from source_events
      where old_range_id is not null
    ),
    range_map as (
      select old_range_id, gen_random_uuid() as new_range_id
      from range_keys
    )
    insert into public.event_calendar_todos (
      user_id, event_date, event_type, category_id, event_text, memo,
      event_time, event_end_time, event_range_id, is_done
    )
    select
      v_user_id,
      e.event_date,
      coalesce(c.slug, nullif(trim(e.event_type), ''), 'appointment'),
      c.id,
      e.title,
      coalesce(e.memo, ''),
      case
        when coalesce(e.payload->>'eventTime', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (e.payload->>'eventTime')::time
        else null
      end,
      case
        when coalesce(e.payload->>'eventEndTime', '') ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (e.payload->>'eventEndTime')::time
        else null
      end,
      r.new_range_id,
      case lower(coalesce(e.payload->>'isDone', 'false'))
        when 'true' then true when '1' then true when 't' then true when 'yes' then true when 'on' then true
        else false
      end
    from source_events e
    left join range_map r on r.old_range_id = e.old_range_id
    left join lateral (
      select category.id, category.slug
      from public.event_calendar_categories category
      where category.user_id = v_user_id
        and (
          lower(trim(category.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))
          or category.slug = coalesce(nullif(trim(e.event_type), ''), 'appointment')
        )
      order by
        (lower(trim(category.name)) = lower(left(coalesce(nullif(trim(e.payload->>'categoryName'), ''), trim(e.title)), 20))) desc,
        category.created_at
      limit 1
    ) c on true
    order by e.event_date, e.created_at;
  end if;

  get diagnostics v_count = row_count;

  if p_operation_id is not null then
    insert into public.calendar_paste_operations (
      user_id, operation_id, group_id, calendar_type, source_user_id,
      start_date, end_date, inserted_count
    ) values (
      v_user_id, p_operation_id, p_group_id, p_calendar_type, p_source_user_id,
      p_start_date, p_end_date, v_count
    );
  end if;

  return query select true, '캘린더 붙여넣기를 완료했어요.', v_count;
end;
$$;

revoke all on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid)
  from public, anon;
grant execute on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid)
  to authenticated;

-- 다음 백업부터 업무 카테고리명과 이벤트 종료시간/기간 연결도 보존한다.
create or replace function public.backup_my_calendar_to_group(
  p_group_id uuid,
  p_calendar_type text
)
returns table (event_count integer, backed_up_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_count integer := 0;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.' using errcode = '42501';
  end if;
  if not public.is_calendar_group_member(p_group_id, v_uid) then
    raise exception '그룹 멤버만 백업할 수 있습니다.' using errcode = '42501';
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
    raise exception '이 그룹은 해당 캘린더 연동이 꺼져 있습니다.' using errcode = '42501';
  end if;

  delete from public.calendar_group_shared_events e
  where e.group_id = p_group_id
    and e.calendar_type = p_calendar_type
    and (
      case lower(coalesce(e.payload->>'is_shared_copy', 'false'))
        when 'true' then true when '1' then true when 't' then true
        else false
      end
      or (p_calendar_type = 'study' and exists (
        select 1 from public.study_calendar_todos t
        where t.id::text = e.source_event_id and t.is_shared_copy = true
      ))
      or (p_calendar_type = 'work' and exists (
        select 1 from public.work_calendar_todos t
        where t.id::text = e.source_event_id and t.is_shared_copy = true
      ))
      or (p_calendar_type = 'event' and exists (
        select 1 from public.event_calendar_todos t
        where t.id::text = e.source_event_id and t.is_shared_copy = true
      ))
    );

  if p_calendar_type = 'event' then
    delete from public.calendar_group_shared_events stale
    where stale.group_id = p_group_id
      and stale.calendar_type = 'event'
      and not exists (
        select 1 from public.event_calendar_todos source
        where source.id::text = stale.source_event_id
      )
      and exists (
        select 1 from public.event_calendar_todos root
        where root.shared_group_id = p_group_id
          and root.is_shared_copy = false
          and root.event_date = stale.event_date
          and root.event_text = stale.title
          and coalesce(root.event_type, '') = coalesce(stale.event_type, '')
      );
  end if;

  delete from public.calendar_group_shared_events e
  where e.group_id = p_group_id
    and e.user_id = v_uid
    and e.calendar_type = p_calendar_type;

  if p_calendar_type = 'study' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id, t.user_id, 'study', t.id::text, t.todo_date,
      coalesce(c.slug, t.todo_type), t.todo_text, coalesce(t.memo, ''), c.color,
      jsonb_build_object(
        'isDone', t.is_done,
        'categoryName', c.name,
        'todoTime', t.todo_time,
        'todoEndDate', t.todo_end_date,
        'todoEndTime', t.todo_end_time,
        'shared_group_id', t.shared_group_id,
        'shared_origin_todo_id', t.shared_origin_todo_id,
        'shared_origin_user_id', t.shared_origin_user_id,
        'shared_created_by', t.shared_created_by,
        'is_shared_copy', t.is_shared_copy
      ),
      v_now
    from public.study_calendar_todos t
    left join public.study_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid
      and coalesce(t.is_shared_copy, false) = false
      and (t.shared_group_id is null or t.shared_group_id = p_group_id);

  elsif p_calendar_type = 'work' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id, t.user_id, 'work', t.id::text, t.work_date,
      coalesce(c.slug, t.work_type), coalesce(c.name, t.work_text),
      coalesce(t.memo, ''), c.color,
      jsonb_build_object(
        'isDone', t.is_done,
        'workText', t.work_text,
        'categoryName', c.name,
        'categoryStartTime', c.start_time,
        'categoryEndTime', c.end_time,
        'categoryEndsNextDay', c.ends_next_day,
        'shared_group_id', t.shared_group_id,
        'shared_origin_todo_id', t.shared_origin_todo_id,
        'shared_origin_user_id', t.shared_origin_user_id,
        'shared_created_by', t.shared_created_by,
        'is_shared_copy', t.is_shared_copy
      ),
      v_now
    from public.work_calendar_todos t
    left join public.work_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid
      and coalesce(t.is_shared_copy, false) = false
      and (t.shared_group_id is null or t.shared_group_id = p_group_id);

  elsif p_calendar_type = 'event' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id, t.user_id, 'event', t.id::text, t.event_date,
      coalesce(c.slug, t.event_type), t.event_text, coalesce(t.memo, ''), c.color,
      jsonb_build_object(
        'isDone', t.is_done,
        'eventTime', t.event_time,
        'eventEndTime', t.event_end_time,
        'eventRangeId', t.event_range_id,
        'categoryName', c.name,
        'shared_group_id', t.shared_group_id,
        'shared_origin_todo_id', t.shared_origin_todo_id,
        'shared_origin_user_id', t.shared_origin_user_id,
        'shared_created_by', t.shared_created_by,
        'is_shared_copy', t.is_shared_copy
      ),
      v_now
    from public.event_calendar_todos t
    left join public.event_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid
      and coalesce(t.is_shared_copy, false) = false
      and (t.shared_group_id is null or t.shared_group_id = p_group_id);
  else
    raise exception '지원하지 않는 캘린더 타입입니다.';
  end if;

  get diagnostics v_count = row_count;
  return query select v_count::integer, v_now;
end;
$$;

revoke all on function public.backup_my_calendar_to_group(uuid, text) from public, anon;
grant execute on function public.backup_my_calendar_to_group(uuid, text) to authenticated;
