-- 2026-08-27 업무 일정 종료시간의 명시적 익일 지정
-- 기존 데이터는 변경하지 않고, 일정별 종료시간이 다음 날인지 사용자가 직접 저장할 수 있게 한다.

begin;

alter table public.work_calendar_todos
  drop constraint if exists work_calendar_todos_time_range_check;

alter table public.work_calendar_todos
  add constraint work_calendar_todos_time_range_check
  check (
    (
      has_time_override = false
      and start_time is null
      and end_time is null
      and ends_next_day = false
    )
    or
    (
      has_time_override = true
      and (end_time is null or start_time is not null)
      and (ends_next_day = false or (start_time is not null and end_time is not null))
      and (end_time is null or ends_next_day = true or end_time >= start_time)
    )
  );

comment on column public.work_calendar_todos.end_time is
  '업무 일정 한 건에 저장한 종료 시간. ends_next_day와 함께 실제 종료일을 해석한다.';
comment on column public.work_calendar_todos.ends_next_day is
  '업무 일정 종료가 일정 날짜의 다음 날인지 사용자가 지정한 상태.';

create or replace function public.save_work_calendar_todo(
  p_todo_id uuid,
  p_work_text text,
  p_memo text,
  p_work_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_category_id uuid,
  p_ends_next_day boolean,
  p_overwrite boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_selected public.work_calendar_todos%rowtype;
  v_category public.work_calendar_categories%rowtype;
  v_conflict_id uuid;
  v_ends_next_day boolean := coalesce(p_ends_next_day, false);
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if p_work_date is null then
    raise exception '날짜를 선택해 주세요.';
  end if;
  if p_end_time is not null and p_start_time is null then
    raise exception '종료시간을 지정하려면 시작시간이 필요합니다.';
  end if;
  if v_ends_next_day and (p_start_time is null or p_end_time is null) then
    raise exception '다음 날 종료를 지정하려면 시작시간과 종료시간이 필요합니다.';
  end if;
  if not v_ends_next_day
    and p_start_time is not null
    and p_end_time is not null
    and p_end_time < p_start_time then
    raise exception '종료시간이 시작시간보다 이르면 다음 날 종료로 지정해야 합니다.';
  end if;

  lock table public.work_calendar_todos in share row exclusive mode;

  select t.*
    into v_selected
  from public.work_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid
  for update;

  if not found then
    raise exception '본인 소유의 일정을 찾을 수 없습니다.';
  end if;

  select c.*
    into v_category
  from public.work_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '사용할 수 없는 카테고리입니다.';
  end if;

  select t.id
    into v_conflict_id
  from public.work_calendar_todos t
  where t.user_id = v_uid
    and t.work_date = p_work_date
    and t.id <> p_todo_id
  for update;

  if v_conflict_id is not null and not p_overwrite then
    raise exception 'WORK_DATE_CONFLICT: 변경하려는 날짜에 이미 일정이 있습니다.';
  end if;

  if v_conflict_id is not null then
    delete from public.work_calendar_todos
    where id = v_conflict_id
      and user_id = v_uid;
  end if;

  update public.work_calendar_todos
  set
    work_text = coalesce(nullif(trim(p_work_text), ''), v_category.name),
    memo = coalesce(p_memo, ''),
    work_date = p_work_date,
    start_time = p_start_time,
    end_time = p_end_time,
    ends_next_day = v_ends_next_day,
    has_time_override = true,
    category_id = v_category.id,
    work_type = v_category.slug,
    shared_group_id = null,
    shared_created_by = null,
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    is_shared_copy = false
  where id = p_todo_id
    and user_id = v_uid;
end;
$$;

create or replace function public.save_work_calendar_todo(
  p_todo_id uuid,
  p_work_text text,
  p_memo text,
  p_work_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_category_id uuid,
  p_overwrite boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.save_work_calendar_todo(
    p_todo_id,
    p_work_text,
    p_memo,
    p_work_date,
    p_start_time,
    p_end_time,
    p_category_id,
    p_start_time is not null and p_end_time is not null and p_end_time < p_start_time,
    p_overwrite
  );
end;
$$;

revoke all on function public.save_work_calendar_todo(
  uuid, text, text, date, time without time zone, time without time zone, uuid, boolean, boolean
) from public, anon;
grant execute on function public.save_work_calendar_todo(
  uuid, text, text, date, time without time zone, time without time zone, uuid, boolean, boolean
) to authenticated;

revoke all on function public.save_work_calendar_todo(
  uuid, text, text, date, time without time zone, time without time zone, uuid, boolean
) from public, anon;
grant execute on function public.save_work_calendar_todo(
  uuid, text, text, date, time without time zone, time without time zone, uuid, boolean
) to authenticated;

commit;
