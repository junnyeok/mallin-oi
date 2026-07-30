-- 2026-07-30 자기개발 일정 및 업무 카테고리 시간 지정
-- 기존 날짜 전용 일정과 시간 미지정 카테고리를 그대로 유지하기 위해 시간 컬럼은 nullable이다.

begin;

alter table public.study_calendar_todos
  add column if not exists todo_time time without time zone,
  add column if not exists todo_end_date date,
  add column if not exists todo_end_time time without time zone;

alter table public.study_calendar_todos
  drop constraint if exists study_calendar_todos_time_range_check;

alter table public.study_calendar_todos
  add constraint study_calendar_todos_time_range_check
  check (
    (todo_end_date is null) = (todo_end_time is null)
    and (todo_end_time is null or todo_time is not null)
    and (todo_end_date is null or todo_end_date >= todo_date)
    and (
      todo_end_date is null
      or todo_end_date > todo_date
      or todo_end_time >= todo_time
    )
  );

alter table public.work_calendar_categories
  add column if not exists start_time time without time zone,
  add column if not exists end_time time without time zone,
  add column if not exists ends_next_day boolean not null default false;

alter table public.work_calendar_categories
  drop constraint if exists work_calendar_categories_time_range_check;

alter table public.work_calendar_categories
  add constraint work_calendar_categories_time_range_check
  check (
    (end_time is null or start_time is not null)
    and (end_time is not null or ends_next_day = false)
    and (
      end_time is null
      or ends_next_day = (end_time < start_time)
    )
  );

drop function if exists public.save_study_calendar_todo(uuid, text, text, date, uuid);
drop function if exists public.save_study_calendar_todo(
  uuid, text, text, date, time without time zone, date, time without time zone, uuid
);

create function public.save_study_calendar_todo(
  p_todo_id uuid,
  p_todo_text text,
  p_memo text,
  p_todo_date date,
  p_todo_time time without time zone,
  p_todo_end_date date,
  p_todo_end_time time without time zone,
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
  v_root_id uuid;
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
  if (p_todo_end_date is null) <> (p_todo_end_time is null) then
    raise exception '종료 날짜와 시간을 모두 입력해 주세요.';
  end if;
  if p_todo_end_time is not null and p_todo_time is null then
    raise exception '종료시간을 지정하려면 시작시간이 필요합니다.';
  end if;
  if p_todo_end_date is not null and p_todo_end_date < p_todo_date then
    raise exception '종료 날짜는 시작 날짜보다 빠를 수 없습니다.';
  end if;
  if p_todo_end_date = p_todo_date and p_todo_end_time < p_todo_time then
    raise exception '같은 날 종료시간은 시작시간보다 빠를 수 없습니다.';
  end if;

  select t.*
    into v_selected
  from public.study_calendar_todos t
  where t.id = p_todo_id
    and t.user_id = v_uid;

  if not found then
    raise exception '본인 소유의 일정을 찾을 수 없습니다.';
  end if;
  if not exists (
    select 1 from public.study_calendar_categories
    where id = p_category_id and user_id = v_uid
  ) then
    raise exception '사용할 수 없는 카테고리입니다.';
  end if;

  v_root_id := coalesce(v_selected.shared_origin_todo_id, v_selected.id);

  perform public.update_study_calendar_todo_category_with_shared_personal(
    p_todo_id, p_category_id
  );
  perform public.update_study_shared_personal_todo(
    p_todo_id, trim(p_todo_text), coalesce(p_memo, ''), p_todo_date
  );

  update public.study_calendar_todos
  set
    todo_time = p_todo_time,
    todo_end_date = p_todo_end_date,
    todo_end_time = p_todo_end_time
  where id = v_root_id
     or shared_origin_todo_id = v_root_id;
end;
$$;

revoke all on function public.save_study_calendar_todo(
  uuid, text, text, date, time without time zone, date, time without time zone, uuid
) from public, anon;
grant execute on function public.save_study_calendar_todo(
  uuid, text, text, date, time without time zone, date, time without time zone, uuid
) to authenticated;

commit;
