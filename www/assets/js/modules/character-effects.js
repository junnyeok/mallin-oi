const EFFECT_WRAP_SELECTOR = '.character-effect-wrap';
const EFFECT_LAYER_SELECTOR = '.character-effect-layer';
const CHARACTER_SELECTOR = '.character-effect-character';
const SPRITE_SELECTOR = '[data-character-effect-sprite]';
const wrapperStates = new WeakMap();
const animatedSpriteLayers = new Set();
let spriteAnimationFrameId = 0;

function getSpriteMeta(sprite = {}) {
  const columnCount = Math.max(1, Math.trunc(Number(sprite.columnCount) || 1));
  const rowCount = Math.max(1, Math.trunc(Number(sprite.rowCount) || 1));
  const maximumFrameCount = columnCount * rowCount;
  const frameCount = Math.min(
    maximumFrameCount,
    Math.max(1, Math.trunc(Number(sprite.frameCount) || maximumFrameCount)),
  );
  const frameWidth = Math.max(1, Math.trunc(Number(sprite.frameWidth) || 1));
  const frameHeight = Math.max(1, Math.trunc(Number(sprite.frameHeight) || 1));
  const frameBottomOffsets = Array.from({ length: frameCount }, (_, index) =>
    Math.min(
      frameHeight,
      Math.max(0, Number(sprite.frameBottomOffsets?.[index]) || 0),
    ),
  );

  return {
    columnCount,
    rowCount,
    frameWidth,
    frameHeight,
    frameCount,
    frameDurationMs: Math.max(
      16,
      Math.trunc(Number(sprite.frameDurationMs) || 100),
    ),
    loop: sprite.loop !== false,
    frameBottomOffsets,
  };
}

export function getCharacterEffectSpriteFrame(sprite = {}, frameIndex = 0) {
  const meta = getSpriteMeta(sprite);
  const requestedIndex = Math.max(0, Math.trunc(Number(frameIndex) || 0));
  const index = meta.loop
    ? requestedIndex % meta.frameCount
    : Math.min(requestedIndex, meta.frameCount - 1);

  return {
    index,
    column: index % meta.columnCount,
    row: Math.floor(index / meta.columnCount),
  };
}

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  );
}

function stopSpriteAnimationLoop() {
  if (!spriteAnimationFrameId || typeof window === 'undefined') return;
  window.cancelAnimationFrame(spriteAnimationFrameId);
  spriteAnimationFrameId = 0;
}

function applySpriteFrame(spriteLayer, sprite, frame) {
  const frameBottomOffset = sprite.frameBottomOffsets[frame.index] || 0;
  const frameBottomOffsetPercent =
    (frameBottomOffset / sprite.frameHeight) * 100;

  spriteLayer.style.setProperty('--character-effect-sprite-column', frame.column);
  spriteLayer.style.setProperty('--character-effect-sprite-row', frame.row);
  spriteLayer.style.setProperty(
    '--character-effect-sprite-frame-bottom-offset',
    `${frameBottomOffsetPercent}%`,
  );
}

function renderSpriteAnimationFrame(timestamp) {
  spriteAnimationFrameId = 0;

  animatedSpriteLayers.forEach((spriteLayer) => {
    if (!spriteLayer.isConnected) {
      animatedSpriteLayers.delete(spriteLayer);
      return;
    }

    const sprite = getSpriteMeta({
      columnCount: spriteLayer.dataset.spriteColumns,
      rowCount: spriteLayer.dataset.spriteRows,
      frameWidth: spriteLayer.dataset.spriteFrameWidth,
      frameHeight: spriteLayer.dataset.spriteFrameHeight,
      frameCount: spriteLayer.dataset.spriteFrameCount,
      frameDurationMs: spriteLayer.dataset.spriteFrameDuration,
      loop: spriteLayer.dataset.spriteLoop !== 'false',
      frameBottomOffsets: String(
        spriteLayer.dataset.spriteFrameBottomOffsets || '',
      ).split(','),
    });
    const startedAt = Number(spriteLayer.dataset.spriteStartedAt) || timestamp;
    const elapsedFrame = Math.floor(
      Math.max(0, timestamp - startedAt) / sprite.frameDurationMs,
    );
    const frame = getCharacterEffectSpriteFrame(sprite, elapsedFrame);

    applySpriteFrame(spriteLayer, sprite, frame);
  });

  startSpriteAnimationLoop();
}

function startSpriteAnimationLoop() {
  if (spriteAnimationFrameId || typeof window === 'undefined') return;
  if (!animatedSpriteLayers.size || document.visibilityState === 'hidden') return;
  if (prefersReducedMotion()) return;

  spriteAnimationFrameId = window.requestAnimationFrame(renderSpriteAnimationFrame);
}

function registerSpriteLayers(root) {
  const layers = [];
  if (root?.matches?.(SPRITE_SELECTOR)) layers.push(root);
  root?.querySelectorAll?.(SPRITE_SELECTOR).forEach((layer) => layers.push(layer));

  layers.forEach((layer) => {
    if (animatedSpriteLayers.has(layer)) return;
    const sprite = getSpriteMeta({
      columnCount: layer.dataset.spriteColumns,
      rowCount: layer.dataset.spriteRows,
      frameWidth: layer.dataset.spriteFrameWidth,
      frameHeight: layer.dataset.spriteFrameHeight,
      frameCount: layer.dataset.spriteFrameCount,
      frameDurationMs: layer.dataset.spriteFrameDuration,
      loop: layer.dataset.spriteLoop !== 'false',
      frameBottomOffsets: String(
        layer.dataset.spriteFrameBottomOffsets || '',
      ).split(','),
    });
    applySpriteFrame(layer, sprite, getCharacterEffectSpriteFrame(sprite, 0));
    layer.dataset.spriteStartedAt = String(
      typeof performance === 'undefined' ? 0 : performance.now(),
    );
    animatedSpriteLayers.add(layer);
  });

  startSpriteAnimationLoop();
}

function unregisterSpriteLayers(root) {
  if (!root) return;

  if (root.matches?.(SPRITE_SELECTOR)) animatedSpriteLayers.delete(root);
  root.querySelectorAll?.(SPRITE_SELECTOR).forEach((layer) => {
    animatedSpriteLayers.delete(layer);
  });

  if (!animatedSpriteLayers.size) stopSpriteAnimationLoop();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderCharacterEffectStyle(cssVars = {}) {
  if (!cssVars || typeof cssVars !== 'object') return '';

  const styleText = Object.entries(cssVars)
    .filter(([name]) => /^--character-effect-[a-z0-9-]+$/.test(name))
    .map(([name, value]) => `${name}: ${escapeHtml(value)}`)
    .join('; ');

  return styleText ? ` style="${styleText}"` : '';
}

function getDirectEffectLayers(wrap) {
  if (!wrap) return [];

  return Array.from(wrap.children).filter((node) =>
    node.matches?.(EFFECT_LAYER_SELECTOR),
  );
}

function removeDuplicateEffectLayers(wrap) {
  const seenEffectIds = new Set();

  getDirectEffectLayers(wrap).forEach((layer) => {
    const effectId = String(layer.dataset.characterEffectId || '').trim();
    const duplicateKey = effectId || '__unidentified-effect__';

    if (seenEffectIds.has(duplicateKey)) {
      unregisterSpriteLayers(layer);
      layer.remove();
      return;
    }

    seenEffectIds.add(duplicateKey);
  });
}

function getWrapperState(wrap) {
  let state = wrapperStates.get(wrap);

  if (!state) {
    state = {
      image: null,
      observer: null,
      requestId: 0,
    };
    wrapperStates.set(wrap, state);
  }

  return state;
}

function setEffectReady(wrap, isReady) {
  if (!getDirectEffectLayers(wrap).length) {
    delete wrap.dataset.characterEffectReady;
    return;
  }

  wrap.dataset.characterEffectReady = isReady ? 'true' : 'false';
}

async function waitForCharacterDecode(image) {
  if (!image) return false;

  if (!image.complete) {
    await new Promise((resolve) => {
      image.addEventListener('load', resolve, { once: true });
      image.addEventListener('error', resolve, { once: true });
    });
  }

  if (!image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
    return false;
  }

  if (typeof image.decode === 'function') {
    try {
      await image.decode();
    } catch (error) {
      if (
        !image.complete ||
        image.naturalWidth <= 0 ||
        image.naturalHeight <= 0
      ) {
        return false;
      }
    }
  }

  return true;
}

function scheduleEffectReady(wrap) {
  const state = getWrapperState(wrap);
  const image = wrap.querySelector(CHARACTER_SELECTOR);
  const requestId = state.requestId + 1;

  state.requestId = requestId;
  setEffectReady(wrap, false);

  if (!image || !getDirectEffectLayers(wrap).length) return;

  waitForCharacterDecode(image).then((isDecoded) => {
    if (!isDecoded) return;
    if (state.requestId !== requestId) return;
    if (state.image !== image) return;
    if (!wrap.isConnected || !getDirectEffectLayers(wrap).length) return;

    window.requestAnimationFrame(() => {
      if (state.requestId !== requestId) return;

      window.requestAnimationFrame(() => {
        if (state.requestId !== requestId) return;
        setEffectReady(wrap, true);
      });
    });
  });
}

export function renderCharacterEffectHtml(effect = null) {
  if (!effect?.imagePath) return '';

  const effectClassName = effect.className
    ? ` ${escapeHtml(effect.className)}`
    : '';
  const context = String(effect.context || 'default').trim() || 'default';
  const animation = String(effect.animation || 'none').trim() || 'none';
  const sprite = effect.sprite ? getSpriteMeta(effect.sprite) : null;
  const initialSpriteBottomOffset = sprite
    ? (sprite.frameBottomOffsets[0] / sprite.frameHeight) * 100
    : 0;
  const effectMedia = sprite
    ? `
        <span
          class="character-effect-sprite${effectClassName}"
          data-character-effect-sprite
          data-sprite-columns="${sprite.columnCount}"
          data-sprite-rows="${sprite.rowCount}"
          data-sprite-frame-width="${sprite.frameWidth}"
          data-sprite-frame-height="${sprite.frameHeight}"
          data-sprite-frame-count="${sprite.frameCount}"
          data-sprite-frame-duration="${sprite.frameDurationMs}"
          data-sprite-loop="${sprite.loop ? 'true' : 'false'}"
          data-sprite-frame-bottom-offsets="${sprite.frameBottomOffsets.join(',')}"
          style="--character-effect-sprite-columns: ${sprite.columnCount}; --character-effect-sprite-rows: ${sprite.rowCount}; --character-effect-sprite-column: 0; --character-effect-sprite-row: 0; --character-effect-sprite-aspect-ratio: ${sprite.frameWidth} / ${sprite.frameHeight}; --character-effect-sprite-frame-bottom-offset: ${initialSpriteBottomOffset}%;"
        >
          <img
            class="character-effect-sprite__sheet"
            src="${escapeHtml(effect.imagePath)}"
            alt=""
          />
        </span>
      `
    : `
        <img
          class="character-effect-img${effectClassName}"
          src="${escapeHtml(effect.imagePath)}"
          alt=""
        />
      `;

  return `
    <span
      class="character-effect-layer"
      data-character-effect-id="${escapeHtml(effect.itemId)}"
      data-character-effect-placement="${escapeHtml(effect.placement)}"
      data-character-effect-context="${escapeHtml(context)}"
      aria-hidden="true"${renderCharacterEffectStyle(effect.cssVars)}
    >
      <span
        class="character-effect-motion"
        data-character-effect-animation="${escapeHtml(animation)}"
      >
        ${effectMedia}
      </span>
    </span>
  `;
}

export function prepareCharacterEffectWrap(wrap) {
  if (!wrap?.matches?.(EFFECT_WRAP_SELECTOR)) return;

  removeDuplicateEffectLayers(wrap);
  registerSpriteLayers(wrap);

  if (!getDirectEffectLayers(wrap).length) {
    const existingState = wrapperStates.get(wrap);
    existingState?.observer?.disconnect();
    if (existingState) existingState.requestId += 1;
    wrapperStates.delete(wrap);
    delete wrap.dataset.characterEffectReady;
    return;
  }

  const state = getWrapperState(wrap);
  const image = wrap.querySelector(CHARACTER_SELECTOR);

  if (state.image !== image) {
    state.observer?.disconnect();
    state.image = image;
    state.observer = null;

    if (image) {
      state.observer = new MutationObserver(() => {
        scheduleEffectReady(wrap);
      });
      state.observer.observe(image, {
        attributes: true,
        attributeFilter: ['src', 'srcset', 'sizes'],
      });
    }
  }

  scheduleEffectReady(wrap);
}

export function prepareCharacterEffects(root = document) {
  const wraps = [];

  if (root?.matches?.(EFFECT_WRAP_SELECTOR)) {
    wraps.push(root);
  }

  root?.querySelectorAll?.(EFFECT_WRAP_SELECTOR).forEach((wrap) => {
    wraps.push(wrap);
  });

  wraps.forEach(prepareCharacterEffectWrap);
}

export function cleanupCharacterEffects(root = document) {
  const wraps = [];

  unregisterSpriteLayers(root);

  if (root?.matches?.(EFFECT_WRAP_SELECTOR)) wraps.push(root);
  root?.querySelectorAll?.(EFFECT_WRAP_SELECTOR).forEach((wrap) => wraps.push(wrap));

  wraps.forEach((wrap) => {
    const state = wrapperStates.get(wrap);
    state?.observer?.disconnect();
    if (state) state.requestId += 1;
    wrapperStates.delete(wrap);
    unregisterSpriteLayers(wrap);
  });
}

export function replaceCharacterEffect(wrap, effect = null) {
  if (!wrap?.matches?.(EFFECT_WRAP_SELECTOR)) return;

  getDirectEffectLayers(wrap).forEach((layer) => {
    unregisterSpriteLayers(layer);
    layer.remove();
  });

  const character = wrap.querySelector(CHARACTER_SELECTOR);
  const effectHtml = renderCharacterEffectHtml(effect);

  if (character && effectHtml) {
    character.insertAdjacentHTML('afterend', effectHtml);
  }

  prepareCharacterEffectWrap(wrap);
}

if (typeof document !== 'undefined') {
  const removedEffectObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.removedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          cleanupCharacterEffects(node);
        }
      });
    });
  });

  removedEffectObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopSpriteAnimationLoop();
      return;
    }

    startSpriteAnimationLoop();
  });

  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.(
    'change',
    (event) => {
      if (event.matches) {
        stopSpriteAnimationLoop();
        animatedSpriteLayers.forEach((layer) => {
          layer.style.setProperty('--character-effect-sprite-column', '0');
          layer.style.setProperty('--character-effect-sprite-row', '0');
        });
        return;
      }

      startSpriteAnimationLoop();
    },
  );

  document.addEventListener('mallin:before-pjax-swap', () => {
    cleanupCharacterEffects(document);
  });
}
