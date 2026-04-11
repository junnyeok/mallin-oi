import { withAssetVersion } from './site-version.js';

export const BASIC_EMOTICON_PACK = Array.from({ length: 7 }, (_, index) => {
  const order = index + 1;

  return {
    code: `free-${order}`,
    label: `기본 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/free-${order}.png`),
    displayOrder: order,
  };
});

export const CHEER_EMOTICON_PACK = Array.from({ length: 5 }, (_, index) => {
  const order = index + 1;

  return {
    code: `cheer-${order}`,
    label: `응원 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/cheer-${order}.png`),
    displayOrder: order,
  };
});

export const POLICE_EMOTICON_PACK = Array.from({ length: 8 }, (_, index) => {
  const order = index + 1;

  return {
    code: `police-${order}`,
    label: `경찰 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/police-${order}.png`),
    displayOrder: 200 + order,
  };
});

export const THANKS_EMOTICON_PACK = Array.from({ length: 5 }, (_, index) => {
  const order = index + 1;

  return {
    code: `thanks-${order}`,
    label: `감사 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/thanks-${order}.png`),
    displayOrder: 300 + order,
  };
});

export const SORRY_EMOTICON_PACK = Array.from({ length: 6 }, (_, index) => {
  const order = index + 1;

  return {
    code: `sorry-${order}`,
    label: `사과 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/sorry-${order}.png`),
    displayOrder: 400 + order,
  };
});

export const CARROT_EMOTICON_PACK = Array.from({ length: 13 }, (_, index) => {
  const order = index + 1;

  return {
    code: `carrot-${order}`,
    label: `당근 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/carrot-${order}.png`),
    displayOrder: 500 + order,
  };
});

export const HEART_EMOTICON_PACK = Array.from({ length: 11 }, (_, index) => {
  const order = index + 1;

  return {
    code: `heart-${order}`,
    label: `애정오이 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/heart-${order}.png`),
    displayOrder: 600 + order,
  };
});

export const TETO_CARROT_CHARACTER_PREVIEW = [
  {
    code: 'char-teto-carrot-basic',
    label: '테토당근 캐릭터',
    imagePath: withAssetVersion('./images/characters/teto-carrot.png'),
    displayOrder: 1,
  },
];

export const CUCUMBER_GIRL_SKIN_PREVIEW = [
  {
    code: 'char-cucumber-girl',
    label: '오이소녀 오이스킨',
    imagePath: withAssetVersion('./images/skins/cucumbergirl.png'),
    displayOrder: 1,
  },
];

export const FAT_AVOCADO_CHARACTER_PREVIEW = [
  {
    code: 'char-fat-avocado-basic',
    label: '아보카도 캐릭터',
    imagePath: withAssetVersion('./images/characters/fat-avocado.png'),
    displayOrder: 1,
  },
];

export const GRILLED_EGG_CHARACTER_PREVIEW = [
  {
    code: 'char-grilled-egg-basic',
    label: '구운계란 캐릭터',
    imagePath: withAssetVersion('./images/characters/grilled-egg.png'),
    displayOrder: 1,
  },
];

export const STORE_ITEMS = [
  {
    id: 'emo-basic-01',
    name: '기본 말린오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🥒',
    thumbImagePath: withAssetVersion('./images/emoticons/free-7.png'),
    price: 0,
    state: '무료 지급',
    description: '사이트 기본 지급용 이모티콘 7종 묶음.',
    detailDescription:
      '말린오이닷컴 기본 이모티콘팩이야. 가입 후 누구나 무료로 받을 수 있고, 게시물/댓글/답글 작성 시 사용할 수 있어.',
    previewImages: BASIC_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'emo-cheer-01',
    name: '응원오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🎉',
    thumbImagePath: withAssetVersion('./images/emoticons/cheer-1.png'),
    price: 150,
    state: '판매 중',
    description: '축하, 응원, 박수 반응용 이모티콘 세트.',
    detailDescription:
      '응원, 축하, 박수 반응에 쓰기 좋은 응원 이모티콘팩이야. 구매하면 5개의 응원 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: CHEER_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'emo-police-01',
    name: '경찰오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🚓',
    thumbImagePath: withAssetVersion('./images/emoticons/police-1.png'),
    price: 230,
    state: '판매 중',
    description: '경찰 모자, 장비 등이 들어간 이모티콘 세트.',
    detailDescription:
      '경찰 테마 이모티콘팩이야. 경찰 모자, 장비, 순찰차 등을 넣어봤어. 구매하면 8개의 경찰 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: POLICE_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'emo-thanks-01',
    name: '감사오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🙇🏽‍♂️',
    thumbImagePath: withAssetVersion('./images/emoticons/thanks-1.png'),
    price: 150,
    state: '판매 중',
    description: '감사인사를 하는 오이 이모티콘 세트.',
    detailDescription:
      '오이 캐릭터가 감사인사를 하는 이모티콘 세트야. 구매하면 5개의 감사 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: THANKS_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'emo-sorry-01',
    name: '사과오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🍎',
    thumbImagePath: withAssetVersion('./images/emoticons/sorry-1.png'),
    price: 180,
    state: '판매 중',
    description: '사과를 하는 오이 이모티콘 세트.',
    detailDescription:
      '오이 캐릭터가 사과를 하는 이모티콘 세트야. 구매하면 6개의 사과 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: SORRY_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'emo-carrot-01',
    name: '특별제작 당근 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🥕',
    thumbImagePath: withAssetVersion('./images/emoticons/carrot-1.png'),
    price: 310,
    state: '판매 중',
    description: '특별제작한 당근을 이모티콘으로 사용할 수 있는 세트.',
    detailDescription:
      '특별제작한 당근 캐릭터를 이모티콘으로 사용할 수 있는 세트야. 구매하면 13개의 당근 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: CARROT_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'character-carrot-01',
    name: '테토당근 캐릭터',
    category: 'character',
    badge: '캐릭터',
    icon: '🥕',
    thumbImagePath: withAssetVersion('./images/characters/teto-carrot.png'),
    price: 530,
    state: '판매 중',
    description: '내 캐릭터를 오이말고 당근으로도 설정할 수 있어!',
    detailDescription:
      '프로필 캐릭터를 테토당근으로 설정할 수 있어. 구매하면 내프로필 인벤토리의 캐릭터 목록에 테토당근이 추가되고, 착용 시 게시물/댓글/답글 닉네임 오른쪽에 표시돼.',
    previewImages: TETO_CARROT_CHARACTER_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'skin-cucumbergirl',
    name: '오이소녀 오이스킨',
    category: 'skin',
    badge: '스킨',
    icon: '👒',
    thumbImagePath: withAssetVersion('./images/skins/cucumbergirl.png'),
    price: 820,
    state: '판매 중',
    description: '기본오이 캐릭터에 착용 가능한 오이소녀 스킨.',
    detailDescription:
      '기본오이 캐릭터 전용 오이명품백을 들고있는 오이소녀 스킨이야. 구매하면 내프로필의 기본오이 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: CUCUMBER_GIRL_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'character-fat-avocado-01',
    name: '아보카도 캐릭터',
    category: 'character',
    badge: '캐릭터',
    icon: '🥑',
    thumbImagePath: withAssetVersion('./images/characters/fat-avocado.png'),
    price: 580,
    state: '판매 중',
    description: '아보카도 캐릭터를 사용할 수 있어.',
    detailDescription:
      '아보카도 캐릭터야. 구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: FAT_AVOCADO_CHARACTER_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'character-grilled-egg-01',
    name: '구운계란 캐릭터',
    category: 'character',
    badge: '캐릭터',
    icon: '🥚',
    thumbImagePath: withAssetVersion('./images/characters/grilled-egg.png'),
    price: 640,
    state: '판매 중',
    description: '운동 후에 구운계란은 좋아.',
    detailDescription:
      '구운계란 캐릭터야. 구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: GRILLED_EGG_CHARACTER_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'fashion-bag-01',
    name: '미니 크로스백',
    category: 'fashion',
    badge: '꾸미기',
    icon: '👜',
    price: 280,
    state: '장착 기능 예정',
    description: '가볍게 메는 포인트 아이템.',
    detailDescription: '캐릭터에 장착할 수 있는 크로스백 아이템이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'profile-bg-02',
    name: '프로필 배경 - 야간 순찰',
    category: 'profile',
    badge: '테마',
    icon: '🌃',
    price: 520,
    state: '적용 기능 예정',
    description: '어두운 톤의 야간 감성 배경 테마.',
    detailDescription: '야간 감성 프로필 배경 테마야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'profile-frame-02',
    name: '프로필 테두리 - 골드 배지',
    category: 'profile',
    badge: '한정',
    icon: '🏅',
    price: 560,
    state: '적용 기능 예정',
    description: '프로필을 더 눈에 띄게 보여주는 금빛 프레임.',
    detailDescription: '골드 배지 느낌의 프로필 프레임이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'fashion-headset-01',
    name: '집중 헤드셋',
    category: 'fashion',
    badge: '꾸미기',
    icon: '🎧',
    price: 300,
    state: '장착 기능 예정',
    description: '집중 모드 느낌을 살려주는 헤드셋 아이템.',
    detailDescription: '집중 테마 꾸미기 아이템이야.',
    previewImages: [],
    isPurchasable: false,
  },
];

export function getFeaturedStoreItems(limit = 15) {
  return STORE_ITEMS.slice(0, limit);
}

export function getStoreItemById(itemId = '') {
  const safeId = String(itemId || '').trim();
  return STORE_ITEMS.find((item) => item.id === safeId) || null;
}

export function getStoreItemDetailHref(itemId = '') {
  return `./store-item.html?id=${encodeURIComponent(String(itemId || '').trim())}`;
}

export const CHARACTER_CATALOG = [
  {
    character_code: 'char-cucumber',
    character_name: '기본오이',
    base_image_path: withAssetVersion('./images/characters/cucumber.png'),
    preview_image_path: withAssetVersion('./images/characters/cucumber.png'),
    display_order: 1,
    store_item_id: null,
  },
  {
    character_code: 'char-teto-carrot',
    character_name: '테토당근',
    base_image_path: withAssetVersion('./images/characters/teto-carrot.png'),
    preview_image_path: withAssetVersion('./images/characters/teto-carrot.png'),
    display_order: 2,
    store_item_id: 'character-carrot-01',
  },
  {
    character_code: 'char-fat-avocado',
    character_name: '아보카도 캐릭터',
    base_image_path: withAssetVersion('./images/characters/fat-avocado.png'),
    preview_image_path: withAssetVersion('./images/characters/fat-avocado.png'),
    display_order: 3,
    store_item_id: 'character-fat-avocado-01',
  },
  {
    character_code: 'char-grilled-egg',
    character_name: '구운계란 캐릭터',
    base_image_path: withAssetVersion('./images/characters/grilled-egg.png'),
    preview_image_path: withAssetVersion('./images/characters/grilled-egg.png'),
    display_order: 4,
    store_item_id: 'character-grilled-egg-01',
  },
];

export const CHARACTER_SKIN_CATALOG = [
  {
    character_code: 'char-cucumber',
    skin_code: 'char-cucumber-basic',
    skin_name: '기본오이',
    image_path: withAssetVersion('./images/characters/cucumber.png'),
    display_order: 1,
    store_item_id: null,
  },
  {
    character_code: 'char-cucumber',
    skin_code: 'char-cucumber-girl',
    skin_name: '오이소녀',
    image_path: withAssetVersion('./images/skins/cucumbergirl.png'),
    display_order: 2,
    store_item_id: 'skin-cucumbergirl',
  },
  {
    character_code: 'char-teto-carrot',
    skin_code: 'char-teto-carrot-basic',
    skin_name: '테토당근',
    image_path: withAssetVersion('./images/characters/teto-carrot.png'),
    display_order: 201,
    store_item_id: 'character-carrot-01',
  },
  {
    character_code: 'char-fat-avocado',
    skin_code: 'char-fat-avocado-basic',
    skin_name: '아보카도 캐릭터',
    image_path: withAssetVersion('./images/characters/fat-avocado.png'),
    display_order: 301,
    store_item_id: 'character-fat-avocado-01',
  },
  {
    character_code: 'char-grilled-egg',
    skin_code: 'char-grilled-egg-basic',
    skin_name: '구운계란 캐릭터',
    image_path: withAssetVersion('./images/characters/grilled-egg.png'),
    display_order: 401,
    store_item_id: 'character-grilled-egg-01',
  },
];
