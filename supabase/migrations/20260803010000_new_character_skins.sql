-- =========================================================
-- 2026-08-03 신규 캐릭터 전용 스킨 2종 판매 지원
-- - skin-cucumber-04: 당신의 친절한 오이, 기본오이 전용, 621피클
-- - skin-grilled-egg-02: 이놈스케, 구운계란 전용, 689피클
-- - 서버 고정 가격 차감, 스킨 지급, 피클 원장 기록을 기존 원자적 구매 RPC에 추가한다.
-- - 테스트 잔액 우회와 관리자 자동충전을 차단한다.
-- - 기존 분기나 보유 데이터가 예상 값과 다르면 전체 작업을 중단한다.
-- =========================================================

begin;

do $validate_new_character_skin_dependencies$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_characters') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.pickle_ledger') is null
     or to_regclass('public.store_purchase_test_permissions') is null then
    raise exception 'NEW_CHARACTER_SKINS_PURCHASE_TABLE_MISSING';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.ensure_user_pickles(uuid,integer,text,text,text)') is null
     or to_regprocedure('public.is_auto_topup_admin_user(uuid)') is null
     or to_regprocedure('public.seoul_today()') is null
     or to_regprocedure('public.enforce_equipped_character_ownership()') is null then
    raise exception 'NEW_CHARACTER_SKINS_PURCHASE_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.profiles'::regclass
      and trigger_row.tgname = 'trg_enforce_equipped_character_ownership'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'NEW_CHARACTER_SKINS_EQUIP_TRIGGER_MISSING';
  end if;

  if position(
       'join public.user_characters c'
       in pg_get_functiondef(
         'public.enforce_equipped_character_ownership()'::regprocedure
       )
     ) = 0
     or position(
       'c.character_code = s.character_code'
       in pg_get_functiondef(
         'public.enforce_equipped_character_ownership()'::regprocedure
       )
     ) = 0
     or position(
       's.image_path = new.equipped_character_image_url'
       in pg_get_functiondef(
         'public.enforce_equipped_character_ownership()'::regprocedure
       )
     ) = 0 then
    raise exception 'NEW_CHARACTER_SKINS_EQUIP_TRIGGER_MISMATCH';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.user_store_items'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'NEW_CHARACTER_SKINS_OWNERSHIP_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if exists (
    select 1
    from public.user_store_items item
    where (
      item.item_id = 'skin-cucumber-04'
      and (
        item.item_name is distinct from '당신의 친절한 오이'
        or item.item_category is distinct from 'skin'
        or item.purchase_price is distinct from 621
      )
    ) or (
      item.item_id = 'skin-grilled-egg-02'
      and (
        item.item_name is distinct from '이놈스케'
        or item.item_category is distinct from 'skin'
        or item.purchase_price is distinct from 689
      )
    )
  ) then
    raise exception 'NEW_CHARACTER_SKINS_ITEM_ID_CONFLICT';
  end if;

  if exists (
    select 1
    from public.user_character_skins skin
    where (
      skin.skin_code = 'char-cucumber-kind'
      and (
        skin.character_code is distinct from 'char-cucumber'
        or skin.skin_name is distinct from '당신의 친절한 오이'
        or skin.image_path is distinct from './images/skins/spioi.png'
        or skin.display_order is distinct from 4
      )
    ) or (
      skin.skin_code = 'char-grilled-egg-inomske'
      and (
        skin.character_code is distinct from 'char-grilled-egg'
        or skin.skin_name is distinct from '이놈스케'
        or skin.image_path is distinct from './images/skins/inomske.png'
        or skin.display_order is distinct from 403
      )
    )
  ) then
    raise exception 'NEW_CHARACTER_SKINS_SKIN_CODE_CONFLICT';
  end if;
end;
$validate_new_character_skin_dependencies$;

do $add_new_character_skins_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'skin-cucumber-03' then
    v_price := 775;
    v_name := '오죠 이토루';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-avocado-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'skin-cucumber-03' then
    v_price := 775;
    v_name := '오죠 이토루';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-cucumber-04' then
    v_price := 621;
    v_name := '당신의 친절한 오이';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-grilled-egg-02' then
    v_price := 689;
    v_name := '이놈스케';
    v_category := 'skin';
    v_required_character_code := 'char-grilled-egg';
    v_required_character_name := '구운계란 캐릭터';

  elsif p_item_id = 'skin-avocado-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'skin-avocado-01' then
    insert into public.user_character_skins (
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'skin-cucumber-04' then
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
      'char-cucumber-kind',
      '당신의 친절한 오이',
      './images/skins/spioi.png',
      4,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-grilled-egg-02' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-grilled-egg',
      'char-grilled-egg-inomske',
      '이놈스케',
      './images/skins/inomske.png',
      403,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-avocado-01' then
    insert into public.user_character_skins (
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'skin-cucumber-03'
        then '오죠 이토루 구매가 완료됐어. 775피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-avocado-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'skin-cucumber-03'
        then '오죠 이토루 구매가 완료됐어. 775피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-cucumber-04'
        then '당신의 친절한 오이 구매가 완료됐어. 621피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-grilled-egg-02'
        then '이놈스케 구매가 완료됐어. 689피클이 차감됐고 구운계란 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-avocado-01'
$message_replacement$;
  v_strict_balance_anchor text := $strict_balance_anchor$'skin-cucumber-03',$strict_balance_anchor$;
  v_strict_balance_replacement text := $strict_balance_replacement$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-grilled-egg-02',$strict_balance_replacement$;
  v_strict_balance_count integer := 0;
  v_kind_count integer := 0;
  v_inomske_count integer := 0;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_kind_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'skin-cucumber-04', ''))
  ) / length('skin-cucumber-04');
  v_inomske_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'skin-grilled-egg-02', ''))
  ) / length('skin-grilled-egg-02');

  if v_kind_count > 0 or v_inomske_count > 0 then
    v_strict_balance_count := (
      length(v_function_sql) - length(
        replace(v_function_sql, v_strict_balance_replacement, '')
      )
    ) / length(v_strict_balance_replacement);

    if v_kind_count <> 5
       or v_inomske_count <> 5
       or v_strict_balance_count <> 2
       or position($kind_price$p_item_id = 'skin-cucumber-04' then
    v_price := 621;
    v_name := '당신의 친절한 오이';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';$kind_price$ in v_function_sql) = 0
       or position($inomske_price$p_item_id = 'skin-grilled-egg-02' then
    v_price := 689;
    v_name := '이놈스케';
    v_category := 'skin';
    v_required_character_code := 'char-grilled-egg';
    v_required_character_name := '구운계란 캐릭터';$inomske_price$ in v_function_sql) = 0
       or position($kind_inventory$'char-cucumber-kind',
      '당신의 친절한 오이',
      './images/skins/spioi.png',
      4,
      'store_purchase'$kind_inventory$ in v_function_sql) = 0
       or position($inomske_inventory$'char-grilled-egg-inomske',
      '이놈스케',
      './images/skins/inomske.png',
      403,
      'store_purchase'$inomske_inventory$ in v_function_sql) = 0
       or position($kind_message$then '당신의 친절한 오이 구매가 완료됐어. 621피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'$kind_message$ in v_function_sql) = 0
       or position($inomske_message$then '이놈스케 구매가 완료됐어. 689피클이 차감됐고 구운계란 스킨 인벤토리에서 착용할 수 있어.'$inomske_message$ in v_function_sql) = 0 then
      raise exception 'NEW_CHARACTER_SKINS_EXISTING_BRANCH_MISMATCH kind=%, inomske=%',
        v_kind_count,
        v_inomske_count;
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'NEW_CHARACTER_SKINS_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'NEW_CHARACTER_SKINS_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'NEW_CHARACTER_SKINS_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_strict_balance_count := (
    length(v_function_sql) - length(
      replace(v_function_sql, v_strict_balance_anchor, '')
    )
  ) / length(v_strict_balance_anchor);

  if v_strict_balance_count <> 2 then
    raise exception 'NEW_CHARACTER_SKINS_STRICT_BALANCE_ANCHOR_COUNT_INVALID: %',
      v_strict_balance_count;
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
    v_strict_balance_anchor,
    v_strict_balance_replacement
  );

  execute v_function_sql;
end;
$add_new_character_skins_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_new_character_skins_purchase_store_item$
declare
  v_function_sql text;
  v_strict_balance_pattern text := $strict_balance_pattern$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-grilled-egg-02',$strict_balance_pattern$;
  v_strict_balance_count integer := 0;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_strict_balance_count := (
    length(v_function_sql) - length(
      replace(v_function_sql, v_strict_balance_pattern, '')
    )
  ) / length(v_strict_balance_pattern);

  if position($kind_price$p_item_id = 'skin-cucumber-04' then
    v_price := 621;
    v_name := '당신의 친절한 오이';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';$kind_price$ in v_function_sql) = 0
     or position($inomske_price$p_item_id = 'skin-grilled-egg-02' then
    v_price := 689;
    v_name := '이놈스케';
    v_category := 'skin';
    v_required_character_code := 'char-grilled-egg';
    v_required_character_name := '구운계란 캐릭터';$inomske_price$ in v_function_sql) = 0
     or position($kind_inventory$'char-cucumber-kind',
      '당신의 친절한 오이',
      './images/skins/spioi.png',
      4,
      'store_purchase'$kind_inventory$ in v_function_sql) = 0
     or position($inomske_inventory$'char-grilled-egg-inomske',
      '이놈스케',
      './images/skins/inomske.png',
      403,
      'store_purchase'$inomske_inventory$ in v_function_sql) = 0
     or position($kind_message$then '당신의 친절한 오이 구매가 완료됐어. 621피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'$kind_message$ in v_function_sql) = 0
     or position($inomske_message$then '이놈스케 구매가 완료됐어. 689피클이 차감됐고 구운계란 스킨 인벤토리에서 착용할 수 있어.'$inomske_message$ in v_function_sql) = 0
     or v_strict_balance_count <> 2
     or position($parent_check$v_category = 'skin'
     and coalesce(trim(v_required_character_code), '') <> ''
     and v_required_character_code <> 'char-cucumber'
     and not exists ($parent_check$ in v_function_sql) = 0
     or position('from public.user_characters' in v_function_sql) = 0
     or position('for update' in lower(v_function_sql)) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_function_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_function_sql) = 0
     or position('insert into public.user_store_items' in v_function_sql) = 0
     or position('insert into public.user_character_skins' in v_function_sql) = 0
     or position('insert into public.pickle_ledger' in v_function_sql) = 0
     or position($charged$-v_charged_amount$charged$ in v_function_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_function_sql) = 0
     or position('public.seoul_today()' in v_function_sql) = 0 then
    raise exception 'NEW_CHARACTER_SKINS_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;

  if has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege(
       'authenticated',
       'public.purchase_store_item(text)',
       'execute'
     )
     or exists (
       select 1
       from pg_proc procedure_row
       cross join lateral aclexplode(
         coalesce(
           procedure_row.proacl,
           acldefault('f', procedure_row.proowner)
         )
       ) acl_row
       where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
         and acl_row.grantee = 0
         and acl_row.privilege_type = 'EXECUTE'
     )
     or not (
       select procedure_row.prosecdef
       from pg_proc procedure_row
       where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
     ) then
    raise exception 'NEW_CHARACTER_SKINS_PURCHASE_FUNCTION_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_new_character_skins_purchase_store_item$;

commit;

select json_build_object(
  'items', json_build_array(
    json_build_object(
      'item_id', 'skin-cucumber-04',
      'server_price', 621,
      'item_name', '당신의 친절한 오이',
      'required_character_code', 'char-cucumber',
      'skin_code', 'char-cucumber-kind',
      'image_path', './images/skins/spioi.png'
    ),
    json_build_object(
      'item_id', 'skin-grilled-egg-02',
      'server_price', 689,
      'item_name', '이놈스케',
      'required_character_code', 'char-grilled-egg',
      'skin_code', 'char-grilled-egg-inomske',
      'image_path', './images/skins/inomske.png'
    )
  ),
  'purchase_function_updated',
    position(
      $verify$p_item_id = 'skin-cucumber-04'$verify$
      in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
    ) > 0
    and position(
      $verify$p_item_id = 'skin-grilled-egg-02'$verify$
      in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
    ) > 0,
  'strict_balance_list_occurrences', (
    length(pg_get_functiondef('public.purchase_store_item(text)'::regprocedure))
      - length(replace(
        pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
        $verify$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-grilled-egg-02',$verify$,
        ''
      ))
  ) / length($verify$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-grilled-egg-02',$verify$),
  'conflicting_owned_rows', (
    select count(*)
    from public.user_store_items item
    where (
      item.item_id = 'skin-cucumber-04'
      and (
        item.item_name is distinct from '당신의 친절한 오이'
        or item.item_category is distinct from 'skin'
        or item.purchase_price is distinct from 621
      )
    ) or (
      item.item_id = 'skin-grilled-egg-02'
      and (
        item.item_name is distinct from '이놈스케'
        or item.item_category is distinct from 'skin'
        or item.purchase_price is distinct from 689
      )
    )
  ),
  'public_execute', exists (
    select 1
    from pg_proc procedure_row
    cross join lateral aclexplode(
      coalesce(procedure_row.proacl, acldefault('f', procedure_row.proowner))
    ) acl_row
    where procedure_row.oid = 'public.purchase_store_item(text)'::regprocedure
      and acl_row.grantee = 0
      and acl_row.privilege_type = 'EXECUTE'
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
) as new_character_skins_result;
