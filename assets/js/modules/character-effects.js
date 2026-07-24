const EFFECT_WRAP_SELECTOR = '.character-effect-wrap';
const EFFECT_LAYER_SELECTOR = '.character-effect-layer';
const CHARACTER_SELECTOR = '.character-effect-character';
const wrapperStates = new WeakMap();

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
        <img
          class="character-effect-img${effectClassName}"
          src="${escapeHtml(effect.imagePath)}"
          alt=""
        />
      </span>
    </span>
  `;
}

export function prepareCharacterEffectWrap(wrap) {
  if (!wrap?.matches?.(EFFECT_WRAP_SELECTOR)) return;

  removeDuplicateEffectLayers(wrap);

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

export function replaceCharacterEffect(wrap, effect = null) {
  if (!wrap?.matches?.(EFFECT_WRAP_SELECTOR)) return;

  getDirectEffectLayers(wrap).forEach((layer) => layer.remove());

  const character = wrap.querySelector(CHARACTER_SELECTOR);
  const effectHtml = renderCharacterEffectHtml(effect);

  if (character && effectHtml) {
    character.insertAdjacentHTML('afterend', effectHtml);
  }

  prepareCharacterEffectWrap(wrap);
}
