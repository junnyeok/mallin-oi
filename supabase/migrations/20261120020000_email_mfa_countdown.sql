-- Keep the original deadline when an unexpired code is reused.
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
      return jsonb_build_object('id',prior.challenge_id,'send',false,
        'expires_at',prior.sent_at + interval '5 minutes');
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
  return jsonb_build_object('id',p_id,'send',true,'email',recipient,
    'expires_at',now() + interval '5 minutes');
end;
$$;
