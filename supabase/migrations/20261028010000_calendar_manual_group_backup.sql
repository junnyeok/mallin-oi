-- 2026-10-28 (한국 날짜): 개인 캘린더 수정과 그룹 백업 스냅샷 갱신 분리
-- 일정/메모/시간/색상 변경은 개인 기록과 기존 우리 일정 복사본에만 반영한다.
-- 그룹 백업은 backup_my_calendar_to_group 명시 호출 때만 갱신한다.
-- 업무 백업에는 개별 일정의 시간 지정/해제 상태를 함께 저장한다.
-- 기존 회원/일정/카테고리/백업 데이터의 일괄 변경 및 기존 함수 ACL 변경 없음.
-- 적용 전 운영 함수 정의와 대조하여 검증한 4개 정의만 허용한다. 재실행 가능.
-- 별도 운영 적용 승인 후 이 파일만 실행한다. db push로 다른 migration을 함께 적용하지 않는다.

begin;

-- 확인한 원본 또는 이 파일을 적용한 정의만 허용한다. 다른 서버 변경이 있으면 전체 중단한다.
do $preflight$
declare
  v_signature text;
  v_original_hash text;
  v_updated_hash text;
  v_oid regprocedure;
begin
  for v_signature, v_original_hash, v_updated_hash in
    values
      ('save_event_calendar_todo(uuid,text,text,time without time zone,time without time zone,date,uuid)', '5914101bcb4c0b826ed036b32bac73d8', 'bda34603048a810309a6f16dcfeae7c6'),
      ('save_event_calendar_todo_range(uuid,text,text,time without time zone,time without time zone,date,date,uuid)', '5fe749af02bd6dcf4055409a83e8a56c', '185075477de2566b30a1a995f830636e'),
      ('delete_event_calendar_todo_range(uuid)', '166043a587466369894d08c9e75f6d97', '0363f3f5398dcae8425553816c03cc84'),
      ('backup_my_calendar_to_group(uuid,text)', '792a35949467887cb236d76a3c499f16', '78d0c34788b1b0779c140a7373bd763a')
  loop
    v_oid := to_regprocedure('public.' || v_signature);
    if v_oid is null then
      raise exception '필수 캘린더 함수가 없습니다: %', v_signature;
    end if;
    if md5(pg_get_functiondef(v_oid)) not in (v_original_hash, v_updated_hash) then
      raise exception '검증 기준과 다른 캘린더 함수입니다. 운영 정의를 다시 검토하세요: %', v_signature;
    end if;
  end loop;

  if (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'work_calendar_todos'
        and column_name in ('start_time', 'end_time', 'ends_next_day', 'has_time_override')) <> 4 then
    raise exception '업무 일정 개별 시간 필드가 준비되지 않았습니다.';
  end if;
end;
$preflight$;

CREATE OR REPLACE FUNCTION public.save_event_calendar_todo(p_todo_id uuid, p_event_text text, p_memo text, p_event_time time without time zone, p_event_end_time time without time zone, p_event_date date, p_category_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  update public.event_calendar_todos t
  set
    event_text = trim(p_event_text),
    memo = coalesce(p_memo, ''),
    event_time = p_event_time,
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
          p_event_time, p_event_end_time,
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
          event_time = p_event_time,
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

  -- 그룹 백업 스냅샷은 명시적 백업 RPC에서만 갱신한다.

end;
$function$;

CREATE OR REPLACE FUNCTION public.save_event_calendar_todo_range(p_todo_id uuid, p_event_text text, p_memo text, p_event_time time without time zone, p_event_end_time time without time zone, p_start_date date, p_end_date date, p_category_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        p_event_time, p_event_end_time,
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
        event_time = p_event_time,
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
            p_event_time, p_event_end_time,
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
            event_time = p_event_time,
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

  end loop;

  select coalesce(array_agg(root_id), array[]::uuid[])
    into v_removed_root_ids
  from unnest(v_root_ids) as root_id
  where root_id <> all(v_used_root_ids);

  if coalesce(array_length(v_removed_root_ids, 1), 0) > 0 then
    delete from public.event_calendar_todos t
    where t.shared_origin_todo_id = any(v_removed_root_ids)
      and t.is_shared_copy = true;

    delete from public.event_calendar_todos t
    where t.id = any(v_removed_root_ids);
  end if;
end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_event_calendar_todo_range(p_todo_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_selected public.event_calendar_todos%rowtype;
  v_root public.event_calendar_todos%rowtype;
  v_root_ids uuid[];
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

  delete from public.event_calendar_todos t
  where t.shared_origin_todo_id = any(v_root_ids)
    and t.is_shared_copy = true;

  delete from public.event_calendar_todos t
  where t.id = any(v_root_ids);
end;
$function$;

CREATE OR REPLACE FUNCTION public.backup_my_calendar_to_group(p_group_id uuid, p_calendar_type text)
 RETURNS TABLE(event_count integer, backed_up_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
        'startTime', t.start_time,
        'endTime', t.end_time,
        'endsNextDay', t.ends_next_day,
        'hasTimeOverride', t.has_time_override,
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
$function$;

commit;
