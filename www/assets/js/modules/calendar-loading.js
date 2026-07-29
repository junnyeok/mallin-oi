// assets/js/modules/calendar-loading.js

export const CALENDAR_LOADING_SPRITE = Object.freeze({
  path: './images/calendar/dancing-cucumber-sprite-sheet.png',
  sheetWidth: 1280,
  sheetHeight: 1280,
  columns: 4,
  rows: 4,
  frameCount: 16,
  frameWidth: 320,
  frameHeight: 320,
  cycleDurationMs: 5000,
  frameOrder: 'row-major',
});

const controllerByRoot = new WeakMap();
let spritePreloadPromise = null;

function getSpriteUrl() {
  return new URL(
    '../../../images/calendar/dancing-cucumber-sprite-sheet.png',
    import.meta.url,
  ).href;
}

export function preloadCalendarLoadingSprite(
  ImageConstructor = globalThis.Image,
) {
  if (spritePreloadPromise) return spritePreloadPromise;
  if (typeof ImageConstructor !== 'function') {
    return Promise.resolve(false);
  }

  const image = new ImageConstructor();
  image.decoding = 'async';
  image.src = getSpriteUrl();

  spritePreloadPromise =
    typeof image.decode === 'function'
      ? image
          .decode()
          .then(() => true)
          .catch(() => false)
      : Promise.resolve(true);

  return spritePreloadPromise;
}

export function waitForCalendarPaint(windowRef = globalThis.window) {
  if (typeof windowRef?.requestAnimationFrame !== 'function') {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    windowRef.requestAnimationFrame(() => {
      windowRef.requestAnimationFrame(resolve);
    });
  });
}

function createLoadingOverlay(documentRef) {
  const overlay = documentRef.createElement('div');
  overlay.className = 'calendar-loading-overlay';
  overlay.hidden = true;
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'polite');
  overlay.setAttribute('aria-atomic', 'true');

  const content = documentRef.createElement('div');
  content.className = 'calendar-loading-overlay__content';
  content.setAttribute('aria-hidden', 'true');

  const sprite = documentRef.createElement('span');
  sprite.className = 'calendar-loading-overlay__sprite';

  const label = documentRef.createElement('span');
  label.className = 'calendar-loading-overlay__label';

  const labelText = documentRef.createElement('span');
  labelText.className = 'calendar-loading-overlay__label-text';
  labelText.textContent = '로딩중';
  label.append(labelText);

  for (let index = 0; index < 3; index += 1) {
    const dot = documentRef.createElement('span');
    dot.className = 'calendar-loading-overlay__dot';
    dot.textContent = '.';
    label.append(dot);
  }

  content.append(sprite, label);

  const status = documentRef.createElement('span');
  status.className = 'calendar-loading-overlay__status';
  status.textContent = '캘린더를 불러오는 중입니다';

  overlay.append(content, status);
  return overlay;
}

export function createCalendarLoadingController({
  root,
  documentRef = root?.ownerDocument || globalThis.document,
  windowRef = documentRef?.defaultView || globalThis.window,
} = {}) {
  if (!root || !documentRef) return null;

  const existingController = controllerByRoot.get(root);
  if (existingController) return existingController;

  const originalAriaBusy = root.getAttribute('aria-busy');
  const overlay =
    root.querySelector('.calendar-loading-overlay') ||
    createLoadingOverlay(documentRef);

  if (!overlay.parentNode) root.append(overlay);
  void preloadCalendarLoadingSprite();

  let generation = 0;
  let activeToken = null;
  let destroyed = false;
  const pendingByKey = new Map();

  function show(token) {
    if (destroyed) return;
    activeToken = token;
    root.setAttribute('aria-busy', 'true');
    root.classList.add('is-calendar-loading');
    overlay.hidden = false;
    overlay.classList.add('is-active');
  }

  function hide() {
    overlay.classList.remove('is-active');
    overlay.hidden = true;
    root.classList.remove('is-calendar-loading');

    if (originalAriaBusy === null) {
      root.removeAttribute('aria-busy');
    } else {
      root.setAttribute('aria-busy', originalAriaBusy);
    }

    activeToken = null;
  }

  function begin({ key = '' } = {}) {
    const token = Object.freeze({
      id: ++generation,
      key: String(key || ''),
    });
    show(token);
    return token;
  }

  function isCurrent(token) {
    return Boolean(
      !destroyed && token && activeToken && token.id === activeToken.id,
    );
  }

  async function finish(token) {
    if (!isCurrent(token)) return false;
    await waitForCalendarPaint(windowRef);
    if (!isCurrent(token)) return false;
    hide();
    return true;
  }

  function cancel(token = activeToken) {
    if (token && !isCurrent(token)) return false;
    generation += 1;
    hide();
    return true;
  }

  function runLatest(task, { key = '' } = {}) {
    const normalizedKey = String(key || '');
    const pendingEntry = normalizedKey
      ? pendingByKey.get(normalizedKey)
      : null;
    if (pendingEntry && isCurrent(pendingEntry.token)) {
      return pendingEntry.promise;
    }

    const token = begin({ key: normalizedKey });
    const context = {
      token,
      isCurrent: () => isCurrent(token),
    };

    const operation = (async () => {
      try {
        return await task(context);
      } finally {
        await finish(token);
      }
    })();

    if (!normalizedKey) return operation;

    const trackedOperation = operation.finally(() => {
      if (pendingByKey.get(normalizedKey)?.promise === trackedOperation) {
        pendingByKey.delete(normalizedKey);
      }
    });
    pendingByKey.set(normalizedKey, {
      promise: trackedOperation,
      token,
    });
    return trackedOperation;
  }

  function destroy() {
    if (destroyed) return;
    cancel();
    destroyed = true;
    pendingByKey.clear();
    windowRef?.removeEventListener?.('mallin:before-pjax-swap', destroy);
    overlay.remove();
    controllerByRoot.delete(root);
  }

  const controller = {
    begin,
    cancel,
    destroy,
    finish,
    isCurrent,
    runLatest,
    getState() {
      return {
        active: Boolean(activeToken && !overlay.hidden),
        generation,
        pendingKeys: [...pendingByKey.keys()],
      };
    },
  };

  controllerByRoot.set(root, controller);
  windowRef?.addEventListener?.('mallin:before-pjax-swap', destroy, {
    once: true,
  });
  return controller;
}
