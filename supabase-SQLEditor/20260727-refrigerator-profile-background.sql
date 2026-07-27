-- =========================================================
-- 2026-07-27 BG-03 냉장고 프로필배경 판매·구매 연동
-- - 서버 고정 가격 588피클로 기존 원자적 구매 함수에 등록한다.
-- - user_store_items 보유 기록을 프로필배경 인벤토리 지급 정보로 사용한다.
-- - BG-03은 테스트 잔액 우회와 관리자 자동충전을 허용하지 않아 잔액 부족 시 실패한다.
-- - PC·모바일 이미지 경로와 itemType은 기존 구조대로 프런트 카탈로그에서 관리한다.
-- =========================================================

begin;

do $add_refrigerator_background_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'BG-02' then
    v_price := 382;
    v_name := '야간 순찰 배경';
    v_category := 'profile';

  elsif p_item_id = 'skin-cucumbergirl-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'BG-02' then
    v_price := 382;
    v_name := '야간 순찰 배경';
    v_category := 'profile';

  elsif p_item_id = 'BG-03' then
    v_price := 588;
    v_name := '냉장고 프로필배경';
    v_category := 'profile';

  elsif p_item_id = 'skin-cucumbergirl-01' then
$price_replacement$;
  v_bypass_anchor text := $bypass_anchor$
    v_can_bypass_store_balance := exists (
      select 1
      from public.store_purchase_test_permissions permission
      where permission.user_id = v_user_id
        and permission.can_bypass_store_balance = true
    );
$bypass_anchor$;
  v_bypass_replacement text := $bypass_replacement$
    v_can_bypass_store_balance :=
      p_item_id <> 'BG-03'
      and exists (
        select 1
        from public.store_purchase_test_permissions permission
        where permission.user_id = v_user_id
          and permission.can_bypass_store_balance = true
      );
$bypass_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'BG-02' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'emo-eat-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'BG-02' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BG-03' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'emo-eat-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'BG-02'
        then '야간 순찰 배경 구매가 완료됐어. 382피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'emo-eat-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'BG-02'
        then '야간 순찰 배경 구매가 완료됐어. 382피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BG-03'
        then '냉장고 프로필배경 구매가 완료됐어. 588피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'emo-eat-01'
$message_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($item_id$p_item_id = 'BG-03'$item_id$ in v_function_sql) > 0 then
    if position($price_branch$elsif p_item_id = 'BG-03' then
    v_price := 588;
    v_name := '냉장고 프로필배경';
    v_category := 'profile';$price_branch$ in v_function_sql) = 0
       or position($inventory_branch$elsif p_item_id = 'BG-03' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory_branch$ in v_function_sql) = 0
       or position($message$then '냉장고 프로필배경 구매가 완료됐어. 588피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0
       or position($strict_charge$p_item_id <> 'BG-03'
      and exists ($strict_charge$ in v_function_sql) = 0 then
      raise exception 'BG03_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'BG03_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_bypass_anchor in v_function_sql) = 0 then
    raise exception 'BG03_BALANCE_BYPASS_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'BG03_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'BG03_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_function_sql := replace(v_function_sql, v_price_anchor, v_price_replacement);
  v_function_sql := replace(v_function_sql, v_bypass_anchor, v_bypass_replacement);
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
$add_refrigerator_background_to_purchase_store_item$;

do $disable_refrigerator_background_auto_topup$
declare
  v_function_sql text;
  v_auto_topup_anchor text := $auto_topup_anchor$
      if coalesce(v_is_auto_topup_admin, false) then
$auto_topup_anchor$;
  v_auto_topup_replacement text := $auto_topup_replacement$
      if coalesce(v_is_auto_topup_admin, false)
         and p_item_id <> 'BG-03' then
$auto_topup_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position(v_auto_topup_replacement in v_function_sql) > 0 then
    return;
  end if;

  if position(v_auto_topup_anchor in v_function_sql) = 0 then
    raise exception 'BG03_AUTO_TOPUP_ANCHOR_NOT_FOUND';
  end if;

  v_function_sql := replace(
    v_function_sql,
    v_auto_topup_anchor,
    v_auto_topup_replacement
  );

  execute v_function_sql;
end;
$disable_refrigerator_background_auto_topup$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_refrigerator_background_purchase_store_item$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($price_branch$elsif p_item_id = 'BG-03' then
    v_price := 588;
    v_name := '냉장고 프로필배경';
    v_category := 'profile';$price_branch$ in v_function_sql) = 0
     or position($inventory_branch$elsif p_item_id = 'BG-03' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory_branch$ in v_function_sql) = 0
     or position($message$then '냉장고 프로필배경 구매가 완료됐어. 588피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0
     or position($strict_charge$p_item_id <> 'BG-03'
      and exists ($strict_charge$ in v_function_sql) = 0
     or position($strict_auto_topup$if coalesce(v_is_auto_topup_admin, false)
         and p_item_id <> 'BG-03' then$strict_auto_topup$ in v_function_sql) = 0 then
    raise exception 'BG03_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;
end;
$verify_refrigerator_background_purchase_store_item$;

commit;
