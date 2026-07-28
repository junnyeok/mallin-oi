-- =========================================================
-- 2026-07-28 BG-04 기동인의 행정당직 프로필배경 판매·구매 연동
-- - 서버 고정 가격 593피클로 기존 원자적 구매 함수에 등록한다.
-- - user_store_items 보유 기록을 프로필배경 인벤토리 지급 정보로 사용한다.
-- - 구매 성공 시 기존 store_purchase 형식으로 pickle_ledger에 -593피클을 기록한다.
-- - BG-04는 테스트 잔액 우회와 관리자 자동충전을 허용하지 않는다.
-- - 동일 ID의 다른 상품 구매 기록이 있으면 충돌로 중단한다.
-- =========================================================

begin;

do $require_changsin_background_schema$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'BG04_STORE_SCHEMA_REQUIRED';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;

  raise notice 'purchase_store_item(text) permissions before update: authenticated=%, anon=%',
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
    where item_id = 'BG-04'
      and coalesce(item_name, '') <> '기동인의 행정당직 프로필배경'
  ) then
    raise exception 'BG04_ITEM_ID_CONFLICT';
  end if;
end;
$require_changsin_background_schema$;

do $add_changsin_background_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'BG-03' then
    v_price := 588;
    v_name := '냉장고 프로필배경';
    v_category := 'profile';

  elsif p_item_id = 'skin-cucumbergirl-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'BG-03' then
    v_price := 588;
    v_name := '냉장고 프로필배경';
    v_category := 'profile';

  elsif p_item_id = 'BG-04' then
    v_price := 593;
    v_name := '기동인의 행정당직 프로필배경';
    v_category := 'profile';

  elsif p_item_id = 'skin-cucumbergirl-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'BG-03' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'emo-eat-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'BG-03' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BG-04' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'emo-eat-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'BG-03'
        then '냉장고 프로필배경 구매가 완료됐어. 588피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'emo-eat-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'BG-03'
        then '냉장고 프로필배경 구매가 완료됐어. 588피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BG-04'
        then '기동인의 행정당직 프로필배경 구매가 완료됐어. 593피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'emo-eat-01'
$message_replacement$;
  v_strict_anchor text := $strict_anchor$p_item_id not in ('BG-03', 'skin-cucumber-01')$strict_anchor$;
  v_strict_replacement text := $strict_replacement$p_item_id not in ('BG-03', 'BG-04', 'skin-cucumber-01')$strict_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($price_branch$elsif p_item_id = 'BG-04' then
    v_price := 593;
    v_name := '기동인의 행정당직 프로필배경';
    v_category := 'profile';$price_branch$ in v_function_sql) = 0 then
    if v_function_sql ~ $price_conflict$elsif p_item_id = 'BG-04' then[[:space:]]+v_price :=$price_conflict$ then
      raise exception 'BG04_EXISTING_PRICE_BRANCH_MISMATCH';
    end if;

    if position(v_price_anchor in v_function_sql) = 0 then
      raise exception 'BG04_PRICE_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(v_function_sql, v_price_anchor, v_price_replacement);
  end if;

  if position($inventory_branch$elsif p_item_id = 'BG-04' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory_branch$ in v_function_sql) = 0 then
    if position(v_inventory_anchor in v_function_sql) = 0 then
      raise exception 'BG04_INVENTORY_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(
      v_function_sql,
      v_inventory_anchor,
      v_inventory_replacement
    );
  end if;

  if position($message$then '기동인의 행정당직 프로필배경 구매가 완료됐어. 593피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0 then
    if v_function_sql ~ $message_conflict$when p_item_id = 'BG-04'[[:space:]]+then$message_conflict$ then
      raise exception 'BG04_EXISTING_MESSAGE_MISMATCH';
    end if;

    if position(v_message_anchor in v_function_sql) = 0 then
      raise exception 'BG04_MESSAGE_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(
      v_function_sql,
      v_message_anchor,
      v_message_replacement
    );
  end if;

  if position(v_strict_replacement in v_function_sql) = 0 then
    if position(v_strict_anchor in v_function_sql) = 0 then
      raise exception 'BG04_STRICT_BALANCE_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(
      v_function_sql,
      v_strict_anchor,
      v_strict_replacement
    );
  end if;

  execute v_function_sql;
end;
$add_changsin_background_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_changsin_background_purchase_store_item$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($price_branch$elsif p_item_id = 'BG-04' then
    v_price := 593;
    v_name := '기동인의 행정당직 프로필배경';
    v_category := 'profile';$price_branch$ in v_function_sql) = 0
     or position($inventory_branch$elsif p_item_id = 'BG-04' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory_branch$ in v_function_sql) = 0
     or position($message$then '기동인의 행정당직 프로필배경 구매가 완료됐어. 593피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0
     or position($strict_balance$p_item_id not in ('BG-03', 'BG-04', 'skin-cucumber-01')
      and exists ($strict_balance$ in v_function_sql) = 0
     or position($strict_auto_topup$and p_item_id not in ('BG-03', 'BG-04', 'skin-cucumber-01') then$strict_auto_topup$ in v_function_sql) = 0 then
    raise exception 'BG04_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;
end;
$verify_changsin_background_purchase_store_item$;

commit;

select
  (
    select count(*)
    from public.user_store_items
    where item_id = 'BG-04'
  ) as existing_bg04_purchase_count,
  position(
    $verify$v_price := 593;
    v_name := '기동인의 행정당직 프로필배경';$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0 as bg04_price_mapping_applied,
  position(
    $verify$p_item_id not in ('BG-03', 'BG-04', 'skin-cucumber-01')$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0 as bg04_strict_balance_applied;
