-- =========================================================
-- 말린오이닷컴 Web Push 알림 확장
-- 실행 위치: supabase-SQLEditor/99_all_backup.sql 누적본
-- 주의: store-item_purchase-functions.sql에는 넣지 말 것
-- =========================================================

-- ---------------------------------------------------------
-- 1) updated_at 자동 갱신 함수
--    이미 handle_updated_at()이 있으면 그대로 재사용 가능하지만,
--    안전하게 공통 함수 하나 더 둔다.
-- ---------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- ---------------------------------------------------------
-- 2) 기존 user_notifications 확장
--    새 상품 알림은 post_id/comment_id가 없을 수 있으므로 nullable 처리
-- ---------------------------------------------------------
alter table public.user_notifications
alter column post_id drop not null;

alter table public.user_notifications
alter column comment_id drop not null;

alter table public.user_notifications
add column if not exists action_url text;

alter table public.user_notifications
add column if not exists item_id text;

alter table public.user_notifications
add column if not exists metadata jsonb not null default '{}'::jsonb;


-- 기존 notification_type check 제약 제거 후 재생성
do $$
declare
  v_constraint_name text;
begin
  select conname
    into v_constraint_name
  from pg_constraint
  where conrelid = 'public.user_notifications'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%notification_type%'
  limit 1;

  if v_constraint_name is not null then
    execute format(
      'alter table public.user_notifications drop constraint if exists %I',
      v_constraint_name
    );
  end if;
end $$;

alter table public.user_notifications
add constraint user_notifications_notification_type_check
check (
  notification_type in (
    'post_comment',
    'post_participant_comment',
    'post_reaction_like',
    'post_reaction_dislike',
    'store_new_item',
    'admin_announcement'
  )
);

create index if not exists user_notifications_action_url_idx
  on public.user_notifications(action_url);

create index if not exists user_notifications_type_created_idx
  on public.user_notifications(notification_type, created_at desc);


-- ---------------------------------------------------------
-- 3) 사용자 푸시 구독 테이블
-- ---------------------------------------------------------
create table if not exists public.user_push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  device_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create unique index if not exists user_push_subscriptions_endpoint_uidx
  on public.user_push_subscriptions(endpoint);

create index if not exists user_push_subscriptions_user_active_idx
  on public.user_push_subscriptions(user_id, is_active);

drop trigger if exists trg_user_push_subscriptions_updated_at
on public.user_push_subscriptions;

create trigger trg_user_push_subscriptions_updated_at
before update on public.user_push_subscriptions
for each row
execute function public.set_updated_at();

alter table public.user_push_subscriptions enable row level security;

drop policy if exists "푸시 구독은 본인만 조회 가능" on public.user_push_subscriptions;
create policy "푸시 구독은 본인만 조회 가능"
on public.user_push_subscriptions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "푸시 구독은 본인만 추가 가능" on public.user_push_subscriptions;
create policy "푸시 구독은 본인만 추가 가능"
on public.user_push_subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "푸시 구독은 본인만 수정 가능" on public.user_push_subscriptions;
create policy "푸시 구독은 본인만 수정 가능"
on public.user_push_subscriptions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "푸시 구독은 본인만 삭제 가능" on public.user_push_subscriptions;
create policy "푸시 구독은 본인만 삭제 가능"
on public.user_push_subscriptions
for delete
to authenticated
using (auth.uid() = user_id);


-- ---------------------------------------------------------
-- 4) 사용자 알림 설정 테이블
-- ---------------------------------------------------------
create table if not exists public.user_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push_enabled boolean not null default false,
  notify_comments boolean not null default true,
  notify_replies boolean not null default true,
  notify_reactions boolean not null default true,
  notify_store_items boolean not null default true,
  notify_admin_announcements boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_user_notification_preferences_updated_at
on public.user_notification_preferences;

create trigger trg_user_notification_preferences_updated_at
before update on public.user_notification_preferences
for each row
execute function public.set_updated_at();

alter table public.user_notification_preferences enable row level security;

drop policy if exists "알림 설정은 본인만 조회 가능" on public.user_notification_preferences;
create policy "알림 설정은 본인만 조회 가능"
on public.user_notification_preferences
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "알림 설정은 본인만 추가 가능" on public.user_notification_preferences;
create policy "알림 설정은 본인만 추가 가능"
on public.user_notification_preferences
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "알림 설정은 본인만 수정 가능" on public.user_notification_preferences;
create policy "알림 설정은 본인만 수정 가능"
on public.user_notification_preferences
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);


-- ---------------------------------------------------------
-- 5) 푸시 구독 저장 RPC
--    같은 endpoint는 중복 저장하지 않고 최신 로그인 사용자에게 연결
-- ---------------------------------------------------------
create or replace function public.register_my_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null,
  p_device_label text default null
)
returns public.user_push_subscriptions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.user_push_subscriptions;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if coalesce(trim(p_endpoint), '') = ''
    or coalesce(trim(p_p256dh), '') = ''
    or coalesce(trim(p_auth), '') = '' then
    raise exception 'INVALID_PUSH_SUBSCRIPTION';
  end if;

  insert into public.user_push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    device_label,
    is_active,
    last_used_at
  )
  values (
    v_user_id,
    p_endpoint,
    p_p256dh,
    p_auth,
    nullif(trim(coalesce(p_user_agent, '')), ''),
    nullif(trim(coalesce(p_device_label, '')), ''),
    true,
    now()
  )
  on conflict (endpoint)
  do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    device_label = excluded.device_label,
    is_active = true,
    last_used_at = now(),
    updated_at = now()
  returning * into v_row;

  insert into public.user_notification_preferences (
    user_id,
    push_enabled
  )
  values (
    v_user_id,
    true
  )
  on conflict (user_id)
  do update set
    push_enabled = true,
    updated_at = now();

  return v_row;
end;
$$;

grant execute on function public.register_my_push_subscription(text, text, text, text, text)
to authenticated;


-- ---------------------------------------------------------
-- 6) 현재 기기 푸시 구독 비활성화 RPC
-- ---------------------------------------------------------
create or replace function public.disable_my_push_subscription(
  p_endpoint text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if coalesce(trim(p_endpoint), '') <> '' then
    update public.user_push_subscriptions
    set is_active = false,
        updated_at = now()
    where user_id = v_user_id
      and endpoint = p_endpoint;
  else
    update public.user_push_subscriptions
    set is_active = false,
        updated_at = now()
    where user_id = v_user_id;
  end if;

  update public.user_notification_preferences
  set push_enabled = false,
      updated_at = now()
  where user_id = v_user_id;
end;
$$;

grant execute on function public.disable_my_push_subscription(text)
to authenticated;


-- ---------------------------------------------------------
-- 7) 알림 읽음 처리 RPC
--    Service Worker notificationclick에서 사용 가능
-- ---------------------------------------------------------
create or replace function public.mark_my_notification_read(
  p_notification_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  update public.user_notifications
  set is_read = true,
      read_at = now()
  where id = p_notification_id
    and recipient_user_id = auth.uid()
    and is_read = false;
end;
$$;

grant execute on function public.mark_my_notification_read(bigint)
to authenticated;


-- ---------------------------------------------------------
-- 8) 댓글/답글 알림 함수 교체
--    기존 내부 알림 유지 + action_url/metadata 추가
-- ---------------------------------------------------------
create or replace function public.handle_comment_notification_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_post_author_id uuid;
  v_post_title text;
  v_event_label text;
begin
  select p.author_id, p.title
    into v_post_author_id, v_post_title
  from public.posts p
  where p.id = new.post_id;

  if not found then
    return new;
  end if;

  v_event_label :=
    case
      when new.parent_comment_id is null then '댓글'
      else '답글'
    end;

  insert into public.user_notifications (
    recipient_user_id,
    actor_user_id,
    actor_nickname,
    post_id,
    comment_id,
    notification_type,
    title,
    message,
    action_url,
    metadata
  )
  with raw_recipients as (
    select
      v_post_author_id as recipient_user_id,
      'post_author'::text as recipient_kind

    union all

    select
      c.author_id as recipient_user_id,
      'participant'::text as recipient_kind
    from public.post_comments c
    where c.post_id = new.post_id
      and c.id <> new.id
      and c.author_id is not null
  ),
  grouped_recipients as (
    select
      recipient_user_id,
      bool_or(recipient_kind = 'post_author') as is_post_author
    from raw_recipients
    where recipient_user_id is not null
      and recipient_user_id <> new.author_id
    group by recipient_user_id
  )
  select
    g.recipient_user_id,
    new.author_id,
    coalesce(new.author_nickname, '익명'),
    new.post_id,
    new.id,
    case
      when g.is_post_author then 'post_comment'
      else 'post_participant_comment'
    end,
    case
      when g.is_post_author
        then format('%s님이 네 게시물에 %s을 남겼어.', coalesce(new.author_nickname, '익명'), v_event_label)
      else format('%s님이 네가 참여한 게시물에 %s을 남겼어.', coalesce(new.author_nickname, '익명'), v_event_label)
    end,
    left(
      regexp_replace(coalesce(new.body, ''), '\s+', ' ', 'g'),
      120
    ),
    format('/post.html?id=%s&comment=%s', new.post_id, new.id),
    jsonb_build_object(
      'postTitle', coalesce(v_post_title, ''),
      'eventLabel', v_event_label,
      'parentCommentId', new.parent_comment_id
    )
  from grouped_recipients g;

  return new;
end;
$$;

drop trigger if exists trg_post_comments_insert_notification on public.post_comments;

create trigger trg_post_comments_insert_notification
after insert on public.post_comments
for each row
execute function public.handle_comment_notification_insert();


-- ---------------------------------------------------------
-- 9) 좋아요/참신해요 알림 포함 toggle_post_reaction RPC 교체
--    기존 피클 지급 로직이 있는 버전이면 아래 반환 컬럼을 맞춰야 함.
--    현재 첨부 파일 기준 프론트는 reward_granted/reward_amount도 읽고 있으므로 포함한다.
-- ---------------------------------------------------------
create or replace function public.toggle_post_reaction(
  p_post_id bigint,
  p_reaction_type text
)
returns table (
  likes_count bigint,
  dislikes_count bigint,
  my_reaction text,
  reward_granted boolean,
  reward_amount integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_existing_reaction text;
  v_safe_reaction text;
  v_post_author_id uuid;
  v_actor_nickname text;
  v_created_new_reaction boolean := false;
  v_reward_granted boolean := false;
  v_reward_amount integer := 0;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  v_safe_reaction := lower(trim(coalesce(p_reaction_type, '')));

  if v_safe_reaction not in ('like', 'dislike') then
    raise exception 'INVALID_REACTION_TYPE';
  end if;

  select p.author_id
    into v_post_author_id
  from public.posts p
  where p.id = p_post_id;

  if v_post_author_id is null then
    raise exception 'POST_NOT_FOUND';
  end if;

  select reaction_type
    into v_existing_reaction
  from public.post_reactions
  where post_id = p_post_id
    and user_id = v_user_id
  limit 1;

  if v_existing_reaction is null then
    insert into public.post_reactions (
      post_id,
      user_id,
      reaction_type
    )
    values (
      p_post_id,
      v_user_id,
      v_safe_reaction
    );

    v_created_new_reaction := true;

    -- 기존 프로젝트에 피클 지급 로직이 있다면 이 아래 블록은
    -- 기존 3피클 지급 로직과 맞춰 유지/병합해야 함.
    -- 첨부 파일 기준 프론트가 reward_granted/reward_amount를 기대하므로
    -- 반환값만 안정적으로 유지한다.
    v_reward_granted := false;
    v_reward_amount := 0;

  elsif v_existing_reaction = v_safe_reaction then
    delete from public.post_reactions
    where post_id = p_post_id
      and user_id = v_user_id;

  else
    update public.post_reactions
    set reaction_type = v_safe_reaction,
        updated_at = now()
    where post_id = p_post_id
      and user_id = v_user_id;
  end if;

  -- 새로 누른 경우에만 알림 생성.
  -- 취소/변경은 중복 방지를 위해 알림 생성하지 않음.
  if v_created_new_reaction
    and v_post_author_id is not null
    and v_post_author_id <> v_user_id then

    select coalesce(nullif(trim(p.nickname), ''), '익명')
      into v_actor_nickname
    from public.profiles p
    where p.id = v_user_id;

    insert into public.user_notifications (
      recipient_user_id,
      actor_user_id,
      actor_nickname,
      post_id,
      comment_id,
      notification_type,
      title,
      message,
      action_url,
      metadata
    )
    select
      v_post_author_id,
      v_user_id,
      coalesce(v_actor_nickname, '익명'),
      p_post_id,
      null,
      case
        when v_safe_reaction = 'like' then 'post_reaction_like'
        else 'post_reaction_dislike'
      end,
      case
        when v_safe_reaction = 'like'
          then format('%s님이 네 게시글을 좋아해.', coalesce(v_actor_nickname, '익명'))
        else format('%s님이 네 게시글을 참신해해.', coalesce(v_actor_nickname, '익명'))
      end,
      case
        when v_safe_reaction = 'like'
          then '좋아요가 눌렸어.'
        else '참신해요가 눌렸어.'
      end,
      format('/post.html?id=%s', p_post_id),
      jsonb_build_object('reactionType', v_safe_reaction)
    where not exists (
      select 1
      from public.user_notifications n
      where n.recipient_user_id = v_post_author_id
        and n.actor_user_id = v_user_id
        and n.post_id = p_post_id
        and n.notification_type = case
          when v_safe_reaction = 'like' then 'post_reaction_like'
          else 'post_reaction_dislike'
        end
        and n.created_at > now() - interval '12 hours'
    );
  end if;

  return query
  select
    coalesce(count(*) filter (where pr.reaction_type = 'like'), 0)::bigint as likes_count,
    coalesce(count(*) filter (where pr.reaction_type = 'dislike'), 0)::bigint as dislikes_count,
    (
      select pr2.reaction_type
      from public.post_reactions pr2
      where pr2.post_id = p_post_id
        and pr2.user_id = v_user_id
      limit 1
    ) as my_reaction,
    v_reward_granted as reward_granted,
    v_reward_amount as reward_amount
  from public.post_reactions pr
  where pr.post_id = p_post_id;
end;
$$;

grant execute on function public.toggle_post_reaction(bigint, text)
to authenticated;


-- ---------------------------------------------------------
-- 10) 새 상품 알림 관리자 RPC
-- ---------------------------------------------------------
create or replace function public.create_store_new_item_notification(
  p_item_id text,
  p_item_title text,
  p_message text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_id uuid;
  v_message text;
  v_inserted_count integer := 0;
begin
  v_admin_id := auth.uid();

  if v_admin_id is null then
    raise exception 'LOGIN_REQUIRED';
  end if;

  if not public.is_admin_user(v_admin_id) then
    raise exception 'ADMIN_ONLY';
  end if;

  if coalesce(trim(p_item_id), '') = '' then
    raise exception 'ITEM_ID_REQUIRED';
  end if;

  if coalesce(trim(p_item_title), '') = '' then
    raise exception 'ITEM_TITLE_REQUIRED';
  end if;

  v_message := coalesce(
    nullif(trim(p_message), ''),
    format('%s 상품이 새로 추가됐어.', trim(p_item_title))
  );

  insert into public.user_notifications (
    recipient_user_id,
    actor_user_id,
    actor_nickname,
    post_id,
    comment_id,
    notification_type,
    title,
    message,
    action_url,
    item_id,
    metadata
  )
  select
    p.id,
    v_admin_id,
    '말오닷사장',
    null,
    null,
    'store_new_item',
    '새 상품이 추가됐어.',
    v_message,
    format('/store-item.html?id=%s', trim(p_item_id)),
    trim(p_item_id),
    jsonb_build_object(
      'itemId', trim(p_item_id),
      'itemTitle', trim(p_item_title)
    )
  from public.profiles p
  where p.id <> v_admin_id
    and not exists (
      select 1
      from public.user_notifications n
      where n.recipient_user_id = p.id
        and n.notification_type = 'store_new_item'
        and n.item_id = trim(p_item_id)
    );

  get diagnostics v_inserted_count = row_count;

  return v_inserted_count;
end;
$$;

grant execute on function public.create_store_new_item_notification(text, text, text)
to authenticated;


-- ---------------------------------------------------------
-- 11) Realtime publication에 신규 테이블 추가
-- ---------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.user_notification_preferences;
  exception
    when duplicate_object then null;
  end;

  begin
    alter publication supabase_realtime add table public.user_push_subscriptions;
  exception
    when duplicate_object then null;
  end;
end $$;

--5/19