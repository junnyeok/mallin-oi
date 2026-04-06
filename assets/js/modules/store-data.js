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
    id: 'profile-bg-01',
    name: '프로필 배경 - 잔디밭',
    category: 'profile',
    badge: '프로필',
    icon: '🌿',
    price: 400,
    state: '적용 기능 예정',
    description: '프로필 상단 배경에 적용할 수 있는 잔디 느낌 배경.',
    detailDescription: '프로필 상단에 적용할 수 있는 배경 아이템이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'profile-frame-01',
    name: '프로필 테두리 - 반짝 피클',
    category: 'profile',
    badge: '프로필',
    icon: '✨',
    price: 450,
    state: '적용 기능 예정',
    description: '프로필 사진 둘레에 표시되는 장식 프레임.',
    detailDescription: '프로필 사진 둘레에 적용되는 프레임 아이템이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'emo-work-01',
    name: '업무집중 오이 이모티콘팩',
    category: 'emoticon',
    badge: '신규',
    icon: '💼',
    thumbImagePath: withAssetVersion('./images/emoticons/nightwork-1.png'),
    price: 190,
    state: '판매 준비중',
    description: '출근, 보고, 완료 체크 반응에 쓰기 좋은 세트.',
    detailDescription:
      '업무 반응형 이모티콘팩이야. 추후 판매 기능 연결 예정이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'emo-study-01',
    name: '자기개발 오이 이모티콘팩',
    category: 'emoticon',
    badge: '신규',
    icon: '📚',
    thumbImagePath: withAssetVersion('./images/emoticons/work-1.png'),
    price: 210,
    state: '판매 준비중',
    description: '공부, 독서, 기록용 리액션 이모티콘 세트.',
    detailDescription:
      '자기개발 반응형 이모티콘팩이야. 추후 판매 기능 연결 예정이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'fashion-glasses-01',
    name: '둥근 안경',
    category: 'fashion',
    badge: '꾸미기',
    icon: '👓',
    price: 240,
    state: '장착 기능 예정',
    description: '오이 캐릭터 얼굴에 착용 가능한 기본 안경.',
    detailDescription: '얼굴에 착용 가능한 안경 꾸미기 아이템이야.',
    previewImages: [],
    isPurchasable: false,
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
