export type VillageUser = {
  id: string;
  nickname: string;
  character: string;
  skin?: string;
  effect?: string;
  isOnline: boolean;
  houseId: string;
};

export type VillageSnapshot = {
  generatedAt: string;
  users: VillageUser[];
  unreadPostCount: number;
};

const API_URL = (import.meta.env.VITE_MALLINOI_API_URL as string | undefined)?.replace(/\/$/, "");

const SUPABASE_URL = (
  import.meta.env.VITE_MALLINOI_SUPABASE_URL as string | undefined
)?.replace(/\/$/, "");
const SUPABASE_PUBLISHABLE_KEY = import.meta.env
  .VITE_MALLINOI_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export type PlayerEquipment = {
  id: string;
  nickname: string;
  profileImageUrl: string;
  characterCode: string;
  characterName: string;
  characterImageUrl: string;
  skinName: string;
  effectItemId: string | null;
  effectName: string | null;
  effectImageUrl: string | null;
};

type PublicProfileRow = {
  id?: string | null;
  nickname?: string | null;
  profile_image_url?: string | null;
  equipped_character_image_url?: string | null;
  equipped_character_effect_item_id?: string | null;
};

export const ownerFallbackEquipment: PlayerEquipment = {
  id: "25e117d3-89c0-42bb-835d-454881e5ba1a",
  nickname: "말오닷 주인장",
  profileImageUrl:
    "https://tfztkeihdqkfzwpilyky.supabase.co/storage/v1/object/public/profile-images/25e117d3-89c0-42bb-835d-454881e5ba1a/1782271289598-47aeea21c38ec.png",
  characterCode: "char-cucumber",
  characterName: "기본오이",
  characterImageUrl: "/skins/spioi.png",
  skinName: "당신의 친절한 오이",
  effectItemId: "cha-effects-web-01",
  effectName: "거미줄 효과",
  effectImageUrl: "/effects/spider-web-effect-01.png",
};

function toGameAssetPath(source: string | null | undefined) {
  const value = String(source || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;

  const normalized = value.replace(/^\.\//, "/");
  if (normalized.startsWith("/images/skins/")) {
    return normalized.replace("/images/skins/", "/skins/");
  }
  if (normalized.startsWith("/images/characters/")) {
    return normalized.replace("/images/characters/", "/characters/");
  }
  if (normalized.startsWith("/images/character-effects/")) {
    return normalized.replace("/images/character-effects/", "/effects/");
  }
  return normalized;
}

function getEffectEquipment(effectItemId: string | null | undefined) {
  if (effectItemId === "cha-effects-web-01") {
    return {
      effectItemId,
      effectName: "거미줄 효과",
      effectImageUrl: "/effects/spider-web-effect-01.png",
    };
  }

  if (effectItemId === "cha-effects-cucumberheart-01") {
    return {
      effectItemId,
      effectName: "오이 하트 효과",
      effectImageUrl: "/effects/cucumber-heart.png",
    };
  }

  if (effectItemId === "cha-effects-fire-01") {
    return {
      effectItemId,
      effectName: "불꽃 효과",
      effectImageUrl: "/effects/fire-effect-01.png",
    };
  }

  return { effectItemId: null, effectName: null, effectImageUrl: null };
}

function mapPublicProfile(row: PublicProfileRow): PlayerEquipment {
  const characterImageUrl =
    toGameAssetPath(row.equipped_character_image_url) ||
    ownerFallbackEquipment.characterImageUrl;
  const isKindCucumber = characterImageUrl.endsWith("/spioi.png");
  const effect = getEffectEquipment(row.equipped_character_effect_item_id);

  return {
    ...ownerFallbackEquipment,
    id: row.id || ownerFallbackEquipment.id,
    nickname: row.nickname || ownerFallbackEquipment.nickname,
    profileImageUrl:
      toGameAssetPath(row.profile_image_url) ||
      ownerFallbackEquipment.profileImageUrl,
    characterCode: isKindCucumber ? "char-cucumber" : "unknown",
    characterName: isKindCucumber ? "기본오이" : "장착 캐릭터",
    characterImageUrl,
    skinName: isKindCucumber ? "당신의 친절한 오이" : "장착 스킨",
    ...effect,
  };
}

export async function loadVillageSnapshot(signal?: AbortSignal): Promise<VillageSnapshot | null> {
  if (!API_URL) return null;

  const response = await fetch(`${API_URL}/v1/game/village`, {
    credentials: "include",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Village API request failed: ${response.status}`);
  }

  return response.json() as Promise<VillageSnapshot>;
}

export async function loadPublicPlayerEquipment(
  nickname = "말오닷 주인장",
  signal?: AbortSignal,
): Promise<PlayerEquipment> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return ownerFallbackEquipment;
  }

  const endpoint = new URL(`${SUPABASE_URL}/rest/v1/public_profiles`);
  endpoint.searchParams.set(
    "select",
    "id,nickname,profile_image_url,equipped_character_image_url,equipped_character_effect_item_id",
  );
  endpoint.searchParams.set("nickname", `eq.${nickname}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint, {
    headers: {
      Accept: "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
    },
    signal,
  });

  if (!response.ok) {
    throw new Error(`Public profile request failed: ${response.status}`);
  }

  const rows = (await response.json()) as PublicProfileRow[];
  return rows[0] ? mapPublicProfile(rows[0]) : ownerFallbackEquipment;
}
