/* ================= 조회수(localStorage) ================= */

const VIEWS_KEY = 'viewsMap_v1';

function readViewsMap() {
  try {
    return JSON.parse(localStorage.getItem(VIEWS_KEY)) || {};
  } catch {
    return {};
  }
}

function writeViewsMap(map) {
  localStorage.setItem(VIEWS_KEY, JSON.stringify(map));
}

function bumpLocalView(id) {
  if (!id) return;
  const map = readViewsMap();
  map[id] = (map[id] || 0) + 1;
  writeViewsMap(map);
}

function getCombinedViews(post) {
  const base = post.views || 0; // posts.json 기본값
  const map = readViewsMap(); // 내 브라우저 증가분
  const extra = map[post.id] || 0;
  return base + extra;
}

/* ================= 데이터 로드/필터 ================= */

// ✅ (중요) 이 파일은 /assets/js/modules/posts-ui.js 에 있으니까
// /assets/data/*.json 을 읽으려면 ../../data/*.json 이 맞아.
const DATA_BASE = new URL('../../data/', import.meta.url);

async function loadJson(fileName) {
  const url = new URL(fileName, DATA_BASE);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${fileName}`);
  return res.json();
}

async function loadPosts() {
  return loadJson('posts.json');
}

// ✅ weekly.json 로드 (여러 주차 지원 + 기존 1주 구조도 호환)
async function loadWeekly() {
  try {
    const data = await loadJson('weekly.json');

    const activeWeek =
      typeof data.activeWeek === 'string' ? data.activeWeek : null;

    // ✅ 새 구조: { activeWeek, weeks:[{ week, items }] }
    if (Array.isArray(data.weeks)) {
      const map = new Map();
      const order = [];

      data.weeks.forEach((w) => {
        const week = typeof w?.week === 'string' ? w.week : null;
        const items = Array.isArray(w?.items) ? w.items : [];
        if (!week) return;

        map.set(week, items);
        order.push(week);
      });

      // 날짜 정렬(오름차순)
      order.sort((a, b) => new Date(a) - new Date(b));

      // activeWeek가 없거나 목록에 없으면 가장 최신(마지막)으로
      let idx = activeWeek ? order.indexOf(activeWeek) : -1;
      if (idx < 0) idx = order.length - 1;

      return { mode: 'multi', order, map, index: idx };
    }

    // ✅ 구 구조(호환): { activeWeek, items }
    const items = Array.isArray(data.items) ? data.items : [];
    if (!activeWeek) return { mode: 'single', week: null, items: [] };
    return { mode: 'single', week: activeWeek, items };
  } catch {
    return { mode: 'single', week: null, items: [] };
  }
}

function getPageCategory() {
  return document.body.dataset.page || 'home';
}

function scopePosts(posts, pageCategory) {
  if (pageCategory === 'home') return posts;
  return posts.filter((p) => p.category === pageCategory);
}

function sortByDateDesc(posts) {
  return [...posts].sort((a, b) => new Date(b.date) - new Date(a.date));
}

/**
 * 주요 업데이트 정렬 규칙
 * 1. pinned 우선
 * 2. (합산) views 내림차순
 * 3. date 최신순
 */
function sortForFeatured(posts) {
  return [...posts].sort((a, b) => {
    if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    }

    const bv = getCombinedViews(b);
    const av = getCombinedViews(a);
    if (bv !== av) return bv - av;

    return new Date(b.date) - new Date(a.date);
  });
}

function formatMMDD(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

/* ================= 카드/리스트 클릭 추적 ================= */

/** ✅ 목록 클릭으로 상세 진입할 때 중복 bump 방지용 플래그 */
function markViewFromList(id) {
  try {
    sessionStorage.setItem(`viewFromList:${id}`, '1');
  } catch {}
}

function attachViewTracker(rootEl) {
  if (!rootEl) return;

  rootEl.addEventListener('click', (e) => {
    // 카드 그리드: <a class="card" data-id="...">
    const cardLink = e.target.closest('a.card[data-id]');
    if (cardLink) {
      const id = cardLink.dataset.id;
      bumpLocalView(id);
      markViewFromList(id);
      return;
    }

    // 최신 업로드: <a class="mini__row" data-id="...">
    const miniRow = e.target.closest('a.mini__row[data-id]');
    if (miniRow) {
      const id = miniRow.dataset.id;
      bumpLocalView(id);
      markViewFromList(id);
      return;
    }
  });
}

/* ================= 카드 그리드 ================= */

function renderCardGrid(posts, gridEl) {
  gridEl.innerHTML = posts
    .map(
      (p) => `
      <a href="${p.url}" class="card" data-id="${p.id}">
        <article class="card__body">
          ${p.pinned ? `<span class="badge">📌</span>` : ''}

          <h3 class="card__title">${p.title}</h3>

          <p class="card__desc">${p.excerpt ?? ''}</p>

          <div class="card__meta">
            <span class="chip chip--muted">${formatMMDD(p.date)}</span>
            <span class="chip chip--muted">👀 ${getCombinedViews(p)}</span>
            <span class="chip">${p.category}</span>
          </div>
        </article>
      </a>
    `
    )
    .join('');
}

/* ================= 최신 업로드 ================= */

function renderLatestList(posts, listEl) {
  listEl.innerHTML = posts
    .map(
      (p) => `
      <a class="mini__row" href="${p.url}" data-id="${p.id}">
        <span class="mini__title">${p.title}</span>
        <span class="mini__date">${formatMMDD(p.date)}</span>
      </a>
    `
    )
    .join('');
}

/* ================= 이번주 체크 (주차별 체크 유지 + 완료 이미지 + 주차 네비) ================= */

function weeklyStorageKey(week) {
  return `weeklyChecked:${week}`;
}

function readWeeklyCheckedSet(week) {
  try {
    const raw = localStorage.getItem(weeklyStorageKey(week));
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function writeWeeklyCheckedSet(week, set) {
  localStorage.setItem(weeklyStorageKey(week), JSON.stringify([...set]));
}

function ensureWeeklyStatusEl(listEl) {
  let statusEl = listEl.nextElementSibling;

  if (
    statusEl &&
    statusEl.classList &&
    statusEl.classList.contains('weekly-done-image')
  ) {
    statusEl = statusEl.nextElementSibling;
  }

  if (!statusEl || !statusEl.classList.contains('weekly-status')) {
    statusEl = document.createElement('div');
    statusEl.className = 'weekly-status';
    listEl.insertAdjacentElement('afterend', statusEl);
  }
  return statusEl;
}

function updateWeeklyStatus(statusEl, done) {
  statusEl.textContent = done ? '이번 주 체크 완료 ✅' : '';
}

function toggleWeeklyDoneImage(show) {
  const img = document.querySelector('.weekly-done-image');
  if (!img) return;
  img.style.display = show ? 'block' : 'none';
}

function formatWeekLabel(weekStr) {
  if (!weekStr) return '';
  return weekStr.replaceAll('-', '.');
}

// ✅ 타이틀 우측에 화살표 네비 넣기
function mountWeeklyNav(weeklyEl, state, onChange) {
  const panel = weeklyEl.closest('.panel');
  if (!panel) return;

  // 패널 기준으로 absolute 배치
  panel.style.position = 'relative';

  let nav = panel.querySelector('.weekly-nav');
  if (!nav) {
    nav = document.createElement('div');
    nav.className = 'weekly-nav';
    nav.innerHTML = `
      <button type="button" class="weekly-nav__btn" data-dir="-1" aria-label="저번주">←</button>
      <span class="weekly-nav__label"></span>
      <button type="button" class="weekly-nav__btn" data-dir="1" aria-label="다음주">→</button>
    `;
    panel.appendChild(nav);

    nav.addEventListener('click', (e) => {
      const btn = e.target.closest('button.weekly-nav__btn');
      if (!btn) return;

      const dir = Number(btn.dataset.dir);
      if (!Number.isFinite(dir)) return;

      onChange(dir);
    });
  }

  const label = nav.querySelector('.weekly-nav__label');
  const prevBtn = nav.querySelector('button[data-dir="-1"]');
  const nextBtn = nav.querySelector('button[data-dir="1"]');

  const week = state?.order?.[state.index] || '';
  if (label) label.textContent = formatWeekLabel(week);

  if (prevBtn) prevBtn.disabled = state.index <= 0;
  if (nextBtn) nextBtn.disabled = state.index >= state.order.length - 1;
}

// ✅ 실제 렌더 (특정 week + items로 그림)
function renderWeeklyListForWeek(week, items, listEl) {
  if (!listEl) return;

  const statusEl = ensureWeeklyStatusEl(listEl);

  if (!week || !Array.isArray(items) || items.length === 0) {
    listEl.innerHTML = `<li class="list__item">체크 항목이 없어.</li>`;
    updateWeeklyStatus(statusEl, false);
    toggleWeeklyDoneImage(false);
    return;
  }

  const checked = readWeeklyCheckedSet(week);

  listEl.innerHTML = items
    .filter((it) => it?.id)
    .map((it) => {
      const text = String(it.text ?? '').trim();
      const label = text || it.id;
      const isChecked = checked.has(it.id);

      return `
        <li class="list__item" data-week="${week}" data-id="${it.id}">
          <label class="check" style="cursor:pointer;">
            <input type="checkbox" ${isChecked ? 'checked' : ''} />
            <span class="check__text" style="cursor:pointer;">${label}</span>
          </label>
        </li>
      `;
    })
    .join('');

  const idsAll = items.filter((it) => it?.id).map((it) => it.id);
  const allDone = idsAll.length > 0 && idsAll.every((id) => checked.has(id));
  updateWeeklyStatus(statusEl, allDone);
  toggleWeeklyDoneImage(allDone);

  if (!listEl.dataset.weeklyBound) {
    listEl.addEventListener('change', (e) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement)) return;
      if (input.type !== 'checkbox') return;

      const li = input.closest('li[data-week][data-id]');
      if (!li) return;

      const w = li.dataset.week;
      const id = li.dataset.id;

      const set = readWeeklyCheckedSet(w);

      if (input.checked) set.add(id);
      else set.delete(id);

      writeWeeklyCheckedSet(w, set);

      const ids = [...listEl.querySelectorAll('li[data-id]')].map(
        (x) => x.dataset.id
      );
      const doneNow = ids.length > 0 && ids.every((x) => set.has(x));

      const statusElNow = ensureWeeklyStatusEl(listEl);
      updateWeeklyStatus(statusElNow, doneNow);
      toggleWeeklyDoneImage(doneNow);
    });

    listEl.dataset.weeklyBound = '1';
  }
}

/* ================= 초기화 ================= */

export async function initPostsUI() {
  const gridEl = document.querySelector('#cardGrid');
  const latestEl = document.querySelector('#latestList');
  const weeklyEl = document.querySelector('#weeklyList');

  attachViewTracker(document);

  if (!gridEl && !latestEl && !weeklyEl) return;

  const pageCategory = getPageCategory();

  const [allPosts, weeklyData] = await Promise.all([loadPosts(), loadWeekly()]);

  const scoped = scopePosts(allPosts, pageCategory);

  const featured = sortForFeatured(scoped).slice(0, 4);
  const latest = sortByDateDesc(scoped).slice(0, 6);

  if (gridEl) renderCardGrid(featured, gridEl);
  if (latestEl) renderLatestList(latest, latestEl);

  if (weeklyEl) {
    // ✅ multi(여러 주) / single(1주) 분기
    if (weeklyData?.mode === 'multi') {
      const state = weeklyData;

      const renderNow = () => {
        const week = state.order[state.index];
        const items = state.map.get(week) || [];
        renderWeeklyListForWeek(week, items, weeklyEl);

        mountWeeklyNav(weeklyEl, state, (dir) => {
          const next = state.index + dir;
          if (next < 0 || next >= state.order.length) return;
          state.index = next;
          renderNow();
        });
      };

      renderNow();
    } else {
      // single(기존 weekly.json 구조)
      renderWeeklyListForWeek(weeklyData.week, weeklyData.items, weeklyEl);
    }
  }
}
