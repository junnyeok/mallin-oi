begin;

-- calendar_group_shared_events는 study/work/event 그룹 백업·붙여넣기 데이터도
-- 저장하므로 이 SQL에서는 어떤 행도 추가, 수정, 삭제하지 않는다.
-- Supabase SQL Editor는 문장을 분리해 실행할 수 있어 TEMP TABLE ON COMMIT DROP을
-- 보호 상태 저장에 사용하지 않고 재실행 가능한 영구 실행 기록을 사용한다.
create table if not exists public.study_work_shared_cleanup_run_20260718 (
  run_key text primary key,
  study_group_event_count bigint not null,
  work_group_event_count bigint not null,
  event_group_event_count bigint not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

revoke all on table public.study_work_shared_cleanup_run_20260718
from public, anon, authenticated;

insert into public.study_work_shared_cleanup_run_20260718 (
  run_key,
  study_group_event_count,
  work_group_event_count,
  event_group_event_count
)
select
  'remove-study-work-shared-v1',
  count(*) filter (where calendar_type = 'study')::bigint,
  count(*) filter (where calendar_type = 'work')::bigint,
  count(*) filter (where calendar_type = 'event')::bigint
from public.calendar_group_shared_events
on conflict (run_key) do nothing;

-- 자기개발·업무 공유 데이터 정리 전 원본을 JSON으로 보존한다.
create table if not exists public.study_work_shared_cleanup_backup_20260718 (
  run_key text not null,
  entity_type text not null,
  entity_id text not null,
  row_data jsonb not null,
  backed_up_at timestamptz not null default now(),
  primary key (run_key, entity_type, entity_id)
);

revoke all on table public.study_work_shared_cleanup_backup_20260718 from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.study_calendar_todos copy
    join public.study_calendar_todos origin on origin.id = copy.shared_origin_todo_id
    where copy.is_shared_copy = true
      and copy.user_id = origin.user_id
  ) then
    raise exception '자기개발 shared copy 중 원본과 user_id가 같은 행이 있습니다. 검증 후 다시 실행해 주세요.';
  end if;

  if exists (
    select 1
    from public.work_calendar_todos copy
    join public.work_calendar_todos origin on origin.id = copy.shared_origin_todo_id
    where copy.is_shared_copy = true
      and copy.user_id = origin.user_id
  ) then
    raise exception '업무 shared copy 중 원본과 user_id가 같은 행이 있습니다. 검증 후 다시 실행해 주세요.';
  end if;

  if exists (
    select 1 from public.study_calendar_todos
    where is_shared_copy = false and shared_origin_todo_id is not null
  ) or exists (
    select 1 from public.work_calendar_todos
    where is_shared_copy = false and shared_origin_todo_id is not null
  ) then
    raise exception 'shared_origin_todo_id가 있지만 shared copy로 표시되지 않은 study/work 행이 있습니다. 검증 후 다시 실행해 주세요.';
  end if;
end;
$$;

insert into public.study_work_shared_cleanup_backup_20260718
  (run_key, entity_type, entity_id, row_data)
select 'remove-study-work-shared-v1', 'study_todo', id::text, to_jsonb(t)
from public.study_calendar_todos t
where is_shared_copy = true
   or shared_group_id is not null
   or shared_origin_todo_id is not null
   or shared_origin_user_id is not null
   or shared_created_by is not null
on conflict (run_key, entity_type, entity_id) do nothing;

insert into public.study_work_shared_cleanup_backup_20260718
  (run_key, entity_type, entity_id, row_data)
select 'remove-study-work-shared-v1', 'work_todo', id::text, to_jsonb(t)
from public.work_calendar_todos t
where is_shared_copy = true
   or shared_group_id is not null
   or shared_origin_todo_id is not null
   or shared_origin_user_id is not null
   or shared_created_by is not null
on conflict (run_key, entity_type, entity_id) do nothing;

insert into public.study_work_shared_cleanup_backup_20260718
  (run_key, entity_type, entity_id, row_data)
select 'remove-study-work-shared-v1', 'study_category', id::text, to_jsonb(c)
from public.study_calendar_categories c
where is_shared_personal = true
   or shared_group_id is not null
   or shared_origin_category_id is not null
   or shared_origin_user_id is not null
   or is_shared_copy_category = true
on conflict (run_key, entity_type, entity_id) do nothing;

insert into public.study_work_shared_cleanup_backup_20260718
  (run_key, entity_type, entity_id, row_data)
select 'remove-study-work-shared-v1', 'work_category', id::text, to_jsonb(c)
from public.work_calendar_categories c
where is_shared_personal = true
   or shared_group_id is not null
   or shared_origin_category_id is not null
   or shared_origin_user_id is not null
   or is_shared_copy_category = true
on conflict (run_key, entity_type, entity_id) do nothing;

-- 현재 정리 대상이 모두 백업됐는지 유형별로 확인한 뒤에만 삭제한다.
do $$
declare
  v_target_count bigint;
  v_backup_count bigint;
begin
  select count(*) into v_target_count
  from public.study_calendar_todos t
  where t.is_shared_copy = true
     or t.shared_group_id is not null
     or t.shared_origin_todo_id is not null
     or t.shared_origin_user_id is not null
     or t.shared_created_by is not null;

  select count(*) into v_backup_count
  from public.study_work_shared_cleanup_backup_20260718 b
  join public.study_calendar_todos t on t.id::text = b.entity_id
  where b.run_key = 'remove-study-work-shared-v1'
    and b.entity_type = 'study_todo'
    and (t.is_shared_copy = true
      or t.shared_group_id is not null
      or t.shared_origin_todo_id is not null
      or t.shared_origin_user_id is not null
      or t.shared_created_by is not null);

  if v_target_count <> v_backup_count then
    raise exception 'study_todo 백업 검증 실패: 정리 대상 %, 백업 %', v_target_count, v_backup_count;
  end if;

  select count(*) into v_target_count
  from public.work_calendar_todos t
  where t.is_shared_copy = true
     or t.shared_group_id is not null
     or t.shared_origin_todo_id is not null
     or t.shared_origin_user_id is not null
     or t.shared_created_by is not null;

  select count(*) into v_backup_count
  from public.study_work_shared_cleanup_backup_20260718 b
  join public.work_calendar_todos t on t.id::text = b.entity_id
  where b.run_key = 'remove-study-work-shared-v1'
    and b.entity_type = 'work_todo'
    and (t.is_shared_copy = true
      or t.shared_group_id is not null
      or t.shared_origin_todo_id is not null
      or t.shared_origin_user_id is not null
      or t.shared_created_by is not null);

  if v_target_count <> v_backup_count then
    raise exception 'work_todo 백업 검증 실패: 정리 대상 %, 백업 %', v_target_count, v_backup_count;
  end if;

  select count(*) into v_target_count
  from public.study_calendar_categories c
  where c.is_shared_personal = true
     or c.shared_group_id is not null
     or c.shared_origin_category_id is not null
     or c.shared_origin_user_id is not null
     or c.is_shared_copy_category = true;

  select count(*) into v_backup_count
  from public.study_work_shared_cleanup_backup_20260718 b
  join public.study_calendar_categories c on c.id::text = b.entity_id
  where b.run_key = 'remove-study-work-shared-v1'
    and b.entity_type = 'study_category'
    and (c.is_shared_personal = true
      or c.shared_group_id is not null
      or c.shared_origin_category_id is not null
      or c.shared_origin_user_id is not null
      or c.is_shared_copy_category = true);

  if v_target_count <> v_backup_count then
    raise exception 'study_category 백업 검증 실패: 정리 대상 %, 백업 %', v_target_count, v_backup_count;
  end if;

  select count(*) into v_target_count
  from public.work_calendar_categories c
  where c.is_shared_personal = true
     or c.shared_group_id is not null
     or c.shared_origin_category_id is not null
     or c.shared_origin_user_id is not null
     or c.is_shared_copy_category = true;

  select count(*) into v_backup_count
  from public.study_work_shared_cleanup_backup_20260718 b
  join public.work_calendar_categories c on c.id::text = b.entity_id
  where b.run_key = 'remove-study-work-shared-v1'
    and b.entity_type = 'work_category'
    and (c.is_shared_personal = true
      or c.shared_group_id is not null
      or c.shared_origin_category_id is not null
      or c.shared_origin_user_id is not null
      or c.is_shared_copy_category = true);

  if v_target_count <> v_backup_count then
    raise exception 'work_category 백업 검증 실패: 정리 대상 %, 백업 %', v_target_count, v_backup_count;
  end if;

end;
$$;

-- 원본이 사라진 고아 copy를 포함해 study/work copy만 삭제한다.
delete from public.study_calendar_todos where is_shared_copy = true;
delete from public.work_calendar_todos where is_shared_copy = true;

-- 작성자의 원본 개인 일정 내용은 유지하고 공유 연결만 제거한다.
update public.study_calendar_todos
set shared_group_id = null,
    shared_created_by = null,
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    is_shared_copy = false
where shared_group_id is not null
   or shared_created_by is not null
   or shared_origin_todo_id is not null
   or shared_origin_user_id is not null
   or is_shared_copy = true;

update public.work_calendar_todos
set shared_group_id = null,
    shared_created_by = null,
    shared_origin_todo_id = null,
    shared_origin_user_id = null,
    is_shared_copy = false
where shared_group_id is not null
   or shared_created_by is not null
   or shared_origin_todo_id is not null
   or shared_origin_user_id is not null
   or is_shared_copy = true;

-- 복제 카테고리는 백업 후 제거하고 작성자의 카테고리는 개인 카테고리로 전환한다.
delete from public.study_calendar_categories where is_shared_copy_category = true;
delete from public.work_calendar_categories where is_shared_copy_category = true;

update public.study_calendar_categories
set is_shared_personal = false,
    shared_group_id = null,
    shared_origin_category_id = null,
    shared_origin_user_id = null,
    is_shared_copy_category = false
where is_shared_personal = true
   or shared_group_id is not null
   or shared_origin_category_id is not null
   or shared_origin_user_id is not null
   or is_shared_copy_category = true;

update public.work_calendar_categories
set is_shared_personal = false,
    shared_group_id = null,
    shared_origin_category_id = null,
    shared_origin_user_id = null,
    is_shared_copy_category = false
where is_shared_personal = true
   or shared_group_id is not null
   or shared_origin_category_id is not null
   or shared_origin_user_id is not null
   or is_shared_copy_category = true;

create or replace function public.enforce_personal_study_work_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.is_shared_personal := false;
  new.shared_group_id := null;
  new.shared_origin_category_id := null;
  new.shared_origin_user_id := null;
  new.is_shared_copy_category := false;
  return new;
end;
$$;

drop trigger if exists trg_study_categories_personal_only on public.study_calendar_categories;
create trigger trg_study_categories_personal_only
before insert or update on public.study_calendar_categories
for each row execute function public.enforce_personal_study_work_category();

drop trigger if exists trg_work_categories_personal_only on public.work_calendar_categories;
create trigger trg_work_categories_personal_only
before insert or update on public.work_calendar_categories
for each row execute function public.enforce_personal_study_work_category();

create or replace function public.enforce_personal_study_work_todo()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.shared_group_id := null;
  new.shared_created_by := null;
  new.shared_origin_todo_id := null;
  new.shared_origin_user_id := null;
  new.is_shared_copy := false;
  return new;
end;
$$;

drop trigger if exists trg_study_todos_personal_only on public.study_calendar_todos;
create trigger trg_study_todos_personal_only
before insert or update on public.study_calendar_todos
for each row execute function public.enforce_personal_study_work_todo();

drop trigger if exists trg_work_todos_personal_only on public.work_calendar_todos;
create trigger trg_work_todos_personal_only
before insert or update on public.work_calendar_todos
for each row execute function public.enforce_personal_study_work_todo();

-- 구버전 클라이언트가 study/work 공유 RPC를 다시 호출하지 못하게 한다.
do $$
declare
  v_function record;
begin
  for v_function in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (p.proname like '%study%shared_personal%'
        or p.proname like '%work%shared_personal%')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_function.signature);
  end loop;
end;
$$;

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
  v_category public.study_calendar_categories%rowtype;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_todo_date is null then raise exception '날짜를 선택해 주세요.'; end if;
  if nullif(trim(coalesce(p_todo_text, '')), '') is null then raise exception '제목을 입력해 주세요.'; end if;

  select c.* into v_category
  from public.study_calendar_categories c
  where c.id = p_category_id and c.user_id = v_uid;
  if not found then raise exception '사용할 수 없는 카테고리입니다.'; end if;

  update public.study_calendar_todos
  set todo_text = trim(p_todo_text), memo = coalesce(p_memo, ''),
      todo_date = p_todo_date, category_id = v_category.id, todo_type = v_category.slug,
      shared_group_id = null, shared_created_by = null,
      shared_origin_todo_id = null, shared_origin_user_id = null, is_shared_copy = false
  where id = p_todo_id and user_id = v_uid;
  if not found then raise exception '본인 소유의 일정을 찾을 수 없습니다.'; end if;
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
  v_category public.work_calendar_categories%rowtype;
  v_conflict_id uuid;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if p_work_date is null then raise exception '날짜를 선택해 주세요.'; end if;

  lock table public.work_calendar_todos in share row exclusive mode;

  select t.* into v_selected
  from public.work_calendar_todos t
  where t.id = p_todo_id and t.user_id = v_uid
  for update;
  if not found then raise exception '본인 소유의 일정을 찾을 수 없습니다.'; end if;

  select c.* into v_category
  from public.work_calendar_categories c
  where c.id = p_category_id and c.user_id = v_uid;
  if not found then raise exception '사용할 수 없는 카테고리입니다.'; end if;

  select t.id into v_conflict_id
  from public.work_calendar_todos t
  where t.user_id = v_uid and t.work_date = p_work_date and t.id <> p_todo_id
  for update;

  if v_conflict_id is not null and not p_overwrite then
    raise exception 'WORK_DATE_CONFLICT: 변경하려는 날짜에 이미 일정이 있습니다.';
  end if;
  if v_conflict_id is not null then
    delete from public.work_calendar_todos where id = v_conflict_id and user_id = v_uid;
  end if;

  update public.work_calendar_todos
  set work_text = coalesce(nullif(trim(p_work_text), ''), v_category.name),
      memo = coalesce(p_memo, ''), work_date = p_work_date,
      category_id = v_category.id, work_type = v_category.slug,
      shared_group_id = null, shared_created_by = null,
      shared_origin_todo_id = null, shared_origin_user_id = null, is_shared_copy = false
  where id = p_todo_id and user_id = v_uid;
end;
$$;

revoke all on function public.save_study_calendar_todo(uuid, text, text, date, uuid) from public, anon;
grant execute on function public.save_study_calendar_todo(uuid, text, text, date, uuid) to authenticated;
revoke all on function public.save_work_calendar_todo(uuid, text, text, date, uuid, boolean) from public, anon;
grant execute on function public.save_work_calendar_todo(uuid, text, text, date, uuid, boolean) to authenticated;

do $$
declare
  v_study_group_event_count bigint;
  v_work_group_event_count bigint;
  v_event_group_event_count bigint;
begin
  if exists (select 1 from public.study_calendar_todos where is_shared_copy = true)
    or exists (select 1 from public.work_calendar_todos where is_shared_copy = true)
    or exists (select 1 from public.study_calendar_categories where is_shared_personal = true or shared_group_id is not null)
    or exists (select 1 from public.work_calendar_categories where is_shared_personal = true or shared_group_id is not null) then
    raise exception 'study/work 공유 데이터 정리 검증에 실패했습니다.';
  end if;

  select
    study_group_event_count,
    work_group_event_count,
    event_group_event_count
  into
    v_study_group_event_count,
    v_work_group_event_count,
    v_event_group_event_count
  from public.study_work_shared_cleanup_run_20260718
  where run_key = 'remove-study-work-shared-v1';

  if not found then
    raise exception 'study/work 공유 정리 실행 guard를 찾을 수 없습니다.';
  end if;

  if (select count(*) from public.calendar_group_shared_events where calendar_type = 'study')
     <> v_study_group_event_count then
    raise exception 'study 그룹 백업 데이터 보존 검증에 실패했습니다.';
  end if;

  if (select count(*) from public.calendar_group_shared_events where calendar_type = 'work')
     <> v_work_group_event_count then
    raise exception 'work 그룹 백업 데이터 보존 검증에 실패했습니다.';
  end if;

  if (select count(*) from public.calendar_group_shared_events where calendar_type = 'event')
     <> v_event_group_event_count then
    raise exception 'event 그룹 백업 데이터 보존 검증에 실패했습니다.';
  end if;
end;
$$;

update public.study_work_shared_cleanup_run_20260718
set completed_at = now()
where run_key = 'remove-study-work-shared-v1';

commit;
