-- =========================================================
-- 2026-08-04 거미줄 캐릭터 효과 판매·구매·장착 보호 연동
-- - 서버 고정 가격 523피클로 기존 원자적 구매 함수에 등록한다.
-- - user_store_items 보유 기록을 캐릭터 효과 인벤토리 지급 정보로 사용한다.
-- - 일반 사용자는 523피클을 차감하고, 명시된 테스트 구매 계정만 공통 무차감 검증을 허용한다.
-- - 프로필 장착값은 실제 보유한 허용 캐릭터 효과 ID만 사용하게 한다.
-- =========================================================

begin;

do $require_spider_web_character_effect_schema$
begin
  if to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'SPIDER_WEB_CHARACTER_EFFECT_STORE_SCHEMA_REQUIRED';
  end if;

  if to_regprocedure('public.purchase_store_item(text)') is null then
    raise exception 'PURCHASE_STORE_ITEM_FUNCTION_REQUIRED';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'equipped_character_effect_item_id'
  ) then
    raise exception 'EQUIPPED_CHARACTER_EFFECT_COLUMN_REQUIRED';
  end if;

  if exists (
    select 1
    from public.user_store_items
    where item_id = 'cha-effects-web-01'
      and (
        coalesce(item_name, '') <> '거미줄 효과'
        or coalesce(item_category, '') <> 'cha-effects'
        or purchase_price <> 523
      )
  ) then
    raise exception 'SPIDER_WEB_CHARACTER_EFFECT_ITEM_ID_CONFLICT';
  end if;
end;
$require_spider_web_character_effect_schema$;

do $add_spider_web_character_effect_to_purchase_store_item$
declare
  v_function_sql text;
  v_strict_count integer := 0;
  v_price_anchor text := $price_anchor$
  elsif p_item_id = 'cha-effects-fire-01' then
    v_price := 496;
    v_name := '불꽃 효과';
    v_category := 'cha-effects';

  elsif p_item_id = 'bgm-cucumbergirl-01' then
$price_anchor$;
  v_price_replacement text := $price_replacement$
  elsif p_item_id = 'cha-effects-fire-01' then
    v_price := 496;
    v_name := '불꽃 효과';
    v_category := 'cha-effects';

  elsif p_item_id = 'cha-effects-web-01' then
    v_price := 523;
    v_name := '거미줄 효과';
    v_category := 'cha-effects';

  elsif p_item_id = 'bgm-cucumbergirl-01' then
$price_replacement$;
  v_inventory_anchor text := $inventory_anchor$
  elsif p_item_id = 'cha-effects-fire-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BF-01' then
$inventory_anchor$;
  v_inventory_replacement text := $inventory_replacement$
  elsif p_item_id = 'cha-effects-fire-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'cha-effects-web-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BF-01' then
$inventory_replacement$;
  v_message_anchor text := $message_anchor$
      when p_item_id = 'cha-effects-fire-01'
        then '불꽃 효과 구매가 완료됐어. 496피클이 차감됐고 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BF-01'
$message_anchor$;
  v_message_replacement text := $message_replacement$
      when p_item_id = 'cha-effects-fire-01'
        then '불꽃 효과 구매가 완료됐어. 496피클이 차감됐고 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'cha-effects-web-01'
        then '거미줄 효과 구매가 완료됐어. 523피클이 차감됐고 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BF-01'
$message_replacement$;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  if position($web_price$elsif p_item_id = 'cha-effects-web-01' then
    v_price := 523;
    v_name := '거미줄 효과';
    v_category := 'cha-effects';$web_price$ in v_function_sql) = 0 then
    if v_function_sql ~ $price_conflict$elsif p_item_id = 'cha-effects-web-01' then[[:space:]]+v_price :=$price_conflict$ then
      raise exception 'SPIDER_WEB_CHARACTER_EFFECT_PRICE_BRANCH_MISMATCH';
    end if;

    if position(v_price_anchor in v_function_sql) = 0 then
      raise exception 'SPIDER_WEB_CHARACTER_EFFECT_PRICE_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(v_function_sql, v_price_anchor, v_price_replacement);
  end if;

  if position($web_inventory$elsif p_item_id = 'cha-effects-web-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$web_inventory$ in v_function_sql) = 0 then
    if position(v_inventory_anchor in v_function_sql) = 0 then
      raise exception 'SPIDER_WEB_CHARACTER_EFFECT_INVENTORY_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(
      v_function_sql,
      v_inventory_anchor,
      v_inventory_replacement
    );
  end if;

  if position($web_message$then '거미줄 효과 구매가 완료됐어. 523피클이 차감됐고 인벤토리에서 장착할 수 있어.'$web_message$ in v_function_sql) = 0 then
    if position(v_message_anchor in v_function_sql) = 0 then
      raise exception 'SPIDER_WEB_CHARACTER_EFFECT_MESSAGE_ANCHOR_NOT_FOUND';
    end if;

    v_function_sql := replace(
      v_function_sql,
      v_message_anchor,
      v_message_replacement
    );
  end if;

  select count(*)
  into v_strict_count
  from regexp_matches(
    v_function_sql,
    $strict_applied$'cha-effects-fire-01',[[:space:]]*'cha-effects-web-01'$strict_applied$,
    'g'
  );

  if v_strict_count = 2 then
    v_function_sql := regexp_replace(
      v_function_sql,
      $strict_anchor$'cha-effects-fire-01',([[:space:]]*)'cha-effects-web-01',([[:space:]]*)'bgm-tetocarrto-02'$strict_anchor$,
      $strict_replacement$'cha-effects-fire-01',\1'bgm-tetocarrto-02'$strict_replacement$,
      'g'
    );
  elsif v_strict_count <> 0 then
    raise exception 'SPIDER_WEB_CHARACTER_EFFECT_STRICT_BALANCE_BRANCH_MISMATCH';
  end if;

  execute v_function_sql;
end;
$add_spider_web_character_effect_to_purchase_store_item$;

create or replace function public.enforce_equipped_character_effect_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.equipped_character_effect_item_id := nullif(
    trim(new.equipped_character_effect_item_id),
    ''
  );

  if new.equipped_character_effect_item_id is null then
    return new;
  end if;

  if new.equipped_character_effect_item_id not in (
       'cha-effects-cucumberheart-01',
       'cha-effects-fire-01',
       'cha-effects-web-01'
     )
     or not exists (
       select 1
       from public.user_store_items item
       where item.user_id = new.id
         and item.item_id = new.equipped_character_effect_item_id
         and item.item_category = 'cha-effects'
     ) then
    raise exception 'CHARACTER_EFFECT_NOT_OWNED'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_character_effect_ownership_trigger
on public.profiles;

create trigger profiles_character_effect_ownership_trigger
before insert or update of equipped_character_effect_item_id
on public.profiles
for each row
execute function public.enforce_equipped_character_effect_ownership();

revoke all on function public.enforce_equipped_character_effect_ownership()
from public, anon, authenticated;
revoke all on function public.purchase_store_item(text) from public, anon;
grant execute on function public.purchase_store_item(text) to authenticated;

do $verify_spider_web_character_effect$
declare
  v_function_sql text;
  v_ownership_sql text;
  v_strict_count integer := 0;
begin
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  into v_function_sql;

  select pg_get_functiondef(
    'public.enforce_equipped_character_effect_ownership()'::regprocedure
  ) into v_ownership_sql;

  select count(*)
  into v_strict_count
  from regexp_matches(
    v_function_sql,
    $strict_applied$'cha-effects-fire-01',[[:space:]]*'cha-effects-web-01'$strict_applied$,
    'g'
  );

  if position($web_price$elsif p_item_id = 'cha-effects-web-01' then
    v_price := 523;
    v_name := '거미줄 효과';
    v_category := 'cha-effects';$web_price$ in v_function_sql) = 0
     or position($web_inventory$elsif p_item_id = 'cha-effects-web-01' then
    -- 캐릭터 효과는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$web_inventory$ in v_function_sql) = 0
     or position($web_message$then '거미줄 효과 구매가 완료됐어. 523피클이 차감됐고 인벤토리에서 장착할 수 있어.'$web_message$ in v_function_sql) = 0
     or v_strict_count <> 0 then
    raise exception 'SPIDER_WEB_CHARACTER_EFFECT_PURCHASE_VERIFY_FAILED';
  end if;

  if position('cha-effects-web-01' in v_ownership_sql) = 0
     or not exists (
       select 1
       from pg_trigger
       where tgrelid = 'public.profiles'::regclass
         and tgname = 'profiles_character_effect_ownership_trigger'
         and not tgisinternal
     )
     or has_function_privilege(
       'anon',
       'public.purchase_store_item(text)',
       'execute'
     )
     or not has_function_privilege(
       'authenticated',
       'public.purchase_store_item(text)',
       'execute'
     ) then
    raise exception 'SPIDER_WEB_CHARACTER_EFFECT_PERMISSION_VERIFY_FAILED';
  end if;
end;
$verify_spider_web_character_effect$;

commit;

-- 적용 후 읽기 검증: boolean은 기대값과 같고 strict_balance_occurrences는 0이어야 한다.
select json_build_object(
  'web_price_mapping_applied', position(
    $verify$v_price := 523;
    v_name := '거미줄 효과';$verify$
    in pg_get_functiondef('public.purchase_store_item(text)'::regprocedure)
  ) > 0,
  'strict_balance_occurrences', (
    select count(*)
    from regexp_matches(
      pg_get_functiondef('public.purchase_store_item(text)'::regprocedure),
      $verify$'cha-effects-fire-01',[[:space:]]*'cha-effects-web-01'$verify$,
      'g'
    )
  ),
  'ownership_allowlist_applied', position(
    'cha-effects-web-01'
    in pg_get_functiondef(
      'public.enforce_equipped_character_effect_ownership()'::regprocedure
    )
  ) > 0,
  'ownership_trigger_exists', exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.profiles'::regclass
      and tgname = 'profiles_character_effect_ownership_trigger'
      and not tgisinternal
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
) as spider_web_character_effect_result;
