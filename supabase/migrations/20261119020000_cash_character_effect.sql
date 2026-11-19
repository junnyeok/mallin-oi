-- 2026-11-19 (KST): 지폐 흩뿌리기 캐릭터 효과를 413피클에 등록한다.
-- 이 상품은 잔액 우회와 관리자 자동충전을 허용하지 않는다.
begin;

do $cash_character_effect$
declare
  purchase_function constant regprocedure := to_regprocedure('public.purchase_store_item(text)');
  equip_function constant regprocedure := to_regprocedure('public.enforce_equipped_character_effect_ownership()');
  purchase_anchors constant text[] := array[
    $price$  elsif p_item_id = 'cha-fall-01' then
    v_price := 455;$price$,
    $balance$    if p_item_id = 'BG-06' then
      v_can_bypass_store_balance := false;
    end if;$balance$,
    $topup$      if p_item_id = 'cha-fall-01' then
        v_is_auto_topup_admin := false;
      end if;$topup$,
    $inventory$  elsif p_item_id = 'cha-fall-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록을 인벤토리에서 사용한다.
    null;$inventory$,
    $message$      when p_item_id = 'cha-fall-01'
        then '늦가을 산책 구매가 완료됐어. 455피클이 차감됐고 인벤토리에서 장착할 수 있어.'$message$
  ];
  purchase_additions constant text[] := array[
    $price$  elsif p_item_id = 'cha-cash-01' then
    v_price := 413;
    v_name := '지폐 흩뿌리기';
    v_category := 'cha-effects';

$price$,
    $balance$    if p_item_id = 'cha-cash-01' then
      v_can_bypass_store_balance := false;
    end if;

$balance$,
    $topup$      if p_item_id = 'cha-cash-01' then
        v_is_auto_topup_admin := false;
      end if;

$topup$,
    $inventory$  elsif p_item_id = 'cha-cash-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록을 인벤토리에서 사용한다.
    null;

$inventory$,
    $message$      when p_item_id = 'cha-cash-01'
        then '지폐 흩뿌리기 구매가 완료됐어. 413피클이 차감됐고 인벤토리에서 장착할 수 있어.'
$message$
  ];
  equip_anchor constant text := $equip$       'cha-fall-01'
     )$equip$;
  equip_addition constant text := $equip$       'cha-cash-01',
$equip$;
  purchase_before text;
  purchase_sql text;
  equip_before text;
  equip_sql text;
  anchor text;
  index_no integer;
begin
  if purchase_function is null or equip_function is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'CASH_EFFECT_DEPENDENCY_MISSING';
  end if;

  if exists (
    select 1 from public.user_store_items where item_id = 'cha-cash-01'
      and (item_name is distinct from '지폐 흩뿌리기'
        or item_category is distinct from 'cha-effects'
        or purchase_price is distinct from 413)
  ) then
    raise exception 'CASH_EFFECT_ITEM_ID_CONFLICT';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_character_effect_ownership_trigger'
      and tgfoid = equip_function and tgenabled <> 'D' and not tgisinternal
  ) then
    raise exception 'CASH_EFFECT_OWNERSHIP_DEPENDENCY_MISSING';
  end if;

  purchase_before := pg_get_functiondef(purchase_function);
  purchase_sql := purchase_before;
  if position('cha-cash-01' in purchase_sql) = 0 then
    for index_no in 1..array_length(purchase_anchors, 1) loop
      anchor := purchase_anchors[index_no];
      if (length(purchase_sql) - length(replace(purchase_sql, anchor, '')))
         / length(anchor) <> 1 then
        raise exception 'CASH_EFFECT_PURCHASE_ANCHOR_MISMATCH: %', index_no;
      end if;
      purchase_sql := replace(purchase_sql, anchor, purchase_additions[index_no] || anchor);
    end loop;
  end if;

  for index_no in 1..array_length(purchase_anchors, 1) loop
    if position(purchase_additions[index_no] || purchase_anchors[index_no] in purchase_sql) = 0 then
      raise exception 'CASH_EFFECT_PURCHASE_BRANCH_MISMATCH: %', index_no;
    end if;
  end loop;

  equip_before := pg_get_functiondef(equip_function);
  equip_sql := equip_before;
  if position('cha-cash-01' in equip_sql) = 0 then
    if (length(equip_sql) - length(replace(equip_sql, equip_anchor, '')))
       / length(equip_anchor) <> 1 then
      raise exception 'CASH_EFFECT_EQUIP_ANCHOR_MISMATCH';
    end if;
    equip_sql := replace(equip_sql, equip_anchor, equip_addition || equip_anchor);
  end if;

  if position('for update' in lower(purchase_sql)) = 0
     or position('if v_exists then' in purchase_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in purchase_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in purchase_sql) = 0
     or position('insert into public.user_store_items' in purchase_sql) = 0
     or position('insert into public.pickle_ledger' in purchase_sql) = 0
     or position('-v_charged_amount' in purchase_sql) = 0
     or position(equip_addition || equip_anchor in equip_sql) = 0
     or position('item.item_id = new.equipped_character_effect_item_id' in equip_sql) = 0
     or position('item.user_id = new.id' in equip_sql) = 0
     or position('CHARACTER_EFFECT_NOT_OWNED' in equip_sql) = 0 then
    raise exception 'CASH_EFFECT_PURCHASE_OR_EQUIP_VERIFY_FAILED';
  end if;

  if purchase_sql <> purchase_before then
    execute purchase_sql;
  end if;
  if equip_sql <> equip_before then
    execute equip_sql;
  end if;

  if pg_get_function_result(purchase_function) <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = purchase_function)
     or not (select prosecdef from pg_proc where oid = equip_function)
     or has_function_privilege('anon', purchase_function, 'execute')
     or not has_function_privilege('authenticated', purchase_function, 'execute')
     or has_function_privilege('anon', equip_function, 'execute')
     or has_function_privilege('authenticated', equip_function, 'execute') then
    raise exception 'CASH_EFFECT_SECURITY_VERIFY_FAILED';
  end if;
end;
$cash_character_effect$;

commit;
