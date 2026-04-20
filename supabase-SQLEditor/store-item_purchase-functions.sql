create or replace function public.purchase_store_item(p_item_id text)
returns table(success boolean, message text, balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_price integer := 0;
  v_name text := '';
  v_category text := '';
  v_exists boolean := false;
  v_balance integer := 0;
  v_is_auto_topup_admin boolean := false;
begin
  if v_user_id is null then
    return query
    select false, '로그인이 필요해.', 0;
    return;
  end if;

  if p_item_id = 'emo-basic-01' then
    v_price := 0;
    v_name := '기본 말린오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'emo-cheer-01' then
    v_price := 150;
    v_name := '응원오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'emo-police-01' then
    v_price := 230;
    v_name := '경찰오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'emo-thanks-01' then
    v_price := 150;
    v_name := '감사오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'emo-sorry-01' then
    v_price := 180;
    v_name := '사과오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'emo-carrot-01' then
    v_price := 310;
    v_name := '특별제작 당근 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'character-carrot-01' then
    v_price := 530;
    v_name := '테토당근 캐릭터';
    v_category := 'character';

  elsif p_item_id = 'emo-heart-01' then
    v_price := 300;
    v_name := '애정오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'skin-cucumbergirl' then
    v_price := 820;
    v_name := '오이소녀 캐릭터';
    v_category := 'character';

  elsif p_item_id = 'character-fat-avocado-01' then
    v_price := 580;
    v_name := '아보카도 캐릭터';
    v_category := 'character';

  elsif p_item_id = 'character-grilled-egg-01' then
    v_price := 640;
    v_name := '구운계란 캐릭터';
    v_category := 'character';

  elsif p_item_id = 'character-cucumberboy-01' then
    v_price := 878;
    v_name := '오이소년 캐릭터';
    v_category := 'character';

  elsif p_item_id = 'character-eggpotato-01' then
    v_price := 532;
    v_name := '알감자 캐릭터';
    v_category := 'character';

  elsif p_item_id = 'emo-sad-01' then
    v_price := 210;
    v_name := '슬픈오이 이모티콘팩';
    v_category := 'emoticon';

  elsif p_item_id = 'skin-cucumbergirl-01' then
    v_price := 923;
    v_name := '오이소녀 경찰스킨';
    v_category := 'skin';

  elsif p_item_id = 'bgm-tetocarrot-01' then
    v_price := 420;
    v_name := '테토당근 BGM';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-grilledegg-01' then
    v_price := 432;
    v_name := '구운계란의 PT수업 BGM';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-cucumbergirl-01' then
    v_price := 542;
    v_name := '오이소녀의 데뷔 BGM';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-fat-avocado-01' then
    v_price := 393;
    v_name := '아보카도의 산책 BGM';
    v_category := 'bgm';

  elsif p_item_id = 'bgm-cucumber-01' then
    v_price := 382;
    v_name := 'lofi 말린오이 BGM';
    v_category := 'bgm';

  elsif p_item_id = 'emo-eat-01' then
    v_price := 220;
    v_name := '먹방오이 이모티콘팩';
    v_category := 'emoticon';

  else
    return query
    select
      false,
      '아직 구매 가능한 품목이 아니야.',
      coalesce((select p.pickles from public.profiles p where p.id = v_user_id), 0);
    return;
  end if;

    v_exists := exists (
    select 1
    from public.user_store_items
    where user_id = v_user_id
      and item_id = p_item_id
  );

  if v_exists then
    return query
    select
      false,
      '이미 보유 중인 품목이야.',
      coalesce((select p.pickles from public.profiles p where p.id = v_user_id), 0);
    return;
  end if;

  if v_price > 0 then
    v_is_auto_topup_admin := public.is_auto_topup_admin_user(v_user_id);

    if coalesce(v_is_auto_topup_admin, false) then
      perform public.ensure_user_pickles(
        v_user_id,
        v_price,
        'admin_auto_charge',
        '관리자 자동충전',
        v_name || ' 구매 전 부족 피클 자동충전'
      );
    end if;

    update public.profiles
    set pickles = coalesce(pickles, 0) - v_price,
        updated_at = now()
    where id = v_user_id
      and coalesce(pickles, 0) >= v_price;

    if not found then
      return query
      select
        false,
        '피클이 부족해.',
        coalesce((select p.pickles from public.profiles p where p.id = v_user_id), 0);
      return;
    end if;
  end if;

  insert into public.user_store_items (
    user_id,
    item_id,
    item_name,
    item_category,
    purchase_price
  )
  values (
    v_user_id,
    p_item_id,
    v_name,
    v_category,
    v_price
  );

  if p_item_id = 'emo-basic-01' then
    insert into public.user_emoticons (
      user_id,
      item_id,
      emoticon_code,
      emoticon_label,
      image_path,
      display_order
    )
    values
      (v_user_id, 'emo-basic-01', 'free-1', '기본 이모티콘 1', './images/emoticons/free-1.png', 1),
      (v_user_id, 'emo-basic-01', 'free-2', '기본 이모티콘 2', './images/emoticons/free-2.png', 2),
      (v_user_id, 'emo-basic-01', 'free-3', '기본 이모티콘 3', './images/emoticons/free-3.png', 3),
      (v_user_id, 'emo-basic-01', 'free-4', '기본 이모티콘 4', './images/emoticons/free-4.png', 4),
      (v_user_id, 'emo-basic-01', 'free-5', '기본 이모티콘 5', './images/emoticons/free-5.png', 5),
      (v_user_id, 'emo-basic-01', 'free-6', '기본 이모티콘 6', './images/emoticons/free-6.png', 6),
      (v_user_id, 'emo-basic-01', 'free-7', '기본 이모티콘 7', './images/emoticons/free-7.png', 7)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'emo-cheer-01' then
    insert into public.user_emoticons (
      user_id,
      item_id,
      emoticon_code,
      emoticon_label,
      image_path,
      display_order
    )
    values
      (v_user_id, 'emo-cheer-01', 'cheer-1', '응원 이모티콘 1', './images/emoticons/cheer-1.png', 101),
      (v_user_id, 'emo-cheer-01', 'cheer-2', '응원 이모티콘 2', './images/emoticons/cheer-2.png', 102),
      (v_user_id, 'emo-cheer-01', 'cheer-3', '응원 이모티콘 3', './images/emoticons/cheer-3.png', 103),
      (v_user_id, 'emo-cheer-01', 'cheer-4', '응원 이모티콘 4', './images/emoticons/cheer-4.png', 104),
      (v_user_id, 'emo-cheer-01', 'cheer-5', '응원 이모티콘 5', './images/emoticons/cheer-5.png', 105)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'emo-police-01' then
    insert into public.user_emoticons (
      user_id,
      item_id,
      emoticon_code,
      emoticon_label,
      image_path,
      display_order
    )
    values
      (v_user_id, 'emo-police-01', 'police-1', '경찰 이모티콘 1', './images/emoticons/police-1.png', 201),
      (v_user_id, 'emo-police-01', 'police-2', '경찰 이모티콘 2', './images/emoticons/police-2.png', 202),
      (v_user_id, 'emo-police-01', 'police-3', '경찰 이모티콘 3', './images/emoticons/police-3.png', 203),
      (v_user_id, 'emo-police-01', 'police-4', '경찰 이모티콘 4', './images/emoticons/police-4.png', 204),
      (v_user_id, 'emo-police-01', 'police-5', '경찰 이모티콘 5', './images/emoticons/police-5.png', 205),
      (v_user_id, 'emo-police-01', 'police-6', '경찰 이모티콘 6', './images/emoticons/police-6.png', 206),
      (v_user_id, 'emo-police-01', 'police-7', '경찰 이모티콘 7', './images/emoticons/police-7.png', 207),
      (v_user_id, 'emo-police-01', 'police-8', '경찰 이모티콘 8', './images/emoticons/police-8.png', 208)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'emo-thanks-01' then
    insert into public.user_emoticons (
      user_id,
      item_id,
      emoticon_code,
      emoticon_label,
      image_path,
      display_order
    )
    values
      (v_user_id, 'emo-thanks-01', 'thanks-1', '감사 이모티콘 1', './images/emoticons/thanks-1.png', 301),
      (v_user_id, 'emo-thanks-01', 'thanks-2', '감사 이모티콘 2', './images/emoticons/thanks-2.png', 302),
      (v_user_id, 'emo-thanks-01', 'thanks-3', '감사 이모티콘 3', './images/emoticons/thanks-3.png', 303),
      (v_user_id, 'emo-thanks-01', 'thanks-4', '감사 이모티콘 4', './images/emoticons/thanks-4.png', 304),
      (v_user_id, 'emo-thanks-01', 'thanks-5', '감사 이모티콘 5', './images/emoticons/thanks-5.png', 305)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'emo-sorry-01' then
    insert into public.user_emoticons (
      user_id,
      item_id,
      emoticon_code,
      emoticon_label,
      image_path,
      display_order
    )
    values
      (v_user_id, 'emo-sorry-01', 'sorry-1', '사과 이모티콘 1', './images/emoticons/sorry-1.png', 401),
      (v_user_id, 'emo-sorry-01', 'sorry-2', '사과 이모티콘 2', './images/emoticons/sorry-2.png', 402),
      (v_user_id, 'emo-sorry-01', 'sorry-3', '사과 이모티콘 3', './images/emoticons/sorry-3.png', 403),
      (v_user_id, 'emo-sorry-01', 'sorry-4', '사과 이모티콘 4', './images/emoticons/sorry-4.png', 404),
      (v_user_id, 'emo-sorry-01', 'sorry-5', '사과 이모티콘 5', './images/emoticons/sorry-5.png', 405),
      (v_user_id, 'emo-sorry-01', 'sorry-6', '사과 이모티콘 6', './images/emoticons/sorry-6.png', 406)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'emo-carrot-01' then
    insert into public.user_emoticons (
      user_id,
      item_id,
      emoticon_code,
      emoticon_label,
      image_path,
      display_order
    )
    values
      (v_user_id, 'emo-carrot-01', 'carrot-1', '당근 이모티콘 1', './images/emoticons/carrot-1.png', 501),
      (v_user_id, 'emo-carrot-01', 'carrot-2', '당근 이모티콘 2', './images/emoticons/carrot-2.png', 502),
      (v_user_id, 'emo-carrot-01', 'carrot-3', '당근 이모티콘 3', './images/emoticons/carrot-3.png', 503),
      (v_user_id, 'emo-carrot-01', 'carrot-4', '당근 이모티콘 4', './images/emoticons/carrot-4.png', 504),
      (v_user_id, 'emo-carrot-01', 'carrot-5', '당근 이모티콘 5', './images/emoticons/carrot-5.png', 505),
      (v_user_id, 'emo-carrot-01', 'carrot-6', '당근 이모티콘 6', './images/emoticons/carrot-6.png', 506),
      (v_user_id, 'emo-carrot-01', 'carrot-7', '당근 이모티콘 7', './images/emoticons/carrot-7.png', 507),
      (v_user_id, 'emo-carrot-01', 'carrot-8', '당근 이모티콘 8', './images/emoticons/carrot-8.png', 508),
      (v_user_id, 'emo-carrot-01', 'carrot-9', '당근 이모티콘 9', './images/emoticons/carrot-9.png', 509),
      (v_user_id, 'emo-carrot-01', 'carrot-10', '당근 이모티콘 10', './images/emoticons/carrot-10.png', 510),
      (v_user_id, 'emo-carrot-01', 'carrot-11', '당근 이모티콘 11', './images/emoticons/carrot-11.png', 511),
      (v_user_id, 'emo-carrot-01', 'carrot-12', '당근 이모티콘 12', './images/emoticons/carrot-12.png', 512),
      (v_user_id, 'emo-carrot-01', 'carrot-13', '당근 이모티콘 13', './images/emoticons/carrot-13.png', 513)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'character-carrot-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-teto-carrot',
      '테토당근',
      './images/characters/teto-carrot.png',
      './images/characters/teto-carrot.png',
      3,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-teto-carrot',
      'char-teto-carrot-basic',
      '테토당근',
      './images/characters/teto-carrot.png',
      201,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'emo-heart-01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order
    )
    values
      (v_user_id, 'emo-heart-01', 'heart-1', '애정오이 이모티콘 1', './images/emoticons/heart-1.png', 601),
      (v_user_id, 'emo-heart-01', 'heart-2', '애정오이 이모티콘 2', './images/emoticons/heart-2.png', 602),
      (v_user_id, 'emo-heart-01', 'heart-3', '애정오이 이모티콘 3', './images/emoticons/heart-3.png', 603),
      (v_user_id, 'emo-heart-01', 'heart-4', '애정오이 이모티콘 4', './images/emoticons/heart-4.png', 604),
      (v_user_id, 'emo-heart-01', 'heart-5', '애정오이 이모티콘 5', './images/emoticons/heart-5.png', 605),
      (v_user_id, 'emo-heart-01', 'heart-6', '애정오이 이모티콘 6', './images/emoticons/heart-6.png', 606),
      (v_user_id, 'emo-heart-01', 'heart-7', '애정오이 이모티콘 7', './images/emoticons/heart-7.png', 607),
      (v_user_id, 'emo-heart-01', 'heart-8', '애정오이 이모티콘 8', './images/emoticons/heart-8.png', 608),
      (v_user_id, 'emo-heart-01', 'heart-9', '애정오이 이모티콘 9', './images/emoticons/heart-9.png', 609),
      (v_user_id, 'emo-heart-01', 'heart-10', '애정오이 이모티콘 10', './images/emoticons/heart-10.png', 610),
      (v_user_id, 'emo-heart-01', 'heart-11', '애정오이 이모티콘 11', './images/emoticons/heart-11.png', 611)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'skin-cucumbergirl' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-girl',
      '오이소녀 캐릭터',
      './images/characters/cucumbergirl.png',
      './images/characters/cucumbergirl.png',
      2,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-girl',
      'char-cucumber-girl-basic',
      '오이소녀 캐릭터',
      './images/characters/cucumbergirl.png',
      101,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'character-fat-avocado-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-fat-avocado',
      '아보카도 캐릭터',
      './images/characters/fat-avocado.png',
      './images/characters/fat-avocado.png',
      4,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-fat-avocado',
      'char-fat-avocado-basic',
      '아보카도 캐릭터',
      './images/characters/fat-avocado.png',
      301,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'character-grilled-egg-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-grilled-egg',
      '구운계란 캐릭터',
      './images/characters/grilled-egg.png',
      './images/characters/grilled-egg.png',
      5,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-grilled-egg',
      'char-grilled-egg-basic',
      '구운계란 캐릭터',
      './images/characters/grilled-egg.png',
      401,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'character-cucumberboy-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-boy',
      '오이소년 캐릭터',
      './images/characters/cucumberboy.png',
      './images/characters/cucumberboy.png',
      6,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-boy',
      'char-cucumber-boy-basic',
      '오이소년 캐릭터',
      './images/characters/cucumberboy.png',
      501,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'character-eggpotato-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-egg-potato',
      '알감자 캐릭터',
      './images/characters/eggpotato.png',
      './images/characters/eggpotato.png',
      7,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-egg-potato',
      'char-egg-potato-basic',
      '알감자 캐릭터',
      './images/characters/eggpotato.png',
      601,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'emo-sad-01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order
    )
    values
      (v_user_id, 'emo-sad-01', 'sad-1', '슬픈오이 이모티콘 1', './images/emoticons/sad-1.png', 701),
      (v_user_id, 'emo-sad-01', 'sad-2', '슬픈오이 이모티콘 2', './images/emoticons/sad-2.png', 702),
      (v_user_id, 'emo-sad-01', 'sad-3', '슬픈오이 이모티콘 3', './images/emoticons/sad-3.png', 703),
      (v_user_id, 'emo-sad-01', 'sad-4', '슬픈오이 이모티콘 4', './images/emoticons/sad-4.png', 704),
      (v_user_id, 'emo-sad-01', 'sad-5', '슬픈오이 이모티콘 5', './images/emoticons/sad-5.png', 705),
      (v_user_id, 'emo-sad-01', 'sad-6', '슬픈오이 이모티콘 6', './images/emoticons/sad-6.png', 706),
      (v_user_id, 'emo-sad-01', 'sad-7', '슬픈오이 이모티콘 7', './images/emoticons/sad-7.png', 707)
    on conflict (user_id, emoticon_code) do nothing;

  elsif p_item_id = 'skin-cucumbergirl-01' then
    insert into public.user_characters (
      user_id, character_code, character_name, base_image_path, preview_image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-girl',
      '오이소녀 캐릭터',
      './images/characters/cucumbergirl.png',
      './images/characters/cucumbergirl.png',
      2,
      'store_purchase'
    )
    on conflict (user_id, character_code) do nothing;

    insert into public.user_character_skins (
      user_id, character_code, skin_code, skin_name, image_path, display_order, acquired_reason
    )
    values (
      v_user_id,
      'char-cucumber-girl',
      'char-cucumber-girl-police',
      '오이소녀 경찰스킨',
      './images/skins/cucumbergirl-police.png',
      102,
      'store_purchase'
    )
    on conflict (user_id, skin_code) do nothing;

  elsif p_item_id = 'bgm-tetocarrot-01' then
    null;

  elsif p_item_id = 'bgm-grilledegg-01' then
    null;

  elsif p_item_id = 'bgm-cucumbergirl-01' then
    null;

  elsif p_item_id = 'bgm-fat-avocado-01' then
    null;

  elsif p_item_id = 'bgm-cucumber-01' then
    null;

  elsif p_item_id = 'emo-eat-01' then
    insert into public.user_emoticons (
      user_id, item_id, emoticon_code, emoticon_label, image_path, display_order
    )
    values
      (v_user_id, 'emo-eat-01', 'eat-1', '먹방오이 이모티콘 1', './images/emoticons/eat-1.png', 801),
      (v_user_id, 'emo-eat-01', 'eat-2', '먹방오이 이모티콘 2', './images/emoticons/eat-2.png', 802),
      (v_user_id, 'emo-eat-01', 'eat-3', '먹방오이 이모티콘 3', './images/emoticons/eat-3.png', 803),
      (v_user_id, 'emo-eat-01', 'eat-4', '먹방오이 이모티콘 4', './images/emoticons/eat-4.png', 804),
      (v_user_id, 'emo-eat-01', 'eat-5', '먹방오이 이모티콘 5', './images/emoticons/eat-5.png', 805),
      (v_user_id, 'emo-eat-01', 'eat-6', '먹방오이 이모티콘 6', './images/emoticons/eat-6.png', 806),
      (v_user_id, 'emo-eat-01', 'eat-7', '먹방오이 이모티콘 7', './images/emoticons/eat-7.png', 807),
      (v_user_id, 'emo-eat-01', 'eat-8', '먹방오이 이모티콘 8', './images/emoticons/eat-8.png', 808),
      (v_user_id, 'emo-eat-01', 'eat-9', '먹방오이 이모티콘 9', './images/emoticons/eat-9.png', 809),
      (v_user_id, 'emo-eat-01', 'eat-10', '먹방오이 이모티콘 10', './images/emoticons/eat-10.png', 810)
    on conflict (user_id, emoticon_code) do nothing;
  end if;

  if v_price > 0 then
    insert into public.pickle_ledger (
      user_id,
      amount,
      reason_code,
      reason_label,
      description,
      awarded_on
    )
    values (
      v_user_id,
      -v_price,
      'store_purchase',
      '상점 구매',
      v_name || ' 구매',
      public.seoul_today()
    );
  end if;

  v_balance := coalesce((
  select p.pickles
  from public.profiles p
  where p.id = v_user_id
), 0);

  return query
  select
    true,
    case
      when p_item_id = 'emo-basic-01'
        then '기본 이모티콘팩이 지급됐어. 이제 게시물/댓글/답글에서 사용할 수 있어.'
      when p_item_id = 'emo-cheer-01'
        then '응원 오이 이모티콘팩 구매가 완료됐어. 150피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'emo-police-01'
        then '경찰오이 이모티콘팩 구매가 완료됐어. 230피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'emo-thanks-01'
        then '감사오이 이모티콘팩 구매가 완료됐어. 150피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'emo-sorry-01'
        then '사과오이 이모티콘팩 구매가 완료됐어. 180피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'emo-carrot-01'
        then '특별제작 당근 이모티콘팩 구매가 완료됐어. 310피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'character-carrot-01'
        then '테토당근 캐릭터 구매가 완료됐어. 530피클이 차감됐고 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'emo-heart-01'
        then '애정오이 이모티콘팩 구매가 완료됐어. 300피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'skin-cucumbergirl'
        then '오이소녀 캐릭터 구매가 완료됐어. 820피클이 차감됐고 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'character-fat-avocado-01'
        then '아보카도 캐릭터 구매가 완료됐어. 580피클이 차감됐고 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'character-grilled-egg-01'
        then '구운계란 캐릭터 구매가 완료됐어. 640피클이 차감됐고 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'character-cucumberboy-01'
        then '오이소년 캐릭터 구매가 완료됐어. 878피클이 차감됐고 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'character-eggpotato-01'
        then '알감자 캐릭터 구매가 완료됐어. 532피클이 차감됐고 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'emo-sad-01'
        then '슬픈오이 이모티콘팩 구매가 완료됐어. 210피클이 차감됐고 바로 사용할 수 있어.'
      when p_item_id = 'skin-cucumbergirl-01'
        then '오이소녀 경찰스킨 구매가 완료됐어. 923피클이 차감됐고 내프로필 오이소녀 스킨 인벤토리에서 착용할 수 있어.'
      when p_item_id = 'bgm-tetocarrot-01'
        then '테토당근 BGM 구매가 완료됐어. 420피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-grilledegg-01'
        then '구운계란의 PT수업 BGM 구매가 완료됐어. 432피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-cucumbergirl-01'
        then '오이소녀의 데뷔 BGM 구매가 완료됐어. 542피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-fat-avocado-01'
        then '아보카도의 산책 BGM 구매가 완료됐어. 393피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'bgm-cucumber-01'
        then 'lofi 말린오이 BGM 구매가 완료됐어. 382피클이 차감됐고 내프로필 BGM 인벤토리에서 선택할 수 있어.'
      when p_item_id = 'emo-eat-01'
        then '먹방오이 이모티콘팩 구매가 완료됐어. 220피클이 차감됐고 바로 사용할 수 있어.'
      else '구매가 완료됐어.'
    end,
    coalesce(v_balance, 0);
end;
$$;

grant execute on function public.purchase_store_item(text) to authenticated;