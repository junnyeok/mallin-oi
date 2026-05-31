-- 20260531 회원탈퇴 기능 추가
-- Supabase Edge Function(delete-account)에서 현재 로그인 사용자의 JWT로 호출합니다.
-- 실제 DB에 없는 선택 테이블은 to_regclass로 확인 후 건너뜁니다.

create or replace function public.cleanup_my_account_data()
returns table (
  success boolean,
  message text
)
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

  if to_regclass('public.calendar_group_shared_events') is not null then
    delete from public.calendar_group_shared_events where user_id = v_uid;
  end if;

  if to_regclass('public.calendar_group_user_settings') is not null then
    delete from public.calendar_group_user_settings where user_id = v_uid;
  end if;

  if to_regclass('public.calendar_group_invites') is not null then
    delete from public.calendar_group_invites
    where inviter_id = v_uid or invitee_id = v_uid;
  end if;

  if to_regclass('public.calendar_group_members') is not null then
    delete from public.calendar_group_members where user_id = v_uid;
  end if;

  if to_regclass('public.calendar_groups') is not null then
    delete from public.calendar_groups where owner_id = v_uid;
  end if;

  if to_regclass('public.user_notifications') is not null then
    delete from public.user_notifications
    where recipient_user_id = v_uid or actor_user_id = v_uid;
  end if;

  if to_regclass('public.user_push_subscriptions') is not null then
    delete from public.user_push_subscriptions where user_id = v_uid;
  end if;

  if to_regclass('public.user_notification_preferences') is not null then
    delete from public.user_notification_preferences where user_id = v_uid;
  end if;

  if to_regclass('public.event_calendar_todos') is not null then
    delete from public.event_calendar_todos where user_id = v_uid;
  end if;

  if to_regclass('public.event_calendar_categories') is not null then
    delete from public.event_calendar_categories where user_id = v_uid;
  end if;

  if to_regclass('public.work_calendar_todos') is not null then
    delete from public.work_calendar_todos where user_id = v_uid;
  end if;

  if to_regclass('public.work_calendar_categories') is not null then
    delete from public.work_calendar_categories where user_id = v_uid;
  end if;

  if to_regclass('public.study_calendar_todos') is not null then
    delete from public.study_calendar_todos where user_id = v_uid;
  end if;

  if to_regclass('public.study_calendar_categories') is not null then
    delete from public.study_calendar_categories where user_id = v_uid;
  end if;

  if to_regclass('public.user_emoticons') is not null then
    delete from public.user_emoticons where user_id = v_uid;
  end if;

  if to_regclass('public.user_store_items') is not null then
    delete from public.user_store_items where user_id = v_uid;
  end if;

  if to_regclass('public.user_character_skins') is not null then
    delete from public.user_character_skins where user_id = v_uid;
  end if;

  if to_regclass('public.user_characters') is not null then
    delete from public.user_characters where user_id = v_uid;
  end if;

  if to_regclass('public.pickle_ledger') is not null then
    delete from public.pickle_ledger where user_id = v_uid;
  end if;

  if to_regclass('public.post_reactions') is not null then
    delete from public.post_reactions where user_id = v_uid;
  end if;

  if to_regclass('public.post_comments') is not null then
    delete from public.post_comments where author_id = v_uid;
  end if;

  if to_regclass('public.posts') is not null then
    delete from public.posts where author_id = v_uid;
  end if;

  if to_regclass('public.profiles') is not null then
    delete from public.profiles where id = v_uid;
  end if;

  return query
  select true, '계정 데이터가 정리되었습니다.';
end;
$$;

revoke all on function public.cleanup_my_account_data() from public;
revoke all on function public.cleanup_my_account_data() from anon;
grant execute on function public.cleanup_my_account_data() to authenticated;
