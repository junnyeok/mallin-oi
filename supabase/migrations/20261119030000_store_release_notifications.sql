-- 실사이트에 게시된 상품을 회원별 알림창에 한 번만 알린다.
begin;

create schema if not exists private;

create schema if not exists private_store_release_http;
revoke all on schema private_store_release_http from public, anon, authenticated;
create extension if not exists http with schema private_store_release_http;

do $private_http$
begin
  if not exists (
    select 1 from pg_catalog.pg_extension
    where extname = 'http' and extnamespace = 'private_store_release_http'::regnamespace
  ) or has_schema_privilege('anon', 'private_store_release_http', 'USAGE')
     or has_schema_privilege('authenticated', 'private_store_release_http', 'USAGE') then
    raise exception 'STORE_RELEASE_HTTP_SCHEMA_NOT_PRIVATE';
  end if;
end;
$private_http$;

create table if not exists private.store_release_notification_items (
  item_id text primary key,
  announced_at timestamptz
);

-- 기존 출시 상품은 등록만 하고, 직전에 출시한 지폐 흩뿌리기부터 알린다.
insert into private.store_release_notification_items (item_id)
values
  ('BF-01'), ('BF-02'), ('BF-03'),
  ('BG-01'), ('BG-02'), ('BG-03'), ('BG-04'), ('BG-05'), ('BG-06'), ('BG-07'),
  ('bgm-boygroup-01'), ('bgm-brocolli-01'), ('bgm-cucumber-01'),
  ('bgm-cucumberboy-01'), ('bgm-cucumbergirl-01'), ('bgm-cucumbergirl-02'),
  ('bgm-cucumbergirl-03'), ('bgm-eggpotato-01'), ('bgm-fat-avocado-01'),
  ('bgm-grilledegg-01'), ('bgm-grilledegg-02'), ('bgm-potato-02'),
  ('bgm-reggae-01'), ('bgm-tetocarrot-01'), ('bgm-tetocarrto-02'), ('bgm-tomato-01'),
  ('cha-effects-cucumberheart-01'), ('cha-effects-fire-01'), ('cha-effects-web-01'),
  ('cha-fall-01'),
  ('character-brocolli-01'), ('character-carrot-01'), ('character-cucumberboy-01'),
  ('character-eggplant-01'), ('character-eggpotato-01'), ('character-fat-avocado-01'),
  ('character-grilled-egg-01'), ('character-paprikagirl-01'), ('character-tomato-01'),
  ('emo_cucumbergirl_01'), ('emo-basic-01'), ('emo-broccoli-girl-01'), ('emo-carrot-01'),
  ('emo-cheer-01'), ('emo-cucumberboy-01'), ('emo-eat-01'), ('emo-moved-01'),
  ('emo-police-01'), ('emo-sad-01'), ('emo-sorry-01'), ('emo-thanks-01'),
  ('skin-avocado-01'), ('skin-cucumber-05'), ('skin-cucumber-soldier-01'),
  ('skin-cucumberboy-01'), ('skin-cucumberboy-02'), ('skin-cucumberboy-03'),
  ('skin-cucumbergirl'), ('skin-cucumbergirl-01'), ('skin-eggpotato-01'),
  ('skin-eggpotato-02'), ('skin-grilledegg-01'), ('skin-tetocarrot-01'),
  ('skin-tomato-01'), ('skin-tomato-02')
on conflict (item_id) do nothing;

create table if not exists private.store_release_notification_sync (
  singleton boolean primary key default true check (singleton),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_delivery_count integer,
  last_error text
);

insert into private.store_release_notification_sync default values
on conflict (singleton) do nothing;

revoke all on table
  private.store_release_notification_items,
  private.store_release_notification_sync
from public, anon, authenticated;

-- 수동 알림과 자동 알림이 같은 상품에 동시에 등록돼도 회원별 한 건만 남긴다.
create unique index if not exists user_notifications_one_store_item_per_recipient
on public.user_notifications (recipient_user_id, item_id)
where notification_type = 'store_new_item' and item_id is not null;

-- 이 작업에서 만든 알림만 기기 푸시 연동에서 제외한다.
do $skip_device_push$
declare
  push_trigger record;
  trigger_definition text;
  guard constant text := $condition$FOR EACH ROW WHEN ((NEW.metadata ->> 'event') IS DISTINCT FROM 'store_release') EXECUTE FUNCTION $condition$;
begin
  for push_trigger in
    select oid, tgname, tgenabled, tgqual
    from pg_catalog.pg_trigger
    where tgrelid = 'public.user_notifications'::regclass
      and not tgisinternal
      and tgname in ('send-push-notification', 'trg_user_notifications_send_push')
  loop
    trigger_definition := pg_catalog.pg_get_triggerdef(push_trigger.oid, false);
    if push_trigger.tgqual is not null then
      if position($marker$'store_release'$marker$ in trigger_definition) = 0 then
        raise exception 'STORE_RELEASE_PUSH_TRIGGER_CONDITION_CHANGED';
      end if;
      continue;
    end if;

    if left(trigger_definition, 15) <> 'CREATE TRIGGER '
       or position('FOR EACH ROW EXECUTE FUNCTION ' in trigger_definition) = 0 then
      raise exception 'STORE_RELEASE_PUSH_TRIGGER_DEFINITION_CHANGED';
    end if;

    -- 기존 웹훅 설정을 로그나 마이그레이션에 복사하지 않는다.
    execute replace(
      overlay(trigger_definition placing 'CREATE OR REPLACE TRIGGER ' from 1 for 15),
      'FOR EACH ROW EXECUTE FUNCTION ',
      guard
    );
    if push_trigger.tgenabled <> 'O' then
      execute format('alter table public.user_notifications %s trigger %I',
        case push_trigger.tgenabled
          when 'D' then 'disable'
          when 'A' then 'enable always'
          when 'R' then 'enable replica'
        end,
        push_trigger.tgname
      );
    end if;
  end loop;
end;
$skip_device_push$;

-- 알림 목록에서 회원 본인의 닉네임 대신 상점 발신자 이름을 표시한다.
do $store_release_sender$
declare
  notification_list constant regprocedure := 'public.get_my_notifications_current(integer,integer,boolean)'::regprocedure;
  nickname_lookup constant text := $before$      coalesce(
        nullif(btrim(p.nickname), ''),$before$;
  shop_sender constant text := $after$      coalesce(
        case when n.notification_type = 'store_new_item'
                  and n.metadata->>'event' = 'store_release'
          then nullif(btrim(n.actor_nickname), '')
        end,
        nullif(btrim(p.nickname), ''),$after$;
  list_definition text := pg_catalog.pg_get_functiondef(notification_list);
begin
  if position(shop_sender in list_definition) > 0 then
    return;
  end if;
  if (length(list_definition) - length(replace(list_definition, nickname_lookup, '')))
     / length(nickname_lookup) <> 1 then
    raise exception 'STORE_RELEASE_NOTIFICATION_SENDER_LOOKUP_CHANGED';
  end if;
  execute replace(list_definition, nickname_lookup, shop_sender);
end;
$store_release_sender$;

create or replace function private.apply_store_release_catalog(p_catalog jsonb)
returns integer
language plpgsql
set search_path = ''
as $apply_store_release$
declare
  delivered integer;
begin
  if jsonb_typeof(p_catalog) is distinct from 'object'
     or p_catalog->'version' is distinct from '1'::jsonb
     or jsonb_typeof(p_catalog->'items') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'STORE_RELEASE_INVALID_CATALOG';
  end if;

  if jsonb_array_length(p_catalog->'items') > 500
     or exists (
       select 1
       from jsonb_array_elements(p_catalog->'items') as item(value)
       where jsonb_typeof(value) is distinct from 'object'
         or jsonb_typeof(value->'id') is distinct from 'string'
         or value->>'id' !~ '^[A-Za-z0-9_-]{1,100}$'
         or jsonb_typeof(value->'name') is distinct from 'string'
         or char_length(value->>'name') not between 1 and 120
         or btrim(value->>'name') <> value->>'name'
         or value->>'name' ~ '[[:cntrl:]]'
         or case
             when jsonb_typeof(value->'price') = 'number'
               and value->>'price' ~ '^(0|[1-9][0-9]{0,9})$'
             then (value->>'price')::numeric > 2147483647
             else jsonb_typeof(value->'price') is distinct from 'null'
           end
     )
     or exists (
       select 1
       from jsonb_array_elements(p_catalog->'items') as item(value)
       group by value->>'id'
       having count(*) > 1
     ) then
    raise exception using errcode = '22023', message = 'STORE_RELEASE_INVALID_ITEMS';
  end if;

  with shop_items as (
    select id, name, price
    from jsonb_to_recordset(p_catalog->'items') as item(id text, name text, price integer)
  ),
  new_items as (
    insert into private.store_release_notification_items (item_id, announced_at)
    select id, now() from shop_items order by id
    on conflict (item_id) do nothing
    returning item_id
  )
  insert into public.user_notifications (
    recipient_user_id, actor_user_id, actor_nickname, notification_type,
    title, message, action_url, item_id, metadata
  )
  select
    p.id, p.id, '말린오이 상점', 'store_new_item',
    '새 상품 출시',
    format('‘%s’ 상품이 출시됐어. %s', item.name,
      case when coalesce(item.price, 0) = 0 then '무료로 만나봐!'
        else format('%s피클에 만나봐!', item.price) end),
    '/store-item.html?id=' || item.id,
    item.id,
    jsonb_build_object('event', 'store_release', 'itemId', item.id, 'itemTitle', item.name)
  from new_items
  join shop_items item on item.id = new_items.item_id
  cross join public.profiles p
  join auth.users account on account.id = p.id
  on conflict (recipient_user_id, item_id)
    where notification_type = 'store_new_item' and item_id is not null
    do nothing;

  get diagnostics delivered = row_count;
  return delivered;
end;
$apply_store_release$;

-- 실제 서비스 주소에 게시된 상품 목록만 읽는다.
create or replace function private.sync_store_release_notifications()
returns integer
language plpgsql
set search_path = ''
as $sync_store_releases$
declare
  response record;
  delivered integer := 0;
  failure text;
begin
  perform 1
  from private.store_release_notification_sync
  where singleton
  for update;

  begin
    perform pg_catalog.set_config('http.curlopt_timeout_ms', '5000', true);
    perform pg_catalog.set_config('http.curlopt_connecttimeout_ms', '2000', true);
    select status, content_type, content into strict response
    from private_store_release_http.http_get(
      'https://mallin-oi.com/assets/store-release-catalog.json?_poll=' ||
      floor(extract(epoch from now()) / 60)::bigint
    );
  exception when others then
    failure := 'http_request_failed';
  end;

  if failure is null then
    if response.status is distinct from 200 then
      failure := 'http_' || coalesce(response.status::text, 'error');
    elsif coalesce(response.content_type, '') !~* '^application/json([[:space:]]*;|$)' then
      failure := 'invalid_catalog_content_type';
    elsif response.content is null or octet_length(response.content) > 262144 then
      failure := 'invalid_catalog_size';
    else
      begin
        delivered := private.apply_store_release_catalog(response.content::jsonb);
      exception
        when invalid_text_representation or invalid_parameter_value or numeric_value_out_of_range then
          failure := 'invalid_catalog';
      end;
    end if;
  end if;

  update private.store_release_notification_sync
  set last_checked_at = now(),
      last_success_at = case when failure is null then now() else last_success_at end,
      last_delivery_count = case when failure is null then delivered else last_delivery_count end,
      last_error = failure
  where singleton;

  return delivered;
end;
$sync_store_releases$;

revoke all on function private.apply_store_release_catalog(jsonb) from public, anon, authenticated;
revoke all on function private.sync_store_release_notifications() from public, anon, authenticated;

select cron.schedule(
  'mallin-store-release-notifications',
  '* * * * *',
  'select private.sync_store_release_notifications();'
);

commit;
