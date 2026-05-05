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