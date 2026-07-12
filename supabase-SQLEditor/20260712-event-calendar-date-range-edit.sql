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
