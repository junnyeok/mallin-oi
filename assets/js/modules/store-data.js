import { withAssetVersion } from './site-version.js';

export const WELCOME_BGM_PREVIEW = [
  {
    code: 'bgm-welcome',
    label: '말린오이닷컴 환영 BGM',
    imagePath: withAssetVersion('./images/BGM/welcome.png'),
    displayOrder: 1,
  },
];

export const TETO_CARROT_BGM_PREVIEW = [
  {
    code: 'bgm-tetocarrot',
    label: '테토당근 BGM',
    imagePath: withAssetVersion('./images/BGM/tetocarrot.png'),
    displayOrder: 1,
  },
];

export const GRILLED_EGG_BGM_PREVIEW = [
  {
    code: 'bgm-grilledegg',
    label: '구운계란의 PT수업 BGM',
    imagePath: withAssetVersion('./images/BGM/macho-grilled-egg.png'),
    displayOrder: 1,
  },
];

export const CUCUMBER_GIRL_BGM_PREVIEW = [
  {
    code: 'bgm-cucumbergirl',
    label: '오이소녀의 데뷔 BGM',
    imagePath: withAssetVersion('./images/BGM/cucumbergirl-debuet.png'),
    displayOrder: 1,
  },
];

export const AVOCADO_SUNSET_BGM_PREVIEW = [
  {
    code: 'bgm-avocado-sunset',
    label: '아보카도의 산책 BGM',
    imagePath: withAssetVersion('./images/BGM/avocado-sunset.png'),
    displayOrder: 1,
  },
];

export const BGM_CATALOG = [
  {
    id: 'mallin-oi-welcome',
    storeItemId: null,
    title: '말린오이닷컴 환영 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin_oi_welcome.mp3'),
    coverPath: withAssetVersion('./images/BGM/welcome.png'),
    isDefault: true,
    displayOrder: 1,
  },
  {
    id: 'mallin-oi-tetocarrot',
    storeItemId: 'bgm-tetocarrot-01',
    title: '테토당근 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin_oi_tetocarrot.mp3'),
    coverPath: withAssetVersion('./images/BGM/tetocarrot.png'),
    isDefault: false,
    displayOrder: 2,
  },
  {
    id: 'mallin-oi-grilledegg',
    storeItemId: 'bgm-grilledegg-01',
    title: '구운계란의 PT수업 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin_oi_grilledegg-PT.mp3'),
    coverPath: withAssetVersion('./images/BGM/macho-grilled-egg.png'),
    isDefault: false,
    displayOrder: 3,
  },
  {
    id: 'mallin-oi-cucumbergirl-debuet',
    storeItemId: 'bgm-cucumbergirl-01',
    title: '오이소녀의 데뷔 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion(
      './assets/mp3/mallin-oi_cucumbergirl-debuet.mp3',
    ),
    coverPath: withAssetVersion('./images/BGM/cucumbergirl-debuet.png'),
    isDefault: false,
    displayOrder: 4,
  },
  {
    id: 'mallin-oi-avocado-sunset',
    storeItemId: 'bgm-fat-avocado-01',
    title: '아보카도의 산책 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin-oi_avocado-sunset.mp3'),
    coverPath: withAssetVersion('./images/BGM/avocado-sunset.png'),
    isDefault: false,
    displayOrder: 5,
  },
];

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

export const SAD_EMOTICON_PACK = Array.from({ length: 7 }, (_, index) => {
  const order = index + 1;

  return {
    code: `sad-${order}`,
    label: `슬픈오이 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/sad-${order}.png`),
    displayOrder: 700 + order,
  };
});

export const EAT_EMOTICON_PACK = Array.from({ length: 10 }, (_, index) => {
  const order = index + 1;

  return {
    code: `eat-${order}`,
    label: `먹방오이 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/eat-${order}.png`),
    displayOrder: 800 + order,
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

export const CUCUMBER_GIRL_CHARACTER_PREVIEW = [
  {
    code: 'char-cucumber-girl',
    label: '오이소녀 캐릭터',
    imagePath: withAssetVersion('./images/characters/cucumbergirl.png'),
    displayOrder: 1,
  },
];

export const CUCUMBER_GIRL_POLICE_SKIN_PREVIEW = [
  {
    code: 'char-cucumber-girl-police',
    label: '오이소녀 경찰스킨',
    imagePath: withAssetVersion('./images/skins/cucumbergirl-police.png'),
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
    id: 'bgm-fat-avocado-01',
    name: '아보카도의 산책 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🥑🎵',
    thumbImagePath: withAssetVersion('./images/BGM/avocado-sunset.png'),
    previewAudioPath: withAssetVersion(
      './assets/mp3/mallin-oi_avocado-sunset.mp3',
    ),
    price: 393,
    state: '판매 중',
    description: '아보카도의 산책 BGM.',
    detailDescription:
      '아보카도의 산책 BGM이야. 구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.',
    previewImages: AVOCADO_SUNSET_BGM_PREVIEW,
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
    name: '오이소녀 캐릭터',
    category: 'character',
    badge: '캐릭터',
    icon: '👒',
    thumbImagePath: withAssetVersion('./images/characters/cucumbergirl.png'),
    price: 820,
    state: '판매 중',
    description: '오이소녀 캐릭터를 사용할 수 있어.',
    detailDescription:
      '오이명품백을 들고 있는 오이소녀 캐릭터야. 구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: CUCUMBER_GIRL_CHARACTER_PREVIEW,
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
      '태닝을 한 구운계란형님 캐릭터야. 구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: GRILLED_EGG_CHARACTER_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'emo-sad-01',
    name: '슬픈오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '😭',
    thumbImagePath: withAssetVersion('./images/emoticons/sad-1.png'),
    price: 210,
    state: '판매 중',
    description: '눈물을 흘리는 오이 이모티콘팩.',
    detailDescription:
      '슬퍼하는 오이 이모티콘 세트야. 구매하면 7개의 슬픈오이 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: SAD_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'skin-cucumbergirl-01',
    name: '오이소녀 경찰스킨',
    category: 'skin',
    badge: '스킨',
    icon: '👮🏻‍♀️',
    thumbImagePath: withAssetVersion('./images/skins/cucumbergirl-police.png'),
    price: 923,
    state: '판매 중',
    description: '경찰제복을 입은 오이소녀 스킨.',
    detailDescription:
      '오이소녀 캐릭터 전용 경찰스킨이야. 구매하면 내프로필의 오이소녀 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: CUCUMBER_GIRL_POLICE_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'bgm-tetocarrot-01',
    name: '테토당근 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🥕🎵',
    thumbImagePath: withAssetVersion('./images/BGM/tetocarrot.png'),
    previewAudioPath: withAssetVersion('./assets/mp3/mallin_oi_tetocarrot.mp3'),
    price: 420,
    state: '판매 중',
    description: '테토당근에 어울리는 테토스러운 BGM.',
    detailDescription:
      '테토당근에 어울리는 테토스러운 BGM이야. 구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.',
    previewImages: TETO_CARROT_BGM_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'bgm-grilledegg-01',
    name: '구운계란의 PT수업 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🥚🎵',
    thumbImagePath: withAssetVersion('./images/BGM/macho-grilled-egg.png'),
    previewAudioPath: withAssetVersion(
      './assets/mp3/mallin_oi_grilledegg-PT.mp3',
    ),
    price: 432,
    state: '판매 중',
    description: '구운계란형님의 PT수업 BGM.',
    detailDescription:
      '구운계란형님의 헬스 PT BGM이야. 구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.',
    previewImages: GRILLED_EGG_BGM_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'bgm-cucumbergirl-01',
    name: '오이소녀의 데뷔 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🥒👧🏻🎵',
    thumbImagePath: withAssetVersion('./images/BGM/cucumbergirl-debuet.png'),
    previewAudioPath: withAssetVersion(
      './assets/mp3/mallin-oi_cucumbergirl-debuet.mp3',
    ),
    price: 542,
    state: '판매 중',
    description: '오이소녀의 데뷔 BGM.',
    detailDescription:
      '오이소녀의 첫번째 데뷔곡 BGM이야. 구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.',
    previewImages: CUCUMBER_GIRL_BGM_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'emo-eat-01',
    name: '먹방오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🍚',
    thumbImagePath: withAssetVersion('./images/emoticons/eat-1.png'),
    price: 220,
    state: '판매 중',
    description: '밥먹는 오이 이모티콘팩.',
    detailDescription:
      '밥먹는 오이 이모티콘 세트야. 구매하면 10개의 먹방오이 이모티콘이 계정에 지급되고, 게시물/댓글/답글 작성할 때 바로 사용할 수 있어.',
    previewImages: EAT_EMOTICON_PACK,
    isPurchasable: true,
  },
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
    character_code: 'char-cucumber-girl',
    character_name: '오이소녀 캐릭터',
    base_image_path: withAssetVersion('./images/characters/cucumbergirl.png'),
    preview_image_path: withAssetVersion(
      './images/characters/cucumbergirl.png',
    ),
    display_order: 2,
    store_item_id: 'skin-cucumbergirl',
  },
  {
    character_code: 'char-teto-carrot',
    character_name: '테토당근',
    base_image_path: withAssetVersion('./images/characters/teto-carrot.png'),
    preview_image_path: withAssetVersion('./images/characters/teto-carrot.png'),
    display_order: 3,
    store_item_id: 'character-carrot-01',
  },
  {
    character_code: 'char-fat-avocado',
    character_name: '아보카도 캐릭터',
    base_image_path: withAssetVersion('./images/characters/fat-avocado.png'),
    preview_image_path: withAssetVersion('./images/characters/fat-avocado.png'),
    display_order: 4,
    store_item_id: 'character-fat-avocado-01',
  },
  {
    character_code: 'char-grilled-egg',
    character_name: '구운계란 캐릭터',
    base_image_path: withAssetVersion('./images/characters/grilled-egg.png'),
    preview_image_path: withAssetVersion('./images/characters/grilled-egg.png'),
    display_order: 5,
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
    character_code: 'char-cucumber-girl',
    skin_code: 'char-cucumber-girl-basic',
    skin_name: '오이소녀 캐릭터',
    image_path: withAssetVersion('./images/characters/cucumbergirl.png'),
    display_order: 101,
    store_item_id: 'skin-cucumbergirl',
  },
  {
    character_code: 'char-cucumber-girl',
    skin_code: 'char-cucumber-girl-police',
    skin_name: '오이소녀 경찰스킨',
    image_path: withAssetVersion('./images/skins/cucumbergirl-police.png'),
    display_order: 102,
    store_item_id: 'skin-cucumbergirl-01',
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
