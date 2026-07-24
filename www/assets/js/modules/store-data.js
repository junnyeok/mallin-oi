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

export const EGGPOTATO_KARAOKE_BGM_PREVIEW = [
  {
    code: 'bgm-eggpotato-karaoke',
    label: '알감자교수님의 찐 락발라드 BGM',
    imagePath: withAssetVersion('./images/BGM/potato-karaoke.png'),
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

export const REGGAE_CUCUMBER_BGM_PREVIEW = [
  {
    code: 'bgm-reggae',
    label: '레게 말린오이 BGM',
    imagePath: withAssetVersion('./images/BGM/reggae-cucumber.png'),
    displayOrder: 1,
  },
];

export const LOFI_CUCUMBER_BGM_PREVIEW = [
  {
    code: 'bgm-lofi-cucumber',
    label: 'lofi 말린오이 BGM',
    imagePath: withAssetVersion('./images/BGM/lofi-cucumber.png'),
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
    id: 'mallin-oi-lofi-cucumber',
    storeItemId: 'bgm-cucumber-01',
    title: 'lofi 말린오이 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin-oi_lofi-cucumber.mp3'),
    coverPath: withAssetVersion('./images/BGM/lofi-cucumber.png'),
    isDefault: false,
    displayOrder: 2,
  },
  {
    id: 'mallin-oi-tetocarrot',
    storeItemId: 'bgm-tetocarrot-01',
    title: '테토당근 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin_oi_tetocarrot.mp3'),
    coverPath: withAssetVersion('./images/BGM/tetocarrot.png'),
    isDefault: false,
    displayOrder: 3,
  },
  {
    id: 'mallin-oi-grilledegg',
    storeItemId: 'bgm-grilledegg-01',
    title: '구운계란의 PT수업 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin_oi_grilledegg-PT.mp3'),
    coverPath: withAssetVersion('./images/BGM/macho-grilled-egg.png'),
    isDefault: false,
    displayOrder: 4,
  },
  {
    id: 'mallin-oi-eggpotato-karaoke',
    storeItemId: 'bgm-eggpotato-01',
    title: '알감자교수님의 찐 락발라드 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin-oi_potato-karaoke.mp3'),
    coverPath: withAssetVersion('./images/BGM/potato-karaoke.png'),
    isDefault: false,
    displayOrder: 5,
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
    displayOrder: 6,
  },
  {
    id: 'mallin-oi-avocado-sunset',
    storeItemId: 'bgm-fat-avocado-01',
    title: '아보카도의 산책 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin-oi_avocado-sunset.mp3'),
    coverPath: withAssetVersion('./images/BGM/avocado-sunset.png'),
    isDefault: false,
    displayOrder: 7,
  },
  {
    id: 'mallin-oi-reggae',
    storeItemId: 'bgm-reggae-01',
    title: '레게 말린오이 BGM',
    artist: '말린오이닷컴',
    audioPath: withAssetVersion('./assets/mp3/mallin-oi_reggae.mp3'),
    coverPath: withAssetVersion('./images/BGM/reggae-cucumber.png'),
    isDefault: false,
    displayOrder: 8,
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

export const MOVED_EMOTICON_PACK = Array.from({ length: 11 }, (_, index) => {
  const order = index + 1;
  const paddedOrder = String(order).padStart(2, '0');

  return {
    code: `moved-${paddedOrder}`,
    label: `감동/감격오이 이모티콘 ${order}`,
    imagePath: withAssetVersion(`./images/emoticons/moved-${paddedOrder}.png`),
    displayOrder: 900 + order,
  };
});

export const CUCUMBER_GIRL_EMOTICON_PACK = Array.from(
  { length: 10 },
  (_, index) => {
    const order = index + 1;

    return {
      code: `cucumbergirl-${order}`,
      label: `오이소녀 이모티콘 ${order}`,
      imagePath: withAssetVersion(
        `./images/emoticons/emo_cucumbergirl_${order}.png`,
      ),
      displayOrder: 1000 + order,
    };
  },
);

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

export const CUCUMBER_BOY_POLICE_SKIN_PREVIEW = [
  {
    code: 'char-cucumber-boy-police',
    label: '기동대 의무복무 오이소년',
    imagePath: withAssetVersion('./images/skins/cucumberboy_police.png'),
    displayOrder: 1,
  },
];

export const GRILLED_EGG_TRAINER_SKIN_PREVIEW = [
  {
    code: 'char-grilled-egg-trainer',
    label: '구운계란 트레이너 스킨',
    imagePath: withAssetVersion('./images/skins/grilledegg-PT.png'),
    displayOrder: 1,
  },
];

export const CUCUMBER_SOLDIER_SKIN_PREVIEW = [
  {
    code: 'char-cucumber-soldier',
    label: '군인오이 스킨',
    imagePath: withAssetVersion('./images/skins/cucumber-soldier.png'),
    displayOrder: 1,
  },
];

export const AVOCADO_CAFE_SKIN_PREVIEW = [
  {
    code: 'char-fat-avocado-cafe',
    label: '아보카도 카페사장 스킨',
    imagePath: withAssetVersion('./images/skins/avocado-cafe.png'),
    displayOrder: 1,
  },
];

export const TETOCARROT_ROCK_SKIN_PREVIEW = [
  {
    code: 'char-teto-carrot-rock',
    label: '테토당근 락밴드 스킨',
    imagePath: withAssetVersion('./images/skins/tetocarrot-rock.png'),
    displayOrder: 1,
  },
];

export const EGGPOTATO_HOT_SKIN_PREVIEW = [
  {
    code: 'char-egg-potato-hot',
    label: '찐감자 스킨',
    imagePath: withAssetVersion('./images/skins/potato-hot.png'),
    displayOrder: 1,
  },
];

export const EGGPOTATO_POLICE_SKIN_PREVIEW = [
  {
    code: 'char-egg-potato-police',
    label: '경찰학교 알감자교수님 스킨',
    imagePath: withAssetVersion('./images/skins/eggpotato-police.png'),
    displayOrder: 1,
  },
];

export const CUCUMBER_HEART_CHARACTER_EFFECT_PREVIEW = [
  {
    code: 'cha-effect-cucumber-heart',
    label: '말린오이테마 하트 캐릭터 효과',
    imagePath: withAssetVersion(
      './images/character-effects/cucumber-heart.png',
    ),
    placement: 'overhead',
    displayOrder: 1,
  },
];

export const CHARACTER_EFFECT_CATALOG = [
  {
    itemId: 'cha-effects-cucumberheart-01',
    name: '말린오이테마 하트 캐릭터 효과',
    imagePath: withAssetVersion(
      './images/character-effects/cucumber-heart.png',
    ),
    placement: 'overhead',
    className: 'character-effect-img--heart',
    layout: {
      x: '0px',
      y: '4%',
      width: '46%',
      zIndex: '20',
      origin: '50% 100%',
      rotation: '0deg',
      aspectRatio: '2 / 3',
    },
    contexts: {
      profile: {
        x: '0%',
        y: '-4%',
      },
      inventory: {
        x: '0%',
        y: '-3%',
      },
      post: {
        x: '-6%',
        y: '2%',
      },
      comment: {
        x: '-8%',
        y: '0%',
      },
    },
    motion: {
      animation: 'float',
      fromY: '4px',
      toY: '-4px',
      fromScale: '0.96',
      toScale: '1',
      fromOpacity: '0.25',
      toOpacity: '1',
      duration: '2.4s',
      easing: 'ease-in-out',
    },
    displayOrder: 1,
  },
];

export function getCharacterEffectByItemId(itemId = '') {
  const safeItemId = String(itemId || '').trim();

  return (
    CHARACTER_EFFECT_CATALOG.find((item) => item.itemId === safeItemId) || null
  );
}

const CHARACTER_EFFECT_PLACEMENTS = new Set([
  'overhead',
  'behind',
  'side-left',
  'side-right',
  'aura-back',
  'front-small',
]);

const CHARACTER_EFFECT_ANIMATIONS = new Set(['none', 'float']);

const CHARACTER_EFFECT_LAYOUT_CSS_VARS = {
  x: '--character-effect-default-x',
  y: '--character-effect-default-y',
  width: '--character-effect-default-width',
  zIndex: '--character-effect-default-z',
  origin: '--character-effect-default-origin',
  rotation: '--character-effect-default-rotation',
  aspectRatio: '--character-effect-default-aspect-ratio',
};

const CHARACTER_EFFECT_MOTION_CSS_VARS = {
  fromY: '--character-effect-motion-from-y',
  toY: '--character-effect-motion-to-y',
  fromScale: '--character-effect-motion-from-scale',
  toScale: '--character-effect-motion-to-scale',
  fromOpacity: '--character-effect-motion-from-opacity',
  toOpacity: '--character-effect-motion-to-opacity',
  duration: '--character-effect-motion-duration',
  easing: '--character-effect-motion-easing',
};

function getCharacterEffectContext(contextOrOptions = 'default') {
  const context =
    typeof contextOrOptions === 'object'
      ? contextOrOptions?.context
      : contextOrOptions;

  return String(context || 'default').trim().toLowerCase() || 'default';
}

function mapCharacterEffectCssVars(values = {}, mapping = {}) {
  return Object.entries(mapping).reduce((cssVars, [key, cssVarName]) => {
    const value = String(values?.[key] ?? '').trim();
    if (value) cssVars[cssVarName] = value;
    return cssVars;
  }, {});
}

export function getCharacterEffectRenderMeta(
  itemId = '',
  contextOrOptions = 'default',
) {
  const effect = getCharacterEffectByItemId(itemId);
  if (!effect?.imagePath) return null;

  const placement = CHARACTER_EFFECT_PLACEMENTS.has(effect.placement)
    ? effect.placement
    : 'overhead';
  const context = getCharacterEffectContext(contextOrOptions);
  const contextLayout =
    effect.contexts && typeof effect.contexts === 'object'
      ? effect.contexts[context]
      : null;
  const layout = {
    ...(effect.layout && typeof effect.layout === 'object'
      ? effect.layout
      : {}),
    ...(contextLayout && typeof contextLayout === 'object'
      ? contextLayout
      : {}),
  };
  const motion =
    effect.motion && typeof effect.motion === 'object' ? effect.motion : {};
  const animation = CHARACTER_EFFECT_ANIMATIONS.has(motion.animation)
    ? motion.animation
    : 'none';
  const cssVars = {
    ...(effect.cssVars && typeof effect.cssVars === 'object'
      ? effect.cssVars
      : {}),
    ...mapCharacterEffectCssVars(
      layout,
      CHARACTER_EFFECT_LAYOUT_CSS_VARS,
    ),
    ...mapCharacterEffectCssVars(
      motion,
      CHARACTER_EFFECT_MOTION_CSS_VARS,
    ),
  };

  return {
    ...effect,
    placement,
    context,
    animation,
    className: String(effect.className || '').trim(),
    cssVars,
  };
}

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

export const CUCUMBER_BOY_CHARACTER_PREVIEW = [
  {
    code: 'char-cucumber-boy-basic',
    label: '오이소년 캐릭터',
    imagePath: withAssetVersion('./images/characters/cucumberboy.png'),
    displayOrder: 1,
  },
];

export const EGG_POTATO_CHARACTER_PREVIEW = [
  {
    code: 'char-egg-potato-basic',
    label: '알감자 캐릭터',
    imagePath: withAssetVersion('./images/characters/eggpotato.png'),
    displayOrder: 1,
  },
];

export const PROFILE_BACKGROUND_CATALOG = [
  {
    itemId: 'BG-01',
    name: '중앙경찰학교 카툰배경',
    pcImagePath: withAssetVersion('./images/profile-background/CPA.png'),
    mobileImagePath: withAssetVersion(
      './images/profile-background/CPA-mobile.png',
    ),
    thumbImagePath: withAssetVersion('./images/profile-background/CPA.png'),
    displayOrder: 1,
  },
  {
    itemId: 'BG-02',
    name: '야간 순찰 배경',
    pcImagePath: withAssetVersion('./images/profile-background/nightwork.png'),
    mobileImagePath: withAssetVersion(
      './images/profile-background/nightwork-mobile.png',
    ),
    thumbImagePath: withAssetVersion(
      './images/profile-background/nightwork.png',
    ),
    displayOrder: 2,
  },
];

export function getProfileBackgroundByItemId(itemId = '') {
  const safeItemId = String(itemId || '').trim();

  return (
    PROFILE_BACKGROUND_CATALOG.find(
      (item) => String(item?.itemId || '').trim() === safeItemId,
    ) || null
  );
}

export const PROFILE_FRAME_RAINBOW_PREVIEW = [
  {
    code: 'BF-01-pc',
    label: 'PC 버전 미리보기',
    imagePath: withAssetVersion('./images/profile-frame/rainbow.png'),
    displayOrder: 1,
  },
  {
    code: 'BF-01-mobile',
    label: '모바일 버전 미리보기',
    imagePath: withAssetVersion('./images/profile-frame/rainbow-mobile.png'),
    displayOrder: 2,
  },
];

export const PROFILE_FRAME_CATALOG = [
  {
    itemId: 'BF-01',
    name: '무지개 프로필 테두리',
    pcImagePath: withAssetVersion('./images/profile-frame/rainbow.png'),
    mobileImagePath: withAssetVersion(
      './images/profile-frame/rainbow-mobile.png',
    ),
    thumbImagePath: withAssetVersion('./images/profile-frame/rainbow.png'),
    displayOrder: 1,
  },
];

export function getProfileFrameByItemId(itemId = '') {
  const safeItemId = String(itemId || '').trim();

  return (
    PROFILE_FRAME_CATALOG.find(
      (item) => String(item?.itemId || '').trim() === safeItemId,
    ) || null
  );
}

export const STORE_ITEMS = [
  {
    id: 'character-tomato-01',
    name: '방울토마토리토',
    category: 'character',
    badge: '캐릭터',
    icon: '🍅',
    thumbImagePath: withAssetVersion('./images/characters/tomato.png'),
    price: 543,
    state: '판매 중',
    description: '레게를 좋아하는 멕시코 토마토 아저씨야.',
    detailDescription:
      '이태원에서 케밥 장사를 하고 있어.<br>(구매하면 내 프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.)',
    previewImages: [
      {
        code: 'character-tomato-01-preview',
        label: '방울토마토리토 미리보기',
        imagePath: withAssetVersion('./images/characters/tomato.png'),
        displayOrder: 1,
      },
    ],
    isPurchasable: true,
  },
  {
    id: 'character-brocolli-01',
    name: '브로콜리 알바생',
    category: 'character',
    badge: '캐릭터',
    icon: '🥦',
    thumbImagePath: withAssetVersion('./images/characters/brocolli.png'),
    price: 682,
    state: '판매 중',
    description: '까칠한 브로콜리 알바생이야.',
    detailDescription:
      '힙합을 준비하는 래퍼 지망생이야. 낮에는 편의점 알바, 밤에는 곡 작업을 하고 있어.<br>(구매하면 내 프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.)',
    previewImages: [
      {
        code: 'character-brocolli-01-preview',
        label: '브로콜리 알바생 미리보기',
        imagePath: withAssetVersion('./images/characters/brocolli.png'),
        displayOrder: 1,
      },
    ],
    isPurchasable: true,
  },
  {
    id: 'emo_cucumbergirl_01',
    name: '오이소녀 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🥒👧🏼',
    thumbImagePath: withAssetVersion(
      './images/emoticons/emo_cucumbergirl_1.png',
    ),
    price: 380,
    state: '판매 중',
    description: '오이소녀의 스티커 느낌의 이모티콘 팩이야.',
    detailDescription:
      '오이소녀의 스티커 느낌의 이모티콘 팩이야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
    previewImages: CUCUMBER_GIRL_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'skin-cucumberboy-01',
    name: '기동대 의무복무 오이소년',
    category: 'skin',
    badge: '스킨',
    icon: '🥒👮‍♂️',
    thumbImagePath: withAssetVersion(
      './images/skins/cucumberboy_police.png',
    ),
    price: 875,
    state: '판매 중',
    description: '기동대 의무복무에 끌려간 오이소년이야.',
    detailDescription:
      '오이소년은 거점근무를 제일 선호해. <br>(구매하면 내프로필의 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.)',
    previewImages: CUCUMBER_BOY_POLICE_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'BF-01',
    name: '무지개 프로필 테두리',
    category: 'profile',
    itemType: 'profile-frame',
    badge: '프로필테두리',
    icon: '🌈',
    thumbImagePath: withAssetVersion('./images/profile-frame/rainbow.png'),
    price: 389,
    state: '판매 중',
    description: '프로필을 꾸밀 수 있는 무지개 테두리야.',
    detailDescription:
      '프로필을 꾸밀 수 있는 무지개 테두리야.<br>구매하면 인벤토리의 프로필테두리 항목에 추가되고, 장착하면 프로필카드 테두리에 표시돼.',
    previewImages: PROFILE_FRAME_RAINBOW_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'bgm-reggae-01',
    name: '레게 말린오이 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🇯🇲🎵',
    thumbImagePath: withAssetVersion('./images/BGM/reggae-cucumber.png'),
    previewAudioPath: withAssetVersion('./assets/mp3/mallin-oi_reggae.mp3'),
    price: 326,
    state: '판매 중',
    description: '주인장은 레게도 좋아해.',
    detailDescription:
      '쌈바레게 BGM이야. <br>(구매하면 내프로필의 인벤토리에 추가되고, 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
    previewImages: REGGAE_CUCUMBER_BGM_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'emo-moved-01',
    name: '감동/감격오이 이모티콘팩',
    category: 'emoticon',
    badge: '이모티콘',
    icon: '🤩',
    thumbImagePath: withAssetVersion('./images/emoticons/moved-01.png'),
    price: 260,
    state: '판매 중',
    description: '감동/감격 받은 오이 이모티콘팩.',
    detailDescription:
      '감동/감격 받은 오이 이모티콘팩야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
    previewImages: MOVED_EMOTICON_PACK,
    isPurchasable: true,
  },
  {
    id: 'BG-01',
    name: '중앙경찰학교 카툰배경',
    category: 'profile',
    itemType: 'profile-background',
    badge: '프로필배경',
    icon: '👮🏽‍♂️',
    thumbImagePath: withAssetVersion('./images/profile-background/CPA.png'),
    price: 438,
    state: '판매 중',
    description: '경찰관들의 추억의 장소야.',
    detailDescription:
      '중앙경찰학교에 간 경찰관들은 한번쯤은 꼭 이 장소에서 사진을 찍었어.<br>구매하면 인벤토리의 프로필배경 항목에 추가되고, 장착하면 프로필카드 배경에 표시돼.',
    previewImages: [
      {
        code: 'BG-01-pc',
        label: 'PC 버전 미리보기',
        imagePath: withAssetVersion('./images/profile-background/CPA.png'),
        displayOrder: 1,
      },
      {
        code: 'BG-01-mobile',
        label: '모바일 버전 미리보기',
        imagePath: withAssetVersion(
          './images/profile-background/CPA-mobile.png',
        ),
        displayOrder: 2,
      },
    ],
    isPurchasable: true,
  },
  {
    id: 'BG-02',
    name: '야간 순찰 배경',
    category: 'profile',
    itemType: 'profile-background',
    badge: '프로필배경',
    icon: '🌃',
    thumbImagePath: withAssetVersion(
      './images/profile-background/nightwork.png',
    ),
    price: 382,
    state: '판매 중',
    description:
      '도심지를 야간 순찰하며 잠시 한적한 곳에서 야경을 바라보는 풍경이야.',
    detailDescription:
      '도시를 야간 순찰하는 배경이야.<br>구매하면 인벤토리의 프로필배경 항목에 추가되고, 장착하면 프로필카드 배경에 표시돼.',
    previewImages: [
      {
        code: 'BG-02-pc',
        label: 'PC 버전 미리보기',
        imagePath: withAssetVersion(
          './images/profile-background/nightwork.png',
        ),
        displayOrder: 1,
      },
      {
        code: 'BG-02-mobile',
        label: '모바일 버전 미리보기',
        imagePath: withAssetVersion(
          './images/profile-background/nightwork-mobile.png',
        ),
        displayOrder: 2,
      },
    ],
    isPurchasable: true,
  },
  {
    id: 'skin-eggpotato-02',
    name: '경찰학교 알감자교수님 스킨',
    category: 'skin',
    badge: '스킨',
    icon: '🥔👮🏽‍♂️',
    thumbImagePath: withAssetVersion('./images/skins/eggpotato-police.png'),
    price: 578,
    state: '판매 중',
    description: '중앙경찰학교로 파견간 알감자 교수님이야.',
    detailDescription:
      '중앙경찰학교로 파견간 알감자 교수님이야.<br>구매하면 인벤토리의 스킨 항목에 추가되고, 장착하면 프로필/게시물/댓글/답글의 내 캐릭터에 표시돼.',
    previewImages: EGGPOTATO_POLICE_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'cha-effects-cucumberheart-01',
    name: '말린오이테마 하트 캐릭터 효과',
    category: 'cha-effects',
    badge: '캐릭터효과',
    icon: '💚',
    thumbImagePath: withAssetVersion(
      './images/character-effects/cucumber-heart.png',
    ),
    price: 385,
    state: '판매 중',
    description: '말린오이닷컴 테마에 어울리는 하트야.',
    detailDescription:
      '말린오이닷컴 테마에 어울리는 하트 캐릭터 효과야.<br>구매하면 인벤토리의 캐릭터 효과 항목에 추가되고, 장착하면 프로필/게시물/댓글/답글의 내 캐릭터에 표시돼.',
    previewImages: CUCUMBER_HEART_CHARACTER_EFFECT_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'bgm-eggpotato-01',
    name: '알감자교수님의 찐 락발라드 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🥔🎵',
    thumbImagePath: withAssetVersion('./images/BGM/potato-karaoke.png'),
    previewAudioPath: withAssetVersion(
      './assets/mp3/mallin-oi_potato-karaoke.mp3',
    ),
    price: 468,
    state: '판매 중',
    description: '알감자 교수님의 취미는 혼코노야.',
    detailDescription:
      '교수님은 비밀의 직업은 청산했지만 락발라드 만큼은 포기하지 못하셨어. <br>(구매하면 내프로필의 인벤토리에 추가되고, 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
    previewImages: EGGPOTATO_KARAOKE_BGM_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'skin-grilledegg-01',
    name: '구운계란 트레이너 스킨',
    category: 'skin',
    badge: '스킨',
    icon: '👮🏻‍♀️',
    thumbImagePath: withAssetVersion('./images/skins/grilledegg-PT.png'),
    price: 466,
    state: '판매 중',
    description: '누구보다 PT에 진심인 구운계란 형님이야.',
    detailDescription:
      '구운계란형님에게 등록한 회원은 도망갈 수 없다는 소문이 있어. <br>(구매하면 내프로필의 구운계란 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.>',
    previewImages: GRILLED_EGG_TRAINER_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'skin-cucumber-01',
    name: '군인오이 스킨',
    category: 'skin',
    badge: '스킨',
    icon: '👮🏻‍♀️',
    thumbImagePath: withAssetVersion('./images/skins/cucumber-soldier.png'),
    price: 389,
    state: '판매 중',
    description: '전쟁터에 뛰어든 오이스킨.',
    detailDescription:
      '관리자는 총게임을 좋아해. 모바일배그 닉네임은 말오닷사장이고 클랜명은 말린오이닷컴이야. 친추 및 클랜신청 부탁해. <br>(구매하면 내프로필의 기본오이 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.',
    previewImages: CUCUMBER_SOLDIER_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'skin-avocado-01',
    name: '아보카도 카페사장 스킨',
    category: 'skin',
    badge: '스킨',
    icon: '👮🏻‍♀️',
    thumbImagePath: withAssetVersion('./images/skins/avocado-cafe.png'),
    price: 423,
    state: '판매 중',
    description: '본업을 하는 아보카도 스킨이야.',
    detailDescription:
      '아보카도는 카페 사장이야. 일하기 싫어보이지만 그건 오해야. 누구보다 묵묵히 일하고 있어. <br>(구매하면 내프로필의 아보카도 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.>',
    previewImages: AVOCADO_CAFE_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'skin-tetocarrot-01',
    name: '테토당근 락밴드 스킨',
    category: 'skin',
    badge: '스킨',
    icon: '🥕',
    thumbImagePath: withAssetVersion('./images/skins/tetocarrot-rock.png'),
    price: 445,
    state: '판매 중',
    description: '테토당근의 락밴드 스킨이야.',
    detailDescription:
      '테토당근은 락밴드의 기타리스트를 담당하고 있어. <br>(구매하면 내프로필의 테토당근 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.>',
    previewImages: TETOCARROT_ROCK_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'skin-eggpotato-01',
    name: '찐감자 스킨',
    category: 'skin',
    badge: '스킨',
    icon: '🥔',
    thumbImagePath: withAssetVersion('./images/skins/potato-hot.png'),
    price: 0,
    state: '판매 중',
    description: '알감자 교수님이 화가나면 찐감자가 돼',
    detailDescription:
      '알감자 교수님은 평소 온화하고 화를 내지 않는 순한 성격을 가지고 있어. 그치만 알감자교수님의 과거는 꽤 무서워. 깡패생활을 청산한 건 일급비밀이야. 절대 그의 안경을 벗기지마!!<br>(구매하면 내프로필의 알감자 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.>',
    previewImages: EGGPOTATO_HOT_SKIN_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'character-cucumberboy-01',
    name: '오이소년 캐릭터',
    category: 'character',
    badge: '캐릭터',
    icon: '👦',
    thumbImagePath: withAssetVersion('./images/characters/cucumberboy.png'),
    price: 878,
    state: '판매 중',
    description: '오이소녀에 이은 오이소년 캐릭터야.',
    detailDescription:
      '오이소녀에 이은 오이소년 특별 캐릭터야. <br>(구매하면 내프로필 인벤토리의 캐릭터 목록에 추가되고, 내프로필에 있는 인벤토리에서 클릭해서 바로 착용할 수 있어.)',
    previewImages: CUCUMBER_BOY_CHARACTER_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'character-eggpotato-01',
    name: '알감자 캐릭터',
    category: 'character',
    badge: '캐릭터',
    icon: '🥔',
    thumbImagePath: withAssetVersion('./images/characters/eggpotato.png'),
    price: 532,
    state: '판매 중',
    description: '알감자 교수님 캐릭터를 사용할 수 있어.',
    detailDescription:
      '알감자 교수님의 팔은 항상 붕대가 감겨있는데 아무도 알 수 없어.. 정 궁금하다면 스킨 상점을 확인해봐..! <br>(구매하면 내프로필 인벤토리의 캐릭터 목록에 추가되고, 내프로필에 있는 인벤토리에서 클릭해서 바로 착용할 수 있어.)',
    previewImages: EGG_POTATO_CHARACTER_PREVIEW,
    isPurchasable: true,
  },
  {
    id: 'bgm-cucumber-01',
    name: 'lofi 말린오이 BGM',
    category: 'bgm',
    badge: 'BGM',
    icon: '🥒🎵',
    thumbImagePath: withAssetVersion('./images/BGM/lofi-cucumber.png'),
    previewAudioPath: withAssetVersion(
      './assets/mp3/mallin-oi_lofi-cucumber.mp3',
    ),
    price: 382,
    state: '판매 중',
    description: 'lofigirl 대신 lofi 말린오이 BGM.',
    detailDescription:
      'lofi 말린오이 BGM이야. <br>(구매하면 내프로필의 인벤토리에 추가되고, 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
    previewImages: LOFI_CUCUMBER_BGM_PREVIEW,
    isPurchasable: true,
  },
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
    description: '아보카도는 여유로운 산책을 좋아해.',
    detailDescription:
      '아보카도가 산책 중에 앉아서 남산타워를 구경하며 듣는 BGM이야. <br>(구매하면 내프로필의 인벤토리에 추가되고, 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
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
      '테토력이 넘처나는 테토당근이야. 락밴드의 기타리스트를 담당하고 있어. <br>(구매하면 내프로필 인벤토리의 캐릭터 목록에 테토당근이 추가되고, 착용 시 게시물/댓글/답글 닉네임 오른쪽에 표시돼.)',
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
      '오이명품백을 들고 있는 오이소녀 특별 캐릭터야. <br>(구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.)',
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
    description: '무덤덤한 아보카도 캐릭터를 사용할 수 있어.',
    detailDescription:
      '아보카도의 표정은 불만이 있는 걸로 종종 오해를 받지만 무던하고 부드러운 성격이야. 취미는 독서이고 카페 사장님으로 일을 하고 있어. <br>(구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.)',
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
      '태닝을 한 구운계란형님 캐릭터야. 헬스트레이너로 일 하고 있고 구운계란형님을 등록한 회원은 도망칠 수 없다는 소문이 있어..<br>(구매하면 내프로필의 캐릭터 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.)',
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
      '슬퍼하는 오이 이모티콘 세트야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
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
      '오이소녀 특별 캐릭터 전용 경찰스킨이야. 말린오이닷컴의 치안을 담당하고 잇어. <br>(구매하면 내프로필의 오이소녀 스킨 인벤토리에 추가되고, 클릭해서 바로 착용할 수 있어.>',
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
      '락밴드의 기타리스트로 활동하는 테토당근의 BGM이야. <br>(구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
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
      '구운계란형님의 헬스 PT BGM이야. <br>(구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
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
      '오이소녀의 첫번째 데뷔곡 BGM이야. <br>(구매하면 내프로필의 BGM 인벤토리에 추가되고, 프로필에서 장착 후 상단 BGM 버튼 팝업에서 재생할 수 있어.)',
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
      '밥먹는 오이 이모티콘 세트야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
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
      '말린오이닷컴 기본 이모티콘팩이야. 가입 후 누구나 무료로 받을 수 있고, 게시글/댓글/답글 작성할 때 항상 사용할 수 있어.',
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
      '응원, 축하, 박수 반응에 쓰기 좋은 응원 이모티콘팩이야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
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
      '경찰 테마 이모티콘팩이야. 경찰 모자, 장비, 순찰차 등을 넣어봤어. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
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
      '오이 캐릭터가 감사인사를 하는 이모티콘 세트야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
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
      '오이 캐릭터가 사과를 하는 이모티콘 세트야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
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
      '특별제작한 당근 캐릭터를 이모티콘으로 사용할 수 있는 세트야. 구매 후 인벤토리에서 장착하면 게시글/댓글/답글 작성할 때 사용할 수 있어.',
    previewImages: CARROT_EMOTICON_PACK,
    isPurchasable: true,
  },
].map((item, index) => ({
  ...item,
  // 정확한 출시일 데이터가 없어서 현재 등록 순서를 기준으로 임시값 부여
  releaseDate:
    item.releaseDate ||
    new Date(Date.UTC(2026, 6, 6 - index)).toISOString().slice(0, 10),
}));

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
  {
    character_code: 'char-cucumber-boy',
    character_name: '오이소년 캐릭터',
    base_image_path: withAssetVersion('./images/characters/cucumberboy.png'),
    preview_image_path: withAssetVersion('./images/characters/cucumberboy.png'),
    display_order: 6,
    store_item_id: 'character-cucumberboy-01',
  },
  {
    character_code: 'char-egg-potato',
    character_name: '알감자 캐릭터',
    base_image_path: withAssetVersion('./images/characters/eggpotato.png'),
    preview_image_path: withAssetVersion('./images/characters/eggpotato.png'),
    display_order: 7,
    store_item_id: 'character-eggpotato-01',
  },
  {
    character_code: 'char-tomato',
    character_name: '방울토마토리토',
    base_image_path: withAssetVersion('./images/characters/tomato.png'),
    preview_image_path: withAssetVersion('./images/characters/tomato.png'),
    display_order: 8,
    store_item_id: 'character-tomato-01',
  },
  {
    character_code: 'char-brocolli',
    character_name: '브로콜리 알바생',
    base_image_path: withAssetVersion('./images/characters/brocolli.png'),
    preview_image_path: withAssetVersion('./images/characters/brocolli.png'),
    display_order: 9,
    store_item_id: 'character-brocolli-01',
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
  {
    character_code: 'char-cucumber-boy',
    skin_code: 'char-cucumber-boy-basic',
    skin_name: '오이소년 캐릭터',
    image_path: withAssetVersion('./images/characters/cucumberboy.png'),
    display_order: 501,
    store_item_id: 'character-cucumberboy-01',
  },
  {
    character_code: 'char-cucumber-boy',
    skin_code: 'char-cucumber-boy-police',
    skin_name: '기동대 의무복무 오이소년',
    image_path: withAssetVersion('./images/skins/cucumberboy_police.png'),
    display_order: 502,
    store_item_id: 'skin-cucumberboy-01',
  },
  {
    character_code: 'char-egg-potato',
    skin_code: 'char-egg-potato-basic',
    skin_name: '알감자 캐릭터',
    image_path: withAssetVersion('./images/characters/eggpotato.png'),
    display_order: 601,
    store_item_id: 'character-eggpotato-01',
  },
  {
    character_code: 'char-grilled-egg',
    skin_code: 'char-grilled-egg-trainer',
    skin_name: '구운계란 트레이너 스킨',
    image_path: withAssetVersion('./images/skins/grilledegg-PT.png'),
    display_order: 402,
    store_item_id: 'skin-grilledegg-01',
  },
  {
    character_code: 'char-cucumber',
    skin_code: 'char-cucumber-soldier',
    skin_name: '군인오이 스킨',
    image_path: withAssetVersion('./images/skins/cucumber-soldier.png'),
    display_order: 2,
    store_item_id: 'skin-cucumber-01',
  },
  {
    character_code: 'char-fat-avocado',
    skin_code: 'char-fat-avocado-cafe',
    skin_name: '아보카도 카페사장 스킨',
    image_path: withAssetVersion('./images/skins/avocado-cafe.png'),
    display_order: 302,
    store_item_id: 'skin-avocado-01',
  },
  {
    character_code: 'char-teto-carrot',
    skin_code: 'char-teto-carrot-rock',
    skin_name: '테토당근 락밴드 스킨',
    image_path: withAssetVersion('./images/skins/tetocarrot-rock.png'),
    display_order: 202,
    store_item_id: 'skin-tetocarrot-01',
  },
  {
    character_code: 'char-egg-potato',
    skin_code: 'char-egg-potato-hot',
    skin_name: '찐감자 스킨',
    image_path: withAssetVersion('./images/skins/potato-hot.png'),
    display_order: 602,
    store_item_id: 'skin-eggpotato-01',
  },
  {
    character_code: 'char-egg-potato',
    skin_code: 'char-egg-potato-police',
    skin_name: '경찰학교 알감자교수님 스킨',
    image_path: withAssetVersion('./images/skins/eggpotato-police.png'),
    display_order: 603,
    store_item_id: 'skin-eggpotato-02',
  },
  {
    character_code: 'char-tomato',
    skin_code: 'char-tomato-basic',
    skin_name: '방울토마토리토',
    image_path: withAssetVersion('./images/characters/tomato.png'),
    display_order: 701,
    store_item_id: 'character-tomato-01',
  },
  {
    character_code: 'char-brocolli',
    skin_code: 'char-brocolli-basic',
    skin_name: '브로콜리 알바생',
    image_path: withAssetVersion('./images/characters/brocolli.png'),
    display_order: 801,
    store_item_id: 'character-brocolli-01',
  },
];

export function getCharacterCatalogItemByCode(characterCode = '') {
  const safeCode = String(characterCode || '').trim();
  return (
    CHARACTER_CATALOG.find(
      (item) => String(item?.character_code || '').trim() === safeCode,
    ) || null
  );
}

export function getSkinCatalogItemBySkinCode(skinCode = '') {
  const safeCode = String(skinCode || '').trim();
  return (
    CHARACTER_SKIN_CATALOG.find(
      (item) => String(item?.skin_code || '').trim() === safeCode,
    ) || null
  );
}

export function getSkinParentRequirementBySkinCode(skinCode = '') {
  const skin = getSkinCatalogItemBySkinCode(skinCode);
  if (!skin) return null;

  const parentCharacter = getCharacterCatalogItemByCode(skin.character_code);
  if (!parentCharacter) return null;

  return {
    character_code: String(parentCharacter.character_code || '').trim(),
    character_name:
      String(parentCharacter.character_name || '').trim() || '기본 캐릭터',
    parent_store_item_id:
      String(parentCharacter.store_item_id || '').trim() || null,
  };
}

export function getSkinParentRequirementByStoreItemId(storeItemId = '') {
  const safeId = String(storeItemId || '').trim();

  const skin = CHARACTER_SKIN_CATALOG.find(
    (item) => String(item?.store_item_id || '').trim() === safeId,
  );

  if (!skin) return null;
  return getSkinParentRequirementBySkinCode(skin.skin_code);
}
