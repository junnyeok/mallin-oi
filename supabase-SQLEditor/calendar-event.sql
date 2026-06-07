-- =========================================
-- 이벤트 캘린더 카테고리 테이블
-- 계정별 약속 / 일정 / 기념일 및 사용자 추가 카테고리 저장
-- =========================================

create table if not exists public.event_calendar_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#ffe0ef',
  is_default boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_calendar_categories_name_check
    check (char_length(trim(name)) between 1 and 20),

  constraint event_calendar_categories_color_check
    check (color ~ '^#[0-9A-Fa-f]{6}$'),

  constraint event_calendar_categories_user_slug_unique
    unique (user_id, slug)
);

create index if not exists event_calendar_categories_user_idx
  on public.event_calendar_categories (user_id, sort_order, created_at);

create or replace function public.handle_event_calendar_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_event_calendar_categories_updated_at
on public.event_calendar_categories;

create trigger trg_event_calendar_categories_updated_at
before update on public.event_calendar_categories
for each row
execute function public.handle_event_calendar_categories_updated_at();

alter table public.event_calendar_categories enable row level security;

drop policy if exists "event_calendar_categories_select_own"
on public.event_calendar_categories;

create policy "event_calendar_categories_select_own"
on public.event_calendar_categories
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "event_calendar_categories_insert_own"
on public.event_calendar_categories;

create policy "event_calendar_categories_insert_own"
on public.event_calendar_categories
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "event_calendar_categories_update_own"
on public.event_calendar_categories;

create policy "event_calendar_categories_update_own"
on public.event_calendar_categories
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "event_calendar_categories_delete_own"
on public.event_calendar_categories;

create policy "event_calendar_categories_delete_own"
on public.event_calendar_categories
for delete
to authenticated
using (
  auth.uid() = user_id
  and is_default = false
);


-- =========================================
-- 이벤트 캘린더 일정 테이블
-- 계정별 개인 일정 / 약속 / 행사 / 할 일 저장
-- =========================================

create table if not exists public.event_calendar_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_date date not null,
  event_type text not null default 'appointment',
  category_id uuid references public.event_calendar_categories(id) on delete set null,
  event_text text not null,
  memo text not null default '',
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint event_calendar_todos_text_check
    check (char_length(trim(event_text)) between 1 and 100)
);

create index if not exists event_calendar_todos_user_date_idx
  on public.event_calendar_todos (user_id, event_date);

create index if not exists event_calendar_todos_category_idx
  on public.event_calendar_todos (category_id);

create or replace function public.handle_event_calendar_todos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_event_calendar_todos_updated_at
on public.event_calendar_todos;

create trigger trg_event_calendar_todos_updated_at
before update on public.event_calendar_todos
for each row
execute function public.handle_event_calendar_todos_updated_at();

alter table public.event_calendar_todos enable row level security;

drop policy if exists "event_calendar_todos_select_own"
on public.event_calendar_todos;

create policy "event_calendar_todos_select_own"
on public.event_calendar_todos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "event_calendar_todos_insert_own"
on public.event_calendar_todos;

create policy "event_calendar_todos_insert_own"
on public.event_calendar_todos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "event_calendar_todos_update_own"
on public.event_calendar_todos;

create policy "event_calendar_todos_update_own"
on public.event_calendar_todos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "event_calendar_todos_delete_own"
on public.event_calendar_todos;

create policy "event_calendar_todos_delete_own"
on public.event_calendar_todos
for delete
to authenticated
using (auth.uid() = user_id);
-- 추가 및 수정 5/14
alter table public.event_calendar_todos
add column if not exists event_time time null;

create index if not exists event_calendar_todos_user_date_time_idx
on public.event_calendar_todos (user_id, event_date, event_time);

-- =========================================
-- 우리 일정 기능 추가
-- RPC 본문은 supabase-SQLEditor/calendar-shared-personal.sql 참고
-- =========================================

alter table public.event_calendar_categories
  add column if not exists is_shared_personal boolean not null default false,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null;

create index if not exists event_calendar_categories_shared_group_idx
  on public.event_calendar_categories (shared_group_id)
  where is_shared_personal = true;

alter table public.event_calendar_todos
  add column if not exists shared_origin_todo_id uuid references public.event_calendar_todos(id) on delete set null,
  add column if not exists shared_origin_user_id uuid references auth.users(id) on delete set null,
  add column if not exists shared_group_id uuid references public.calendar_groups(id) on delete set null,
  add column if not exists shared_created_by uuid references auth.users(id) on delete set null,
  add column if not exists is_shared_copy boolean not null default false;

create unique index if not exists event_calendar_todos_shared_copy_uidx
  on public.event_calendar_todos (user_id, shared_origin_todo_id)
  where is_shared_copy = true and shared_origin_todo_id is not null;
