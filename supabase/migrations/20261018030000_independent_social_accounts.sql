-- 2026-10-18 KST: Separate email / Google / Kakao / Apple accounts.
-- Approved and applied 2026-10-18 KST with matching social-auth/delete-account; web/app release follows.
-- Existing users/profiles/balances/calendar data and legacy links are NOT moved or deleted.
-- Legacy links are no longer login credentials. A provider creates a new account on first signup.
begin;

create table if not exists public.social_login_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google','kakao','apple')),
  subject text not null check (length(subject) between 1 and 255),
  credential_ciphertext text,
  authorized_at timestamptz not null default now(),
  email_enabled boolean not null default true,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider,subject)
);
alter table public.social_login_accounts enable row level security;
revoke all on public.social_login_accounts from public,anon,authenticated;
grant all on public.social_login_accounts to service_role;

-- Keep old requests for expiry/audit, but never allow their link operation to finish.
alter table public.social_auth_requests drop constraint if exists social_auth_requests_purpose_check;
alter table public.social_auth_requests add constraint social_auth_requests_purpose_check
  check (purpose in ('login','link','reauth'));
alter table public.social_auth_requests drop constraint if exists social_auth_requests_check;
alter table public.social_auth_requests add constraint social_auth_requests_check
  check ((purpose in ('link','reauth')) = (target_user_id is not null));

-- app_metadata is server-managed. Public email signup cannot reserve an internal address,
-- and a social session cannot add a password or change itself into an email account.
create or replace function public.guard_independent_social_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb;
begin
  a := new.raw_app_meta_data->'mallinoi_auth';
  if tg_op='UPDATE' and old.raw_app_meta_data->'mallinoi_auth'->>'kind'='social' then
    if new.email is distinct from old.email or coalesce(new.encrypted_password,'')<>''
      or a->>'kind' is distinct from 'social'
      or a->>'provider' is distinct from (old.raw_app_meta_data->'mallinoi_auth'->>'provider')
      or a->>'subject' is distinct from (old.raw_app_meta_data->'mallinoi_auth'->>'subject') then
      raise exception 'SOCIAL_LOGIN_ONLY';
    end if;
  end if;
  if lower(coalesce(new.email,'')) like '%@social.mallinoi.invalid' or a->>'kind'='social' then
    if coalesce(a->>'kind','')<>'social' or coalesce(a->>'provider','') not in ('google','kakao','apple')
      or coalesce(a->>'subject','')='' or coalesce(new.encrypted_password,'')<>''
      or coalesce(new.email,'') !~ '^(google|kakao|apple)\.[a-f0-9]{56}@social\.mallinoi\.invalid$' then
      raise exception 'RESERVED_SOCIAL_ACCOUNT';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_independent_social_user on auth.users;
create trigger guard_independent_social_user before insert or update on auth.users
  for each row execute function public.guard_independent_social_user();
revoke all on function public.guard_independent_social_user() from public,anon,authenticated;

create or replace function public.social_auth_account_mode()
returns text language sql security definer set search_path='' as $$ select 'separate'::text $$;
revoke all on function public.social_auth_account_mode() from public,anon,authenticated;
grant execute on function public.social_auth_account_mode() to service_role;

create or replace function public.social_auth_finish(p_request uuid,p_challenge text,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare r public.social_auth_requests; v_owner uuid; v_authenticated timestamptz; a jsonb;
begin
  select * into r from public.social_auth_requests where id=p_request for update;
  if not found or r.status<>'ready' or r.expires_at<=now() or r.client_challenge<>p_challenge
    or r.subject is null then raise exception 'INVALID_OR_USED_REQUEST'; end if;
  if r.purpose='link' then raise exception 'ACCOUNT_LINKING_DISABLED'; end if;
  if r.purpose='reauth' and r.target_user_id<>p_user then raise exception 'ACCOUNT_MISMATCH'; end if;
  perform pg_advisory_xact_lock(hashtextextended(r.provider || ':' || r.subject,0));
  v_authenticated := coalesce(r.provider_authenticated_at,r.created_at);
  if exists (select 1 from public.social_auth_provider_events e where e.provider=r.provider
    and e.subject=r.subject and e.event_type in ('consent-revoked','account-deleted','user-unlinked')
    and e.event_at>=date_trunc('second',v_authenticated)) then raise exception 'PROVIDER_REVOKED'; end if;
  select raw_app_meta_data->'mallinoi_auth' into a from auth.users
    where id=p_user and email_confirmed_at is not null for update;
  if not found or coalesce(a->>'kind','')<>'social' or a->>'provider' is distinct from r.provider
    or a->>'subject' is distinct from r.subject then raise exception 'SOCIAL_ACCOUNT_REQUIRED'; end if;
  select user_id into v_owner from public.social_login_accounts
    where provider=r.provider and subject=r.subject for update;
  if v_owner is not null and v_owner<>p_user then raise exception 'ACCOUNT_MISMATCH'; end if;
  if r.purpose='reauth' and v_owner is null then raise exception 'ACCOUNT_MISMATCH'; end if;
  insert into public.social_login_accounts(user_id,provider,subject,credential_ciphertext,authorized_at)
    values(p_user,r.provider,r.subject,r.credential_ciphertext,v_authenticated)
    on conflict(provider,subject) do update set
      authorized_at=greatest(social_login_accounts.authorized_at,excluded.authorized_at),
      credential_ciphertext=coalesce(excluded.credential_ciphertext,social_login_accounts.credential_ciphertext),
      revoked_at=null;
  update public.social_login_accounts set email_enabled=coalesce((select e.event_type='email-enabled'
    from public.social_auth_provider_events e where e.provider=r.provider and e.subject=r.subject
      and e.event_type in ('email-enabled','email-disabled') order by e.event_at desc,
      (e.event_type='email-disabled') desc limit 1),true)
    where provider=r.provider and subject=r.subject;
  update public.social_auth_requests set status='used',provider_verifier='',nonce='',
    credential_ciphertext=null,verified_email=null,proof_email=null,proof_user_id=null where id=p_request;
end;
$$;

create or replace function public.social_auth_unlink(p_user uuid,p_provider text)
returns void language plpgsql security definer set search_path='' as $$
begin raise exception 'ACCOUNT_LINKING_DISABLED'; end;
$$;

create or replace function public.social_auth_receive_event(
  p_provider text,p_event_id text,p_subject text,p_type text,p_time timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if p_time>now()+interval '1 minute' or p_time<now()-interval '30 days' then
    raise exception 'INVALID_EVENT_TIME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_subject,0));
  insert into public.social_auth_provider_events(provider,event_id,subject,event_type,event_at)
    values(p_provider,p_event_id,p_subject,p_type,p_time) on conflict do nothing;
  if not found then return; end if;
  if p_type in ('consent-revoked','account-deleted','user-unlinked') then
    -- Keep the identity's owner: a fresh consent must reopen the SAME account, not a new one.
    update public.social_login_accounts set revoked_at=p_time,credential_ciphertext=null
      where provider=p_provider and subject=p_subject and date_trunc('second',authorized_at)<=p_time
      and (revoked_at is null or revoked_at<=p_time);
  else
    update public.social_login_accounts set email_enabled=(select e.event_type='email-enabled'
      from public.social_auth_provider_events e where e.provider=p_provider and e.subject=p_subject
      and e.event_type in ('email-enabled','email-disabled') order by e.event_at desc,
      (e.event_type='email-disabled') desc limit 1) where provider=p_provider and subject=p_subject;
  end if;
  delete from public.social_auth_provider_events where received_at<now()-interval '30 days';
end;
$$;
revoke all on function public.social_auth_finish(uuid,text,uuid), public.social_auth_unlink(uuid,text),
  public.social_auth_receive_event(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.social_auth_finish(uuid,text,uuid),
  public.social_auth_receive_event(text,text,text,text,timestamptz) to service_role;
-- Disable the obsolete mutation even for old server versions.
revoke all on function public.social_auth_unlink(uuid,text) from service_role;
commit;
