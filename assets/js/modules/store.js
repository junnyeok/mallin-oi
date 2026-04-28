let supabase;
let getCurrentUser;
let loginHref;
let STORE_ITEMS;
let getFeaturedStoreItems;
let getStoreItemById;
let getStoreItemDetailHref;
let getSkinParentRequirementByStoreItemId;

function getRuntimeVersion() {
  return encodeURIComponent(String(window.__SITE_VERSION__ || 'dev').trim());
}

function importVersioned(path) {
  return import(`${path}?v=${getRuntimeVersion()}`);
}

async function ensureStoreDeps() {
  if (
    supabase &&
    getCurrentUser &&
    loginHref &&
    STORE_ITEMS &&
    getFeaturedStoreItems &&
    getStoreItemById &&
    getStoreItemDetailHref
  ) {
    return;
  }

  const [supabaseModule, authStoreModule, storeDataModule] = await Promise.all([
    importVersioned('./supabase-client.js'),
    importVersioned('./auth-store.js'),
    importVersioned('./store-data.js'),
  ]);

  supabase = supabaseModule.supabase;
  getCurrentUser = authStoreModule.getCurrentUser;
  loginHref = authStoreModule.loginHref;
  STORE_ITEMS = storeDataModule.STORE_ITEMS;
  getFeaturedStoreItems = storeDataModule.getFeaturedStoreItems;
  getStoreItemById = storeDataModule.getStoreItemById;
  getStoreItemDetailHref = storeDataModule.getStoreItemDetailHref;
  getSkinParentRequirementByStoreItemId =
    storeDataModule.getSkinParentRequirementByStoreItemId;
}

const HOME_STORE_MOBILE_BREAKPOINT = 768;
const HOME_STORE_DESKTOP_VISIBLE = 5;
const HOME_STORE_MOBILE_VISIBLE = 1;
const HOME_STORE_AUTOPLAY_MS = 5000;
let storeItemPreviewAudio = null;
let storeItemPreviewCleanupController = null;
let storeItemPreviewHasControl = false;

const STORE_BGM_PREVIEW_EVENT = 'mallin:store-bgm-preview';
const BEFORE_PJAX_SWAP_EVENT = 'mallin:before-pjax-swap';

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function formatPrice(price) {
  return `${Number(price || 0).toLocaleString('ko-KR')} 🥒`;
}

function updateStoreItemBgmPreviewUi(isPlaying = false, itemName = 'BGM') {
  const btn = $('#storeItemBgmPreviewBtn');
  if (!btn) return;

  const statusEl = btn.querySelector('.store-item-preview__bgm-status');

  btn.classList.toggle('is-playing', isPlaying);
  btn.setAttribute('aria-pressed', isPlaying ? 'true' : 'false');
  btn.setAttribute(
    'aria-label',
    isPlaying ? `${itemName} 미리듣기 정지` : `${itemName} 미리듣기 재생`,
  );

  if (statusEl) {
    statusEl.textContent = isPlaying ? '재생 중' : '미리듣기';
  }
}

function notifyStoreItemBgmPreview(state) {
  if (state === 'start') {
    if (storeItemPreviewHasControl) return;
    storeItemPreviewHasControl = true;
  } else {
    if (!storeItemPreviewHasControl) return;
    storeItemPreviewHasControl = false;
  }

  window.dispatchEvent(
    new CustomEvent(STORE_BGM_PREVIEW_EVENT, {
      detail: { state },
    }),
  );
}

function destroyStoreItemBgmPreview({ resetTime = true } = {}) {
  if (storeItemPreviewCleanupController) {
    storeItemPreviewCleanupController.abort();
    storeItemPreviewCleanupController = null;
  }

  if (storeItemPreviewAudio) {
    try {
      storeItemPreviewAudio.pause();
    } catch (error) {
      console.warn('[store] bgm preview pause failed:', error);
    }

    if (resetTime) {
      try {
        storeItemPreviewAudio.currentTime = 0;
      } catch (error) {
        console.warn('[store] bgm preview currentTime reset failed:', error);
      }
    }

    try {
      storeItemPreviewAudio.removeAttribute('src');
      storeItemPreviewAudio.load();
    } catch (error) {
      console.warn('[store] bgm preview unload failed:', error);
    }

    storeItemPreviewAudio = null;
  }

  notifyStoreItemBgmPreview('stop');
  updateStoreItemBgmPreviewUi(false);
}

function bindStoreItemBgmPreview(item) {
  destroyStoreItemBgmPreview();

  const btn = $('#storeItemBgmPreviewBtn');
  const audioPath = String(item?.previewAudioPath || '').trim();

  if (!btn || item?.category !== 'bgm' || !audioPath) return;

  const audio = new Audio(audioPath);
  audio.preload = 'metadata';
  storeItemPreviewAudio = audio;
  storeItemPreviewHasControl = false;

  const cleanupController = new AbortController();
  const { signal } = cleanupController;
  storeItemPreviewCleanupController = cleanupController;

  const stopPreview = () => {
    destroyStoreItemBgmPreview();
  };

  audio.addEventListener('play', () => {
    updateStoreItemBgmPreviewUi(true, item.name);
  });

  audio.addEventListener('pause', () => {
    updateStoreItemBgmPreviewUi(false, item.name);
  });

  audio.addEventListener('ended', () => {
    try {
      audio.currentTime = 0;
    } catch (error) {
      console.warn('[store] bgm preview ended reset failed:', error);
    }

    notifyStoreItemBgmPreview('stop');
    updateStoreItemBgmPreviewUi(false, item.name);
  });

  btn.addEventListener(
    'click',
    async () => {
      if (!storeItemPreviewAudio) return;

      if (!audio.paused) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch (error) {
          console.warn('[store] bgm preview stop failed:', error);
        }

        notifyStoreItemBgmPreview('stop');
        updateStoreItemBgmPreviewUi(false, item.name);
        return;
      }

      notifyStoreItemBgmPreview('start');

      try {
        audio.currentTime = 0;
        await audio.play();
        updateStoreItemBgmPreviewUi(true, item.name);
      } catch (error) {
        console.error('[store] bgm preview play failed:', error);
        notifyStoreItemBgmPreview('stop');
        updateStoreItemBgmPreviewUi(false, item.name);
      }
    },
    { signal },
  );

  window.addEventListener('pagehide', stopPreview, { signal });
  window.addEventListener('beforeunload', stopPreview, { signal });
  window.addEventListener('popstate', stopPreview, { signal });
  window.addEventListener(BEFORE_PJAX_SWAP_EVENT, stopPreview, { signal });

  document.addEventListener(
    'visibilitychange',
    () => {
      if (document.visibilityState === 'hidden') {
        stopPreview();
      }
    },
    { signal },
  );
}

function getCategoryLabel(category) {
  if (category === 'emoticon') return '이모티콘';
  if (category === 'character') return '캐릭터';
  if (category === 'skin') return '스킨';
  if (category === 'bgm') return 'BGM';
  if (category === 'cha-effects') return '캐릭터효과';
  if (category === 'profile') return '프로필';
  return '기타';
}

function renderStoreThumb(item) {
  if (item.thumbImagePath) {
    if (item.category === 'bgm') {
      return `
        <div class="store-bgm-thumb" aria-hidden="true">
          <img
            class="store-bgm-thumb__image"
            src="${item.thumbImagePath}"
            alt="${item.name}"
            loading="lazy"
          />
        </div>
      `;
    }

    return `
      <img
        class="store-card__thumb-image"
        src="${item.thumbImagePath}"
        alt="${item.name}"
        loading="lazy"
      />
    `;
  }

  return item.icon || '';
}

function renderStoreCard(item, { compact = false } = {}) {
  const detailHref = getStoreItemDetailHref(item.id);
  const cardClassName = compact
    ? 'store-card store-card--compact'
    : 'store-card';

  return `
    <article class="${cardClassName}" id="item-${item.id}">
      <div class="store-card__thumb">${renderStoreThumb(item)}</div>
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

async function loadOwnedCharacterCodes() {
  const user = await getCurrentUser();
  if (!user?.id) return new Set();

  const { data, error } = await supabase
    .from('user_characters')
    .select('character_code')
    .eq('user_id', user.id);

  if (error) {
    console.error('[store] loadOwnedCharacterCodes error:', error);
    return new Set();
  }

  return new Set(
    (data || [])
      .map((row) => String(row?.character_code || '').trim())
      .filter(Boolean),
  );
}

async function loadMyEquippedCharacterImageUrl() {
  const user = await getCurrentUser();
  if (!user?.id) return './images/characters/cucumber.png';

  const { data, error } = await supabase
    .from('profiles')
    .select('equipped_character_image_url')
    .eq('id', user.id)
    .maybeSingle();

  if (error) {
    console.error('[store] load equipped character failed:', error);
    return './images/characters/cucumber.png';
  }

  return (
    String(data?.equipped_character_image_url || '').trim() ||
    './images/characters/cucumber.png'
  );
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
      '품목 페이지에서 품목 구매/지급을 진행할 수 있어.';
  }
}

function renderStoreItemPreview(item, options = {}) {
  const previews = Array.isArray(item?.previewImages) ? item.previewImages : [];
  const isLargePreview =
    item?.category === 'character' || item?.category === 'skin';
  const isBgmPreview = item?.category === 'bgm';
  const isCharacterEffectPreview = item?.category === 'cha-effects';

  if (isCharacterEffectPreview) {
    const preview = previews[0];
    const characterImagePath =
      String(options?.effectPreviewCharacterImage || '').trim() ||
      './images/characters/cucumber.png';

    const effectImagePath =
      String(preview?.imagePath || '').trim() ||
      './images/character-effects/cucumber-heart.png';

    return `
      <div class="store-item-preview__character-effect">
        <figure class="store-item-preview__character-effect-card">
          <span class="character-effect-wrap store-item-preview__effect-stage">
            <img
              src="${characterImagePath}"
              alt="현재 착용 캐릭터"
              class="store-item-preview__effect-character"
              loading="lazy"
            />
            <img
              class="character-effect-img character-effect-img--heart store-item-preview__effect-img"
              src="${effectImagePath}"
              alt=""
              aria-hidden="true"
            />
          </span>
        </figure>
        <p class="store-item-preview__effect-help">
          현재 착용 중인 캐릭터에 적용되는 모습을 미리 보여주는 거야.
        </p>
      </div>
    `;
  }

  if (!previews.length) {
    return `
      <div class="store-item-preview__empty">
        <div class="store-item-preview__icon">${item.icon}</div>
        <p>미리보기는 다음 단계에서 추가될 예정이야.</p>
      </div>
    `;
  }

  if (isBgmPreview) {
    const preview = previews[0];
    const hasPreviewAudio = !!String(item?.previewAudioPath || '').trim();

    return `
      <div class="store-item-preview__bgm">
        <div class="store-item-preview__bgm-box">
          <button
            type="button"
            class="store-item-preview__bgm-card ${hasPreviewAudio ? 'is-clickable' : 'is-disabled'}"
            id="storeItemBgmPreviewBtn"
            aria-pressed="false"
            aria-label="${item.name} 미리듣기 재생"
            ${hasPreviewAudio ? '' : 'disabled'}
          >
            <span class="store-item-preview__bgm-status">미리듣기</span>
            <img
              src="${preview.imagePath}"
              alt="${preview.label}"
              class="store-item-preview__bgm-img"
              loading="lazy"
            />
          </button>

          <p class="store-item-preview__bgm-help">
            ${
              hasPreviewAudio
                ? 'LP를 클릭하면 미리듣기가 재생돼.'
                : '이 BGM은 아직 미리듣기를 준비 중이야.'
            }
          </p>
        </div>
      </div>
    `;
  }

  if (isLargePreview) {
    const preview = previews[0];

    return `
      <div class="store-item-preview__character">
        <figure class="store-item-preview__character-card">
          <img
            src="${preview.imagePath}"
            alt="${preview.label}"
            class="store-item-preview__character-img"
            loading="lazy"
          />
        </figure>
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
    const skinRequirement =
      item.category === 'skin'
        ? getSkinParentRequirementByStoreItemId(item.id)
        : null;

    const [user, myPickles, ownedIds, ownedCharacterCodes] = await Promise.all([
      getCurrentUser(),
      loadMyPickles(),
      loadOwnedItemIds(),
      skinRequirement ? loadOwnedCharacterCodes() : Promise.resolve(new Set()),
    ]);

    const isLoggedIn = !!user?.id;
    const isOwned = ownedIds.has(item.id);
    const hasRequiredCharacter =
      !skinRequirement ||
      ownedCharacterCodes.has(
        String(skinRequirement.character_code || '').trim(),
      );
    const canPurchase = item.isPurchasable && !isOwned && hasRequiredCharacter;

    const requiredCharacterMessage =
      skinRequirement && !hasRequiredCharacter
        ? `${skinRequirement.character_name}를 먼저 구매해야 이 스킨을 구매할 수 있어.`
        : '';

    let actionLabel = '준비중';
    let actionDisabled = true;
    let resolvedMessage = message;

    if (!isLoggedIn) {
      actionLabel = '로그인 후 이용';
      actionDisabled = false;
    } else if (isOwned) {
      actionLabel = '지급 완료';
      actionDisabled = true;
    } else if (skinRequirement && !hasRequiredCharacter) {
      actionLabel = `${skinRequirement.character_name} 필요`;
      actionDisabled = true;
      resolvedMessage = resolvedMessage || requiredCharacterMessage;
    } else if (item.isPurchasable) {
      actionLabel = item.price === 0 ? '무료 받기' : '구매하기';
      actionDisabled = false;
    }

    destroyStoreItemBgmPreview();

    const effectPreviewCharacterImage =
      item.category === 'cha-effects'
        ? await loadMyEquippedCharacterImageUrl()
        : '';

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
            <h2 class="store-item-preview__title">구성 미리보기</h2>
${renderStoreItemPreview(item, { effectPreviewCharacterImage })}          </section>
        </div>

        <aside class="store-item-detail__side">
          <div class="store-item-buybox">
            <p class="store-item-buybox__label">가격</p>
            <p class="store-item-buybox__price">${formatPrice(item.price)}</p>
            <p class="store-item-buybox__label">내 보유 피클</p>
            <p class="store-item-buybox__balance">${formatPrice(myPickles)}</p>
            <button
              type="button"
              class="store-item-buybox__btn"
              id="storeItemBuyBtn"
              ${actionDisabled ? 'disabled' : ''}
            >
              ${actionLabel}
            </button>
            <p class="store-item-buybox__msg" id="storeItemBuyMsg">${resolvedMessage}</p>            <a class="store-item-buybox__back" href="./store.html">← 상점으로 돌아가기</a>
          </div>
        </aside>
      </div>
    `;

    if (item.category === 'bgm') {
      bindStoreItemBgmPreview(item);
    }

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

      if (item.category === 'bgm') {
        window.dispatchEvent(new Event('bgm-selection-changed'));
      }
    });
  }

  await renderDetail('');
}

export async function initStore() {
  await ensureStoreDeps();
  initHomeStoreSection();
  await initStorePage();
  await initStoreItemPage();
}
