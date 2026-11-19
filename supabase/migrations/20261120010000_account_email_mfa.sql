begin;

-- Email is a site-level second factor for password sessions. GoTrue AAL2
-- remains mandatory for social accounts and accounts using an authenticator.
-- Preserve pre-existing authenticator enrollment once, including on SQL replay.
do $$
begin
  if to_regclass('public.account_email_mfa_sessions') is null then
    update auth.users u set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
      || '{"mallinoi_mfa_method":"totp"}'
    where exists (select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')
      and (u.raw_app_meta_data->'mallinoi_auth'->>'kind') is distinct from 'social';
  end if;
end;
$$;

create table if not exists public.account_email_mfa_sessions (
  session_id uuid primary key references auth.sessions(id) on delete cascade,
  email text not null,
  verified_at timestamptz not null,
  entry_verified_at timestamptz,
  pending_factor_id uuid
);
create table if not exists public.account_email_mfa_codes (
  session_id uuid references auth.sessions(id) on delete cascade,
  purpose text check (purpose in ('login','entry')),
  challenge_id uuid not null,
  email text not null,
  digest text not null,
  sent_at timestamptz not null default now(),
  attempts int not null default 0,
  primary key(session_id, purpose)
);
create table if not exists public.account_email_mfa_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_start timestamptz not null,
  sent int not null
);
alter table public.account_email_mfa_sessions enable row level security;
alter table public.account_email_mfa_codes enable row level security;
alter table public.account_email_mfa_limits enable row level security;
revoke all on public.account_email_mfa_sessions, public.account_email_mfa_codes,
  public.account_email_mfa_limits from public, anon, authenticated, service_role;

-- Never accept a client-selected recipient, session owner or MFA mode. The Edge
-- Function verifies the original password JWT before invoking service-only RPCs.
create or replace function public.account_email_mfa_recipient(p_user uuid, p_session uuid)
returns text language sql stable security definer set search_path='' as $$
  select u.email from auth.users u join auth.sessions s on s.user_id=u.id
  where u.id=p_user and s.id=p_session and (s.not_after is null or s.not_after>now())
    and u.email_confirmed_at is not null and nullif(u.email,'') is not null
    and (u.raw_app_meta_data->'mallinoi_auth'->>'kind') is distinct from 'social'
    and (u.raw_app_meta_data->>'mallinoi_mfa_method') is distinct from 'totp'
$$;
revoke all on function public.account_email_mfa_recipient(uuid,uuid) from public, anon, authenticated, service_role;

create or replace function public.begin_account_email_mfa(p_user uuid,p_session uuid,p_purpose text,
  p_id uuid,p_digest text,p_resend boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  recipient text;
  prior public.account_email_mfa_codes;
  sent_count int;
begin
  if p_purpose not in ('login','entry') or p_id is null or p_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'INVALID_CHALLENGE';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_user::text,7342));
  recipient := public.account_email_mfa_recipient(p_user,p_session);
  if recipient is null or (p_purpose='entry' and not exists (
    select 1 from public.account_email_mfa_sessions where session_id=p_session and email=recipient
  )) then raise exception 'MFA_UNAVAILABLE'; end if;
  select * into prior from public.account_email_mfa_codes where session_id=p_session and purpose=p_purpose;
  if found then
    if not p_resend and prior.email=recipient and prior.attempts<5 and prior.sent_at>now()-interval '5 minutes' then
      return jsonb_build_object('id',prior.challenge_id,'send',false);
    end if;
    if prior.sent_at>now()-interval '60 seconds' then raise exception 'MFA_RATE_LIMIT'; end if;
  end if;
  insert into public.account_email_mfa_limits as q values (p_user,now(),1)
    on conflict(user_id) do update set
      window_start=case when q.window_start<=now()-interval '1 hour' then now() else q.window_start end,
      sent=case when q.window_start<=now()-interval '1 hour' then 1 else q.sent+1 end
    where q.window_start<=now()-interval '1 hour' or q.sent<10 returning sent into sent_count;
  if sent_count is null then raise exception 'MFA_RATE_LIMIT'; end if;
  insert into public.account_email_mfa_codes(session_id,purpose,challenge_id,email,digest)
    values (p_session,p_purpose,p_id,recipient,p_digest)
    on conflict(session_id,purpose) do update set challenge_id=p_id,email=recipient,digest=p_digest,sent_at=now(),attempts=0;
  return jsonb_build_object('id',p_id,'send',true,'email',recipient);
end;
$$;

create or replace function public.cancel_undelivered_account_code(p_session uuid, p_id uuid)
returns void language sql security definer set search_path='' as $$
  update public.account_email_mfa_codes set attempts=5 where session_id=p_session and challenge_id=p_id
$$;
revoke all on function public.cancel_undelivered_account_code(uuid,uuid) from public,anon,authenticated;
grant execute on function public.cancel_undelivered_account_code(uuid,uuid) to service_role;

create or replace function public.finish_account_email_mfa(p_user uuid,p_session uuid,p_purpose text,p_id uuid,p_digest text)
returns boolean language plpgsql security definer set search_path='' as $$
declare challenge public.account_email_mfa_codes;
begin
  select * into challenge from public.account_email_mfa_codes where session_id=p_session and purpose=p_purpose
    and challenge_id=p_id for update;
  if not found or challenge.sent_at<=now()-interval '5 minutes' or challenge.attempts>=5
    or challenge.email is distinct from public.account_email_mfa_recipient(p_user,p_session) then return false; end if;
  if challenge.digest is distinct from p_digest then
    update public.account_email_mfa_codes set attempts=attempts+1 where session_id=p_session and purpose=p_purpose;
    return false;
  end if;
  delete from public.account_email_mfa_codes where session_id=p_session and purpose=p_purpose;
  if p_purpose='entry' then
    update public.account_email_mfa_sessions set entry_verified_at=now() where session_id=p_session and email=challenge.email;
    return found;
  end if;
  insert into public.account_email_mfa_sessions(session_id,email,verified_at,entry_verified_at) values (p_session,challenge.email,now(),null)
    on conflict(session_id) do update set email=excluded.email,verified_at=now(),entry_verified_at=null,pending_factor_id=null;
  return true;
end;
$$;
revoke all on function public.begin_account_email_mfa(uuid,uuid,text,uuid,text,boolean),
  public.finish_account_email_mfa(uuid,uuid,text,uuid,text) from public,anon,authenticated;
grant execute on function public.begin_account_email_mfa(uuid,uuid,text,uuid,text,boolean),
  public.finish_account_email_mfa(uuid,uuid,text,uuid,text) to service_role;

-- This function accepts no user/session arguments and is also used by Storage and Realtime.
create or replace function public.account_mfa_verified(p_recent boolean default false)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare
  claims jsonb := auth.jwt();
  uid uuid := auth.uid();
  sid uuid := (claims->>'session_id')::uuid;
  u auth.users;
begin
  select a.* into u from auth.users a join auth.sessions s on s.user_id=a.id
    where a.id=uid and s.id=sid and (s.not_after is null or s.not_after>now());
  if not found then return false; end if;
  if u.raw_app_meta_data->'mallinoi_auth'->>'kind'='social' or u.raw_app_meta_data->>'mallinoi_mfa_method'='totp' then
    return coalesce(claims->>'aal'='aal2',false) and (not p_recent or exists (
      select 1 from jsonb_array_elements(claims->'amr') proof where proof->>'method'='totp'
      and (proof->>'timestamp')::bigint between extract(epoch from now())::bigint-300 and extract(epoch from now())::bigint+5
    ));
  end if;
  return u.email_confirmed_at is not null and coalesce(claims->'amr' @> '[{"method":"password"}]',false)
    and exists (select 1 from public.account_email_mfa_sessions g where g.session_id=sid and g.email=u.email
      and (not p_recent or g.entry_verified_at>now()-interval '5 minutes'));
end;
$$;
revoke all on function public.account_mfa_verified(boolean) from public,anon;
grant execute on function public.account_mfa_verified(boolean) to authenticated;

create or replace function public.verified_account_session()
returns uuid language sql stable security invoker set search_path='' as $$
  select (auth.jwt()->>'session_id')::uuid where public.account_mfa_verified(false)
$$;
revoke all on function public.verified_account_session() from public,anon;
grant execute on function public.verified_account_session() to authenticated;

create or replace function public.require_account_mfa()
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if public.account_mfa_legacy_access() then return; end if;
  if not public.account_mfa_verified(false) then raise exception using errcode='42501',message='MFA_REQUIRED'; end if;
end;
$$;
create or replace function public.require_recent_account_mfa()
returns void language plpgsql stable security invoker set search_path='' as $$
begin
  if public.account_mfa_legacy_access() then return; end if;
  perform public.require_account_mfa();
  if not public.account_mfa_verified(true) then raise exception using errcode='42501',message='RECENT_MFA_REQUIRED'; end if;
end;
$$;

-- Bind a newly enrolled native factor to the mailbox-proven session before
-- GoTrue promotes it. A password-only Auth client cannot verify its own factor.
create or replace function public.prepare_account_authenticator(p_factor uuid)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); sid uuid := (auth.jwt()->>'session_id')::uuid;
begin
  if public.account_email_mfa_recipient(uid,sid) is null or not public.account_mfa_verified(true)
    or not exists(select 1 from auth.mfa_factors where id=p_factor and user_id=uid and factor_type='totp') then
    raise exception using errcode='42501',message='RECENT_MFA_REQUIRED';
  end if;
  update public.account_email_mfa_sessions set pending_factor_id=p_factor where session_id=sid;
end;
$$;
revoke all on function public.prepare_account_authenticator(uuid) from public,anon;
grant execute on function public.prepare_account_authenticator(uuid) to authenticated;

create or replace function public.guard_email_mfa_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists (select 1 from auth.users u where u.id=new.user_id
    and (u.raw_app_meta_data->'mallinoi_auth'->>'kind') is distinct from 'social'
    and (u.raw_app_meta_data->>'mallinoi_mfa_method') is distinct from 'totp')
    and not exists (select 1 from public.account_email_mfa_sessions g join auth.sessions s on s.id=g.session_id
      where s.user_id=new.user_id and g.pending_factor_id=new.id and g.entry_verified_at>now()-interval '5 minutes'
        and g.email=public.account_email_mfa_recipient(new.user_id,g.session_id))
  then raise exception using errcode='42501',message='RECENT_MFA_REQUIRED'; end if;
  return new;
end;
$$;
revoke all on function public.guard_email_mfa_enrollment() from public,anon,authenticated;
drop trigger if exists guard_mallinoi_factor_verification on auth.mfa_factors;
create trigger guard_mallinoi_factor_verification before update of status on auth.mfa_factors
  for each row when (new.status='verified' and old.status is distinct from new.status)
  execute function public.guard_email_mfa_enrollment();
drop trigger if exists guard_mallinoi_verified_factor_insert on auth.mfa_factors;
create trigger guard_mallinoi_verified_factor_insert before insert on auth.mfa_factors
  for each row when (new.status='verified') execute function public.guard_email_mfa_enrollment();

-- Change the regular account's method only after proving both the mailbox
-- on My Page and a freshly verified native authenticator in this same session.
create or replace function public.activate_account_authenticator()
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); sid uuid := (auth.jwt()->>'session_id')::uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7342));
  if public.account_email_mfa_recipient(uid,sid) is null or not public.account_mfa_verified(true)
    or (select count(*) from auth.mfa_factors where user_id=uid and status='verified') <> 1
    or not exists (select 1 from auth.sessions s join auth.mfa_factors f on f.id=s.factor_id
      where s.id=sid and f.user_id=uid and f.factor_type='totp' and f.status='verified')
    or (auth.jwt()->>'aal') is distinct from 'aal2' or not exists (
      select 1 from jsonb_array_elements(auth.jwt()->'amr') p where p->>'method'='totp'
      and (p->>'timestamp')::bigint between extract(epoch from now())::bigint-300 and extract(epoch from now())::bigint+5
    ) then raise exception using errcode='42501',message='RECENT_MFA_REQUIRED'; end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"mallinoi_mfa_method":"totp"}' where id=uid;
  delete from public.account_email_mfa_sessions where session_id in (select id from auth.sessions where user_id=uid);
  delete from public.account_email_mfa_codes where session_id in (select id from auth.sessions where user_id=uid);
end;
$$;
revoke all on function public.activate_account_authenticator() from public,anon;
grant execute on function public.activate_account_authenticator() to authenticated;

do $$
declare item record;
begin
  for item in select 'storage' as schemaname,'objects' as tablename union
    select schemaname,tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'
  loop
    execute format('drop policy if exists mallinoi_member_mfa on %I.%I', item.schemaname,item.tablename);
    execute format('create policy mallinoi_member_mfa on %I.%I as restrictive for all to authenticated
      using ((select public.account_mfa_legacy_access()) or (select public.account_mfa_verified(false))) with check ((select public.account_mfa_legacy_access()) or (select public.account_mfa_verified(false)))',
      item.schemaname,item.tablename);
  end loop;
end;
$$;
notify pgrst,'reload schema';
commit;
