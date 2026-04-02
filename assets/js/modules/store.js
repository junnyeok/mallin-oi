import { supabase } from './supabase-client.js';
import { getCurrentUser, loginHref } from './auth-store.js';
import {
  STORE_ITEMS,
  getFeaturedStoreItems,
  getStoreItemById,
  getStoreItemDetailHref,
} from './store-data.js';

const HOME_STORE_MOBILE_BREAKPOINT = 768;
const HOME_STORE_DESKTOP_VISIBLE = 5;
const HOME_STORE_MOBILE_VISIBLE = 1;
const HOME_STORE_AUTOPLAY_MS = 5000;

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function formatPrice(price) {
  return `${Number(price || 0).toLocaleString('ko-KR')} 🥒`;
}

function getCategoryLabel(category) {
  if (category === 'emoticon') return '이모티콘';
  if (category === 'fashion') return '꾸미기';
  if (category === 'profile') return '프로필';
  return '기타';
}

function renderStoreCard(item, { compact = false } = {}) {
  const detailHref = getStoreItemDetailHref(item.id);
  const cardClassName = compact
    ? 'store-card store-card--compact'
    : 'store-card';

  return `
    <article class="${cardClassName}" id="item-${item.id}">
      <div class="store-card__thumb" aria-hidden="true">${item.icon}</div>

      <div class="store-card__body">
        <div class="store-card__top">
          <span class="store-card__badge">${item.badge}</span>
          <span class="store-card__state">${item.state}</span>
        </div>

        <h3 class="store-card__title">${item.name}</h3>
        <p class="store-card__desc">${item.description}</p>

        <div class="store-card__meta">
          <span class="chip chip--muted">${getCategoryLabel(item.category)}</span>
          <span class="chip chip--muted">ID ${item.id}</span>
        </div>

        <p class="store-card__price">${formatPrice(item.price)}</p>

        <div class="store-card__actions">
          <a class="store-card__btn store-card__btn--primary" href="${detailHref}">
            보러가기
          </a>
        </div>
      </div>
    </article>
  `;
}

function initHomeStoreSection() {
  const trackEl = $('#storeFeaturedGrid');
  const viewportEl = $('#storeFeaturedViewport');
  const prevBtn = $('#storePrevBtn');
  const nextBtn = $('#storeNextBtn');
  const statusEl = $('#storeFeaturedStatus');

  if (!trackEl || !viewportEl || !prevBtn || !nextBtn || !statusEl) return;

  const items = getFeaturedStoreItems(15);
  trackEl.innerHTML = items
    .map((item) => renderStoreCard(item, { compact: true }))
    .join('');

  const cardEls = Array.from(trackEl.querySelectorAll('.store-card'));
  if (!cardEls.length) return;

  let visibleCount = getVisibleCount();
  let currentStep = 0;
  let autoTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;

  function getVisibleCount() {
    return window.innerWidth <= HOME_STORE_MOBILE_BREAKPOINT
      ? HOME_STORE_MOBILE_VISIBLE
      : HOME_STORE_DESKTOP_VISIBLE;
  }

  function getStepCount() {
    return Math.ceil(cardEls.length / visibleCount);
  }

  function getStartIndex(step = currentStep) {
    if (visibleCount === HOME_STORE_MOBILE_VISIBLE) {
      return step;
    }

    return step * visibleCount;
  }

  function updateStatus() {
    const stepCount = getStepCount();
    statusEl.textContent = `${currentStep + 1} / ${stepCount}`;
  }

  function updateButtons() {
    const disabled = getStepCount() <= 1;
    prevBtn.disabled = disabled;
    nextBtn.disabled = disabled;
  }

  function updateSlider({ animate = true } = {}) {
    const startIndex = getStartIndex();
    const targetCard = cardEls[startIndex] || cardEls[0];

    trackEl.style.transition = animate ? 'transform 0.45s ease' : 'none';
    trackEl.style.transform = `translate3d(-${targetCard.offsetLeft}px, 0, 0)`;

    updateStatus();
    updateButtons();
  }

  function startAutoPlay() {
    clearInterval(autoTimer);

    if (getStepCount() <= 1) return;

    autoTimer = window.setInterval(() => {
      goToStep(currentStep + 1, { resetTimer: false });
    }, HOME_STORE_AUTOPLAY_MS);
  }

  function stopAutoPlay() {
    clearInterval(autoTimer);
  }

  function goToStep(step, { animate = true, resetTimer = true } = {}) {
    const stepCount = getStepCount();
    currentStep = (step + stepCount) % stepCount;
    updateSlider({ animate });

    if (resetTimer) startAutoPlay();
  }

  function handleResize() {
    const previousVisibleCount = visibleCount;
    const previousStartIndex = getStartIndex();

    visibleCount = getVisibleCount();

    if (previousVisibleCount !== visibleCount) {
      currentStep =
        visibleCount === HOME_STORE_MOBILE_VISIBLE
          ? Math.min(previousStartIndex, cardEls.length - 1)
          : Math.floor(previousStartIndex / visibleCount);
    }

    updateSlider({ animate: false });
    startAutoPlay();
  }

  prevBtn.addEventListener('click', () => goToStep(currentStep - 1));
  nextBtn.addEventListener('click', () => goToStep(currentStep + 1));

  viewportEl.addEventListener('mouseenter', stopAutoPlay);
  viewportEl.addEventListener('mouseleave', startAutoPlay);

  viewportEl.addEventListener(
    'touchstart',
    (event) => {
      const touch = event.changedTouches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;
    },
    { passive: true },
  );

  viewportEl.addEventListener(
    'touchend',
    (event) => {
      if (visibleCount !== HOME_STORE_MOBILE_VISIBLE) return;

      const touch = event.changedTouches[0];
      const diffX = touch.clientX - touchStartX;
      const diffY = touch.clientY - touchStartY;

      if (Math.abs(diffX) < 45 || Math.abs(diffX) <= Math.abs(diffY)) return;
      if (diffX < 0) goToStep(currentStep + 1);
      else goToStep(currentStep - 1);
    },
    { passive: true },
  );

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopAutoPlay();
      return;
    }
    startAutoPlay();
  });

  window.addEventListener('resize', handleResize);

  updateSlider({ animate: false });
  startAutoPlay();
}

async function loadMyPickles() {
  const user = await getCurrentUser();
  if (!user?.id) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('pickles')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[store] loadMyPickles error:', error);
    return null;
  }

  return Number(data?.pickles || 0);
}

async function loadOwnedItemIds() {
  const user = await getCurrentUser();
  if (!user?.id) return new Set();

  const { data, error } = await supabase
    .from('user_store_items')
    .select('item_id')
    .eq('user_id', user.id);

  if (error) {
    console.error('[store] loadOwnedItemIds error:', error);
    return new Set();
  }

  return new Set((data || []).map((row) => String(row.item_id || '').trim()));
}

function bindStoreFilter(renderByCategory) {
  const buttons = $all('[data-store-filter]');
  if (!buttons.length) return;

  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const nextCategory = button.dataset.storeFilter || 'all';

      buttons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      renderByCategory(nextCategory);
    });
  });
}

async function initStorePage() {
  const gridEl = $('#storeGrid');
  if (!gridEl) return;

  const emptyEl = $('#storeEmpty');
  const balanceValueEl = $('#storeBalanceValue');
  const balanceHintEl = $('#storeBalanceHint');

  function render(category = 'all') {
    const filtered =
      category === 'all'
        ? STORE_ITEMS
        : STORE_ITEMS.filter((item) => item.category === category);

    gridEl.innerHTML = filtered.map((item) => renderStoreCard(item)).join('');
    if (emptyEl) emptyEl.hidden = filtered.length > 0;
  }

  bindStoreFilter(render);
  render('all');

  const myPickles = await loadMyPickles();

  if (myPickles === null) {
    if (balanceValueEl) balanceValueEl.textContent = '로그인 필요';
    if (balanceHintEl) {
      balanceHintEl.innerHTML = `로그인 후 피클 확인 가능 · <a href="${loginHref()}">로그인하러 가기</a>`;
    }
    return;
  }

  if (balanceValueEl) {
    balanceValueEl.textContent = `${myPickles.toLocaleString('ko-KR')} 🥒`;
  }

  if (balanceHintEl) {
    balanceHintEl.textContent =
      '상세 페이지에서 품목 구매/지급을 진행할 수 있어.';
  }
}

function renderStoreItemPreview(item) {
  const previews = Array.isArray(item?.previewImages) ? item.previewImages : [];

  if (!previews.length) {
    return `
      <div class="store-item-preview__empty">
        <div class="store-item-preview__icon">${item.icon}</div>
        <p>미리보기는 다음 단계에서 추가될 예정이야.</p>
      </div>
    `;
  }

  return `
    <div class="store-item-preview__grid">
      ${previews
        .map(
          (preview) => `
            <figure class="store-item-preview__card">
              <img
                src="${preview.imagePath}"
                alt="${preview.label}"
                class="store-item-preview__img"
                loading="lazy"
              />
            </figure>
          `,
        )
        .join('')}
    </div>
  `;
}

async function initStoreItemPage() {
  const root = $('#storeItemDetail');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('id') || 'emo-basic-01';
  const item = getStoreItemById(itemId) || getStoreItemById('emo-basic-01');

  if (!item) {
    root.innerHTML = `
      <div class="store-item-detail">
        <div class="store-item-detail__main">
          <p class="store-item-detail__desc">품목 정보를 찾지 못했어.</p>
        </div>
      </div>
    `;
    return;
  }

  async function renderDetail(message = '') {
    const [user, myPickles, ownedIds] = await Promise.all([
      getCurrentUser(),
      loadMyPickles(),
      loadOwnedItemIds(),
    ]);

    const isLoggedIn = !!user?.id;
    const isOwned = ownedIds.has(item.id);
    const canPurchase = item.isPurchasable && !isOwned;

    let actionLabel = '준비중';
    let actionDisabled = true;

    if (!isLoggedIn) {
      actionLabel = '로그인 후 이용';
      actionDisabled = false;
    } else if (isOwned) {
      actionLabel = '지급 완료';
      actionDisabled = true;
    } else if (item.isPurchasable) {
      actionLabel = item.price === 0 ? '무료 받기' : '구매하기';
      actionDisabled = false;
    }

    root.innerHTML = `
      <div class="store-item-detail">
        <div class="store-item-detail__main">
          <div class="store-item-detail__meta">
            <span class="store-card__badge">${item.badge}</span>
            <span class="store-card__state">${item.state}</span>
          </div>

          <h1 class="store-item-detail__title">${item.name}</h1>
          <p class="store-item-detail__desc">${item.detailDescription}</p>

          <div class="store-item-detail__chips">
            <span class="store-chip">${getCategoryLabel(item.category)}</span>
            <span class="store-chip">ID ${item.id}</span>
          </div>

          <section class="store-item-preview">
            <div class="store-item-preview__head">
              <h2>구성 미리보기</h2>
            </div>
            ${renderStoreItemPreview(item)}
          </section>
        </div>

        <aside class="store-item-detail__side">
          <div class="store-item-purchase">
            <p class="store-item-purchase__label">가격</p>
            <p class="store-item-purchase__price">${formatPrice(item.price)}</p>

            <p class="store-item-purchase__label">내 보유 피클</p>
            <p class="store-item-purchase__balance">
              ${myPickles === null ? '로그인 필요' : `${myPickles.toLocaleString('ko-KR')} 🥒`}
            </p>

            <button
              type="button"
              class="store-item-purchase__btn"
              id="storeItemBuyBtn"
              ${actionDisabled ? 'disabled' : ''}
            >
              ${actionLabel}
            </button>

            <p class="store-item-purchase__msg" id="storeItemBuyMsg">
              ${
                message ||
                (isOwned
                  ? '이미 지급받은 품목이야.'
                  : item.isPurchasable
                    ? '무료 지급 테스트용 품목이야.'
                    : '이 품목은 아직 판매 준비중이야.')
              }
            </p>

            <a class="store-item-purchase__back" href="./store.html">← 상점으로 돌아가기</a>
          </div>
        </aside>
      </div>
    `;

    const buyBtn = $('#storeItemBuyBtn');
    const msgEl = $('#storeItemBuyMsg');

    if (!buyBtn) return;

    buyBtn.addEventListener('click', async () => {
      if (!isLoggedIn) {
        window.location.href = loginHref();
        return;
      }

      if (!canPurchase) return;

      buyBtn.disabled = true;
      if (msgEl) msgEl.textContent = '지급 처리 중...';

      const { data, error } = await supabase.rpc('purchase_store_item', {
        p_item_id: item.id,
      });

      if (error) {
        console.error('[store] purchase_store_item failed:', error);
        if (msgEl) msgEl.textContent = '지급 처리에 실패했어. 다시 시도해줘.';
        buyBtn.disabled = false;
        return;
      }

      const row = Array.isArray(data) ? data[0] : data;
      const nextMessage =
        String(row?.message || '').trim() || '지급이 완료됐어.';

      await renderDetail(nextMessage);
    });
  }

  await renderDetail('');
}

export async function initStore() {
  initHomeStoreSection();
  await initStorePage();
  await initStoreItemPage();
}
