-- Isolated purchase tests clone the live function; all fixture data is rolled back.
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
  $$ begin raise exception 'UNEXPECTED_BOYGROUP_AUTO_TOPUP'; end $$;


do $clone$
declare v_sql text;
begin
  v_sql := pg_get_functiondef('public.purchase_store_item(text)'::regprocedure);
  execute replace(replace(v_sql, 'public.', 'pg_temp.'), 'auth.uid()', 'pg_temp.fixture_uid()');
end;
$clone$;
insert into pg_temp.profiles(id, pickles) values (pg_temp.fixture_uid(), 1000);
insert into pg_temp.store_purchase_test_permissions values (pg_temp.fixture_uid(), true);
do $test$
declare r record;
begin
  select * from pg_temp.purchase_store_item('bgm-boygroup-01') into r;
  if not r.success or r.balance <> 345 then raise exception 'BOYGROUP_INCORRECT_PURCHASE'; end if;
  if (select count(*) from pg_temp.user_store_items where item_id = 'bgm-boygroup-01' and item_name = '네가 머문 자리' and item_category = 'bgm' and purchase_price = 655) <> 1
     or (select count(*) from pg_temp.pickle_ledger where amount = -655 and reason_code = 'store_purchase' and description = '네가 머문 자리 구매') <> 1 then
    raise exception 'BOYGROUP_INCORRECT_OWNERSHIP_OR_LEDGER';
  end if;
  select * from pg_temp.purchase_store_item('bgm-boygroup-01') into r;
  if r.success or r.balance <> 345 or (select count(*) from pg_temp.pickle_ledger) <> 1 then raise exception 'BOYGROUP_DUPLICATE_PURCHASE'; end if;
  truncate pg_temp.user_store_items, pg_temp.pickle_ledger;
  update pg_temp.profiles set pickles = 100;
  update pg_temp.store_purchase_test_permissions set can_bypass_store_balance = false;
  select * from pg_temp.purchase_store_item('bgm-boygroup-01') into r;
  if r.success or r.balance <> 100 or exists(select 1 from pg_temp.user_store_items) or exists(select 1 from pg_temp.pickle_ledger) then raise exception 'BOYGROUP_INSUFFICIENT_BALANCE_NOT_PROTECTED'; end if;
  update pg_temp.store_purchase_test_permissions set can_bypass_store_balance = true;
  select * from pg_temp.purchase_store_item('bgm-boygroup-01') into r;
  if not r.success or r.balance <> 100 or (select purchase_price from pg_temp.user_store_items) <> 0 or (select amount from pg_temp.pickle_ledger) <> 0 or (select reason_label from pg_temp.pickle_ledger) <> '테스트 상점 구매' then raise exception 'BOYGROUP_EXPLICIT_TEST_PERMISSION_NOT_PRESERVED'; end if;
end;
$test$;
rollback;
select '655 purchase, ledger, duplicate, insufficient balance, test bypass: PASS (rolled back)' as result;
