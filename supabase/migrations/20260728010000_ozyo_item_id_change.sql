-- =========================================================
-- 2026-07-28 오죠 이토루 상품 ID 변경 및 기존 보유자 호환
-- - 상품 ID를 skin-cucumber-01에서 skin-cucumber-03으로 변경한다.
-- - 기존 오죠 이토루 보유 기록만 새 ID로 이전한다.
-- - 서버 가격 775피클과 기존 원자적 구매·스킨 지급·피클 내역 구조는 유지한다.
-- =========================================================

begin;

do $preflight_ozyo_item_id_change$
declare
  v_function_sql text;
  v_old_literal text := $old_literal$'skin-cucumber-01'$old_literal$;
  v_new_literal text := $new_literal$'skin-cucumber-03'$new_literal$;
  v_old_count integer := 0;
  v_new_count integer := 0;
begin
  if to_regclass('public.user_store_items') is null
     or to_regclass('public.user_character_skins') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'OZYO_STORE_SCHEMA_REQUIRED';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;

  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_old_count := (
    length(v_function_sql) - length(replace(v_function_sql, v_old_literal, ''))
  ) / length(v_old_literal);
  v_new_count := (
    length(v_function_sql) - length(replace(v_function_sql, v_new_literal, ''))
  ) / length(v_new_literal);

  if v_old_count > 0 then
    if v_old_count <> 5 or v_new_count <> 0 then
      raise exception 'OZYO_PURCHASE_FUNCTION_ID_COUNT_UNEXPECTED old=%, new=%',
        v_old_count,
        v_new_count;
    end if;

    if position($old_price$elsif p_item_id = 'skin-cucumber-01' then
    v_price := 775;
    v_name := '오죠 이토루';
    v_category := 'skin';$old_price$ in v_function_sql) = 0
       or position($old_inventory$elsif p_item_id = 'skin-cucumber-01' then
    insert into public.user_characters ($old_inventory$ in v_function_sql) = 0
       or position($old_message$when p_item_id = 'skin-cucumber-01'
        then '오죠 이토루 구매가 완료됐어. 775피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'$old_message$ in v_function_sql) = 0
       or position($old_strict$p_item_id not in ('BG-03', 'BG-04', 'skin-cucumber-01')$old_strict$ in v_function_sql) = 0 then
      raise exception 'OZYO_PURCHASE_FUNCTION_OLD_MAPPING_UNEXPECTED';
    end if;
  elsif v_new_count > 0 then
    if v_new_count <> 5 then
      raise exception 'OZYO_PURCHASE_FUNCTION_NEW_ID_COUNT_UNEXPECTED new=%',
        v_new_count;
    end if;
  else
    raise exception 'OZYO_PURCHASE_FUNCTION_MAPPING_NOT_FOUND';
  end if;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'skin-cucumber-03'
      and item_name <> '오죠 이토루'
  ) then
    raise exception 'OZYO_NEW_ITEM_ID_CONFLICT';
  end if;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'skin-cucumber-01'
      and item_name not in ('오죠 이토루', '군인오이 스킨')
  ) then
    raise exception 'OZYO_OLD_ITEM_ID_HAS_UNKNOWN_OWNER_RECORD';
  end if;

  raise notice 'purchase_store_item(text) permissions before update: authenticated=%, anon=%',
    has_function_privilege(
      'authenticated',
      'public.purchase_store_item(text)',
      'EXECUTE'
    ),
    has_function_privilege(
      'anon',
      'public.purchase_store_item(text)',
      'EXECUTE'
    );

  raise notice 'Ozyo ownership before update: old=%, new=%',
    (
      select count(*)
      from public.user_store_items
      where item_id = 'skin-cucumber-01'
        and item_name = '오죠 이토루'
    ),
    (
      select count(*)
      from public.user_store_items
      where item_id = 'skin-cucumber-03'
        and item_name = '오죠 이토루'
    );
end;
$preflight_ozyo_item_id_change$;

-- 이전 오죠 배포 전에 남아 있던 군인오이 구 ID도 안전하게 정리한다.
delete from public.user_store_items old_item
where old_item.item_id = 'skin-cucumber-01'
  and old_item.item_name = '군인오이 스킨'
  and exists (
    select 1
    from public.user_store_items soldier_item
    where soldier_item.user_id = old_item.user_id
      and soldier_item.item_id = 'skin-cucumber-soldier-01'
  );

update public.user_store_items
set item_id = 'skin-cucumber-soldier-01'
where item_id = 'skin-cucumber-01'
  and item_name = '군인오이 스킨';

do $verify_ozyo_old_owner_scope$
begin
  if exists (
    select 1
    from public.user_store_items
    where item_id = 'skin-cucumber-01'
      and item_name <> '오죠 이토루'
  ) then
    raise exception 'OZYO_OLD_ITEM_ID_HAS_UNKNOWN_OWNER_RECORD';
  end if;
end;
$verify_ozyo_old_owner_scope$;

-- 한 사용자가 예외적으로 양쪽 ID를 모두 보유했다면 새 ID를 남기고 구 ID만 제거한다.
delete from public.user_store_items old_item
where old_item.item_id = 'skin-cucumber-01'
  and old_item.item_name = '오죠 이토루'
  and exists (
    select 1
    from public.user_store_items new_item
    where new_item.user_id = old_item.user_id
      and new_item.item_id = 'skin-cucumber-03'
      and new_item.item_name = '오죠 이토루'
  );

update public.user_store_items
set item_id = 'skin-cucumber-03'
where item_id = 'skin-cucumber-01'
  and item_name = '오죠 이토루';

do $change_ozyo_purchase_item_id$
declare
  v_function_sql text;
  v_old_literal text := $old_literal$'skin-cucumber-01'$old_literal$;
  v_new_literal text := $new_literal$'skin-cucumber-03'$new_literal$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position(v_old_literal in v_function_sql) = 0 then
    return;
  end if;

  v_function_sql := replace(v_function_sql, v_old_literal, v_new_literal);
  execute v_function_sql;
end;
$change_ozyo_purchase_item_id$;

revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_ozyo_item_id_change$
declare
  v_function_sql text;
  v_old_literal text := $old_literal$'skin-cucumber-01'$old_literal$;
  v_new_literal text := $new_literal$'skin-cucumber-03'$new_literal$;
  v_new_count integer := 0;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  v_new_count := (
    length(v_function_sql) - length(replace(v_function_sql, v_new_literal, ''))
  ) / length(v_new_literal);

  if position(v_old_literal in v_function_sql) > 0
     or v_new_count <> 5
     or position($new_price$elsif p_item_id = 'skin-cucumber-03' then
    v_price := 775;
    v_name := '오죠 이토루';
    v_category := 'skin';$new_price$ in v_function_sql) = 0
     or position($new_inventory$elsif p_item_id = 'skin-cucumber-03' then
    insert into public.user_characters ($new_inventory$ in v_function_sql) = 0
     or position($new_message$when p_item_id = 'skin-cucumber-03'
        then '오죠 이토루 구매가 완료됐어. 775피클이 차감됐고 기본오이 스킨 인벤토리에서 착용할 수 있어.'$new_message$ in v_function_sql) = 0
     or position($new_strict$p_item_id not in ('BG-03', 'BG-04', 'skin-cucumber-03')$new_strict$ in v_function_sql) = 0 then
    raise exception 'OZYO_PURCHASE_FUNCTION_VERIFY_FAILED';
  end if;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'skin-cucumber-01'
      and item_name in ('오죠 이토루', '군인오이 스킨')
  ) then
    raise exception 'OZYO_STALE_OWNER_ITEM_ID_REMAINS';
  end if;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'skin-cucumber-03'
      and item_name <> '오죠 이토루'
  ) then
    raise exception 'OZYO_NEW_ITEM_ID_CONFLICT';
  end if;

  if not has_function_privilege(
    'authenticated',
    'public.purchase_store_item(text)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.purchase_store_item(text)',
    'EXECUTE'
  ) then
    raise exception 'OZYO_PURCHASE_FUNCTION_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_ozyo_item_id_change$;

commit;

select
  (
    select count(*)
    from public.user_store_items
    where item_id = 'skin-cucumber-03'
      and item_name = '오죠 이토루'
  ) as ozyo_purchase_count,
  (
    select count(*)
    from public.user_store_items
    where item_id = 'skin-cucumber-01'
      and item_name = '오죠 이토루'
  ) as stale_ozyo_purchase_count,
  position(
    $verify$v_price := 775;
    v_name := '오죠 이토루';$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0 as ozyo_price_mapping_preserved,
  position(
    $verify$elsif p_item_id = 'skin-cucumber-03' then$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0 as ozyo_new_item_id_applied;
