-- 2026-10-28 KST 캘린더 카테고리 ‘색 없음’ 지원
-- 로컬 준비본. 운영 적용은 별도 배포 시 승인/대상 확인 후 실행한다.
-- 기존 색상/회원/일정 데이터는 변경하지 않는다. 그룹 자체 식별색은 유지한다.
begin;

-- 의존 함수가 없는 환경에서는 새 공개 함수를 만들지 않고 전체 적용을 취소한다.
do $$
begin
  if to_regprocedure('public.calendar_group_copy_source_categories(uuid,text,uuid,date,date)') is null then
    raise exception 'Apply the existing calendar category merge/paste schema first';
  end if;
end;
$$;

do $$
declare
  category_table text;
begin
  foreach category_table in array array[
    'study_calendar_categories', 'work_calendar_categories',
    'event_calendar_categories', 'calendar_group_shared_categories'
  ] loop
    execute format('alter table public.%I drop constraint if exists %I',
      category_table, category_table || '_color_check');
    execute format('alter table public.%I add constraint %I check (color ~ %L)',
      category_table, category_table || '_color_check', '^(#[0-9A-Fa-f]{6}|transparent)$');
  end loop;
end;
$$;

-- 카테고리 스냅샷 및 레거시 일정에서 복사할 때 투명을 기본색으로 바꾸지 않는다.
-- 20260731 원본 함수와 동일하며 색상 검증식 두 곳만 확장한다.
create or replace function public.calendar_group_copy_source_categories(
  p_group_id uuid,
  p_calendar_type text,
  p_source_user_id uuid,
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
  source_sort_order integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with selected_events as materialized (
    select e.*
    from public.calendar_group_shared_events e
    where e.group_id = p_group_id
      and e.user_id = p_source_user_id
      and e.calendar_type = p_calendar_type
      and (
        p_start_date is null
        or e.event_date between p_start_date and p_end_date
      )
  ),
  snapshot_candidates as (
    select
      c.source_category_id::text as source_category_key,
      c.source_category_id,
      trim(c.name) as category_name,
      case
        when c.color ~ '^(#[0-9A-Fa-f]{6}|transparent)$' then lower(c.color)
        when p_calendar_type = 'work' then '#e7f6ff'
        when p_calendar_type = 'event' then '#ffe0ef'
        else '#eaffd7'
      end as color,
      case
        when p_calendar_type = 'work'
          and coalesce(c.settings->>'startTime', '')
            ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (c.settings->>'startTime')::time
        else null
      end as start_time,
      case
        when p_calendar_type = 'work'
          and coalesce(c.settings->>'endTime', '')
            ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (c.settings->>'endTime')::time
        else null
      end as end_time,
      case lower(coalesce(c.settings->>'endsNextDay', 'false'))
        when 'true' then true when '1' then true when 't' then true
        else false
      end as ends_next_day,
      c.source_is_default,
      c.source_sort_order,
      c.created_at
    from public.calendar_group_shared_categories c
    where c.group_id = p_group_id
      and c.user_id = p_source_user_id
      and c.calendar_type = p_calendar_type
      and (
        p_start_date is null
        or exists (
          select 1
          from selected_events e
          where public.calendar_copy_category_key(e.payload, e.title)
                  = c.source_category_id::text
             or lower(trim(public.calendar_copy_category_name(e.payload, e.title)))
                  = lower(trim(c.name))
        )
      )
  ),
  snapshot_categories as (
    select distinct on (lower(trim(s.category_name)))
      s.source_category_key,
      s.source_category_id,
      s.category_name,
      s.color,
      s.start_time,
      case when s.start_time is null then null else s.end_time end as end_time,
      case
        when s.start_time is not null and s.end_time is not null
        then s.end_time < s.start_time
        else false
      end as ends_next_day,
      s.source_is_default,
      s.source_sort_order
    from snapshot_candidates s
    order by lower(trim(s.category_name)), s.source_sort_order, s.created_at
  ),
  legacy_candidates as (
    select
      public.calendar_copy_category_key(e.payload, e.title) as source_category_key,
      case
        when e.payload->>'categoryId'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then (e.payload->>'categoryId')::uuid
        else null
      end as source_category_id,
      public.calendar_copy_category_name(e.payload, e.title) as category_name,
      case
        when coalesce(e.color, '') ~ '^(#[0-9A-Fa-f]{6}|transparent)$' then lower(e.color)
        when p_calendar_type = 'work' then '#e7f6ff'
        when p_calendar_type = 'event' then '#ffe0ef'
        else '#eaffd7'
      end as color,
      case
        when p_calendar_type = 'work'
          and coalesce(e.payload->>'categoryStartTime', '')
            ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (e.payload->>'categoryStartTime')::time
        else null
      end as start_time,
      case
        when p_calendar_type = 'work'
          and coalesce(e.payload->>'categoryEndTime', '')
            ~ '^([01][0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9](\.[0-9]{1,6})?)?$'
        then (e.payload->>'categoryEndTime')::time
        else null
      end as end_time,
      case lower(coalesce(e.payload->>'categoryIsDefault', 'false'))
        when 'true' then true when '1' then true when 't' then true
        else false
      end as source_is_default,
      case
        when coalesce(e.payload->>'categorySortOrder', '') ~ '^-?[0-9]{1,9}$'
        then (e.payload->>'categorySortOrder')::integer
        else 100
      end as source_sort_order,
      e.backed_up_at,
      e.created_at
    from selected_events e
  ),
  legacy_categories as (
    select distinct on (lower(trim(l.category_name)))
      l.source_category_key,
      l.source_category_id,
      l.category_name,
      l.color,
      l.start_time,
      case when l.start_time is null then null else l.end_time end as end_time,
      case
        when l.start_time is not null and l.end_time is not null
        then l.end_time < l.start_time
        else false
      end as ends_next_day,
      l.source_is_default,
      l.source_sort_order
    from legacy_candidates l
    where not exists (
      select 1
      from snapshot_categories s
      where s.source_category_key = l.source_category_key
         or lower(trim(s.category_name)) = lower(trim(l.category_name))
    )
    order by lower(trim(l.category_name)), l.backed_up_at desc, l.created_at
  )
  select * from snapshot_categories
  union all
  select * from legacy_categories
  order by source_sort_order, category_name, source_category_key;
$$;

commit;
