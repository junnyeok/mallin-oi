-- 2026-11-19 (KST): 말오닷 운동회 이모티콘팩을 521피클에 등록하고 10종을 장착 상태로 지급한다.
begin;

do $sportsday_emoticon_pack$
declare
  purchase_function constant regprocedure := to_regprocedure('public.purchase_store_item(text)');
  purchase_anchors constant text[] := array[
    $price$  elsif p_item_id = 'emo-broccoli-girl-01' then
    v_price := 443;$price$,
    $balance$    if p_item_id = 'cha-cash-01' then
      v_can_bypass_store_balance := false;
    end if;$balance$,
    $topup$      if p_item_id = 'cha-cash-01' then
        v_is_auto_topup_admin := false;
      end if;$topup$,
    $inventory$  elsif p_item_id = 'emo-broccoli-girl-01' then
    insert into public.user_emoticons ($inventory$,
    $message$      when p_item_id = 'emo-broccoli-girl-01'
        then '브로콜리 알바생 이모티콘팩 구매가 완료됐어. 443피클이 차감됐고 바로 사용할 수 있어.'$message$
  ];
  purchase_additions constant text[] := array[
    $price$  elsif p_item_id = 'emo-sportsday-01' then
    v_price := 521;
    v_name := '말오닷 운동회 이모티콘팩';
    v_category := 'emoticon';

$price$,
    $balance$    if p_item_id = 'emo-sportsday-01' then
      v_can_bypass_store_balance := false;
    end if;

$balance$,
    $topup$      if p_item_id = 'emo-sportsday-01' then
        v_is_auto_topup_admin := false;
      end if;

$topup$,
    $inventory$  elsif p_item_id = 'emo-sportsday-01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order, is_equipped
    )
    values
      (v_user_id, 'emo-sportsday-01', 'sportsday-01', '축구', './images/emoticons/sports-pack/sports-01-soccer-cucumber.png', 1301, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-02', '헬스', './images/emoticons/sports-pack/sports-02-strength-grilled-egg.png', 1302, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-03', '러닝', './images/emoticons/sports-pack/sports-03-running-teto-carrot.png', 1303, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-04', '줄넘기', './images/emoticons/sports-pack/sports-04-jump-rope-cucumber-girl.png', 1304, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-05', '농구', './images/emoticons/sports-pack/sports-05-basketball-cucumber-boy.png', 1305, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-06', '배드민턴', './images/emoticons/sports-pack/sports-06-badminton-paprika-girl.png', 1306, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-07', '요가', './images/emoticons/sports-pack/sports-07-yoga-broccoli.png', 1307, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-08', '스케이트보드', './images/emoticons/sports-pack/sports-08-skateboarding-eggplant.png', 1308, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-09', '수영', './images/emoticons/sports-pack/sports-09-swimming-avocado.png', 1309, true),
      (v_user_id, 'emo-sportsday-01', 'sportsday-10', '자전거', './images/emoticons/sports-pack/sports-10-cycling-tomato.png', 1310, true);

$inventory$,
    $message$      when p_item_id = 'emo-sportsday-01'
        then '말오닷 운동회 이모티콘팩 구매가 완료됐어. 521피클이 차감됐고 바로 사용할 수 있어.'
$message$
  ];
  purchase_before text;
  purchase_sql text;
  purchase_owner oid;
  purchase_acl aclitem[];
  anchor text;
  index_no integer;
begin
  if purchase_function is null
     or to_regclass('public.profiles') is null
     or to_regclass('public.user_store_items') is null
     or to_regclass('public.user_emoticons') is null
     or to_regclass('public.pickle_ledger') is null then
    raise exception 'SPORTSDAY_PURCHASE_DEPENDENCY_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_store_items'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, item_id)'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'public.user_emoticons'::regclass and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (user_id, emoticon_code)'
  ) or not exists (
    select 1 from pg_attribute
    where attrelid = 'public.user_emoticons'::regclass and attname = 'is_equipped'
      and atttypid = 'boolean'::regtype and not attisdropped
  ) or not (
    select relrowsecurity from pg_class where oid = 'public.user_emoticons'::regclass
  ) or not has_table_privilege('authenticated', 'public.user_emoticons', 'SELECT')
     or not has_column_privilege('authenticated', 'public.user_emoticons', 'is_equipped', 'UPDATE') then
    raise exception 'SPORTSDAY_INVENTORY_SCHEMA_MISMATCH';
  end if;

  if exists (
    select 1 from public.user_store_items where item_id = 'emo-sportsday-01'
      and (item_name is distinct from '말오닷 운동회 이모티콘팩'
        or item_category is distinct from 'emoticon'
        or purchase_price is distinct from 521)
  ) or exists (
    select 1 from public.user_emoticons
    where (emoticon_code like 'sportsday-%' or display_order between 1301 and 1310)
      and item_id is distinct from 'emo-sportsday-01'
  ) then
    raise exception 'SPORTSDAY_ITEM_CODE_CONFLICT';
  end if;

  select pg_get_functiondef(oid), proowner, proacl
  into purchase_before, purchase_owner, purchase_acl
  from pg_proc where oid = purchase_function;
  purchase_sql := purchase_before;

  if position('emo-sportsday-01' in purchase_sql) = 0 then
    for index_no in 1..array_length(purchase_anchors, 1) loop
      anchor := purchase_anchors[index_no];
      if (length(purchase_sql) - length(replace(purchase_sql, anchor, '')))
         / length(anchor) <> 1 then
        raise exception 'SPORTSDAY_PURCHASE_ANCHOR_MISMATCH: %', index_no;
      end if;
      purchase_sql := replace(purchase_sql, anchor, purchase_additions[index_no] || anchor);
    end loop;
  end if;

  for index_no in 1..array_length(purchase_additions, 1) loop
    if position(purchase_additions[index_no] in purchase_sql) = 0 then
      raise exception 'SPORTSDAY_PURCHASE_BRANCH_MISMATCH: %', index_no;
    end if;
  end loop;

  if position('for update' in lower(purchase_sql)) = 0
     or position('if v_exists then' in purchase_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in purchase_sql) = 0
     or position('and coalesce(pickles, 0) >= v_price' in purchase_sql) = 0
     or position('insert into public.user_store_items' in purchase_sql) = 0
     or position('insert into public.pickle_ledger' in purchase_sql) = 0
     or position('-v_charged_amount' in purchase_sql) = 0
     or position($reason$'store_purchase'$reason$ in purchase_sql) = 0 then
    raise exception 'SPORTSDAY_PURCHASE_VERIFY_FAILED';
  end if;

  if purchase_sql <> purchase_before then
    execute purchase_sql;
  end if;

  if pg_get_function_result(purchase_function) <> 'TABLE(success boolean, message text, balance integer)'
     or not (
       select prosecdef and proowner = purchase_owner and proacl is not distinct from purchase_acl
         and 'search_path=public' = any(proconfig)
       from pg_proc where oid = purchase_function
     ) or has_function_privilege('anon', purchase_function, 'execute')
       or not has_function_privilege('authenticated', purchase_function, 'execute') then
    raise exception 'SPORTSDAY_PURCHASE_SECURITY_MISMATCH';
  end if;
end;
$sportsday_emoticon_pack$;

commit;
