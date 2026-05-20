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

  const typeBtns = Array.from(form.querySelectorAll(typeBtnSelector));
  const currentBtn = form.querySelector('#searchTypeCurrent');
  const currentLabel = form.querySelector('.search-type-current__label');
  const menu = form.querySelector('#searchTypeMenu');

  function normalizeType(raw) {
    const t = String(raw || 'title')
      .trim()
      .toLowerCase();

    if (t === 'tag') return 'tag';
    if (t === 'author') return 'author';
    return 'title';
  }

  function getTypeLabel(type) {
    const safeType = normalizeType(type);
    if (safeType === 'tag') return '태그';
    if (safeType === 'author') return '작성자';
    return '제목/요약';
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
    return normalizeType(form.dataset.searchType || getTypeFromUrl());
  }

  function openMenu() {
    if (!menu || !currentBtn) return;
    menu.hidden = false;
    currentBtn.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!menu || !currentBtn) return;
    menu.hidden = true;
    currentBtn.setAttribute('aria-expanded', 'false');
  }

  function setTypeUI(type) {
    const safeType = normalizeType(type);

    form.dataset.searchType = safeType;

    typeBtns.forEach((btn) => {
      const active = normalizeType(btn.dataset.type) === safeType;

      if (btn.classList.contains('search-type-btn')) {
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-pressed', String(active));
      }

      if (btn.classList.contains('search-type-menu__item')) {
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-checked', String(active));
      }
    });

    if (currentLabel) {
      currentLabel.textContent = getTypeLabel(safeType);
    }
  }

  if (typeBtns.length) {
    setTypeUI(getTypeFromUrl());

    typeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        setTypeUI(btn.dataset.type);

        if (btn.classList.contains('search-type-menu__item')) {
          closeMenu();
        }
      });
    });
  }

  if (currentBtn && menu) {
    currentBtn.addEventListener('click', () => {
      const expanded = currentBtn.getAttribute('aria-expanded') === 'true';
      if (expanded) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    document.addEventListener('click', (e) => {
      if (!form.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    });
  }

  function getSiteBasePath() {
    const parts = window.location.pathname.split('/').filter(Boolean);

    if (window.location.hostname.endsWith('github.io') && parts.length > 0) {
      return `/${parts[0]}/`;
    }

    return '/';
  }

  form.addEventListener('submit', async (e) => {
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

    input.value = '';

    const basePath = getSiteBasePath();
    const nextUrl = `${basePath}${baseUrl}?${params.toString()}`;

    const pjaxNavigate = window.__mallinNavigate;

    if (typeof pjaxNavigate === 'function') {
      await pjaxNavigate(nextUrl, {
        replace: false,
        scrollToTop: true,
        preserveHash: true,
      });
      return;
    }

    window.location.href = nextUrl;
  });
}
