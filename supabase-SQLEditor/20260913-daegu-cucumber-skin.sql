-- 2026-09-13 대구FC 오이: 기본오이 전용 스킨, skin-cucumber-07, 389피클
-- 현재 구매 함수에서 이번 상품 분기만 추가한다. 기존 상품 및 보유 데이터는 변경하지 않는다.
-- 테스트 잔액 우회/관리자 자동충전 제외. 실제 구매 시에만 기본오이·스킨·원장을 지급한다.
begin;

do $daegu_skin$
declare
  v_sql text;
  v_anchor text;
  v_price_anchor text := $a$  elsif p_item_id = 'character-brocolli-01' then
    v_price := 682;$a$;
  v_inventory_anchor text := $a$  elsif p_item_id = 'character-brocolli-01' then
    insert into public.user_characters ($a$;
  v_message_anchor text := $a$      when p_item_id = 'character-brocolli-01'$a$;
  v_balance_anchor text := $a$    if not v_can_bypass_store_balance then$a$;
  v_topup_anchor text := $a$      if coalesce(v_is_auto_topup_admin, false)
         and p_item_id not in ($a$;
  v_price text := $b$  elsif p_item_id = 'skin-cucumber-07' then
    v_price := 389;
    v_name := '대구FC 오이';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

$b$;
  v_inventory text := $b$  elsif p_item_id = 'skin-cucumber-07' then
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
      'char-cucumber-daegu',
      '대구FC 오이',
      './images/skins/cucumber-daegu.png',
      7,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

$b$;
  v_message text := $b$      when p_item_id = 'skin-cucumber-07'
        then '대구FC 오이 구매가 완료됐어. 389피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
$b$;
  v_balance text := $b$    if p_item_id = 'skin-cucumber-07' then
      v_can_bypass_store_balance := false;
    end if;

$b$;
  v_topup text := $b$      if coalesce(v_is_auto_topup_admin, false)
         and p_item_id <> 'skin-cucumber-07'
         and p_item_id not in ($b$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.enforce_equipped_character_ownership()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.user_characters') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'DAEGU_SKIN_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_character_skins'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, skin_code)'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_characters'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, character_code)'
  ) then
    raise exception 'DAEGU_SKIN_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'trg_enforce_equipped_character_ownership'
      and tgfoid = 'public.enforce_equipped_character_ownership()'::regprocedure
      and tgenabled <> 'D' and not tgisinternal
  ) or position('c.character_code = s.character_code' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0
     or position('s.image_path = new.equipped_character_image_url' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0 then
    raise exception 'DAEGU_SKIN_EQUIP_TRIGGER_MISMATCH';
  end if;

  if exists (
    select 1 from public.user_store_items
    where item_id = 'skin-cucumber-07' and (
      item_name is distinct from '대구FC 오이'
      or item_category is distinct from 'skin' or purchase_price is distinct from 389)
  ) or exists (
    select 1 from public.user_character_skins
    where skin_code = 'char-cucumber-daegu' and (
      character_code is distinct from 'char-cucumber'
      or skin_name is distinct from '대구FC 오이'
      or image_path is distinct from './images/skins/cucumber-daegu.png'
      or display_order is distinct from 7)
  ) or exists (
    select 1 from public.user_character_skins
    where skin_code <> 'char-cucumber-daegu'
      and (image_path = './images/skins/cucumber-daegu.png' or display_order = 7)
  ) then
    raise exception 'DAEGU_SKIN_ID_CONFLICT';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  if position('skin-cucumber-07' in v_sql) = 0 then
    foreach v_anchor in array array[
      v_price_anchor, v_inventory_anchor, v_message_anchor, v_balance_anchor, v_topup_anchor
    ] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'DAEGU_SKIN_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    v_sql := replace(v_sql, v_price_anchor, v_price || v_price_anchor);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory || v_inventory_anchor);
    v_sql := replace(v_sql, v_message_anchor, v_message || v_message_anchor);
    v_sql := replace(v_sql, v_balance_anchor, v_balance || v_balance_anchor);
    v_sql := replace(v_sql, v_topup_anchor, v_topup);
    execute v_sql;
  end if;

  if position(v_price in v_sql) = 0 or position(v_inventory in v_sql) = 0
     or position(v_message in v_sql) = 0 or position(v_balance in v_sql) = 0
     or position(v_topup in v_sql) = 0
     or position('for update' in lower(v_sql)) = 0
     or position('if v_exists then' in v_sql) = 0
     or position('v_required_character_code <> ''char-cucumber''' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0
     or position('public.seoul_today()' in v_sql) = 0 then
    raise exception 'DAEGU_SKIN_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     ))
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'DAEGU_SKIN_PURCHASE_SECURITY_MISMATCH';
  end if;
end;
$daegu_skin$;

commit;
