-- =========================================
-- 우리 일정 기능 추가
-- 카테고리별 그룹 멤버 개인 캘린더 자동 복사
-- =========================================

alter table public.study_calendar_categories
  add column if not exists is_shared_personal boolean not null default false,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_origin_category_id uuid references public.study_calendar_categories(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy_category boolean not null default false;

alter table public.work_calendar_categories
  add column if not exists is_shared_personal boolean not null default false,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_origin_category_id uuid references public.work_calendar_categories(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy_category boolean not null default false;

alter table public.event_calendar_categories
  add column if not exists is_shared_personal boolean not null default false,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_origin_category_id uuid references public.event_calendar_categories(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy_category boolean not null default false;

create index if not exists study_calendar_categories_shared_group_idx
  on public.study_calendar_categories (shared_group_id)
  where is_shared_personal = true;

create index if not exists work_calendar_categories_shared_group_idx
  on public.work_calendar_categories (shared_group_id)
  where is_shared_personal = true;

create index if not exists event_calendar_categories_shared_group_idx
  on public.event_calendar_categories (shared_group_id)
  where is_shared_personal = true;

create index if not exists study_calendar_categories_shared_origin_idx
  on public.study_calendar_categories (shared_group_id, shared_origin_category_id)
  where is_shared_personal = true;

create index if not exists work_calendar_categories_shared_origin_idx
  on public.work_calendar_categories (shared_group_id, shared_origin_category_id)
  where is_shared_personal = true;

create index if not exists event_calendar_categories_shared_origin_idx
  on public.event_calendar_categories (shared_group_id, shared_origin_category_id)
  where is_shared_personal = true;

update public.study_calendar_categories c
set
  is_shared_personal = true,
  shared_group_id = source.shared_group_id,
  shared_origin_category_id = source.id,
  shared_origin_user_id = source.user_id,
  is_shared_copy_category = true
from public.study_calendar_categories source
where c.slug = 'shared-' || source.id::text
  and c.user_id <> source.user_id
  and source.is_shared_personal = true
  and source.shared_group_id is not null;

update public.work_calendar_categories c
set
  is_shared_personal = true,
  shared_group_id = source.shared_group_id,
  shared_origin_category_id = source.id,
  shared_origin_user_id = source.user_id,
  is_shared_copy_category = true
from public.work_calendar_categories source
where c.slug = 'shared-' || source.id::text
  and c.user_id <> source.user_id
  and source.is_shared_personal = true
  and source.shared_group_id is not null;

update public.event_calendar_categories c
set
  is_shared_personal = true,
  shared_group_id = source.shared_group_id,
  shared_origin_category_id = source.id,
  shared_origin_user_id = source.user_id,
  is_shared_copy_category = true
from public.event_calendar_categories source
where c.slug = 'shared-' || source.id::text
  and c.user_id <> source.user_id
  and source.is_shared_personal = true
  and source.shared_group_id is not null;

create or replace function public.get_shared_personal_group_member_ids(
  p_group_id uuid
)
returns table (
  member_user_id uuid
)
language sql
security definer
set search_path = public
as $$
  select distinct member_id
  from (
    select g.owner_id as member_id
    from public.calendar_groups g
    where g.id = p_group_id

    union

    select m.user_id as member_id
    from public.calendar_group_members m
    where m.group_id = p_group_id
      and m.status = 'active'
  ) members
  where member_id is not null;
$$;

alter table public.study_calendar_todos
  drop constraint if exists study_calendar_todos_type_check;

alter table public.study_calendar_todos
  add column if not exists shared_origin_todo_id uuid references public.study_calendar_todos(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_created_by uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy boolean not null default false;

alter table public.work_calendar_todos
  add column if not exists shared_origin_todo_id uuid references public.work_calendar_todos(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_created_by uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy boolean not null default false;

alter table public.event_calendar_todos
  add column if not exists shared_origin_todo_id uuid references public.event_calendar_todos(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_created_by uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy boolean not null default false;

create unique index if not exists study_calendar_todos_shared_copy_uidx
  on public.study_calendar_todos (user_id, shared_origin_todo_id)
  where is_shared_copy = true and shared_origin_todo_id is not null;

create unique index if not exists work_calendar_todos_shared_copy_uidx
  on public.work_calendar_todos (user_id, shared_origin_todo_id)
  where is_shared_copy = true and shared_origin_todo_id is not null;

create unique index if not exists event_calendar_todos_shared_copy_uidx
  on public.event_calendar_todos (user_id, shared_origin_todo_id)
  where is_shared_copy = true and shared_origin_todo_id is not null;

create or replace function public.ensure_shared_study_calendar_category(
  p_user_id uuid,
  p_source_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.study_calendar_categories%rowtype;
  v_category_id uuid;
  v_origin_category_id uuid;
  v_origin_user_id uuid;
  v_slug text;
begin
  select c.*
    into v_source
  from public.study_calendar_categories c
  where c.id = p_source_category_id;

  if not found then
    return null;
  end if;

  v_origin_category_id := coalesce(v_source.shared_origin_category_id, v_source.id);
  v_origin_user_id := coalesce(v_source.shared_origin_user_id, v_source.user_id);
  v_slug := 'shared-' || v_origin_category_id::text;

  select c.id
    into v_category_id
  from public.study_calendar_categories c
  where c.id = v_origin_category_id
    and c.user_id = p_user_id
  limit 1;

  if v_category_id is null then
    select c.id
      into v_category_id
    from public.study_calendar_categories c
    where c.user_id = p_user_id
      and c.shared_group_id = v_source.shared_group_id
      and c.shared_origin_category_id = v_origin_category_id
    limit 1;
  end if;

  if v_category_id is null then
    select c.id
      into v_category_id
    from public.study_calendar_categories c
    where c.user_id = p_user_id
      and c.slug = v_slug
    limit 1;
  end if;

  if v_category_id is null then
    insert into public.study_calendar_categories (
      user_id, name, slug, color, is_default, sort_order,
      is_shared_personal, shared_group_id, shared_origin_category_id,
      shared_origin_user_id, is_shared_copy_category
    )
    values (
      p_user_id, v_source.name, v_slug, v_source.color, false, 1000,
      true, v_source.shared_group_id, v_origin_category_id,
      v_origin_user_id, true
    )
    returning public.study_calendar_categories.id into v_category_id;
  elsif v_category_id = v_origin_category_id then
    update public.study_calendar_categories c
    set
      name = v_source.name,
      color = v_source.color,
      is_shared_personal = true,
      shared_group_id = v_source.shared_group_id,
      shared_origin_category_id = null,
      shared_origin_user_id = v_origin_user_id,
      is_shared_copy_category = false
    where c.id = v_category_id;
  else
    update public.study_calendar_categories c
    set
      name = v_source.name,
      color = v_source.color,
      is_shared_personal = true,
      shared_group_id = v_source.shared_group_id,
      shared_origin_category_id = v_origin_category_id,
      shared_origin_user_id = v_origin_user_id,
      is_shared_copy_category = true
    where c.id = v_category_id;
  end if;

  return v_category_id;
end;
$$;

create or replace function public.ensure_shared_work_calendar_category(
  p_user_id uuid,
  p_source_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.work_calendar_categories%rowtype;
  v_category_id uuid;
  v_origin_category_id uuid;
  v_origin_user_id uuid;
  v_slug text;
begin
  select c.*
    into v_source
  from public.work_calendar_categories c
  where c.id = p_source_category_id;

  if not found then
    return null;
  end if;

  v_origin_category_id := coalesce(v_source.shared_origin_category_id, v_source.id);
  v_origin_user_id := coalesce(v_source.shared_origin_user_id, v_source.user_id);
  v_slug := 'shared-' || v_origin_category_id::text;

  select c.id
    into v_category_id
  from public.work_calendar_categories c
  where c.id = v_origin_category_id
    and c.user_id = p_user_id
  limit 1;

  if v_category_id is null then
    select c.id
      into v_category_id
    from public.work_calendar_categories c
    where c.user_id = p_user_id
      and c.shared_group_id = v_source.shared_group_id
      and c.shared_origin_category_id = v_origin_category_id
    limit 1;
  end if;

  if v_category_id is null then
    select c.id
      into v_category_id
    from public.work_calendar_categories c
    where c.user_id = p_user_id
      and c.slug = v_slug
    limit 1;
  end if;

  if v_category_id is null then
    insert into public.work_calendar_categories (
      user_id, name, slug, color, is_default, sort_order,
      is_shared_personal, shared_group_id, shared_origin_category_id,
      shared_origin_user_id, is_shared_copy_category
    )
    values (
      p_user_id, v_source.name, v_slug, v_source.color, false, 1000,
      true, v_source.shared_group_id, v_origin_category_id,
      v_origin_user_id, true
    )
    returning public.work_calendar_categories.id into v_category_id;
  elsif v_category_id = v_origin_category_id then
    update public.work_calendar_categories c
    set
      name = v_source.name,
      color = v_source.color,
      is_shared_personal = true,
      shared_group_id = v_source.shared_group_id,
      shared_origin_category_id = null,
      shared_origin_user_id = v_origin_user_id,
      is_shared_copy_category = false
    where c.id = v_category_id;
  else
    update public.work_calendar_categories c
    set
      name = v_source.name,
      color = v_source.color,
      is_shared_personal = true,
      shared_group_id = v_source.shared_group_id,
      shared_origin_category_id = v_origin_category_id,
      shared_origin_user_id = v_origin_user_id,
      is_shared_copy_category = true
    where c.id = v_category_id;
  end if;

  return v_category_id;
end;
$$;

create or replace function public.ensure_shared_event_calendar_category(
  p_user_id uuid,
  p_source_category_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.event_calendar_categories%rowtype;
  v_category_id uuid;
  v_origin_category_id uuid;
  v_origin_user_id uuid;
  v_slug text;
begin
  select c.*
    into v_source
  from public.event_calendar_categories c
  where c.id = p_source_category_id;

  if not found then
    return null;
  end if;

  v_origin_category_id := coalesce(v_source.shared_origin_category_id, v_source.id);
  v_origin_user_id := coalesce(v_source.shared_origin_user_id, v_source.user_id);
  v_slug := 'shared-' || v_origin_category_id::text;

  select c.id
    into v_category_id
  from public.event_calendar_categories c
  where c.id = v_origin_category_id
    and c.user_id = p_user_id
  limit 1;

  if v_category_id is null then
    select c.id
      into v_category_id
    from public.event_calendar_categories c
    where c.user_id = p_user_id
      and c.shared_group_id = v_source.shared_group_id
      and c.shared_origin_category_id = v_origin_category_id
    limit 1;
  end if;

  if v_category_id is null then
    select c.id
      into v_category_id
    from public.event_calendar_categories c
    where c.user_id = p_user_id
      and c.slug = v_slug
    limit 1;
  end if;

  if v_category_id is null then
    insert into public.event_calendar_categories (
      user_id, name, slug, color, is_default, sort_order,
      is_shared_personal, shared_group_id, shared_origin_category_id,
      shared_origin_user_id, is_shared_copy_category
    )
    values (
      p_user_id, v_source.name, v_slug, v_source.color, false, 1000,
      true, v_source.shared_group_id, v_origin_category_id,
      v_origin_user_id, true
    )
    returning public.event_calendar_categories.id into v_category_id;
  elsif v_category_id = v_origin_category_id then
    update public.event_calendar_categories c
    set
      name = v_source.name,
      color = v_source.color,
      is_shared_personal = true,
      shared_group_id = v_source.shared_group_id,
      shared_origin_category_id = null,
      shared_origin_user_id = v_origin_user_id,
      is_shared_copy_category = false
    where c.id = v_category_id;
  else
    update public.event_calendar_categories c
    set
      name = v_source.name,
      color = v_source.color,
      is_shared_personal = true,
      shared_group_id = v_source.shared_group_id,
      shared_origin_category_id = v_origin_category_id,
      shared_origin_user_id = v_origin_user_id,
      is_shared_copy_category = true
    where c.id = v_category_id;
  end if;

  return v_category_id;
end;
$$;

create or replace function public.create_study_calendar_todo_with_shared_personal(
  p_todo_date date,
  p_category_id uuid,
  p_todo_text text,
  p_memo text default ''
)
returns table (
  id uuid,
  user_id uuid,
  todo_date date,
  todo_type text,
  category_id uuid,
  todo_text text,
  memo text,
  is_done boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.study_calendar_categories%rowtype;
  v_group public.calendar_groups%rowtype;
  v_author_todo_id uuid;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.study_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_shared_personal then
    if v_category.shared_group_id is null then
      raise exception '우리 일정 그룹을 선택해야 합니다.';
    end if;

    select g.*
      into v_group
    from public.calendar_groups g
    where g.id = v_category.shared_group_id
      and g.allow_study = true;

    if not found or not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
      raise exception '이 그룹에 자기개발 우리 일정을 추가할 수 없습니다.';
    end if;
  end if;

  insert into public.study_calendar_todos (
    user_id, todo_date, todo_type, category_id, todo_text, memo, is_done,
    shared_group_id, shared_created_by, is_shared_copy
  )
  values (
    v_uid, p_todo_date, coalesce(v_category.slug, 'etc'), v_category.id,
    trim(p_todo_text), coalesce(p_memo, ''), false,
    case when v_category.is_shared_personal then v_category.shared_group_id else null end,
    v_uid, false
  )
  returning public.study_calendar_todos.id into v_author_todo_id;

  if v_category.is_shared_personal then
    for v_member in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
      where gm.member_user_id <> v_uid
    loop
      v_member_category_id := public.ensure_shared_study_calendar_category(
        v_member.user_id,
        v_category.id
      );

      insert into public.study_calendar_todos (
        user_id, todo_date, todo_type, category_id, todo_text, memo, is_done,
        shared_origin_todo_id, shared_origin_user_id, shared_group_id,
        shared_created_by, is_shared_copy
      )
      select
        v_member.user_id, p_todo_date, coalesce(v_category.slug, 'etc'),
        v_member_category_id, trim(p_todo_text), coalesce(p_memo, ''), false,
        v_author_todo_id, v_uid, v_category.shared_group_id, v_uid, true
      where not exists (
        select 1
        from public.study_calendar_todos existing
        where existing.user_id = v_member.user_id
          and existing.shared_origin_todo_id = v_author_todo_id
          and existing.is_shared_copy = true
      );
    end loop;
  end if;

  return query
  select
    t.id, t.user_id, t.todo_date, t.todo_type, t.category_id,
    t.todo_text, t.memo, t.is_done, t.created_at
  from public.study_calendar_todos t
  where t.id = v_author_todo_id;
end;
$$;

create or replace function public.create_work_calendar_todo_with_shared_personal(
  p_work_date date,
  p_category_id uuid,
  p_memo text default ''
)
returns table (
  id uuid,
  user_id uuid,
  work_date date,
  work_type text,
  category_id uuid,
  work_text text,
  memo text,
  is_done boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.work_calendar_categories%rowtype;
  v_group public.calendar_groups%rowtype;
  v_author_todo_id uuid;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.work_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_shared_personal then
    if v_category.shared_group_id is null then
      raise exception '우리 일정 그룹을 선택해야 합니다.';
    end if;

    select g.*
      into v_group
    from public.calendar_groups g
    where g.id = v_category.shared_group_id
      and g.allow_work = true;

    if not found or not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
      raise exception '이 그룹에 업무 우리 일정을 추가할 수 없습니다.';
    end if;
  end if;

  insert into public.work_calendar_todos (
    user_id, work_date, work_type, category_id, work_text, memo, is_done,
    shared_group_id, shared_created_by, is_shared_copy
  )
  values (
    v_uid, p_work_date, coalesce(v_category.slug, 'etc'), v_category.id,
    trim(v_category.name), coalesce(p_memo, ''), false,
    case when v_category.is_shared_personal then v_category.shared_group_id else null end,
    v_uid, false
  )
  returning public.work_calendar_todos.id into v_author_todo_id;

  if v_category.is_shared_personal then
    for v_member in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
      where gm.member_user_id <> v_uid
    loop
      v_member_category_id := public.ensure_shared_work_calendar_category(
        v_member.user_id,
        v_category.id
      );

      insert into public.work_calendar_todos (
        user_id, work_date, work_type, category_id, work_text, memo, is_done,
        shared_origin_todo_id, shared_origin_user_id, shared_group_id,
        shared_created_by, is_shared_copy
      )
      select
        v_member.user_id, p_work_date, coalesce(v_category.slug, 'etc'),
        v_member_category_id, trim(v_category.name), coalesce(p_memo, ''), false,
        v_author_todo_id, v_uid, v_category.shared_group_id, v_uid, true
      where not exists (
        select 1
        from public.work_calendar_todos existing
        where existing.user_id = v_member.user_id
          and existing.shared_origin_todo_id = v_author_todo_id
          and existing.is_shared_copy = true
      );
    end loop;
  end if;

  return query
  select
    t.id, t.user_id, t.work_date, t.work_type, t.category_id,
    t.work_text, t.memo, t.is_done, t.created_at
  from public.work_calendar_todos t
  where t.id = v_author_todo_id;
end;
$$;

create or replace function public.create_event_calendar_todo_with_shared_personal(
  p_event_date date,
  p_category_id uuid,
  p_event_text text,
  p_memo text default '',
  p_event_time time default '00:00'
)
returns table (
  id uuid,
  user_id uuid,
  event_date date,
  event_type text,
  category_id uuid,
  event_text text,
  memo text,
  event_time time,
  is_done boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.event_calendar_categories%rowtype;
  v_group public.calendar_groups%rowtype;
  v_author_todo_id uuid;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_shared_personal then
    if v_category.shared_group_id is null then
      raise exception '우리 일정 그룹을 선택해야 합니다.';
    end if;

    select g.*
      into v_group
    from public.calendar_groups g
    where g.id = v_category.shared_group_id
      and g.allow_event = true;

    if not found or not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
      raise exception '이 그룹에 이벤트 우리 일정을 추가할 수 없습니다.';
    end if;
  end if;

  insert into public.event_calendar_todos (
    user_id, event_date, event_type, category_id, event_text, memo, event_time,
    is_done, shared_group_id, shared_created_by, is_shared_copy
  )
  values (
    v_uid, p_event_date, coalesce(v_category.slug, 'anniversary'), v_category.id,
    trim(p_event_text), coalesce(p_memo, ''), coalesce(p_event_time, '00:00'::time),
    false,
    case when v_category.is_shared_personal then v_category.shared_group_id else null end,
    v_uid, false
  )
  returning public.event_calendar_todos.id into v_author_todo_id;

  if v_category.is_shared_personal then
    for v_member in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
      where gm.member_user_id <> v_uid
    loop
      v_member_category_id := public.ensure_shared_event_calendar_category(
        v_member.user_id,
        v_category.id
      );

      insert into public.event_calendar_todos (
        user_id, event_date, event_type, category_id, event_text, memo,
        event_time, is_done, shared_origin_todo_id, shared_origin_user_id,
        shared_group_id, shared_created_by, is_shared_copy
      )
      select
        v_member.user_id, p_event_date, coalesce(v_category.slug, 'anniversary'),
        v_member_category_id, trim(p_event_text), coalesce(p_memo, ''),
        coalesce(p_event_time, '00:00'::time), false,
        v_author_todo_id, v_uid, v_category.shared_group_id, v_uid, true
      where not exists (
        select 1
        from public.event_calendar_todos existing
        where existing.user_id = v_member.user_id
          and existing.shared_origin_todo_id = v_author_todo_id
          and existing.is_shared_copy = true
      );
    end loop;
  end if;

  return query
  select
    t.id, t.user_id, t.event_date, t.event_type, t.category_id,
    t.event_text, t.memo, t.event_time, t.is_done, t.created_at
  from public.event_calendar_todos t
  where t.id = v_author_todo_id;
end;
$$;

create or replace function public.sync_study_shared_personal_category(
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.study_calendar_categories%rowtype;
  v_member record;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.study_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if not v_category.is_shared_personal or v_category.shared_group_id is null then
    return;
  end if;

  if not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
    raise exception '이 그룹에 우리 일정 카테고리를 공유할 권한이 없습니다.';
  end if;

  if not v_category.is_shared_copy_category then
    update public.study_calendar_categories c
    set
      shared_origin_category_id = null,
      shared_origin_user_id = v_uid,
      is_shared_copy_category = false
    where c.id = v_category.id;
  end if;

  for v_member in
    select gm.member_user_id as user_id
    from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
    where gm.member_user_id <> v_category.user_id
  loop
    perform public.ensure_shared_study_calendar_category(
      v_member.user_id,
      v_category.id
    );
  end loop;
end;
$$;

create or replace function public.sync_work_shared_personal_category(
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.work_calendar_categories%rowtype;
  v_member record;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.work_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if not v_category.is_shared_personal or v_category.shared_group_id is null then
    return;
  end if;

  if not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
    raise exception '이 그룹에 우리 일정 카테고리를 공유할 권한이 없습니다.';
  end if;

  if not v_category.is_shared_copy_category then
    update public.work_calendar_categories c
    set
      shared_origin_category_id = null,
      shared_origin_user_id = v_uid,
      is_shared_copy_category = false
    where c.id = v_category.id;
  end if;

  for v_member in
    select gm.member_user_id as user_id
    from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
    where gm.member_user_id <> v_category.user_id
  loop
    perform public.ensure_shared_work_calendar_category(
      v_member.user_id,
      v_category.id
    );
  end loop;
end;
$$;

create or replace function public.sync_event_shared_personal_category(
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.event_calendar_categories%rowtype;
  v_member record;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if not v_category.is_shared_personal or v_category.shared_group_id is null then
    return;
  end if;

  if not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
    raise exception '이 그룹에 우리 일정 카테고리를 공유할 권한이 없습니다.';
  end if;

  if not v_category.is_shared_copy_category then
    update public.event_calendar_categories c
    set
      shared_origin_category_id = null,
      shared_origin_user_id = v_uid,
      is_shared_copy_category = false
    where c.id = v_category.id;
  end if;

  for v_member in
    select gm.member_user_id as user_id
    from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
    where gm.member_user_id <> v_category.user_id
  loop
    perform public.ensure_shared_event_calendar_category(
      v_member.user_id,
      v_category.id
    );
  end loop;
end;
$$;

create or replace function public.update_study_calendar_todo_category_with_shared_personal(
  p_todo_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.study_calendar_todos%rowtype;
  v_root public.study_calendar_todos%rowtype;
  v_target public.study_calendar_categories%rowtype;
  v_root_category_id uuid;
  v_root_category public.study_calendar_categories%rowtype;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.study_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_target
  from public.study_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.study_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  if v_target.is_shared_personal and v_target.shared_group_id is not null then
    if not public.is_calendar_group_member(v_target.shared_group_id, v_uid)
      or not public.is_calendar_group_member(v_target.shared_group_id, v_root.user_id) then
      raise exception '이 그룹에 우리 일정을 옮길 권한이 없습니다.';
    end if;

    if v_root.user_id = v_uid then
      v_root_category_id := v_target.id;
    else
      v_root_category_id := public.ensure_shared_study_calendar_category(
        v_root.user_id,
        v_target.id
      );
    end if;

    select c.*
      into v_root_category
    from public.study_calendar_categories c
    where c.id = v_root_category_id;

    delete from public.study_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.is_shared_copy = true;

    update public.study_calendar_todos t
    set
      category_id = v_root_category.id,
      todo_type = coalesce(v_root_category.slug, v_target.slug, 'etc'),
      shared_origin_todo_id = null,
      shared_origin_user_id = null,
      shared_group_id = v_target.shared_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_uid),
      is_shared_copy = false
    where t.id = v_root.id;

    select t.*
      into v_root
    from public.study_calendar_todos t
    where t.id = v_root.id;

    for v_member in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_target.shared_group_id) gm
      where gm.member_user_id <> v_root.user_id
    loop
      v_member_category_id := public.ensure_shared_study_calendar_category(
        v_member.user_id,
        v_root_category.id
      );

      insert into public.study_calendar_todos (
        user_id, todo_date, todo_type, category_id, todo_text, memo, is_done,
        shared_origin_todo_id, shared_origin_user_id, shared_group_id,
        shared_created_by, is_shared_copy
      )
      select
        v_member.user_id, v_root.todo_date, coalesce(v_root_category.slug, v_target.slug, 'etc'),
        v_member_category_id, v_root.todo_text, coalesce(v_root.memo, ''), v_root.is_done,
        v_root.id, v_root.user_id, v_target.shared_group_id,
        coalesce(v_root.shared_created_by, v_uid), true
      where not exists (
        select 1
        from public.study_calendar_todos existing
        where existing.user_id = v_member.user_id
          and existing.shared_origin_todo_id = v_root.id
          and existing.is_shared_copy = true
      );
    end loop;

    return;
  end if;

  if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
    raise exception '공유 일정을 일반 일정으로 바꾸려면 원본 작성자 계정에서 변경해야 합니다.';
  end if;

  delete from public.study_calendar_todos t
  where t.shared_origin_todo_id = v_root.id
    and t.is_shared_copy = true;

  update public.study_calendar_todos t
  set
    category_id = v_target.id,
    todo_type = coalesce(v_target.slug, 'etc'),
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = null,
    shared_created_by = null,
    is_shared_copy = false
  where t.id = v_root.id;
end;
$$;

create or replace function public.update_work_calendar_todo_category_with_shared_personal(
  p_todo_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.work_calendar_todos%rowtype;
  v_root public.work_calendar_todos%rowtype;
  v_target public.work_calendar_categories%rowtype;
  v_root_category_id uuid;
  v_root_category public.work_calendar_categories%rowtype;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.work_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_target
  from public.work_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.work_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  if v_target.is_shared_personal and v_target.shared_group_id is not null then
    if not public.is_calendar_group_member(v_target.shared_group_id, v_uid)
      or not public.is_calendar_group_member(v_target.shared_group_id, v_root.user_id) then
      raise exception '이 그룹에 우리 일정을 옮길 권한이 없습니다.';
    end if;

    if v_root.user_id = v_uid then
      v_root_category_id := v_target.id;
    else
      v_root_category_id := public.ensure_shared_work_calendar_category(
        v_root.user_id,
        v_target.id
      );
    end if;

    select c.*
      into v_root_category
    from public.work_calendar_categories c
    where c.id = v_root_category_id;

    delete from public.work_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.is_shared_copy = true;

    update public.work_calendar_todos t
    set
      category_id = v_root_category.id,
      work_type = coalesce(v_root_category.slug, v_target.slug, 'etc'),
      work_text = trim(coalesce(v_root_category.name, v_target.name, v_root.work_text)),
      shared_origin_todo_id = null,
      shared_origin_user_id = null,
      shared_group_id = v_target.shared_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_uid),
      is_shared_copy = false
    where t.id = v_root.id;

    select t.*
      into v_root
    from public.work_calendar_todos t
    where t.id = v_root.id;

    for v_member in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_target.shared_group_id) gm
      where gm.member_user_id <> v_root.user_id
    loop
      v_member_category_id := public.ensure_shared_work_calendar_category(
        v_member.user_id,
        v_root_category.id
      );

      insert into public.work_calendar_todos (
        user_id, work_date, work_type, category_id, work_text, memo, is_done,
        shared_origin_todo_id, shared_origin_user_id, shared_group_id,
        shared_created_by, is_shared_copy
      )
      select
        v_member.user_id, v_root.work_date, coalesce(v_root_category.slug, v_target.slug, 'etc'),
        v_member_category_id, trim(coalesce(v_root_category.name, v_target.name, v_root.work_text)),
        coalesce(v_root.memo, ''), v_root.is_done,
        v_root.id, v_root.user_id, v_target.shared_group_id,
        coalesce(v_root.shared_created_by, v_uid), true
      where not exists (
        select 1
        from public.work_calendar_todos existing
        where existing.user_id = v_member.user_id
          and existing.shared_origin_todo_id = v_root.id
          and existing.is_shared_copy = true
      );
    end loop;

    return;
  end if;

  if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
    raise exception '공유 일정을 일반 일정으로 바꾸려면 원본 작성자 계정에서 변경해야 합니다.';
  end if;

  delete from public.work_calendar_todos t
  where t.shared_origin_todo_id = v_root.id
    and t.is_shared_copy = true;

  update public.work_calendar_todos t
  set
    category_id = v_target.id,
    work_type = coalesce(v_target.slug, 'etc'),
    work_text = trim(coalesce(v_target.name, v_root.work_text)),
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = null,
    shared_created_by = null,
    is_shared_copy = false
  where t.id = v_root.id;
end;
$$;

create or replace function public.update_event_calendar_todo_category_with_shared_personal(
  p_todo_id uuid,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_target public.event_calendar_categories%rowtype;
  v_root_category_id uuid;
  v_root_category public.event_calendar_categories%rowtype;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.event_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_target
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.event_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  if v_target.is_shared_personal and v_target.shared_group_id is not null then
    if not public.is_calendar_group_member(v_target.shared_group_id, v_uid)
      or not public.is_calendar_group_member(v_target.shared_group_id, v_root.user_id) then
      raise exception '이 그룹에 우리 일정을 옮길 권한이 없습니다.';
    end if;

    if v_root.user_id = v_uid then
      v_root_category_id := v_target.id;
    else
      v_root_category_id := public.ensure_shared_event_calendar_category(
        v_root.user_id,
        v_target.id
      );
    end if;

    select c.*
      into v_root_category
    from public.event_calendar_categories c
    where c.id = v_root_category_id;

    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.is_shared_copy = true;

    update public.event_calendar_todos t
    set
      category_id = v_root_category.id,
      event_type = coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
      shared_origin_todo_id = null,
      shared_origin_user_id = null,
      shared_group_id = v_target.shared_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_uid),
      is_shared_copy = false
    where t.id = v_root.id;

    select t.*
      into v_root
    from public.event_calendar_todos t
    where t.id = v_root.id;

    for v_member in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_target.shared_group_id) gm
      where gm.member_user_id <> v_root.user_id
    loop
      v_member_category_id := public.ensure_shared_event_calendar_category(
        v_member.user_id,
        v_root_category.id
      );

      insert into public.event_calendar_todos (
        user_id, event_date, event_type, category_id, event_text, memo,
        event_time, is_done, shared_origin_todo_id, shared_origin_user_id,
        shared_group_id, shared_created_by, is_shared_copy
      )
      select
        v_member.user_id, v_root.event_date, coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
        v_member_category_id, v_root.event_text, coalesce(v_root.memo, ''),
        coalesce(v_root.event_time, '00:00'::time), v_root.is_done,
        v_root.id, v_root.user_id, v_target.shared_group_id,
        coalesce(v_root.shared_created_by, v_uid), true
      where not exists (
        select 1
        from public.event_calendar_todos existing
        where existing.user_id = v_member.user_id
          and existing.shared_origin_todo_id = v_root.id
          and existing.is_shared_copy = true
      );
    end loop;

    return;
  end if;

  if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
    raise exception '공유 일정을 일반 일정으로 바꾸려면 원본 작성자 계정에서 변경해야 합니다.';
  end if;

  delete from public.event_calendar_todos t
  where t.shared_origin_todo_id = v_root.id
    and t.is_shared_copy = true;

  update public.event_calendar_todos t
  set
    category_id = v_target.id,
    event_type = coalesce(v_target.slug, 'anniversary'),
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = null,
    shared_created_by = null,
    is_shared_copy = false
  where t.id = v_root.id;
end;
$$;

-- =========================================
-- 우리 일정 내용 수정 동기화 보완
-- 원본/복사본 어느 쪽에서 수정해도 같은 공유 묶음 전체에 반영
-- =========================================

create or replace function public.update_study_shared_personal_todo(
  p_todo_id uuid,
  p_todo_text text default null,
  p_memo text default null,
  p_todo_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.study_calendar_todos%rowtype;
  v_root public.study_calendar_todos%rowtype;
  v_root_category public.study_calendar_categories%rowtype;
  v_group_id uuid;
  v_next_text text;
  v_next_memo text;
  v_next_date date;
  v_copy record;
  v_copy_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.study_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.study_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  v_group_id := coalesce(v_selected.shared_group_id, v_root.shared_group_id);

  if v_group_id is null then
    update public.study_calendar_todos t
    set
      todo_text = case
        when nullif(trim(coalesce(p_todo_text, '')), '') is null then t.todo_text
        else trim(p_todo_text)
      end,
      memo = coalesce(p_memo, t.memo, ''),
      todo_date = coalesce(p_todo_date, t.todo_date)
    where t.id = v_selected.id
      and t.user_id = v_uid;
    return;
  end if;

  if v_root.shared_group_id is distinct from v_group_id then
    raise exception '공유 일정 그룹 정보가 올바르지 않습니다.';
  end if;

  if not public.is_calendar_group_member(v_group_id, v_uid) then
    raise exception '이 우리 일정을 수정할 권한이 없습니다.';
  end if;

  select c.*
    into v_root_category
  from public.study_calendar_categories c
  where c.id = v_root.category_id;

  v_next_text := case
    when nullif(trim(coalesce(p_todo_text, '')), '') is null then v_root.todo_text
    else trim(p_todo_text)
  end;
  v_next_memo := coalesce(p_memo, v_root.memo, '');
  v_next_date := coalesce(p_todo_date, v_root.todo_date);

  update public.study_calendar_todos t
  set
    todo_text = v_next_text,
    memo = v_next_memo,
    todo_date = v_next_date,
    todo_type = coalesce(v_root_category.slug, t.todo_type, 'etc'),
    category_id = coalesce(v_root_category.id, t.category_id),
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = v_group_id,
    shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
    is_shared_copy = false
  where t.id = v_root.id;

  for v_copy in
    select t.id, t.user_id
    from public.study_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.shared_group_id = v_group_id
      and t.is_shared_copy = true
  loop
    v_copy_category_id := case
      when v_root_category.id is null then null
      else public.ensure_shared_study_calendar_category(v_copy.user_id, v_root_category.id)
    end;

    update public.study_calendar_todos t
    set
      todo_text = v_next_text,
      memo = v_next_memo,
      todo_date = v_next_date,
      todo_type = coalesce(v_root_category.slug, t.todo_type, 'etc'),
      category_id = coalesce(v_copy_category_id, t.category_id),
      shared_origin_todo_id = v_root.id,
      shared_origin_user_id = v_root.user_id,
      shared_group_id = v_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
      is_shared_copy = true
    where t.id = v_copy.id;
  end loop;
end;
$$;

create or replace function public.update_work_shared_personal_todo(
  p_todo_id uuid,
  p_work_text text default null,
  p_memo text default null,
  p_work_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.work_calendar_todos%rowtype;
  v_root public.work_calendar_todos%rowtype;
  v_root_category public.work_calendar_categories%rowtype;
  v_group_id uuid;
  v_next_text text;
  v_next_memo text;
  v_next_date date;
  v_copy record;
  v_copy_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.work_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.work_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  v_group_id := coalesce(v_selected.shared_group_id, v_root.shared_group_id);

  if v_group_id is null then
    update public.work_calendar_todos t
    set
      work_text = case
        when nullif(trim(coalesce(p_work_text, '')), '') is null then t.work_text
        else trim(p_work_text)
      end,
      memo = coalesce(p_memo, t.memo, ''),
      work_date = coalesce(p_work_date, t.work_date)
    where t.id = v_selected.id
      and t.user_id = v_uid;
    return;
  end if;

  if v_root.shared_group_id is distinct from v_group_id then
    raise exception '공유 일정 그룹 정보가 올바르지 않습니다.';
  end if;

  if not public.is_calendar_group_member(v_group_id, v_uid) then
    raise exception '이 우리 일정을 수정할 권한이 없습니다.';
  end if;

  select c.*
    into v_root_category
  from public.work_calendar_categories c
  where c.id = v_root.category_id;

  v_next_text := case
    when nullif(trim(coalesce(p_work_text, '')), '') is null then v_root.work_text
    else trim(p_work_text)
  end;
  v_next_memo := coalesce(p_memo, v_root.memo, '');
  v_next_date := coalesce(p_work_date, v_root.work_date);

  update public.work_calendar_todos t
  set
    work_text = v_next_text,
    memo = v_next_memo,
    work_date = v_next_date,
    work_type = coalesce(v_root_category.slug, t.work_type, 'etc'),
    category_id = coalesce(v_root_category.id, t.category_id),
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = v_group_id,
    shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
    is_shared_copy = false
  where t.id = v_root.id;

  for v_copy in
    select t.id, t.user_id
    from public.work_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.shared_group_id = v_group_id
      and t.is_shared_copy = true
  loop
    v_copy_category_id := case
      when v_root_category.id is null then null
      else public.ensure_shared_work_calendar_category(v_copy.user_id, v_root_category.id)
    end;

    update public.work_calendar_todos t
    set
      work_text = v_next_text,
      memo = v_next_memo,
      work_date = v_next_date,
      work_type = coalesce(v_root_category.slug, t.work_type, 'etc'),
      category_id = coalesce(v_copy_category_id, t.category_id),
      shared_origin_todo_id = v_root.id,
      shared_origin_user_id = v_root.user_id,
      shared_group_id = v_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
      is_shared_copy = true
    where t.id = v_copy.id;
  end loop;
end;
$$;

create or replace function public.update_event_shared_personal_todo(
  p_todo_id uuid,
  p_event_text text default null,
  p_memo text default null,
  p_event_time time default null,
  p_event_date date default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_root_category public.event_calendar_categories%rowtype;
  v_group_id uuid;
  v_next_text text;
  v_next_memo text;
  v_next_time time;
  v_next_date date;
  v_copy record;
  v_copy_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.event_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.event_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  v_group_id := coalesce(v_selected.shared_group_id, v_root.shared_group_id);

  if v_group_id is null then
    update public.event_calendar_todos t
    set
      event_text = case
        when nullif(trim(coalesce(p_event_text, '')), '') is null then t.event_text
        else trim(p_event_text)
      end,
      memo = coalesce(p_memo, t.memo, ''),
      event_time = coalesce(p_event_time, t.event_time, '00:00'::time),
      event_date = coalesce(p_event_date, t.event_date)
    where t.id = v_selected.id
      and t.user_id = v_uid;
    return;
  end if;

  if v_root.shared_group_id is distinct from v_group_id then
    raise exception '공유 일정 그룹 정보가 올바르지 않습니다.';
  end if;

  if not public.is_calendar_group_member(v_group_id, v_uid) then
    raise exception '이 우리 일정을 수정할 권한이 없습니다.';
  end if;

  select c.*
    into v_root_category
  from public.event_calendar_categories c
  where c.id = v_root.category_id;

  v_next_text := case
    when nullif(trim(coalesce(p_event_text, '')), '') is null then v_root.event_text
    else trim(p_event_text)
  end;
  v_next_memo := coalesce(p_memo, v_root.memo, '');
  v_next_time := coalesce(p_event_time, v_root.event_time, '00:00'::time);
  v_next_date := coalesce(p_event_date, v_root.event_date);

  update public.event_calendar_todos t
  set
    event_text = v_next_text,
    memo = v_next_memo,
    event_time = v_next_time,
    event_date = v_next_date,
    event_type = coalesce(v_root_category.slug, t.event_type, 'anniversary'),
    category_id = coalesce(v_root_category.id, t.category_id),
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = v_group_id,
    shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
    is_shared_copy = false
  where t.id = v_root.id;

  for v_copy in
    select t.id, t.user_id
    from public.event_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.shared_group_id = v_group_id
      and t.is_shared_copy = true
  loop
    v_copy_category_id := case
      when v_root_category.id is null then null
      else public.ensure_shared_event_calendar_category(v_copy.user_id, v_root_category.id)
    end;

    update public.event_calendar_todos t
    set
      event_text = v_next_text,
      memo = v_next_memo,
      event_time = v_next_time,
      event_date = v_next_date,
      event_type = coalesce(v_root_category.slug, t.event_type, 'anniversary'),
      category_id = coalesce(v_copy_category_id, t.category_id),
      shared_origin_todo_id = v_root.id,
      shared_origin_user_id = v_root.user_id,
      shared_group_id = v_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
      is_shared_copy = true
    where t.id = v_copy.id;
  end loop;
end;
$$;

-- =========================================
-- 우리 일정 동기화 삭제 및 그룹 백업 제한 보완
-- =========================================

create or replace function public.delete_study_shared_personal_todo(
  p_todo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_todo public.study_calendar_todos%rowtype;
  v_root_todo_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_todo
  from public.study_calendar_todos t
  where t.id = p_todo_id;

  if not found then
    raise exception '삭제할 우리 일정을 찾을 수 없습니다.';
  end if;

  if v_todo.shared_group_id is null then
    raise exception '우리 일정만 동기화 삭제할 수 있습니다.';
  end if;

  if v_todo.user_id <> v_uid
    and not public.is_calendar_group_member(v_todo.shared_group_id, v_uid) then
    raise exception '이 우리 일정을 삭제할 권한이 없습니다.';
  end if;

  v_root_todo_id := coalesce(v_todo.shared_origin_todo_id, v_todo.id);

  delete from public.study_calendar_todos t
  where t.shared_group_id = v_todo.shared_group_id
    and (
      t.id = v_root_todo_id
      or t.shared_origin_todo_id = v_root_todo_id
    );
end;
$$;

create or replace function public.delete_work_shared_personal_todo(
  p_todo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_todo public.work_calendar_todos%rowtype;
  v_root_todo_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_todo
  from public.work_calendar_todos t
  where t.id = p_todo_id;

  if not found then
    raise exception '삭제할 우리 일정을 찾을 수 없습니다.';
  end if;

  if v_todo.shared_group_id is null then
    raise exception '우리 일정만 동기화 삭제할 수 있습니다.';
  end if;

  if v_todo.user_id <> v_uid
    and not public.is_calendar_group_member(v_todo.shared_group_id, v_uid) then
    raise exception '이 우리 일정을 삭제할 권한이 없습니다.';
  end if;

  v_root_todo_id := coalesce(v_todo.shared_origin_todo_id, v_todo.id);

  delete from public.work_calendar_todos t
  where t.shared_group_id = v_todo.shared_group_id
    and (
      t.id = v_root_todo_id
      or t.shared_origin_todo_id = v_root_todo_id
    );
end;
$$;

create or replace function public.delete_event_shared_personal_todo(
  p_todo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_todo public.event_calendar_todos%rowtype;
  v_root_todo_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_todo
  from public.event_calendar_todos t
  where t.id = p_todo_id;

  if not found then
    raise exception '삭제할 우리 일정을 찾을 수 없습니다.';
  end if;

  if v_todo.shared_group_id is null then
    raise exception '우리 일정만 동기화 삭제할 수 있습니다.';
  end if;

  if v_todo.user_id <> v_uid
    and not public.is_calendar_group_member(v_todo.shared_group_id, v_uid) then
    raise exception '이 우리 일정을 삭제할 권한이 없습니다.';
  end if;

  v_root_todo_id := coalesce(v_todo.shared_origin_todo_id, v_todo.id);

  delete from public.event_calendar_todos t
  where t.shared_group_id = v_todo.shared_group_id
    and (
      t.id = v_root_todo_id
      or t.shared_origin_todo_id = v_root_todo_id
    );
end;
$$;

create or replace function public.delete_study_shared_personal_category(
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.study_calendar_categories%rowtype;
  v_root_category_id uuid;
  v_category_ids uuid[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.study_calendar_categories c
  where c.id = p_category_id;

  if not found then
    raise exception '삭제할 우리 일정 카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_default then
    raise exception '기본 카테고리는 삭제할 수 없습니다.';
  end if;

  if not v_category.is_shared_personal or v_category.shared_group_id is null then
    raise exception '우리 일정 카테고리만 동기화 삭제할 수 있습니다.';
  end if;

  if v_category.user_id <> v_uid
    and not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
    raise exception '이 우리 일정 카테고리를 삭제할 권한이 없습니다.';
  end if;

  v_root_category_id := coalesce(v_category.shared_origin_category_id, v_category.id);

  select coalesce(array_agg(c.id), array[]::uuid[])
    into v_category_ids
  from public.study_calendar_categories c
  where c.shared_group_id = v_category.shared_group_id
    and c.is_shared_personal = true
    and c.is_default = false
    and (
      c.id = v_root_category_id
      or c.shared_origin_category_id = v_root_category_id
      or c.slug = 'shared-' || v_root_category_id::text
    );

  delete from public.study_calendar_todos t
  where t.shared_group_id = v_category.shared_group_id
    and t.category_id = any(v_category_ids);

  delete from public.study_calendar_categories c
  where c.id = any(v_category_ids)
    and c.is_default = false;
end;
$$;

create or replace function public.delete_work_shared_personal_category(
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.work_calendar_categories%rowtype;
  v_root_category_id uuid;
  v_category_ids uuid[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.work_calendar_categories c
  where c.id = p_category_id;

  if not found then
    raise exception '삭제할 우리 일정 카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_default then
    raise exception '기본 카테고리는 삭제할 수 없습니다.';
  end if;

  if not v_category.is_shared_personal or v_category.shared_group_id is null then
    raise exception '우리 일정 카테고리만 동기화 삭제할 수 있습니다.';
  end if;

  if v_category.user_id <> v_uid
    and not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
    raise exception '이 우리 일정 카테고리를 삭제할 권한이 없습니다.';
  end if;

  v_root_category_id := coalesce(v_category.shared_origin_category_id, v_category.id);

  select coalesce(array_agg(c.id), array[]::uuid[])
    into v_category_ids
  from public.work_calendar_categories c
  where c.shared_group_id = v_category.shared_group_id
    and c.is_shared_personal = true
    and c.is_default = false
    and (
      c.id = v_root_category_id
      or c.shared_origin_category_id = v_root_category_id
      or c.slug = 'shared-' || v_root_category_id::text
    );

  delete from public.work_calendar_todos t
  where t.shared_group_id = v_category.shared_group_id
    and t.category_id = any(v_category_ids);

  delete from public.work_calendar_categories c
  where c.id = any(v_category_ids)
    and c.is_default = false;
end;
$$;

create or replace function public.delete_event_shared_personal_category(
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.event_calendar_categories%rowtype;
  v_root_category_id uuid;
  v_category_ids uuid[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select c.*
    into v_category
  from public.event_calendar_categories c
  where c.id = p_category_id;

  if not found then
    raise exception '삭제할 우리 일정 카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_default then
    raise exception '기본 카테고리는 삭제할 수 없습니다.';
  end if;

  if not v_category.is_shared_personal or v_category.shared_group_id is null then
    raise exception '우리 일정 카테고리만 동기화 삭제할 수 있습니다.';
  end if;

  if v_category.user_id <> v_uid
    and not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
    raise exception '이 우리 일정 카테고리를 삭제할 권한이 없습니다.';
  end if;

  v_root_category_id := coalesce(v_category.shared_origin_category_id, v_category.id);

  select coalesce(array_agg(c.id), array[]::uuid[])
    into v_category_ids
  from public.event_calendar_categories c
  where c.shared_group_id = v_category.shared_group_id
    and c.is_shared_personal = true
    and c.is_default = false
    and (
      c.id = v_root_category_id
      or c.shared_origin_category_id = v_root_category_id
      or c.slug = 'shared-' || v_root_category_id::text
    );

  delete from public.event_calendar_todos t
  where t.shared_group_id = v_category.shared_group_id
    and t.category_id = any(v_category_ids);

  delete from public.event_calendar_categories c
  where c.id = any(v_category_ids)
    and c.is_default = false;
end;
$$;

revoke all on function public.ensure_shared_study_calendar_category(uuid, uuid) from public;
revoke all on function public.ensure_shared_study_calendar_category(uuid, uuid) from anon;
revoke all on function public.ensure_shared_study_calendar_category(uuid, uuid) from authenticated;

revoke all on function public.ensure_shared_work_calendar_category(uuid, uuid) from public;
revoke all on function public.ensure_shared_work_calendar_category(uuid, uuid) from anon;
revoke all on function public.ensure_shared_work_calendar_category(uuid, uuid) from authenticated;

revoke all on function public.ensure_shared_event_calendar_category(uuid, uuid) from public;
revoke all on function public.ensure_shared_event_calendar_category(uuid, uuid) from anon;
revoke all on function public.ensure_shared_event_calendar_category(uuid, uuid) from authenticated;

revoke all on function public.create_study_calendar_todo_with_shared_personal(date, uuid, text, text) from public;
revoke all on function public.create_study_calendar_todo_with_shared_personal(date, uuid, text, text) from anon;
grant execute on function public.create_study_calendar_todo_with_shared_personal(date, uuid, text, text) to authenticated;

revoke all on function public.create_work_calendar_todo_with_shared_personal(date, uuid, text) from public;
revoke all on function public.create_work_calendar_todo_with_shared_personal(date, uuid, text) from anon;
grant execute on function public.create_work_calendar_todo_with_shared_personal(date, uuid, text) to authenticated;

revoke all on function public.create_event_calendar_todo_with_shared_personal(date, uuid, text, text, time) from public;
revoke all on function public.create_event_calendar_todo_with_shared_personal(date, uuid, text, text, time) from anon;
grant execute on function public.create_event_calendar_todo_with_shared_personal(date, uuid, text, text, time) to authenticated;

revoke all on function public.delete_study_shared_personal_todo(uuid) from public;
revoke all on function public.delete_study_shared_personal_todo(uuid) from anon;
grant execute on function public.delete_study_shared_personal_todo(uuid) to authenticated;

revoke all on function public.delete_work_shared_personal_todo(uuid) from public;
revoke all on function public.delete_work_shared_personal_todo(uuid) from anon;
grant execute on function public.delete_work_shared_personal_todo(uuid) to authenticated;

revoke all on function public.delete_event_shared_personal_todo(uuid) from public;
revoke all on function public.delete_event_shared_personal_todo(uuid) from anon;
grant execute on function public.delete_event_shared_personal_todo(uuid) to authenticated;

revoke all on function public.delete_study_shared_personal_category(uuid) from public;
revoke all on function public.delete_study_shared_personal_category(uuid) from anon;
grant execute on function public.delete_study_shared_personal_category(uuid) to authenticated;

revoke all on function public.delete_work_shared_personal_category(uuid) from public;
revoke all on function public.delete_work_shared_personal_category(uuid) from anon;
grant execute on function public.delete_work_shared_personal_category(uuid) to authenticated;

revoke all on function public.delete_event_shared_personal_category(uuid) from public;
revoke all on function public.delete_event_shared_personal_category(uuid) from anon;
grant execute on function public.delete_event_shared_personal_category(uuid) to authenticated;

revoke all on function public.get_shared_personal_group_member_ids(uuid) from public;
revoke all on function public.get_shared_personal_group_member_ids(uuid) from anon;
revoke all on function public.get_shared_personal_group_member_ids(uuid) from authenticated;

revoke all on function public.sync_study_shared_personal_category(uuid) from public;
revoke all on function public.sync_study_shared_personal_category(uuid) from anon;
grant execute on function public.sync_study_shared_personal_category(uuid) to authenticated;

revoke all on function public.sync_work_shared_personal_category(uuid) from public;
revoke all on function public.sync_work_shared_personal_category(uuid) from anon;
grant execute on function public.sync_work_shared_personal_category(uuid) to authenticated;

revoke all on function public.sync_event_shared_personal_category(uuid) from public;
revoke all on function public.sync_event_shared_personal_category(uuid) from anon;
grant execute on function public.sync_event_shared_personal_category(uuid) to authenticated;

revoke all on function public.update_study_calendar_todo_category_with_shared_personal(uuid, uuid) from public;
revoke all on function public.update_study_calendar_todo_category_with_shared_personal(uuid, uuid) from anon;
grant execute on function public.update_study_calendar_todo_category_with_shared_personal(uuid, uuid) to authenticated;

revoke all on function public.update_work_calendar_todo_category_with_shared_personal(uuid, uuid) from public;
revoke all on function public.update_work_calendar_todo_category_with_shared_personal(uuid, uuid) from anon;
grant execute on function public.update_work_calendar_todo_category_with_shared_personal(uuid, uuid) to authenticated;

revoke all on function public.update_event_calendar_todo_category_with_shared_personal(uuid, uuid) from public;
revoke all on function public.update_event_calendar_todo_category_with_shared_personal(uuid, uuid) from anon;
grant execute on function public.update_event_calendar_todo_category_with_shared_personal(uuid, uuid) to authenticated;

revoke all on function public.update_study_shared_personal_todo(uuid, text, text, date) from public;
revoke all on function public.update_study_shared_personal_todo(uuid, text, text, date) from anon;
grant execute on function public.update_study_shared_personal_todo(uuid, text, text, date) to authenticated;

revoke all on function public.update_work_shared_personal_todo(uuid, text, text, date) from public;
revoke all on function public.update_work_shared_personal_todo(uuid, text, text, date) from anon;
grant execute on function public.update_work_shared_personal_todo(uuid, text, text, date) to authenticated;

revoke all on function public.update_event_shared_personal_todo(uuid, text, text, time, date) from public;
revoke all on function public.update_event_shared_personal_todo(uuid, text, text, time, date) from anon;
grant execute on function public.update_event_shared_personal_todo(uuid, text, text, time, date) to authenticated;

-- =========================================
-- 2026-06-23 이벤트 우리일정 단일 저장/복제본 upsert
-- 제목·메모·날짜·시간·카테고리를 한 트랜잭션에서 확정한다.
-- =========================================

create or replace function public.save_event_calendar_todo(
  p_todo_id uuid,
  p_event_text text,
  p_memo text,
  p_event_time time,
  p_event_end_time time,
  p_event_date date,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_target public.event_calendar_categories%rowtype;
  v_root_category public.event_calendar_categories%rowtype;
  v_old_group_id uuid;
  v_new_group_id uuid;
  v_copy record;
  v_copy_category_id uuid;
  v_existing_copy_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if nullif(trim(coalesce(p_event_text, '')), '') is null then
    raise exception '일정 제목을 입력해 주세요.';
  end if;

  if p_event_date is null then
    raise exception '일정 날짜를 입력해 주세요.';
  end if;

  select t.*
    into v_selected
  from public.event_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.event_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_target
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  v_old_group_id := coalesce(v_selected.shared_group_id, v_root.shared_group_id);
  v_new_group_id := case
    when v_target.is_shared_personal then v_target.shared_group_id
    else null
  end;

  if v_old_group_id is not null
     and not public.is_calendar_group_member(v_old_group_id, v_uid) then
    raise exception '이 우리 일정을 수정할 권한이 없습니다.';
  end if;

  if v_new_group_id is not null then
    if not public.is_calendar_group_member(v_new_group_id, v_uid)
       or not public.is_calendar_group_member(v_new_group_id, v_root.user_id) then
      raise exception '이 그룹에 우리 일정을 저장할 권한이 없습니다.';
    end if;

    select c.*
      into v_root_category
    from public.event_calendar_categories c
    where c.id = coalesce(v_target.shared_origin_category_id, v_target.id);

    if not found or v_root_category.user_id <> v_root.user_id then
      if v_root.user_id = v_uid then
        v_root_category := v_target;
      else
        select c.*
          into v_root_category
        from public.event_calendar_categories c
        where c.id = public.ensure_shared_event_calendar_category(
          v_root.user_id,
          v_target.id
        );
      end if;
    end if;

    if v_old_group_id is distinct from v_new_group_id then
      if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
        raise exception '우리 일정 그룹 변경은 원본 작성자만 할 수 있습니다.';
      end if;

      delete from public.calendar_group_shared_events e
      where e.group_id = v_old_group_id
        and e.calendar_type = 'event'
        and (
          e.source_event_id = v_root.id::text
          or e.source_event_id in (
            select t.id::text
            from public.event_calendar_todos t
            where t.shared_origin_todo_id = v_root.id
          )
          or e.payload->>'shared_origin_todo_id' = v_root.id::text
        );

      delete from public.event_calendar_todos t
      where t.shared_origin_todo_id = v_root.id
        and t.is_shared_copy = true;
    end if;

    update public.event_calendar_todos t
    set
      event_text = trim(p_event_text),
      memo = coalesce(p_memo, ''),
      event_time = coalesce(p_event_time, '00:00'::time),
      event_end_time = p_event_end_time,
      event_date = p_event_date,
      event_type = coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
      category_id = v_root_category.id,
      shared_origin_todo_id = null,
      shared_origin_user_id = null,
      shared_group_id = v_new_group_id,
      shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
      is_shared_copy = false
    where t.id = v_root.id;

    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.is_shared_copy = true
      and (
        t.shared_group_id is distinct from v_new_group_id
        or not public.is_calendar_group_member(v_new_group_id, t.user_id)
      );

    for v_copy in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_new_group_id) gm
      where gm.member_user_id <> v_root.user_id
    loop
      v_copy_category_id := public.ensure_shared_event_calendar_category(
        v_copy.user_id,
        v_root_category.id
      );

      select t.id
        into v_existing_copy_id
      from public.event_calendar_todos t
      where t.user_id = v_copy.user_id
        and t.shared_origin_todo_id = v_root.id
        and t.is_shared_copy = true
      limit 1;

      if v_existing_copy_id is null then
        insert into public.event_calendar_todos (
          user_id, event_date, event_type, category_id, event_text, memo,
          event_time, event_end_time, is_done, shared_origin_todo_id,
          shared_origin_user_id, shared_group_id, shared_created_by,
          is_shared_copy
        )
        values (
          v_copy.user_id, p_event_date,
          coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
          v_copy_category_id, trim(p_event_text), coalesce(p_memo, ''),
          coalesce(p_event_time, '00:00'::time), p_event_end_time,
          v_root.is_done, v_root.id, v_root.user_id, v_new_group_id,
          coalesce(v_root.shared_created_by, v_root.user_id), true
        );
      else
        update public.event_calendar_todos t
        set
          event_date = p_event_date,
          event_type = coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
          category_id = v_copy_category_id,
          event_text = trim(p_event_text),
          memo = coalesce(p_memo, ''),
          event_time = coalesce(p_event_time, '00:00'::time),
          event_end_time = p_event_end_time,
          is_done = v_root.is_done,
          shared_origin_user_id = v_root.user_id,
          shared_group_id = v_new_group_id,
          shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
          is_shared_copy = true
        where t.id = v_existing_copy_id;
      end if;

      v_existing_copy_id := null;
    end loop;

    return;
  end if;

  if v_old_group_id is not null then
    if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
      raise exception '우리 일정을 개인 일정으로 바꾸려면 원본 작성자 계정에서 저장해야 합니다.';
    end if;

    delete from public.calendar_group_shared_events e
    where e.group_id = v_old_group_id
      and e.calendar_type = 'event'
      and (
        e.source_event_id = v_root.id::text
        or e.source_event_id in (
          select t.id::text
          from public.event_calendar_todos t
          where t.shared_origin_todo_id = v_root.id
        )
        or e.payload->>'shared_origin_todo_id' = v_root.id::text
      );

    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = v_root.id
      and t.is_shared_copy = true;
  end if;

  update public.event_calendar_todos t
  set
    event_text = trim(p_event_text),
    memo = coalesce(p_memo, ''),
    event_time = coalesce(p_event_time, '00:00'::time),
    event_end_time = p_event_end_time,
    event_date = p_event_date,
    event_type = coalesce(v_target.slug, 'anniversary'),
    category_id = v_target.id,
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = null,
    shared_created_by = null,
    is_shared_copy = false
  where t.id = v_root.id;
end;
$$;

revoke all on function public.save_event_calendar_todo(
  uuid, text, text, time, time, date, uuid
) from public;
revoke all on function public.save_event_calendar_todo(
  uuid, text, text, time, time, date, uuid
) from anon;
grant execute on function public.save_event_calendar_todo(
  uuid, text, text, time, time, date, uuid
) to authenticated;


-- ============================================================
-- 이벤트 캘린더 기존 일정 종료 날짜 수정 및 기간 식별자 추가
-- 작업일: 2026-07-12
-- 설명: 이벤트 기간 row를 event_range_id로 식별하고 생성/수정을 트랜잭션 처리
-- ============================================================

alter table public.event_calendar_todos
  add column if not exists event_range_id uuid;

create index if not exists event_calendar_todos_user_range_date_idx
  on public.event_calendar_todos (user_id, event_range_id, event_date);

create index if not exists event_calendar_todos_range_date_idx
  on public.event_calendar_todos (event_range_id, event_date)
  where event_range_id is not null;

create or replace function public.create_event_calendar_todo_range(
  p_start_date date,
  p_end_date date,
  p_category_id uuid,
  p_event_text text,
  p_memo text default '',
  p_event_time time default '00:00',
  p_event_end_time time default null
)
returns table (
  id uuid,
  user_id uuid,
  event_date date,
  event_type text,
  category_id uuid,
  event_text text,
  memo text,
  event_time time,
  event_end_time time,
  is_done boolean,
  event_range_id uuid,
  shared_origin_todo_id uuid,
  shared_origin_user_id uuid,
  shared_group_id uuid,
  shared_created_by uuid,
  is_shared_copy boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_category public.event_calendar_categories%rowtype;
  v_group public.calendar_groups%rowtype;
  v_range_id uuid := gen_random_uuid();
  v_end_date date := coalesce(p_end_date, p_start_date);
  v_date date;
  v_author_todo_id uuid;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_start_date is null then
    raise exception '일정 시작 날짜를 입력해 주세요.';
  end if;

  if v_end_date < p_start_date then
    raise exception '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';
  end if;

  if nullif(trim(coalesce(p_event_text, '')), '') is null then
    raise exception '일정 제목을 입력해 주세요.';
  end if;

  select c.*
    into v_category
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  if v_category.is_shared_personal then
    if v_category.shared_group_id is null then
      raise exception '우리 일정 그룹을 선택해야 합니다.';
    end if;

    select g.*
      into v_group
    from public.calendar_groups g
    where g.id = v_category.shared_group_id
      and g.allow_event = true;

    if not found
       or not public.is_calendar_group_member(v_category.shared_group_id, v_uid) then
      raise exception '이 그룹에 이벤트 우리 일정을 추가할 수 없습니다.';
    end if;
  end if;

  for v_date in
    select gs::date
    from generate_series(p_start_date, v_end_date, interval '1 day') gs
  loop
    insert into public.event_calendar_todos (
      user_id, event_date, event_type, category_id, event_text, memo,
      event_time, event_end_time, is_done, event_range_id,
      shared_group_id, shared_created_by, is_shared_copy
    )
    values (
      v_uid, v_date, coalesce(v_category.slug, 'anniversary'), v_category.id,
      trim(p_event_text), coalesce(p_memo, ''),
      coalesce(p_event_time, '00:00'::time), p_event_end_time, false,
      v_range_id,
      case when v_category.is_shared_personal then v_category.shared_group_id else null end,
      case when v_category.is_shared_personal then v_uid else null end,
      false
    )
    returning public.event_calendar_todos.id into v_author_todo_id;

    if v_category.is_shared_personal then
      for v_member in
        select gm.member_user_id as user_id
        from public.get_shared_personal_group_member_ids(v_category.shared_group_id) gm
        where gm.member_user_id <> v_uid
      loop
        v_member_category_id := public.ensure_shared_event_calendar_category(
          v_member.user_id,
          v_category.id
        );

        insert into public.event_calendar_todos (
          user_id, event_date, event_type, category_id, event_text, memo,
          event_time, event_end_time, is_done, event_range_id,
          shared_origin_todo_id, shared_origin_user_id, shared_group_id,
          shared_created_by, is_shared_copy
        )
        values (
          v_member.user_id, v_date, coalesce(v_category.slug, 'anniversary'),
          v_member_category_id, trim(p_event_text), coalesce(p_memo, ''),
          coalesce(p_event_time, '00:00'::time), p_event_end_time, false,
          v_range_id,
          v_author_todo_id, v_uid, v_category.shared_group_id, v_uid, true
        );
      end loop;
    end if;
  end loop;

  return query
  select
    t.id, t.user_id, t.event_date, t.event_type, t.category_id,
    t.event_text, t.memo, t.event_time, t.event_end_time, t.is_done,
    t.event_range_id, t.shared_origin_todo_id, t.shared_origin_user_id,
    t.shared_group_id, t.shared_created_by, t.is_shared_copy, t.created_at
  from public.event_calendar_todos t
  where t.user_id = v_uid
    and t.event_range_id = v_range_id
  order by t.event_date, t.created_at;
end;
$$;

create or replace function public.save_event_calendar_todo_range(
  p_todo_id uuid,
  p_event_text text,
  p_memo text,
  p_event_time time,
  p_event_end_time time,
  p_start_date date,
  p_end_date date,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_author_row public.event_calendar_todos%rowtype;
  v_target public.event_calendar_categories%rowtype;
  v_root_category public.event_calendar_categories%rowtype;
  v_old_group_id uuid;
  v_new_group_id uuid;
  v_range_id uuid;
  v_end_date date := coalesce(p_end_date, p_start_date);
  v_root_ids uuid[];
  v_used_root_ids uuid[] := array[]::uuid[];
  v_removed_root_ids uuid[];
  v_related_ids text[];
  v_date date;
  v_source_root_id uuid;
  v_existing_copy_id uuid;
  v_member record;
  v_member_category_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if p_start_date is null then
    raise exception '일정 시작 날짜를 입력해 주세요.';
  end if;

  if v_end_date < p_start_date then
    raise exception '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';
  end if;

  if nullif(trim(coalesce(p_event_text, '')), '') is null then
    raise exception '일정 제목을 입력해 주세요.';
  end if;

  select t.*
    into v_selected
  from public.event_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.event_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_target
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  v_range_id := coalesce(v_root.event_range_id, gen_random_uuid());
  v_old_group_id := v_root.shared_group_id;
  v_new_group_id := case
    when v_target.is_shared_personal then v_target.shared_group_id
    else null
  end;

  if v_old_group_id is not null
     and not public.is_calendar_group_member(v_old_group_id, v_uid) then
    raise exception '이 우리 일정을 수정할 권한이 없습니다.';
  end if;

  if v_new_group_id is not null then
    if not public.is_calendar_group_member(v_new_group_id, v_uid)
       or not public.is_calendar_group_member(v_new_group_id, v_root.user_id) then
      raise exception '이 그룹에 우리 일정을 저장할 권한이 없습니다.';
    end if;

    select c.*
      into v_root_category
    from public.event_calendar_categories c
    where c.id = coalesce(v_target.shared_origin_category_id, v_target.id);

    if not found or v_root_category.user_id <> v_root.user_id then
      if v_root.user_id = v_uid then
        v_root_category := v_target;
      else
        select c.*
          into v_root_category
        from public.event_calendar_categories c
        where c.id = public.ensure_shared_event_calendar_category(
          v_root.user_id,
          v_target.id
        );
      end if;
    end if;
  end if;

  if v_old_group_id is distinct from v_new_group_id then
    if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
      raise exception '우리 일정 그룹 변경은 원본 작성자만 할 수 있습니다.';
    end if;
  end if;

  if v_old_group_id is not null and v_new_group_id is null then
    if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
      raise exception '우리 일정을 개인 일정으로 바꾸려면 원본 작성자 계정에서 저장해야 합니다.';
    end if;
  end if;

  select coalesce(array_agg(t.id order by t.event_date, t.created_at), array[]::uuid[])
    into v_root_ids
  from public.event_calendar_todos t
  where t.user_id = v_root.user_id
    and t.is_shared_copy = false
    and (
      (v_root.event_range_id is not null and t.event_range_id = v_root.event_range_id)
      or (v_root.event_range_id is null and t.id = v_root.id)
    );

  if coalesce(array_length(v_root_ids, 1), 0) = 0 then
    v_root_ids := array[v_root.id];
  end if;

  select coalesce(array_agg(t.id::text), array[]::text[])
    into v_related_ids
  from public.event_calendar_todos t
  where t.id = any(v_root_ids)
     or t.shared_origin_todo_id = any(v_root_ids);

  if v_old_group_id is not null then
    delete from public.calendar_group_shared_events e
    where e.group_id = v_old_group_id
      and e.calendar_type = 'event'
      and v_old_group_id is distinct from v_new_group_id
      and (
        e.source_event_id = any(v_related_ids)
        or e.payload->>'shared_origin_todo_id' = any(v_related_ids)
      );
  end if;

  for v_date in
    select gs::date
    from generate_series(p_start_date, v_end_date, interval '1 day') gs
  loop
    v_source_root_id := null;

    select t.id
      into v_source_root_id
    from public.event_calendar_todos t
    where t.id = any(v_root_ids)
      and t.id <> all(v_used_root_ids)
      and t.event_date = v_date
    order by t.created_at
    limit 1;

    if v_source_root_id is null then
      select t.id
        into v_source_root_id
      from public.event_calendar_todos t
      where t.id = any(v_root_ids)
        and t.id <> all(v_used_root_ids)
      order by t.event_date, t.created_at
      limit 1;
    end if;

    if v_source_root_id is null then
      insert into public.event_calendar_todos (
        user_id, event_date, event_type, category_id, event_text, memo,
        event_time, event_end_time, is_done, event_range_id,
        shared_group_id, shared_created_by, is_shared_copy
      )
      values (
        v_root.user_id, v_date,
        case
          when v_new_group_id is not null then coalesce(v_root_category.slug, v_target.slug, 'anniversary')
          else coalesce(v_target.slug, 'anniversary')
        end,
        case
          when v_new_group_id is not null then v_root_category.id
          else v_target.id
        end,
        trim(p_event_text), coalesce(p_memo, ''),
        coalesce(p_event_time, '00:00'::time), p_event_end_time,
        false, v_range_id,
        v_new_group_id,
        case when v_new_group_id is not null then coalesce(v_root.shared_created_by, v_root.user_id) else null end,
        false
      )
      returning * into v_author_row;
    else
      update public.event_calendar_todos t
      set
        event_date = v_date,
        event_type = case
          when v_new_group_id is not null then coalesce(v_root_category.slug, v_target.slug, 'anniversary')
          else coalesce(v_target.slug, 'anniversary')
        end,
        category_id = case
          when v_new_group_id is not null then v_root_category.id
          else v_target.id
        end,
        event_text = trim(p_event_text),
        memo = coalesce(p_memo, ''),
        event_time = coalesce(p_event_time, '00:00'::time),
        event_end_time = p_event_end_time,
        event_range_id = v_range_id,
        shared_origin_todo_id = null,
        shared_origin_user_id = null,
        shared_group_id = v_new_group_id,
        shared_created_by = case
          when v_new_group_id is not null then coalesce(v_root.shared_created_by, v_root.user_id)
          else null
        end,
        is_shared_copy = false
      where t.id = v_source_root_id
      returning * into v_author_row;
    end if;

    v_used_root_ids := array_append(v_used_root_ids, v_author_row.id);

    if v_new_group_id is not null then
      for v_member in
        select gm.member_user_id as user_id
        from public.get_shared_personal_group_member_ids(v_new_group_id) gm
        where gm.member_user_id <> v_root.user_id
      loop
        v_member_category_id := public.ensure_shared_event_calendar_category(
          v_member.user_id,
          v_root_category.id
        );

        select t.id
          into v_existing_copy_id
        from public.event_calendar_todos t
        where t.user_id = v_member.user_id
          and t.shared_origin_todo_id = v_author_row.id
          and t.is_shared_copy = true
        limit 1;

        if v_existing_copy_id is null then
          insert into public.event_calendar_todos (
            user_id, event_date, event_type, category_id, event_text, memo,
            event_time, event_end_time, is_done, event_range_id,
            shared_origin_todo_id, shared_origin_user_id, shared_group_id,
            shared_created_by, is_shared_copy
          )
          values (
            v_member.user_id, v_author_row.event_date,
            coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
            v_member_category_id, trim(p_event_text), coalesce(p_memo, ''),
            coalesce(p_event_time, '00:00'::time), p_event_end_time,
            v_author_row.is_done, v_range_id,
            v_author_row.id, v_root.user_id, v_new_group_id,
            coalesce(v_root.shared_created_by, v_root.user_id), true
          );
        else
          update public.event_calendar_todos t
          set
            event_date = v_author_row.event_date,
            event_type = coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
            category_id = v_member_category_id,
            event_text = trim(p_event_text),
            memo = coalesce(p_memo, ''),
            event_time = coalesce(p_event_time, '00:00'::time),
            event_end_time = p_event_end_time,
            is_done = v_author_row.is_done,
            event_range_id = v_range_id,
            shared_origin_user_id = v_root.user_id,
            shared_group_id = v_new_group_id,
            shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
            is_shared_copy = true
          where t.id = v_existing_copy_id;
        end if;

        v_existing_copy_id := null;
      end loop;

      delete from public.event_calendar_todos t
      where t.shared_origin_todo_id = v_author_row.id
        and t.is_shared_copy = true
        and (
          t.shared_group_id is distinct from v_new_group_id
          or not public.is_calendar_group_member(v_new_group_id, t.user_id)
        );
    else
      delete from public.event_calendar_todos t
      where t.shared_origin_todo_id = v_author_row.id
        and t.is_shared_copy = true;
    end if;

    update public.calendar_group_shared_events e
    set
      event_date = t.event_date,
      event_type = t.event_type,
      title = t.event_text,
      memo = coalesce(t.memo, ''),
      color = c.color,
      payload = coalesce(e.payload, '{}'::jsonb) || jsonb_build_object(
        'isDone', t.is_done,
        'eventTime', t.event_time,
        'eventEndTime', t.event_end_time,
        'categoryName', c.name
      ),
      backed_up_at = now()
    from public.event_calendar_todos t
    left join public.event_calendar_categories c on c.id = t.category_id
    where e.calendar_type = 'event'
      and e.source_event_id = t.id::text
      and (
        t.id = v_author_row.id
        or t.shared_origin_todo_id = v_author_row.id
      );
  end loop;

  select coalesce(array_agg(root_id), array[]::uuid[])
    into v_removed_root_ids
  from unnest(v_root_ids) as root_id
  where root_id <> all(v_used_root_ids);

  if coalesce(array_length(v_removed_root_ids, 1), 0) > 0 then
    delete from public.calendar_group_shared_events e
    where e.calendar_type = 'event'
      and (
        e.source_event_id in (
          select removed_id::text from unnest(v_removed_root_ids) as removed_id
        )
        or e.payload->>'shared_origin_todo_id' in (
          select removed_id::text from unnest(v_removed_root_ids) as removed_id
        )
      );

    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = any(v_removed_root_ids)
      and t.is_shared_copy = true;

    delete from public.event_calendar_todos t
    where t.id = any(v_removed_root_ids);
  end if;
end;
$$;

create or replace function public.delete_event_calendar_todo_range(
  p_todo_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_root_ids uuid[];
  v_related_ids text[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select t.*
    into v_selected
  from public.event_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '삭제할 일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.event_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '삭제할 원본 일정을 찾을 수 없습니다.';
  end if;

  if v_root.shared_group_id is not null
     and not public.is_calendar_group_member(v_root.shared_group_id, v_uid) then
    raise exception '이 우리 일정을 삭제할 권한이 없습니다.';
  end if;

  select coalesce(array_agg(t.id order by t.event_date), array[]::uuid[])
    into v_root_ids
  from public.event_calendar_todos t
  where t.user_id = v_root.user_id
    and t.is_shared_copy = false
    and (
      (v_root.event_range_id is not null and t.event_range_id = v_root.event_range_id)
      or (v_root.event_range_id is null and t.id = v_root.id)
    );

  if coalesce(array_length(v_root_ids, 1), 0) = 0 then
    v_root_ids := array[v_root.id];
  end if;

  select coalesce(array_agg(t.id::text), array[]::text[])
    into v_related_ids
  from public.event_calendar_todos t
  where t.id = any(v_root_ids)
     or t.shared_origin_todo_id = any(v_root_ids);

  if v_root.shared_group_id is not null then
    delete from public.calendar_group_shared_events e
    where e.group_id = v_root.shared_group_id
      and e.calendar_type = 'event'
      and (
        e.source_event_id = any(v_related_ids)
        or e.payload->>'shared_origin_todo_id' = any(v_related_ids)
      );
  end if;

  delete from public.event_calendar_todos t
  where t.shared_origin_todo_id = any(v_root_ids)
    and t.is_shared_copy = true;

  delete from public.event_calendar_todos t
  where t.id = any(v_root_ids);
end;
$$;

create or replace function public.create_event_calendar_todo_with_shared_personal(
  p_event_date date,
  p_category_id uuid,
  p_event_text text,
  p_memo text default '',
  p_event_time time default '00:00'
)
returns table (
  id uuid,
  user_id uuid,
  event_date date,
  event_type text,
  category_id uuid,
  event_text text,
  memo text,
  event_time time,
  is_done boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    created.id,
    created.user_id,
    created.event_date,
    created.event_type,
    created.category_id,
    created.event_text,
    created.memo,
    created.event_time,
    created.is_done,
    created.created_at
  from public.create_event_calendar_todo_range(
    p_event_date,
    p_event_date,
    p_category_id,
    p_event_text,
    p_memo,
    p_event_time,
    null
  ) created;
end;
$$;

create or replace function public.save_event_calendar_todo(
  p_todo_id uuid,
  p_event_text text,
  p_memo text,
  p_event_time time,
  p_event_end_time time,
  p_event_date date,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_saved_root public.event_calendar_todos%rowtype;
  v_target public.event_calendar_categories%rowtype;
  v_root_category public.event_calendar_categories%rowtype;
  v_old_group_id uuid;
  v_new_group_id uuid;
  v_range_id uuid;
  v_copy record;
  v_copy_category_id uuid;
  v_existing_copy_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if nullif(trim(coalesce(p_event_text, '')), '') is null then
    raise exception '일정 제목을 입력해 주세요.';
  end if;

  if p_event_date is null then
    raise exception '일정 날짜를 입력해 주세요.';
  end if;

  select t.*
    into v_selected
  from public.event_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '일정을 찾을 수 없습니다.';
  end if;

  select t.*
    into v_root
  from public.event_calendar_todos t
  where t.id = coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  if not found then
    raise exception '원본 일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_target
  from public.event_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '카테고리를 찾을 수 없습니다.';
  end if;

  v_old_group_id := coalesce(v_selected.shared_group_id, v_root.shared_group_id);
  v_new_group_id := case
    when v_target.is_shared_personal then v_target.shared_group_id
    else null
  end;
  v_range_id := coalesce(v_root.event_range_id, gen_random_uuid());

  if v_old_group_id is not null
     and not public.is_calendar_group_member(v_old_group_id, v_uid) then
    raise exception '이 우리 일정을 수정할 권한이 없습니다.';
  end if;

  if v_new_group_id is not null then
    if not public.is_calendar_group_member(v_new_group_id, v_uid)
       or not public.is_calendar_group_member(v_new_group_id, v_root.user_id) then
      raise exception '이 그룹에 우리 일정을 저장할 권한이 없습니다.';
    end if;

    select c.*
      into v_root_category
    from public.event_calendar_categories c
    where c.id = coalesce(v_target.shared_origin_category_id, v_target.id);

    if not found or v_root_category.user_id <> v_root.user_id then
      if v_root.user_id = v_uid then
        v_root_category := v_target;
      else
        select c.*
          into v_root_category
        from public.event_calendar_categories c
        where c.id = public.ensure_shared_event_calendar_category(
          v_root.user_id,
          v_target.id
        );
      end if;
    end if;
  end if;

  if v_old_group_id is distinct from v_new_group_id then
    if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
      raise exception '우리 일정 그룹 변경은 원본 작성자만 할 수 있습니다.';
    end if;
  end if;

  if v_old_group_id is not null and v_new_group_id is null then
    if v_selected.shared_origin_todo_id is not null or v_root.user_id <> v_uid then
      raise exception '우리 일정을 개인 일정으로 바꾸려면 원본 작성자 계정에서 저장해야 합니다.';
    end if;
  end if;

  if v_old_group_id is not null and v_old_group_id is distinct from v_new_group_id then
    delete from public.calendar_group_shared_events e
    where e.group_id = v_old_group_id
      and e.calendar_type = 'event'
      and (
        e.source_event_id = v_root.id::text
        or e.source_event_id in (
          select t.id::text
          from public.event_calendar_todos t
          where t.shared_origin_todo_id = v_root.id
        )
        or e.payload->>'shared_origin_todo_id' = v_root.id::text
      );
  end if;

  update public.event_calendar_todos t
  set
    event_text = trim(p_event_text),
    memo = coalesce(p_memo, ''),
    event_time = coalesce(p_event_time, '00:00'::time),
    event_end_time = p_event_end_time,
    event_date = p_event_date,
    event_range_id = v_range_id,
    event_type = case
      when v_new_group_id is not null then coalesce(v_root_category.slug, v_target.slug, 'anniversary')
      else coalesce(v_target.slug, 'anniversary')
    end,
    category_id = case
      when v_new_group_id is not null then v_root_category.id
      else v_target.id
    end,
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    shared_group_id = v_new_group_id,
    shared_created_by = case
      when v_new_group_id is not null then coalesce(v_root.shared_created_by, v_root.user_id)
      else null
    end,
    is_shared_copy = false
  where t.id = v_root.id
  returning * into v_saved_root;

  if v_new_group_id is not null then
    for v_copy in
      select gm.member_user_id as user_id
      from public.get_shared_personal_group_member_ids(v_new_group_id) gm
      where gm.member_user_id <> v_root.user_id
    loop
      v_copy_category_id := public.ensure_shared_event_calendar_category(
        v_copy.user_id,
        v_root_category.id
      );

      select t.id
        into v_existing_copy_id
      from public.event_calendar_todos t
      where t.user_id = v_copy.user_id
        and t.shared_origin_todo_id = v_saved_root.id
        and t.is_shared_copy = true
      limit 1;

      if v_existing_copy_id is null then
        insert into public.event_calendar_todos (
          user_id, event_date, event_type, category_id, event_text, memo,
          event_time, event_end_time, is_done, event_range_id,
          shared_origin_todo_id, shared_origin_user_id, shared_group_id,
          shared_created_by, is_shared_copy
        )
        values (
          v_copy.user_id, v_saved_root.event_date,
          coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
          v_copy_category_id, trim(p_event_text), coalesce(p_memo, ''),
          coalesce(p_event_time, '00:00'::time), p_event_end_time,
          v_saved_root.is_done, v_range_id,
          v_saved_root.id, v_root.user_id, v_new_group_id,
          coalesce(v_root.shared_created_by, v_root.user_id), true
        );
      else
        update public.event_calendar_todos t
        set
          event_date = v_saved_root.event_date,
          event_type = coalesce(v_root_category.slug, v_target.slug, 'anniversary'),
          category_id = v_copy_category_id,
          event_text = trim(p_event_text),
          memo = coalesce(p_memo, ''),
          event_time = coalesce(p_event_time, '00:00'::time),
          event_end_time = p_event_end_time,
          is_done = v_saved_root.is_done,
          event_range_id = v_range_id,
          shared_origin_user_id = v_root.user_id,
          shared_group_id = v_new_group_id,
          shared_created_by = coalesce(v_root.shared_created_by, v_root.user_id),
          is_shared_copy = true
        where t.id = v_existing_copy_id;
      end if;

      v_existing_copy_id := null;
    end loop;

    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = v_saved_root.id
      and t.is_shared_copy = true
      and (
        t.shared_group_id is distinct from v_new_group_id
        or not public.is_calendar_group_member(v_new_group_id, t.user_id)
      );
  else
    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = v_saved_root.id
      and t.is_shared_copy = true;
  end if;

  update public.calendar_group_shared_events e
  set
    event_date = t.event_date,
    event_type = t.event_type,
    title = t.event_text,
    memo = coalesce(t.memo, ''),
    color = c.color,
    payload = coalesce(e.payload, '{}'::jsonb) || jsonb_build_object(
      'isDone', t.is_done,
      'eventTime', t.event_time,
      'eventEndTime', t.event_end_time,
      'categoryName', c.name
    ),
    backed_up_at = now()
  from public.event_calendar_todos t
  left join public.event_calendar_categories c on c.id = t.category_id
  where e.calendar_type = 'event'
    and e.source_event_id = t.id::text
    and (
      t.id = v_saved_root.id
      or t.shared_origin_todo_id = v_saved_root.id
    );
end;
$$;

revoke all on function public.create_event_calendar_todo_range(
  date, date, uuid, text, text, time, time
) from public;
revoke all on function public.create_event_calendar_todo_range(
  date, date, uuid, text, text, time, time
) from anon;
grant execute on function public.create_event_calendar_todo_range(
  date, date, uuid, text, text, time, time
) to authenticated;

revoke all on function public.save_event_calendar_todo_range(
  uuid, text, text, time, time, date, date, uuid
) from public;
revoke all on function public.save_event_calendar_todo_range(
  uuid, text, text, time, time, date, date, uuid
) from anon;
grant execute on function public.save_event_calendar_todo_range(
  uuid, text, text, time, time, date, date, uuid
) to authenticated;

revoke all on function public.delete_event_calendar_todo_range(uuid) from public;
revoke all on function public.delete_event_calendar_todo_range(uuid) from anon;
grant execute on function public.delete_event_calendar_todo_range(uuid) to authenticated;

revoke all on function public.create_event_calendar_todo_with_shared_personal(
  date, uuid, text, text, time
) from public;
revoke all on function public.create_event_calendar_todo_with_shared_personal(
  date, uuid, text, text, time
) from anon;
grant execute on function public.create_event_calendar_todo_with_shared_personal(
  date, uuid, text, text, time
) to authenticated;

revoke all on function public.save_event_calendar_todo(
  uuid, text, text, time, time, date, uuid
) from public;
revoke all on function public.save_event_calendar_todo(
  uuid, text, text, time, time, date, uuid
) from anon;
grant execute on function public.save_event_calendar_todo(
  uuid, text, text, time, time, date, uuid
) to authenticated;
