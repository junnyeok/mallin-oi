-- =========================================================
-- 2026-08-09 신규 캐릭터 전용 스킨 2종 판매 지원
-- - skin-cucumber-05: 카를레스 푸오이욜, 기본오이 전용, 587피클
-- - skin-cucumberboy-02: 여름 기동보이 오이소년, 오이소년 전용, 721피클
-- - 서버 고정 가격 차감, 스킨 지급, 피클 원장 기록을 기존 원자적 구매 RPC에 추가한다.
-- - 테스트 잔액 우회와 관리자 자동충전을 차단한다.
-- - 기존 분기나 보유 데이터가 예상 값과 다르면 전체 작업을 중단한다.
-- =========================================================

begin;

do $validate_socceroi_summerboy_dependencies$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_characters') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.pickle_ledger') is null
     or to_regclass('public.store_purchase_test_permissions') is null then
    raise exception 'SOCCEROI_SUMMERBOY_PURCHASE_TABLE_MISSING';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.ensure_user_pickles(uuid,integer,text,text,text)') is null
     or to_regprocedure('public.is_auto_topup_admin_user(uuid)') is null
     or to_regprocedure('public.seoul_today()') is null
     or to_regprocedure('public.enforce_equipped_character_ownership()') is null then
    raise exception 'SOCCEROI_SUMMERBOY_PURCHASE_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    where trigger_row.tgrelid = 'public.profiles'::regclass
      and trigger_row.tgname = 'trg_enforce_equipped_character_ownership'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'SOCCEROI_SUMMERBOY_EQUIP_TRIGGER_MISSING';
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
    raise exception 'SOCCEROI_SUMMERBOY_EQUIP_TRIGGER_MISMATCH';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.user_store_items'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'SOCCEROI_SUMMERBOY_OWNERSHIP_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.user_character_skins'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (user_id, skin_code)'
  ) then
    raise exception 'SOCCEROI_SUMMERBOY_SKIN_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if exists (
    select 1
    from public.user_store_items item
    where (
      item.item_id = 'skin-cucumber-05'
      and (
        item.item_name is distinct from '카를레스 푸오이욜'
        or item.item_category is distinct from 'skin'
        or item.purchase_price is distinct from 587
      )
    ) or (
      item.item_id = 'skin-cucumberboy-02'
      and (
        item.item_name is distinct from '여름 기동보이 오이소년'
        or item.item_category is distinct from 'skin'
        or item.purchase_price is distinct from 721
      )
    )
  ) then
    raise exception 'SOCCEROI_SUMMERBOY_ITEM_ID_CONFLICT';
  end if;

  if exists (
    select 1
    from public.user_character_skins skin
    where (
      skin.skin_code = 'char-cucumber-socceroi'
      and (
        skin.character_code is distinct from 'char-cucumber'
        or skin.skin_name is distinct from '카를레스 푸오이욜'
        or skin.image_path is distinct from './images/skins/socceroi.png'
        or skin.display_order is distinct from 5
      )
    ) or (
      skin.skin_code = 'char-cucumber-boy-summer'
      and (
        skin.character_code is distinct from 'char-cucumber-boy'
        or skin.skin_name is distinct from '여름 기동보이 오이소년'
        or skin.image_path is distinct from './images/skins/summerboy.png'
        or skin.display_order is distinct from 503
      )
    )
  ) then
    raise exception 'SOCCEROI_SUMMERBOY_SKIN_CODE_CONFLICT';
  end if;
end;
$validate_socceroi_summerboy_dependencies$;

do $add_socceroi_summerboy_to_purchase_store_item$
declare
  v_function_sql text;
  v_socceroi_price_anchor text := $socceroi_price_anchor$
  elsif p_item_id = 'skin-cucumber-04' then
    v_price := 621;
    v_name := '당신의 친절한 오이';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-grilled-egg-02' then
$socceroi_price_anchor$;
  v_socceroi_price_replacement text := $socceroi_price_replacement$
  elsif p_item_id = 'skin-cucumber-04' then
    v_price := 621;
    v_name := '당신의 친절한 오이';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-cucumber-05' then
    v_price := 587;
    v_name := '카를레스 푸오이욜';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';

  elsif p_item_id = 'skin-grilled-egg-02' then
$socceroi_price_replacement$;
  v_summerboy_price_anchor text := $summerboy_price_anchor$
  elsif p_item_id = 'skin-cucumberboy-01' then
    v_price := 875;
    v_name := '기동대 의무복무 오이소년';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber-boy';
    v_required_character_name := '오이소년 캐릭터';

  elsif p_item_id = 'character-fat-avocado-01' then
$summerboy_price_anchor$;
  v_summerboy_price_replacement text := $summerboy_price_replacement$
  elsif p_item_id = 'skin-cucumberboy-01' then
    v_price := 875;
    v_name := '기동대 의무복무 오이소년';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber-boy';
    v_required_character_name := '오이소년 캐릭터';

  elsif p_item_id = 'skin-cucumberboy-02' then
    v_price := 721;
    v_name := '여름 기동보이 오이소년';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber-boy';
    v_required_character_name := '오이소년 캐릭터';

  elsif p_item_id = 'character-fat-avocado-01' then
$summerboy_price_replacement$;
  v_socceroi_inventory_anchor text := $socceroi_inventory_anchor$
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
$socceroi_inventory_anchor$;
  v_socceroi_inventory_replacement text := $socceroi_inventory_replacement$
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

  elsif p_item_id = 'skin-cucumber-05' then
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
      'char-cucumber-socceroi',
      '카를레스 푸오이욜',
      './images/skins/socceroi.png',
      5,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-grilled-egg-02' then
$socceroi_inventory_replacement$;
  v_summerboy_inventory_anchor text := $summerboy_inventory_anchor$
  elsif p_item_id = 'skin-cucumberboy-01' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-boy',
      'char-cucumber-boy-police',
      '기동대 의무복무 오이소년',
      './images/skins/cucumberboy_police.png',
      502,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-grilledegg-01' then
$summerboy_inventory_anchor$;
  v_summerboy_inventory_replacement text := $summerboy_inventory_replacement$
  elsif p_item_id = 'skin-cucumberboy-01' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-boy',
      'char-cucumber-boy-police',
      '기동대 의무복무 오이소년',
      './images/skins/cucumberboy_police.png',
      502,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-cucumberboy-02' then
    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-boy',
      'char-cucumber-boy-summer',
      '여름 기동보이 오이소년',
      './images/skins/summerboy.png',
      503,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'skin-grilledegg-01' then
$summerboy_inventory_replacement$;
  v_socceroi_message_anchor text := $socceroi_message_anchor$
      when p_item_id = 'skin-cucumber-04'
        then '당신의 친절한 오이 구매가 완료됐어. 621피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-grilled-egg-02'
$socceroi_message_anchor$;
  v_socceroi_message_replacement text := $socceroi_message_replacement$
      when p_item_id = 'skin-cucumber-04'
        then '당신의 친절한 오이 구매가 완료됐어. 621피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-cucumber-05'
        then '카를레스 푸오이욜 구매가 완료됐어. 587피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-grilled-egg-02'
$socceroi_message_replacement$;
  v_summerboy_message_anchor text := $summerboy_message_anchor$
      when p_item_id = 'skin-cucumberboy-01'
        then '기동대 의무복무 오이소년 구매가 완료됐어. 875피클이 차감됐고 내프로필 오이소년 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'bgm-tetocarrot-01'
$summerboy_message_anchor$;
  v_summerboy_message_replacement text := $summerboy_message_replacement$
      when p_item_id = 'skin-cucumberboy-01'
        then '기동대 의무복무 오이소년 구매가 완료됐어. 875피클이 차감됐고 내프로필 오이소년 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'skin-cucumberboy-02'
        then '여름 기동보이 오이소년 구매가 완료됐어. 721피클이 차감됐고 내프로필 오이소년 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'bgm-tetocarrot-01'
$summerboy_message_replacement$;
  v_strict_balance_anchor text := $strict_balance_anchor$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-grilled-egg-02'$strict_balance_anchor$;
  v_strict_balance_replacement text := $strict_balance_replacement$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-cucumber-05',
        'skin-cucumberboy-02',
        'skin-grilled-egg-02'$strict_balance_replacement$;
  v_anchor_count integer;
  v_socceroi_count integer;
  v_summerboy_count integer;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_socceroi_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'skin-cucumber-05', ''))
  ) / length('skin-cucumber-05');
  v_summerboy_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'skin-cucumberboy-02', ''))
  ) / length('skin-cucumberboy-02');

  if v_socceroi_count > 0 or v_summerboy_count > 0 then
    if v_socceroi_count <> 5
       or v_summerboy_count <> 5
       or position($verify$p_item_id = 'skin-cucumber-05' then
    v_price := 587;
    v_name := '카를레스 푸오이욜';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber';
    v_required_character_name := '기본오이';$verify$ in v_function_sql) = 0
       or position($verify$p_item_id = 'skin-cucumberboy-02' then
    v_price := 721;
    v_name := '여름 기동보이 오이소년';
    v_category := 'skin';
    v_required_character_code := 'char-cucumber-boy';
    v_required_character_name := '오이소년 캐릭터';$verify$ in v_function_sql) = 0
       or position($verify$'char-cucumber-socceroi',
      '카를레스 푸오이욜',
      './images/skins/socceroi.png',
      5,$verify$ in v_function_sql) = 0
       or position($verify$'char-cucumber-boy-summer',
      '여름 기동보이 오이소년',
      './images/skins/summerboy.png',
      503,$verify$ in v_function_sql) = 0
       or (
         length(v_function_sql) - length(
           replace(v_function_sql, v_strict_balance_replacement, '')
         )
       ) / length(v_strict_balance_replacement) <> 2 then
      raise exception 'SOCCEROI_SUMMERBOY_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_socceroi_price_anchor in v_function_sql) = 0
     or position(v_summerboy_price_anchor in v_function_sql) = 0 then
    raise exception 'SOCCEROI_SUMMERBOY_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_socceroi_inventory_anchor in v_function_sql) = 0
     or position(v_summerboy_inventory_anchor in v_function_sql) = 0 then
    raise exception 'SOCCEROI_SUMMERBOY_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_socceroi_message_anchor in v_function_sql) = 0
     or position(v_summerboy_message_anchor in v_function_sql) = 0 then
    raise exception 'SOCCEROI_SUMMERBOY_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_anchor_count := (
    length(v_function_sql) - length(
      replace(v_function_sql, v_strict_balance_anchor, '')
    )
  ) / length(v_strict_balance_anchor);

  if v_anchor_count <> 2 then
    raise exception 'SOCCEROI_SUMMERBOY_STRICT_BALANCE_ANCHOR_COUNT_INVALID: %', v_anchor_count;
  end if;

  v_function_sql := replace(
    v_function_sql,
    v_socceroi_price_anchor,
    v_socceroi_price_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_summerboy_price_anchor,
    v_summerboy_price_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_socceroi_inventory_anchor,
    v_socceroi_inventory_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_summerboy_inventory_anchor,
    v_summerboy_inventory_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_socceroi_message_anchor,
    v_socceroi_message_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_summerboy_message_anchor,
    v_summerboy_message_replacement
  );
  v_function_sql := replace(
    v_function_sql,
    v_strict_balance_anchor,
    v_strict_balance_replacement
  );

  execute v_function_sql;
end;
$add_socceroi_summerboy_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_socceroi_summerboy_purchase_store_item$
declare
  v_function_sql text;
  v_socceroi_count integer;
  v_summerboy_count integer;
  v_strict_balance_pattern text := $strict_balance_pattern$'skin-cucumber-03',
        'skin-cucumber-04',
        'skin-cucumber-05',
        'skin-cucumberboy-02',
        'skin-grilled-egg-02'$strict_balance_pattern$;
  v_strict_balance_count integer;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_socceroi_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'skin-cucumber-05', ''))
  ) / length('skin-cucumber-05');
  v_summerboy_count := (
    length(v_function_sql) - length(replace(v_function_sql, 'skin-cucumberboy-02', ''))
  ) / length('skin-cucumberboy-02');
  v_strict_balance_count := (
    length(v_function_sql) - length(
      replace(v_function_sql, v_strict_balance_pattern, '')
    )
  ) / length(v_strict_balance_pattern);

  if v_socceroi_count <> 5
     or v_summerboy_count <> 5
     or v_strict_balance_count <> 2
     or position('for update' in lower(v_function_sql)) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_function_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_function_sql) = 0
     or position('insert into public.user_store_items' in v_function_sql) = 0
     or position('insert into public.user_character_skins' in v_function_sql) = 0
     or position('insert into public.pickle_ledger' in v_function_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_function_sql) = 0
     or position('public.seoul_today()' in v_function_sql) = 0 then
    raise exception 'SOCCEROI_SUMMERBOY_PURCHASE_FUNCTION_VERIFY_FAILED';
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
    raise exception 'SOCCEROI_SUMMERBOY_PURCHASE_FUNCTION_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_socceroi_summerboy_purchase_store_item$;

commit;

select json_build_object(
  'items', json_build_array(
    json_build_object(
      'item_id', 'skin-cucumber-05',
      'server_price', 587,
      'item_name', '카를레스 푸오이욜',
      'character_code', 'char-cucumber',
      'skin_code', 'char-cucumber-socceroi'
    ),
    json_build_object(
      'item_id', 'skin-cucumberboy-02',
      'server_price', 721,
      'item_name', '여름 기동보이 오이소년',
      'character_code', 'char-cucumber-boy',
      'skin_code', 'char-cucumber-boy-summer'
    )
  ),
  'purchase_branch_counts', json_build_object(
    'skin-cucumber-05', (
      length(pg_get_functiondef('public.purchase_store_item(text)'::regprocedure))
        - length(replace(
          pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
          'skin-cucumber-05',
          ''
        ))
    ) / length('skin-cucumber-05'),
    'skin-cucumberboy-02', (
      length(pg_get_functiondef('public.purchase_store_item(text)'::regprocedure))
        - length(replace(
          pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
          'skin-cucumberboy-02',
          ''
        ))
    ) / length('skin-cucumberboy-02')
  ),
  'conflicting_owned_rows', (
    select count(*)
    from public.user_store_items item
    where (item.item_id = 'skin-cucumber-05' and (
      item.item_name is distinct from '카를레스 푸오이욜'
      or item.item_category is distinct from 'skin'
      or item.purchase_price is distinct from 587
    )) or (item.item_id = 'skin-cucumberboy-02' and (
      item.item_name is distinct from '여름 기동보이 오이소년'
      or item.item_category is distinct from 'skin'
      or item.purchase_price is distinct from 721
    ))
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
) as socceroi_summerboy_skins_result;
