begin;

-- 업무 캘린더의 기존 데이터가 날짜별 한 건 정책을 만족하는지 먼저 확인한다.
do $$
begin
  if exists (
    select 1
    from public.work_calendar_todos
    group by user_id, work_date
    having count(*) > 1
  ) then
    raise exception 'work_calendar_todos에 사용자별 같은 날짜의 중복 일정이 있습니다. 중복을 정리한 뒤 다시 실행해 주세요.';
  end if;
end;
$$;

create unique index if not exists work_calendar_todos_user_date_uidx
  on public.work_calendar_todos (user_id, work_date);

create or replace function public.save_study_calendar_todo(
  p_todo_id uuid,
  p_todo_text text,
  p_memo text,
  p_todo_date date,
  p_category_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_todo_date is null then
    raise exception '날짜를 선택해 주세요.';
  end if;
  if nullif(trim(coalesce(p_todo_text, '')), '') is null then
    raise exception '제목을 입력해 주세요.';
  end if;
  if not exists (
    select 1 from public.study_calendar_todos
    where id = p_todo_id and user_id = v_uid
  ) then
    raise exception '본인 소유의 일정을 찾을 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.study_calendar_categories
    where id = p_category_id and user_id = v_uid
  ) then
    raise exception '사용할 수 없는 카테고리입니다.';
  end if;

  perform public.update_study_calendar_todo_category_with_shared_personal(
    p_todo_id, p_category_id
  );
  perform public.update_study_shared_personal_todo(
    p_todo_id, trim(p_todo_text), coalesce(p_memo, ''), p_todo_date
  );
end;
$$;

create or replace function public.save_work_calendar_todo(
  p_todo_id uuid,
  p_work_text text,
  p_memo text,
  p_work_date date,
  p_category_id uuid,
  p_overwrite boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.work_calendar_todos%rowtype;
  v_root_id uuid;
  v_family_ids uuid[];
  v_conflict_roots uuid[];
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_work_date is null then
    raise exception '날짜를 선택해 주세요.';
  end if;

  -- 날짜 이동과 일반 INSERT/UPDATE가 같은 테이블에서 교차하는 동안 직렬화한다.
  lock table public.work_calendar_todos in share row exclusive mode;

  select t.* into v_selected
  from public.work_calendar_todos t
  where t.id = p_todo_id and t.user_id = v_uid
  for update;

  if not found then
    raise exception '본인 소유의 일정을 찾을 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.work_calendar_categories
    where id = p_category_id and user_id = v_uid
  ) then
    raise exception '사용할 수 없는 카테고리입니다.';
  end if;

  v_root_id := coalesce(v_selected.shared_origin_todo_id, v_selected.id);
  select coalesce(array_agg(t.id), array[]::uuid[])
    into v_family_ids
  from public.work_calendar_todos t
  where t.id = v_root_id or t.shared_origin_todo_id = v_root_id;

  select coalesce(array_agg(distinct coalesce(t.shared_origin_todo_id, t.id)), array[]::uuid[])
    into v_conflict_roots
  from public.work_calendar_todos moving
  join public.work_calendar_todos t
    on t.user_id = moving.user_id
   and t.work_date = p_work_date
   and not (t.id = any(v_family_ids))
  where moving.id = any(v_family_ids);

  if cardinality(v_conflict_roots) > 0 and not p_overwrite then
    raise exception 'WORK_DATE_CONFLICT: 변경하려는 날짜에 이미 일정이 있습니다.';
  end if;

  if cardinality(v_conflict_roots) > 0 then
    if exists (
      select 1
      from public.work_calendar_todos conflict_root
      where conflict_root.id = any(v_conflict_roots)
        and conflict_root.user_id <> v_uid
        and (
          conflict_root.shared_group_id is null
          or not public.is_calendar_group_member(conflict_root.shared_group_id, v_uid)
        )
    ) then
      raise exception '다른 사용자의 개인 업무 일정은 덮어쓸 수 없습니다.';
    end if;

    delete from public.calendar_group_shared_events e
    where e.calendar_type = 'work'
      and (
        e.source_event_id in (
          select conflict_root_id::text
          from unnest(v_conflict_roots) as roots(conflict_root_id)
        )
        or e.payload->>'shared_origin_todo_id' in (
          select conflict_root_id::text
          from unnest(v_conflict_roots) as roots(conflict_root_id)
        )
      );

    delete from public.work_calendar_todos t
    where t.id = any(v_conflict_roots)
       or t.shared_origin_todo_id = any(v_conflict_roots);
  end if;

  perform public.update_work_calendar_todo_category_with_shared_personal(
    p_todo_id, p_category_id
  );
  perform public.update_work_shared_personal_todo(
    p_todo_id,
    coalesce(nullif(trim(p_work_text), ''), v_selected.work_text),
    coalesce(p_memo, ''),
    p_work_date
  );
end;
$$;

revoke all on function public.save_study_calendar_todo(uuid, text, text, date, uuid)
  from public, anon;
grant execute on function public.save_study_calendar_todo(uuid, text, text, date, uuid)
  to authenticated;

revoke all on function public.save_work_calendar_todo(uuid, text, text, date, uuid, boolean)
  from public, anon;
grant execute on function public.save_work_calendar_todo(uuid, text, text, date, uuid, boolean)
  to authenticated;

commit;
