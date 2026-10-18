-- 2026-10-18 Google / Kakao / Apple explicit account linking.
-- Local implementation only: apply this file alone after reviewing the deployment guide.
-- Built-in Supabase social providers MUST remain disabled: their email auto-linking
-- does not implement this service's explicit reauthentication policy.
begin;

create table if not exists public.social_account_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google', 'kakao', 'apple')),
  subject text not null check (length(subject) between 1 and 255),
  credential_ciphertext text,
  created_at timestamptz not null default now(),
  unique (provider, subject),
  unique (user_id, provider)
);

create table if not exists public.social_auth_requests (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('google', 'kakao', 'apple')),
  purpose text not null check (purpose in ('login', 'link')),
  target_user_id uuid references auth.users(id) on delete cascade,
  state_hash text not null unique,
  client_challenge text not null,
  provider_verifier text not null,
  nonce text not null,
  return_uri text not null,
  status text not null default 'pending' check (status in ('pending','processing','ready','email-sending','failed','used')),
  subject text,
  verified_email text,
  credential_ciphertext text,
  proof_email text,
  proof_user_id uuid references auth.users(id) on delete cascade,
  error_code text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '5 minutes',
  check ((purpose = 'link') = (target_user_id is not null))
);
create index if not exists social_auth_requests_expiry_idx on public.social_auth_requests(expires_at);

create table if not exists public.social_auth_audit (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  provider text not null,
  action text not null check (action in ('linked','unlinked')),
  created_at timestamptz not null default now()
);

create table if not exists public.social_auth_limits (
  bucket text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

-- A failed Apple revocation is retained for retry, never silently discarded on unlink.
create table if not exists public.social_auth_revocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'apple'),
  subject text not null unique,
  credential_ciphertext text not null,
  created_at timestamptz not null default now()
);

alter table public.social_account_links enable row level security;
alter table public.social_auth_requests enable row level security;
alter table public.social_auth_audit enable row level security;
alter table public.social_auth_limits enable row level security;
alter table public.social_auth_revocations enable row level security;
revoke all on public.social_account_links, public.social_auth_requests,
  public.social_auth_audit, public.social_auth_limits, public.social_auth_revocations from public, anon, authenticated;
grant all on public.social_account_links, public.social_auth_requests,
  public.social_auth_audit, public.social_auth_limits, public.social_auth_revocations to service_role;
grant usage, select on sequence public.social_auth_audit_id_seq to service_role;

-- These helpers are service-role-only; callers cannot choose another user's UUID.
create or replace function public.social_auth_user(p_email text default null, p_id uuid default null)
returns table (id uuid, email text, has_password boolean, confirmed boolean)
language sql security definer set search_path = '' as $$
  select u.id, u.email, coalesce(u.encrypted_password, '') <> '', u.email_confirmed_at is not null
  from auth.users u
  where (p_id is not null and u.id = p_id)
     or (p_id is null and lower(u.email) = lower(trim(p_email)))
  limit 1;
$$;

create or replace function public.social_auth_rate_limit(p_bucket text, p_limit integer)
returns boolean language plpgsql security definer set search_path = '' as $$
declare v_attempts integer;
begin
  if p_limit < 1 or p_limit > 100 then raise exception 'INVALID_LIMIT'; end if;
  insert into public.social_auth_limits as l (bucket, window_start, attempts)
  values (p_bucket, now(), 1)
  on conflict (bucket) do update set
    attempts = case when l.window_start < now() - interval '10 minutes' then 1 else l.attempts + 1 end,
    window_start = case when l.window_start < now() - interval '10 minutes' then now() else l.window_start end
  returning attempts into v_attempts;
  delete from public.social_auth_limits where window_start < now() - interval '1 day';
  delete from public.social_auth_requests where expires_at < now() - interval '1 day';
  return v_attempts <= p_limit;
end;
$$;

-- Atomic uniqueness + one-time redemption. A client challenge cannot be changed.
create or replace function public.social_auth_finish(p_request uuid, p_challenge text, p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare r public.social_auth_requests; v_owner uuid;
begin
  select * into r from public.social_auth_requests where id = p_request for update;
  if not found or r.status <> 'ready' or r.expires_at <= now()
     or r.client_challenge <> p_challenge or r.subject is null then
    raise exception 'INVALID_OR_USED_REQUEST';
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
    insert into public.social_account_links(user_id, provider, subject, credential_ciphertext)
    values(p_user, r.provider, r.subject, r.credential_ciphertext);
    insert into public.social_auth_audit(user_id, provider, action) values(p_user, r.provider, 'linked');
  elsif r.credential_ciphertext is not null then
    update public.social_account_links set credential_ciphertext = r.credential_ciphertext
    where provider = r.provider and subject = r.subject;
  end if;
  update public.social_auth_requests set status = 'used', provider_verifier = '', nonce = '',
    credential_ciphertext = null, verified_email = null, proof_email = null, proof_user_id = null where id = p_request;
end;
$$;

create or replace function public.social_auth_unlink(p_user uuid, p_provider text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_password boolean; v_count integer;
begin
  -- Serialize removals for the same user, so two concurrent unlinks cannot remove both methods.
  select coalesce(encrypted_password, '') <> '' and email_confirmed_at is not null
    into v_password from auth.users where id = p_user for update;
  if not found then raise exception 'ACCOUNT_NOT_FOUND'; end if;
  select count(*) into v_count from public.social_account_links where user_id = p_user;
  if not coalesce(v_password, false) and v_count <= 1 then raise exception 'LAST_LOGIN_METHOD'; end if;
  insert into public.social_auth_revocations(user_id, provider, subject, credential_ciphertext)
    select user_id, provider, subject, credential_ciphertext from public.social_account_links
    where user_id = p_user and provider = p_provider and provider = 'apple';
  delete from public.social_account_links where user_id = p_user and provider = p_provider;
  if found then
    insert into public.social_auth_audit(user_id, provider, action) values(p_user, p_provider, 'unlinked');
  end if;
end;
$$;

revoke all on function public.social_auth_user(text, uuid), public.social_auth_rate_limit(text, integer),
  public.social_auth_finish(uuid, text, uuid), public.social_auth_unlink(uuid, text)
  from public, anon, authenticated;
grant execute on function public.social_auth_user(text, uuid), public.social_auth_rate_limit(text, integer),
  public.social_auth_finish(uuid, text, uuid), public.social_auth_unlink(uuid, text) to service_role;
commit;
