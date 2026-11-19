begin;

-- Start in a pilot so the installed calendar release keeps its existing login
-- until the compatible store updates are available. Only database operators
-- assign accounts or enable enforcement for everyone. Clients cannot opt out.
create table if not exists public.account_mfa_rollout(
  singleton boolean primary key check(singleton),
  everyone boolean not null default false
);
insert into public.account_mfa_rollout(singleton) values(true) on conflict do nothing;
create table if not exists public.account_mfa_pilots(
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.account_mfa_rollout enable row level security;
alter table public.account_mfa_pilots enable row level security;
revoke all on public.account_mfa_rollout,public.account_mfa_pilots from public,anon,authenticated,service_role;
create or replace function public.account_mfa_legacy_access()
returns boolean language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.account_mfa_rollout where singleton and not everyone
  ) and exists (
    select 1 from auth.users u join auth.sessions s on s.user_id=u.id
    where u.id=auth.uid() and s.id=(auth.jwt()->>'session_id')::uuid
      and (s.not_after is null or s.not_after>now())
      and (u.raw_app_meta_data->>'mallinoi_mfa_method') is distinct from 'totp'
      and not exists(select 1 from auth.mfa_factors f where f.user_id=u.id and f.status='verified')
      and not exists(select 1 from public.account_mfa_pilots p where p.user_id=u.id)
  )
$$;
revoke all on function public.account_mfa_legacy_access() from public,anon;
grant execute on function public.account_mfa_legacy_access() to authenticated;

create or replace function public.require_account_mfa()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if public.account_mfa_legacy_access() then return; end if;
  if auth.uid() is null or (auth.jwt()->>'aal') is distinct from 'aal2' then
    raise exception using errcode = '42501', message = 'MFA_REQUIRED';
  end if;
end;
$$;
revoke all on function public.require_account_mfa() from public, anon;
grant execute on function public.require_account_mfa() to authenticated;

create or replace function public.require_recent_account_mfa()
returns void language plpgsql stable security invoker set search_path = '' as $$
begin
  if public.account_mfa_legacy_access() then return; end if;
  perform public.require_account_mfa();
  if not exists (
    select 1 from jsonb_array_elements(auth.jwt()->'amr') proof
    where proof->>'method' = 'totp'
      and (proof->>'timestamp')::bigint between
        extract(epoch from now())::bigint - 300 and extract(epoch from now())::bigint + 5
  ) then
    raise exception using errcode = '42501', message = 'RECENT_MFA_REQUIRED';
  end if;
end;
$$;
revoke all on function public.require_recent_account_mfa() from public, anon;
grant execute on function public.require_recent_account_mfa() to authenticated;

-- Require fresh proof inside account cleanup as well as in the Edge Function,
-- so every SQL/API entry point checks it before the first deletion. Keep the
-- installed cleanup definition, owner and grants when upgrading existing sites.
do $upgrade$
declare
  cleanup regprocedure := to_regprocedure('public.cleanup_my_account_data()');
  definition text;
  guarded text;
begin
  if cleanup is not null then
    definition := pg_get_functiondef(cleanup);
    if position('perform public.require_recent_account_mfa();' in lower(definition)) = 0 then
      guarded := regexp_replace(definition, '(?in)^begin[[:blank:]]*$',
        E'begin\n  perform public.require_recent_account_mfa();');
      if guarded = definition then
        raise exception 'Cannot identify account cleanup entry point';
      end if;
      execute guarded;
    end if;
  end if;
end;
$upgrade$;

-- Preserve a previously configured pre-request function, including when the
-- migration is rerun. PostgREST also applies this check to views and new RPCs.
do $migration$
declare
  previous text;
  previous_call text := '';
begin
  select substr(setting, length('pgrst.db_pre_request=') + 1) into previous
  from pg_db_role_setting s cross join lateral unnest(s.setconfig) setting
  where s.setrole in (0, 'authenticator'::regrole::oid)
    and s.setdatabase in (0, (select oid from pg_database where datname = current_database()))
    and setting like 'pgrst.db_pre_request=%'
  order by s.setrole desc, s.setdatabase desc limit 1;
  if previous is distinct from 'public.mallinoi_mfa_pre_request' then
    if nullif(previous, '') is not null then
      select format('perform %I.%I();', n.nspname, p.proname) into strict previous_call
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where p.oid = (previous || '()')::regprocedure;
    end if;
    execute format($ddl$
      create or replace function public.mallinoi_mfa_pre_request()
      returns void language plpgsql security invoker as $body$
      begin
        if current_user = 'authenticated' then
          perform public.require_account_mfa();
        end if;
        %s
      end;
      $body$;
    $ddl$, previous_call);
  end if;
  execute format('alter role authenticator in database %I set pgrst.db_pre_request = %L',
    current_database(), 'public.mallinoi_mfa_pre_request');
end;
$migration$;

revoke all on function public.mallinoi_mfa_pre_request() from public;
grant execute on function public.mallinoi_mfa_pre_request() to anon, authenticated, service_role;

-- Storage and Realtime do not use the PostgREST pre-request hook.
do $$
declare item record;
begin
  for item in
    select 'storage' as schemaname, 'objects' as tablename
    union
    select schemaname, tablename from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('drop policy if exists mallinoi_member_mfa on %I.%I', item.schemaname, item.tablename);
    execute format($policy$
      create policy mallinoi_member_mfa on %I.%I as restrictive for all to authenticated
        using ((select public.account_mfa_legacy_access()) or (select auth.jwt()->>'aal') = 'aal2')
        with check ((select public.account_mfa_legacy_access()) or (select auth.jwt()->>'aal') = 'aal2')
    $policy$, item.schemaname, item.tablename);
  end loop;
end;
$$;

notify pgrst, 'reload config';
notify pgrst, 'reload schema';
commit;
