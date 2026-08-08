-- =========================================================
-- 2026-08-08 신규 BGM 「まだいけるよ」·「MUSCLE NIGHT」 판매 지원
-- 721·653피클 차감, BGM 인벤토리 지급, 피클 내역 기록
-- - 기존 원자적 구매 함수에 서버 고정 상품 정보를 추가한다.
-- - 테스트 잔액 우회와 관리자 자동충전을 차단한다.
-- - 기존 분기나 보유 데이터가 예상 값과 다르면 전체 작업을 중단한다.
-- =========================================================

begin;

do $validate_run_muscle_night_dependencies$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null
     or to_regclass('public.store_purchase_test_permissions') is null then
    raise exception 'RUN_MUSCLE_NIGHT_PURCHASE_TABLE_MISSING';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.ensure_user_pickles(uuid,integer,text,text,text)') is null
     or to_regprocedure('public.is_auto_topup_admin_user(uuid)') is null
     or to_regprocedure('public.seoul_today()') is null then
    raise exception 'RUN_MUSCLE_NIGHT_PURCHASE_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.user_store_items'::regclass
      and constraint_row.contype = 'u'
      and pg_get_constraintdef(constraint_row.oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'RUN_MUSCLE_NIGHT_OWNERSHIP_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if exists (
    select 1
    from public.user_store_items item
    where item.item_id = 'bgm-cucumbergirl-02'
      and (
        item.item_name is distinct from 'まだいけるよ'
        or item.item_category is distinct from 'bgm'
        or item.purchase_price is distinct from 721
      )
  ) then
    raise exception 'RUN_BGM_ITEM_ID_CONFLICT';
  end if;

  if exists (
    select 1
    from public.user_store_items item
    where item.item_id = 'bgm-grilledegg-02'
      and (
        item.item_name is distinct from 'MUSCLE NIGHT'
        or item.item_category is distinct from 'bgm'
        or item.purchase_price is distinct from 653
      )
  ) then
    raise exception 'MUSCLE_NIGHT_BGM_ITEM_ID_CONFLICT';
  end if;
end;
$validate_run_muscle_night_dependencies$;

do $add_run_muscle_night_to_purchase_store_item$
declare
  v_function_sql text;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'bgm-potato-02' then
    v_price := 698;
    v_name := '텅 빈 거리';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'bgm-potato-02' then
    v_price := 698;
    v_name := '텅 빈 거리';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-cucumbergirl-02' then
    v_price := 721;
    v_name := 'まだいけるよ';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-grilledegg-02' then
    v_price := 653;
    v_name := 'MUSCLE NIGHT';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'bgm-potato-02' then
    null;

  elsif p_item_id = 'cha-effects-cucumberheart-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'bgm-potato-02' then
    null;

  elsif p_item_id = 'bgm-cucumbergirl-02' then
    null;

  elsif p_item_id = 'bgm-grilledegg-02' then
    null;

  elsif p_item_id = 'cha-effects-cucumberheart-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'bgm-potato-02'
        then '텅 빈 거리 구매가 완료됐어. 698피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'cha-effects-cucumberheart-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'bgm-potato-02'
        then '텅 빈 거리 구매가 완료됐어. 698피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-cucumbergirl-02'
        then 'まだいけるよ 구매가 완료됐어. 721피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-grilledegg-02'
        then 'MUSCLE NIGHT 구매가 완료됐어. 653피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'cha-effects-cucumberheart-01'
$message_replacement$;
  v_strict_balance_anchor text := $strict_balance_anchor$'bgm-potato-02',
        'BF-02'$strict_balance_anchor$;
  v_strict_balance_replacement text := $strict_balance_replacement$'bgm-potato-02',
        'bgm-cucumbergirl-02',
        'bgm-grilledegg-02',
        'BF-02'$strict_balance_replacement$;
  v_anchor_count integer;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position('bgm-cucumbergirl-02' in v_function_sql) > 0
     or position('bgm-grilledegg-02' in v_function_sql) > 0 then
    if position($price$p_item_id = 'bgm-cucumbergirl-02' then
    v_price := 721;
    v_name := 'まだいけるよ';
    v_category := 'bgm';$price$ in v_function_sql) = 0
       or position($price$p_item_id = 'bgm-grilledegg-02' then
    v_price := 653;
    v_name := 'MUSCLE NIGHT';
    v_category := 'bgm';$price$ in v_function_sql) = 0
       or position($inventory$elsif p_item_id = 'bgm-cucumbergirl-02' then
    null;$inventory$ in v_function_sql) = 0
       or position($inventory$elsif p_item_id = 'bgm-grilledegg-02' then
    null;$inventory$ in v_function_sql) = 0
       or position($message$then 'まだいけるよ 구매가 완료됐어. 721피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$ in v_function_sql) = 0
       or position($message$then 'MUSCLE NIGHT 구매가 완료됐어. 653피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$ in v_function_sql) = 0
       or (
         length(v_function_sql) - length(
           replace(v_function_sql, v_strict_balance_replacement, '')
         )
       ) / length(v_strict_balance_replacement) <> 2 then
      raise exception 'RUN_MUSCLE_NIGHT_EXISTING_BRANCH_MISMATCH';
    end if;

    return;
  end if;

  if position(v_price_anchor in v_function_sql) = 0 then
    raise exception 'RUN_MUSCLE_NIGHT_PRICE_ANCHOR_NOT_FOUND';
  end if;

  if position(v_inventory_anchor in v_function_sql) = 0 then
    raise exception 'RUN_MUSCLE_NIGHT_INVENTORY_ANCHOR_NOT_FOUND';
  end if;

  if position(v_message_anchor in v_function_sql) = 0 then
    raise exception 'RUN_MUSCLE_NIGHT_MESSAGE_ANCHOR_NOT_FOUND';
  end if;

  v_anchor_count := (
    length(v_function_sql) - length(
      replace(v_function_sql, v_strict_balance_anchor, '')
    )
  ) / length(v_strict_balance_anchor);

  if v_anchor_count <> 2 then
    raise exception 'RUN_MUSCLE_NIGHT_STRICT_BALANCE_ANCHOR_COUNT_INVALID: %', v_anchor_count;
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
$add_run_muscle_night_to_purchase_store_item$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_run_muscle_night_purchase_store_item$
declare
  v_function_sql text;
  v_strict_balance_pattern text := $strict_balance_pattern$'bgm-potato-02',
        'bgm-cucumbergirl-02',
        'bgm-grilledegg-02',
        'BF-02'$strict_balance_pattern$;
  v_strict_balance_count integer;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_strict_balance_count := (
    length(v_function_sql) - length(
      replace(v_function_sql, v_strict_balance_pattern, '')
    )
  ) / length(v_strict_balance_pattern);

  if position($price$p_item_id = 'bgm-cucumbergirl-02' then
    v_price := 721;
    v_name := 'まだいけるよ';
    v_category := 'bgm';$price$ in v_function_sql) = 0
     or position($price$p_item_id = 'bgm-grilledegg-02' then
    v_price := 653;
    v_name := 'MUSCLE NIGHT';
    v_category := 'bgm';$price$ in v_function_sql) = 0
     or position($inventory$elsif p_item_id = 'bgm-cucumbergirl-02' then
    null;$inventory$ in v_function_sql) = 0
     or position($inventory$elsif p_item_id = 'bgm-grilledegg-02' then
    null;$inventory$ in v_function_sql) = 0
     or position($message$then 'まだいけるよ 구매가 완료됐어. 721피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$ in v_function_sql) = 0
     or position($message$then 'MUSCLE NIGHT 구매가 완료됐어. 653피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$ in v_function_sql) = 0
     or v_strict_balance_count <> 2
     or position('for update' in lower(v_function_sql)) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_function_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_function_sql) = 0
     or position('insert into public.user_store_items' in v_function_sql) = 0
     or position('insert into public.pickle_ledger' in v_function_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_function_sql) = 0
     or position('public.seoul_today()' in v_function_sql) = 0 then
    raise exception 'RUN_MUSCLE_NIGHT_PURCHASE_FUNCTION_VERIFY_FAILED';
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
    raise exception 'RUN_MUSCLE_NIGHT_PURCHASE_FUNCTION_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_run_muscle_night_purchase_store_item$;

commit;

select json_build_object(
  'items', json_build_array(
    json_build_object(
      'item_id', 'bgm-cucumbergirl-02',
      'server_price', 721,
      'item_name', 'まだいけるよ',
      'item_category', 'bgm'
    ),
    json_build_object(
      'item_id', 'bgm-grilledegg-02',
      'server_price', 653,
      'item_name', 'MUSCLE NIGHT',
      'item_category', 'bgm'
    )
  ),
  'purchase_branches_present',
    position(
      $verify$p_item_id = 'bgm-cucumbergirl-02'$verify$
      in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
    ) > 0
    and position(
      $verify$p_item_id = 'bgm-grilledegg-02'$verify$
      in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
    ) > 0,
  'inventory_branches_present',
    position(
      $verify$elsif p_item_id = 'bgm-cucumbergirl-02' then
    null;$verify$
      in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
    ) > 0
    and position(
      $verify$elsif p_item_id = 'bgm-grilledegg-02' then
    null;$verify$
      in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
    ) > 0,
  'strict_balance_list_occurrences', (
    length(pg_get_functiondef('public.purchase_store_item(text)'::regprocedure))
      - length(replace(
        pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
        $verify$'bgm-potato-02',
        'bgm-cucumbergirl-02',
        'bgm-grilledegg-02',
        'BF-02'$verify$,
        ''
      ))
  ) / length($verify$'bgm-potato-02',
        'bgm-cucumbergirl-02',
        'bgm-grilledegg-02',
        'BF-02'$verify$),
  'conflicting_owned_rows', (
    select count(*)
    from public.user_store_items item
    where (item.item_id = 'bgm-cucumbergirl-02' and (
      item.item_name is distinct from 'まだいけるよ'
      or item.item_category is distinct from 'bgm'
      or item.purchase_price is distinct from 721
    )) or (item.item_id = 'bgm-grilledegg-02' and (
      item.item_name is distinct from 'MUSCLE NIGHT'
      or item.item_category is distinct from 'bgm'
      or item.purchase_price is distinct from 653
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
) as run_muscle_night_bgm_result;
