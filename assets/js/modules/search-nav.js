// assets/js/modules/search-nav.js
export function initSearchNav({
  baseUrl = 'posts-all.html', // 이제 ./ 제거 (우리가 basePath를 붙일 거라서)
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

  // ✅ GitHub Pages에서 "레포 이름 경로(/mallin-oi/)"를 자동으로 잡는 함수
  function getSiteBasePath() {
    // 예) /mallin-oi/posts/p001.html  -> /mallin-oi/
    // 예) /posts/p001.html (유저사이트) -> /
    const parts = window.location.pathname.split('/').filter(Boolean);

    // github.io에서 프로젝트 페이지면 첫 번째 조각이 repo명
    if (window.location.hostname.endsWith('github.io') && parts.length > 0) {
      return `/${parts[0]}/`;
    }

    // 그 외(커스텀 도메인/유저사이트)는 루트
    return '/';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const q = (input.value || '').trim();
    const tab = getTabFromPage();
    const type = getType();

    const params = new URLSearchParams();
    params.set('tab', tab);
    if (type === 'tag') params.set('type', 'tag');
    if (q) params.set('q', q);

    const basePath = getSiteBasePath(); // ✅ /mallin-oi/ 자동
    window.location.href = `${basePath}${baseUrl}?${params.toString()}`;
  });
}
