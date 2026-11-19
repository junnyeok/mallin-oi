-- 대구FC 오이의 신규 구매를 차단한다. 보유 및 장착 기록은 보존한다.
begin;

do $retire_daegu_cucumber_skin$
declare
  purchase_function constant regprocedure := to_regprocedure('public.purchase_store_item(text)');
  purchase_sql text;
  auth_and_first_item constant text := $anchor$  if v_user_id is null then
    return query
    select false, '로그인이 필요해.', 0;
    return;
  end if;

  if p_item_id = 'emo-basic-01' then$anchor$;
  auth_and_guard constant text := $replacement$  if v_user_id is null then
    return query
    select false, '로그인이 필요해.', 0;
    return;
  end if;

  if p_item_id = 'skin-cucumber-07' then
    return query
    select false, '판매가 종료된 상품이야.',
      coalesce((select p.pickles from public.profiles p where p.id = v_user_id), 0);
    return;
  end if;

  if p_item_id = 'emo-basic-01' then$replacement$;
begin
  if purchase_function is null then
    raise exception 'STORE_PURCHASE_FUNCTION_MISSING';
  end if;

  purchase_sql := pg_get_functiondef(purchase_function);
  if position(auth_and_guard in purchase_sql) = 0 then
    if (length(purchase_sql) - length(replace(purchase_sql, auth_and_first_item, '')))
       / length(auth_and_first_item) <> 1 then
      raise exception 'STORE_PURCHASE_AUTH_GUARD_ANCHOR_MISMATCH';
    end if;

    execute replace(purchase_sql, auth_and_first_item, auth_and_guard);
  end if;

  if position(auth_and_guard in pg_get_functiondef(purchase_function)) = 0
     or pg_get_function_result(purchase_function) <> 'TABLE(success boolean, message text, balance integer)'
     or has_function_privilege('anon', purchase_function, 'execute')
     or not has_function_privilege('authenticated', purchase_function, 'execute') then
    raise exception 'STORE_PURCHASE_RETIREMENT_VERIFY_FAILED';
  end if;
end;
$retire_daegu_cucumber_skin$;

commit;
