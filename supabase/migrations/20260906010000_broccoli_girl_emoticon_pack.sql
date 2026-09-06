-- 2026-09-06 (한국) 브로콜리 알바생 이모티콘팩: 서버 고정 443피클, 10종 즉시 장착, 구매 원장
-- 현재 운영 함수를 부분 갱신해 다른 상품/테스트 계정/관리자 정책은 보존한다.
begin;

do $broccoli_girl_purchase$
declare
  v_sql text;
  v_anchor text;
  v_owner oid;
  v_price_anchor text := $anchor$  elsif p_item_id = 'emo-cucumberboy-01' then
    v_price := 391;
    v_name := '오이소년 이모티콘팩';
    v_category := 'emoticon';$anchor$;
  v_price text := $branch$

  elsif p_item_id = 'emo-broccoli-girl-01' then
    v_price := 443;
    v_name := '브로콜리 알바생 이모티콘팩';
    v_category := 'emoticon';$branch$;
  v_inventory_anchor text := $anchor$  elsif p_item_id = 'emo-cucumberboy-01' then
    insert into public.user_emoticons ($anchor$;
  v_inventory text := $branch$  elsif p_item_id = 'emo-broccoli-girl-01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order, is_equipped
    )
    values
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-1', '브로콜리 알바생 이모티콘 1', './images/emoticons/01-broccoli-girl.png', 1201, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-2', '브로콜리 알바생 이모티콘 2', './images/emoticons/02-broccoli-girl.png', 1202, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-3', '브로콜리 알바생 이모티콘 3', './images/emoticons/03-broccoli-girl.png', 1203, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-4', '브로콜리 알바생 이모티콘 4', './images/emoticons/04-broccoli-girl.png', 1204, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-5', '브로콜리 알바생 이모티콘 5', './images/emoticons/05-broccoli-girl.png', 1205, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-6', '브로콜리 알바생 이모티콘 6', './images/emoticons/06-broccoli-girl.png', 1206, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-7', '브로콜리 알바생 이모티콘 7', './images/emoticons/07-broccoli-girl.png', 1207, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-8', '브로콜리 알바생 이모티콘 8', './images/emoticons/08-broccoli-girl.png', 1208, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-9', '브로콜리 알바생 이모티콘 9', './images/emoticons/09-broccoli-girl.png', 1209, true),
      (v_user_id, 'emo-broccoli-girl-01', 'broccoli-girl-10', '브로콜리 알바생 이모티콘 10', './images/emoticons/10-broccoli-girl.png', 1210, true)
    on conflict (user_id, emoticon_code) do nothing;

$branch$;
  v_message_anchor text := $anchor$      when p_item_id = 'emo-cucumberboy-01'
        then '오이소년 이모티콘팩 구매가 완료됐어. 391피클이 차감됐고 바로 사용할 수 있어.'$anchor$;
  v_message text := $branch$
      when p_item_id = 'emo-broccoli-girl-01'
        then '브로콜리 알바생 이모티콘팩 구매가 완료됐어. 443피클이 차감됐고 바로 사용할 수 있어.'$branch$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_emoticons') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'BROCCOLI_GIRL_PURCHASE_DEPENDENCY_MISSING';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_emoticons'
      and column_name = 'is_equipped' and data_type = 'boolean'
  ) or not exists (
    select 1 from pg_constraint where conrelid = 'public.user_store_items'::regclass
      and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) or not exists (
    select 1 from pg_constraint where conrelid = 'public.user_emoticons'::regclass
      and contype = 'u' and pg_get_constraintdef(oid) = 'UNIQUE (user_id, emoticon_code)'
  ) then
    raise exception 'BROCCOLI_GIRL_INVENTORY_SCHEMA_MISMATCH';
  end if;
  if exists (
    select 1 from public.user_store_items where item_id = 'emo-broccoli-girl-01'
      and (item_name is distinct from '브로콜리 알바생 이모티콘팩'
        or item_category is distinct from 'emoticon' or purchase_price not in (0, 443))
  ) or exists (
    select 1 from public.user_emoticons
    where (emoticon_code like 'broccoli-girl-%' or display_order between 1201 and 1210)
      and item_id is distinct from 'emo-broccoli-girl-01'
  ) then
    raise exception 'BROCCOLI_GIRL_ITEM_CODE_CONFLICT';
  end if;

  select pg_get_functiondef(oid), proowner into v_sql, v_owner
  from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure;
  if position('emo-broccoli-girl-01' in v_sql) = 0 then
    foreach v_anchor in array array[v_price_anchor, v_inventory_anchor, v_message_anchor] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'BROCCOLI_GIRL_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    v_sql := replace(v_sql, v_price_anchor, v_price_anchor || v_price);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory || v_inventory_anchor);
    v_sql := replace(v_sql, v_message_anchor, v_message_anchor || v_message);
    execute v_sql;
  end if;
  if position(v_price in v_sql) = 0 or position(v_inventory in v_sql) = 0
     or position(v_message in v_sql) = 0
     or position('for update' in lower(v_sql)) = 0
     or position('if v_exists then' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_sql) = 0
     or position('public.seoul_today()' in v_sql) = 0 then
    raise exception 'BROCCOLI_GIRL_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef and proowner = v_owner from pg_proc
       where oid = 'public.purchase_store_item(text)'::regprocedure)
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     )) then
    raise exception 'BROCCOLI_GIRL_PURCHASE_SIGNATURE_MISMATCH';
  end if;
end;
$broccoli_girl_purchase$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $broccoli_girl_permissions$
begin
  if has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'BROCCOLI_GIRL_PURCHASE_PERMISSION_MISMATCH';
  end if;
end;
$broccoli_girl_permissions$;

commit;
