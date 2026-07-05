-- 20260704 공통 그룹 캘린더 백업/공개 상태 수정

alter table if exists public.calendar_common_group_events
  add column if not exists is_deleted boolean not null default false,
  add column if not exists published_date_key date,
  add column if not exists published_schedule_type text,
  add column if not exists published_title text,
  add column if not exists published_memo text,
  add column if not exists published_color text,
  add column if not exists published_payload jsonb,
  add column if not exists published_is_deleted boolean not null default false,
  add column if not exists published_at timestamptz;

-- 마이그레이션 중 기존 트리거가 auth.uid() null로 막지 않도록 잠시 해제한다.
drop trigger if exists trg_common_group_event_write on public.calendar_common_group_events;

-- 1차 구현으로 이미 저장된 일정은 데이터 손실 없이 공개 완료 상태로 이관한다.
-- 기존 1차 일정의 카테고리 ID를 이름/slug/색상 스냅샷으로 보강한다.
update public.calendar_common_group_events e
set payload = coalesce(e.payload,'{}'::jsonb) || jsonb_build_object(
  'categoryName',c.name,'categorySlug',c.slug,'categoryColor',c.color
)
from public.work_calendar_categories c
where e.calendar_type='work' and c.id::text=e.payload->>'categoryId'
  and not (e.payload ? 'categoryName');

update public.calendar_common_group_events e
set payload = coalesce(e.payload,'{}'::jsonb) || jsonb_build_object(
  'categoryName',c.name,'categorySlug',c.slug,'categoryColor',c.color
)
from public.study_calendar_categories c
where e.calendar_type='study' and c.id::text=e.payload->>'categoryId'
  and not (e.payload ? 'categoryName');

update public.calendar_common_group_events e
set payload = coalesce(e.payload,'{}'::jsonb) || jsonb_build_object(
  'categoryName',c.name,'categorySlug',c.slug,'categoryColor',c.color
)
from public.event_calendar_categories c
where e.calendar_type='event' and c.id::text=e.payload->>'categoryId'
  and not (e.payload ? 'categoryName');


update public.calendar_common_group_events
set published_date_key = coalesce(published_date_key, date_key),
    published_schedule_type = coalesce(published_schedule_type, schedule_type),
    published_title = coalesce(published_title, title),
    published_memo = coalesce(published_memo, memo),
    published_color = coalesce(published_color, color),
    published_payload = coalesce(published_payload, payload, '{}'::jsonb),
    published_is_deleted = false,
    published_at = coalesce(published_at, updated_at, created_at, now())
where published_at is null;

-- 마이그레이션 데이터 보강 후 쓰기 검증 트리거를 다시 연결한다.
drop trigger if exists trg_common_group_event_write on public.calendar_common_group_events;
create trigger trg_common_group_event_write before insert or update on public.calendar_common_group_events
for each row execute function public.handle_common_group_event_write();

drop policy if exists "common_group_events_select_member" on public.calendar_common_group_events;
drop policy if exists "common_group_events_select_owner" on public.calendar_common_group_events;
create policy "common_group_events_select_owner"
on public.calendar_common_group_events for select to authenticated
using (exists (
  select 1 from public.calendar_groups g
  where g.id = group_id and g.owner_id = auth.uid() and g.is_common_calendar
));

create or replace function public.get_common_group_calendar_events(
  p_group_id uuid,
  p_calendar_type text
)
returns table (
  id uuid, group_id uuid, calendar_type text, date_key date,
  schedule_type text, title text, memo text, color text, payload jsonb,
  created_by uuid, updated_by uuid, created_at timestamptz, updated_at timestamptz
)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_is_owner boolean;
begin
  if v_uid is null then raise exception '로그인이 필요합니다.'; end if;
  if not public.is_calendar_group_member(p_group_id, v_uid) then
    raise exception '그룹 참여자만 공통 캘린더를 볼 수 있습니다.';
  end if;
  select exists(select 1 from public.calendar_groups g where g.id = p_group_id and g.owner_id = v_uid)
    into v_is_owner;

  if v_is_owner then
    return query
    select e.id,e.group_id,e.calendar_type,e.date_key,e.schedule_type,e.title,e.memo,e.color,e.payload,
           e.created_by,e.updated_by,e.created_at,e.updated_at
    from public.calendar_common_group_events e
    where e.group_id=p_group_id and e.calendar_type=p_calendar_type and not e.is_deleted
    order by e.date_key,e.created_at;
  else
    return query
    select e.id,e.group_id,e.calendar_type,e.published_date_key,e.published_schedule_type,
           e.published_title,e.published_memo,e.published_color,coalesce(e.published_payload,'{}'::jsonb),
           e.created_by,e.updated_by,e.created_at,e.published_at
    from public.calendar_common_group_events e
    where e.group_id=p_group_id and e.calendar_type=p_calendar_type
      and e.published_at is not null and not e.published_is_deleted
    order by e.published_date_key,e.created_at;
  end if;
end; $$;

create or replace function public.common_group_calendar_has_changes(
  p_group_id uuid,
  p_calendar_type text
)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists(select 1 from public.calendar_groups g where g.id=p_group_id and g.owner_id=auth.uid() and g.is_common_calendar) then
    return false;
  end if;
  return exists (
    select 1 from public.calendar_common_group_events e
    where e.group_id=p_group_id and e.calendar_type=p_calendar_type and (
      e.published_at is null or e.is_deleted is distinct from e.published_is_deleted or
      e.date_key is distinct from e.published_date_key or
      e.schedule_type is distinct from e.published_schedule_type or
      e.title is distinct from e.published_title or
      e.memo is distinct from e.published_memo or
      e.color is distinct from e.published_color or
      coalesce(e.payload,'{}'::jsonb) is distinct from coalesce(e.published_payload,'{}'::jsonb)
    )
  );
end; $$;

create or replace function public.publish_common_group_calendar(
  p_group_id uuid,
  p_calendar_type text
)
returns table (event_count bigint, backed_up_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now(); v_count bigint;
begin
  if not exists(select 1 from public.calendar_groups g where g.id=p_group_id and g.owner_id=auth.uid() and g.is_common_calendar) then
    raise exception '공통 그룹 캘린더는 그룹장만 백업할 수 있습니다.';
  end if;
  update public.calendar_common_group_events e
  set published_date_key=e.date_key,
      published_schedule_type=e.schedule_type,
      published_title=e.title,
      published_memo=e.memo,
      published_color=e.color,
      published_payload=coalesce(e.payload,'{}'::jsonb),
      published_is_deleted=e.is_deleted,
      published_at=v_now
  where e.group_id=p_group_id and e.calendar_type=p_calendar_type;
  select count(*) into v_count from public.calendar_common_group_events e
  where e.group_id=p_group_id and e.calendar_type=p_calendar_type and not e.published_is_deleted;
  return query select v_count,v_now;
end; $$;

revoke all on function public.get_common_group_calendar_events(uuid,text) from public, anon;
revoke all on function public.common_group_calendar_has_changes(uuid,text) from public, anon;
revoke all on function public.publish_common_group_calendar(uuid,text) from public, anon;
grant execute on function public.get_common_group_calendar_events(uuid,text) to authenticated;
grant execute on function public.common_group_calendar_has_changes(uuid,text) to authenticated;
grant execute on function public.publish_common_group_calendar(uuid,text) to authenticated;
