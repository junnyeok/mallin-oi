-- 2026-11-13: 운영 함수 본문을 임시 스키마에 복제해 실제 사용자 잔액 변경 없이 검증한다.
-- public 테이블/함수는 읽기만 한다. 모든 테스트 데이터와 함수는 ROLLBACK으로 제거한다.
begin;
create temporary table profiles (
  id uuid primary key, pickles integer not null, updated_at timestamptz,
  equipped_character_effect_item_id text
);
create temporary table user_store_items (
  user_id uuid, item_id text, item_name text, item_category text, purchase_price integer,
  unique(user_id, item_id)
);
create temporary table pickle_ledger (
  user_id uuid, amount integer, reason_code text, reason_label text,
  description text, awarded_on date
);
create temporary table store_purchase_test_permissions (user_id uuid, can_bypass_store_balance boolean);
create temporary table user_characters (user_id uuid, character_code text);
create function pg_temp.fixture_uid() returns uuid language sql as
  $$ select '00000000-0000-4000-8000-000000000013'::uuid $$;
create function pg_temp.seoul_today() returns date language sql as
  $$ select (now() at time zone 'Asia/Seoul')::date $$;
create function pg_temp.is_auto_topup_admin_user(uuid) returns boolean language sql as $$ select true $$;
create function pg_temp.ensure_user_pickles(uuid, integer, text, text, text) returns void language plpgsql as
  $$ begin raise exception 'UNEXPECTED_AUTUMN_AUTO_TOPUP'; end $$;

do $clone$
declare v_sql text;
begin
  v_sql := pg_get_functiondef('public.purchase_store_item(text)'::regprocedure);
  v_sql := replace(replace(v_sql, 'public.', 'pg_temp.'), 'auth.uid()', 'pg_temp.fixture_uid()');
  execute v_sql;
  v_sql := pg_get_functiondef('public.enforce_equipped_character_effect_ownership()'::regprocedure);
  execute replace(v_sql, 'public.', 'pg_temp.');
end;
$clone$;
create trigger fixture_equipment before insert or update of equipped_character_effect_item_id
on pg_temp.profiles for each row execute function pg_temp.enforce_equipped_character_effect_ownership();

insert into pg_temp.profiles(id, pickles) values (pg_temp.fixture_uid(), 1000);
-- 테스트 권한 계정도 충분한 잔액에서는 455피클을 정상 차감하며, 자동충전은 하지 않는다.
insert into pg_temp.store_purchase_test_permissions values (pg_temp.fixture_uid(), true);

do $test$
declare r record; denied boolean := false;
begin
  begin
    update pg_temp.profiles set equipped_character_effect_item_id = 'cha-fall-01';
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'UNOWNED_EFFECT_WAS_ALLOWED'; end if;

  select * from pg_temp.purchase_store_item('cha-fall-01') into r;
  if not r.success or r.balance <> 545 then raise exception 'INCORRECT_AUTUMN_PURCHASE'; end if;
  if (select count(*) from pg_temp.user_store_items
      where item_id = 'cha-fall-01' and item_category = 'cha-effects' and purchase_price = 455) <> 1
     or (select count(*) from pg_temp.pickle_ledger
      where amount = -455 and reason_code = 'store_purchase' and description = '늦가을 산책 구매') <> 1 then
    raise exception 'INCORRECT_AUTUMN_OWNERSHIP_OR_LEDGER';
  end if;
  update pg_temp.profiles set equipped_character_effect_item_id = 'cha-fall-01';
  if (select equipped_character_effect_item_id from pg_temp.profiles) <> 'cha-fall-01' then
    raise exception 'AUTUMN_EQUIPMENT_FAILED';
  end if;
  update pg_temp.profiles set equipped_character_effect_item_id = null;
  select * from pg_temp.purchase_store_item('cha-fall-01') into r;
  if r.success or r.balance <> 545 or (select count(*) from pg_temp.pickle_ledger) <> 1 then
    raise exception 'DUPLICATE_AUTUMN_PURCHASE';
  end if;

  -- 새 임시 시나리오: 잔액 부족 시 지급/원장/자동충전이 발생하면 안 된다.
  truncate pg_temp.user_store_items, pg_temp.pickle_ledger;
  update pg_temp.profiles set pickles = 100;
  update pg_temp.store_purchase_test_permissions set can_bypass_store_balance = false;
  select * from pg_temp.purchase_store_item('cha-fall-01') into r;
  if r.success or r.balance <> 100
     or exists(select 1 from pg_temp.user_store_items)
     or exists(select 1 from pg_temp.pickle_ledger) then
    raise exception 'INSUFFICIENT_AUTUMN_BALANCE_NOT_PROTECTED';
  end if;
  update pg_temp.store_purchase_test_permissions set can_bypass_store_balance = true;
  select * from pg_temp.purchase_store_item('cha-fall-01') into r;
  if not r.success or r.balance <> 100
     or (select purchase_price from pg_temp.user_store_items) <> 0
     or (select amount from pg_temp.pickle_ledger) <> 0
     or (select reason_label from pg_temp.pickle_ledger) <> '테스트 상점 구매' then
    raise exception 'EXPLICIT_TEST_PERMISSION_NOT_PRESERVED';
  end if;
end;
$test$;
rollback;
select 'purchase, 455 deduction, ledger, duplicate, insufficient balance, equip, unequip, ownership, explicit test permission: PASS (rolled back)' as result;
