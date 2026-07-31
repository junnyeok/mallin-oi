-- 2026-07-31 그룹 캘린더 카테고리 매핑 RPC 정적 검사 보완
-- 임시 테이블 대신 권한이 잠긴 내부 조회 함수로 같은 트랜잭션의 ID 매핑을 계산한다.

create or replace function public.calendar_group_copy_category_targets(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
  p_target_user_id uuid,
  p_start_date date default null,
  p_end_date date default null
)
returns table (
  source_category_key text,
  source_category_id uuid,
  category_name text,
  color text,
  start_time time without time zone,
  end_time time without time zone,
  ends_next_day boolean,
  source_is_default boolean,
  source_sort_order integer,
  normalized_name text,
  target_category_id uuid,
  target_slug text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_calendar_type = 'study' then
    return query
    select
      s.source_category_key, s.source_category_id, s.category_name, s.color,
      s.start_time, s.end_time, s.ends_next_day, s.source_is_default,
      s.source_sort_order, lower(trim(s.category_name)), target.id, target.slug
    from public.calendar_group_copy_source_categories(
      p_group_id, p_calendar_type, p_source_user_id, p_start_date, p_end_date
    ) s
    left join lateral (
      select c.id, c.slug
      from public.study_calendar_categories c
      where c.user_id = p_target_user_id
        and lower(trim(c.name)) = lower(trim(s.category_name))
      order by c.sort_order, c.created_at, c.id
      limit 1
    ) target on true;
  elsif p_calendar_type = 'work' then
    return query
    select
      s.source_category_key, s.source_category_id, s.category_name, s.color,
      s.start_time, s.end_time, s.ends_next_day, s.source_is_default,
      s.source_sort_order, lower(trim(s.category_name)), target.id, target.slug
    from public.calendar_group_copy_source_categories(
      p_group_id, p_calendar_type, p_source_user_id, p_start_date, p_end_date
    ) s
    left join lateral (
      select c.id, c.slug
      from public.work_calendar_categories c
      where c.user_id = p_target_user_id
        and lower(trim(c.name)) = lower(trim(s.category_name))
      order by c.sort_order, c.created_at, c.id
      limit 1
    ) target on true;
  else
    return query
    select
      s.source_category_key, s.source_category_id, s.category_name, s.color,
      s.start_time, s.end_time, s.ends_next_day, s.source_is_default,
      s.source_sort_order, lower(trim(s.category_name)), target.id, target.slug
    from public.calendar_group_copy_source_categories(
      p_group_id, p_calendar_type, p_source_user_id, p_start_date, p_end_date
    ) s
    left join lateral (
      select c.id, c.slug
      from public.event_calendar_categories c
      where c.user_id = p_target_user_id
        and lower(trim(c.name)) = lower(trim(s.category_name))
      order by c.sort_order, c.created_at, c.id
      limit 1
    ) target on true;
  end if;
end;
$$;

revoke all on function public.calendar_group_copy_category_targets(uuid, text, uuid, uuid, date, date)
  from public, anon, authenticated;

create or replace function public.paste_group_calendar_backup_to_my_calendar(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
  p_start_date date default null,
  p_end_date date default null,
  p_operation_id uuid default null,
  p_category_resolutions jsonb default '[]'::jsonb
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
  if jsonb_typeof(coalesce(p_category_resolutions, '[]'::jsonb)) <> 'array' then
    raise exception '카테고리 충돌 선택 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = v_user_id and m.status = 'active'
  ) then
    raise exception '이 그룹의 참여자가 아니에요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.calendar_groups g
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
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = p_source_user_id and m.status = 'active'
  ) then
    raise exception '복사할 그룹원이 현재 참여 중이 아니에요.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('calendar-paste:' || v_user_id::text || ':' || p_calendar_type, 0)
  );

  if p_operation_id is not null then
    perform pg_advisory_xact_lock(
      hashtextextended(v_user_id::text || ':' || p_operation_id::text, 0)
    );
    delete from public.calendar_paste_operations
    where completed_at < now() - interval '90 days';
    select * into v_previous
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
      return query select true, '이미 완료한 붙여넣기 요청이에요.', v_previous.inserted_count;
      return;
    end if;
  end if;

  if not exists (
    select 1 from public.calendar_group_shared_events e
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

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
    where nullif(trim(item->>'sourceCategoryKey'), '') is null
       or coalesce(trim(item->>'action'), '') not in ('overwrite', 'keep')
  ) then
    raise exception '카테고리 충돌 선택 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
    group by trim(item->>'sourceCategoryKey')
    having count(*) > 1
  ) then
    raise exception '카테고리 충돌 선택 형식이 올바르지 않아요.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
    left join public.calendar_group_copy_category_targets(
      p_group_id, p_calendar_type, p_source_user_id, v_user_id,
      p_start_date, p_end_date
    ) target
      on target.source_category_key = trim(item->>'sourceCategoryKey')
    where target.source_category_key is null or target.target_category_id is null
  ) then
    raise exception '카테고리 충돌 선택 대상이 현재 복사본과 일치하지 않아요.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.calendar_group_copy_category_targets(
      p_group_id, p_calendar_type, p_source_user_id, v_user_id,
      p_start_date, p_end_date
    ) target
    where target.target_category_id is not null
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
        where trim(item->>'sourceCategoryKey') = target.source_category_key
      )
  ) then
    raise exception '카테고리 충돌 선택이 필요해요.' using errcode = 'P0001';
  end if;

  if p_calendar_type = 'study' then
    update public.study_calendar_categories c
    set name = m.category_name,
        color = m.color
    from public.calendar_group_copy_category_targets(
      p_group_id, p_calendar_type, p_source_user_id, v_user_id,
      p_start_date, p_end_date
    ) m
    where c.id = m.target_category_id
      and c.user_id = v_user_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
        where trim(item->>'sourceCategoryKey') = m.source_category_key
          and trim(item->>'action') = 'overwrite'
      );

    insert into public.study_calendar_categories (
      id, user_id, name, slug, color, is_default, sort_order
    )
    select
      m.new_category_id, v_user_id, m.category_name,
      'custom-' || m.new_category_id::text, m.color, false,
      base.max_sort_order + (row_number() over (
        order by m.source_sort_order, m.category_name, m.source_category_key
      ))::integer
    from (
      select target.*, gen_random_uuid() as new_category_id
      from public.calendar_group_copy_category_targets(
        p_group_id, p_calendar_type, p_source_user_id, v_user_id,
        p_start_date, p_end_date
      ) target
      where target.target_category_id is null
    ) m
    cross join lateral (
      select greatest(coalesce(max(c.sort_order), 0), 100) as max_sort_order
      from public.study_calendar_categories c where c.user_id = v_user_id
    ) base;
  elsif p_calendar_type = 'work' then
    update public.work_calendar_categories c
    set name = m.category_name,
        color = m.color,
        start_time = m.start_time,
        end_time = case when m.start_time is null then null else m.end_time end,
        ends_next_day = case
          when m.start_time is not null and m.end_time is not null
          then m.end_time < m.start_time
          else false
        end
    from public.calendar_group_copy_category_targets(
      p_group_id, p_calendar_type, p_source_user_id, v_user_id,
      p_start_date, p_end_date
    ) m
    where c.id = m.target_category_id
      and c.user_id = v_user_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
        where trim(item->>'sourceCategoryKey') = m.source_category_key
          and trim(item->>'action') = 'overwrite'
      );

    insert into public.work_calendar_categories (
      id, user_id, name, slug, color, start_time, end_time, ends_next_day,
      is_default, sort_order
    )
    select
      m.new_category_id, v_user_id, m.category_name,
      'custom-' || m.new_category_id::text, m.color, m.start_time,
      case when m.start_time is null then null else m.end_time end,
      case
        when m.start_time is not null and m.end_time is not null
        then m.end_time < m.start_time
        else false
      end,
      false,
      base.max_sort_order + (row_number() over (
        order by m.source_sort_order, m.category_name, m.source_category_key
      ))::integer
    from (
      select target.*, gen_random_uuid() as new_category_id
      from public.calendar_group_copy_category_targets(
        p_group_id, p_calendar_type, p_source_user_id, v_user_id,
        p_start_date, p_end_date
      ) target
      where target.target_category_id is null
    ) m
    cross join lateral (
      select greatest(coalesce(max(c.sort_order), 0), 100) as max_sort_order
      from public.work_calendar_categories c where c.user_id = v_user_id
    ) base;
  else
    update public.event_calendar_categories c
    set name = m.category_name,
        color = m.color
    from public.calendar_group_copy_category_targets(
      p_group_id, p_calendar_type, p_source_user_id, v_user_id,
      p_start_date, p_end_date
    ) m
    where c.id = m.target_category_id
      and c.user_id = v_user_id
      and exists (
        select 1
        from jsonb_array_elements(coalesce(p_category_resolutions, '[]'::jsonb)) item
        where trim(item->>'sourceCategoryKey') = m.source_category_key
          and trim(item->>'action') = 'overwrite'
      );

    insert into public.event_calendar_categories (
      id, user_id, name, slug, color, is_default, sort_order
    )
    select
      m.new_category_id, v_user_id, m.category_name,
      'custom-' || m.new_category_id::text, m.color, false,
      base.max_sort_order + (row_number() over (
        order by m.source_sort_order, m.category_name, m.source_category_key
      ))::integer
    from (
      select target.*, gen_random_uuid() as new_category_id
      from public.calendar_group_copy_category_targets(
        p_group_id, p_calendar_type, p_source_user_id, v_user_id,
        p_start_date, p_end_date
      ) target
      where target.target_category_id is null
    ) m
    cross join lateral (
      select greatest(coalesce(max(c.sort_order), 0), 100) as max_sort_order
      from public.event_calendar_categories c where c.user_id = v_user_id
    ) base;
  end if;

  if exists (
    select 1
    from public.calendar_group_copy_category_targets(
      p_group_id, p_calendar_type, p_source_user_id, v_user_id,
      p_start_date, p_end_date
    ) target
    where target.target_category_id is null
  ) then
    raise exception '복사 일정의 카테고리 매핑을 만들지 못했어요.';
  end if;

  if p_calendar_type = 'study' then
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
      category.target_slug,
      category.target_category_id,
      e.title,
      coalesce(e.memo, ''),
      case lower(coalesce(e.payload->>'isDone', 'false'))
        when 'true' then true when '1' then true when 't' then true when 'yes' then true when 'on' then true
        else false
      end
    from public.calendar_group_shared_events e
    join lateral (
      select m.target_category_id, m.target_slug
      from public.calendar_group_copy_category_targets(
        p_group_id, p_calendar_type, p_source_user_id, v_user_id,
        p_start_date, p_end_date
      ) m
      where m.source_category_key = public.calendar_copy_category_key(e.payload, e.title)
         or m.normalized_name = lower(trim(public.calendar_copy_category_name(e.payload, e.title)))
      order by (m.source_category_key = public.calendar_copy_category_key(e.payload, e.title)) desc
      limit 1
    ) category on true
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'study'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;
  elsif p_calendar_type = 'work' then
    insert into public.work_calendar_todos (
      user_id, work_date, work_type, category_id, work_text, memo, is_done
    )
    select
      v_user_id, e.event_date, category.target_slug, category.target_category_id,
      coalesce(nullif(e.payload->>'workText', ''), e.title), coalesce(e.memo, ''),
      case lower(coalesce(e.payload->>'isDone', 'false'))
        when 'true' then true when '1' then true when 't' then true when 'yes' then true when 'on' then true
        else false
      end
    from public.calendar_group_shared_events e
    join lateral (
      select m.target_category_id, m.target_slug
      from public.calendar_group_copy_category_targets(
        p_group_id, p_calendar_type, p_source_user_id, v_user_id,
        p_start_date, p_end_date
      ) m
      where m.source_category_key = public.calendar_copy_category_key(e.payload, e.title)
         or m.normalized_name = lower(trim(public.calendar_copy_category_name(e.payload, e.title)))
      order by (m.source_category_key = public.calendar_copy_category_key(e.payload, e.title)) desc
      limit 1
    ) category on true
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = 'work'
      and (not v_is_range or e.event_date between p_start_date and p_end_date)
    order by e.event_date, e.created_at;
  else
    with source_events as (
      select
        e.*,
        case
          when coalesce(e.payload->>'eventRangeId', '')
            ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
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
      select distinct old_range_id from source_events where old_range_id is not null
    ),
    range_map as (
      select old_range_id, gen_random_uuid() as new_range_id from range_keys
    )
    insert into public.event_calendar_todos (
      user_id, event_date, event_type, category_id, event_text, memo,
      event_time, event_end_time, event_range_id, is_done
    )
    select
      v_user_id, e.event_date, category.target_slug, category.target_category_id,
      e.title, coalesce(e.memo, ''),
      case
        when coalesce(e.payload->>'eventTime', '')
          ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (e.payload->>'eventTime')::time
        else null
      end,
      case
        when coalesce(e.payload->>'eventEndTime', '')
          ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
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
    join lateral (
      select m.target_category_id, m.target_slug
      from public.calendar_group_copy_category_targets(
        p_group_id, p_calendar_type, p_source_user_id, v_user_id,
        p_start_date, p_end_date
      ) m
      where m.source_category_key = public.calendar_copy_category_key(e.payload, e.title)
         or m.normalized_name = lower(trim(public.calendar_copy_category_name(e.payload, e.title)))
      order by (m.source_category_key = public.calendar_copy_category_key(e.payload, e.title)) desc
      limit 1
    ) category on true
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

revoke all on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid, jsonb)
  from public, anon;
grant execute on function public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid, jsonb)
  to authenticated;
