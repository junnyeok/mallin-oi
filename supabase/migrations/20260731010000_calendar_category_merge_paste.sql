-- 2026-07-31 그룹 캘린더 카테고리 스냅샷 및 개인 캘린더 병합 붙여넣기
-- 같은 이름은 사용자별 결정을 적용하고, 카테고리와 일정은 한 RPC 트랜잭션에서 저장한다.

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

create table if not exists public.calendar_group_shared_categories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_type text not null,
  source_category_id uuid not null,
  name text not null,
  source_slug text not null,
  color text not null,
  source_is_default boolean not null default false,
  source_sort_order integer not null default 100,
  settings jsonb not null default '{}'::jsonb,
  backed_up_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint calendar_group_shared_categories_type_check
    check (calendar_type in ('study', 'work', 'event')),
  constraint calendar_group_shared_categories_name_check
    check (char_length(trim(name)) between 1 and 20),
  constraint calendar_group_shared_categories_color_check
    check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint calendar_group_shared_categories_unique
    unique (group_id, user_id, calendar_type, source_category_id)
);

create index if not exists calendar_group_shared_categories_view_idx
  on public.calendar_group_shared_categories
  (group_id, user_id, calendar_type, source_sort_order, created_at);

alter table public.calendar_group_shared_categories enable row level security;

drop policy if exists "calendar_group_shared_categories_select_own"
on public.calendar_group_shared_categories;
create policy "calendar_group_shared_categories_select_own"
on public.calendar_group_shared_categories
for select
to authenticated
using (user_id = auth.uid());

revoke all on table public.calendar_group_shared_categories from public, anon, authenticated;
grant select on table public.calendar_group_shared_categories to authenticated;

create or replace function public.calendar_copy_category_name(
  p_payload jsonb,
  p_title text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select left(
    coalesce(
      nullif(trim(coalesce(p_payload, '{}'::jsonb)->>'categoryName'), ''),
      nullif(trim(p_title), ''),
      '카테고리'
    ),
    20
  );
$$;

create or replace function public.calendar_copy_category_key(
  p_payload jsonb,
  p_title text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when coalesce(p_payload, '{}'::jsonb)->>'categoryId'
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    then coalesce(p_payload, '{}'::jsonb)->>'categoryId'
    else 'legacy:' || lower(trim(public.calendar_copy_category_name(p_payload, p_title)))
  end;
$$;

drop function if exists public.calendar_group_copy_source_categories(uuid, text, uuid, date, date);
create function public.calendar_group_copy_source_categories(
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
        when c.color ~ '^#[0-9A-Fa-f]{6}$' then lower(c.color)
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
        when coalesce(e.color, '') ~ '^#[0-9A-Fa-f]{6}$' then lower(e.color)
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

revoke all on function public.calendar_copy_category_name(jsonb, text) from public, anon, authenticated;
revoke all on function public.calendar_copy_category_key(jsonb, text) from public, anon, authenticated;
revoke all on function public.calendar_group_copy_source_categories(uuid, text, uuid, date, date)
  from public, anon, authenticated;

drop function if exists public.calendar_group_copy_category_targets(uuid, text, uuid, uuid, date, date);
create function public.calendar_group_copy_category_targets(
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

drop function if exists public.get_group_calendar_paste_categories(uuid, text, uuid, date, date);
create function public.get_group_calendar_paste_categories(
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
  source_sort_order integer,
  target_category_id uuid,
  target_color text,
  target_start_time time without time zone,
  target_end_time time without time zone,
  target_ends_next_day boolean,
  has_name_conflict boolean
)
language plpgsql
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
    raise exception '지원하지 않는 캘린더 타입이에요.';
  end if;
  if (p_start_date is null) <> (p_end_date is null) then
    raise exception '시작일과 종료일을 모두 입력해줘.';
  end if;
  if v_is_range and p_start_date > p_end_date then
    raise exception '시작일은 종료일보다 늦을 수 없어요.';
  end if;
  if not exists (
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = v_user_id and m.status = 'active'
  ) then
    raise exception '이 그룹의 참여자가 아니에요.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.calendar_group_members m
    where m.group_id = p_group_id and m.user_id = p_source_user_id and m.status = 'active'
  ) then
    raise exception '복사할 그룹원이 현재 참여 중이 아니에요.' using errcode = '42501';
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

  if p_calendar_type = 'study' then
    return query
    select
      s.source_category_key, s.source_category_id, s.category_name, s.color,
      s.start_time, s.end_time, s.ends_next_day, s.source_is_default,
      s.source_sort_order, target.id, target.color,
      null::time, null::time, false, target.id is not null
    from public.calendar_group_copy_source_categories(
      p_group_id, p_calendar_type, p_source_user_id, p_start_date, p_end_date
    ) s
    left join lateral (
      select c.id, c.color
      from public.study_calendar_categories c
      where c.user_id = v_user_id
        and lower(trim(c.name)) = lower(trim(s.category_name))
      order by c.sort_order, c.created_at, c.id
      limit 1
    ) target on true;
  elsif p_calendar_type = 'work' then
    return query
    select
      s.source_category_key, s.source_category_id, s.category_name, s.color,
      s.start_time, s.end_time, s.ends_next_day, s.source_is_default,
      s.source_sort_order, target.id, target.color,
      target.start_time, target.end_time, target.ends_next_day,
      target.id is not null
    from public.calendar_group_copy_source_categories(
      p_group_id, p_calendar_type, p_source_user_id, p_start_date, p_end_date
    ) s
    left join lateral (
      select c.id, c.color, c.start_time, c.end_time, c.ends_next_day
      from public.work_calendar_categories c
      where c.user_id = v_user_id
        and lower(trim(c.name)) = lower(trim(s.category_name))
      order by c.sort_order, c.created_at, c.id
      limit 1
    ) target on true;
  else
    return query
    select
      s.source_category_key, s.source_category_id, s.category_name, s.color,
      s.start_time, s.end_time, s.ends_next_day, s.source_is_default,
      s.source_sort_order, target.id, target.color,
      null::time, null::time, false, target.id is not null
    from public.calendar_group_copy_source_categories(
      p_group_id, p_calendar_type, p_source_user_id, p_start_date, p_end_date
    ) s
    left join lateral (
      select c.id, c.color
      from public.event_calendar_categories c
      where c.user_id = v_user_id
        and lower(trim(c.name)) = lower(trim(s.category_name))
      order by c.sort_order, c.created_at, c.id
      limit 1
    ) target on true;
  end if;
end;
$$;

revoke all on function public.get_group_calendar_paste_categories(uuid, text, uuid, date, date)
  from public, anon;
grant execute on function public.get_group_calendar_paste_categories(uuid, text, uuid, date, date)
  to authenticated;

drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid);
drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date);
drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid);
drop function if exists public.paste_group_calendar_backup_to_my_calendar(uuid, text, uuid, date, date, uuid, jsonb);
create function public.paste_group_calendar_backup_to_my_calendar(
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
  end into v_allowed
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

  delete from public.calendar_group_shared_categories c
  where c.group_id = p_group_id
    and c.user_id = v_uid
    and c.calendar_type = p_calendar_type;

  if p_calendar_type = 'study' then
    insert into public.calendar_group_shared_categories (
      group_id, user_id, calendar_type, source_category_id, name, source_slug,
      color, source_is_default, source_sort_order, settings, backed_up_at
    )
    select
      p_group_id, c.user_id, 'study', c.id, c.name, c.slug, c.color,
      c.is_default, c.sort_order, '{}'::jsonb, v_now
    from public.study_calendar_categories c
    where c.user_id = v_uid and coalesce(c.is_shared_copy_category, false) = false;

    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id, t.user_id, 'study', t.id::text, t.todo_date,
      coalesce(c.slug, t.todo_type), t.todo_text, coalesce(t.memo, ''), c.color,
      jsonb_build_object(
        'isDone', t.is_done,
        'categoryId', c.id,
        'categoryName', c.name,
        'categoryIsDefault', c.is_default,
        'categorySortOrder', c.sort_order,
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
    insert into public.calendar_group_shared_categories (
      group_id, user_id, calendar_type, source_category_id, name, source_slug,
      color, source_is_default, source_sort_order, settings, backed_up_at
    )
    select
      p_group_id, c.user_id, 'work', c.id, c.name, c.slug, c.color,
      c.is_default, c.sort_order,
      jsonb_build_object(
        'startTime', c.start_time,
        'endTime', c.end_time,
        'endsNextDay', c.ends_next_day
      ),
      v_now
    from public.work_calendar_categories c
    where c.user_id = v_uid and coalesce(c.is_shared_copy_category, false) = false;

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
        'categoryId', c.id,
        'categoryName', c.name,
        'categoryIsDefault', c.is_default,
        'categorySortOrder', c.sort_order,
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
    insert into public.calendar_group_shared_categories (
      group_id, user_id, calendar_type, source_category_id, name, source_slug,
      color, source_is_default, source_sort_order, settings, backed_up_at
    )
    select
      p_group_id, c.user_id, 'event', c.id, c.name, c.slug, c.color,
      c.is_default, c.sort_order, '{}'::jsonb, v_now
    from public.event_calendar_categories c
    where c.user_id = v_uid and coalesce(c.is_shared_copy_category, false) = false;

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
        'categoryId', c.id,
        'categoryName', c.name,
        'categoryIsDefault', c.is_default,
        'categorySortOrder', c.sort_order,
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
