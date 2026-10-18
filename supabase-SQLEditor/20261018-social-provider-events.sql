-- 2026-10-18 Verified Apple/Kakao account change notifications. Apply this file only.
-- Never deletes the unified member account or calendar data.
begin;
alter table public.social_account_links add column if not exists authorized_at timestamptz not null default now();
alter table public.social_account_links add column if not exists email_enabled boolean not null default true;
alter table public.social_auth_requests add column if not exists provider_authenticated_at timestamptz;
create table if not exists public.social_auth_provider_events (
  provider text not null check (provider in ('apple','kakao')),
  event_id text not null check (length(event_id) between 1 and 512),
  subject text not null check (length(subject) between 1 and 255),
  event_type text not null check (event_type in ('email-enabled','email-disabled','consent-revoked','account-deleted','user-unlinked')),
  event_at timestamptz not null,
  received_at timestamptz not null default now(),
  primary key(provider,event_id)
);
create index if not exists social_auth_provider_events_subject_idx
  on public.social_auth_provider_events(provider,subject,event_at);
alter table public.social_auth_provider_events enable row level security;
revoke all on public.social_auth_provider_events from public,anon,authenticated;
grant all on public.social_auth_provider_events to service_role;

create or replace function public.social_auth_receive_event(
  p_provider text,p_event_id text,p_subject text,p_type text,p_time timestamptz)
returns void language plpgsql security definer set search_path='' as $$
declare v_owner uuid;
begin
  if p_time > now() + interval '1 minute' or p_time < now() - interval '30 days' then
    raise exception 'INVALID_EVENT_TIME';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_provider || ':' || p_subject,0));
  insert into public.social_auth_provider_events(provider,event_id,subject,event_type,event_at)
    values(p_provider,p_event_id,p_subject,p_type,p_time) on conflict do nothing;
  if not found then return; end if;
  if p_type in ('consent-revoked','account-deleted','user-unlinked') then
    delete from public.social_account_links where provider=p_provider and subject=p_subject
      and date_trunc('second',authorized_at)<=p_time returning user_id into v_owner;
    if v_owner is not null then
      insert into public.social_auth_audit(user_id,provider,action) values(v_owner,p_provider,'unlinked');
    end if;
    delete from public.social_auth_revocations where provider=p_provider and subject=p_subject and created_at<=p_time;

  else
    update public.social_account_links set email_enabled = (select e.event_type='email-enabled'
      from public.social_auth_provider_events e where e.provider=p_provider and e.subject=p_subject
      and e.event_type in ('email-enabled','email-disabled') order by e.event_at desc,
      (e.event_type='email-disabled') desc limit 1)
      where provider=p_provider and subject=p_subject;
  end if;
  delete from public.social_auth_provider_events where received_at < now()-interval '30 days';
end;
$$;
create or replace function public.social_auth_finish(p_request uuid, p_challenge text, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.social_auth_requests; v_owner uuid; v_authenticated timestamptz;
begin
  select * into r from public.social_auth_requests where id = p_request for update;
  if not found or r.status <> 'ready' or r.expires_at <= now()
     or r.client_challenge <> p_challenge or r.subject is null then
    raise exception 'INVALID_OR_USED_REQUEST';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(r.provider || ':' || r.subject, 0));
  v_authenticated := coalesce(r.provider_authenticated_at, r.created_at);
  if exists (select 1 from public.social_auth_provider_events e where e.provider=r.provider
      and e.subject=r.subject and e.event_type in ('consent-revoked','account-deleted','user-unlinked')
      and e.event_at >= date_trunc('second', v_authenticated)) then
    raise exception 'PROVIDER_REVOKED';
  end if;
  if r.purpose = 'link' and r.target_user_id <> p_user then raise exception 'ACCOUNT_MISMATCH'; end if;
  perform 1 from auth.users where id = p_user and email_confirmed_at is not null for update;
  if not found then raise exception 'VERIFIED_ACCOUNT_REQUIRED'; end if;
  if exists (select 1 from public.social_auth_revocations where provider = r.provider and subject = r.subject) then
    raise exception 'REVOCATION_PENDING';
  end if;
  select user_id into v_owner from public.social_account_links
    where provider = r.provider and subject = r.subject for update;
  if v_owner is not null and v_owner <> p_user then raise exception 'IDENTITY_ALREADY_LINKED'; end if;
  if v_owner is null then
    insert into public.social_account_links(user_id, provider, subject, credential_ciphertext, authorized_at)
    values(p_user, r.provider, r.subject, r.credential_ciphertext, v_authenticated);
    insert into public.social_auth_audit(user_id, provider, action) values(p_user, r.provider, 'linked');
  else
    update public.social_account_links set authorized_at = v_authenticated,
      credential_ciphertext = coalesce(r.credential_ciphertext, credential_ciphertext)
    where provider = r.provider and subject = r.subject;
  end if;
  update public.social_account_links set email_enabled = coalesce((select e.event_type = 'email-enabled'
    from public.social_auth_provider_events e where e.provider=r.provider and e.subject=r.subject
      and e.event_type in ('email-enabled','email-disabled') order by e.event_at desc,
      (e.event_type='email-disabled') desc limit 1), true)
    where provider=r.provider and subject=r.subject;
  update public.social_auth_requests set status = 'used', provider_verifier = '', nonce = '',
    credential_ciphertext = null, verified_email = null, proof_email = null, proof_user_id = null where id = p_request;
end;
$$;

revoke all on function public.social_auth_receive_event(text,text,text,text,timestamptz) from public,anon,authenticated;
grant execute on function public.social_auth_receive_event(text,text,text,text,timestamptz) to service_role;
commit;
