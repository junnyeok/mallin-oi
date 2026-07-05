-- 20260704 공통 그룹 캘린더 기능 추가

alter table if exists public.calendar_groups
  add column if not exists is_common_calendar boolean not null default false;

create table if not exists public.calendar_common_group_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.calendar_groups(id) on delete cascade,
  calendar_type text not null check (calendar_type in ('study', 'work', 'event')),
  date_key date not null,
  schedule_type text not null default 'etc',
  title text not null check (char_length(trim(title)) between 1 and 100),
  memo text not null default '',
  color text,
  payload jsonb not null default '{}'::jsonb,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists calendar_common_group_events_view_idx
  on public.calendar_common_group_events (group_id, calendar_type, date_key, created_at);

create or replace function public.handle_common_group_event_write()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception '로그인이 필요합니다.'; end if;
  if not exists (select 1 from public.calendar_groups g where g.id = new.group_id and g.owner_id = auth.uid() and g.is_common_calendar) then
    raise exception '공통 그룹 캘린더는 그룹장만 수정할 수 있습니다.';
  end if;
  if tg_op = 'INSERT' then new.created_by := auth.uid(); end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_common_group_event_write on public.calendar_common_group_events;
create trigger trg_common_group_event_write before insert or update on public.calendar_common_group_events
for each row execute function public.handle_common_group_event_write();

alter table public.calendar_common_group_events enable row level security;
drop policy if exists "common_group_events_select_member" on public.calendar_common_group_events;
create policy "common_group_events_select_member" on public.calendar_common_group_events
for select to authenticated using (public.is_calendar_group_member(group_id, auth.uid()));
drop policy if exists "common_group_events_insert_owner" on public.calendar_common_group_events;
create policy "common_group_events_insert_owner" on public.calendar_common_group_events
for insert to authenticated with check (exists (select 1 from public.calendar_groups g where g.id = group_id and g.owner_id = auth.uid() and g.is_common_calendar));
drop policy if exists "common_group_events_update_owner" on public.calendar_common_group_events;
create policy "common_group_events_update_owner" on public.calendar_common_group_events
for update to authenticated using (exists (select 1 from public.calendar_groups g where g.id = group_id and g.owner_id = auth.uid() and g.is_common_calendar))
with check (exists (select 1 from public.calendar_groups g where g.id = group_id and g.owner_id = auth.uid() and g.is_common_calendar));
drop policy if exists "common_group_events_delete_owner" on public.calendar_common_group_events;
create policy "common_group_events_delete_owner" on public.calendar_common_group_events
for delete to authenticated using (exists (select 1 from public.calendar_groups g where g.id = group_id and g.owner_id = auth.uid() and g.is_common_calendar));

grant select, insert, update, delete on public.calendar_common_group_events to authenticated;

drop function if exists public.create_calendar_group(text, text, text, boolean, boolean, boolean, text, text, boolean);
create or replace function public.create_calendar_group(
  p_name text, p_description text default '', p_color text default '#f54260',
  p_allow_study boolean default true, p_allow_work boolean default true, p_allow_event boolean default false,
  p_visibility text default 'public', p_password text default null, p_is_hidden boolean default false,
  p_is_common_calendar boolean default false
) returns uuid language plpgsql security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); v_group_id uuid; v_visibility text := case when p_visibility = 'private' then 'private' else 'public' end;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if not (coalesce(p_allow_study,false) or coalesce(p_allow_work,false) or coalesce(p_allow_event,false)) then raise exception '연동할 캘린더를 하나 이상 선택해야 합니다.'; end if;
  insert into public.calendar_groups(owner_id,name,description,color,visibility,password_hash,is_hidden,allow_study,allow_work,allow_event,is_common_calendar)
  values(v_uid,trim(p_name),nullif(left(trim(coalesce(p_description,'')),100),''),case when coalesce(p_color,'') ~ '^#[0-9A-Fa-f]{6}$' then lower(p_color) else '#f54260' end,
    v_visibility,case when v_visibility='private' and nullif(p_password,'') is not null then crypt(p_password,gen_salt('bf')) else null end,
    coalesce(p_is_hidden,false),coalesce(p_allow_study,false),coalesce(p_allow_work,false),coalesce(p_allow_event,false),coalesce(p_is_common_calendar,false)) returning id into v_group_id;
  insert into public.calendar_group_members(group_id,user_id,role,status) values(v_group_id,v_uid,'owner','active'); return v_group_id;
end; $$;

drop function if exists public.update_calendar_group(uuid, text, text, text, boolean, boolean, boolean, text, text, boolean);
create or replace function public.update_calendar_group(
  p_group_id uuid, p_name text, p_description text, p_color text,
  p_allow_study boolean, p_allow_work boolean, p_allow_event boolean,
  p_visibility text, p_password text default null, p_is_hidden boolean default false,
  p_is_common_calendar boolean default false
) returns void language plpgsql security definer set search_path = public, extensions as $$
declare v_visibility text := case when p_visibility='private' then 'private' else 'public' end;
begin
  if not public.is_calendar_group_manager(p_group_id, auth.uid()) then raise exception '그룹 관리자만 수정할 수 있습니다.'; end if;
  if not (coalesce(p_allow_study,false) or coalesce(p_allow_work,false) or coalesce(p_allow_event,false)) then raise exception '연동할 캘린더를 하나 이상 선택해야 합니다.'; end if;
  update public.calendar_groups set name=trim(p_name),description=nullif(left(trim(coalesce(p_description,'')),100),''),
    color=case when coalesce(p_color,'') ~ '^#[0-9A-Fa-f]{6}$' then lower(p_color) else color end,
    allow_study=coalesce(p_allow_study,false),allow_work=coalesce(p_allow_work,false),allow_event=coalesce(p_allow_event,false),visibility=v_visibility,
    password_hash=case when v_visibility='private' and nullif(p_password,'') is not null then crypt(p_password,gen_salt('bf')) when v_visibility='public' then null else password_hash end,
    is_hidden=coalesce(p_is_hidden,false),is_common_calendar=coalesce(p_is_common_calendar,false),updated_at=now() where id=p_group_id;
end; $$;

drop function if exists public.get_my_calendar_groups();
create or replace function public.get_my_calendar_groups()
returns table(id uuid,name text,description text,color text,visibility text,is_hidden boolean,allow_study boolean,allow_work boolean,allow_event boolean,is_common_calendar boolean,role text,member_count bigint,can_manage boolean,joined_at timestamptz)
language sql security definer set search_path=public as $$
select g.id,g.name,g.description,g.color,g.visibility,g.is_hidden,g.allow_study,g.allow_work,g.allow_event,g.is_common_calendar,m.role,
 (select count(*) from public.calendar_group_members cm where cm.group_id=g.id and cm.status='active'),m.role in ('owner','admin'),m.joined_at
from public.calendar_group_members m join public.calendar_groups g on g.id=m.group_id where m.user_id=auth.uid() and m.status='active' order by m.joined_at desc; $$;

drop function if exists public.get_visible_calendar_groups(boolean);
create or replace function public.get_visible_calendar_groups(p_include_hidden boolean default false)
returns table(id uuid,name text,description text,color text,visibility text,is_hidden boolean,allow_study boolean,allow_work boolean,allow_event boolean,is_common_calendar boolean,role text,member_count bigint,can_manage boolean,joined_at timestamptz)
language sql security definer set search_path=public as $$
select g.id,g.name,g.description,g.color,g.visibility,g.is_hidden,g.allow_study,g.allow_work,g.allow_event,g.is_common_calendar,coalesce(m.role,''),
 (select count(*) from public.calendar_group_members cm where cm.group_id=g.id and cm.status='active'),coalesce(m.role in ('owner','admin'),false),m.joined_at
from public.calendar_groups g left join public.calendar_group_members m on m.group_id=g.id and m.user_id=auth.uid() and m.status='active'
where g.visibility in ('public','private') and (p_include_hidden or not g.is_hidden) order by g.created_at desc; $$;

grant execute on function public.create_calendar_group(text,text,text,boolean,boolean,boolean,text,text,boolean,boolean) to authenticated;
grant execute on function public.update_calendar_group(uuid,text,text,text,boolean,boolean,boolean,text,text,boolean,boolean) to authenticated;
grant execute on function public.get_my_calendar_groups() to authenticated;
grant execute on function public.get_visible_calendar_groups(boolean) to authenticated;
