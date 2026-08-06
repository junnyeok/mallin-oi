const XP_GAIN_LANES = Object.freeze([
  Object.freeze({ offsetX: -18, driftX: -6 }),
  Object.freeze({ offsetX: 18, driftX: 6 }),
  Object.freeze({ offsetX: -8, driftX: -3 }),
  Object.freeze({ offsetX: 8, driftX: 3 }),
  Object.freeze({ offsetX: 0, driftX: 0 }),
]);

export const XP_GAIN_EFFECT_CONFIG = Object.freeze({
  durationMs: 1_000,
  minimumDurationMs: 800,
  maximumDurationMs: 1_200,
  cleanupBufferMs: 200,
});

const laneStateByContainer = new WeakMap();

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), Math.max(minimum, maximum));

function toFiniteRect(rect) {
  if (!rect) return null;

  const values = [rect.left, rect.top, rect.width, rect.height];
  return values.every(Number.isFinite) ? rect : null;
}

export function normalizeXpGainAmount(amount) {
  const numericAmount = typeof amount === "number" ? amount : Number(amount);

  return Number.isFinite(numericAmount) && numericAmount > 0
    ? numericAmount
    : null;
}

export function formatXpGainAmount(amount) {
  const numericAmount = normalizeXpGainAmount(amount);
  if (numericAmount === null) return "";

  return numericAmount.toLocaleString("ko-KR", {
    maximumFractionDigits: Number.isInteger(numericAmount) ? 0 : 3,
  });
}

export function createWholeXpGainAccumulator() {
  let pendingAmount = 0;

  return Object.freeze({
    add(amount) {
      const numericAmount = normalizeXpGainAmount(amount);
      if (numericAmount === null) return 0;

      pendingAmount = Math.min(
        Number.MAX_SAFE_INTEGER,
        pendingAmount + numericAmount
      );
      const readyAmount = Math.floor(pendingAmount);
      pendingAmount -= readyAmount;
      return readyAmount;
    },
    reset() {
      pendingAmount = 0;
    },
    getPendingAmount() {
      return pendingAmount;
    },
  });
}

export function calculateXpGainOrigin(containerRect, anchorRect) {
  const safeContainer = toFiniteRect(containerRect);
  const safeAnchor = toFiniteRect(anchorRect);
  const width = Math.max(1, safeContainer?.width ?? 1);
  const height = Math.max(1, safeContainer?.height ?? 1);
  const horizontalInset = Math.min(44, width / 2);
  const minimumY = Math.min(54, height * 0.3);
  const maximumY = Math.max(minimumY, height - 86);

  const requestedX = safeAnchor
    ? safeAnchor.left - (safeContainer?.left ?? 0) + safeAnchor.width / 2
    : width / 2;
  const requestedY = safeAnchor
    ? safeAnchor.top - (safeContainer?.top ?? 0) + safeAnchor.height * 0.13
    : height * 0.22;

  return {
    x: clamp(requestedX, horizontalInset, width - horizontalInset),
    y: clamp(requestedY, minimumY, maximumY),
  };
}

function getNextLane(container) {
  const currentIndex = laneStateByContainer.get(container) ?? 0;
  laneStateByContainer.set(container, currentIndex + 1);
  return {
    index: currentIndex % XP_GAIN_LANES.length,
    ...XP_GAIN_LANES[currentIndex % XP_GAIN_LANES.length],
  };
}

function normalizeSource(source) {
  return ["watering", "production"].includes(source)
    ? source
    : "generic";
}

function normalizeDuration(durationMs) {
  const numericDuration = Number(durationMs);
  if (!Number.isFinite(numericDuration)) {
    return XP_GAIN_EFFECT_CONFIG.durationMs;
  }

  return clamp(
    numericDuration,
    XP_GAIN_EFFECT_CONFIG.minimumDurationMs,
    XP_GAIN_EFFECT_CONFIG.maximumDurationMs
  );
}

export function showXpGain(
  amount,
  {
    container,
    anchor = null,
    source = "generic",
    durationMs = XP_GAIN_EFFECT_CONFIG.durationMs,
    documentRef = container?.ownerDocument ?? globalThis.document,
    windowRef = documentRef?.defaultView ?? globalThis.window,
  } = {}
) {
  const numericAmount = normalizeXpGainAmount(amount);
  if (
    numericAmount === null ||
    !container ||
    typeof container.append !== "function" ||
    !documentRef?.createElement
  ) {
    return null;
  }

  const duration = normalizeDuration(durationMs);
  const lane = getNextLane(container);
  const origin = calculateXpGainOrigin(
    container.getBoundingClientRect?.(),
    anchor?.getBoundingClientRect?.()
  );
  const effect = documentRef.createElement("span");
  const normalizedSource = normalizeSource(source);

  effect.className = `xp-gain xp-gain--${normalizedSource}`;
  effect.textContent = `${formatXpGainAmount(numericAmount)}XP`;
  effect.dataset.amount = String(numericAmount);
  effect.dataset.lane = String(lane.index);
  effect.dataset.source = normalizedSource;
  effect.setAttribute("aria-hidden", "true");
  effect.style.setProperty("--xp-origin-x", `${origin.x}px`);
  effect.style.setProperty("--xp-origin-y", `${origin.y}px`);
  effect.style.setProperty("--xp-offset-x", `${lane.offsetX}px`);
  effect.style.setProperty("--xp-drift-x", `${lane.driftX}px`);
  effect.style.setProperty("--xp-duration", `${duration}ms`);

  let cleaned = false;
  let cleanupTimerId = null;
  const setTimer =
    typeof windowRef?.setTimeout === "function"
      ? windowRef.setTimeout.bind(windowRef)
      : globalThis.setTimeout.bind(globalThis);
  const clearTimer =
    typeof windowRef?.clearTimeout === "function"
      ? windowRef.clearTimeout.bind(windowRef)
      : globalThis.clearTimeout.bind(globalThis);

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (cleanupTimerId !== null) clearTimer(cleanupTimerId);
    cleanupTimerId = null;
    effect.remove();
  };

  effect.addEventListener("animationend", (event) => {
    if (
      event.target !== effect ||
      !["xp-gain-float", "xp-gain-fade-reduced"].includes(event.animationName)
    ) {
      return;
    }

    cleanup();
  });

  container.append(effect);
  cleanupTimerId = setTimer(
    cleanup,
    duration + XP_GAIN_EFFECT_CONFIG.cleanupBufferMs
  );

  return effect;
}
