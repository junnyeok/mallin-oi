-- =========================================================
-- 2026-07-26 신규 BGM 「늦은 밤 멜로디」 상점 구매 지원
-- - 서버 고정 가격 621피클, BGM 인벤토리 지급, 피클 내역 기록을 기존 원자적 구매 함수에 추가한다.
-- - 기존 함수 시그니처·권한·잔액/중복 검증·테스트 구매 정책은 유지한다.
-- =========================================================

begin;

do $add_night_melody_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'bgm-brocolli-01' then
    v_price := 573;
    v_name := 'you’re fake';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'bgm-brocolli-01' then
    v_price := 573;
    v_name := 'you’re fake';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-cucumberboy-01' then
    v_price := 621;
    v_name := '늦은 밤 멜로디';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'bgm-brocolli-01' then
    null;

  elsif p_item_id = 'cha-effects-cucumberheart-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'bgm-brocolli-01' then
    null;

  elsif p_item_id = 'bgm-cucumberboy-01' then
    null;

  elsif p_item_id = 'cha-effects-cucumberheart-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'bgm-brocolli-01'
        then 'you’re fake 구매가 완료됐어. 573피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'cha-effects-cucumberheart-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'bgm-brocolli-01'
        then 'you’re fake 구매가 완료됐어. 573피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-cucumberboy-01'
        then '늦은 밤 멜로디 구매가 완료됐어. 621피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'cha-effects-cucumberheart-01'
$message_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($item_id$p_item_id = 'bgm-cucumberboy-01'$item_id$ in v_function_sql) > 0 then
    if position('v_price := 621;' in v_function_sql) = 0
       or position($item_name$v_name := '늦은 밤 멜로디';$item_name$ in v_function_sql) = 0
       or position($category$v_category := 'bgm';$category$ in v_function_sql) = 0 then
      raise exception 'NIGHT_MELODY_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'NIGHT_MELODY_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'NIGHT_MELODY_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'NIGHT_MELODY_MESSAGE_ANCHOR_NOT_FOUND';
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
$add_night_melody_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_night_melody_purchase_store_item$
declare
  v_function_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($item_id$p_item_id = 'bgm-cucumberboy-01'$item_id$ in v_function_sql) = 0
     or position('v_price := 621;' in v_function_sql) = 0
     or position($item_name$v_name := '늦은 밤 멜로디';$item_name$ in v_function_sql) = 0
     or position($inventory$elsif p_item_id = 'bgm-cucumberboy-01' then
    null;$inventory$ in v_function_sql) = 0
     or position($message$then '늦은 밤 멜로디 구매가 완료됐어. 621피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$ in v_function_sql) = 0 then
    raise exception 'NIGHT_MELODY_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;
end;
$verify_night_melody_purchase_store_item$;

commit;
