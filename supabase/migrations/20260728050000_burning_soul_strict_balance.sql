-- =========================================================
-- 2026-07-28 「Burning Soul」 실잔액 구매 정책 고정
-- - 테스트 잔액 우회와 관리자 자동충전을 허용하지 않고, 실제 보유 피클이 665 이상일 때만 구매한다.
-- - 다른 상품의 기존 테스트 구매 정책은 유지한다.
-- =========================================================

begin;

do $enforce_burning_soul_strict_balance$
declare
  v_function_sql text;
  v_bypass_anchor_pattern text := $regex$'cha-effects-fire-01'([[:space:]]*)\)([[:space:]]*)and exists$regex$;
  v_bypass_strict_pattern text := $regex$'cha-effects-fire-01',[[:space:]]*'bgm-tetocarrto-02'[[:space:]]*\)[[:space:]]*and exists$regex$;
  v_bypass_replacement text := $replacement$'cha-effects-fire-01',\1'bgm-tetocarrto-02'\1)\2and exists$replacement$;
  v_topup_anchor_pattern text := $regex$'cha-effects-fire-01'([[:space:]]*)\)([[:space:]]*)then([[:space:]]*)perform public\.ensure_user_pickles$regex$;
  v_topup_strict_pattern text := $regex$'cha-effects-fire-01',[[:space:]]*'bgm-tetocarrto-02'[[:space:]]*\)[[:space:]]*then[[:space:]]*perform public\.ensure_user_pickles$regex$;
  v_topup_replacement text := $replacement$'cha-effects-fire-01',\1'bgm-tetocarrto-02'\1)\2then\3perform public.ensure_user_pickles$replacement$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'BURNING_SOUL_PURCHASE_FUNCTION_MISSING';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($item_id$p_item_id = 'bgm-tetocarrto-02'$item_id$ in v_function_sql) = 0 then
    raise exception 'BURNING_SOUL_PURCHASE_BRANCH_MISSING';
  end if;

  if v_function_sql ~ v_bypass_strict_pattern
     and v_function_sql ~ v_topup_strict_pattern then
    return;
  end if;

  if v_function_sql ~ v_bypass_strict_pattern
     or v_function_sql ~ v_topup_strict_pattern then
    raise exception 'BURNING_SOUL_STRICT_BALANCE_PARTIAL_STATE';
  end if;

  if v_function_sql !~ v_bypass_anchor_pattern then
    raise exception 'BURNING_SOUL_TEST_BYPASS_ANCHOR_NOT_FOUND';
  end if;

  if v_function_sql !~ v_topup_anchor_pattern then
    raise exception 'BURNING_SOUL_AUTO_TOPUP_ANCHOR_NOT_FOUND';
  end if;

  v_function_sql := regexp_replace(
    v_function_sql,
    v_bypass_anchor_pattern,
    v_bypass_replacement
  );
  v_function_sql := regexp_replace(
    v_function_sql,
    v_topup_anchor_pattern,
    v_topup_replacement
  );

  execute v_function_sql;
end;
$enforce_burning_soul_strict_balance$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_burning_soul_strict_balance$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if v_function_sql !~ $regex$'cha-effects-fire-01',[[:space:]]*'bgm-tetocarrto-02'[[:space:]]*\)[[:space:]]*and exists$regex$
     or v_function_sql !~ $regex$'cha-effects-fire-01',[[:space:]]*'bgm-tetocarrto-02'[[:space:]]*\)[[:space:]]*then[[:space:]]*perform public\.ensure_user_pickles$regex$
     or position($deduct$set pickles = coalesce(pickles, 0) - v_price$deduct$ in v_function_sql) = 0
     or position($balance$and coalesce(pickles, 0) >= v_price$balance$ in v_function_sql) = 0 then
    raise exception 'BURNING_SOUL_STRICT_BALANCE_VERIFY_FAILED';
  end if;
end;
$verify_burning_soul_strict_balance$;

commit;

select json_build_object(
  'item_id', 'bgm-tetocarrto-02',
  'required_balance', 665,
  'test_balance_bypass_disabled', true,
  'admin_auto_topup_disabled', true
) as burning_soul_strict_balance_result;
