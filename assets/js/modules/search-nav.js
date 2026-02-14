// assets/js/modules/search-nav.js
export function initSearchNav({
  baseUrl = './posts-all.html',
  formSelector = '#searchForm',
  inputSelector = '#q',
  typeBtnSelector = '[data-type]',
} = {}) {
  const page = document.body?.dataset?.page || 'home';

  if (page === 'posts-all') return;

  const form =
    document.querySelector(formSelector) ||
    document.querySelector('form.search');

  const input =
    document.querySelector(inputSelector) ||
    document.querySelector('input[name="q"]');

  if (!form || !input) return;

  const typeBtns = Array.from(document.querySelectorAll(typeBtnSelector));

  function getTabFromPage() {
    const p = String(page).trim().toLowerCase();
    if (p === 'home') return 'all';
    if (p === 'study') return 'study';
    if (p === 'work') return 'work';
    if (p === 'event') return 'event';
    if (p === 'career') return 'career';
    return 'all';
  }

  function getType() {
    const pressed = typeBtns.find(
      (b) => b.getAttribute('aria-pressed') === 'true'
    );
    const t = (pressed?.dataset?.type || 'title').toLowerCase();
    return t === 'tag' ? 'tag' : 'title';
  }

  function setTypeUI(type) {
    typeBtns.forEach((b) => {
      const active = (b.dataset.type || '').toLowerCase() === type;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  if (typeBtns.length) {
    const anyPressed = typeBtns.some(
      (b) => b.getAttribute('aria-pressed') === 'true'
    );
    if (!anyPressed) setTypeUI('title');

    typeBtns.forEach((b) => {
      b.addEventListener('click', () => {
        const t =
          ((b.dataset.type || 'title') + '').toLowerCase() === 'tag'
            ? 'tag'
            : 'title';
        setTypeUI(t);
      });
    });
  }

  // ✅ 여기 핵심 수정
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const q = (input.value || '').trim();
    const tab = getTabFromPage();
    const type = getType();

    const params = new URLSearchParams();
    params.set('tab', tab);
    if (type === 'tag') params.set('type', 'tag');
    if (q) params.set('q', q);

    // 🔥 상대경로만 사용
    window.location.href = `${baseUrl}?${params.toString()}`;
  });
}
