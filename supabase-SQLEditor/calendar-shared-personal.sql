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
  select *
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
  where c.user_id = p_user_id
    and c.shared_group_id = v_source.shared_group_id
    and c.shared_origin_category_id = v_origin_category_id
  limit 1;

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
  select *
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
  where c.user_id = p_user_id
    and c.shared_group_id = v_source.shared_group_id
    and c.shared_origin_category_id = v_origin_category_id
  limit 1;

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
  select *
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
  where c.user_id = p_user_id
    and c.shared_group_id = v_source.shared_group_id
    and c.shared_origin_category_id = v_origin_category_id
  limit 1;

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

  select *
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

    select *
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
      select m.user_id
      from public.calendar_group_members m
      where m.group_id = v_category.shared_group_id
        and m.status = 'active'
        and m.user_id <> v_uid
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

  select *
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

    select *
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
      select m.user_id
      from public.calendar_group_members m
      where m.group_id = v_category.shared_group_id
        and m.status = 'active'
        and m.user_id <> v_uid
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

  select *
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

    select *
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
      select m.user_id
      from public.calendar_group_members m
      where m.group_id = v_category.shared_group_id
        and m.status = 'active'
        and m.user_id <> v_uid
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

  select *
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

  select *
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

  select *
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

  select *
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

  select *
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

  select *
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
