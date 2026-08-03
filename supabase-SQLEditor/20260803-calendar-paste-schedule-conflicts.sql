-- 2026-08-03 그룹 캘린더 붙여넣기 일정 충돌 정책
-- 카테고리 결정과 일정 덮어쓰기/함께 추가를 한 RPC 트랜잭션에서 처리한다.

alter table public.calendar_paste_operations
  add column if not exists overwritten_count integer not null default 0,
  add column if not exists retained_count integer not null default 0,
  add column if not exists conflict_date_count integer not null default 0,
  add column if not exists schedule_conflict_action text;

alter table public.calendar_paste_operations
  drop constraint if exists calendar_paste_operations_schedule_counts_check;

alter table public.calendar_paste_operations
  add constraint calendar_paste_operations_schedule_counts_check
  check (
    overwritten_count >= 0
    and retained_count >= 0
    and conflict_date_count >= 0
    and (
      schedule_conflict_action is null
      or schedule_conflict_action in ('reject', 'overwrite', 'merge')
    )
  );

drop function if exists public.get_group_calendar_paste_schedule_conflicts(
  uuid, text, uuid, date, date
);

create function public.get_group_calendar_paste_schedule_conflicts(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  conflict_date_count integer,
  existing_schedule_count integer,
  incoming_schedule_count integer
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_range boolean := p_start_date is not null and p_end_date is not null;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_calendar_type not in ('study', 'work', 'event') then
    raise exception '지원하지 않는 캘린더 타입이에요.' using errcode = '22023';
  end if;
  if (p_start_date is null) <> (p_end_date is null) then
    raise exception '시작일과 종료일을 모두 입력해줘.' using errcode = '22023';
  end if;
  if v_is_range and p_start_date > p_end_date then
    raise exception '시작일은 종료일보다 늦을 수 없어요.' using errcode = '22023';
  end if;
  if p_source_user_id = v_user_id then
    raise exception '다른 그룹원의 백업 일정만 복사할 수 있어요.' using errcode = '42501';
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
    return query
    with source_dates as (
      select e.event_date, count(*)::integer as incoming_count
      from public.calendar_group_shared_events e
      where e.group_id = p_group_id
        and e.user_id = p_source_user_id
        and e.calendar_type = 'study'
        and (not v_is_range or e.event_date between p_start_date and p_end_date)
      group by e.event_date
    ), conflicts as (
      select
        s.event_date,
        s.incoming_count,
        count(t.id)::integer as existing_count
      from source_dates s
      left join public.study_calendar_todos t
        on t.user_id = v_user_id and t.todo_date = s.event_date
      group by s.event_date, s.incoming_count
    )
    select
      count(*) filter (where c.existing_count > 0)::integer,
      coalesce(sum(c.existing_count), 0)::integer,
      coalesce(sum(c.incoming_count), 0)::integer
    from conflicts c;
  elsif p_calendar_type = 'work' then
    return query
    with source_dates as (
      select e.event_date, count(*)::integer as incoming_count
      from public.calendar_group_shared_events e
      where e.group_id = p_group_id
        and e.user_id = p_source_user_id
        and e.calendar_type = 'work'
        and (not v_is_range or e.event_date between p_start_date and p_end_date)
      group by e.event_date
    ), conflicts as (
      select
        s.event_date,
        s.incoming_count,
        count(t.id)::integer as existing_count
      from source_dates s
      left join public.work_calendar_todos t
        on t.user_id = v_user_id and t.work_date = s.event_date
      group by s.event_date, s.incoming_count
    )
    select
      count(*) filter (where c.existing_count > 0)::integer,
      coalesce(sum(c.existing_count), 0)::integer,
      coalesce(sum(c.incoming_count), 0)::integer
    from conflicts c;
  else
    return query
    with source_dates as (
      select e.event_date, count(*)::integer as incoming_count
      from public.calendar_group_shared_events e
      where e.group_id = p_group_id
        and e.user_id = p_source_user_id
        and e.calendar_type = 'event'
        and (not v_is_range or e.event_date between p_start_date and p_end_date)
      group by e.event_date
    ), conflicts as (
      select
        s.event_date,
        s.incoming_count,
        count(t.id)::integer as existing_count
      from source_dates s
      left join public.event_calendar_todos t
        on t.user_id = v_user_id and t.event_date = s.event_date
      group by s.event_date, s.incoming_count
    )
    select
      count(*) filter (where c.existing_count > 0)::integer,
      coalesce(sum(c.existing_count), 0)::integer,
      coalesce(sum(c.incoming_count), 0)::integer
    from conflicts c;
  end if;
end;
$$;

revoke all on function public.get_group_calendar_paste_schedule_conflicts(
  uuid, text, uuid, date, date
) from public, anon;

grant execute on function public.get_group_calendar_paste_schedule_conflicts(
  uuid, text, uuid, date, date
) to authenticated;

drop function if exists public.paste_group_calendar_backup_to_my_calendar(
  uuid, text, uuid, text, date, date, uuid, jsonb
);

create function public.paste_group_calendar_backup_to_my_calendar(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
  p_schedule_conflict_action text,
  p_start_date date default null,
  p_end_date date default null,
  p_operation_id uuid default null,
  p_category_resolutions jsonb default '[]'::jsonb
)
returns table (
  success boolean,
  message text,
  inserted_count integer,
  overwritten_count integer,
  retained_count integer,
  conflict_date_count integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_action text := lower(trim(coalesce(p_schedule_conflict_action, '')));
  v_is_range boolean := p_start_date is not null and p_end_date is not null;
  v_previous public.calendar_paste_operations%rowtype;
  v_conflict_date_count integer := 0;
  v_existing_schedule_count integer := 0;
  v_incoming_schedule_count integer := 0;
  v_inserted_count integer := 0;
  v_overwritten_count integer := 0;
  v_retained_count integer := 0;
  v_affected_event_ranges uuid[] := '{}'::uuid[];
begin
  if v_user_id is null then
    raise exception '로그인이 필요해요.' using errcode = '42501';
  end if;
  if p_calendar_type not in ('study', 'work', 'event') then
    raise exception '지원하지 않는 캘린더 타입이에요.' using errcode = '22023';
  end if;
  if v_action not in ('reject', 'overwrite', 'merge') then
    raise exception '일정 충돌 선택 형식이 올바르지 않아요.' using errcode = '22023';
  end if;
  if p_calendar_type = 'work' and v_action = 'merge' then
    raise exception '업무 일정은 기존 일정과 함께 추가할 수 없어요.' using errcode = '22023';
  end if;
  if p_operation_id is null then
    raise exception '붙여넣기 요청 식별자가 필요해요.' using errcode = '22023';
  end if;
  if (p_start_date is null) <> (p_end_date is null) then
    raise exception '시작일과 종료일을 모두 입력해줘.' using errcode = '22023';
  end if;
  if v_is_range and p_start_date > p_end_date then
    raise exception '시작일은 종료일보다 늦을 수 없어요.' using errcode = '22023';
  end if;
  if p_source_user_id = v_user_id then
    raise exception '다른 그룹원의 백업 일정만 복사할 수 있어요.' using errcode = '42501';
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

  perform pg_advisory_xact_lock(
    hashtextextended('calendar-paste:' || v_user_id::text || ':' || p_calendar_type, 0)
  );
  perform pg_advisory_xact_lock(
    hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
  );

  delete from public.calendar_paste_operations
  where completed_at < now() - interval '90 days';

  select *
  into v_previous
  from public.calendar_paste_operations o
  where o.user_id = v_user_id and o.operation_id = p_operation_id;

  if found then
    if v_previous.group_id is distinct from p_group_id
      or v_previous.calendar_type is distinct from p_calendar_type
      or v_previous.source_user_id is distinct from p_source_user_id
      or v_previous.start_date is distinct from p_start_date
      or v_previous.end_date is distinct from p_end_date
    then
      raise exception '이미 사용한 붙여넣기 요청 식별자예요.';
    end if;

    return query
    select
      true,
      '이미 완료한 붙여넣기 요청이에요.',
      v_previous.inserted_count,
      v_previous.overwritten_count,
      v_previous.retained_count,
      v_previous.conflict_date_count;
    return;
  end if;

  if p_calendar_type = 'work' and exists (
    select 1
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'work'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    group by e.event_date
    having count(*) > 1
  ) then
    raise exception '복사본에 같은 날짜의 업무 일정이 여러 개 있어요.' using errcode = '23505';
  end if;

  select
    preview.conflict_date_count,
    preview.existing_schedule_count,
    preview.incoming_schedule_count
  into
    v_conflict_date_count,
    v_existing_schedule_count,
    v_incoming_schedule_count
  from public.get_group_calendar_paste_schedule_conflicts(
    p_group_id,
    p_calendar_type,
    p_source_user_id,
    p_start_date,
    p_end_date
  ) preview;

  if v_incoming_schedule_count <= 0 then
    raise exception '복사할 백업 일정이 없어요.';
  end if;
  if v_conflict_date_count > 0 and v_action = 'reject' then
    raise exception '일정 충돌 선택이 필요해요.' using errcode = 'P0001';
  end if;

  if v_conflict_date_count > 0 and v_action = 'merge' then
    v_retained_count := v_existing_schedule_count;
  end if;

  if v_conflict_date_count > 0 and v_action = 'overwrite' then
    if p_calendar_type = 'study' then
      delete from public.study_calendar_todos t
      where t.user_id = v_user_id
        and exists (
          select 1
          from public.calendar_group_shared_events e
          where e.group_id = p_group_id
            and e.user_id = p_source_user_id
            and e.calendar_type = 'study'
            and e.event_date = t.todo_date
            and (not v_is_range or e.event_date between p_start_date and p_end_date)
        );
      get diagnostics v_overwritten_count = row_count;
    elsif p_calendar_type = 'work' then
      delete from public.work_calendar_todos t
      where t.user_id = v_user_id
        and exists (
          select 1
          from public.calendar_group_shared_events e
          where e.group_id = p_group_id
            and e.user_id = p_source_user_id
            and e.calendar_type = 'work'
            and e.event_date = t.work_date
            and (not v_is_range or e.event_date between p_start_date and p_end_date)
        );
      get diagnostics v_overwritten_count = row_count;
    else
      select coalesce(array_agg(distinct t.event_range_id), '{}'::uuid[])
      into v_affected_event_ranges
      from public.event_calendar_todos t
      where t.user_id = v_user_id
        and t.event_range_id is not null
        and exists (
          select 1
          from public.calendar_group_shared_events e
          where e.group_id = p_group_id
            and e.user_id = p_source_user_id
            and e.calendar_type = 'event'
            and e.event_date = t.event_date
            and (not v_is_range or e.event_date between p_start_date and p_end_date)
        );

      delete from public.event_calendar_todos t
      where t.user_id = v_user_id
        and exists (
          select 1
          from public.calendar_group_shared_events e
          where e.group_id = p_group_id
            and e.user_id = p_source_user_id
            and e.calendar_type = 'event'
            and e.event_date = t.event_date
            and (not v_is_range or e.event_date between p_start_date and p_end_date)
        );
      get diagnostics v_overwritten_count = row_count;

      if cardinality(v_affected_event_ranges) > 0 then
        with ordered as (
          select
            t.id,
            t.event_range_id,
            t.event_date,
            lag(t.event_date) over (
              partition by t.event_range_id order by t.event_date, t.id
            ) as previous_date
          from public.event_calendar_todos t
          where t.user_id = v_user_id
            and t.event_range_id = any(v_affected_event_ranges)
        ), marked as (
          select
            o.*,
            case
              when o.previous_date = o.event_date - 1 then 0
              else 1
            end as starts_new_segment
          from ordered o
        ), segments as (
          select
            m.*,
            sum(m.starts_new_segment) over (
              partition by m.event_range_id order by m.event_date, m.id
            ) as segment_number
          from marked m
        ), segment_ids as (
          select
            s.event_range_id,
            s.segment_number,
            gen_random_uuid() as new_range_id
          from segments s
          group by s.event_range_id, s.segment_number
        )
        update public.event_calendar_todos t
        set event_range_id = ids.new_range_id
        from segments s
        join segment_ids ids
          on ids.event_range_id = s.event_range_id
         and ids.segment_number = s.segment_number
        where t.id = s.id and t.user_id = v_user_id;
      end if;
    end if;
  end if;

  select result.inserted_count
  into v_inserted_count
  from public.paste_group_calendar_backup_to_my_calendar(
    p_group_id,
    p_calendar_type,
    p_source_user_id,
    p_start_date,
    p_end_date,
    p_operation_id,
    p_category_resolutions
  ) result;

  if v_inserted_count is null then
    raise exception '붙여넣기 결과를 확인하지 못했어요.';
  end if;

  update public.calendar_paste_operations o
  set overwritten_count = v_overwritten_count,
      retained_count = v_retained_count,
      conflict_date_count = v_conflict_date_count,
      schedule_conflict_action = v_action
  where o.user_id = v_user_id and o.operation_id = p_operation_id;

  if not found then
    raise exception '붙여넣기 작업 영수증을 저장하지 못했어요.';
  end if;

  return query
  select
    true,
    '캘린더 붙여넣기를 완료했어요.',
    v_inserted_count,
    v_overwritten_count,
    v_retained_count,
    v_conflict_date_count;
end;
$$;

revoke all on function public.paste_group_calendar_backup_to_my_calendar(
  uuid, text, uuid, text, date, date, uuid, jsonb
) from public, anon;

grant execute on function public.paste_group_calendar_backup_to_my_calendar(
  uuid, text, uuid, text, date, date, uuid, jsonb
) to authenticated;
