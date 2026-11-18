begin;

create table public.community_member_blocks (
  member_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  primary key (member_id, blocked_id),
  check (member_id <> blocked_id)
);

alter table public.community_member_blocks enable row level security;
revoke all on public.community_member_blocks from public, anon, authenticated;
grant select, delete on public.community_member_blocks to authenticated;
grant insert (blocked_id) on public.community_member_blocks to authenticated;
create policy community_member_blocks_own on public.community_member_blocks
  for all to authenticated using (member_id = auth.uid()) with check (member_id = auth.uid());

create table public.community_reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_kind text not null check (target_kind in ('post', 'comment', 'member')),
  target_id text not null,
  post_id bigint,
  reason text not null check (reason in ('abuse', 'spam', 'child-safety', 'other')),
  created_at timestamptz not null default now(),
  resolved boolean not null default false,
  unique (reporter_id, target_kind, target_id)
);

alter table public.community_reports enable row level security;
revoke all on public.community_reports from public, anon, authenticated;
grant select on public.community_reports to authenticated;
grant update (resolved) on public.community_reports to authenticated;
create policy community_reports_staff_read on public.community_reports
  for select to authenticated using (public.is_admin_user(auth.uid()));
create policy community_reports_staff_update on public.community_reports
  for update to authenticated using (public.is_admin_user(auth.uid()))
  with check (public.is_admin_user(auth.uid()));

create or replace function public.report_community_content(
  p_target_kind text, p_target_id text, p_reason text, p_secret_password text default null
) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  member uuid := auth.uid();
  author uuid;
  source_post bigint;
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

  insert into public.community_reports (reporter_id, target_kind, target_id, post_id, reason)
    values (member, p_target_kind, p_target_id, source_post, p_reason);
end;
$$;

revoke all on function public.report_community_content(text, text, text, text) from public, anon;
grant execute on function public.report_community_content(text, text, text, text) to authenticated;

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
  end if;
  return left(regexp_replace(content, '<[^>]+>', ' ', 'g'), 3000);
end;
$$;

revoke all on function public.read_community_report_content(bigint) from public, anon;
grant execute on function public.read_community_report_content(bigint) to authenticated;

create or replace function public.check_community_content_safety()
returns trigger language plpgsql set search_path = ''
as $$
declare
  content text := coalesce(new.body, '');
begin
  if tg_table_name = 'posts' then
    content := concat_ws(' ', to_jsonb(new)->>'title', to_jsonb(new)->>'excerpt', content);
  end if;
  content := regexp_replace(content, '<[^>]+>', ' ', 'g');
  if content ~* '(아동[[:space:]]*성착취물[[:space:]]*(판매|구매|교환)|child[[:space:]]+sexual[[:space:]]+abuse[[:space:]]+material[[:space:]]+for[[:space:]]+sale|너[[:space:]]*(를[[:space:]]*)?죽여[[:space:]]*버리겠|i[[:space:]]+will[[:space:]]+kill[[:space:]]+you)' then
    raise exception 'MALLINOI_COMMUNITY_CONTENT_RESTRICTED' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger community_check_posts before insert or update of title, excerpt, body on public.posts
  for each row execute function public.check_community_content_safety();
create trigger community_check_comments before insert or update of body on public.post_comments
  for each row execute function public.check_community_content_safety();

commit;
