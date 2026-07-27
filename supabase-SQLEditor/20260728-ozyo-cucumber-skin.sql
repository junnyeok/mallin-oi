-- =========================================================
-- 2026-07-28 오죠 이토루 기본오이 전용 스킨 판매 지원
-- - 요청 상품 ID(skin-cucumber-01)를 오죠 이토루에 배정한다.
-- - 기존 군인오이 구매 기록은 별도 상품 ID로 이전해 보유권을 보존한다.
-- - 서버 고정 가격 775피클, 스킨 지급, 피클 내역 기록을 기존 원자적 RPC에 추가한다.
-- - 오죠 이토루는 테스트 잔액 우회와 관리자 자동충전을 허용하지 않는다.
-- =========================================================

begin;

do $require_ozyo_store_schema$
begin
  if to_regclass('public.user_store_items') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'OZYO_STORE_SCHEMA_REQUIRED';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;
end;
$require_ozyo_store_schema$;

-- 과거 skin-cucumber-01은 군인오이 스킨 ID였다.
-- 이미 새 군인오이 ID가 있는 예외적인 사용자는 중복 행을 제거한 뒤 나머지를 이전한다.
delete from public.user_store_items old_item
where old_item.item_id = 'skin-cucumber-01'
  and old_item.item_name = '군인오이 스킨'
  and exists (
    select 1
    from public.user_store_items soldier_item
    where soldier_item.user_id = old_item.user_id
      and soldier_item.item_id = 'skin-cucumber-soldier-01'
  );

update public.user_store_items
set item_id = 'skin-cucumber-soldier-01'
where item_id = 'skin-cucumber-01'
  and item_name = '군인오이 스킨';

do $add_ozyo_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'skin-cucumber-01' then
    v_price := 389;
    v_name := '군인오이 스킨';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'skin-cucumber-soldier-01' then
    v_price := 389;
    v_name := '군인오이 스킨';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-cucumber-01' then
    v_price := 775;
    v_name := '오죠 이토루';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'skin-cucumber-01' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      'char-cucumber-soldier',
      '군인오이 스킨',
      './images/skins/cucumber-soldier.png',
      2,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'skin-cucumber-soldier-01' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      'char-cucumber-soldier',
      '군인오이 스킨',
      './images/skins/cucumber-soldier.png',
      2,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-cucumber-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      '기본오이',
      './images/characters/cucumber.png',
      './images/characters/cucumber.png',
      1,
      'default_grant'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      'char-cucumber-ozyo',
      '오죠 이토루',
      './images/skins/ozyo.png',
      3,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'skin-cucumber-01'
        then '군인오이 스킨 구매가 완료됐어. 389피클이 차감됐고 스킨 인벤토리에서 착용할 수 있어.'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'skin-cucumber-soldier-01'
        then '군인오이 스킨 구매가 완료됐어. 389피클이 차감됐고 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-cucumber-01'
        then '오죠 이토루 구매가 완료됐어. 775피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
$message_replacement$;
  v_bypass_anchor text := $bypass_anchor$
    v_can_bypass_store_balance :=
      p_item_id <> 'BG-03'
      and exists (
$bypass_anchor$;
  v_bypass_replacement text := $bypass_replacement$
    v_can_bypass_store_balance :=
      p_item_id not in ('BG-03', 'skin-cucumber-01')
      and exists (
$bypass_replacement$;
  v_auto_topup_anchor text := $auto_topup_anchor$
      if coalesce(v_is_auto_topup_admin, false)
         and p_item_id <> 'BG-03' then
$auto_topup_anchor$;
  v_auto_topup_replacement text := $auto_topup_replacement$
      if coalesce(v_is_auto_topup_admin, false)
         and p_item_id not in ('BG-03', 'skin-cucumber-01') then
$auto_topup_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($ozyo_marker$v_name := '오죠 이토루';$ozyo_marker$ in v_function_sql) > 0 then
    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'OZYO_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'OZYO_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'OZYO_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_bypass_anchor in v_function_sql) = 0 then
    raise exception 'OZYO_BALANCE_BYPASS_ANCHOR_NOT_FOUND';
  end if;

  if position(v_auto_topup_anchor in v_function_sql) = 0 then
    raise exception 'OZYO_AUTO_TOPUP_ANCHOR_NOT_FOUND';
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
  v_function_sql := replace(
    v_function_sql,
    v_bypass_anchor,
    v_bypass_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_auto_topup_anchor,
    v_auto_topup_replacement
  );

  execute v_function_sql;
end;
$add_ozyo_to_purchase_store_item$;

do $ensure_ozyo_default_character_grant$
declare
  v_function_sql text;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'skin-cucumber-01' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      'char-cucumber-ozyo',
      '오죠 이토루',
      './images/skins/ozyo.png',
      3,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'skin-cucumber-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      '기본오이',
      './images/characters/cucumber.png',
      './images/characters/cucumber.png',
      1,
      'default_grant'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber',
      'char-cucumber-ozyo',
      '오죠 이토루',
      './images/skins/ozyo.png',
      3,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;
$inventory_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position(
    $parent_grant$'char-cucumber',
      '기본오이',
      './images/characters/cucumber.png',
      './images/characters/cucumber.png',
      1,
      'default_grant'$parent_grant$
    in v_function_sql
  ) > 0 then
    return;
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'OZYO_PARENT_GRANT_ANCHOR_NOT_FOUND';
  end if;

  v_function_sql := replace(
    v_function_sql,
    v_inventory_anchor,
    v_inventory_replacement
  );

  execute v_function_sql;
end;
$ensure_ozyo_default_character_grant$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_ozyo_purchase_store_item$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'skin-cucumber-01'
      and item_name = '군인오이 스킨'
  ) then
    raise exception 'OZYO_OLD_SOLDIER_ITEM_ID_REMAINS';
  end if;

  if position($ozyo_price$elsif p_item_id = 'skin-cucumber-01' then
    v_price := 775;
    v_name := '오죠 이토루';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';$ozyo_price$ in v_function_sql) = 0
     or position($soldier_price$elsif p_item_id = 'skin-cucumber-soldier-01' then
    v_price := 389;
    v_name := '군인오이 스킨';$soldier_price$ in v_function_sql) = 0
     or position($ozyo_inventory$'char-cucumber-ozyo',
      '오죠 이토루',
      './images/skins/ozyo.png',
      3,$ozyo_inventory$ in v_function_sql) = 0
     or position($ozyo_parent_grant$'char-cucumber',
      '기본오이',
      './images/characters/cucumber.png',
      './images/characters/cucumber.png',
      1,
      'default_grant'$ozyo_parent_grant$ in v_function_sql) = 0
     or position($ozyo_message$then '오죠 이토루 구매가 완료됐어. 775피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'$ozyo_message$ in v_function_sql) = 0
     or position($strict_balance$p_item_id not in ('BG-03', 'skin-cucumber-01')
      and exists ($strict_balance$ in v_function_sql) = 0
     or position($strict_auto_topup$and p_item_id not in ('BG-03', 'skin-cucumber-01') then$strict_auto_topup$ in v_function_sql) = 0 then
    raise exception 'OZYO_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;
end;
$verify_ozyo_purchase_store_item$;

commit;

select
  (
    select count(*)
    from public.user_store_items
    where item_id = 'skin-cucumber-soldier-01'
      and item_name = '군인오이 스킨'
  ) as migrated_soldier_purchase_count,
  (
    select count(*)
    from public.user_store_items
    where item_id = 'skin-cucumber-01'
      and item_name = '군인오이 스킨'
  ) as stale_soldier_purchase_count,
  position(
    $verify$v_price := 775;
    v_name := '오죠 이토루';$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0 as ozyo_price_mapping_applied;
