-- 2026-06-30 피클 지급 정책 변경: 게시글/댓글/답글/반응/출석 보너스 지급량 및 제한 변경
-- Supabase SQL Editor에서 이 파일 전체를 1회 실행

create or replace function public.grant_pickle_reward(
  p_user_id uuid,
  p_amount integer,
  p_reason_code text,
  p_reason_label text default null,
  p_description text default null,
  p_source_post_id bigint default null,
  p_source_comment_id bigint default null,
  p_awarded_on date default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exists boolean := false;
  v_awarded_on date := coalesce(p_awarded_on, public.seoul_today());
  v_daily_count integer := 0;
  v_lock_key text;
begin
  if p_user_id is null then
    return false;
  end if;

  if coalesce(p_amount, 0) = 0 then
    return false;
  end if;

  if coalesce(trim(p_reason_code), '') = '' then
    return false;
  end if;

  if p_reason_code in ('attendance', 'weekly_attendance_bonus') then
    v_lock_key := concat_ws(':', p_reason_code, v_awarded_on::text);
  elsif p_reason_code = 'post_create' then
    if p_source_post_id is null then
      return false;
    end if;
    v_lock_key := concat_ws(':', p_reason_code, v_awarded_on::text);
  elsif p_reason_code in ('comment_post', 'post_reaction') then
    if p_source_post_id is null then
      return false;
    end if;
    v_lock_key := concat_ws(':', p_reason_code, p_source_post_id::text);
  else
    return false;
  end if;

  -- 같은 사용자·지급 기준의 동시 요청을 한 트랜잭션씩 처리한다.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::text),
    pg_catalog.hashtext(v_lock_key)
  );

  if p_reason_code = 'attendance' then
    select exists (
      select 1
      from public.pickle_ledger
      where user_id = p_user_id
        and reason_code = 'attendance'
        and awarded_on = v_awarded_on
    )
    into v_exists;

  elsif p_reason_code = 'weekly_attendance_bonus' then
    select exists (
      select 1
      from public.pickle_ledger
      where user_id = p_user_id
        and reason_code = 'weekly_attendance_bonus'
        and awarded_on = v_awarded_on
    )
    into v_exists;

  elsif p_reason_code = 'post_create' then
    select exists (
      select 1
      from public.pickle_ledger
      where user_id = p_user_id
        and reason_code = 'post_create'
        and source_post_id = p_source_post_id
    )
    into v_exists;

    if v_exists then
      return false;
    end if;

    select count(*)
      into v_daily_count
    from public.pickle_ledger
    where user_id = p_user_id
      and reason_code = 'post_create'
      and awarded_on = v_awarded_on;

    if v_daily_count >= 3 then
      return false;
    end if;

  elsif p_reason_code = 'comment_post' then
    select exists (
      select 1
      from public.pickle_ledger
      where user_id = p_user_id
        and reason_code = 'comment_post'
        and source_post_id = p_source_post_id
    )
    into v_exists;

  elsif p_reason_code = 'post_reaction' then
    select exists (
      select 1
      from public.pickle_ledger
      where user_id = p_user_id
        and reason_code = 'post_reaction'
        and source_post_id = p_source_post_id
    )
    into v_exists;
  end if;

  if v_exists then
    return false;
  end if;

  insert into public.pickle_ledger (
    user_id,
    amount,
    reason_code,
    reason_label,
    description,
    source_post_id,
    source_comment_id,
    awarded_on
  )
  values (
    p_user_id,
    p_amount,
    p_reason_code,
    coalesce(nullif(trim(p_reason_label), ''), '피클 획득'),
    coalesce(p_description, ''),
    p_source_post_id,
    p_source_comment_id,
    v_awarded_on
  );

  update public.profiles
  set pickles = coalesce(pickles, 0) + p_amount,
      updated_at = now()
  where id = p_user_id;

  return true;
end;
$$;

revoke all on function public.grant_pickle_reward(
  uuid, integer, text, text, text, bigint, bigint, date
) from public;
revoke all on function public.grant_pickle_reward(
  uuid, integer, text, text, text, bigint, bigint, date
) from anon;
revoke all on function public.grant_pickle_reward(
  uuid, integer, text, text, text, bigint, bigint, date
) from authenticated;

create or replace function public.claim_daily_attendance()
returns table (
  ok boolean,
  amount integer,
  message text,
  balance integer,
  weekly_bonus_awarded boolean,
  weekly_bonus_already_awarded boolean,
  weekly_bonus_amount integer,
  week_days jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_today date := public.seoul_today();
  v_week_start date;
  v_granted boolean := false;
  v_attendance_count integer := 0;
  v_weekly_bonus_awarded boolean := false;
  v_weekly_bonus_already_awarded boolean := false;
  v_week_days jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해.';
  end if;

  v_week_start := v_today - (extract(isodow from v_today)::integer - 1);

  select exists (
    select 1
    from public.pickle_ledger pl
    where pl.user_id = v_user_id
      and pl.reason_code = 'weekly_attendance_bonus'
      and pl.awarded_on = v_week_start
  )
  into v_weekly_bonus_already_awarded;

  v_granted := public.grant_pickle_reward(
    v_user_id,
    10,
    'attendance',
    '출석 체크',
    '출석체크 팝업에서 피클을 받았어.',
    null,
    null,
    v_today
  );

  select count(distinct pl.awarded_on)
    into v_attendance_count
  from public.pickle_ledger pl
  where pl.user_id = v_user_id
    and pl.reason_code = 'attendance'
    and pl.amount > 0
    and pl.awarded_on between v_week_start and (v_week_start + 6);

  if v_attendance_count >= 7 and not v_weekly_bonus_already_awarded then
    v_weekly_bonus_awarded := public.grant_pickle_reward(
      v_user_id,
      100,
      'weekly_attendance_bonus',
      '주간 출석 보너스',
      '월요일부터 일요일까지 7일 출석을 완료해서 보너스를 받았어.',
      null,
      null,
      v_week_start
    );

    select exists (
      select 1
      from public.pickle_ledger pl
      where pl.user_id = v_user_id
        and pl.reason_code = 'weekly_attendance_bonus'
        and pl.awarded_on = v_week_start
    )
    into v_weekly_bonus_already_awarded;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'key', d.key,
      'label', d.label,
      'checked', exists (
        select 1
        from public.pickle_ledger pl
        where pl.user_id = v_user_id
          and pl.reason_code = 'attendance'
          and pl.amount > 0
          and pl.awarded_on = v_week_start + (d.idx - 1)
      )
    )
    order by d.idx
  )
  into v_week_days
  from (
    values
      (1, 'mon', '월'),
      (2, 'tue', '화'),
      (3, 'wed', '수'),
      (4, 'thu', '목'),
      (5, 'fri', '금'),
      (6, 'sat', '토'),
      (7, 'sun', '일')
  ) as d(idx, key, label);

  return query
  select
    v_granted,
    case when v_granted then 10 else 0 end,
    case
      when v_granted then '오늘 출석 체크로 10피클 지급이 완료됐어.'
      else '오늘 출석 피클은 이미 받았어.'
    end,
    coalesce((select p.pickles from public.profiles p where p.id = v_user_id), 0),
    v_weekly_bonus_awarded,
    (v_weekly_bonus_already_awarded and not v_weekly_bonus_awarded),
    case when v_weekly_bonus_awarded then 100 else 0 end,
    coalesce(v_week_days, '[]'::jsonb);
end;
$$;

revoke all on function public.claim_daily_attendance() from public;
revoke all on function public.claim_daily_attendance() from anon;
grant execute on function public.claim_daily_attendance() to authenticated;

create or replace function public.handle_pickle_on_post_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.grant_pickle_reward(
    new.author_id,
    100,
    'post_create',
    '게시글 작성',
    '게시글 작성으로 피클을 받았어.',
    new.id,
    null,
    public.seoul_today()
  );

  return new;
end;
$$;

create or replace function public.handle_pickle_on_comment_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reason_label text;
  v_description text;
begin
  if new.parent_comment_id is null then
    v_reason_label := '댓글 작성';
    v_description := '댓글 작성으로 피클을 받았어.';
  else
    v_reason_label := '답글 작성';
    v_description := '답글 작성으로 피클을 받았어.';
  end if;

  perform public.grant_pickle_reward(
    new.author_id,
    30,
    'comment_post',
    v_reason_label,
    v_description,
    new.post_id,
    new.id,
    public.seoul_today()
  );

  return new;
end;
$$;

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
    v_reward_granted := public.grant_pickle_reward(
      v_user_id,
      20,
      'post_reaction',
      '게시물 반응',
      '좋아요/참신해요 반응으로 피클을 받았어.',
      p_post_id,
      null,
      public.seoul_today()
    );
    v_reward_amount := case when v_reward_granted then 20 else 0 end;

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

revoke all on function public.toggle_post_reaction(bigint, text) from public;
revoke all on function public.toggle_post_reaction(bigint, text) from anon;
grant execute on function public.toggle_post_reaction(bigint, text)
to authenticated;
