export const BASIC_EMOTICON_PACK = Array.from({ length: 7 }, (_, index) => {
  const order = index + 1;

  return {
    code: `free-${order}`,
    label: `기본 이모티콘 ${order}`,
    imagePath: `./images/emoticons/free-${order}.png`,
    displayOrder: order,
  };
});

export const CHEER_EMOTICON_PACK = Array.from({ length: 5 }, (_, index) => {
  const order = index + 1;

  return {
    code: `cheer-${order}`,
    label: `응원 이모티콘 ${order}`,
    imagePath: `./images/emoticons/cheer-${order}.png`,
    displayOrder: order,
  };
});

export const STORE_ITEMS = [
  {
    id: 'emo-basic-01',
    name: '기본 말린오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🥒',
    thumbImagePath: './images/emoticons/free-7.png',
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
    name: '응원 오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🎉',
    thumbImagePath: './images/emoticons/cheer-1.png',
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
    badge: '테마',
    icon: '🚓',
    thumbImagePath: './images/emoticons/police-1.png',

    price: 180,
    state: '판매 준비중',
    description: '경찰 모자와 제스처가 들어간 이모티콘 세트.',
    detailDescription:
      '경찰 테마 이모티콘팩이야. 추후 판매 기능을 연결할 예정이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'fashion-hat-01',
    name: '초록 모자',
    category: 'fashion',
    badge: '꾸미기',
    icon: '🧢',
    price: 220,
    state: '장착 기능 예정',
    description: '오이 캐릭터 머리에 장착할 수 있는 기본 모자.',
    detailDescription: '오이 캐릭터 머리에 장착하는 꾸미기 아이템이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'fashion-cloth-01',
    name: '후드티',
    category: 'fashion',
    badge: '꾸미기',
    icon: '👕',
    price: 320,
    state: '장착 기능 예정',
    description: '오이 캐릭터 전용 후드티 아이템.',
    detailDescription: '오이 캐릭터 전용 후드티 꾸미기 아이템이야.',
    previewImages: [],
    isPurchasable: false,
  },
  {
    id: 'fashion-shoes-01',
    name: '러닝화',
    category: 'fashion',
    badge: '꾸미기',
    icon: '👟',
    price: 260,
    state: '장착 기능 예정',
    description: '캐릭터 하단 장착용 신발 아이템.',
    detailDescription: '캐릭터 하단 장착용 신발 꾸미기 아이템이야.',
    previewImages: [],
    isPurchasable: false,
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
    thumbImagePath: './images/emoticons/nightwork-1.png',

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
    thumbImagePath: './images/emoticons/work-1.png',
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
