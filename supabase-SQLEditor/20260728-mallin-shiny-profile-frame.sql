-- =========================================================
-- 2026-07-28 신규 프로필 테두리 「말린오이 테마 빛나는 테두리」 지원
-- - BF-02의 서버 고정 가격 488피클, 원자적 지급/차감/원장 기록을 기존 구매 함수에 추가한다.
-- - 테스트 잔액 우회와 관리자 자동충전을 차단해 실제 잔액이 부족하면 구매를 거절한다.
-- - 기존 프로필테두리 보유 검증 트리거가 BF-01과 BF-02를 모두 허용하도록 확장한다.
-- =========================================================

begin;

do $validate_bf02_dependencies$
begin
  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'BF02_PURCHASE_FUNCTION_MISSING';
  end if;

  if to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'BF02_PURCHASE_TABLE_MISSING';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'equipped_profile_frame_item_id'
  ) then
    raise exception 'BF02_PROFILE_FRAME_COLUMN_MISSING';
  end if;

  if exists (
    select 1
    from public.user_store_items item
    where item.item_id = 'BF-02'
      and (
        item.item_name is distinct from '말린오이 테마 빛나는 테두리'
        or item.item_category is distinct from 'profile'
        or item.purchase_price is distinct from 488
      )
  ) then
    raise exception 'BF02_ITEM_ID_CONFLICT';
  end if;
end;
$validate_bf02_dependencies$;

do $add_bf02_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'BF-01' then
    v_price := 389;
    v_name := '무지개 프로필 테두리';
    v_category := 'profile';

  elsif p_item_id = 'skin-eggpotato-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'BF-01' then
    v_price := 389;
    v_name := '무지개 프로필 테두리';
    v_category := 'profile';

  elsif p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';

  elsif p_item_id = 'skin-eggpotato-01' then
$price_replacement$;
  v_strict_balance_anchor text := $strict_balance_anchor$'bgm-tetocarrto-02'
      )$strict_balance_anchor$;
  v_strict_balance_replacement text := $strict_balance_replacement$'bgm-tetocarrto-02',
        'BF-02'
      )$strict_balance_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'BF-01' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BG-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'BF-01' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BG-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'BF-01'
        then '무지개 프로필 테두리 구매가 완료됐어. 389피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BG-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'BF-01'
        then '무지개 프로필 테두리 구매가 완료됐어. 389피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BF-02'
        then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BG-01'
$message_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($item_id$p_item_id = 'BF-02'$item_id$ in v_function_sql) > 0 then
    if position($price$v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';$price$ in v_function_sql) = 0
       or (
         length(v_function_sql) - length(
           replace(v_function_sql, v_strict_balance_replacement, '')
         )
       ) / length(v_strict_balance_replacement) <> 2
       or position($inventory$elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory$ in v_function_sql) = 0
       or position($message$then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0 then
      raise exception 'BF02_EXISTING_BRANCH_MISMATCH';
    end if;
    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'BF02_PRICE_ANCHOR_NOT_FOUND';
  end if;
  if (
       length(v_function_sql) - length(
         replace(v_function_sql, v_strict_balance_anchor, '')
       )
     ) / length(v_strict_balance_anchor) <> 2 then
    raise exception 'BF02_STRICT_BALANCE_ANCHOR_COUNT_INVALID';
  end if;
  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'BF02_INVENTORY_ANCHOR_NOT_FOUND';
  end if;
  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'BF02_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_function_sql := replace(v_function_sql, v_price_anchor, v_price_replacement);
  v_function_sql := replace(
    v_function_sql,
    v_strict_balance_anchor,
    v_strict_balance_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_inventory_anchor,
    v_inventory_replacement
  );
  v_function_sql := replace(v_function_sql, v_message_anchor, v_message_replacement);

  execute v_function_sql;
end;
$add_bf02_to_purchase_store_item$;

create or replace function public.enforce_equipped_profile_frame_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(trim(new.equipped_profile_frame_item_id), '') = '' then
    new.equipped_profile_frame_item_id := null;
    return new;
  end if;

  if exists (
    select 1
    from public.user_store_items usi
    where usi.user_id = new.id
      and usi.item_id = new.equipped_profile_frame_item_id
      and usi.item_id in ('BF-01', 'BF-02')
  ) then
    return new;
  end if;

  new.equipped_profile_frame_item_id := null;
  return new;
end;
$$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_bf02_support$
declare
  v_function_sql text;
  v_frame_guard_sql text;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  select pg_get_functiondef(
    'public.enforce_equipped_profile_frame_ownership()'::regprocedure
  )
  into v_frame_guard_sql;

  if position($price$p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';$price$ in v_function_sql) = 0
     or (
       length(v_function_sql) - length(replace(
         v_function_sql,
         $strict$'bgm-tetocarrto-02',
        'BF-02'
      )$strict$,
         ''
       ))
     ) / length($strict$'bgm-tetocarrto-02',
        'BF-02'
      )$strict$) <> 2
     or position($inventory$elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$inventory$ in v_function_sql) = 0
     or position($message$then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$message$ in v_function_sql) = 0
     or position(
       $deduct$set pickles = coalesce(pickles, 0) - v_price$deduct$
       in v_function_sql
     ) = 0
     or position(
       $balance$and coalesce(pickles, 0) >= v_price$balance$
       in v_function_sql
     ) = 0
     or position('insert into public.user_store_items' in v_function_sql) = 0
     or position('insert into public.pickle_ledger' in v_function_sql) = 0 then
    raise exception 'BF02_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;

  if position(
       $allow$usi.item_id in ('BF-01', 'BF-02')$allow$
       in v_frame_guard_sql
     ) = 0
     or not exists (
       select 1
       from pg_trigger
       where tgrelid = 'public.profiles'::regclass
         and tgname = 'trg_enforce_equipped_profile_frame_ownership'
         and not tgisinternal
     ) then
    raise exception 'BF02_PROFILE_FRAME_GUARD_VERIFY_FAILED';
  end if;

  if has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege(
       'authenticated',
       'public.purchase_store_item(text)',
       'execute'
     )
     or not (
       select p.prosecdef
       from pg_proc p
       where p.oid = 'public.purchase_store_item(text)'::regprocedure
     )
     or not exists (
       select 1
       from pg_proc p
       where p.oid = 'public.purchase_store_item(text)'::regprocedure
         and 'search_path=public' = any (coalesce(p.proconfig, array[]::text[]))
     ) then
    raise exception 'BF02_PURCHASE_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_bf02_support$;

commit;

select json_build_object(
  'item_id', 'BF-02',
  'server_price', 488,
  'strict_balance', true,
  'purchase_function_updated', position(
    $verify$p_item_id = 'BF-02'$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0,
  'profile_frame_guard_updated', position(
    $verify$usi.item_id in ('BF-01', 'BF-02')$verify$
    in pg_get_functiondef(
      'public.enforce_equipped_profile_frame_ownership()'::regprocedure
    )
  ) > 0,
  'conflicting_owned_rows', (
    select count(*)
    from public.user_store_items item
    where item.item_id = 'BF-02'
      and (
        item.item_name is distinct from '말린오이 테마 빛나는 테두리'
        or item.item_category is distinct from 'profile'
        or item.purchase_price is distinct from 488
      )
  ),
  'anon_execute', has_function_privilege(
    'anon',
    'public.purchase_store_item(text)',
    'execute'
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.purchase_store_item(text)',
    'execute'
  )
) as bf02_profile_frame_result;
