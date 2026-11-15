-- 2026-11-16 (한국) 네가 머문 자리: bgm-boygroup-01, 655피클
-- 상품 배포 시 실행한다. 기존 운영 함수의 이번 상품 분기만 추가한다.
-- 기존 구매 함수의 이번 상품 분기만 추가하며 다른 상품/구매 기록/권한은 보존한다.
-- 일반 구매는 655피클 차감. 기존 명시적 잔액 부족 테스트 구매 권한은 유지한다.
-- 관리자 자동충전 없이 실제 차감액을 피클 원장에 기록한다.
begin;

do $boygroup_bgm$
declare
  v_sql text;
  v_anchor text;
  v_price_anchor text := $anchor_price$  elsif p_item_id = 'bgm-cucumbergirl-03' then
    v_price := 588;
    v_name := 'PIXEL HEART';
    v_category := 'bgm';$anchor_price$;
  v_price text := $branch_price$

  elsif p_item_id = 'bgm-boygroup-01' then
    v_price := 655;
    v_name := '네가 머문 자리';
    v_category := 'bgm';$branch_price$;
  v_inventory_anchor text := $anchor_inventory$  elsif p_item_id = 'bgm-cucumbergirl-03' then
    null;$anchor_inventory$;
  v_inventory text := $branch_inventory$

  elsif p_item_id = 'bgm-boygroup-01' then
    null;$branch_inventory$;
  v_message_anchor text := $anchor_message$      when p_item_id = 'bgm-cucumbergirl-03'
        then 'PIXEL HEART 구매가 완료됐어. 588피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$anchor_message$;
  v_message text := $branch_message$
      when p_item_id = 'bgm-boygroup-01'
        then '네가 머문 자리 구매가 완료됐어. 655피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'$branch_message$;
  v_topup_anchor text := $anchor_topup$      if p_item_id = 'BG-07' then$anchor_topup$;
  v_topup text := $branch_topup$      if p_item_id = 'bgm-boygroup-01' then
        v_is_auto_topup_admin := false;
      end if;

$branch_topup$;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'BOYGROUP_BGM_PURCHASE_DEPENDENCY_MISSING';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) then
    raise exception 'BOYGROUP_BGM_OWNERSHIP_UNIQUE_CONSTRAINT_MISSING';
  end if;
  if exists (
    select 1 from public.user_store_items where item_id = 'bgm-boygroup-01'
      and (item_name is distinct from '네가 머문 자리'
        or item_category is distinct from 'bgm'
        or purchase_price not in (0, 655))
  ) then
    raise exception 'BOYGROUP_BGM_ITEM_ID_CONFLICT';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  if position('bgm-boygroup-01' in v_sql) = 0 then
    foreach v_anchor in array array[v_price_anchor, v_inventory_anchor, v_message_anchor, v_topup_anchor] loop
      if (length(v_sql) - length(replace(v_sql, v_anchor, ''))) / length(v_anchor) <> 1 then
        raise exception 'BOYGROUP_BGM_PURCHASE_ANCHOR_MISMATCH';
      end if;
    end loop;
    v_sql := replace(v_sql, v_price_anchor, v_price_anchor || v_price);
    v_sql := replace(v_sql, v_inventory_anchor, v_inventory_anchor || v_inventory);
    v_sql := replace(v_sql, v_message_anchor, v_message_anchor || v_message);
    v_sql := replace(v_sql, v_topup_anchor, v_topup || v_topup_anchor);
    execute v_sql;
  end if;
  if position(v_price in v_sql) = 0 or position(v_inventory in v_sql) = 0
     or position(v_message in v_sql) = 0 or position(v_topup in v_sql) = 0
     or position('for update' in lower(v_sql)) = 0
     or position('if v_exists then' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in v_sql) = 0
     or position('insert into public.user_store_items' in v_sql) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('-v_charged_amount' in v_sql) = 0
     or position('public.seoul_today()' in v_sql) = 0 then
    raise exception 'BOYGROUP_BGM_PURCHASE_VERIFY_FAILED';
  end if;
  if pg_get_function_result('public.purchase_store_item(text)'::regprocedure)
       <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure)
     or not ('search_path=public' = any (
       select unnest(proconfig) from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure
     ))
     or has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute') then
    raise exception 'BOYGROUP_BGM_PURCHASE_SECURITY_MISMATCH';
  end if;
end;
$boygroup_bgm$;

commit;
