// assets/js/modules/calendar-loading.js

export const CALENDAR_LOADING_IMAGE_PATHS = Object.freeze({
  study: 'assets/images/calendar/logo-study.png',
  work: 'assets/images/calendar/logo-work.png',
  event: 'assets/images/calendar/logo-event.png',
});

export const CALENDAR_LOADING_TIMING = Object.freeze({
  showDelayMs: 180,
  fadeDurationMs: 160,
});

const controllerByRoot = new WeakMap();

export function getCalendarLoadingImageUrl(calendarType) {
  const path = CALENDAR_LOADING_IMAGE_PATHS[String(calendarType || '')];
  return path ? new URL(`../../../${path}`, import.meta.url).href : null;
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

  const image = documentRef.createElement('img');
  image.className = 'calendar-loading-overlay__image';
  image.hidden = true;
  image.setAttribute('alt', '');
  image.setAttribute('decoding', 'async');

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

  content.append(image, label);

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
  showDelayMs = CALENDAR_LOADING_TIMING.showDelayMs,
  fadeDurationMs = CALENDAR_LOADING_TIMING.fadeDurationMs,
} = {}) {
  if (!root || !documentRef) return null;

  const existingController = controllerByRoot.get(root);
  if (existingController) return existingController;

  const originalAriaBusy = root.getAttribute('aria-busy');
  const overlay =
    root.querySelector('.calendar-loading-overlay') ||
    createLoadingOverlay(documentRef);
  const loadingImage = overlay.querySelector(
    '.calendar-loading-overlay__image',
  );

  if (!overlay.parentNode) root.append(overlay);

  let generation = 0;
  let activeToken = null;
  let destroyed = false;
  let showTimerId = null;
  let fadeTimerId = null;
  let fadePromise = null;
  let resolveFade = null;
  let fadingTokenId = null;
  let imageRequestId = 0;
  const pendingByKey = new Map();
  const setTimer =
    typeof windowRef?.setTimeout === 'function'
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimer =
    typeof windowRef?.clearTimeout === 'function'
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);

  function clearShowTimer() {
    if (showTimerId === null) return;
    clearTimer(showTimerId);
    showTimerId = null;
  }

  function syncLoadingImage() {
    if (!loadingImage) return;

    const calendarType = String(
      root.getAttribute('data-calendar-type') || '',
    );
    const imageUrl = getCalendarLoadingImageUrl(calendarType);
    const requestId = ++imageRequestId;

    loadingImage.hidden = true;
    loadingImage.onload = null;
    loadingImage.onerror = null;
    loadingImage.removeAttribute('data-calendar-type');

    if (!imageUrl) {
      loadingImage.removeAttribute('src');
      return;
    }

    loadingImage.setAttribute('data-calendar-type', calendarType);
    loadingImage.onload = () => {
      if (
        requestId === imageRequestId &&
        loadingImage.getAttribute('data-calendar-type') === calendarType
      ) {
        loadingImage.hidden = false;
      }
    };
    loadingImage.onerror = () => {
      if (requestId === imageRequestId) loadingImage.hidden = true;
    };
    loadingImage.setAttribute('src', imageUrl);

    if (loadingImage.complete && loadingImage.naturalWidth > 0) {
      loadingImage.hidden = false;
    }
  }

  function interruptFade() {
    if (fadeTimerId !== null) {
      clearTimer(fadeTimerId);
      fadeTimerId = null;
    }

    const interruptedResolve = resolveFade;
    fadePromise = null;
    resolveFade = null;
    fadingTokenId = null;
    interruptedResolve?.(false);
  }

  function restoreRootState() {
    root.classList.remove('is-calendar-loading');

    if (originalAriaBusy === null) {
      root.removeAttribute('aria-busy');
    } else {
      root.setAttribute('aria-busy', originalAriaBusy);
    }
  }

  function hideImmediately() {
    clearShowTimer();
    interruptFade();
    overlay.classList.remove('is-active');
    overlay.hidden = true;
    restoreRootState();
    activeToken = null;
  }

  function show(token) {
    showTimerId = null;
    if (!isCurrent(token)) return;
    root.classList.add('is-calendar-loading');
    overlay.hidden = false;
    void overlay.offsetWidth;
    overlay.classList.add('is-active');
  }

  function fadeOut(token) {
    if (!isCurrent(token)) return Promise.resolve(false);
    if (fadingTokenId === token.id && fadePromise) return fadePromise;

    overlay.classList.remove('is-active');
    fadingTokenId = token.id;
    fadePromise = new Promise((resolve) => {
      resolveFade = resolve;
      fadeTimerId = setTimer(() => {
        fadeTimerId = null;
        fadePromise = null;
        resolveFade = null;
        fadingTokenId = null;

        if (!isCurrent(token)) {
          resolve(false);
          return;
        }

        overlay.hidden = true;
        restoreRootState();
        activeToken = null;
        resolve(true);
      }, Math.max(0, fadeDurationMs));
    });
    return fadePromise;
  }

  function begin({ key = '' } = {}) {
    const token = Object.freeze({
      id: ++generation,
      key: String(key || ''),
    });
    if (destroyed) return token;

    syncLoadingImage();
    const overlayWasShown = !overlay.hidden;
    clearShowTimer();
    interruptFade();
    activeToken = token;
    root.setAttribute('aria-busy', 'true');

    if (overlayWasShown) {
      root.classList.add('is-calendar-loading');
      overlay.classList.add('is-active');
    } else {
      overlay.classList.remove('is-active');
      overlay.hidden = true;
      showTimerId = setTimer(
        () => show(token),
        Math.max(0, showDelayMs),
      );
    }

    return token;
  }

  function isCurrent(token) {
    return Boolean(
      !destroyed && token && activeToken && token.id === activeToken.id,
    );
  }

  async function finish(token) {
    if (!isCurrent(token)) return false;
    clearShowTimer();
    await waitForCalendarPaint(windowRef);
    if (!isCurrent(token)) return false;

    if (overlay.hidden) {
      hideImmediately();
      return true;
    }

    return fadeOut(token);
  }

  function cancel(token = activeToken) {
    if (token && !isCurrent(token)) return false;
    generation += 1;
    hideImmediately();
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
        active: Boolean(activeToken),
        visible: Boolean(
          !overlay.hidden && overlay.classList.contains('is-active'),
        ),
        generation,
        pendingKeys: [...pendingByKey.keys()],
      };
    },
  };

  controllerByRoot.set(root, controller);
  syncLoadingImage();
  windowRef?.addEventListener?.('mallin:before-pjax-swap', destroy, {
    once: true,
  });
  return controller;
}
