export const PROFILE_BIO_LIGHT_CLASS = 'is-on-dark-profile-background';
export const PROFILE_BIO_MIN_CONTRAST = 4.5;

const SAMPLE_COLUMNS = 4;
const SAMPLE_ROWS = 3;
const SAMPLE_TILE_SIZE = 3;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundGeometry(value) {
  return Math.round(Number(value || 0));
}

function parseRgbComponent(value = '') {
  const normalized = String(value).trim();
  if (normalized.endsWith('%')) {
    return clamp((Number.parseFloat(normalized) / 100) * 255, 0, 255);
  }
  return clamp(Number.parseFloat(normalized), 0, 255);
}

function parseAlphaComponent(value = '1') {
  const normalized = String(value).trim();
  if (normalized.endsWith('%')) {
    return clamp(Number.parseFloat(normalized) / 100, 0, 1);
  }
  return clamp(Number.parseFloat(normalized), 0, 1);
}

export function parseCssColor(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();
  if (!normalized) return null;
  if (normalized === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const hexMatch = normalized.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch) {
    const hex = hexMatch[1];
    const expanded =
      hex.length === 3 || hex.length === 4
        ? hex
            .split('')
            .map((character) => `${character}${character}`)
            .join('')
        : hex;

    if (expanded.length === 6 || expanded.length === 8) {
      return {
        r: Number.parseInt(expanded.slice(0, 2), 16),
        g: Number.parseInt(expanded.slice(2, 4), 16),
        b: Number.parseInt(expanded.slice(4, 6), 16),
        a:
          expanded.length === 8
            ? Number.parseInt(expanded.slice(6, 8), 16) / 255
            : 1,
      };
    }
  }

  const rgbMatch = normalized.match(/^rgba?\((.*)\)$/i);
  if (!rgbMatch) return null;

  const parts = rgbMatch[1]
    .trim()
    .split(/\s*[,/]\s*|\s+/)
    .filter(Boolean);
  if (parts.length < 3) return null;

  const color = {
    r: parseRgbComponent(parts[0]),
    g: parseRgbComponent(parts[1]),
    b: parseRgbComponent(parts[2]),
    a: parts[3] === undefined ? 1 : parseAlphaComponent(parts[3]),
  };

  return Object.values(color).every(Number.isFinite) ? color : null;
}

export function compositeColors(background, overlay) {
  const backgroundColor = background || { r: 0, g: 0, b: 0, a: 1 };
  const overlayColor = overlay || { r: 0, g: 0, b: 0, a: 0 };
  const overlayAlpha = clamp(Number(overlayColor.a ?? 1), 0, 1);

  return {
    r:
      Number(backgroundColor.r || 0) * (1 - overlayAlpha) +
      Number(overlayColor.r || 0) * overlayAlpha,
    g:
      Number(backgroundColor.g || 0) * (1 - overlayAlpha) +
      Number(overlayColor.g || 0) * overlayAlpha,
    b:
      Number(backgroundColor.b || 0) * (1 - overlayAlpha) +
      Number(overlayColor.b || 0) * overlayAlpha,
    a: 1,
  };
}

function toLinearSrgb(value) {
  const channel = clamp(Number(value || 0) / 255, 0, 1);
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

export function getRelativeLuminance(color) {
  return (
    0.2126 * toLinearSrgb(color?.r) +
    0.7152 * toLinearSrgb(color?.g) +
    0.0722 * toLinearSrgb(color?.b)
  );
}

export function getContrastRatio(firstLuminance, secondLuminance) {
  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = Math.floor((sorted.length - 1) * ratio);
  return sorted[index];
}

export function chooseProfileBioTone(
  backgroundSamples,
  {
    defaultTextColor = '#666666',
    lightTextColor = '#ffffff',
    minContrast = PROFILE_BIO_MIN_CONTRAST,
  } = {},
) {
  const defaultColor = parseCssColor(defaultTextColor);
  const lightColor = parseCssColor(lightTextColor);
  const samples = (backgroundSamples || [])
    .map((sample) =>
      typeof sample === 'string' ? parseCssColor(sample) : sample,
    )
    .filter(Boolean);

  if (!defaultColor || !lightColor || !samples.length) {
    return {
      tone: 'default',
      backgroundLuminance: null,
      defaultContrast: null,
      lightContrast: null,
      sampleCount: 0,
      reason: 'invalid-samples',
    };
  }

  const sampleLuminances = samples.map(getRelativeLuminance);
  const defaultLuminance = getRelativeLuminance(defaultColor);
  const lightLuminance = getRelativeLuminance(lightColor);
  const defaultContrasts = sampleLuminances.map((luminance) =>
    getContrastRatio(defaultLuminance, luminance),
  );
  const lightContrasts = sampleLuminances.map((luminance) =>
    getContrastRatio(lightLuminance, luminance),
  );
  const defaultContrast = percentile(defaultContrasts, 0.25);
  const lightContrast = percentile(lightContrasts, 0.25);
  const defaultPasses = defaultContrast >= minContrast;
  const lightPasses = lightContrast >= minContrast;

  let tone = 'default';
  if (lightPasses && !defaultPasses) {
    tone = 'light';
  } else if (!defaultPasses && lightContrast > defaultContrast) {
    tone = 'light';
  }

  return {
    tone,
    backgroundLuminance: percentile(sampleLuminances, 0.5),
    defaultContrast,
    lightContrast,
    sampleCount: samples.length,
    reason: 'contrast-comparison',
  };
}

function normalizeBackgroundPosition(position = '50% 50%') {
  const tokens = String(position || '')
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  if (!tokens.length) return ['50%', '50%'];
  if (tokens.length === 1) {
    if (tokens[0] === 'top' || tokens[0] === 'bottom') {
      return ['50%', tokens[0]];
    }
    return [tokens[0], '50%'];
  }
  return [tokens[0], tokens[1]];
}

function getPositionOffset(token, containerSize, renderedSize) {
  const remainingSpace = containerSize - renderedSize;
  if (token === 'left' || token === 'top') return 0;
  if (token === 'right' || token === 'bottom') return remainingSpace;
  if (token === 'center') return remainingSpace / 2;
  if (token.endsWith('%')) {
    return remainingSpace * (Number.parseFloat(token) / 100);
  }
  if (token.endsWith('px')) return Number.parseFloat(token);
  return remainingSpace / 2;
}

export function calculateCoverPlacement({
  containerWidth,
  containerHeight,
  imageWidth,
  imageHeight,
  backgroundPosition = '50% 50%',
}) {
  const safeContainerWidth = Math.max(Number(containerWidth || 0), 1);
  const safeContainerHeight = Math.max(Number(containerHeight || 0), 1);
  const safeImageWidth = Math.max(Number(imageWidth || 0), 1);
  const safeImageHeight = Math.max(Number(imageHeight || 0), 1);
  const scale = Math.max(
    safeContainerWidth / safeImageWidth,
    safeContainerHeight / safeImageHeight,
  );
  const renderedWidth = safeImageWidth * scale;
  const renderedHeight = safeImageHeight * scale;
  const [positionX, positionY] =
    normalizeBackgroundPosition(backgroundPosition);

  return {
    scale,
    renderedWidth,
    renderedHeight,
    offsetX: getPositionOffset(positionX, safeContainerWidth, renderedWidth),
    offsetY: getPositionOffset(positionY, safeContainerHeight, renderedHeight),
  };
}

function getSafeTargetRect(cardRect, targetRect) {
  const cardWidth = Math.max(Number(cardRect?.width || 0), 1);
  const cardHeight = Math.max(Number(cardRect?.height || 0), 1);
  const targetWidth = Number(targetRect?.width || 0);
  const targetHeight = Number(targetRect?.height || 0);

  if (targetWidth > 0 && targetHeight > 0) {
    return {
      x: clamp(Number(targetRect?.x || 0), 0, cardWidth),
      y: clamp(Number(targetRect?.y || 0), 0, cardHeight),
      width: clamp(targetWidth, 1, cardWidth),
      height: clamp(targetHeight, 1, cardHeight),
    };
  }

  const fallbackWidth = Math.max(Math.min(cardWidth * 0.64, cardWidth - 16), 1);
  const fallbackHeight = Math.max(Math.min(cardHeight * 0.06, 36), 1);

  return {
    x: (cardWidth - fallbackWidth) / 2,
    y: clamp(cardHeight * 0.28, 0, cardHeight - fallbackHeight),
    width: fallbackWidth,
    height: fallbackHeight,
  };
}

function createBrowserCanvas(width, height) {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function resolveImageUrl(imageUrl) {
  try {
    return new URL(
      imageUrl,
      typeof document === 'undefined' ? undefined : document.baseURI,
    ).href;
  } catch {
    return String(imageUrl || '').trim();
  }
}

function loadBrowserImage(imageUrl) {
  return new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image is unavailable'));
      return;
    }

    const resolvedUrl = resolveImageUrl(imageUrl);
    const image = new Image();

    try {
      const parsedUrl = new URL(resolvedUrl);
      const pageOrigin = globalThis.location?.origin || '';
      if (
        (parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:') &&
        pageOrigin &&
        parsedUrl.origin !== pageOrigin
      ) {
        image.crossOrigin = 'anonymous';
      }
    } catch {
      // 상대 경로와 data/blob URL은 현재 출처의 기본 로드 방식을 사용한다.
    }

    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Profile background image failed'));
    image.src = resolvedUrl;
  });
}

function averageTile(imageData, canvasWidth, startX, startY) {
  let red = 0;
  let green = 0;
  let blue = 0;
  let alpha = 0;
  let count = 0;

  for (let y = 0; y < SAMPLE_TILE_SIZE; y += 1) {
    for (let x = 0; x < SAMPLE_TILE_SIZE; x += 1) {
      const index = ((startY + y) * canvasWidth + startX + x) * 4;
      const pixelAlpha = imageData[index + 3] / 255;
      if (pixelAlpha <= 0) continue;
      red += imageData[index];
      green += imageData[index + 1];
      blue += imageData[index + 2];
      alpha += pixelAlpha;
      count += 1;
    }
  }

  if (!count) return null;
  return {
    r: red / count,
    g: green / count,
    b: blue / count,
    a: alpha / count,
  };
}

async function sampleRenderedBackground(
  options,
  { getImage, createCanvas = createBrowserCanvas },
) {
  const image = await getImage(options.imageUrl);
  const imageWidth = Number(image.naturalWidth || image.width || 0);
  const imageHeight = Number(image.naturalHeight || image.height || 0);
  if (!imageWidth || !imageHeight) {
    throw new Error('Profile background image has no dimensions');
  }

  const cardRect = {
    width: Math.max(Number(options.cardRect?.width || 0), 1),
    height: Math.max(Number(options.cardRect?.height || 0), 1),
  };
  const targetRect = getSafeTargetRect(cardRect, options.targetRect);
  const placement = calculateCoverPlacement({
    containerWidth: cardRect.width,
    containerHeight: cardRect.height,
    imageWidth,
    imageHeight,
    backgroundPosition: options.backgroundPosition,
  });
  const canvasWidth = SAMPLE_COLUMNS * SAMPLE_TILE_SIZE;
  const canvasHeight = SAMPLE_ROWS * SAMPLE_TILE_SIZE;
  const canvas = createCanvas(canvasWidth, canvasHeight);
  const context = canvas?.getContext?.('2d', { willReadFrequently: true });
  if (!canvas || !context) throw new Error('Canvas is unavailable');

  const sourceCellWidth = Math.max(
    (targetRect.width / SAMPLE_COLUMNS / placement.scale) * 0.5,
    2,
  );
  const sourceCellHeight = Math.max(
    (targetRect.height / SAMPLE_ROWS / placement.scale) * 0.5,
    2,
  );

  for (let row = 0; row < SAMPLE_ROWS; row += 1) {
    for (let column = 0; column < SAMPLE_COLUMNS; column += 1) {
      const displayX =
        targetRect.x + ((column + 0.5) / SAMPLE_COLUMNS) * targetRect.width;
      const displayY =
        targetRect.y + ((row + 0.5) / SAMPLE_ROWS) * targetRect.height;
      const sourceCenterX = (displayX - placement.offsetX) / placement.scale;
      const sourceCenterY = (displayY - placement.offsetY) / placement.scale;
      const sourceX = clamp(
        sourceCenterX - sourceCellWidth / 2,
        0,
        Math.max(imageWidth - sourceCellWidth, 0),
      );
      const sourceY = clamp(
        sourceCenterY - sourceCellHeight / 2,
        0,
        Math.max(imageHeight - sourceCellHeight, 0),
      );

      context.drawImage(
        image,
        sourceX,
        sourceY,
        Math.min(sourceCellWidth, imageWidth),
        Math.min(sourceCellHeight, imageHeight),
        column * SAMPLE_TILE_SIZE,
        row * SAMPLE_TILE_SIZE,
        SAMPLE_TILE_SIZE,
        SAMPLE_TILE_SIZE,
      );
    }
  }

  const pixels = context.getImageData(0, 0, canvasWidth, canvasHeight).data;
  const overlayColor =
    parseCssColor(options.overlayColor) || parseCssColor('transparent');
  const cardBackgroundColor =
    parseCssColor(options.cardBackgroundColor) || parseCssColor('#ffffff');
  const samples = [];

  for (let row = 0; row < SAMPLE_ROWS; row += 1) {
    for (let column = 0; column < SAMPLE_COLUMNS; column += 1) {
      const sample = averageTile(
        pixels,
        canvasWidth,
        column * SAMPLE_TILE_SIZE,
        row * SAMPLE_TILE_SIZE,
      );
      if (sample) {
        const opaqueBackground = compositeColors(cardBackgroundColor, sample);
        samples.push(compositeColors(opaqueBackground, overlayColor));
      }
    }
  }

  return samples;
}

function createAnalysisCacheKey(options) {
  return JSON.stringify({
    imageUrl: resolveImageUrl(options.imageUrl),
    card: [
      roundGeometry(options.cardRect?.width),
      roundGeometry(options.cardRect?.height),
    ],
    target: [
      roundGeometry(options.targetRect?.x),
      roundGeometry(options.targetRect?.y),
      roundGeometry(options.targetRect?.width),
      roundGeometry(options.targetRect?.height),
    ],
    position: String(options.backgroundPosition || '50% 50%'),
    overlay: String(options.overlayColor || 'transparent'),
    cardBackground: String(options.cardBackgroundColor || ''),
    defaultText: String(options.defaultTextColor || ''),
    lightText: String(options.lightTextColor || ''),
    minContrast: Number(options.minContrast || PROFILE_BIO_MIN_CONTRAST),
  });
}

export function createProfileBackgroundContrastAnalyzer({
  loadImage = loadBrowserImage,
  createCanvas = createBrowserCanvas,
  sampleImage = null,
} = {}) {
  const imageCache = new Map();
  const resultCache = new Map();

  const getImage = (imageUrl) => {
    const resolvedUrl = resolveImageUrl(imageUrl);
    if (!imageCache.has(resolvedUrl)) {
      imageCache.set(
        resolvedUrl,
        Promise.resolve().then(() => loadImage(resolvedUrl)),
      );
    }
    return imageCache.get(resolvedUrl);
  };

  const analyze = (options = {}) => {
    if (!String(options.imageUrl || '').trim()) {
      return Promise.resolve({
        tone: 'default',
        backgroundLuminance: null,
        defaultContrast: null,
        lightContrast: null,
        sampleCount: 0,
        reason: 'no-background',
      });
    }

    const cacheKey = createAnalysisCacheKey(options);
    if (!resultCache.has(cacheKey)) {
      const resultPromise = Promise.resolve()
        .then(() =>
          sampleImage
            ? sampleImage(options)
            : sampleRenderedBackground(options, { getImage, createCanvas }),
        )
        .then((samples) =>
          chooseProfileBioTone(samples, {
            defaultTextColor: options.defaultTextColor,
            lightTextColor: options.lightTextColor,
            minContrast: options.minContrast,
          }),
        )
        .catch(() => ({
          tone: 'default',
          backgroundLuminance: null,
          defaultContrast: null,
          lightContrast: null,
          sampleCount: 0,
          reason: 'analysis-failed',
        }));

      resultCache.set(cacheKey, resultPromise);
    }

    return resultCache.get(cacheKey);
  };

  return {
    analyze,
    getCacheSize() {
      return { images: imageCache.size, results: resultCache.size };
    },
  };
}

export function createLatestProfileBioToneUpdater({ analyze, applyTone }) {
  let revision = 0;

  const reset = (reason = 'no-background') => {
    revision += 1;
    const result = { tone: 'default', reason };
    applyTone('default', result);
    return Promise.resolve(result);
  };

  const update = async (options = null) => {
    if (!options?.imageUrl) return reset('no-background');

    const requestRevision = ++revision;
    const forcedTone =
      options.toneOverride === 'light' || options.toneOverride === 'default'
        ? options.toneOverride
        : '';

    if (forcedTone) {
      const result = { tone: forcedTone, reason: 'metadata-override' };
      applyTone(forcedTone, result);
      return result;
    }

    let result;
    try {
      result = await analyze(options);
    } catch {
      result = { tone: 'default', reason: 'analysis-failed' };
    }

    if (requestRevision !== revision) {
      return { ...result, stale: true };
    }

    const tone = result?.tone === 'light' ? 'light' : 'default';
    applyTone(tone, result);
    return result;
  };

  return { update, reset };
}
