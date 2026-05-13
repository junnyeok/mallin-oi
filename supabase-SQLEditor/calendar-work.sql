-- =========================================
-- 업무 캘린더 카테고리 테이블
-- 계정별 근무 / 휴무 / 야간 / 연차 및 사용자 추가 카테고리 저장
-- =========================================

create table if not exists public.work_calendar_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  color text not null default '#e7f6ff',
  is_default boolean not null default false,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_calendar_categories_name_check
    check (char_length(trim(name)) between 1 and 20),

  constraint work_calendar_categories_color_check
    check (color ~ '^#[0-9A-Fa-f]{6}$'),

  constraint work_calendar_categories_user_slug_unique
    unique (user_id, slug)
);

create index if not exists work_calendar_categories_user_idx
  on public.work_calendar_categories (user_id, sort_order, created_at);

create or replace function public.handle_work_calendar_categories_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_work_calendar_categories_updated_at
on public.work_calendar_categories;

create trigger trg_work_calendar_categories_updated_at
before update on public.work_calendar_categories
for each row
execute function public.handle_work_calendar_categories_updated_at();

alter table public.work_calendar_categories enable row level security;

drop policy if exists "work_calendar_categories_select_own"
on public.work_calendar_categories;

create policy "work_calendar_categories_select_own"
on public.work_calendar_categories
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "work_calendar_categories_insert_own"
on public.work_calendar_categories;

create policy "work_calendar_categories_insert_own"
on public.work_calendar_categories
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "work_calendar_categories_update_own"
on public.work_calendar_categories;

create policy "work_calendar_categories_update_own"
on public.work_calendar_categories
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "work_calendar_categories_delete_own"
on public.work_calendar_categories;

create policy "work_calendar_categories_delete_own"
on public.work_calendar_categories
for delete
to authenticated
using (
  auth.uid() = user_id
  and is_default = false
);


-- =========================================
-- 업무 캘린더 일정 테이블
-- 계정별 근무표 / 휴무 / 야간 / 연차 / 업무 일정 저장
-- =========================================

create table if not exists public.work_calendar_todos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  work_date date not null,
  work_type text not null default 'workday',
  category_id uuid references public.work_calendar_categories(id) on delete set null,
  work_text text not null,
  memo text not null default '',
  is_done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint work_calendar_todos_text_check
    check (char_length(trim(work_text)) between 1 and 100)
);

create index if not exists work_calendar_todos_user_date_idx
  on public.work_calendar_todos (user_id, work_date);

create index if not exists work_calendar_todos_category_idx
  on public.work_calendar_todos (category_id);

create or replace function public.handle_work_calendar_todos_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_work_calendar_todos_updated_at
on public.work_calendar_todos;

create trigger trg_work_calendar_todos_updated_at
before update on public.work_calendar_todos
for each row
execute function public.handle_work_calendar_todos_updated_at();

alter table public.work_calendar_todos enable row level security;

drop policy if exists "work_calendar_todos_select_own"
on public.work_calendar_todos;

create policy "work_calendar_todos_select_own"
on public.work_calendar_todos
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "work_calendar_todos_insert_own"
on public.work_calendar_todos;

create policy "work_calendar_todos_insert_own"
on public.work_calendar_todos
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "work_calendar_todos_update_own"
on public.work_calendar_todos;

create policy "work_calendar_todos_update_own"
on public.work_calendar_todos
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "work_calendar_todos_delete_own"
on public.work_calendar_todos;

create policy "work_calendar_todos_delete_own"
on public.work_calendar_todos
for delete
to authenticated
using (auth.uid() = user_id);