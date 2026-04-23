-- 건의사항 및 QnA 페이지 관련 쿼리 작업 목록
begin;

create extension if not exists pgcrypto schema extensions;

create or replace function public.normalize_secret_password(p_value text)
returns text
language sql
immutable
as $$
  select trim(coalesce(p_value, ''));
$$;

create or replace function public.sha256_hex(p_value text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(coalesce(p_value, ''), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

-- =========================================
-- 건의사항: 목록 조회 (수정 불가이므로 can_edit=false 고정)
-- =========================================
create or replace function public.list_suggestion_threads()
returns table (
  id bigint,
  body text,
  author_id uuid,
  author_nickname text,
  created_at timestamptz,
  is_secret boolean,
  is_mine boolean,
  can_edit boolean,
  can_delete boolean,
  can_view_full boolean
)
language sql
security definer
set search_path = public
as $$
  select
    s.id,
    case
      when s.is_secret and not public.is_admin_user(auth.uid()) then null
      else s.body
    end as body,
    s.author_id,
    s.author_nickname,
    s.created_at,
    s.is_secret,
    (auth.uid() = s.author_id) as is_mine,
    false as can_edit,
    (
      auth.uid() = s.author_id
      or public.is_admin_user(auth.uid())
    ) as can_delete,
    (
      not s.is_secret
      or public.is_admin_user(auth.uid())
    ) as can_view_full
  from public.suggestions s
  order by s.created_at desc, s.id desc;
$$;

grant execute on function public.list_suggestion_threads() to anon, authenticated;

-- =========================================
-- 건의사항: 관리자 답변 목록 조회 (누락 함수 추가)
-- =========================================
drop function if exists public.list_suggestion_replies(bigint[]);

create or replace function public.list_suggestion_replies(
  p_thread_ids bigint[]
)
returns table (
  id bigint,
  thread_id bigint,
  body text,
  author_id uuid,
  author_nickname text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.suggestion_id as thread_id,
    c.body,
    c.author_id,
    c.author_nickname,
    c.created_at
  from public.suggestion_admin_comments c
  where c.suggestion_id = any(coalesce(p_thread_ids, '{}'::bigint[]))
  order by c.created_at asc, c.id asc;
$$;

grant execute on function public.list_suggestion_replies(bigint[]) to anon, authenticated;

-- =========================================
-- 건의사항: 등록
-- =========================================
create or replace function public.create_suggestion_thread(
  p_body text,
  p_is_secret boolean default false,
  p_secret_password text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := '익명';
  v_id bigint;
  v_password text := public.normalize_secret_password(p_secret_password);
begin
  if v_user_id is null then
    raise exception '로그인이 필요해.';
  end if;

  if char_length(trim(coalesce(p_body, ''))) < 1 then
    raise exception '내용을 입력해줘.';
  end if;

  if char_length(coalesce(p_body, '')) > 1000 then
    raise exception '1000자 이하만 가능해.';
  end if;

  if coalesce(p_is_secret, false) and nullif(v_password, '') is null then
    raise exception '비밀글 비밀번호를 입력해줘.';
  end if;

  select coalesce(nullif(trim(nickname), ''), '익명')
    into v_nickname
  from public.profiles
  where id = v_user_id;

  insert into public.suggestions (
    body,
    author_id,
    author_nickname,
    is_secret,
    secret_password_hash
  )
  values (
    trim(p_body),
    v_user_id,
    v_nickname,
    coalesce(p_is_secret, false),
    case
      when coalesce(p_is_secret, false)
        then public.sha256_hex(v_password)
      else null
    end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_suggestion_thread(text, boolean, text) to authenticated;

-- =========================================
-- 건의사항: 비밀글 열기
-- =========================================
create or replace function public.unlock_suggestion_thread(
  p_thread_id bigint,
  p_secret_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.suggestions%rowtype;
  v_password text := public.normalize_secret_password(p_secret_password);
  v_ok boolean := false;
begin
  select *
    into v_row
  from public.suggestions
  where id = p_thread_id;

  if not found then
    return jsonb_build_object('success', false, 'message', '글이 없어.');
  end if;

  if public.is_admin_user(v_uid) then
    v_ok := true;
  elsif v_uid = v_row.author_id then
    v_ok := (
      v_row.secret_password_hash = public.sha256_hex(v_password)
    );
  else
    return jsonb_build_object('success', false, 'message', '권한이 없어.');
  end if;

  if not v_ok then
    return jsonb_build_object('success', false, 'message', '비밀번호가 일치하지 않아.');
  end if;

  return jsonb_build_object(
    'success', true,
    'body', v_row.body,
    'replies',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'thread_id', c.suggestion_id,
            'body', c.body,
            'author_id', c.author_id,
            'author_nickname', c.author_nickname,
            'created_at', c.created_at
          )
          order by c.created_at asc, c.id asc
        )
        from public.suggestion_admin_comments c
        where c.suggestion_id = v_row.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.unlock_suggestion_thread(bigint, text) to authenticated;

-- =========================================
-- 건의사항: 관리자 답변 등록 (누락 함수 추가)
-- =========================================
drop function if exists public.create_suggestion_reply(bigint, text);

create or replace function public.create_suggestion_reply(
  p_thread_id bigint,
  p_body text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_nickname text := '관리자';
  v_id bigint;
begin
  if v_uid is null then
    raise exception '로그인이 필요해.';
  end if;

  if not public.is_admin_user(v_uid) then
    raise exception '관리자만 답변 가능해.';
  end if;

  if char_length(trim(coalesce(p_body, ''))) < 1 then
    raise exception '답변 내용을 입력해줘.';
  end if;

  if char_length(coalesce(p_body, '')) > 500 then
    raise exception '답변은 500자 이하로 입력해줘.';
  end if;

  select coalesce(nullif(trim(nickname), ''), '관리자')
    into v_nickname
  from public.profiles
  where id = v_uid;

  insert into public.suggestion_admin_comments (
    suggestion_id,
    body,
    author_id,
    author_nickname
  )
  values (
    p_thread_id,
    trim(p_body),
    v_uid,
    v_nickname
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_suggestion_reply(bigint, text) to authenticated;

-- =========================================
-- 건의사항: 질문 삭제 (누락 함수 추가)
-- =========================================
drop function if exists public.delete_suggestion_thread(bigint);

create or replace function public.delete_suggestion_thread(
  p_thread_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author_id uuid;
begin
  if v_uid is null then
    raise exception '로그인이 필요해.';
  end if;

  select author_id
    into v_author_id
  from public.suggestions
  where id = p_thread_id;

  if v_author_id is null then
    raise exception '글이 없어.';
  end if;

  if v_uid <> v_author_id and not public.is_admin_user(v_uid) then
    raise exception '삭제 권한이 없어.';
  end if;

  delete from public.suggestions
  where id = p_thread_id;

  return true;
end;
$$;

grant execute on function public.delete_suggestion_thread(bigint) to authenticated;

-- =========================================
-- 건의사항: 관리자 답변 삭제 (누락 함수 추가)
-- =========================================
drop function if exists public.delete_suggestion_reply(bigint);

create or replace function public.delete_suggestion_reply(
  p_reply_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception '로그인이 필요해.';
  end if;

  if not public.is_admin_user(v_uid) then
    raise exception '관리자만 삭제 가능해.';
  end if;

  delete from public.suggestion_admin_comments
  where id = p_reply_id;

  return true;
end;
$$;

grant execute on function public.delete_suggestion_reply(bigint) to authenticated;

-- =========================================
-- Q&A: 목록 조회 (수정 불가이므로 can_edit=false 고정)
-- =========================================
create or replace function public.list_qna_threads()
returns table (
  id bigint,
  body text,
  author_id uuid,
  author_nickname text,
  created_at timestamptz,
  is_secret boolean,
  is_mine boolean,
  can_edit boolean,
  can_delete boolean,
  can_view_full boolean
)
language sql
security definer
set search_path = public
as $$
  select
    q.id,
    case
      when q.is_secret and not public.is_admin_user(auth.uid()) then null
      else q.body
    end as body,
    q.author_id,
    q.author_nickname,
    q.created_at,
    q.is_secret,
    (auth.uid() = q.author_id) as is_mine,
    false as can_edit,
    (
      auth.uid() = q.author_id
      or public.is_admin_user(auth.uid())
    ) as can_delete,
    (
      not q.is_secret
      or public.is_admin_user(auth.uid())
    ) as can_view_full
  from public.qna_threads q
  order by q.created_at desc, q.id desc;
$$;

grant execute on function public.list_qna_threads() to anon, authenticated;

-- =========================================
-- Q&A: 비밀 질문 등록
-- =========================================
create or replace function public.create_qna_thread(
  p_body text,
  p_is_secret boolean default false,
  p_secret_password text default ''
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nickname text := '익명';
  v_id bigint;
  v_password text := public.normalize_secret_password(p_secret_password);
begin
  if v_user_id is null then
    raise exception '로그인이 필요해.';
  end if;

  if char_length(trim(coalesce(p_body, ''))) < 1 then
    raise exception '내용을 입력해줘.';
  end if;

  if char_length(coalesce(p_body, '')) > 1000 then
    raise exception '1000자 이하만 가능해.';
  end if;

  if coalesce(p_is_secret, false) and nullif(v_password, '') is null then
    raise exception '비밀글 비밀번호를 입력해줘.';
  end if;

  select coalesce(nullif(trim(nickname), ''), '익명')
    into v_nickname
  from public.profiles
  where id = v_user_id;

  insert into public.qna_threads (
    body,
    author_id,
    author_nickname,
    is_secret,
    secret_password_hash
  )
  values (
    trim(p_body),
    v_user_id,
    v_nickname,
    coalesce(p_is_secret, false),
    case
      when coalesce(p_is_secret, false)
        then public.sha256_hex(v_password)
      else null
    end
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.create_qna_thread(text, boolean, text) to authenticated;

-- =========================================
-- Q&A: 비밀 질문 열기
-- =========================================
create or replace function public.unlock_qna_thread(
  p_thread_id bigint,
  p_secret_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.qna_threads%rowtype;
  v_password text := public.normalize_secret_password(p_secret_password);
  v_ok boolean := false;
begin
  select *
    into v_row
  from public.qna_threads
  where id = p_thread_id;

  if not found then
    return jsonb_build_object('success', false, 'message', '글이 없어.');
  end if;

  if public.is_admin_user(v_uid) then
    v_ok := true;
  elsif v_uid = v_row.author_id then
    v_ok := (
      v_row.secret_password_hash = public.sha256_hex(v_password)
    );
  else
    return jsonb_build_object('success', false, 'message', '권한이 없어.');
  end if;

  if not v_ok then
    return jsonb_build_object('success', false, 'message', '비밀번호가 일치하지 않아.');
  end if;

  return jsonb_build_object(
    'success', true,
    'body', v_row.body,
    'replies',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', c.id,
            'thread_id', c.thread_id,
            'body', c.body,
            'author_id', c.author_id,
            'author_nickname', c.author_nickname,
            'created_at', c.created_at
          )
          order by c.created_at asc, c.id asc
        )
        from public.qna_admin_comments c
        where c.thread_id = v_row.id
      ),
      '[]'::jsonb
    )
  );
end;
$$;

grant execute on function public.unlock_qna_thread(bigint, text) to authenticated;

-- =========================================
-- 수정 기능 제거
-- =========================================
drop function if exists public.update_qna_thread(bigint, text);
drop function if exists public.update_suggestion_thread(bigint, text);

commit;