import { supabase } from './supabase-client.js';

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const VISIT_STORAGE_PREFIX = 'mallin:site-visit:';
const GUEST_VISITOR_ID_STORAGE_KEY = 'mallin:site-visitor-id';

let initPromise = null;
let refreshPromise = null;
let authListenerInitialized = false;

function getSeoulDateKey() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function wasVisitRecorded(userId) {
  try {
    return localStorage.getItem(`${VISIT_STORAGE_PREFIX}${userId}`) === getSeoulDateKey();
  } catch {
    return false;
  }
}

function markVisitRecorded(userId) {
  try {
    localStorage.setItem(`${VISIT_STORAGE_PREFIX}${userId}`, getSeoulDateKey());
  } catch {
    // 저장소를 사용할 수 없어도 DB의 unique 제약이 중복 집계를 막는다.
  }
}

function createUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}

function normalizeUuidV4(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    normalized,
  )
    ? normalized
    : '';
}

function getGuestVisitorId() {
  try {
    const storedId = normalizeUuidV4(localStorage.getItem(GUEST_VISITOR_ID_STORAGE_KEY));
    if (storedId) return storedId;

    const nextId = normalizeUuidV4(createUuid()) || createUuid();
    localStorage.setItem(GUEST_VISITOR_ID_STORAGE_KEY, nextId);
    return nextId;
  } catch {
    return createUuid();
  }
}

async function getSessionUserId() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.user?.id || null;
  } catch {
    return null;
  }
}

async function recordVisit() {
  const guestVisitorId = getGuestVisitorId();
  const userId = await getSessionUserId();
  const guestVisitorKey = `guest:${guestVisitorId}`;
  const visitorKey = userId ? `user:${userId}` : `guest:${guestVisitorId}`;
  if (wasVisitRecorded(visitorKey)) {
    if (userId) markVisitRecorded(guestVisitorKey);
    return;
  }

  const { data: recorded, error } = await supabase.rpc('record_today_site_visit', {
    p_guest_id: guestVisitorId,
  });
  if (!error && recorded) {
    markVisitRecorded(visitorKey);
    if (userId) markVisitRecorded(guestVisitorKey);
  }
}

function renderStats(stats) {
  const root = document.querySelector('[data-site-stats]');
  if (!root || !stats) return;

  const memberCount = Number(stats.member_count);
  const todayVisitCount = Number(stats.today_visit_count);
  if (!Number.isFinite(memberCount) || !Number.isFinite(todayVisitCount)) return;

  root.querySelector('[data-site-member-count]').textContent = memberCount.toLocaleString('ko-KR');
  root.querySelector('[data-site-today-visit-count]').textContent =
    todayVisitCount.toLocaleString('ko-KR');
  root.hidden = false;
}

async function loadSiteStats() {
  await recordVisit().catch(() => {});
  const { data, error } = await supabase.rpc('get_site_stats');
  if (error) return;
  renderStats(Array.isArray(data) ? data[0] : data);
}

export function refreshSiteStats() {
  if (!refreshPromise) {
    refreshPromise = loadSiteStats()
      .catch(() => {})
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function initAuthRefreshListener() {
  if (authListenerInitialized) return;
  authListenerInitialized = true;

  try {
    supabase.auth.onAuthStateChange(() => {
      void refreshSiteStats();
    });
  } catch {
    // 인증 이벤트 구독 실패가 통계 표시나 다른 초기화를 막지 않게 둔다.
  }
}

export function initSiteStats() {
  initAuthRefreshListener();
  if (!initPromise) initPromise = refreshSiteStats();
  return initPromise;
}
