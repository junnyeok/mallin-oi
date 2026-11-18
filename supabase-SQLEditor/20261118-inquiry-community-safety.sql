-- Add public support-board threads and replies to the existing moderation queue.
begin;

alter table public.community_reports
  add column inquiry_thread_id bigint,
  drop constraint community_reports_target_kind_check,
  add constraint community_reports_target_kind_check
    check (target_kind in ('post', 'comment', 'member', 'suggestion', 'suggestion-reply', 'qna', 'qna-reply'));

create or replace function public.report_community_content(
  p_target_kind text, p_target_id text, p_reason text, p_secret_password text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  member uuid := auth.uid();
  author uuid;
  source_post bigint;
  inquiry_thread bigint;
begin
  if member is null then
    raise exception 'Sign-in required' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('abuse', 'spam', 'child-safety', 'other') then
    raise exception 'Invalid report reason' using errcode = '22023';
  end if;

  if p_target_kind = 'member' and p_target_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    select p.id into author from public.profiles p where p.id = p_target_id::uuid;
  elsif p_target_kind = 'post' and p_target_id ~ '^[1-9][0-9]{0,17}$' then
    select p.author_id, p.id into author, source_post
      from public.get_post_detail(p_target_id::bigint, p_secret_password) p where p.is_unlocked;
  elsif p_target_kind = 'comment' and p_target_id ~ '^[1-9][0-9]{0,17}$' then
    select c.author_id, c.post_id into author, source_post
      from public.post_comments c join public.posts p on p.id = c.post_id
      where c.id = p_target_id::bigint
        and (not p.is_private or exists (
          select 1 from public.get_post_comments(c.post_id, p_secret_password) visible
          where visible.id = c.id
        ));
  elsif p_target_kind = 'suggestion' and p_target_id ~ '^[1-9][0-9]{0,17}$' then
    select s.author_id, s.id into author, inquiry_thread from public.suggestions s
      where s.id = p_target_id::bigint and not s.is_secret;
  elsif p_target_kind = 'suggestion-reply' and p_target_id ~ '^[1-9][0-9]{0,17}$' then
    select c.author_id, s.id into author, inquiry_thread
      from public.suggestion_admin_comments c join public.suggestions s on s.id = c.suggestion_id
      where c.id = p_target_id::bigint and not s.is_secret;
  elsif p_target_kind = 'qna' and p_target_id ~ '^[1-9][0-9]{0,17}$' then
    select q.author_id, q.id into author, inquiry_thread from public.qna_threads q
      where q.id = p_target_id::bigint and not q.is_secret;
  elsif p_target_kind = 'qna-reply' and p_target_id ~ '^[1-9][0-9]{0,17}$' then
    select c.author_id, q.id into author, inquiry_thread
      from public.qna_admin_comments c join public.qna_threads q on q.id = c.thread_id
      where c.id = p_target_id::bigint and not q.is_secret;
  end if;

  if author is null or author = member then
    raise exception 'Report target unavailable' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('community-report:' || member::text, 0));
  if exists (select 1 from public.community_reports r
    where r.reporter_id = member and r.target_kind = p_target_kind and r.target_id = p_target_id) then
    return;
  end if;
  if (select count(*) from public.community_reports r
    where r.reporter_id = member and r.created_at >= now() - interval '1 day') >= 25 then
    raise exception 'Daily report limit reached' using errcode = '54000';
  end if;

  insert into public.community_reports (reporter_id, target_kind, target_id, post_id, inquiry_thread_id, reason)
    values (member, p_target_kind, p_target_id, source_post, inquiry_thread, p_reason);
end;
$$;

create or replace function public.read_community_report_content(p_report_id bigint)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare
  report public.community_reports%rowtype;
  content text;
begin
  if not coalesce(public.is_admin_user(auth.uid()), false) then
    raise exception 'Administrator required' using errcode = '42501';
  end if;
  select r.* into report from public.community_reports r where r.id = p_report_id;
  if report.target_kind = 'post' then
    select p.body into content from public.posts p where p.id = report.post_id;
  elsif report.target_kind = 'comment' then
    select c.body into content from public.post_comments c where c.id::text = report.target_id;
  elsif report.target_kind = 'suggestion' then
    select s.body into content from public.suggestions s where s.id = report.inquiry_thread_id;
  elsif report.target_kind = 'suggestion-reply' then
    select c.body into content from public.suggestion_admin_comments c
      where c.id::text = report.target_id and c.suggestion_id = report.inquiry_thread_id;
  elsif report.target_kind = 'qna' then
    select q.body into content from public.qna_threads q where q.id = report.inquiry_thread_id;
  elsif report.target_kind = 'qna-reply' then
    select c.body into content from public.qna_admin_comments c
      where c.id::text = report.target_id and c.thread_id = report.inquiry_thread_id;
  end if;
  return left(regexp_replace(content, '<[^>]+>', ' ', 'g'), 3000);
end;
$$;

-- These list RPCs do not receive a password. A secret inquiry's owner
-- continues to receive its replies through the existing password unlock RPC.
create or replace function public.list_suggestion_replies(p_thread_ids bigint[])
returns table (
  id bigint, thread_id bigint, body text, author_id uuid,
  author_nickname text, created_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select c.id, c.suggestion_id, c.body, c.author_id, c.author_nickname, c.created_at
  from public.suggestion_admin_comments c
  join public.suggestions s on s.id = c.suggestion_id
  where s.id = any(coalesce(p_thread_ids, '{}'::bigint[]))
    and (not s.is_secret or public.is_admin_user(auth.uid()))
  order by c.created_at asc, c.id asc;
$$;

create or replace function public.list_qna_replies(p_thread_ids bigint[])
returns table (
  id bigint, thread_id bigint, body text, author_id uuid,
  author_nickname text, created_at timestamptz
)
language sql security definer set search_path = ''
as $$
  select c.id, c.thread_id, c.body, c.author_id, c.author_nickname, c.created_at
  from public.qna_admin_comments c
  join public.qna_threads q on q.id = c.thread_id
  where q.id = any(coalesce(p_thread_ids, '{}'::bigint[]))
    and (not q.is_secret or public.is_admin_user(auth.uid()))
  order by c.created_at asc, c.id asc;
$$;

create trigger community_check_suggestions before insert or update of body on public.suggestions
  for each row execute function public.check_community_content_safety();
create trigger community_check_suggestion_replies before insert or update of body on public.suggestion_admin_comments
  for each row execute function public.check_community_content_safety();
create trigger community_check_qna before insert or update of body on public.qna_threads
  for each row execute function public.check_community_content_safety();
create trigger community_check_qna_replies before insert or update of body on public.qna_admin_comments
  for each row execute function public.check_community_content_safety();

commit;
