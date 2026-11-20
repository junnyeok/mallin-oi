begin;

-- A verified authenticator is an existing enrollment. Historical email challenges
-- and unfinished QR setups are not choices to enable two-step verification.
update auth.users u set raw_app_meta_data=coalesce(u.raw_app_meta_data,'{}'::jsonb)
  || '{"mallinoi_mfa_method":"totp"}'
where (u.raw_app_meta_data->>'mallinoi_mfa_method') is distinct from 'totp'
  and exists(select from auth.mfa_factors f where f.user_id=u.id and f.status='verified' and f.factor_type='totp');

create or replace function public.account_mfa_legacy_access()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and s.id=(auth.jwt()->>'session_id')::uuid
      and (s.not_after is null or s.not_after>now())
      and coalesce(u.raw_app_meta_data->>'mallinoi_mfa_method','off')='off'
      and not exists(select from auth.mfa_factors f where f.user_id=u.id and f.status='verified'))
$$;

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
    return coalesce(claims->>'aal'='aal2',false) and exists (
      select from auth.sessions s join auth.mfa_factors f on s.factor_id=f.id
      where s.id=sid and f.user_id=uid and f.status='verified' and f.factor_type='totp'
    ) and (not p_recent or exists (
      select 1 from jsonb_array_elements(claims->'amr') proof where proof->>'method'='totp'
      and (proof->>'timestamp')::bigint between extract(epoch from now())::bigint-300 and extract(epoch from now())::bigint+5
    ));
  end if;
  return u.email_confirmed_at is not null and coalesce(claims->'amr' @> '[{"method":"password"}]',false)
    and exists (select 1 from public.account_email_mfa_sessions g where g.session_id=sid and g.email=u.email
      and (not p_recent or g.entry_verified_at>now()-interval '5 minutes'));
end;
$$;
-- Social accounts use native authenticators. Persist their first verified factor
-- with the verification transaction so other existing sessions are gated at once.
create or replace function public.sync_social_mfa_enrollment()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  update auth.users set raw_app_meta_data=raw_app_meta_data||'{"mallinoi_mfa_method":"totp"}'
    where id=new.user_id and raw_app_meta_data->'mallinoi_auth'->>'kind'='social'
      and (raw_app_meta_data->>'mallinoi_mfa_method') is distinct from 'totp';
  return new;
end;
$$;
revoke all on function public.sync_social_mfa_enrollment() from public,anon,authenticated;
drop trigger if exists mallinoi_social_mfa_enrolled on auth.mfa_factors;
create trigger mallinoi_social_mfa_enrolled after insert or update of status on auth.mfa_factors
  for each row when (new.status='verified' and new.factor_type='totp')
  execute function public.sync_social_mfa_enrollment();

create or replace function public.enable_account_email_mfa()
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid(); sid uuid := (auth.jwt()->>'session_id')::uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7342));
  if not public.account_mfa_legacy_access() or not public.account_mfa_verified(false)
    or not exists(select from public.account_email_mfa_sessions g where g.session_id=sid
      and g.email=public.account_email_mfa_recipient(uid,sid) and g.verified_at>now()-interval '5 minutes') then
    raise exception using errcode='42501',message='RECENT_MFA_REQUIRED';
  end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"mallinoi_mfa_method":"email"}' where id=uid;
  delete from public.account_email_mfa_sessions where session_id<>sid and session_id in (select id from auth.sessions where user_id=uid);
  delete from public.account_email_mfa_codes where session_id in (select id from auth.sessions where user_id=uid);
  update public.account_email_mfa_sessions set entry_verified_at=now() where session_id=sid;
end;
$$;
revoke all on function public.enable_account_email_mfa() from public,anon;
grant execute on function public.enable_account_email_mfa() to authenticated;

create or replace function public.disable_account_mfa()
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  perform pg_advisory_xact_lock(hashtextextended(uid::text,7342));
  if not public.account_mfa_verified(true) then
    raise exception using errcode='42501',message='RECENT_MFA_REQUIRED';
  end if;
  delete from public.account_email_mfa_codes where session_id in (select id from auth.sessions where user_id=uid);
  delete from public.account_email_mfa_sessions where session_id in (select id from auth.sessions where user_id=uid);
  update auth.sessions set factor_id=null, aal='aal1' where user_id=uid and factor_id is not null;
  delete from auth.mfa_amr_claims where authentication_method='totp' and session_id in (select id from auth.sessions where user_id=uid);
  delete from auth.mfa_factors where user_id=uid and factor_type='totp';
  update auth.users set raw_app_meta_data=raw_app_meta_data-'mallinoi_mfa_method' where id=uid;
end;
$$;
revoke all on function public.disable_account_mfa() from public,anon;
grant execute on function public.disable_account_mfa() to authenticated;
notify pgrst,'reload schema';
commit;
