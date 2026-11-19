-- 2026-11-19 (KST): 판매 종료한 스킨 네 종을 회수하고 피클을 지급한다.
begin;

-- 구매 함수가 먼저 잡는 프로필 잠금을 시작부터 확보한다.
set local lock_timeout = '8s';
lock table public.profiles in exclusive mode;
lock table public.user_store_items, public.user_character_skins in share row exclusive mode;

do $block_retired_skin_purchases$
declare
  purchase_function constant regprocedure := to_regprocedure('public.purchase_store_item(text)');
  price_branch constant text := $anchor$  if p_item_id = 'emo-basic-01' then$anchor$;
  retired_guard constant text := $guard$  if p_item_id in ('skin-cucumber-03', 'skin-cucumber-04', 'skin-grilled-egg-02') then
    return query
    select false, '판매가 종료된 상품이야.',
      coalesce((select p.pickles from public.profiles p where p.id = v_user_id), 0);
    return;
  end if;

$guard$;
  purchase_sql text;
begin
  if purchase_function is null then
    raise exception 'STORE_PURCHASE_FUNCTION_MISSING';
  end if;

  purchase_sql := pg_get_functiondef(purchase_function);
  if purchase_sql !~ $daegu$if p_item_id = 'skin-cucumber-07' then\s+return query\s+select false, '판매가 종료된 상품이야.'$daegu$ then
    raise exception 'STORE_DAEGU_RETIREMENT_REQUIRED';
  end if;

  if position(retired_guard in purchase_sql) = 0 then
    if (length(purchase_sql) - length(replace(purchase_sql, price_branch, '')))
       / length(price_branch) <> 2 then
      raise exception 'STORE_PURCHASE_PRICE_BRANCH_MISMATCH';
    end if;

    -- 이모티콘 지급 분기에도 같은 IF가 있으므로 첫 번째 가격 분기에만 덧붙인다.
    execute overlay(purchase_sql placing retired_guard
      from position(price_branch in purchase_sql) for 0);
  end if;

  if position(retired_guard || price_branch in pg_get_functiondef(purchase_function)) = 0
     or pg_get_function_result(purchase_function) <> 'TABLE(success boolean, message text, balance integer)'
     or not (select prosecdef from pg_proc where oid = purchase_function)
     or has_function_privilege('anon', purchase_function, 'execute')
     or not has_function_privilege('authenticated', purchase_function, 'execute') then
    raise exception 'STORE_PURCHASE_RETIREMENT_VERIFY_FAILED';
  end if;
end;
$block_retired_skin_purchases$;

-- 판매 종료 시 지급 단가는 각 상품의 정상 판매가다.
create temporary table retired_skin_catalog (
  item_id text primary key,
  skin_code text not null unique,
  item_name text not null,
  image_filename text not null unique,
  price integer not null
) on commit drop;

insert into retired_skin_catalog values
  ('skin-cucumber-03', 'char-cucumber-ozyo', '오죠 이토루', 'ozyo.png', 775),
  ('skin-cucumber-04', 'char-cucumber-kind', '당신의 친절한 오이', 'spioi.png', 621),
  ('skin-cucumber-07', 'char-cucumber-daegu', '대구FC 오이', 'cucumber-daegu.png', 389),
  ('skin-grilled-egg-02', 'char-grilled-egg-inomske', '이놈스케', 'inomske.png', 689);

-- 기존 구매 및 스킨 행을 운영 기록으로 보관한다. 같은 계정·상품을 두 번 지급하지 않는다.
create schema if not exists private;
create table if not exists private.retired_store_skin_settlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_id text not null,
  item_name text not null,
  awarded_pickles integer not null check (awarded_pickles >= 0),
  store_rows jsonb not null,
  skin_row jsonb,
  previous_equipped_image text,
  settled_at timestamptz not null default now(),
  primary key (user_id, item_id)
);
revoke all on table private.retired_store_skin_settlements from public, anon, authenticated;

create temporary table retired_skin_store_rows on commit drop as
select s.user_id, s.id, c.item_id, to_jsonb(s) as row_data
from public.user_store_items s
join pg_temp.retired_skin_catalog c
  on c.item_id = s.item_id
  or (c.item_id = 'skin-cucumber-03' and s.item_id = 'skin-cucumber-01' and s.item_name = c.item_name);

create temporary table retired_skin_changes on commit drop as
with store_records as (
  select user_id, item_id, jsonb_agg(row_data order by id) as store_rows
  from pg_temp.retired_skin_store_rows
  group by user_id, item_id
), skin_records as (
  select s.user_id, c.item_id, to_jsonb(s) as skin_row
  from public.user_character_skins s
  join pg_temp.retired_skin_catalog c on c.skin_code = s.skin_code
), equipped as (
  select p.id as user_id, c.item_id, p.equipped_character_image_url as previous_equipped_image
  from public.profiles p
  join pg_temp.retired_skin_catalog c on substring(
    btrim(p.equipped_character_image_url) from '(?:^|/)images/skins/([^?#/]+)(?:[?#].*)?$'
  ) = c.image_filename
), recipients as (
  select user_id, item_id from store_records
  union select user_id, item_id from skin_records
  union select user_id, item_id from equipped
)
select r.user_id, c.item_id, c.item_name,
  case when s.user_id is not null or k.user_id is not null then c.price else 0 end as awarded_pickles,
  coalesce(s.store_rows, '[]'::jsonb) as store_rows,
  k.skin_row,
  e.previous_equipped_image
from recipients r
join pg_temp.retired_skin_catalog c on c.item_id = r.item_id
join public.profiles p on p.id = r.user_id
left join store_records s on s.user_id = r.user_id and s.item_id = r.item_id
left join skin_records k on k.user_id = r.user_id and k.item_id = r.item_id
left join equipped e on e.user_id = r.user_id and e.item_id = r.item_id;

-- 기존 정산은 건너뛰고, 이번 트랜잭션에서 새로 보관된 내역만 지급한다.
create temporary table retired_skin_new_settlements on commit drop as
select c.*
from pg_temp.retired_skin_changes c
where not exists (
  select 1 from private.retired_store_skin_settlements s
  where s.user_id = c.user_id and s.item_id = c.item_id
);

insert into private.retired_store_skin_settlements (
  user_id, item_id, item_name, awarded_pickles, store_rows, skin_row, previous_equipped_image
)
select user_id, item_id, item_name, awarded_pickles, store_rows, skin_row, previous_equipped_image
from pg_temp.retired_skin_new_settlements;

do $require_archived_store_rows$
begin
  if exists (
    select 1 from pg_temp.retired_skin_store_rows r
    where not exists (
      select 1 from private.retired_store_skin_settlements s
      where s.user_id = r.user_id and s.item_id = r.item_id
    )
  ) then
    raise exception 'RETIRED_SKIN_PURCHASE_ARCHIVE_MISSING';
  end if;
end;
$require_archived_store_rows$;

create temporary table retired_skin_notices on commit drop as
select user_id, sum(awarded_pickles)::integer as total_pickles,
  string_agg(item_name, ', ' order by item_id) as item_names,
  bool_or(previous_equipped_image is not null) as reset_equipped,
  jsonb_agg(jsonb_build_object('item_id', item_id, 'pickles', awarded_pickles) order by item_id) as items
from pg_temp.retired_skin_new_settlements
group by user_id;

update public.profiles p
set equipped_character_image_url = './images/characters/cucumber.png', updated_at = now()
where exists (
  select 1 from pg_temp.retired_skin_changes c
  where c.user_id = p.id and c.previous_equipped_image is not null
);

update public.profiles p
set pickles = coalesce(p.pickles, 0) + n.total_pickles, updated_at = now()
from pg_temp.retired_skin_notices n
where p.id = n.user_id and n.total_pickles > 0;

insert into public.pickle_ledger (user_id, amount, reason_code, reason_label, description, awarded_on)
select user_id, awarded_pickles, 'event_grant', '스킨 판매 종료 보상',
  item_name || ' 판매 종료로 피클을 지급했어요.', public.seoul_today()
from pg_temp.retired_skin_new_settlements
where awarded_pickles > 0;

insert into public.user_notifications (
  recipient_user_id, actor_user_id, actor_nickname, notification_type, title, message, action_url, metadata
)
select user_id, user_id, '말린오이 상점', 'admin_announcement', '상점 스킨 판매 종료 안내',
  item_names || ' 스킨의 판매와 사용이 종료됐어요.'
    || case when total_pickles > 0 then format(' 보유 스킨을 인벤토리에서 제거하고 %s피클을 지급했어요.', total_pickles) else '' end
    || case when reset_equipped then ' 착용 중이던 스킨은 기본오이로 바꿨어요.' else '' end,
  '/profile-history.html',
  jsonb_build_object('event', 'store_skin_retirement_20261119', 'items', items,
     'awarded_pickles', total_pickles, 'reset_equipped', reset_equipped)
from pg_temp.retired_skin_notices;

delete from public.user_character_skins s
using pg_temp.retired_skin_catalog c
where s.skin_code = c.skin_code;

delete from public.user_store_items s
using pg_temp.retired_skin_store_rows r
where s.id = r.id;

-- 배포 전에 시작된 RPC도 커밋 뒤에는 판매 종료한 스킨을 지급할 수 없다.
alter table public.user_store_items drop constraint if exists user_store_items_no_retired_skins_20261119;
alter table public.user_store_items add constraint user_store_items_no_retired_skins_20261119 check (
  item_id not in ('skin-cucumber-03', 'skin-cucumber-04', 'skin-cucumber-07', 'skin-grilled-egg-02')
  and not (item_id = 'skin-cucumber-01' and item_name = '오죠 이토루')
);
alter table public.user_character_skins drop constraint if exists user_character_skins_no_retired_skins_20261119;
alter table public.user_character_skins add constraint user_character_skins_no_retired_skins_20261119 check (
  skin_code not in ('char-cucumber-ozyo', 'char-cucumber-kind', 'char-cucumber-daegu', 'char-grilled-egg-inomske')
);

commit;
