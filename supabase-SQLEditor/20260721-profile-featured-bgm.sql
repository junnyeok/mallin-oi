-- =========================================================
-- 2026-07-21 프로필 대표 BGM 설정 및 공개 조회 기능
-- =========================================================

begin;

alter table public.profiles
add column if not exists profile_featured_bgm_item_id text;

comment on column public.profiles.profile_featured_bgm_item_id
is '프로필 진입 시 재생할 대표 BGM 상점 아이템 ID';

-- 재실행 시에도 소유권 또는 BGM 분류가 맞지 않는 기존 값은 공개하지 않는다.
update public.profiles p
set profile_featured_bgm_item_id = null
where p.profile_featured_bgm_item_id is not null
  and not exists (
    select 1
    from public.user_store_items usi
    where usi.user_id = p.id
      and usi.item_id = p.profile_featured_bgm_item_id
      and usi.item_category = 'bgm'
  );

create or replace function public.enforce_profile_featured_bgm_ownership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if nullif(trim(coalesce(new.profile_featured_bgm_item_id, '')), '') is null then
    new.profile_featured_bgm_item_id := null;
    return new;
  end if;

  new.profile_featured_bgm_item_id := trim(new.profile_featured_bgm_item_id);

  if not exists (
    select 1
    from public.user_store_items usi
    where usi.user_id = new.id
      and usi.item_id = new.profile_featured_bgm_item_id
      and usi.item_category = 'bgm'
  ) then
    raise exception '보유한 BGM 상품만 프로필 대표 BGM으로 설정할 수 있습니다.';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_profile_featured_bgm_ownership()
from public, anon, authenticated;

drop trigger if exists trg_enforce_profile_featured_bgm_ownership
on public.profiles;

create trigger trg_enforce_profile_featured_bgm_ownership
before insert or update of profile_featured_bgm_item_id
on public.profiles
for each row
execute function public.enforce_profile_featured_bgm_ownership();

create or replace view public.public_profiles as
select
  id,
  nickname,
  bio,
  profile_image_url,
  equipped_character_image_url,
  equipped_character_effect_item_id,
  equipped_profile_background_item_id,
  equipped_profile_frame_item_id,
  created_at,
  updated_at,
  profile_featured_bgm_item_id
from public.profiles;

grant select on public.public_profiles to anon, authenticated;

create or replace function public.set_my_profile_featured_bgm(p_item_id text)
returns table (
  success boolean,
  message text,
  profile_featured_bgm_item_id text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_item_id text := nullif(trim(coalesce(p_item_id, '')), '');
begin
  if v_user_id is null then
    return query
    select false, '로그인이 필요해.', null::text;
    return;
  end if;

  if v_item_id is not null
     and (char_length(v_item_id) > 100 or v_item_id !~ '^[A-Za-z0-9_-]+$') then
    return query
    select false, '대표 BGM 상품 정보가 올바르지 않아.', null::text;
    return;
  end if;

  if v_item_id is not null
     and not exists (
       select 1
       from public.user_store_items usi
       where usi.user_id = v_user_id
         and usi.item_id = v_item_id
         and usi.item_category = 'bgm'
     ) then
    return query
    select false, '보유한 BGM 상품만 대표로 설정할 수 있어.', null::text;
    return;
  end if;

  update public.profiles p
  set profile_featured_bgm_item_id = v_item_id,
      updated_at = now()
  where p.id = v_user_id;

  if not found then
    return query
    select false, '프로필을 찾을 수 없어.', null::text;
    return;
  end if;

  return query
  select
    true,
    case
      when v_item_id is null then '대표 BGM을 해제했어.'
      else '대표 BGM을 설정했어.'
    end,
    v_item_id;
end;
$$;

revoke all on function public.set_my_profile_featured_bgm(text)
from public, anon;
grant execute on function public.set_my_profile_featured_bgm(text)
to authenticated;

commit;
