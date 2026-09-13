-- 2026-09-13 방울토마토리토 전용 스킨 2종
-- skin-tomato-01: 방울토마(피아)토리토, 521피클, char-tomato-gang
-- skin-tomato-02: 멕시코 방울토마토리토, 87피클, char-tomato-mexico
-- 현재 구매 함수를 부분 갱신한다. 기존 상품·계정·보유 데이터는 변경하지 않는다.
-- 두 상품은 테스트 잔액 우회와 관리자 자동충전을 허용하지 않는다.
begin;

do $tomato_skins$
declare
  v_sql text;
  v_anchor text;
  v_count integer;
  v_price_anchor text := $a$  elsif p_item_id = 'character-brocolli-01' then
    v_price := 682;$a$;
  v_inventory_anchor text := $a$  elsif p_item_id = 'character-brocolli-01' then
    insert into public.user_characters ($a$;
  v_message_anchor text := $a$      when p_item_id = 'character-brocolli-01'$a$;
  v_balance_anchor text := $a$    if not v_can_bypass_store_balance then$a$;
  v_price text := $b$  elsif p_item_id = 'skin-tomato-01' then
    v_price := 521;
    v_name := '방울토마(피아)토리토';
    v_category := 'skin';
    v_required_character_code := 'char-tomato';
    v_required_character_name := '방울토마토리토';

  elsif p_item_id = 'skin-tomato-02' then
    v_price := 87;
    v_name := '멕시코 방울토마토리토';
    v_category := 'skin';
    v_required_character_code := 'char-tomato';
    v_required_character_name := '방울토마토리토';

$b$;
  v_inventory text := $b$  elsif p_item_id = 'skin-tomato-01' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-tomato',
      'char-tomato-gang',
      '방울토마(피아)토리토',
      './images/skins/tomato-gang.png',
      702,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-tomato-02' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-tomato',
      'char-tomato-mexico',
      '멕시코 방울토마토리토',
      './images/skins/tomato_mexico.png',
      703,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

$b$;
  v_message text := $b$      when p_item_id = 'skin-tomato-01'
        then '방울토마(피아)토리토 구매가 완료됐어. 521피클이 차감됐고 방울토마토리토 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-tomato-02'
        then '멕시코 방울토마토리토 구매가 완료됐어. 87피클이 차감됐고 방울토마토리토 스킨 인벤토리에서 착용할 수 있어.'
$b$;
  v_balance text := $b$    if p_item_id in ('skin-tomato-01', 'skin-tomato-02') then
      v_can_bypass_store_balance := false;
    end if;

$b$;
  v_list_pattern text := $p$'BG-05',([[:space:]]*)'skin-cucumber-03'$p$;
  v_list_replacement text := $r$'BG-05',\1'skin-tomato-01',\1'skin-tomato-02',\1'skin-cucumber-03'$r$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.enforce_equipped_character_ownership()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.user_characters') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'TOMATO_SKINS_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_character_skins'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, skin_code)'
  ) then
    raise exception 'TOMATO_SKINS_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'trg_enforce_equipped_character_ownership'
      and tgfoid = 'public.enforce_equipped_character_ownership()'::regprocedure
      and tgenabled <> 'D' and not tgisinternal
  ) or position('join public.user_characters c' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0
     or position('c.character_code = s.character_code' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0
     or position('s.image_path = new.equipped_character_image_url' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0 then
    raise exception 'TOMATO_SKINS_EQUIP_TRIGGER_MISMATCH';
  end if;

  if exists (
    select 1 from public.user_store_items
    where (item_id = 'skin-tomato-01' and (
      item_name is distinct from '방울토마(피아)토리토'
      or item_category is distinct from 'skin' or purchase_price is distinct from 521))
       or (item_id = 'skin-tomato-02' and (
      item_name is distinct from '멕시코 방울토마토리토'
      or item_category is distinct from 'skin' or purchase_price is distinct from 87))
  ) then
    raise exception 'TOMATO_SKINS_ITEM_ID_CONFLICT';
  end if;

  if exists (
    select 1 from public.user_character_skins
    where (skin_code = 'char-tomato-gang' and (
      character_code is distinct from 'char-tomato'
      or skin_name is distinct from '방울토마(피아)토리토'
      or image_path is distinct from './images/skins/tomato-gang.png'
      or display_order is distinct from 702))
       or (skin_code = 'char-tomato-mexico' and (
      character_code is distinct from 'char-tomato'
      or skin_name is distinct from '멕시코 방울토마토리토'
      or image_path is distinct from './images/skins/tomato_mexico.png'
      or display_order is distinct from 703))
  ) then
    raise exception 'TOMATO_SKINS_SKIN_CODE_CONFLICT';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  if position('skin-tomato-' in v_sql) = 0 then
    foreach v_anchor in array array[
      v_price_anchor, v_inventory_anchor, v_message_anchor, v_balance_anchor
    ] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'TOMATO_SKINS_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    select count(*) into v_count from regexp_matches(v_sql, v_list_pattern, 'g');
    if v_count not in (1, 2) then
      raise exception 'TOMATO_SKINS_BALANCE_POLICY_ANCHOR_MISMATCH';
    end if;
    v_sql := replace(v_sql, v_price_anchor, v_price || v_price_anchor);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory || v_inventory_anchor);
    v_sql := replace(v_sql, v_message_anchor, v_message || v_message_anchor);
    v_sql := replace(v_sql, v_balance_anchor, v_balance || v_balance_anchor);
    v_sql := regexp_replace(v_sql, v_list_pattern, v_list_replacement, 'g');
    execute v_sql;
  end if;

  if position(v_price in v_sql) = 0 or position(v_inventory in v_sql) = 0
     or position(v_message in v_sql) = 0 or position(v_balance in v_sql) = 0
     or v_sql !~ $p$'BG-05',[[:space:]]*'skin-tomato-01',[[:space:]]*'skin-tomato-02',[[:space:]]*'skin-cucumber-03'$p$
     or position('for update' in lower(v_sql)) = 0
     or position('if v_exists then' in v_sql) = 0
     or position('character_code = v_required_character_code' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0
     or position('public.seoul_today()' in v_sql) = 0 then
    raise exception 'TOMATO_SKINS_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     ))
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'TOMATO_SKINS_PURCHASE_SECURITY_MISMATCH';
  end if;
end;
$tomato_skins$;

commit;
