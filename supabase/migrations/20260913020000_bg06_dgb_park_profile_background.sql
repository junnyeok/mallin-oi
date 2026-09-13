-- 2026-09-13 (KST) BG-06 DGB PARK 프로필배경 판매: 서버 고정 가격 538피클
-- 기존 구매 함수의 이번 상품 분기만 추가한다. 기존 계정/상품 보유 데이터는 변경하지 않는다.
-- user_store_items 보유 기록으로 인벤토리 장착, pickle_ledger에 실제 차감액 기록.
-- BG-06은 테스트 잔액 우회와 관리자 자동충전을 허용하지 않는다.
begin;

do $dgb_park_background$
declare
  v_sql text;
  v_anchor text;
  v_owner oid;
  v_price_anchor text := $a$  elsif p_item_id = 'skin-cucumbergirl-01' then
    v_price := 923;$a$;
  v_inventory_anchor text := $a$  elsif p_item_id = 'emo-eat-01' then
    insert into public.user_emoticons ($a$;
  v_message_anchor text := $a$      when p_item_id = 'emo-eat-01'$a$;
  v_balance_anchor text := $a$    if not v_can_bypass_store_balance then$a$;
  v_topup_anchor text := $a$      v_is_auto_topup_admin := public.is_auto_topup_admin_user(v_user_id);$a$;
  v_price text := $b$  elsif p_item_id = 'BG-06' then
    v_price := 538;
    v_name := 'DGB PARK';
    v_category := 'profile';

$b$;
  v_inventory text := $b$  elsif p_item_id = 'BG-06' then
    -- 프로필배경은 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

$b$;
  v_message text := $b$      when p_item_id = 'BG-06'
        then 'DGB PARK 구매가 완료됐어. 538피클이 차감됐고 프로필배경 인벤토리에서 장착할 수 있어.'
$b$;
  v_balance text := $b$    if p_item_id = 'BG-06' then
      v_can_bypass_store_balance := false;
    end if;

$b$;
  v_topup text := $b$      v_is_auto_topup_admin := public.is_auto_topup_admin_user(v_user_id)
        and p_item_id <> 'BG-06';$b$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.enforce_equipped_profile_background_ownership()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'BG06_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'BG06_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'trg_enforce_equipped_profile_background_ownership'
      and tgfoid = 'public.enforce_equipped_profile_background_ownership()'::regprocedure
      and tgenabled <> 'D' and not tgisinternal
  ) or position('usi.user_id = new.id' in pg_get_functiondef(
    'public.enforce_equipped_profile_background_ownership()'::regprocedure)) = 0
     or position('usi.item_id = new.equipped_profile_background_item_id' in pg_get_functiondef(
    'public.enforce_equipped_profile_background_ownership()'::regprocedure)) = 0
     or position('usi.item_category = ''profile''' in pg_get_functiondef(
    'public.enforce_equipped_profile_background_ownership()'::regprocedure)) = 0 then
    raise exception 'BG06_EQUIP_OWNERSHIP_TRIGGER_MISMATCH';
  end if;

  if exists (
    select 1 from public.user_store_items
    where item_id = 'BG-06' and (
      item_name is distinct from 'DGB PARK'
      or item_category is distinct from 'profile' or purchase_price is distinct from 538)
  ) then
    raise exception 'BG06_ITEM_ID_CONFLICT';
  end if;

  select pg_get_functiondef(oid), proowner into v_sql, v_owner
  from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure;
  if position('BG-06' in v_sql) = 0 then
    foreach v_anchor in array array[
      v_price_anchor, v_inventory_anchor, v_message_anchor, v_balance_anchor, v_topup_anchor
    ] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'BG06_PURCHASE_ANCHOR_MISMATCH';
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
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0
     or position('public.seoul_today()' in v_sql) = 0 then
    raise exception 'BG06_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or (select proowner from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
       is distinct from v_owner
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     ))
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'BG06_PURCHASE_SECURITY_MISMATCH';
  end if;
end;
$dgb_park_background$;

commit;
