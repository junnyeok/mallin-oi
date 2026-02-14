// assets/js/modules/search-nav.js
export function initSearchNav({
  baseUrl = './posts-all.html',
  formSelector = '#searchForm',
  inputSelector = '#q',
  typeBtnSelector = '[data-type]', // 제목/태그 토글 버튼
} = {}) {
  const page = document.body?.dataset?.page || 'home';

  // ✅ posts-all 페이지는 posts-all.js가 처리하니까 여기서는 아무것도 안 함(충돌 방지)
  if (page === 'posts-all') return;

  const form =
    document.querySelector(formSelector) ||
    document.querySelector('form.search');
  const input =
    document.querySelector(inputSelector) ||
    document.querySelector('input[name="q"]');
  if (!form || !input) return;

  const typeBtns = Array.from(document.querySelectorAll(typeBtnSelector));

  // --- 현재 페이지 -> tab 값으로 변환 ---
  function getTabFromPage() {
    const p = String(page).trim().toLowerCase();
    if (p === 'home') return 'all';
    if (p === 'study') return 'study';
    if (p === 'work') return 'work';
    if (p === 'event') return 'event';
    if (p === 'career') return 'career';
    return 'all';
  }

  // --- 토글 상태 읽기(aria-pressed 우선) ---
  function getType() {
    const pressed = typeBtns.find(
      (b) => b.getAttribute('aria-pressed') === 'true'
    );
    const t = (pressed?.dataset?.type || 'title').toLowerCase();
    return t === 'tag' ? 'tag' : 'title';
  }

  // --- 토글 UI 세팅(클릭 시 제목/태그 전환) ---
  function setTypeUI(type) {
    typeBtns.forEach((b) => {
      const active = (b.dataset.type || '').toLowerCase() === type;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-pressed', String(active));
    });
  }

  // 초기 토글 UI 보정(HTML이 틀려도 한번 정리)
  if (typeBtns.length) {
    // aria-pressed="true"가 하나도 없으면 title을 true로
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

  // --- submit: posts-all로 이동 + 쿼리 구성 ---
  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const q = (input.value || '').trim();
    const tab = getTabFromPage();
    const type = getType();

    const url = new URL(baseUrl, window.location.origin);
    url.searchParams.set('tab', tab);

    if (type === 'tag') url.searchParams.set('type', 'tag'); // title은 기본값이라 생략 가능
    if (q) url.searchParams.set('q', q);

    window.location.href = url.pathname + url.search;
  });
}
