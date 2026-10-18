-- 2026-10-18 KST: Support GoTrue Admin createUser ordering without enabling social passwords.
-- Replaces only the approved independent-account guard; no existing account/data updates.
begin;

create or replace function public.guard_independent_social_user()
returns trigger language plpgsql security definer set search_path='' as $$
declare a jsonb; r public.social_auth_requests; expected_email text;
begin
  -- GoTrue Admin createUser inserts before applying app_metadata and generates a password.
  -- Only the server can choose an Auth user ID. Bind it to an unexpired, verified OAuth request;
  -- public signup cannot choose this UUID or write social_auth_requests (RLS/service-only).
  if tg_op='INSERT' and lower(coalesce(new.email,'')) like '%@social.mallinoi.invalid' then
    select * into r from public.social_auth_requests where id=new.id
      and purpose='login' and status='ready' and expires_at>now() and subject is not null;
    if not found then raise exception 'RESERVED_SOCIAL_ACCOUNT'; end if;
    expected_email := r.provider || '.' || left(encode(sha256(convert_to(r.provider || ':' || r.subject,'UTF8')),'hex'),56)
      || '@social.mallinoi.invalid';
    if new.email is distinct from expected_email then raise exception 'RESERVED_SOCIAL_ACCOUNT'; end if;
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb) || jsonb_build_object('mallinoi_auth',
      jsonb_build_object('kind','social','provider',r.provider,'subject',r.subject,'contact_email',r.verified_email));
    new.encrypted_password := '';
  end if;
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
revoke all on function public.guard_independent_social_user() from public,anon,authenticated;
commit;
