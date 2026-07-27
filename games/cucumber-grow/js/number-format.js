import { GAME_CONFIG } from "./game-config.js";

export function toSafeNonNegativeNumber(
  value,
  fallback = 0,
  maximum = GAME_CONFIG.maxGameNumber
) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }

  return Math.min(parsed, maximum);
}

export function toSafeCount(value, fallback = 0) {
  return Math.min(
    Math.floor(toSafeNonNegativeNumber(value, fallback)),
    GAME_CONFIG.maxFacilityCount
  );
}

export function addSafeNumbers(left, right) {
  const safeLeft = toSafeNonNegativeNumber(left);
  const safeRight = toSafeNonNegativeNumber(right);
  const sum = safeLeft + safeRight;

  return Number.isFinite(sum)
    ? Math.min(sum, GAME_CONFIG.maxGameNumber)
    : GAME_CONFIG.maxGameNumber;
}

export function formatNumber(value) {
  const safeValue = Math.floor(toSafeNonNegativeNumber(value));

  if (safeValue < 1_000_000) {
    return safeValue.toLocaleString("ko-KR");
  }

  const units = [
    { size: 10_000_000_000_000_000, label: "경" },
    { size: 1_000_000_000_000, label: "조" },
    { size: 100_000_000, label: "억" },
    { size: 10_000, label: "만" },
  ];
  const unit = units.find(({ size }) => safeValue >= size);

  if (!unit) {
    return safeValue.toLocaleString("ko-KR");
  }

  const scaled = safeValue / unit.size;
  const fractionDigits = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;

  return `${scaled.toLocaleString("ko-KR", {
    maximumFractionDigits: fractionDigits,
  })}${unit.label}`;
}

export function formatExactNumber(value) {
  return Math.floor(toSafeNonNegativeNumber(value)).toLocaleString("ko-KR");
}

export function formatDuration(totalSeconds) {
  let remainingSeconds = Math.floor(toSafeNonNegativeNumber(totalSeconds));
  const hours = Math.floor(remainingSeconds / 3_600);
  remainingSeconds %= 3_600;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  const parts = [];

  if (hours > 0) parts.push(`${hours}시간`);
  if (minutes > 0) parts.push(`${minutes}분`);
  if (parts.length === 0 || (hours === 0 && seconds > 0)) {
    parts.push(`${seconds}초`);
  }

  return parts.join(" ");
}

export function formatDateTime(timestamp) {
  const date = new Date(timestamp);

  if (!Number.isFinite(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
