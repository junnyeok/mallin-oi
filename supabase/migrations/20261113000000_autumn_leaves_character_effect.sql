-- 2026-11-13 (한국) 늦가을 산책 캐릭터 효과: cha-fall-01, 455피클
-- 이번 상품 분기와 장착 허용 목록만 추가한다. 다른 상품/데이터/권한은 보존한다.
-- 일반 구매는 455피클 차감, 기존 잔액 부족 테스트 구매 권한의 공통 예외만 유지한다.
-- 관리자 자동충전 없이 원자적 구매·실제 차감액 원장을 사용한다.
-- 재실행 안전: 이번 분기가 이미 있으면 정확한 내용 검증 후 변경하지 않는다.
begin;

do $autumn_leaves$
declare
  v_sql text;
  v_equip text;
  v_anchor text;
  v_price_anchor text := $anchor_price$  elsif p_item_id = 'cha-effects-web-01' then
    v_price := 523;$anchor_price$;
  v_price text := $add_price$  elsif p_item_id = 'cha-fall-01' then
    v_price := 455;
    v_name := '늦가을 산책';
    v_category := 'cha-effects';

$add_price$;
  v_inventory_anchor text := $anchor_inventory$  elsif p_item_id = 'cha-effects-web-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$anchor_inventory$;
  v_inventory text := $add_inventory$  elsif p_item_id = 'cha-fall-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록을 인벤토리에서 사용한다.
    null;

$add_inventory$;
  v_message_anchor text := $anchor_message$      when p_item_id = 'cha-effects-web-01'$anchor_message$;
  v_message text := $add_message$      when p_item_id = 'cha-fall-01'
        then '늦가을 산책 구매가 완료됐어. 455피클이 차감됐고 인벤토리에서 장착할 수 있어.'
$add_message$;
  v_topup_anchor text := $anchor_topup$      if p_item_id = 'BG-07' then$anchor_topup$;
  v_topup text := $add_topup$      if p_item_id = 'cha-fall-01' then
        v_is_auto_topup_admin := false;
      end if;

$add_topup$;
  v_equip_anchor text := $equip$       'cha-effects-web-01'
     )$equip$;
  v_equip_added text := $equip$       'cha-effects-web-01',
       'cha-fall-01'
     )$equip$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.enforce_equipped_character_effect_ownership()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'AUTUMN_LEAVES_DEPENDENCY_MISSING';
  end if;
  if exists (
    select 1 from public.user_store_items where item_id = 'cha-fall-01'
      and (item_name is distinct from '늦가을 산책'
        or item_category is distinct from 'cha-effects'
        or purchase_price is distinct from 455)
  ) then
    raise exception 'AUTUMN_LEAVES_ITEM_ID_CONFLICT';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_character_effect_ownership_trigger'
      and tgfoid = 'public.enforce_equipped_character_effect_ownership()'::regprocedure
      and tgenabled <> 'D' and not tgisinternal
  ) then
    raise exception 'AUTUMN_LEAVES_OWNERSHIP_DEPENDENCY_MISSING';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  -- 초기 엄격 잔액 분기가 이미 있더라도 기존 테스트 구매 권한을 유지한다.
  v_sql := replace(v_sql, $old_balance$    if p_item_id = 'cha-fall-01' then
      v_can_bypass_store_balance := false;
    end if;

$old_balance$, '');
  if position('cha-fall-01' in v_sql) = 0 then
    foreach v_anchor in array array[
      v_price_anchor, v_inventory_anchor, v_message_anchor, v_topup_anchor
    ] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'AUTUMN_LEAVES_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    v_sql := replace(v_sql, v_price_anchor, v_price || v_price_anchor);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory || v_inventory_anchor);
    v_sql := replace(v_sql, v_message_anchor, v_message || v_message_anchor);
    v_sql := replace(v_sql, v_topup_anchor, v_topup || v_topup_anchor);
  end if;
  if position(v_price in v_sql) = 0 or position(v_inventory in v_sql) = 0
     or position(v_message in v_sql) = 0
     or position(v_topup in v_sql) = 0
     or position('for update' in lower(v_sql)) = 0
     or position('if v_exists then' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0 then
    raise exception 'AUTUMN_LEAVES_PURCHASE_VERIFY_FAILED';
  end if;

  execute v_sql;

  select pg_get_functiondef('public.enforce_equipped_character_effect_ownership()'::regprocedure) into v_equip;
  if position('cha-fall-01' in v_equip) = 0 then
    if (length(v_equip) - length(replace(v_equip, v_equip_anchor, ''))) / length(v_equip_anchor) <> 1 then
      raise exception 'AUTUMN_LEAVES_EQUIPMENT_ANCHOR_MISMATCH';
    end if;
    v_equip := replace(v_equip, v_equip_anchor, v_equip_added);
    execute v_equip;
  end if;
  if position(v_equip_added in v_equip) = 0
     or position('item.item_id = new.equipped_character_effect_item_id' in v_equip) = 0
     or position('item.user_id = new.id' in v_equip) = 0
     or position('CHARACTER_EFFECT_NOT_OWNED' in v_equip) = 0 then
    raise exception 'AUTUMN_LEAVES_EQUIPMENT_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute')
     or has_function_privilege('authenticated', 'public.enforce_equipped_character_effect_ownership()', 'execute') then
    raise exception 'AUTUMN_LEAVES_SECURITY_VERIFY_FAILED';
  end if;
end;
$autumn_leaves$;

commit;
