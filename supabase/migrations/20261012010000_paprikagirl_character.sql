-- 2026-10-12 파프리카걸: character-paprikagirl-01, 622피클, 캐릭터 및 기본 스킨 지급
-- 현재 구매 함수에 이번 상품 분기만 추가한다. 기존 상품/보유 데이터/권한은 보존한다.
-- 테스트 잔액 우회와 관리자 자동충전을 제외하여 실제 보유 피클에서 622를 차감한다.
begin;

do $paprikagirl_character$
declare
  v_sql text;
  v_anchor text;
  v_price_anchor text := $a$  elsif p_item_id = 'character-brocolli-01' then
    v_price := 682;$a$;
  v_inventory_anchor text := $a$  elsif p_item_id = 'character-brocolli-01' then
    insert into public.user_characters ($a$;
  v_message_anchor text := $a$      when p_item_id = 'character-brocolli-01'$a$;
  v_balance_anchor text := $a$    if not v_can_bypass_store_balance then$a$;
  v_topup_anchor text := $a$      if p_item_id = 'BG-07' then$a$;
  v_price text := $b$  elsif p_item_id = 'character-paprikagirl-01' then
    v_price := 622;
    v_name := '파프리카걸';
    v_category := 'character';

$b$;
  v_inventory text := $b$  elsif p_item_id = 'character-paprikagirl-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-paprika-girl',
      '파프리카걸',
      './images/characters/paprikagirl.png',
      './images/characters/paprikagirl.png',
      10,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-paprika-girl',
      'char-paprika-girl-basic',
      '파프리카걸',
      './images/characters/paprikagirl.png',
      901,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

$b$;
  v_message text := $b$      when p_item_id = 'character-paprikagirl-01'
        then '파프리카걸 구매가 완료됐어. 622피클이 차감됐고 캐릭터 인벤토리에서 착용할 수 있어.'
$b$;
  v_balance text := $b$    if p_item_id = 'character-paprikagirl-01' then
      v_can_bypass_store_balance := false;
    end if;

$b$;
  v_topup text := $b$      if p_item_id = 'character-paprikagirl-01' then
        v_is_auto_topup_admin := false;
      end if;

$b$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.enforce_equipped_character_ownership()') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.user_characters') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'PAPRIKAGIRL_CHARACTER_DEPENDENCY_MISSING';
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
    raise exception 'PAPRIKAGIRL_CHARACTER_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'trg_enforce_equipped_character_ownership'
      and tgfoid = 'public.enforce_equipped_character_ownership()'::regprocedure
      and tgenabled <> 'D' and not tgisinternal
  ) or position('c.character_code = s.character_code' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0
     or position('base_image_path = new.equipped_character_image_url' in pg_get_functiondef(
    'public.enforce_equipped_character_ownership()'::regprocedure)) = 0 then
    raise exception 'PAPRIKAGIRL_CHARACTER_EQUIP_TRIGGER_MISMATCH';
  end if;

  if exists (
    select 1 from public.user_store_items
    where item_id = 'character-paprikagirl-01' and (
      item_name is distinct from '파프리카걸'
      or item_category is distinct from 'character' or purchase_price is distinct from 622)
  ) or exists (
    select 1 from public.user_characters
    where character_code = 'char-paprika-girl' and (
      character_name is distinct from '파프리카걸'
      or base_image_path is distinct from './images/characters/paprikagirl.png'
      or preview_image_path is distinct from './images/characters/paprikagirl.png'
      or display_order is distinct from 10)
  ) or exists (
    select 1 from public.user_characters
    where character_code <> 'char-paprika-girl' and (
      base_image_path = './images/characters/paprikagirl.png'
      or preview_image_path = './images/characters/paprikagirl.png' or display_order = 10)
  ) or exists (
    select 1 from public.user_character_skins
    where skin_code = 'char-paprika-girl-basic' and (
      character_code is distinct from 'char-paprika-girl'
      or skin_name is distinct from '파프리카걸'
      or image_path is distinct from './images/characters/paprikagirl.png'
      or display_order is distinct from 901)
  ) or exists (
    select 1 from public.user_character_skins
    where skin_code <> 'char-paprika-girl-basic'
      and (image_path = './images/characters/paprikagirl.png' or display_order = 901)
  ) then
    raise exception 'PAPRIKAGIRL_CHARACTER_ID_CONFLICT';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  if position('character-paprikagirl-01' in v_sql) = 0 then
    foreach v_anchor in array array[
      v_price_anchor, v_inventory_anchor, v_message_anchor, v_balance_anchor, v_topup_anchor
    ] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'PAPRIKAGIRL_CHARACTER_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    v_sql := replace(v_sql, v_price_anchor, v_price || v_price_anchor);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory || v_inventory_anchor);
    v_sql := replace(v_sql, v_message_anchor, v_message || v_message_anchor);
    v_sql := replace(v_sql, v_balance_anchor, v_balance || v_balance_anchor);
    v_sql := replace(v_sql, v_topup_anchor, v_topup || v_topup_anchor);
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
    raise exception 'PAPRIKAGIRL_CHARACTER_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     ))
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'PAPRIKAGIRL_CHARACTER_PURCHASE_SECURITY_MISMATCH';
  end if;
end;
$paprikagirl_character$;

commit;
