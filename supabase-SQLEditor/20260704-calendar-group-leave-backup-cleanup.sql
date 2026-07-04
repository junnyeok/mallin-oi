-- 2026-07-04 그룹 탈퇴 시 그룹 캘린더 개인 백업 일정 자동 삭제
-- Supabase SQL Editor에서 이 파일 전체를 한 번 실행합니다.

create or replace function public.leave_calendar_group(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_member_count bigint := 0;
begin
  if v_uid is null then
    raise exception '로그인이 필요합니다.';
  end if;

  if exists (
    select 1
    from public.calendar_groups g
    join public.calendar_group_members m on m.group_id = g.id
    where g.id = p_group_id
      and m.user_id = v_uid
      and m.status = 'active'
      and (g.owner_id = v_uid or m.role = 'owner')
  ) then
    select count(*)
      into v_member_count
    from public.calendar_group_members
    where group_id = p_group_id
      and status = 'active';

    if v_member_count > 1 then
      raise exception '먼저 그룹장을 넘긴 뒤 나갈 수 있습니다.';
    end if;

    raise exception '그룹장은 바로 나갈 수 없습니다. 그룹을 삭제해 주세요.';
  end if;

  -- group_id + auth.uid()로 한정하여 다른 사용자/다른 그룹의 백업은 보존한다.
  delete from public.calendar_group_shared_events e
  where e.group_id = p_group_id
    and e.user_id = v_uid;

  update public.calendar_group_members
  set status = 'left',
      updated_at = now()
  where group_id = p_group_id
    and user_id = v_uid;
end;
$$;

revoke all on function public.leave_calendar_group(uuid) from public;
revoke all on function public.leave_calendar_group(uuid) from anon;
grant execute on function public.leave_calendar_group(uuid) to authenticated;
