-- =========================================================
-- 2026-08-04 거미줄 효과 테스트 계정 무차감 구매 허용
-- - 일반 사용자의 523피클 잔액 검사와 차감은 그대로 유지한다.
-- - store_purchase_test_permissions에 명시적으로 등록된 계정만
--   기존 공통 테스트 구매 흐름을 사용할 수 있게 엄격 제외 목록에서 제거한다.
-- - 불꽃 효과와 다른 엄격 잔액 상품의 정책은 변경하지 않는다.
-- =========================================================

begin;

do $allow_spider_web_test_purchase$
declare
  v_function_sql text;
  v_strict_count integer := 0;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;

  if to_regclass('public.store_purchase_test_permissions') is null then
    raise exception 'STORE_PURCHASE_TEST_PERMISSION_TABLE_REQUIRED';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($web_price$elsif p_item_id = 'cha-effects-web-01' then
    v_price := 523;
    v_name := '거미줄 효과';
    v_category := 'cha-effects';$web_price$ in v_function_sql) = 0 then
    raise exception 'SPIDER_WEB_CHARACTER_EFFECT_PRICE_MAPPING_REQUIRED';
  end if;

  select count(*)
  into v_strict_count
  from regexp_matches(
    v_function_sql,
    $strict_applied$'cha-effects-fire-01',([[:space:]]*)'cha-effects-web-01',([[:space:]]*)'bgm-tetocarrto-02'$strict_applied$,
    'g'
  );

  if v_strict_count = 2 then
    v_function_sql := regexp_replace(
      v_function_sql,
      $strict_applied$'cha-effects-fire-01',([[:space:]]*)'cha-effects-web-01',([[:space:]]*)'bgm-tetocarrto-02'$strict_applied$,
      $strict_replacement$'cha-effects-fire-01',\1'bgm-tetocarrto-02'$strict_replacement$,
      'g'
    );
    execute v_function_sql;
  elsif v_strict_count <> 0 then
    raise exception 'SPIDER_WEB_TEST_PURCHASE_STRICT_LIST_MISMATCH';
  end if;
end;
$allow_spider_web_test_purchase$;

do $verify_spider_web_test_purchase$
declare
  v_function_sql text;
  v_strict_count integer := 0;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  select count(*)
  into v_strict_count
  from regexp_matches(
    v_function_sql,
    $strict_applied$'cha-effects-fire-01',[[:space:]]*'cha-effects-web-01'$strict_applied$,
    'g'
  );

  if v_strict_count <> 0
     or position($test_permission$from public.store_purchase_test_permissions permission$test_permission$ in v_function_sql) = 0
     or position($normal_charge$coalesce(pickles, 0) >= v_price$normal_charge$ in v_function_sql) = 0
     or position($test_ledger$when v_balance_bypass_used then '테스트 상점 구매'$test_ledger$ in v_function_sql) = 0 then
    raise exception 'SPIDER_WEB_TEST_PURCHASE_VERIFY_FAILED';
  end if;

  if has_function_privilege(
       'anon',
       'public.purchase_store_item(text)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.purchase_store_item(text)',
       'execute'
     ) then
    raise exception 'SPIDER_WEB_TEST_PURCHASE_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_spider_web_test_purchase$;

commit;

select json_build_object(
  'web_price_mapping_applied', position(
    $verify$v_price := 523;
    v_name := '거미줄 효과';$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0,
  'web_strict_balance_occurrences', (
    select count(*)
    from regexp_matches(
      pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
      $verify$'cha-effects-fire-01',[[:space:]]*'cha-effects-web-01'$verify$,
      'g'
    )
  ),
  'test_permission_flow_preserved', position(
    $verify$from public.store_purchase_test_permissions permission$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0,
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.purchase_store_item(text)',
    'execute'
  )
) as spider_web_test_purchase_permission_result;
