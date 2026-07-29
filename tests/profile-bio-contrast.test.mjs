import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  calculateCoverPlacement,
  chooseProfileBioTone,
  compositeColors,
  createLatestProfileBioToneUpdater,
  createProfileBackgroundContrastAnalyzer,
  getContrastRatio,
  getRelativeLuminance,
  parseCssColor,
  PROFILE_BIO_LIGHT_CLASS,
} from '../assets/js/modules/profile-background-contrast.js';

const DEFAULT_TEXT = '#666666';
const LIGHT_TEXT = '#ffffff';

function repeatedSamples(color, count = 12) {
  return Array.from({ length: count }, () => color);
}

test('검정과 어두운 회색 배경은 밝은 소개글을 선택한다', () => {
  for (const background of ['#000000', '#222222']) {
    const result = chooseProfileBioTone(repeatedSamples(background), {
      defaultTextColor: DEFAULT_TEXT,
      lightTextColor: LIGHT_TEXT,
    });

    assert.equal(result.tone, 'light');
    assert.ok(result.lightContrast >= 4.5);
    assert.ok(result.lightContrast > result.defaultContrast);
  }
});

test('밝은 회색과 흰색 배경은 기존 회색 소개글을 유지한다', () => {
  for (const background of ['#dddddd', '#ffffff']) {
    const result = chooseProfileBioTone(repeatedSamples(background), {
      defaultTextColor: DEFAULT_TEXT,
      lightTextColor: LIGHT_TEXT,
    });

    assert.equal(result.tone, 'default');
    assert.ok(result.defaultContrast > result.lightContrast);
  }
});

test('프로필 히어로의 반투명 오버레이를 합성한 뒤 명암비를 계산한다', () => {
  const visibleBackground = compositeColors(
    parseCssColor('#000000'),
    parseCssColor('rgba(255, 255, 255, 0.38)'),
  );
  const result = chooseProfileBioTone(repeatedSamples(visibleBackground), {
    defaultTextColor: DEFAULT_TEXT,
    lightTextColor: LIGHT_TEXT,
  });

  assert.equal(result.tone, 'light');
  assert.ok(result.backgroundLuminance > 0.1);
  assert.ok(result.lightContrast >= 4.5);
});

test('상대 휘도와 명암비는 WCAG 계산의 검정/흰색 기준값을 따른다', () => {
  const black = getRelativeLuminance(parseCssColor('#000000'));
  const white = getRelativeLuminance(parseCssColor('#ffffff'));

  assert.equal(black, 0);
  assert.equal(white, 1);
  assert.equal(getContrastRatio(black, white), 21);
});

test('cover 배치는 실제 카드 비율과 background-position을 반영한다', () => {
  const centered = calculateCoverPlacement({
    containerWidth: 400,
    containerHeight: 800,
    imageWidth: 1000,
    imageHeight: 500,
    backgroundPosition: '50% 50%',
  });

  assert.equal(centered.scale, 1.6);
  assert.equal(centered.renderedWidth, 1600);
  assert.equal(centered.renderedHeight, 800);
  assert.equal(centered.offsetX, -600);
  assert.equal(centered.offsetY, 0);

  const leftAligned = calculateCoverPlacement({
    containerWidth: 400,
    containerHeight: 800,
    imageWidth: 1000,
    imageHeight: 500,
    backgroundPosition: 'left bottom',
  });
  assert.equal(leftAligned.offsetX, 0);
  assert.equal(leftAligned.offsetY, 0);
});

test('같은 이미지와 표시 영역의 분석 결과를 캐시한다', async () => {
  let sampleCount = 0;
  const analyzer = createProfileBackgroundContrastAnalyzer({
    async sampleImage() {
      sampleCount += 1;
      return repeatedSamples('#111111');
    },
  });
  const options = {
    imageUrl: './images/profile-background/future-background.png?v=1',
    cardRect: { width: 720, height: 900 },
    targetRect: { x: 220, y: 250, width: 420, height: 30 },
    backgroundPosition: 'center center',
    overlayColor: 'rgba(255, 255, 255, 0.38)',
    defaultTextColor: DEFAULT_TEXT,
    lightTextColor: LIGHT_TEXT,
  };

  const [first, second] = await Promise.all([
    analyzer.analyze(options),
    analyzer.analyze({ ...options }),
  ]);

  assert.equal(sampleCount, 1);
  assert.deepEqual(first, second);
  assert.equal(analyzer.getCacheSize().results, 1);
});

test('소개글 영역의 크기가 0이어도 분석 경로가 실패하지 않는다', async () => {
  const analyzer = createProfileBackgroundContrastAnalyzer({
    sampleImage: async () => repeatedSamples('#000000'),
  });

  const result = await analyzer.analyze({
    imageUrl: './images/profile-background/empty-bio.png',
    cardRect: { width: 390, height: 844 },
    targetRect: { x: 0, y: 0, width: 0, height: 0 },
    defaultTextColor: DEFAULT_TEXT,
    lightTextColor: LIGHT_TEXT,
  });

  assert.equal(result.tone, 'light');
  assert.equal(result.sampleCount, 12);
});

test('이미지 로드나 캔버스 분석 실패는 기존 회색 상태로 복구한다', async () => {
  const analyzer = createProfileBackgroundContrastAnalyzer({
    sampleImage: async () => {
      throw new Error('CORS blocked');
    },
  });

  const result = await analyzer.analyze({
    imageUrl: 'https://cdn.example.test/profile-background.png',
    cardRect: { width: 720, height: 900 },
    targetRect: { x: 200, y: 260, width: 400, height: 30 },
    defaultTextColor: DEFAULT_TEXT,
    lightTextColor: LIGHT_TEXT,
  });

  assert.deepEqual(result, {
    tone: 'default',
    backgroundLuminance: null,
    defaultContrast: null,
    lightContrast: null,
    sampleCount: 0,
    reason: 'analysis-failed',
  });
});

test('밝은 배경과 어두운 배경을 양방향으로 교체하면 상태가 갱신된다', async () => {
  const appliedTones = [];
  const updater = createLatestProfileBioToneUpdater({
    analyze: async ({ sampleColor }) =>
      chooseProfileBioTone(repeatedSamples(sampleColor), {
        defaultTextColor: DEFAULT_TEXT,
        lightTextColor: LIGHT_TEXT,
      }),
    applyTone: (tone) => appliedTones.push(tone),
  });

  await updater.update({ imageUrl: 'dark.png', sampleColor: '#111111' });
  await updater.update({ imageUrl: 'light.png', sampleColor: '#ffffff' });
  await updater.update({ imageUrl: 'dark-2.png', sampleColor: '#111111' });
  await updater.reset();

  assert.deepEqual(appliedTones, ['light', 'default', 'light', 'default']);
});

test('빠른 연속 교체에서는 마지막 배경의 결과만 반영한다', async () => {
  const resolvers = new Map();
  const appliedTones = [];
  const updater = createLatestProfileBioToneUpdater({
    analyze: ({ imageUrl }) =>
      new Promise((resolve) => {
        resolvers.set(imageUrl, resolve);
      }),
    applyTone: (tone) => appliedTones.push(tone),
  });

  const oldRequest = updater.update({ imageUrl: 'old-dark.png' });
  const latestRequest = updater.update({ imageUrl: 'latest-light.png' });
  resolvers.get('latest-light.png')({ tone: 'default' });
  await latestRequest;
  resolvers.get('old-dark.png')({ tone: 'light' });
  const staleResult = await oldRequest;

  assert.deepEqual(appliedTones, ['default']);
  assert.equal(staleResult.stale, true);
});

test('소개글 전용 클래스만 실제 색상 토큰을 사용한다', async () => {
  const [profileCss, contrastSource] = await Promise.all([
    readFile('assets/css/main/profile-main.css', 'utf8'),
    readFile('assets/js/modules/profile-background-contrast.js', 'utf8'),
  ]);
  const escapedClass = PROFILE_BIO_LIGHT_CLASS.replaceAll('-', '\\-');
  const rule = profileCss.match(
    new RegExp(
      `body\\[data-page='profile'\\]\\s+\\.profile-hero__desc\\.${escapedClass}\\s*\\{([^}]*)\\}`,
    ),
  );

  assert.ok(rule, '소개글 전용 어두운 배경 규칙이 필요하다');
  assert.match(rule[1], /color:\s*var\(--color-surface\)/);
  assert.doesNotMatch(rule[0], /profile-hero__nickname|profile-setting-link/);
  assert.doesNotMatch(
    contrastSource,
    /BG-\d+|nightwork|changsin|refrigerator|CPA\.png/,
  );
});

test('프로필 대비 로직과 스타일은 루트 웹과 www 앱 번들이 일치한다', async () => {
  const mirroredFiles = [
    'assets/js/modules/profile-background-contrast.js',
    'assets/js/modules/profile.js',
    'assets/css/main/profile-main.css',
  ];

  for (const filePath of mirroredFiles) {
    const [webSource, appSource] = await Promise.all([
      readFile(filePath),
      readFile(`www/${filePath}`),
    ]);
    assert.deepEqual(appSource, webSource, `${filePath} must stay mirrored`);
  }
});
