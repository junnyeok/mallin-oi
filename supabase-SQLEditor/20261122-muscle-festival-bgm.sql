-- 2026-11-22 (KST): シャキッ！ムキッ！マッスル祭！ BGM을 687피클에 등록하고 상품 ID를 대표 BGM과 출시 알림에 허용한다.
begin;

do $muscle_festival_bgm$
declare
  target_item_id constant text := 'bgm-cucumbergirl&grilledegg-01';
  purchase_function constant regprocedure := to_regprocedure('public.purchase_store_item(text)');
  featured_function constant regprocedure := to_regprocedure('public.set_my_profile_featured_bgm(text)');
  catalog_function constant regprocedure := to_regprocedure('private.apply_store_release_catalog(jsonb)');
  purchase_anchors constant text[] := array[
    $price$  elsif p_item_id = 'bgm-boygroup-01' then
    v_price := 655;$price$,
    $balance$    if p_item_id = 'cha-cash-01' then
      v_can_bypass_store_balance := false;
    end if;$balance$,
    $topup$      if p_item_id = 'bgm-boygroup-01' then
        v_is_auto_topup_admin := false;
      end if;$topup$,
    $inventory$  elsif p_item_id = 'bgm-boygroup-01' then
    null;$inventory$,
    $message$      when p_item_id = 'bgm-boygroup-01'
        then '네가 머문 자리 구매가 완료됐어. 655피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$message$
  ];
  purchase_additions constant text[] := array[
    $price$  elsif p_item_id = 'bgm-cucumbergirl&grilledegg-01' then
    v_price := 687;
    v_name := 'シャキッ！ムキッ！マッスル祭！';
    v_category := 'bgm';

$price$,
    $balance$    if p_item_id = 'bgm-cucumbergirl&grilledegg-01' then
      v_can_bypass_store_balance := false;
    end if;

$balance$,
    $topup$      if p_item_id = 'bgm-cucumbergirl&grilledegg-01' then
        v_is_auto_topup_admin := false;
      end if;

$topup$,
    $inventory$  elsif p_item_id = 'bgm-cucumbergirl&grilledegg-01' then
    null;

$inventory$,
    $message$      when p_item_id = 'bgm-cucumbergirl&grilledegg-01'
        then 'シャキッ！ムキッ！マッスル祭！ 구매가 완료됐어. 687피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
$message$
  ];
  featured_anchor constant text := $featured$and (char_length(v_item_id) > 100 or v_item_id !~ '^[A-Za-z0-9_-]+$') then$featured$;
  featured_replacement constant text := $featured$and v_item_id <> 'bgm-cucumbergirl&grilledegg-01'
     and (char_length(v_item_id) > 100 or v_item_id !~ '^[A-Za-z0-9_-]+$') then$featured$;
  catalog_anchor constant text := $catalog$or value->>'id' !~ '^[A-Za-z0-9_-]{1,100}$'$catalog$;
  catalog_replacement constant text := $catalog$or (value->>'id' <> 'bgm-cucumbergirl&grilledegg-01' and value->>'id' !~ '^[A-Za-z0-9_-]{1,100}$')$catalog$;
  catalog_url_anchor constant text := $url$'/store-item.html?id=' || item.id$url$;
  catalog_url_replacement constant text := $url$'/store-item.html?id=' || replace(item.id, '&', '%26')$url$;
  function_ids constant regprocedure[] := array[purchase_function, featured_function, catalog_function];
  function_before text;
  function_sql text;
  function_id regprocedure;
  function_owner oid;
  function_acl aclitem[];
  anchor text;
  branch_index integer;
begin
  if purchase_function is null or featured_function is null or catalog_function is null
     or to_regclass('public.profiles') is null or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'MUSCLE_FESTIVAL_BGM_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'MUSCLE_FESTIVAL_BGM_INVENTORY_SCHEMA_MISMATCH';
  end if;

  if exists (
    select 1 from public.user_store_items as inventory
    where inventory.item_id = target_item_id
      and (inventory.item_name is distinct from 'シャキッ！ムキッ！マッスル祭！'
        or inventory.item_category is distinct from 'bgm'
        or inventory.purchase_price is distinct from 687)
  ) then
    raise exception 'MUSCLE_FESTIVAL_BGM_ITEM_CODE_CONFLICT';
  end if;

  foreach function_id in array function_ids loop
    select pg_get_functiondef(oid), proowner, proacl
    into function_before, function_owner, function_acl
    from pg_proc where oid = function_id;
    function_sql := function_before;

    if function_id = purchase_function then
      if position(target_item_id in function_sql) = 0 then
        for branch_index in 1..array_length(purchase_anchors, 1) loop
          anchor := purchase_anchors[branch_index];
          if (length(function_sql) - length(replace(function_sql, anchor, ''))) / length(anchor) <> 1 then
            raise exception 'MUSCLE_FESTIVAL_BGM_PURCHASE_ANCHOR_MISMATCH: %', branch_index;
          end if;
          function_sql := replace(function_sql, anchor, purchase_additions[branch_index] || anchor);
        end loop;
      end if;

      foreach anchor in array purchase_additions loop
        if position(anchor in function_sql) = 0 then
          raise exception 'MUSCLE_FESTIVAL_BGM_PURCHASE_BRANCH_MISMATCH';
        end if;
      end loop;

      if position('for update' in lower(function_sql)) = 0
         or position('if v_exists then' in function_sql) = 0
         or position('set pickles = coalesce(pickles, 0) - v_price' in function_sql) = 0
         or position('and coalesce(pickles, 0) >= v_price' in function_sql) = 0
         or position('v_charged_amount := v_price' in function_sql) = 0
         or position('insert into public.user_store_items' in function_sql) = 0
         or position('insert into public.pickle_ledger' in function_sql) = 0
         or position('-v_charged_amount' in function_sql) = 0
         or position($reason$'store_purchase'$reason$ in function_sql) = 0 then
        raise exception 'MUSCLE_FESTIVAL_BGM_PURCHASE_VERIFY_FAILED';
      end if;
    elsif function_id = featured_function then
      if position(target_item_id in function_sql) = 0
         and (length(function_sql) - length(replace(function_sql, featured_anchor, ''))) / length(featured_anchor) = 1 then
        function_sql := replace(function_sql, featured_anchor, featured_replacement);
      end if;
      if position(featured_replacement in function_sql) = 0
         or position('usi.item_id = v_item_id' in function_sql) = 0
         or position($category$usi.item_category = 'bgm'$category$ in function_sql) = 0 then
        raise exception 'MUSCLE_FESTIVAL_BGM_FEATURED_VERIFY_FAILED';
      end if;
    else
      if position(target_item_id in function_sql) = 0
         and (length(function_sql) - length(replace(function_sql, catalog_anchor, ''))) / length(catalog_anchor) = 1 then
        function_sql := replace(function_sql, catalog_anchor, catalog_replacement);
      end if;
      if (length(function_sql) - length(replace(function_sql, catalog_url_anchor, ''))) / length(catalog_url_anchor) = 1 then
        function_sql := replace(function_sql, catalog_url_anchor, catalog_url_replacement);
      end if;
      if position(catalog_replacement in function_sql) = 0
         or position(catalog_url_replacement in function_sql) = 0 then
        raise exception 'MUSCLE_FESTIVAL_BGM_CATALOG_VERIFY_FAILED';
      end if;
    end if;

    if function_sql <> function_before then
      execute function_sql;
    end if;
    if not exists (
      select 1 from pg_proc where oid = function_id
        and proowner = function_owner and proacl is not distinct from function_acl
    ) then
      raise exception 'MUSCLE_FESTIVAL_BGM_FUNCTION_PERMISSIONS_CHANGED: %', function_id;
    end if;
  end loop;

  if pg_get_function_result(purchase_function) <> 'TABLE(success boolean, message text, balance integer)'
     or not exists (
       select 1 from pg_proc where oid = purchase_function and prosecdef
         and 'search_path=public' = any(proconfig)
     ) or not exists (
       select 1 from pg_proc where oid = featured_function and prosecdef
     ) or has_function_privilege('anon', purchase_function, 'execute')
       or has_function_privilege('anon', featured_function, 'execute')
       or has_function_privilege('anon', catalog_function, 'execute')
       or has_function_privilege('authenticated', catalog_function, 'execute')
       or not has_function_privilege('authenticated', purchase_function, 'execute')
       or not has_function_privilege('authenticated', featured_function, 'execute') then
    raise exception 'MUSCLE_FESTIVAL_BGM_FUNCTION_SECURITY_MISMATCH';
  end if;
end;
$muscle_festival_bgm$;

commit;
