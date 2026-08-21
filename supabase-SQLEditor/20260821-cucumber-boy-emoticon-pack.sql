-- =========================================================
-- 2026-08-21 (KST) 오이소년 이모티콘팩 판매·구매 연동
-- - 서버 고정 가격 391피클로 기존 원자적 구매 함수에 등록한다.
-- - 구매 시 user_emoticons에 10종을 지급하고 즉시 장착 상태로 둔다.
-- - 구매 성공 시 pickle_ledger에 store_purchase 형식으로 -391피클을 기록한다.
-- =========================================================

begin;

do $require_cucumber_boy_emoticon_schema$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_emoticons') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'CUCUMBER_BOY_EMOTICON_STORE_SCHEMA_REQUIRED';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_emoticons'
      and column_name = 'is_equipped'
      and data_type = 'boolean'
  ) then
    raise exception 'USER_EMOTICONS_IS_EQUIPPED_REQUIRED';
  end if;

  if pg_get_function_result(
    'public.purchase_store_item(text)'::regprocedure
  ) <> 'TABLE(success boolean, message text, balance integer)' then
    raise exception 'PURCHASE_STORE_ITEM_RETURN_TYPE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'emo-cucumberboy-01'
      and (
        item_name is distinct from '오이소년 이모티콘팩'
        or item_category is distinct from 'emoticon'
        or purchase_price not in (0, 391)
      )
  ) then
    raise exception 'CUCUMBER_BOY_EMOTICON_ITEM_ID_CONFLICT';
  end if;

  if exists (
    select 1
    from public.user_emoticons
    where emoticon_code like 'cucumberboy-%'
      and item_id is distinct from 'emo-cucumberboy-01'
  ) then
    raise exception 'CUCUMBER_BOY_EMOTICON_CODE_CONFLICT';
  end if;
end;
$require_cucumber_boy_emoticon_schema$;

do $add_cucumber_boy_emoticon_to_purchase_store_item$
declare
  v_function_sql text;
  v_owner_before oid;
  v_owner_after oid;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'emo_cucumbergirl_01' then
    v_price := 380;
    v_name := '오이소녀 이모티콘팩';
    v_category := 'emoticon';

  else
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'emo_cucumbergirl_01' then
    v_price := 380;
    v_name := '오이소녀 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'emo-cucumberboy-01' then
    v_price := 391;
    v_name := '오이소년 이모티콘팩';
    v_category := 'emoticon';

  else
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'emo_cucumbergirl_01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order
    )
    values
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-1', '오이소녀 이모티콘 1', './images/emoticons/emo_cucumbergirl_1.png', 1001),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-2', '오이소녀 이모티콘 2', './images/emoticons/emo_cucumbergirl_2.png', 1002),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-3', '오이소녀 이모티콘 3', './images/emoticons/emo_cucumbergirl_3.png', 1003),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-4', '오이소녀 이모티콘 4', './images/emoticons/emo_cucumbergirl_4.png', 1004),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-5', '오이소녀 이모티콘 5', './images/emoticons/emo_cucumbergirl_5.png', 1005),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-6', '오이소녀 이모티콘 6', './images/emoticons/emo_cucumbergirl_6.png', 1006),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-7', '오이소녀 이모티콘 7', './images/emoticons/emo_cucumbergirl_7.png', 1007),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-8', '오이소녀 이모티콘 8', './images/emoticons/emo_cucumbergirl_8.png', 1008),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-9', '오이소녀 이모티콘 9', './images/emoticons/emo_cucumbergirl_9.png', 1009),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-10', '오이소녀 이모티콘 10', './images/emoticons/emo_cucumbergirl_10.png', 1010)
    on conflict (user_id, emoticon_code) do nothing;
  end if;
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'emo_cucumbergirl_01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order
    )
    values
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-1', '오이소녀 이모티콘 1', './images/emoticons/emo_cucumbergirl_1.png', 1001),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-2', '오이소녀 이모티콘 2', './images/emoticons/emo_cucumbergirl_2.png', 1002),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-3', '오이소녀 이모티콘 3', './images/emoticons/emo_cucumbergirl_3.png', 1003),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-4', '오이소녀 이모티콘 4', './images/emoticons/emo_cucumbergirl_4.png', 1004),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-5', '오이소녀 이모티콘 5', './images/emoticons/emo_cucumbergirl_5.png', 1005),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-6', '오이소녀 이모티콘 6', './images/emoticons/emo_cucumbergirl_6.png', 1006),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-7', '오이소녀 이모티콘 7', './images/emoticons/emo_cucumbergirl_7.png', 1007),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-8', '오이소녀 이모티콘 8', './images/emoticons/emo_cucumbergirl_8.png', 1008),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-9', '오이소녀 이모티콘 9', './images/emoticons/emo_cucumbergirl_9.png', 1009),
      (v_user_id, 'emo_cucumbergirl_01', 'cucumbergirl-10', '오이소녀 이모티콘 10', './images/emoticons/emo_cucumbergirl_10.png', 1010)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'emo-cucumberboy-01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order, is_equipped
    )
    values
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-1', '오이소년 이모티콘 1', './images/emoticons/emo-cucumberboy-01.png', 1101, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-2', '오이소년 이모티콘 2', './images/emoticons/emo-cucumberboy-02.png', 1102, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-3', '오이소년 이모티콘 3', './images/emoticons/emo-cucumberboy-03.png', 1103, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-4', '오이소년 이모티콘 4', './images/emoticons/emo-cucumberboy-04.png', 1104, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-5', '오이소년 이모티콘 5', './images/emoticons/emo-cucumberboy-05.png', 1105, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-6', '오이소년 이모티콘 6', './images/emoticons/emo-cucumberboy-06.png', 1106, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-7', '오이소년 이모티콘 7', './images/emoticons/emo-cucumberboy-07.png', 1107, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-8', '오이소년 이모티콘 8', './images/emoticons/emo-cucumberboy-08.png', 1108, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-9', '오이소년 이모티콘 9', './images/emoticons/emo-cucumberboy-09.png', 1109, true),
      (v_user_id, 'emo-cucumberboy-01', 'cucumberboy-10', '오이소년 이모티콘 10', './images/emoticons/emo-cucumberboy-10.png', 1110, true)
    on conflict (user_id, emoticon_code) do nothing;
  end if;
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'emo_cucumbergirl_01'
        then '오이소녀 이모티콘팩 구매가 완료됐어. 380피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'skin-grilledegg-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'emo_cucumbergirl_01'
        then '오이소녀 이모티콘팩 구매가 완료됐어. 380피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'emo-cucumberboy-01'
        then '오이소년 이모티콘팩 구매가 완료됐어. 391피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'skin-grilledegg-01'
$message_replacement$;
begin
  select pg_get_functiondef(procedure_row.oid), procedure_row.proowner
  into v_function_sql, v_owner_before
  from pg_proc procedure_row
  where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure;

  if position('emo-cucumberboy-01' in v_function_sql) > 0 then
    if position($price_branch$p_item_id = 'emo-cucumberboy-01' then
    v_price := 391;
    v_name := '오이소년 이모티콘팩';
    v_category := 'emoticon';$price_branch$ in v_function_sql) = 0
       or position($inventory_branch$p_item_id = 'emo-cucumberboy-01' then
    insert into public.user_emoticons ($inventory_branch$ in v_function_sql) = 0
       or position($equipped_row$'./images/emoticons/emo-cucumberboy-10.png', 1110, true)$equipped_row$ in v_function_sql) = 0
       or position($message$then '오이소년 이모티콘팩 구매가 완료됐어. 391피클이 차감됐고 바로 사용할 수 있어.'$message$ in v_function_sql) = 0 then
      raise exception 'CUCUMBER_BOY_EMOTICON_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'CUCUMBER_BOY_EMOTICON_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'CUCUMBER_BOY_EMOTICON_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'CUCUMBER_BOY_EMOTICON_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_function_sql := replace(v_function_sql, v_price_anchor, v_price_replacement);
  v_function_sql := replace(
    v_function_sql,
    v_inventory_anchor,
    v_inventory_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_message_anchor,
    v_message_replacement
  );

  execute v_function_sql;

  select procedure_row.proowner
  into v_owner_after
  from pg_proc procedure_row
  where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure;

  if v_owner_after is distinct from v_owner_before then
    raise exception 'CUCUMBER_BOY_EMOTICON_PURCHASE_FUNCTION_OWNER_CHANGED';
  end if;
end;
$add_cucumber_boy_emoticon_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_cucumber_boy_emoticon_purchase_store_item$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($price_branch$p_item_id = 'emo-cucumberboy-01' then
    v_price := 391;
    v_name := '오이소년 이모티콘팩';
    v_category := 'emoticon';$price_branch$ in v_function_sql) = 0
     or position($inventory_branch$p_item_id = 'emo-cucumberboy-01' then
    insert into public.user_emoticons ($inventory_branch$ in v_function_sql) = 0
     or position($first_row$'cucumberboy-1', '오이소년 이모티콘 1', './images/emoticons/emo-cucumberboy-01.png', 1101, true$first_row$ in v_function_sql) = 0
     or position($last_row$'cucumberboy-10', '오이소년 이모티콘 10', './images/emoticons/emo-cucumberboy-10.png', 1110, true$last_row$ in v_function_sql) = 0
     or position($message$then '오이소년 이모티콘팩 구매가 완료됐어. 391피클이 차감됐고 바로 사용할 수 있어.'$message$ in v_function_sql) = 0
     or position('for update' in lower(v_function_sql)) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_function_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_function_sql) = 0
     or position('insert into public.user_store_items' in v_function_sql) = 0
     or position('insert into public.pickle_ledger' in v_function_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_function_sql) = 0
     or position('public.seoul_today()' in v_function_sql) = 0 then
    raise exception 'CUCUMBER_BOY_EMOTICON_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;

  if pg_get_function_result(
       'public.purchase_store_item(text)'::regprocedure
     ) <> 'TABLE(success boolean, message text, balance integer)'
     or has_function_privilege(
       'anon',
       'public.purchase_store_item(text)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.purchase_store_item(text)',
       'execute'
     )
     or exists (
       select 1
       from pg_proc procedure_row
       cross join lateral aclexplode(
         coalesce(
           procedure_row.proacl,
           acldefault('f', procedure_row.proowner)
         )
       ) acl_row
       where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
         and acl_row.grantee = 0
         and acl_row.privilege_type = 'EXECUTE'
     )
     or not (
       select procedure_row.prosecdef
       from pg_proc procedure_row
       where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
     ) then
    raise exception 'CUCUMBER_BOY_EMOTICON_PURCHASE_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_cucumber_boy_emoticon_purchase_store_item$;

commit;

select json_build_object(
  'item_id', 'emo-cucumberboy-01',
  'server_price', 391,
  'item_name', '오이소년 이모티콘팩',
  'item_category', 'emoticon',
  'emoticon_count', 10,
  'initially_equipped', true,
  'ledger_reason_code', 'store_purchase',
  'existing_purchase_count', (
    select count(*)
    from public.user_store_items
    where item_id = 'emo-cucumberboy-01'
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.purchase_store_item(text)',
    'execute'
  ),
  'anon_execute', has_function_privilege(
    'anon',
    'public.purchase_store_item(text)',
    'execute'
  )
) as cucumber_boy_emoticon_purchase_verification;
