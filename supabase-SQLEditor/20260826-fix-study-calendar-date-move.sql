-- ============================================================
-- 작업일: 2026-08-26
-- 목적: 자기개발 일정의 날짜와 종료 일시를 한 문장에서 갱신하여
--       날짜 이동 중 시간 범위 제약조건이 중간 상태를 검사하지 않게 한다.
-- ============================================================

begin;

create or replace function public.save_study_calendar_todo(
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
  v_category public.study_calendar_categories%rowtype;
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

  select c.*
    into v_category
  from public.study_calendar_categories c
  where c.id = p_category_id
    and c.user_id = v_uid;

  if not found then
    raise exception '사용할 수 없는 카테고리입니다.';
  end if;

  -- 시작 날짜와 종료 일시는 같은 제약조건에 묶여 있으므로 반드시 한 번에 저장한다.
  update public.study_calendar_todos
  set
    todo_text = trim(p_todo_text),
    memo = coalesce(p_memo, ''),
    todo_date = p_todo_date,
    todo_time = p_todo_time,
    todo_end_date = p_todo_end_date,
    todo_end_time = p_todo_end_time,
    category_id = v_category.id,
    todo_type = coalesce(v_category.slug, 'etc'),
    shared_group_id = null,
    shared_created_by = null,
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    is_shared_copy = false
  where id = p_todo_id
    and user_id = v_uid;

  if not found then
    raise exception '본인 소유의 일정을 찾을 수 없습니다.';
  end if;
end;
$$;

revoke all on function public.save_study_calendar_todo(
  uuid, text, text, date, time without time zone, date, time without time zone, uuid
) from public, anon;
grant execute on function public.save_study_calendar_todo(
  uuid, text, text, date, time without time zone, date, time without time zone, uuid
) to authenticated;

commit;
