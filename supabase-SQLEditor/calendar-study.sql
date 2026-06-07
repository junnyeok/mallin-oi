-- =========================================
-- 자기개발 캘린더 할 일 테이블
-- 계정별 공부 / 운동 / 기타 기록 저장
-- =========================================

create table if not exists public.study_calendar_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_date date not null,
  todo_type text not null default 'study',
  todo_text text not null,
  memo text not null default '',
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint study_calendar_todos_type_check
    check (todo_type in ('study', 'workout', 'etc'))
);

create index if not exists study_calendar_todos_user_date_idx
  on public.study_calendar_todos (user_id, todo_date);

create or replace function public.handle_study_calendar_todos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_study_calendar_todos_updated_at
on public.study_calendar_todos;

create trigger trg_study_calendar_todos_updated_at
before update on public.study_calendar_todos
for each row
execute function public.handle_study_calendar_todos_updated_at();

alter table public.study_calendar_todos enable row level security;

drop policy if exists "study_calendar_todos_select_own"
on public.study_calendar_todos;

create policy "study_calendar_todos_select_own"
on public.study_calendar_todos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "study_calendar_todos_insert_own"
on public.study_calendar_todos;

create policy "study_calendar_todos_insert_own"
on public.study_calendar_todos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "study_calendar_todos_update_own"
on public.study_calendar_todos;

create policy "study_calendar_todos_update_own"
on public.study_calendar_todos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "study_calendar_todos_delete_own"
on public.study_calendar_todos;

create policy "study_calendar_todos_delete_own"
on public.study_calendar_todos
for delete
to authenticated
using (auth.uid() = user_id);

-- =========================================
-- 우리 일정 기능 추가
-- RPC 본문은 supabase-SQLEditor/calendar-shared-personal.sql 참고
-- =========================================

alter table public.study_calendar_categories
  add column if not exists is_shared_personal boolean not null default false,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null;

create index if not exists study_calendar_categories_shared_group_idx
  on public.study_calendar_categories (shared_group_id)
  where is_shared_personal = true;

alter table public.study_calendar_todos
  drop constraint if exists study_calendar_todos_type_check;

alter table public.study_calendar_todos
  add column if not exists shared_origin_todo_id uuid references public.study_calendar_todos(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_created_by uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy boolean not null default false;

create unique index if not exists study_calendar_todos_shared_copy_uidx
  on public.study_calendar_todos (user_id, shared_origin_todo_id)
  where is_shared_copy = true and shared_origin_todo_id is not null;
