import { supabase } from './supabase-client.js';

const SEOUL_TIME_ZONE = 'Asia/Seoul';
const VISIT_STORAGE_PREFIX = 'mallin:site-visit:';

let initPromise = null;

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
    return sessionStorage.getItem(`${VISIT_STORAGE_PREFIX}${userId}`) === getSeoulDateKey();
  } catch {
    return false;
  }
}

function markVisitRecorded(userId) {
  try {
    sessionStorage.setItem(`${VISIT_STORAGE_PREFIX}${userId}`, getSeoulDateKey());
  } catch {
    // 저장소를 사용할 수 없어도 DB의 unique 제약이 중복 집계를 막는다.
  }
}

async function recordVisitIfSignedIn() {
  const { data } = await supabase.auth.getSession();
  const userId = data?.session?.user?.id;
  if (!userId || wasVisitRecorded(userId)) return;

  const { data: recorded, error } = await supabase.rpc('record_today_site_visit');
  if (!error && recorded) markVisitRecorded(userId);
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
  await recordVisitIfSignedIn().catch(() => {});
  const { data, error } = await supabase.rpc('get_site_stats');
  if (error) return;
  renderStats(Array.isArray(data) ? data[0] : data);
}

export function initSiteStats() {
  if (!initPromise) initPromise = loadSiteStats().catch(() => {});
  return initPromise;
}
