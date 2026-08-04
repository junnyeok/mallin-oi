const EFFECT_WRAP_SELECTOR = '.character-effect-wrap';
const EFFECT_LAYER_SELECTOR = '.character-effect-layer';
const CHARACTER_SELECTOR = '.character-effect-character';
const SPRITE_SELECTOR = '[data-character-effect-sprite]';
const wrapperStates = new WeakMap();
const animatedSpriteLayers = new Set();
let spriteAnimationFrameId = 0;
let spiderWebSvgSequence = 0;

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
  const reducedMotionFrame = Math.min(
    frameCount - 1,
    Math.max(0, Math.trunc(Number(sprite.reducedMotionFrame) || 0)),
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
    reducedMotionFrame,
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
      reducedMotionFrame: spriteLayer.dataset.spriteReducedMotionFrame,
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
      reducedMotionFrame: layer.dataset.spriteReducedMotionFrame,
      frameBottomOffsets: String(
        layer.dataset.spriteFrameBottomOffsets || '',
      ).split(','),
    });
    const initialFrame = prefersReducedMotion()
      ? sprite.reducedMotionFrame
      : 0;
    applySpriteFrame(
      layer,
      sprite,
      getCharacterEffectSpriteFrame(sprite, initialFrame),
    );
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

function renderSpiderWebSvg(effect, effectClassName = '') {
  const prefix = `characterEffectSpiderWeb${++spiderWebSvgSequence}`;
  const silkId = `${prefix}Silk`;
  const pearlId = `${prefix}Pearl`;
  const glowId = `${prefix}Glow`;
  const softGlowId = `${prefix}SoftGlow`;

  return `
    <span
      class="character-effect-vector${effectClassName}"
      data-character-effect-vector="spider-web"
      data-character-effect-duration="4800"
    >
      <svg
        class="character-effect-spider-web"
        viewBox="0 0 600 600"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <linearGradient id="${silkId}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="var(--spider-web-accent)" stop-opacity=".7" />
            <stop offset=".48" stop-color="var(--spider-web-primary)" />
            <stop offset="1" stop-color="#f1fff8" stop-opacity=".96" />
          </linearGradient>
          <radialGradient id="${pearlId}">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset=".5" stop-color="var(--spider-web-primary)" stop-opacity=".92" />
            <stop offset="1" stop-color="var(--spider-web-accent)" stop-opacity="0" />
          </radialGradient>
          <filter id="${glowId}" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="1" stdDeviation=".75" flood-color="#123d30" flood-opacity=".78" result="shadow" />
            <feGaussianBlur in="SourceGraphic" stdDeviation="2.4" result="blur" />
            <feMerge>
              <feMergeNode in="shadow" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="${softGlowId}" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" />
          </filter>
        </defs>

        <g class="web-afterglow" fill="none" stroke="var(--spider-web-accent)" opacity=".12">
          <ellipse cx="300" cy="326" rx="225" ry="218" stroke-width="8" filter="url(#${softGlowId})" />
          <circle cx="132" cy="155" r="4" fill="url(#${pearlId})" stroke="none" />
          <circle cx="470" cy="445" r="4" fill="url(#${pearlId})" stroke="none" />
        </g>

        <g class="web-halo">
          <ellipse cx="300" cy="326" rx="228" ry="221" fill="none" stroke="var(--spider-web-accent)" stroke-width="17" opacity=".13" filter="url(#${softGlowId})" />
        </g>

        <g class="web-bloom" fill="none" stroke="url(#${silkId})" stroke-linecap="round" stroke-linejoin="round">
          <g class="web-spokes" stroke-width="3" filter="url(#${glowId})">
            <path pathLength="1" d="M300 306 C245 225 181 147 91 73" />
            <path pathLength="1" d="M300 306 C280 206 269 116 275 34" />
            <path pathLength="1" d="M300 306 C345 207 399 120 470 53" />
            <path pathLength="1" d="M300 306 C401 253 480 211 557 181" />
            <path pathLength="1" d="M300 306 C405 330 493 371 559 432" />
            <path pathLength="1" d="M300 306 C362 409 408 493 437 567" />
            <path pathLength="1" d="M300 306 C284 414 270 507 273 580" />
            <path pathLength="1" d="M300 306 C216 408 159 485 124 550" />
            <path pathLength="1" d="M300 306 C197 339 117 377 48 435" />
            <path pathLength="1" d="M300 306 C202 263 120 230 41 208" />
          </g>

          <g class="web-rings web-rings-a" stroke-width="2.25" filter="url(#${glowId})">
            <path pathLength="1" d="M270 262 C290 248 322 249 341 270 C352 290 350 321 332 342 C307 354 278 350 260 331 C250 307 252 280 270 262 Z" />
            <path pathLength="1" d="M233 216 C279 186 344 191 383 234 C412 276 408 339 373 382 C327 413 260 402 220 364 C190 317 196 255 233 216 Z" />
          </g>

          <g class="web-rings web-rings-b" stroke-width="2" filter="url(#${glowId})">
            <path pathLength="1" d="M190 166 C260 112 361 119 429 183 C478 247 472 354 415 425 C343 480 241 467 171 411 C117 343 125 235 190 166 Z" />
            <path pathLength="1" d="M136 119 C231 42 379 49 480 134 C556 222 548 383 464 484 C366 563 216 549 119 471 C38 374 44 216 136 119 Z" />
          </g>

          <g class="web-knots" fill="var(--spider-web-primary)" stroke="none" filter="url(#${glowId})">
            <circle cx="190" cy="166" r="4" />
            <circle cx="429" cy="183" r="3.5" />
            <circle cx="415" cy="425" r="4" />
            <circle cx="171" cy="411" r="3.5" />
            <circle cx="233" cy="216" r="3" />
            <circle cx="373" cy="382" r="3" />
          </g>
        </g>

        <g class="web-anchor" fill="none" stroke="url(#${silkId})" stroke-linecap="round" filter="url(#${glowId})">
          <path pathLength="1" d="M72 5 C76 89 106 135 170 180 C215 211 218 244 199 278" />
          <path pathLength="1" d="M530 0 C523 82 500 126 443 170 C406 199 392 233 403 270" />
          <path pathLength="1" d="M75 5 C150 54 205 73 274 74" stroke-width="2.2" />
          <path pathLength="1" d="M530 0 C472 51 420 72 346 76" stroke-width="2.2" />
        </g>

        <g class="web-sweep" fill="none" stroke="url(#${silkId})" stroke-linecap="round" filter="url(#${glowId})">
          <path pathLength="1" d="M67 493 C139 541 239 548 307 524 C389 496 481 503 548 551" stroke-width="4.6" />
          <path pathLength="1" d="M102 464 C174 504 248 505 306 487 C378 464 446 473 509 510" stroke-width="2.3" />
          <path pathLength="1" d="M163 446 C206 471 260 471 304 453 C353 434 405 440 447 466" stroke-width="1.9" />
        </g>

        <g class="web-drops" fill="url(#${pearlId})" filter="url(#${glowId})">
          <circle cx="113" cy="221" r="9" style="--spider-web-drift-x:-15px; --spider-web-drift-y:-44px; --spider-web-drop-delay:.08s" />
          <circle cx="479" cy="204" r="7" style="--spider-web-drift-x:12px; --spider-web-drift-y:-55px; --spider-web-drop-delay:.26s" />
          <circle cx="82" cy="381" r="6" style="--spider-web-drift-x:-22px; --spider-web-drift-y:-38px; --spider-web-drop-delay:.45s" />
          <circle cx="524" cy="399" r="9" style="--spider-web-drift-x:19px; --spider-web-drift-y:-47px; --spider-web-drop-delay:.18s" />
          <circle cx="178" cy="526" r="7" style="--spider-web-drift-x:-8px; --spider-web-drift-y:-50px; --spider-web-drop-delay:.62s" />
          <circle cx="421" cy="532" r="6" style="--spider-web-drift-x:10px; --spider-web-drift-y:-39px; --spider-web-drop-delay:.36s" />
        </g>

        <g class="web-spider" fill="var(--spider-web-accent)" stroke="var(--spider-web-primary)" stroke-width="3" stroke-linecap="round" filter="url(#${glowId})">
          <path class="web-spider-line" pathLength="1" d="M430 1 C430 70 425 115 425 164" fill="none" stroke-width="2" />
          <g class="web-spider-body">
            <ellipse cx="425" cy="178" rx="10" ry="13" />
            <circle cx="425" cy="164" r="7" />
            <path d="M418 169 l-15 -10 M416 176 l-17 0 M417 183 l-15 11 M432 169 l15 -10 M434 176 l17 0 M433 183 l15 11" fill="none" />
          </g>
        </g>
      </svg>
      <img
        class="character-effect-vector__fallback"
        src="${escapeHtml(effect.imagePath)}"
        alt=""
      />
    </span>
  `;
}

export function renderCharacterEffectHtml(effect = null) {
  if (!effect?.imagePath) return '';

  const effectClassName = effect.className
    ? ` ${escapeHtml(effect.className)}`
    : '';
  const context = String(effect.context || 'default').trim() || 'default';
  const animation = String(effect.animation || 'none').trim() || 'none';
  const renderMode = String(effect.renderMode || '').trim();
  const sprite = effect.sprite ? getSpriteMeta(effect.sprite) : null;
  const initialSpriteBottomOffset = sprite
    ? (sprite.frameBottomOffsets[0] / sprite.frameHeight) * 100
    : 0;
  const effectMedia = renderMode === 'spider-web-svg'
    ? renderSpiderWebSvg(effect, effectClassName)
    : sprite
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
          data-sprite-reduced-motion-frame="${sprite.reducedMotionFrame}"
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
          const sprite = getSpriteMeta({
            columnCount: layer.dataset.spriteColumns,
            rowCount: layer.dataset.spriteRows,
            frameWidth: layer.dataset.spriteFrameWidth,
            frameHeight: layer.dataset.spriteFrameHeight,
            frameCount: layer.dataset.spriteFrameCount,
            frameDurationMs: layer.dataset.spriteFrameDuration,
            loop: layer.dataset.spriteLoop !== 'false',
            reducedMotionFrame: layer.dataset.spriteReducedMotionFrame,
            frameBottomOffsets: String(
              layer.dataset.spriteFrameBottomOffsets || '',
            ).split(','),
          });
          applySpriteFrame(
            layer,
            sprite,
            getCharacterEffectSpriteFrame(sprite, sprite.reducedMotionFrame),
          );
        });
        return;
      }

      animatedSpriteLayers.forEach((layer) => {
        layer.dataset.spriteStartedAt = String(
          typeof performance === 'undefined' ? 0 : performance.now(),
        );
      });
      startSpriteAnimationLoop();
    },
  );

  document.addEventListener('mallin:before-pjax-swap', () => {
    cleanupCharacterEffects(document);
  });
}
