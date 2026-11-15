-- BF-03 귀여운 덩쿨잎, 421피클. 로컬 검토본: 운영 적용은 별도 실사이트 반영 요청 시 수행.
-- 구매와 소유권 검사에 이번 상품만 추가하며 잔액 부족 우회/관리자 자동충전은 BF-02처럼 차단한다.
begin;
do $leaf_frame$
declare v_sql text; v_guard text;
begin
  if to_regprocedure('public.purchase_store_item(text)') is null
     or to_regprocedure('public.enforce_equipped_profile_frame_ownership()') is null then
    raise exception 'BF03_DEPENDENCY_MISSING';
  end if;
  if exists (select 1 from public.user_store_items where item_id = 'BF-03'
    and (item_name is distinct from '귀여운 덩쿨잎' or item_category is distinct from 'profile' or purchase_price is distinct from 421)) then
    raise exception 'BF03_ITEM_ID_CONFLICT';
  end if;
  select pg_get_functiondef('public.purchase_store_item(text)'::regprocedure) into v_sql;
  if position('BF-03' in v_sql) = 0 then
    if (length(v_sql) - length(replace(v_sql, $a0$  elsif p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';$a0$, ''))) / length($a0$  elsif p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';$a0$) <> 1 then
      raise exception 'BF03_PURCHASE_ANCHOR_0_MISMATCH';
    end if;
    v_sql := replace(v_sql, $a0$  elsif p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';$a0$, $b0$  elsif p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';

  elsif p_item_id = 'BF-03' then
    v_price := 421;
    v_name := '귀여운 덩쿨잎';
    v_category := 'profile';$b0$);
    if (length(v_sql) - length(replace(v_sql, $a1$  elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$a1$, ''))) / length($a1$  elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$a1$) <> 1 then
      raise exception 'BF03_PURCHASE_ANCHOR_1_MISMATCH';
    end if;
    v_sql := replace(v_sql, $a1$  elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;$a1$, $b1$  elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BF-03' then
    -- 프로필테두리는 user_store_items 보유 기록을 사용한다.
    null;$b1$);
    if (length(v_sql) - length(replace(v_sql, $a2$      when p_item_id = 'BF-02'
        then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$a2$, ''))) / length($a2$      when p_item_id = 'BF-02'
        then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$a2$) <> 1 then
      raise exception 'BF03_PURCHASE_ANCHOR_2_MISMATCH';
    end if;
    v_sql := replace(v_sql, $a2$      when p_item_id = 'BF-02'
        then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$a2$, $b2$      when p_item_id = 'BF-02'
        then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BF-03'
        then '귀여운 덩쿨잎 구매가 완료됐어. 421피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$b2$);
    if (length(v_sql) - length(replace(v_sql, $a3$    if not v_can_bypass_store_balance then$a3$, ''))) / length($a3$    if not v_can_bypass_store_balance then$a3$) <> 1 then
      raise exception 'BF03_PURCHASE_ANCHOR_3_MISMATCH';
    end if;
    v_sql := replace(v_sql, $a3$    if not v_can_bypass_store_balance then$a3$, $b3$    if p_item_id = 'BF-03' then
      v_can_bypass_store_balance := false;
    end if;

    if not v_can_bypass_store_balance then$b3$);
    if (length(v_sql) - length(replace(v_sql, $a4$      if p_item_id = 'BG-07' then$a4$, ''))) / length($a4$      if p_item_id = 'BG-07' then$a4$) <> 1 then
      raise exception 'BF03_PURCHASE_ANCHOR_4_MISMATCH';
    end if;
    v_sql := replace(v_sql, $a4$      if p_item_id = 'BG-07' then$a4$, $b4$      if p_item_id = 'BF-03' then
        v_is_auto_topup_admin := false;
      end if;

      if p_item_id = 'BG-07' then$b4$);
    execute v_sql;
  end if;
  if position($verify0$  elsif p_item_id = 'BF-02' then
    v_price := 488;
    v_name := '말린오이 테마 빛나는 테두리';
    v_category := 'profile';

  elsif p_item_id = 'BF-03' then
    v_price := 421;
    v_name := '귀여운 덩쿨잎';
    v_category := 'profile';$verify0$ in v_sql) = 0 then raise exception 'BF03_BRANCH_0_MISMATCH'; end if;
  if position($verify1$  elsif p_item_id = 'BF-02' then
    -- 프로필테두리는 user_store_items 보유 기록만 있으면 인벤토리에서 표시 가능
    null;

  elsif p_item_id = 'BF-03' then
    -- 프로필테두리는 user_store_items 보유 기록을 사용한다.
    null;$verify1$ in v_sql) = 0 then raise exception 'BF03_BRANCH_1_MISMATCH'; end if;
  if position($verify2$      when p_item_id = 'BF-02'
        then '말린오이 테마 빛나는 테두리 구매가 완료됐어. 488피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'
      when p_item_id = 'BF-03'
        then '귀여운 덩쿨잎 구매가 완료됐어. 421피클이 차감됐고 프로필테두리 인벤토리에서 장착할 수 있어.'$verify2$ in v_sql) = 0 then raise exception 'BF03_BRANCH_2_MISMATCH'; end if;
  if position($verify3$    if p_item_id = 'BF-03' then
      v_can_bypass_store_balance := false;
    end if;

    if not v_can_bypass_store_balance then$verify3$ in v_sql) = 0 then raise exception 'BF03_BRANCH_3_MISMATCH'; end if;
  if position($verify4$      if p_item_id = 'BF-03' then
        v_is_auto_topup_admin := false;
      end if;

      if p_item_id = 'BG-07' then$verify4$ in v_sql) = 0 then raise exception 'BF03_BRANCH_4_MISMATCH'; end if;
  select pg_get_functiondef('public.enforce_equipped_profile_frame_ownership()'::regprocedure) into v_guard;
  if position('BF-03' in v_guard) = 0 then
    if position($old$usi.item_id in ('BF-01', 'BF-02')$old$ in v_guard) = 0 then raise exception 'BF03_GUARD_ANCHOR_MISSING'; end if;
    v_guard := replace(v_guard, $old$usi.item_id in ('BF-01', 'BF-02')$old$, $new$usi.item_id in ('BF-01', 'BF-02', 'BF-03')$new$);
    execute v_guard;
  end if;
  if position($allow$usi.item_id in ('BF-01', 'BF-02', 'BF-03')$allow$ in v_guard) = 0
     or position('insert into public.pickle_ledger' in v_sql) = 0
     or position('set pickles = coalesce(pickles, 0) - v_price' in v_sql) = 0
     or not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'trg_enforce_equipped_profile_frame_ownership' and not tgisinternal) then
    raise exception 'BF03_GUARD_OR_LEDGER_VERIFY_FAILED';
  end if;
  if has_function_privilege('anon', 'public.purchase_store_item(text)', 'execute')
     or not has_function_privilege('authenticated', 'public.purchase_store_item(text)', 'execute')
     or not (select prosecdef from pg_proc where oid = 'public.purchase_store_item(text)'::regprocedure) then
    raise exception 'BF03_SECURITY_MISMATCH';
  end if;
end;
$leaf_frame$;
commit;
