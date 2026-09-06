-- 2026-09-06 PIXEL HEART: 588피클 구매, BGM 인벤토리와 피클 원장 기록
-- 현재 구매 함수를 부분 갱신하여 기존 상품/테스트 계정 정책을 보존한다.
-- 새 상품은 관리자 자동충전 대상에서 제외한다. 일반 구매는 잔액을 차감한다.
begin;

do $pixel_heart_purchase$
declare
  v_sql text;
  v_anchor text;
  v_price_anchor text := $anchor$  elsif p_item_id = 'bgm-grilledegg-02' then
    v_price := 653;
    v_name := 'MUSCLE NIGHT';
    v_category := 'bgm';$anchor$;
  v_price text := $branch$

  elsif p_item_id = 'bgm-cucumbergirl-03' then
    v_price := 588;
    v_name := 'PIXEL HEART';
    v_category := 'bgm';$branch$;
  v_inventory_anchor text := $anchor$  elsif p_item_id = 'bgm-grilledegg-02' then
    null;$anchor$;
  v_inventory text := $branch$

  elsif p_item_id = 'bgm-cucumbergirl-03' then
    null;$branch$;
  v_message_anchor text := $anchor$      when p_item_id = 'bgm-grilledegg-02'
        then 'MUSCLE NIGHT 구매가 완료됐어. 653피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$anchor$;
  v_message text := $branch$
      when p_item_id = 'bgm-cucumbergirl-03'
        then 'PIXEL HEART 구매가 완료됐어. 588피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$branch$;
  v_list_pattern text := $pattern$'bgm-grilledegg-02',([[:space:]]*)'BF-02'$pattern$;
  v_list_replacement text := $replacement$'bgm-grilledegg-02',\1'bgm-cucumbergirl-03',\1'BF-02'$replacement$;
  v_count integer;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'PIXEL_HEART_PURCHASE_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'PIXEL_HEART_OWNERSHIP_UNIQUE_CONSTRAINT_MISSING';
  end if;

  if exists (
    select 1 from public.user_store_items
    where item_id = 'bgm-cucumbergirl-03'
      and (item_name is distinct from 'PIXEL HEART'
        or item_category is distinct from 'bgm'
        or purchase_price not in (0, 588))
  ) then
    raise exception 'PIXEL_HEART_ITEM_ID_CONFLICT';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  if position('bgm-cucumbergirl-03' in v_sql) = 0 then
    foreach v_anchor in array array[v_price_anchor, v_inventory_anchor, v_message_anchor] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'PIXEL_HEART_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    select count(*) into v_count from regexp_matches(v_sql, v_list_pattern, 'g');
    if v_count not in (1, 2) then
      raise exception 'PIXEL_HEART_BALANCE_POLICY_ANCHOR_MISMATCH';
    end if;
    v_sql := replace(v_sql, v_price_anchor, v_price_anchor || v_price);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory_anchor || v_inventory);
    v_sql := replace(v_sql, v_message_anchor, v_message_anchor || v_message);
    v_sql := regexp_replace(v_sql, v_list_pattern, v_list_replacement, 'g');
    execute v_sql;
  end if;

  if position(v_price in v_sql) = 0 or position(v_inventory in v_sql) = 0
     or position(v_message in v_sql) = 0
     or v_sql !~ $policy$'bgm-grilledegg-02',[[:space:]]*'bgm-cucumbergirl-03',[[:space:]]*'BF-02'$policy$
     or position('for update' in lower(v_sql)) = 0
     or position('if v_exists then' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0
     or position($reason$'store_purchase'$reason$ in v_sql) = 0
     or position('public.seoul_today()' in v_sql) = 0 then
    raise exception 'PIXEL_HEART_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     )) then
    raise exception 'PIXEL_HEART_PURCHASE_SIGNATURE_MISMATCH';
  end if;
end;
$pixel_heart_purchase$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $pixel_heart_permissions$
begin
  if has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'PIXEL_HEART_PURCHASE_PERMISSION_MISMATCH';
  end if;
end;
$pixel_heart_permissions$;

commit;
