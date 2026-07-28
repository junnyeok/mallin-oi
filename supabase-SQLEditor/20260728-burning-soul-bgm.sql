-- =========================================================
-- 2026-07-28 신규 BGM 「Burning Soul」 상점 구매 지원
-- - 서버 고정 가격 665피클, BGM 인벤토리 지급, 피클 내역 기록을 기존 원자적 구매 함수에 추가한다.
-- - 기존 함수 시그니처·권한·잔액/중복 검증·테스트 구매 정책은 유지한다.
-- =========================================================

begin;

do $validate_burning_soul_item_id$
begin
  if to_regclass('public.user_store_items') is null then
    raise exception 'BURNING_SOUL_USER_STORE_ITEMS_MISSING';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'BURNING_SOUL_PURCHASE_FUNCTION_MISSING';
  end if;

  if exists (
    select 1
    from public.user_store_items item
    where item.item_id = 'bgm-tetocarrto-02'
      and (
        item.item_name is distinct from 'Burning Soul'
        or item.item_category is distinct from 'bgm'
        or coalesce(item.purchase_price, 0) not in (0, 665)
      )
  ) then
    raise exception 'BURNING_SOUL_ITEM_ID_CONFLICT';
  end if;
end;
$validate_burning_soul_item_id$;

do $add_burning_soul_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'bgm-cucumberboy-01' then
    v_price := 621;
    v_name := '늦은 밤 멜로디';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'bgm-cucumberboy-01' then
    v_price := 621;
    v_name := '늦은 밤 멜로디';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-tetocarrto-02' then
    v_price := 665;
    v_name := 'Burning Soul';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'bgm-cucumberboy-01' then
    null;

  elsif p_item_id = 'cha-effects-cucumberheart-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'bgm-cucumberboy-01' then
    null;

  elsif p_item_id = 'bgm-tetocarrto-02' then
    null;

  elsif p_item_id = 'cha-effects-cucumberheart-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'bgm-cucumberboy-01'
        then '늦은 밤 멜로디 구매가 완료됐어. 621피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'cha-effects-cucumberheart-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'bgm-cucumberboy-01'
        then '늦은 밤 멜로디 구매가 완료됐어. 621피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-tetocarrto-02'
        then 'Burning Soul 구매가 완료됐어. 665피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'cha-effects-cucumberheart-01'
$message_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($item_id$p_item_id = 'bgm-tetocarrto-02'$item_id$ in v_function_sql) > 0 then
    if position('v_price := 665;' in v_function_sql) = 0
       or position($item_name$v_name := 'Burning Soul';$item_name$ in v_function_sql) = 0
       or position($category$v_category := 'bgm';$category$ in v_function_sql) = 0 then
      raise exception 'BURNING_SOUL_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'BURNING_SOUL_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'BURNING_SOUL_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'BURNING_SOUL_MESSAGE_ANCHOR_NOT_FOUND';
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

  execute v_function_sql;
end;
$add_burning_soul_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_burning_soul_purchase_store_item$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($price$p_item_id = 'bgm-tetocarrto-02' then
    v_price := 665;
    v_name := 'Burning Soul';
    v_category := 'bgm';$price$ in v_function_sql) = 0
     or position($inventory$elsif p_item_id = 'bgm-tetocarrto-02' then
    null;$inventory$ in v_function_sql) = 0
     or position($message$then 'Burning Soul 구매가 완료됐어. 665피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$ in v_function_sql) = 0
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'BURNING_SOUL_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;
end;
$verify_burning_soul_purchase_store_item$;

commit;

select json_build_object(
  'item_id', 'bgm-tetocarrto-02',
  'server_price', 665,
  'purchase_function_updated', position(
    $verify$p_item_id = 'bgm-tetocarrto-02'$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0,
  'conflicting_owned_rows', (
    select count(*)
    from public.user_store_items item
    where item.item_id = 'bgm-tetocarrto-02'
      and (
        item.item_name is distinct from 'Burning Soul'
        or item.item_category is distinct from 'bgm'
        or coalesce(item.purchase_price, 0) not in (0, 665)
      )
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
) as burning_soul_bgm_result;

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
