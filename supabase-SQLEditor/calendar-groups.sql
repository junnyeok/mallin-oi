-- =========================================
-- 캘린더 그룹 공유 기능
-- 2026-05-28
-- =========================================

create extension if not exists pgcrypto;

create table if not exists public.calendar_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#f54260',
  visibility text not null default 'public',
  password_hash text,
  is_hidden boolean not null default false,
  allow_study boolean not null default true,
  allow_work boolean not null default true,
  allow_event boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_groups_name_check
    check (char_length(trim(name)) between 1 and 30),
  constraint calendar_groups_color_check
    check (color ~ '^#[0-9A-Fa-f]{6}$'),
  constraint calendar_groups_visibility_check
    check (visibility in ('public', 'private')),
  constraint calendar_groups_allow_one_check
    check (allow_study or allow_work or allow_event)
);

create index if not exists calendar_groups_visible_idx
  on public.calendar_groups (is_hidden, visibility, created_at desc);

create table if not exists public.calendar_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  status text not null default 'active',
  joined_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_group_members_role_check
    check (role in ('owner', 'admin', 'member')),
  constraint calendar_group_members_status_check
    check (status in ('active', 'invited', 'blocked', 'left')),
  constraint calendar_group_members_unique
    unique (group_id, user_id)
);

create index if not exists calendar_group_members_user_idx
  on public.calendar_group_members (user_id, status, group_id);

create table if not exists public.calendar_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint calendar_group_invites_status_check
    check (status in ('pending', 'accepted', 'declined', 'cancelled'))
);

create index if not exists calendar_group_invites_invitee_idx
  on public.calendar_group_invites (invitee_id, status, created_at desc);

create table if not exists public.calendar_group_shared_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  calendar_type text not null,
  source_event_id text not null,
  event_date date not null,
  event_type text,
  title text not null,
  memo text not null default '',
  color text,
  payload jsonb not null default '{}'::jsonb,
  backed_up_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_group_shared_events_type_check
    check (calendar_type in ('study', 'work', 'event')),
  constraint calendar_group_shared_events_title_check
    check (char_length(trim(title)) between 1 and 100),
  constraint calendar_group_shared_events_unique
    unique (group_id, user_id, calendar_type, source_event_id)
);

create index if not exists calendar_group_shared_events_view_idx
  on public.calendar_group_shared_events (group_id, calendar_type, event_date, user_id);

create table if not exists public.calendar_group_user_settings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_hidden_for_user boolean not null default false,
  selected boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_group_user_settings_unique
    unique (group_id, user_id)
);

create or replace function public.handle_calendar_groups_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_calendar_groups_updated_at on public.calendar_groups;
create trigger trg_calendar_groups_updated_at
before update on public.calendar_groups
for each row execute function public.handle_calendar_groups_updated_at();

drop trigger if exists trg_calendar_group_members_updated_at on public.calendar_group_members;
create trigger trg_calendar_group_members_updated_at
before update on public.calendar_group_members
for each row execute function public.handle_calendar_groups_updated_at();

drop trigger if exists trg_calendar_group_shared_events_updated_at on public.calendar_group_shared_events;
create trigger trg_calendar_group_shared_events_updated_at
before update on public.calendar_group_shared_events
for each row execute function public.handle_calendar_groups_updated_at();

drop trigger if exists trg_calendar_group_user_settings_updated_at on public.calendar_group_user_settings;
create trigger trg_calendar_group_user_settings_updated_at
before update on public.calendar_group_user_settings
for each row execute function public.handle_calendar_groups_updated_at();

create or replace function public.is_calendar_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.calendar_group_members m
    where m.group_id = p_group_id
      and m.user_id = p_user_id
      and m.status = 'active'
  );
$$;

create or replace function public.is_calendar_group_manager(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.calendar_group_members m
    where m.group_id = p_group_id
      and m.user_id = p_user_id
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  );
$$;

alter table public.calendar_groups enable row level security;
alter table public.calendar_group_members enable row level security;
alter table public.calendar_group_invites enable row level security;
alter table public.calendar_group_shared_events enable row level security;
alter table public.calendar_group_user_settings enable row level security;

drop policy if exists "calendar_groups_select_visible_or_member" on public.calendar_groups;
create policy "calendar_groups_select_visible_or_member"
on public.calendar_groups
for select
to authenticated
using (
  public.is_calendar_group_member(id)
  or (
    is_hidden = false
    and visibility in ('public', 'private')
  )
);

drop policy if exists "calendar_groups_insert_own" on public.calendar_groups;
create policy "calendar_groups_insert_own"
on public.calendar_groups
for insert
to authenticated
with check (auth.uid() = owner_id);

drop policy if exists "calendar_groups_update_manager" on public.calendar_groups;
create policy "calendar_groups_update_manager"
on public.calendar_groups
for update
to authenticated
using (public.is_calendar_group_manager(id))
with check (public.is_calendar_group_manager(id));

drop policy if exists "calendar_group_members_select_same_group" on public.calendar_group_members;
create policy "calendar_group_members_select_same_group"
on public.calendar_group_members
for select
to authenticated
using (public.is_calendar_group_member(group_id));

drop policy if exists "calendar_group_members_insert_self" on public.calendar_group_members;
create policy "calendar_group_members_insert_self"
on public.calendar_group_members
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "calendar_group_members_update_manager_or_self_leave" on public.calendar_group_members;
create policy "calendar_group_members_update_manager_or_self_leave"
on public.calendar_group_members
for update
to authenticated
using (
  public.is_calendar_group_manager(group_id)
  or auth.uid() = user_id
)
with check (
  public.is_calendar_group_manager(group_id)
  or auth.uid() = user_id
);

drop policy if exists "calendar_group_invites_select_related" on public.calendar_group_invites;
create policy "calendar_group_invites_select_related"
on public.calendar_group_invites
for select
to authenticated
using (
  auth.uid() in (inviter_id, invitee_id)
  or public.is_calendar_group_manager(group_id)
);

drop policy if exists "calendar_group_invites_insert_manager" on public.calendar_group_invites;
create policy "calendar_group_invites_insert_manager"
on public.calendar_group_invites
for insert
to authenticated
with check (
  auth.uid() = inviter_id
  and public.is_calendar_group_manager(group_id)
);

drop policy if exists "calendar_group_invites_update_related" on public.calendar_group_invites;
create policy "calendar_group_invites_update_related"
on public.calendar_group_invites
for update
to authenticated
using (
  auth.uid() = invitee_id
  or public.is_calendar_group_manager(group_id)
)
with check (
  auth.uid() = invitee_id
  or public.is_calendar_group_manager(group_id)
);

drop policy if exists "calendar_group_shared_events_select_member" on public.calendar_group_shared_events;
create policy "calendar_group_shared_events_select_member"
on public.calendar_group_shared_events
for select
to authenticated
using (public.is_calendar_group_member(group_id));

drop policy if exists "calendar_group_shared_events_insert_own_member" on public.calendar_group_shared_events;
create policy "calendar_group_shared_events_insert_own_member"
on public.calendar_group_shared_events
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.is_calendar_group_member(group_id)
);

drop policy if exists "calendar_group_shared_events_update_own" on public.calendar_group_shared_events;
create policy "calendar_group_shared_events_update_own"
on public.calendar_group_shared_events
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "calendar_group_shared_events_delete_own" on public.calendar_group_shared_events;
create policy "calendar_group_shared_events_delete_own"
on public.calendar_group_shared_events
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists "calendar_group_user_settings_select_own" on public.calendar_group_user_settings;
create policy "calendar_group_user_settings_select_own"
on public.calendar_group_user_settings
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "calendar_group_user_settings_write_own" on public.calendar_group_user_settings;
create policy "calendar_group_user_settings_write_own"
on public.calendar_group_user_settings
for all
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.create_calendar_group(
  p_name text,
  p_color text default '#f54260',
  p_allow_study boolean default true,
  p_allow_work boolean default true,
  p_allow_event boolean default false,
  p_visibility text default 'public',
  p_password text default null,
  p_is_hidden boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_group_id uuid;
  v_visibility text := case when p_visibility = 'private' then 'private' else 'public' end;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not (coalesce(p_allow_study, false) or coalesce(p_allow_work, false) or coalesce(p_allow_event, false)) then
    raise exception '연동할 캘린더를 하나 이상 선택해야 합니다.';
  end if;

  insert into public.calendar_groups (
    owner_id,
    name,
    color,
    visibility,
    password_hash,
    is_hidden,
    allow_study,
    allow_work,
    allow_event
  )
  values (
    v_uid,
    trim(p_name),
    case when coalesce(p_color, '') ~ '^#[0-9A-Fa-f]{6}$' then lower(p_color) else '#f54260' end,
    v_visibility,
    case
      when v_visibility = 'private' and nullif(p_password, '') is not null
        then crypt(p_password, gen_salt('bf'))
      else null
    end,
    coalesce(p_is_hidden, false),
    coalesce(p_allow_study, false),
    coalesce(p_allow_work, false),
    coalesce(p_allow_event, false)
  )
  returning id into v_group_id;

  insert into public.calendar_group_members (group_id, user_id, role, status)
  values (v_group_id, v_uid, 'owner', 'active');

  return v_group_id;
end;
$$;

create or replace function public.join_calendar_group(
  p_group_id uuid,
  p_password text default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_group public.calendar_groups%rowtype;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  select *
    into v_group
  from public.calendar_groups
  where id = p_group_id;

  if not found then
    raise exception '그룹을 찾을 수 없습니다.';
  end if;

  if v_group.visibility = 'private' then
    if v_group.password_hash is null or crypt(coalesce(p_password, ''), v_group.password_hash) <> v_group.password_hash then
      raise exception '비밀번호가 올바르지 않습니다.';
    end if;
  end if;

  insert into public.calendar_group_members (group_id, user_id, role, status, joined_at)
  values (p_group_id, v_uid, 'member', 'active', now())
  on conflict (group_id, user_id)
  do update set
    status = 'active',
    joined_at = case
      when public.calendar_group_members.status = 'left' then now()
      else public.calendar_group_members.joined_at
    end,
    updated_at = now();
end;
$$;

create or replace function public.leave_calendar_group(p_group_id uuid)
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

  if exists (
    select 1
    from public.calendar_group_members
    where group_id = p_group_id
      and user_id = v_uid
      and role = 'owner'
      and status = 'active'
  ) then
    raise exception '그룹장은 그룹을 나갈 수 없습니다. 먼저 그룹을 숨기거나 관리자를 지정해 주세요.';
  end if;

  update public.calendar_group_members
  set status = 'left',
      updated_at = now()
  where group_id = p_group_id
    and user_id = v_uid;
end;
$$;

create or replace function public.set_calendar_group_hidden(
  p_group_id uuid,
  p_is_hidden boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_calendar_group_manager(p_group_id, auth.uid()) then
    raise exception '그룹 관리자만 숨김 상태를 변경할 수 있습니다.';
  end if;

  update public.calendar_groups
  set is_hidden = coalesce(p_is_hidden, false),
      updated_at = now()
  where id = p_group_id;
end;
$$;

create or replace function public.update_calendar_group(
  p_group_id uuid,
  p_name text,
  p_color text,
  p_allow_study boolean,
  p_allow_work boolean,
  p_allow_event boolean,
  p_visibility text,
  p_password text default null,
  p_is_hidden boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_visibility text := case when p_visibility = 'private' then 'private' else 'public' end;
begin
  if not public.is_calendar_group_manager(p_group_id, auth.uid()) then
    raise exception '그룹 관리자만 수정할 수 있습니다.';
  end if;

  if not (coalesce(p_allow_study, false) or coalesce(p_allow_work, false) or coalesce(p_allow_event, false)) then
    raise exception '연동할 캘린더를 하나 이상 선택해야 합니다.';
  end if;

  update public.calendar_groups
  set name = trim(p_name),
      color = case when coalesce(p_color, '') ~ '^#[0-9A-Fa-f]{6}$' then lower(p_color) else color end,
      allow_study = coalesce(p_allow_study, false),
      allow_work = coalesce(p_allow_work, false),
      allow_event = coalesce(p_allow_event, false),
      visibility = v_visibility,
      password_hash = case
        when v_visibility = 'private' and nullif(p_password, '') is not null
          then crypt(p_password, gen_salt('bf'))
        when v_visibility = 'public' then null
        else password_hash
      end,
      is_hidden = coalesce(p_is_hidden, false),
      updated_at = now()
  where id = p_group_id;
end;
$$;

create or replace function public.get_my_calendar_groups()
returns table (
  id uuid,
  name text,
  color text,
  visibility text,
  is_hidden boolean,
  allow_study boolean,
  allow_work boolean,
  allow_event boolean,
  role text,
  member_count bigint,
  can_manage boolean,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.color,
    g.visibility,
    g.is_hidden,
    g.allow_study,
    g.allow_work,
    g.allow_event,
    m.role,
    (
      select count(*)
      from public.calendar_group_members cm
      where cm.group_id = g.id
        and cm.status = 'active'
    ) as member_count,
    m.role in ('owner', 'admin') as can_manage,
    m.joined_at
  from public.calendar_group_members m
  join public.calendar_groups g on g.id = m.group_id
  where m.user_id = auth.uid()
    and m.status = 'active'
  order by m.joined_at desc;
$$;

create or replace function public.get_visible_calendar_groups(p_include_hidden boolean default false)
returns table (
  id uuid,
  name text,
  color text,
  visibility text,
  is_hidden boolean,
  allow_study boolean,
  allow_work boolean,
  allow_event boolean,
  role text,
  member_count bigint,
  can_manage boolean,
  joined_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    g.id,
    g.name,
    g.color,
    g.visibility,
    g.is_hidden,
    g.allow_study,
    g.allow_work,
    g.allow_event,
    coalesce(m.role, '') as role,
    (
      select count(*)
      from public.calendar_group_members cm
      where cm.group_id = g.id
        and cm.status = 'active'
    ) as member_count,
    coalesce(m.role in ('owner', 'admin'), false) as can_manage,
    m.joined_at
  from public.calendar_groups g
  left join public.calendar_group_members m
    on m.group_id = g.id
   and m.user_id = auth.uid()
   and m.status = 'active'
  where g.visibility in ('public', 'private')
    and (p_include_hidden = true or g.is_hidden = false)
  order by g.created_at desc;
$$;

create or replace function public.backup_my_calendar_to_group(
  p_group_id uuid,
  p_calendar_type text
)
returns table (
  event_count integer,
  backed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
  v_count integer := 0;
  v_allowed boolean := false;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if not public.is_calendar_group_member(p_group_id, v_uid) then
    raise exception '그룹 멤버만 백업할 수 있습니다.';
  end if;

  select case p_calendar_type
    when 'study' then cg.allow_study
    when 'work' then cg.allow_work
    when 'event' then cg.allow_event
    else false
  end
    into v_allowed
  from public.calendar_groups cg
  where cg.id = p_group_id;

  if not coalesce(v_allowed, false) then
    raise exception '이 그룹은 해당 캘린더 연동이 꺼져 있습니다.';
  end if;

  delete from public.calendar_group_shared_events cgse
  where cgse.group_id = p_group_id
    and cgse.user_id = v_uid
    and cgse.calendar_type = p_calendar_type;

  if p_calendar_type = 'study' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id,
      t.user_id,
      'study',
      t.id::text,
      t.todo_date,
      coalesce(c.slug, t.todo_type),
      t.todo_text,
      coalesce(t.memo, ''),
      c.color,
      jsonb_build_object('isDone', t.is_done, 'categoryName', c.name),
      v_now
    from public.study_calendar_todos t
    left join public.study_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid;

  elsif p_calendar_type = 'work' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id,
      t.user_id,
      'work',
      t.id::text,
      t.work_date,
      coalesce(c.slug, t.work_type),
      coalesce(c.name, t.work_text),
      coalesce(t.memo, ''),
      c.color,
      jsonb_build_object('isDone', t.is_done, 'workText', t.work_text),
      v_now
    from public.work_calendar_todos t
    left join public.work_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid;

  elsif p_calendar_type = 'event' then
    insert into public.calendar_group_shared_events (
      group_id, user_id, calendar_type, source_event_id, event_date,
      event_type, title, memo, color, payload, backed_up_at
    )
    select
      p_group_id,
      t.user_id,
      'event',
      t.id::text,
      t.event_date,
      coalesce(c.slug, t.event_type),
      t.event_text,
      coalesce(t.memo, ''),
      c.color,
      jsonb_build_object('isDone', t.is_done, 'eventTime', t.event_time, 'categoryName', c.name),
      v_now
    from public.event_calendar_todos t
    left join public.event_calendar_categories c on c.id = t.category_id
    where t.user_id = v_uid;

  else
    raise exception '지원하지 않는 캘린더 타입입니다.';
  end if;

  get diagnostics v_count = row_count;

  return query
  select
    v_count::integer as event_count,
    v_now as backed_up_at;
end;
$$;

create or replace function public.get_group_calendar_view(
  p_group_id uuid,
  p_calendar_type text,
  p_start_date date,
  p_end_date date
)
returns table (
  id uuid,
  group_id uuid,
  user_id uuid,
  user_nickname text,
  calendar_type text,
  source_event_id text,
  event_date date,
  event_type text,
  title text,
  memo text,
  color text,
  payload jsonb,
  backed_up_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_allowed boolean := false;
begin
  if not public.is_calendar_group_member(p_group_id, auth.uid()) then
    raise exception '그룹 멤버만 볼 수 있습니다.';
  end if;

  select case p_calendar_type
    when 'study' then cg.allow_study
    when 'work' then cg.allow_work
    when 'event' then cg.allow_event
    else false
  end
    into v_allowed
  from public.calendar_groups cg
  where cg.id = p_group_id;

  if not coalesce(v_allowed, false) then
    return;
  end if;

  return query
  select
    e.id,
    e.group_id,
    e.user_id,
    coalesce(nullif(trim(p.nickname), ''), '회원') as user_nickname,
    e.calendar_type,
    e.source_event_id,
    e.event_date,
    e.event_type,
    e.title,
    e.memo,
    e.color,
    e.payload,
    e.backed_up_at
  from public.calendar_group_shared_events e
  left join public.profiles p on p.id = e.user_id
  where e.group_id = p_group_id
    and e.calendar_type = p_calendar_type
    and e.event_date between p_start_date and p_end_date
  order by e.event_date, coalesce(nullif(trim(p.nickname), ''), '회원'), e.created_at;
end;
$$;

grant execute on function public.create_calendar_group(text, text, boolean, boolean, boolean, text, text, boolean) to authenticated;
grant execute on function public.join_calendar_group(uuid, text) to authenticated;
grant execute on function public.leave_calendar_group(uuid) to authenticated;
grant execute on function public.set_calendar_group_hidden(uuid, boolean) to authenticated;
grant execute on function public.update_calendar_group(uuid, text, text, boolean, boolean, boolean, text, text, boolean) to authenticated;
grant execute on function public.get_my_calendar_groups() to authenticated;
grant execute on function public.get_visible_calendar_groups(boolean) to authenticated;
grant execute on function public.backup_my_calendar_to_group(uuid, text) to authenticated;
grant execute on function public.get_group_calendar_view(uuid, text, date, date) to authenticated;
