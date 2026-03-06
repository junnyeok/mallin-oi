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

async function loadWeekly() {
  try {
    const data = await loadJson('weekly.json');

    const activeWeek =
      typeof data.activeWeek === 'string' ? data.activeWeek : null;

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

      order.sort((a, b) => new Date(a) - new Date(b));

      let idx = activeWeek ? order.indexOf(activeWeek) : -1;
      if (idx < 0) idx = order.length - 1;

      return { mode: 'multi', order, map, index: idx };
    }

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

/* ================= 정렬 (✅ 같은 날짜 보정) ================= */

function getIdNum(id) {
  const m = String(id || '').match(/(\d+)/);
  return m ? Number(m[1]) : -1;
}

// ✅ date 최신순 + (date 같으면) id 큰 게 먼저
function sortByDateDesc(posts) {
  return [...posts].sort((a, b) => {
    const bt = new Date(b.date).getTime();
    const at = new Date(a.date).getTime();
    if (bt !== at) return bt - at;

    const bn = getIdNum(b.id);
    const an = getIdNum(a.id);
    if (bn !== an) return bn - an;

    return String(b.title || '').localeCompare(String(a.title || ''), 'ko');
  });
}

/**
 * 주요 업데이트 정렬 규칙
 * 1. pinned 우선
 * 2. (합산) views 내림차순
 * 3. date 최신순
 * 4. (date 같으면) id 큰 게 먼저
 */
function sortForFeatured(posts) {
  return [...posts].sort((a, b) => {
    if ((b.pinned ? 1 : 0) !== (a.pinned ? 1 : 0)) {
      return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
    }

    const bv = getCombinedViews(b);
    const av = getCombinedViews(a);
    if (bv !== av) return bv - av;

    const bt = new Date(b.date).getTime();
    const at = new Date(a.date).getTime();
    if (bt !== at) return bt - at;

    return getIdNum(b.id) - getIdNum(a.id);
  });
}

function formatMMDD(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

/* ================= 카드/리스트 클릭 추적 ================= */

function markViewFromList(id) {
  try {
    sessionStorage.setItem(`viewFromList:${id}`, '1');
  } catch {}
}

function attachViewTracker(rootEl) {
  if (!rootEl) return;

  rootEl.addEventListener('click', (e) => {
    const cardLink = e.target.closest('a.card[data-id]');
    if (cardLink) {
      const id = cardLink.dataset.id;
      bumpLocalView(id);
      markViewFromList(id);
      return;
    }

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
    `,
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
    `,
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

function mountWeeklyNav(weeklyEl, state, onChange) {
  const panel = weeklyEl.closest('.panel');
  if (!panel) return;

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
        (x) => x.dataset.id,
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
      renderWeeklyListForWeek(weeklyData.week, weeklyData.items, weeklyEl);
    }
  }
}
