-- =========================================================
-- 2026-08-12 (KST) BG-05 오이소녀의 스테이지 프로필배경 판매·구매 연동
-- - 서버 고정 가격 626피클로 기존 원자적 구매 함수에 등록한다.
-- - user_store_items 보유 기록을 프로필배경 인벤토리 지급 정보로 사용한다.
-- - 구매 성공 시 기존 store_purchase 형식으로 pickle_ledger에 -626피클을 기록한다.
-- - BG-05는 테스트 잔액 우회와 관리자 자동충전을 허용하지 않는다.
-- - 동일 ID의 다른 상품 구매 기록이 있으면 충돌로 중단한다.
-- =========================================================

begin;

do $require_cucumber_girl_stage_background_schema$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'BG05_STORE_SCHEMA_REQUIRED';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;

  if pg_get_function_result(
    'public.purchase_store_item(text)'::regprocedure
  ) <> 'TABLE(success boolean, message text, balance integer)' then
    raise exception 'PURCHASE_STORE_ITEM_RETURN_TYPE_MISMATCH';
  end if;

  raise notice 'purchase_store_item(text) owner=%, authenticated=%, anon=%',
    (
      select pg_get_userbyid(procedure_row.proowner)
      from pg_proc procedure_row
      where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
    ),
    has_function_privilege(
      'authenticated',
      'public.purchase_store_item(text)',
      'execute'
    ),
    has_function_privilege(
      'anon',
      'public.purchase_store_item(text)',
      'execute'
    );

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'BG-05'
      and (
        item_name is distinct from '오이소녀의 스테이지'
        or item_category is distinct from 'profile'
        or purchase_price is distinct from 626
      )
  ) then
    raise exception 'BG05_ITEM_ID_CONFLICT';
  end if;
end;
$require_cucumber_girl_stage_background_schema$;

do $add_cucumber_girl_stage_background_to_purchase_store_item$
declare
  v_function_sql text;
  v_owner_before oid;
  v_owner_after oid;
  v_bg05_count integer;
  v_strict_anchor_count integer;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'BG-04' then
    v_price := 593;
    v_name := '기동인의 행정당직 프로필배경';
    v_category := 'profile';

  elsif p_item_id = 'skin-cucumbergirl-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'BG-04' then
    v_price := 593;
    v_name := '기동인의 행정당직 프로필배경';
    v_category := 'profile';

  elsif p_item_id = 'BG-05' then
    v_price := 626;
    v_name := '오이소녀의 스테이지';
    v_category := 'profile';

  elsif p_item_id = 'skin-cucumbergirl-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'BG-04' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'emo-eat-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'BG-04' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BG-05' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'emo-eat-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'BG-04'
        then '기동인의 행정당직 프로필배경 구매가 완료됐어. 593피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'emo-eat-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'BG-04'
        then '기동인의 행정당직 프로필배경 구매가 완료됐어. 593피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BG-05'
        then '오이소녀의 스테이지 구매가 완료됐어. 626피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'emo-eat-01'
$message_replacement$;
  v_strict_anchor text := $strict_anchor$'BG-03',
        'BG-04',
        'skin-cucumber-03'$strict_anchor$;
  v_strict_replacement text := $strict_replacement$'BG-03',
        'BG-04',
        'BG-05',
        'skin-cucumber-03'$strict_replacement$;
begin
  select pg_get_functiondef(procedure_row.oid), procedure_row.proowner
  into v_function_sql, v_owner_before
  from pg_proc procedure_row
  where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure;

  v_bg05_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'BG-05', ''))
  ) / length('BG-05');

  if v_bg05_count > 0 then
    if v_bg05_count <> 5
       or position($price_branch$p_item_id = 'BG-05' then
    v_price := 626;
    v_name := '오이소녀의 스테이지';
    v_category := 'profile';$price_branch$ in v_function_sql) = 0
       or position($inventory_branch$p_item_id = 'BG-05' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory_branch$ in v_function_sql) = 0
       or position($message$then '오이소녀의 스테이지 구매가 완료됐어. 626피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0
       or (
         length(v_function_sql) - length(
           replace(v_function_sql, v_strict_replacement, '')
         )
       ) / length(v_strict_replacement) <> 2 then
      raise exception 'BG05_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'BG05_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'BG05_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'BG05_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_strict_anchor_count := (
    length(v_function_sql) - length(replace(v_function_sql, v_strict_anchor, ''))
  ) / length(v_strict_anchor);

  if v_strict_anchor_count <> 2 then
    raise exception 'BG05_STRICT_BALANCE_ANCHOR_COUNT_INVALID: %',
      v_strict_anchor_count;
  end if;

  v_function_sql := replace(
    v_function_sql,
    v_price_anchor,
    v_price_replacement
  );
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
  v_function_sql := replace(
    v_function_sql,
    v_strict_anchor,
    v_strict_replacement
  );

  execute v_function_sql;

  select procedure_row.proowner
  into v_owner_after
  from pg_proc procedure_row
  where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure;

  if v_owner_after is distinct from v_owner_before then
    raise exception 'BG05_PURCHASE_FUNCTION_OWNER_CHANGED';
  end if;
end;
$add_cucumber_girl_stage_background_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_cucumber_girl_stage_background_purchase_store_item$
declare
  v_function_sql text;
  v_bg05_count integer;
  v_strict_pattern text := $strict_pattern$'BG-03',
        'BG-04',
        'BG-05',
        'skin-cucumber-03'$strict_pattern$;
  v_strict_count integer;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_bg05_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'BG-05', ''))
  ) / length('BG-05');
  v_strict_count := (
    length(v_function_sql) - length(replace(v_function_sql, v_strict_pattern, ''))
  ) / length(v_strict_pattern);

  if v_bg05_count <> 5
     or v_strict_count <> 2
     or position($price_branch$p_item_id = 'BG-05' then
    v_price := 626;
    v_name := '오이소녀의 스테이지';
    v_category := 'profile';$price_branch$ in v_function_sql) = 0
     or position($inventory_branch$p_item_id = 'BG-05' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory_branch$ in v_function_sql) = 0
     or position($message$then '오이소녀의 스테이지 구매가 완료됐어. 626피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0
     or position('for update' in lower(v_function_sql)) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_function_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_function_sql) = 0
     or position('insert into public.user_store_items' in v_function_sql) = 0
     or position('insert into public.pickle_ledger' in v_function_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_function_sql) = 0
     or position('public.seoul_today()' in v_function_sql) = 0 then
    raise exception 'BG05_PURCHASE_FUNCTION_VERIFY_FAILED';
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
    raise exception 'BG05_PURCHASE_FUNCTION_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_cucumber_girl_stage_background_purchase_store_item$;

commit;

select json_build_object(
  'item_id', 'BG-05',
  'server_price', 626,
  'item_name', '오이소녀의 스테이지',
  'item_category', 'profile',
  'inventory_source', 'public.user_store_items',
  'ledger_reason_code', 'store_purchase',
  'purchase_branch_count', (
    length(pg_get_functiondef('public.purchase_store_item(text)'::regprocedure))
      - length(replace(
        pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
        'BG-05',
        ''
      ))
  ) / length('BG-05'),
  'existing_purchase_count', (
    select count(*)
    from public.user_store_items
    where item_id = 'BG-05'
  ),
  'function_owner', (
    select pg_get_userbyid(procedure_row.proowner)
    from pg_proc procedure_row
    where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
  ),
  'function_result', pg_get_function_result(
    'public.purchase_store_item(text)'::regprocedure
  ),
  'anon_execute', has_function_privilege(
    'anon',
    'public.purchase_store_item(text)',
    'execute'
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.purchase_store_item(text)',
    'execute'
  )
) as cucumber_girl_stage_background_result;
