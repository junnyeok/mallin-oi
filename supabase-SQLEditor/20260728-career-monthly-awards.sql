-- =========================================================
-- 2026-07-28 매달 베스트 이력 1·2·3위 피클 자동 시상
-- - 이력 페이지와 서버 시상이 같은 월별 순위 함수를 사용한다.
-- - 매월 말일 12:00 Asia/Seoul부터 5분 간격으로 안전하게 재시도한다.
-- - 시상 연월+순위 및 피클 원장 연월+순위로 중복 지급을 차단한다.
-- - 피클은 스케줄 실행 시 지급하고 팝업 수령은 확인 완료만 기록한다.
-- =========================================================

begin;

do $preflight_career_monthly_awards$
begin
  if to_regclass('public.posts') is null
     or to_regclass('public.post_reactions') is null
     or to_regclass('public.post_comments') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'CAREER_MONTHLY_AWARD_REQUIRED_SCHEMA_MISSING';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_available_extensions
    where name = 'pg_cron'
  ) then
    raise exception 'PG_CRON_EXTENSION_NOT_AVAILABLE';
  end if;
end;
$preflight_career_monthly_awards$;

create extension if not exists pg_cron with schema pg_catalog;

alter table public.pickle_ledger
  add column if not exists award_month date,
  add column if not exists award_rank smallint;

alter table public.pickle_ledger
  drop constraint if exists pickle_ledger_reason_code_check;

alter table public.pickle_ledger
  add constraint pickle_ledger_reason_code_check
  check (
    reason_code in (
      'attendance',
      'post_create',
      'comment_post',
      'store_purchase',
      'post_reaction',
      'admin_auto_charge',
      'event_grant',
      'weekly_attendance_bonus',
      'career_monthly_award'
    )
  );

alter table public.pickle_ledger
  drop constraint if exists pickle_ledger_career_award_metadata_check;

alter table public.pickle_ledger
  add constraint pickle_ledger_career_award_metadata_check
  check (
    (
      reason_code = 'career_monthly_award'
      and award_month is not null
      and extract(day from award_month) = 1
      and award_rank between 1 and 3
    )
    or (
      reason_code <> 'career_monthly_award'
      and award_month is null
      and award_rank is null
    )
  );

create unique index if not exists pickle_ledger_career_monthly_award_uidx
  on public.pickle_ledger(award_month, award_rank)
  where reason_code = 'career_monthly_award';

create table if not exists public.career_monthly_award_runs (
  award_month date primary key,
  award_count smallint not null check (award_count between 0 and 3),
  completed_at timestamptz not null default clock_timestamp(),
  constraint career_monthly_award_runs_month_start_check
    check (extract(day from award_month) = 1)
);

create table if not exists public.career_monthly_awards (
  award_month date not null,
  rank_no smallint not null check (rank_no between 1 and 3),
  post_id bigint not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  author_nickname text not null,
  post_title text not null,
  score bigint not null check (score >= 0),
  views integer not null check (views >= 0),
  likes_count bigint not null check (likes_count >= 0),
  fresh_count bigint not null check (fresh_count >= 0),
  comment_count bigint not null check (comment_count >= 0),
  reward_amount integer not null,
  awarded_at timestamptz not null default clock_timestamp(),
  acknowledged_at timestamptz,
  primary key (award_month, rank_no),
  constraint career_monthly_awards_month_start_check
    check (extract(day from award_month) = 1),
  constraint career_monthly_awards_reward_check
    check (
      (rank_no = 1 and reward_amount = 1000)
      or (rank_no = 2 and reward_amount = 500)
      or (rank_no = 3 and reward_amount = 250)
    )
);

create index if not exists career_monthly_awards_pending_user_idx
  on public.career_monthly_awards(user_id, award_month, rank_no)
  where acknowledged_at is null;

alter table public.career_monthly_award_runs enable row level security;
alter table public.career_monthly_awards enable row level security;

revoke all on table public.career_monthly_award_runs
  from public, anon, authenticated, service_role;
revoke all on table public.career_monthly_awards
  from public, anon, authenticated, service_role;

create or replace function public.get_career_monthly_best(
  p_award_month date default null,
  p_limit integer default 5
)
returns table (
  rank_no integer,
  post_id bigint,
  author_id uuid,
  author_nickname text,
  post_title text,
  created_at timestamptz,
  media_items jsonb,
  views integer,
  likes_count bigint,
  fresh_count bigint,
  comment_count bigint,
  score bigint
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with month_bounds as (
    select
      date_trunc(
        'month',
        coalesce(p_award_month, timezone('Asia/Seoul', now())::date)
      )::date as award_month
  ),
  reaction_counts as (
    select
      reaction.post_id,
      count(*) filter (where reaction.reaction_type = 'like')::bigint
        as likes_count,
      count(*) filter (where reaction.reaction_type = 'dislike')::bigint
        as fresh_count
    from public.post_reactions reaction
    group by reaction.post_id
  ),
  comment_counts as (
    select
      comment.post_id,
      count(*)::bigint as comment_count
    from public.post_comments comment
    group by comment.post_id
  ),
  scored as (
    select
      post.id as post_id,
      post.author_id,
      post.author_nickname,
      post.title as post_title,
      post.created_at,
      post.media_items,
      greatest(coalesce(post.views, 0), 0)::integer as views,
      coalesce(reaction.likes_count, 0)::bigint as likes_count,
      coalesce(reaction.fresh_count, 0)::bigint as fresh_count,
      coalesce(comment.comment_count, 0)::bigint as comment_count
    from public.posts post
    join public.profiles profile
      on profile.id = post.author_id
    cross join month_bounds bounds
    left join reaction_counts reaction
      on reaction.post_id = post.id
    left join comment_counts comment
      on comment.post_id = post.id
    where post.category = 'career'
      and not coalesce(post.is_private, false)
      and post.created_at >= (
        bounds.award_month::timestamp at time zone 'Asia/Seoul'
      )
      and post.created_at < (
        (bounds.award_month + interval '1 month')::timestamp
          at time zone 'Asia/Seoul'
      )
  ),
  ranked as (
    select
      scored.*,
      (
        scored.views
        + scored.likes_count
        + scored.fresh_count
        + scored.comment_count
      )::bigint as score
    from scored
  )
  select
    (
      row_number() over (
        order by
          ranked.score desc,
          ranked.views desc,
          ranked.likes_count desc,
          ranked.fresh_count desc,
          ranked.comment_count desc,
          ranked.created_at desc,
          ranked.post_id desc
      )
    )::integer as rank_no,
    ranked.post_id,
    ranked.author_id,
    ranked.author_nickname,
    ranked.post_title,
    ranked.created_at,
    ranked.media_items,
    ranked.views,
    ranked.likes_count,
    ranked.fresh_count,
    ranked.comment_count,
    ranked.score
  from ranked
  order by
    ranked.score desc,
    ranked.views desc,
    ranked.likes_count desc,
    ranked.fresh_count desc,
    ranked.comment_count desc,
    ranked.created_at desc,
    ranked.post_id desc
  limit greatest(0, least(coalesce(p_limit, 5), 100));
$$;

revoke all on function public.get_career_monthly_best(date, integer)
  from public;
grant execute on function public.get_career_monthly_best(date, integer)
  to anon, authenticated;

create or replace function public.execute_career_monthly_awards(
  p_award_month date
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_award_month date := date_trunc('month', p_award_month)::date;
  v_awarded_on date;
  v_existing_count integer;
  v_award_count integer := 0;
  v_reward_amount integer;
  v_winner record;
begin
  if p_award_month is null then
    raise exception '시상 연월이 필요해.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'career-monthly-awards:' || v_award_month::text,
      0
    )
  );

  select run.award_count
    into v_existing_count
  from public.career_monthly_award_runs run
  where run.award_month = v_award_month;

  if found then
    return v_existing_count;
  end if;

  if exists (
    select 1
    from public.career_monthly_awards award
    where award.award_month = v_award_month
  ) or exists (
    select 1
    from public.pickle_ledger ledger
    where ledger.reason_code = 'career_monthly_award'
      and ledger.award_month = v_award_month
  ) then
    raise exception 'CAREER_MONTHLY_AWARD_PARTIAL_STATE month=%',
      v_award_month;
  end if;

  v_awarded_on := (
    v_award_month + interval '1 month - 1 day'
  )::date;

  for v_winner in
    select *
    from public.get_career_monthly_best(v_award_month, 3)
    order by rank_no
  loop
    v_reward_amount := case v_winner.rank_no
      when 1 then 1000
      when 2 then 500
      when 3 then 250
    end;

    insert into public.career_monthly_awards (
      award_month,
      rank_no,
      post_id,
      user_id,
      author_nickname,
      post_title,
      score,
      views,
      likes_count,
      fresh_count,
      comment_count,
      reward_amount
    )
    values (
      v_award_month,
      v_winner.rank_no,
      v_winner.post_id,
      v_winner.author_id,
      v_winner.author_nickname,
      v_winner.post_title,
      v_winner.score,
      v_winner.views,
      v_winner.likes_count,
      v_winner.fresh_count,
      v_winner.comment_count,
      v_reward_amount
    );

    update public.profiles profile
    set
      pickles = coalesce(profile.pickles, 0) + v_reward_amount,
      updated_at = clock_timestamp()
    where profile.id = v_winner.author_id;

    if not found then
      raise exception 'CAREER_MONTHLY_AWARD_PROFILE_MISSING user=%',
        v_winner.author_id;
    end if;

    insert into public.pickle_ledger (
      user_id,
      amount,
      reason_code,
      reason_label,
      description,
      source_post_id,
      source_comment_id,
      awarded_on,
      award_month,
      award_rank
    )
    values (
      v_winner.author_id,
      v_reward_amount,
      'career_monthly_award',
      '매달 베스트 이력 시상',
      format(
        '%s년 %s월 매달 베스트 이력 %s위 시상',
        extract(year from v_award_month)::integer,
        extract(month from v_award_month)::integer,
        v_winner.rank_no
      ),
      v_winner.post_id,
      null,
      v_awarded_on,
      v_award_month,
      v_winner.rank_no
    );

    v_award_count := v_award_count + 1;
  end loop;

  insert into public.career_monthly_award_runs (
    award_month,
    award_count,
    completed_at
  )
  values (
    v_award_month,
    v_award_count,
    clock_timestamp()
  );

  return v_award_count;
end;
$$;

revoke all on function public.execute_career_monthly_awards(date)
  from public, anon, authenticated, service_role;

create or replace function public.run_due_career_monthly_awards()
returns table (
  is_due boolean,
  award_month date,
  award_count integer
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_seoul_now timestamp := timezone('Asia/Seoul', clock_timestamp());
  v_today date := v_seoul_now::date;
  v_award_month date := date_trunc('month', v_seoul_now)::date;
  v_last_day date;
  v_award_count integer := 0;
begin
  v_last_day := (
    v_award_month + interval '1 month - 1 day'
  )::date;

  if v_today <> v_last_day or v_seoul_now::time < time '12:00:00' then
    return query select false, v_award_month, 0;
    return;
  end if;

  v_award_count := public.execute_career_monthly_awards(v_award_month);
  return query select true, v_award_month, v_award_count;
end;
$$;

revoke all on function public.run_due_career_monthly_awards()
  from public, anon, authenticated, service_role;

create or replace function public.get_my_pending_career_awards()
returns table (
  award_month date,
  rank_no smallint,
  reward_amount integer,
  awarded_at timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception '로그인이 필요해.';
  end if;

  return query
  select
    award.award_month,
    award.rank_no,
    award.reward_amount,
    award.awarded_at
  from public.career_monthly_awards award
  where award.user_id = v_user_id
    and award.acknowledged_at is null
  order by award.award_month asc, award.rank_no asc;
end;
$$;

revoke all on function public.get_my_pending_career_awards()
  from public, anon;
grant execute on function public.get_my_pending_career_awards()
  to authenticated;

create or replace function public.acknowledge_my_career_award(
  p_award_month date,
  p_rank integer
)
returns table (
  ok boolean,
  already_acknowledged boolean,
  message text,
  acknowledged_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_award_month date := date_trunc('month', p_award_month)::date;
  v_acknowledged_at timestamptz;
begin
  if v_user_id is null then
    raise exception '로그인이 필요해.';
  end if;

  if p_award_month is null or p_rank not between 1 and 3 then
    return query
    select false, false, '시상 정보를 확인하지 못했어.', null::timestamptz;
    return;
  end if;

  select award.acknowledged_at
    into v_acknowledged_at
  from public.career_monthly_awards award
  where award.award_month = v_award_month
    and award.rank_no = p_rank
    and award.user_id = v_user_id
  for update;

  if not found then
    return query
    select false, false, '확인할 시상 내역을 찾지 못했어.', null::timestamptz;
    return;
  end if;

  if v_acknowledged_at is not null then
    return query
    select true, true, '이미 확인한 시상 내역이야.', v_acknowledged_at;
    return;
  end if;

  update public.career_monthly_awards award
  set acknowledged_at = clock_timestamp()
  where award.award_month = v_award_month
    and award.rank_no = p_rank
    and award.user_id = v_user_id
  returning award.acknowledged_at into v_acknowledged_at;

  return query
  select true, false, '시상 내역을 확인했어.', v_acknowledged_at;
end;
$$;

revoke all on function public.acknowledge_my_career_award(date, integer)
  from public, anon;
grant execute on function public.acknowledge_my_career_award(date, integer)
  to authenticated;

do $schedule_career_monthly_awards$
declare
  v_job_id bigint;
begin
  for v_job_id in
    select job.jobid
    from cron.job job
    where job.jobname = 'career-monthly-awards-kst'
  loop
    perform cron.unschedule(v_job_id);
  end loop;

  perform cron.schedule(
    'career-monthly-awards-kst',
    '*/5 3-14 28-31 * *',
    'select public.run_due_career_monthly_awards();'
  );
end;
$schedule_career_monthly_awards$;

do $verify_career_monthly_awards$
declare
  v_reason_constraint text;
begin
  select pg_get_constraintdef(constraint_row.oid)
    into v_reason_constraint
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.conrelid = 'public.pickle_ledger'::regclass
    and constraint_row.conname = 'pickle_ledger_reason_code_check';

  if position('career_monthly_award' in coalesce(v_reason_constraint, '')) = 0
     or to_regprocedure(
       'public.get_career_monthly_best(date,integer)'
     ) is null
     or to_regprocedure(
       'public.execute_career_monthly_awards(date)'
     ) is null
     or to_regprocedure(
       'public.run_due_career_monthly_awards()'
     ) is null
     or to_regprocedure(
       'public.get_my_pending_career_awards()'
     ) is null
     or to_regprocedure(
       'public.acknowledge_my_career_award(date,integer)'
     ) is null then
    raise exception 'CAREER_MONTHLY_AWARD_SCHEMA_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.run_due_career_monthly_awards()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.run_due_career_monthly_awards()',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'public.execute_career_monthly_awards(date)',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.get_my_pending_career_awards()',
       'EXECUTE'
     )
     or not has_function_privilege(
       'authenticated',
       'public.acknowledge_my_career_award(date,integer)',
       'EXECUTE'
     ) then
    raise exception 'CAREER_MONTHLY_AWARD_PERMISSION_VERIFY_FAILED';
  end if;

  if (select count(*) from cron.job
      where jobname = 'career-monthly-awards-kst') <> 1
     or not exists (
       select 1
       from cron.job
       where jobname = 'career-monthly-awards-kst'
         and schedule = '*/5 3-14 28-31 * *'
         and command = 'select public.run_due_career_monthly_awards();'
     ) then
    raise exception 'CAREER_MONTHLY_AWARD_CRON_VERIFY_FAILED';
  end if;

  if exists (
    select award_month, rank_no
    from public.career_monthly_awards
    group by award_month, rank_no
    having count(*) > 1
  ) then
    raise exception 'CAREER_MONTHLY_AWARD_DUPLICATE_VERIFY_FAILED';
  end if;
end;
$verify_career_monthly_awards$;

commit;

select
  job.jobid,
  job.jobname,
  job.schedule,
  job.command,
  job.active
from cron.job job
where job.jobname = 'career-monthly-awards-kst';
