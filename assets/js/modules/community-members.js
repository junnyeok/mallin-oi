import { loadSitePeople } from './site-people-data.js';
import { supabase } from './supabase-client.js';
import { getProfileBackgroundByItemId, getProfileFrameByItemId, getCharacterEffectRenderMeta } from './store-data.js';
import { prepareCharacterEffects, cleanupCharacterEffects, renderCharacterEffectHtml } from './character-effects.js';

const PAGE_SIZE = 24;
const DEFAULT_AVATAR = './images/logo-home.png';
const states = new WeakMap();
let lifecycleBound = false;

function getView() {
  return new URL(window.location.href).searchParams.get('view') === 'today' ? 'today' : 'members';
}

function pageHref({ view, search = '', page = 1, display = 'character' }) {
  const url = new URL('./community-members.html', window.location.href);
  url.searchParams.set('view', view);
  if (display === 'photo') url.searchParams.set('cards', 'photo');
  if (search) url.searchParams.set('q', search);
  if (page > 1) url.searchParams.set('page', String(page));
  return `${url.pathname}${url.search}`;
}

function isActive(state) {
  return state.root.isConnected && states.get(state.root) === state && document.body?.dataset?.page === 'community-members';
}

function setBusy(state, busy) {
  state.root.setAttribute('aria-busy', String(busy));
  state.refresh.disabled = busy;
  state.submit.disabled = busy;
}

function setMessage(state, text, { actionText, href, retry = false } = {}) {
  cleanupCharacterEffects(state.grid);
  state.grid.replaceChildren();
  state.message.replaceChildren();
  state.message.hidden = false;
  const message = document.createElement('p');
  message.textContent = text;
  state.message.append(message);
  if (actionText) {
    const action = document.createElement(href ? 'a' : 'button');
    action.className = 'people-state__button';
    action.textContent = actionText;
    if (href) action.href = href;
    else action.type = 'button';
    if (retry) action.addEventListener('click', () => void loadPage(state));
    state.message.append(action);
  }
  state.pagination.replaceChildren();
  state.pagination.hidden = true;
}

function getAvatarSrc(value, fallback = DEFAULT_AVATAR) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  try {
    const url = new URL(raw, window.location.href);
    if (url.protocol === 'https:' || (url.origin === window.location.origin && ['http:', 'https:'].includes(url.protocol))) return url.href;
  } catch {}
  return fallback;
}

function renderScene(item) {
  const scene = document.createElement('span');
  scene.className = 'people-card__scene';
  scene.setAttribute('aria-hidden', 'true');
  const backdrop = document.createElement('span');
  backdrop.className = 'people-card__backdrop';
  const background = getProfileBackgroundByItemId(item.background_item_id);
  if (background) {
    backdrop.style.setProperty('--people-background', `url("${background.pcImagePath}")`);
    backdrop.style.setProperty('--people-background-mobile', `url("${background.mobileImagePath || background.pcImagePath}")`);
  }
  const character = document.createElement('span');
  character.className = 'character-effect-wrap people-card__character';
  const image = document.createElement('img');
  image.className = 'character-effect-character';
  image.src = getAvatarSrc(item.character_image_url, './images/characters/cucumber.png');
  image.alt = '';
  image.loading = 'lazy';
  image.addEventListener('error', () => { image.src = './images/characters/cucumber.png'; }, {once: true});
  character.append(image);
  const effect = getCharacterEffectRenderMeta(item.effect_item_id, 'profile');
  if (effect) character.insertAdjacentHTML('beforeend', renderCharacterEffectHtml(effect));
  scene.append(backdrop, character);
  const frame = getProfileFrameByItemId(item.frame_item_id);
  if (frame) {
    scene.classList.add('has-frame');
    scene.classList.add(item.frame_item_id === 'BF-03' ? 'has-frame--leaf' : item.frame_item_id === 'BF-02' ? 'has-frame--shiny' : 'has-frame--rainbow');
    scene.style.setProperty('--people-frame', `url("${frame.pcImagePath}")`);
    scene.style.setProperty('--people-frame-mobile', `url("${frame.mobileImagePath || frame.pcImagePath}")`);
  }
  return scene;
}

function updateDisplayButtons(state) {
  state.root.querySelectorAll('[data-people-display]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.peopleDisplay === state.display));
  });
  state.root.querySelectorAll('[data-people-tab]').forEach(tab => {
    tab.href = pageHref({view: tab.dataset.peopleTab, display: state.display});
  });
}

function renderPeople(state, items) {
  cleanupCharacterEffects(state.grid);
  state.grid.replaceChildren();
  state.message.hidden = true;
  state.grid.dataset.display = state.display;
  for (const item of items) {
    const userId = String(item.user_id || '').trim();
    if (!userId) continue;
    const name = String(item.nickname || '').trim() || '회원';
    const card = document.createElement('div');
    card.className = 'people-card';
    card.setAttribute('role', 'listitem');
    const link = document.createElement('a');
    link.className = 'people-card__link';
    link.href = `./profile.html?user=${encodeURIComponent(userId)}`;
    link.setAttribute('aria-label', `${name} 프로필 보기`);
    const avatar = document.createElement('img');
    avatar.className = 'people-card__avatar';
    avatar.alt = '';
    avatar.width = 80;
    avatar.height = 80;
    avatar.loading = 'lazy';
    avatar.decoding = 'async';
    const src = getAvatarSrc(item.avatar_url);
    avatar.src = src;
    if (src === DEFAULT_AVATAR) avatar.classList.add('is-default');
    avatar.addEventListener('error', () => {
      avatar.classList.add('is-default');
      avatar.src = DEFAULT_AVATAR;
    }, { once: true });
    const nickname = document.createElement('h2');
    nickname.className = 'people-card__name';
    nickname.textContent = name;
    const cta = document.createElement('span');
    cta.className = 'people-card__cta';
    cta.textContent = '프로필 보기';
    const arrow = document.createElement('span');
    arrow.className = 'people-card__arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    cta.append(arrow);
    const level = document.createElement('span');
    level.className = 'people-card__level';
    level.textContent = `Lv. ${item.level || 1}`;
    const xp = document.createElement('span');
    xp.className = 'people-card__xp';
    xp.textContent = `${Number(item.total_xp || 0).toLocaleString('ko-KR')} XP`;
    const progress = document.createElement('progress');
    progress.className = 'people-card__progress';
    progress.max = item.next_level_xp || 100;
    progress.value = item.level_xp || 0;
    progress.setAttribute('aria-label', `${name} 다음 레벨 경험치 ${progress.value} / ${progress.max}`);
    xp.title = `다음 레벨까지 ${progress.max - progress.value} XP`;
    link.append(state.display === 'photo' ? avatar : renderScene(item), nickname, level, xp, progress, cta);
    card.append(link);
    state.grid.append(card);
  }
  if (state.display !== 'photo') prepareCharacterEffects(state.grid);
}

function renderPagination(state, total) {
  const count = Math.ceil(total / PAGE_SIZE);
  state.pagination.replaceChildren();
  state.pagination.hidden = count <= 1;
  if (count <= 1) return;
  const add = (label, page, { disabled = false, current = false, ariaLabel } = {}) => {
    const control = document.createElement(disabled ? 'span' : 'a');
    control.textContent = label;
    if (disabled) control.setAttribute('aria-disabled', 'true');
    else control.href = pageHref({ view: state.view, display: state.display, search: state.search, page });
    if (current) control.setAttribute('aria-current', 'page');
    if (ariaLabel) control.setAttribute('aria-label', ariaLabel);
    state.pagination.append(control);
  };
  add('이전', state.page - 1, { disabled: state.page <= 1 });
  const start = Math.max(1, Math.min(state.page - 2, count - 4));
  const end = Math.min(count, start + 4);
  for (let page = start; page <= end; page += 1) {
    add(String(page), page, { current: page === state.page, ariaLabel: `${page}페이지` });
  }
  add('다음', state.page + 1, { disabled: state.page >= count });
}

function renderSummary(state, data) {
  const total = Math.max(0, Number(data.total) || 0);
  const hasCount = Number.isFinite(Number(state.view === 'today' ? data.todayVisitCount : data.memberCount));
  const count = state.view === 'today' ? data.todayVisitCount : data.memberCount;
  state.totalLabel.textContent = hasCount ? (state.view === 'today' ? '금일 방문' : '회원') : (state.search ? '검색 결과' : state.view === 'today' ? '방문 회원' : '회원');
  state.total.textContent = Math.max(0, hasCount ? Number(count) : total).toLocaleString('ko-KR');
  const guests = Math.max(0, Number(data.guestCount) || 0);
  state.guestNote.hidden = state.view !== 'today';
  if (state.view === 'today') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? `${data.date.replaceAll('-', '.')} · ` : '';
    state.guestNote.textContent = `${date}한국 시간 기준이야. 비로그인 방문은 위 회원 수에 포함하지 않아.${Number.isFinite(Number(data.guestCount)) ? ` 비로그인 방문 ${guests.toLocaleString('ko-KR')}명.` : ''}`;
  }
  return total;
}

function clearSummary(state) {
  state.totalLabel.textContent = state.view === 'today' ? '금일 방문' : '회원';
  state.total.textContent = '—';
  state.guestNote.hidden = true;
}

async function loadPage(state) {
  if (!isActive(state)) return;
  const request = ++state.request;
  setBusy(state, true);
  state.status.textContent = `${state.view === 'today' ? '오늘 방문한 회원' : '회원'} 목록을 불러오는 중이야.`;
  setMessage(state, '잠시만 기다려줘. 이웃들을 불러오고 있어.');
  try {
    const data = await loadSitePeople({ view: state.view, search: state.search, offset: (state.page - 1) * PAGE_SIZE, limit: PAGE_SIZE });
    if (!isActive(state) || request !== state.request) return;
    state.form.hidden = false;
    if (data.access === 'login_required') {
      clearSummary(state);
      state.form.hidden = true;
      state.status.textContent = '오늘 방문한 회원 목록은 로그인한 회원에게 공개돼.';
      setMessage(state, '로그인하면 오늘 다녀간 이웃들의 닉네임과 아바타를 볼 수 있어.', { actionText: '로그인하기', href: './login.html' });
      return;
    }
    if (data.access === 'admin_required') {
      clearSummary(state);
      state.form.hidden = true;
      state.status.textContent = '이 목록은 관리자만 확인할 수 있어.';
      setMessage(state, '목록을 확인할 수 있는 권한이 없어.');
      return;
    }
    const total = renderSummary(state, data);
    state.itemsTotal = total;
    if (state.page > Math.max(1, Math.ceil(total / PAGE_SIZE))) {
      state.page = Math.max(1, Math.ceil(total / PAGE_SIZE));
      history.replaceState(history.state, '', pageHref({ view: state.view, display: state.display, search: state.search, page: state.page }));
      await loadPage(state);
      return;
    }
    state.status.textContent = state.search
      ? `‘${state.search}’ 검색 결과 ${total.toLocaleString('ko-KR')}명`
      : `${state.view === 'today' ? '오늘 방문한 회원' : '함께하는 회원'} ${total.toLocaleString('ko-KR')}명 · 프로필을 눌러 이웃을 만나봐.`;
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      setMessage(state, state.search ? '일치하는 닉네임이 없어. 다른 닉네임으로 찾아봐.' : state.view === 'today' ? '아직 오늘 방문한 회원이 없어.' : '표시할 회원이 아직 없어.');
      return;
    }
    state.items = items;
    renderPeople(state, items);
    renderPagination(state, total);
  } catch (error) {
    if (!isActive(state) || request !== state.request) return;
    console.warn('[community-members] list load failed:', error?.message || error);
    clearSummary(state);
    state.status.textContent = '목록을 불러오지 못했어.';
    setMessage(state, '잠시 후 다시 시도해줘.', { actionText: '다시 불러오기', retry: true });
  } finally {
    if (isActive(state) && request === state.request) setBusy(state, false);
  }
}

export async function initCommunityMembers() {
  if (document.body?.dataset?.page !== 'community-members') return;
  const root = document.querySelector('[data-community-members]');
  if (!root) return;
  const existing = states.get(root);
  if (existing) return loadPage(existing);
  const query = new URL(window.location.href).searchParams;
  const state = {
    root,
    display: query.get('cards') === 'photo' ? 'photo' : 'character', items: [],
    view: getView(), search: String(query.get('q') || '').trim().slice(0, 80),
    page: Math.max(1, Math.min(10000, Math.floor(Number(query.get('page')) || 1))), request: 0,
    grid: root.querySelector('#peopleGrid'), status: root.querySelector('#peopleStatus'),
    message: root.querySelector('#peopleState'), pagination: root.querySelector('#peoplePagination'),
    form: root.querySelector('#peopleSearchForm'), input: root.querySelector('#peopleSearch'),
    submit: root.querySelector('#peopleSearchForm button[type="submit"]'), refresh: root.querySelector('#peopleRefresh'),
    totalLabel: root.querySelector('#peopleTotalLabel'), total: root.querySelector('#peopleTotal'),
    guestNote: root.querySelector('#peopleGuestNote'),
  };
  if (Object.values(state).some(value => value === null)) return;
  states.set(root, state);
  const today = state.view === 'today';
  root.querySelector('#peopleTitle').textContent = today ? '오늘 다녀간 이웃' : '함께하는 회원';
  root.querySelector('#peopleDescription').textContent = today ? '오늘 말린오이닷컴을 찾아온 회원들을 만나봐.' : '말린오이닷컴에서 함께 기록하는 이웃들을 만나봐.';
  root.querySelector('.people-directory').setAttribute('aria-label', today ? '오늘 방문한 회원 목록' : '회원 목록');
  root.querySelector('#peopleGrid').setAttribute('aria-label', today ? '오늘 방문한 회원 프로필' : '회원 프로필');
  root.querySelectorAll('[data-people-tab]').forEach(tab => {
    if (tab.dataset.peopleTab === state.view) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  updateDisplayButtons(state);
  root.querySelectorAll('[data-people-display]').forEach(button => {
    button.addEventListener('click', () => {
      state.display = button.dataset.peopleDisplay === 'photo' ? 'photo' : 'character';
      updateDisplayButtons(state);
      history.replaceState(history.state, '', pageHref({view: state.view, display: state.display, search: state.search, page: state.page}));
      if (state.items.length && !state.message.hidden) return;
      if (state.items.length) {
        renderPeople(state, state.items);
        renderPagination(state, state.itemsTotal);
      }
    });
  });
  state.input.value = state.search;
  const applySearch = (search) => {
    state.search = search;
    state.page = 1;
    history.replaceState(history.state, '', pageHref({ view: state.view, display: state.display, search: state.search }));
    void loadPage(state);
  };
  state.form.addEventListener('submit', event => {
    event.preventDefault();
    applySearch(state.input.value.trim().slice(0, 80));
  });
  state.form.addEventListener('reset', event => {
    event.preventDefault();
    state.input.value = '';
    applySearch('');
  });
  state.refresh.addEventListener('click', () => void loadPage(state));
  if (!lifecycleBound) {
    lifecycleBound = true;
    supabase.auth.onAuthStateChange((event) => {
      const activeRoot = document.querySelector('[data-community-members]');
      const activeState = activeRoot && states.get(activeRoot);
      if (!activeState || activeState.view !== 'today') return;
      if (event === 'SIGNED_OUT') {
        activeState.request += 1;
        clearSummary(activeState);
        setBusy(activeState, false);
        activeState.form.hidden = true;
        activeState.status.textContent = '오늘 방문한 회원 목록은 로그인한 회원에게 공개돼.';
        setMessage(activeState, '로그인하면 오늘 다녀간 이웃들의 닉네임과 아바타를 볼 수 있어.', { actionText: '로그인하기', href: './login.html' });
      } else if (event === 'SIGNED_IN') {
        window.setTimeout(() => void loadPage(activeState), 0);
      }
    });
    window.addEventListener('auth-changed', () => {
      const activeRoot = document.querySelector('[data-community-members]');
      const activeState = activeRoot && states.get(activeRoot);
      if (activeState) void loadPage(activeState);
    });
  }
  await loadPage(state);
}
