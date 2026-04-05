// assets/js/modules/search-nav.js
export function initSearchNav({
  baseUrl = 'posts-all.html',
  formSelector = '#searchForm',
  inputSelector = '#q',
  typeBtnSelector = '[data-type]',
} = {}) {
  const page = document.body?.dataset?.page || 'home';

  const form =
    document.querySelector(formSelector) ||
    document.querySelector('form.search');

  const input =
    document.querySelector(inputSelector) ||
    document.querySelector('input[name="q"]');

  if (!form || !input) return;

  const typeBtns = Array.from(document.querySelectorAll(typeBtnSelector));

  function normalizeType(raw) {
    const t = String(raw || 'title')
      .trim()
      .toLowerCase();
    if (t === 'tag') return 'tag';
    if (t === 'author') return 'author';
    return 'title';
  }

  function getTabFromPage() {
    const p = String(page).trim().toLowerCase();

    if (p === 'posts-all') {
      const sp = new URLSearchParams(window.location.search);
      return (sp.get('tab') || 'all').toLowerCase();
    }

    if (p === 'home') return 'all';
    if (p === 'study') return 'study';
    if (p === 'work') return 'work';
    if (p === 'event') return 'event';
    if (p === 'career') return 'career';

    return 'all';
  }

  function getTypeFromUrl() {
    const sp = new URLSearchParams(window.location.search);
    return normalizeType(sp.get('type') || 'title');
  }

  function getType() {
    const pressed = typeBtns.find(
      (b) => b.getAttribute('aria-pressed') === 'true',
    );
    return normalizeType(pressed?.dataset?.type || 'title');
  }

  function setTypeUI(type) {
    const safeType = normalizeType(type);

    typeBtns.forEach((b) => {
      const active = normalizeType(b.dataset.type) === safeType;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  if (typeBtns.length) {
    setTypeUI(getTypeFromUrl());

    typeBtns.forEach((b) => {
      b.addEventListener('click', () => {
        setTypeUI(normalizeType(b.dataset.type));
      });
    });
  }

  function getSiteBasePath() {
    const parts = window.location.pathname.split('/').filter(Boolean);

    if (window.location.hostname.endsWith('github.io') && parts.length > 0) {
      return `/${parts[0]}/`;
    }

    return '/';
  }

  if (page === 'posts-all') {
    const sp = new URLSearchParams(window.location.search);
    input.value = sp.get('q') || '';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const q = (input.value || '').trim();
    const tab = getTabFromPage();
    const type = getType();

    const params = new URLSearchParams();
    params.set('tab', tab);

    if (type !== 'title') {
      params.set('type', type);
    }

    if (q) {
      params.set('q', q);
    }

    const basePath = getSiteBasePath();
    window.location.href = `${basePath}${baseUrl}?${params.toString()}`;
  });
}
