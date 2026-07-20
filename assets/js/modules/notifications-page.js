import { getCurrentUser, loginHref, saveRedirect } from './auth-store.js';
import {
  adjustNotificationBadge,
  closeNotificationPanel,
  escapeNotificationHtml,
  fetchNotificationItems,
  getNotificationPresentation,
  markNotificationsRead,
  refreshNotifications,
} from './notifications.js';

const PAGE_SIZE = 5;
const PAGINATION_WINDOW = 5;
const pageStates = new WeakMap();
let lifecycleEventsBound = false;

function isModifiedEvent(event) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function isActiveState(state) {
  return (
    state.root.isConnected &&
    pageStates.get(state.root) === state &&
    document.body?.dataset?.page === 'notifications'
  );
}

function getActiveState() {
  const root = document.querySelector('[data-notifications-page]');
  return root ? pageStates.get(root) : null;
}

function setSectionStatus(
  section,
  text,
  { hidden = false, isError = false } = {},
) {
  section.status.textContent = text;
  section.status.hidden = hidden;
  section.status.classList.toggle('is-error', isError);
}

function renderPageState(section, { message, type = '' }) {
  section.list.innerHTML = `
    <div class="notifications-page-state${
      type ? ` notifications-page-state--${type}` : ''
    }" role="${type === 'error' ? 'alert' : 'status'}">
      ${escapeNotificationHtml(message)}
    </div>
  `;
}

function renderNotificationItem(item) {
  const notification = getNotificationPresentation(item);
  const unreadClass = notification.isRead ? '' : ' is-unread';
  const unreadBadge = notification.isRead
    ? ''
    : '<span class="notifications-list__state" data-notification-state>안 읽음</span>';
  const actorNickname = notification.actorNickname || '익명';

  return `
    <a
      class="notifications-list__item${unreadClass}"
      data-notification-id="${escapeNotificationHtml(notification.id)}"
      href="${escapeNotificationHtml(notification.href)}"
    >
      <span class="notifications-list__icon" aria-hidden="true">${escapeNotificationHtml(
        notification.icon,
      )}</span>
      <div class="notifications-list__content">
        <div class="notifications-list__meta">
          <span class="notifications-list__type">${escapeNotificationHtml(
            notification.label,
          )}</span>
          ${unreadBadge}
        </div>
        <h3 class="notifications-list__title">${escapeNotificationHtml(
          notification.title,
        )}</h3>
        <p class="notifications-list__message">${notification.messageHtml}</p>
        <div class="notifications-list__details">
          <span class="notifications-list__actor">관련 이용자 <strong>${escapeNotificationHtml(
            actorNickname,
          )}</strong></span>
          <time datetime="${escapeNotificationHtml(
            notification.createdAt,
          )}">${escapeNotificationHtml(notification.dateText)}</time>
        </div>
      </div>
      <span class="notifications-list__arrow" aria-hidden="true">›</span>
    </a>
  `;
}

function setRenderedItemRead(item) {
  if (!item) return;
  item.classList.remove('is-unread');
  item.querySelector('[data-notification-state]')?.remove();
}

function updateRenderedReadState(state, ids = []) {
  const idSet = new Set(
    ids.map((id) => String(id || '').trim()).filter(Boolean),
  );
  if (!idSet.size || !isActiveState(state)) return;

  state.root.querySelectorAll('[data-notification-id]').forEach((item) => {
    if (idSet.has(String(item.dataset.notificationId || '').trim())) {
      setRenderedItemRead(item);
    }
  });
}

function navigateTo(href) {
  closeNotificationPanel();

  if (typeof window.__mallinNavigate === 'function') {
    window.__mallinNavigate(href, {
      replace: false,
      scrollToTop: true,
      preserveHash: true,
    });
    return;
  }

  window.location.href = href;
}

function getTotalPages(total) {
  return total > 0 ? Math.ceil(total / PAGE_SIZE) : 0;
}

function syncBusyState(state) {
  const sectionLoading = Object.values(state.sections).some(
    (section) => section.loading,
  );
  const busy = state.refreshing || sectionLoading;

  state.root.setAttribute('aria-busy', String(busy));
  state.refreshButton.disabled = busy;
}

function renderPagination(section) {
  const totalPages = getTotalPages(section.total);

  if (!totalPages) {
    section.pagination.hidden = true;
    section.pagination.innerHTML = '';
    return;
  }

  const blockStart =
    Math.floor((section.page - 1) / PAGINATION_WINDOW) * PAGINATION_WINDOW + 1;
  const blockEnd = Math.min(blockStart + PAGINATION_WINDOW - 1, totalPages);
  const buttons = [];
  const previousDisabled = section.loading || section.page <= 1;
  const nextDisabled = section.loading || section.page >= totalPages;

  buttons.push(`
    <button
      class="notifications-pagination__button"
      type="button"
      data-notifications-page-number="${section.page - 1}"
      aria-label="이전 페이지"
      ${previousDisabled ? 'disabled' : ''}
    >이전</button>
  `);

  for (let page = blockStart; page <= blockEnd; page += 1) {
    const isCurrent = page === section.page;
    buttons.push(`
      <button
        class="notifications-pagination__button"
        type="button"
        data-notifications-page-number="${page}"
        aria-label="${page}페이지"
        ${isCurrent ? 'aria-current="page"' : ''}
        ${section.loading ? 'disabled' : ''}
      >${page}</button>
    `);
  }

  buttons.push(`
    <button
      class="notifications-pagination__button"
      type="button"
      data-notifications-page-number="${section.page + 1}"
      aria-label="다음 페이지"
      ${nextDisabled ? 'disabled' : ''}
    >다음</button>
  `);

  section.pagination.innerHTML = `
    <div class="notifications-pagination__controls">
      ${buttons.join('')}
    </div>
  `;
  section.pagination.hidden = false;
}

async function fetchSectionPage(state, section, requestedPage, requestId) {
  const firstPage = Math.max(1, Number(requestedPage) || 1);
  const firstOffset = (firstPage - 1) * PAGE_SIZE;

  let result = await fetchNotificationItems({
    userId: state.userId,
    offset: firstOffset,
    limit: PAGE_SIZE,
    includeCount: true,
    unreadOnly: section.unreadOnly,
  });

  if (!isActiveState(state) || section.requestId !== requestId) return null;

  const totalPages = getTotalPages(result.count);
  const validPage = totalPages ? Math.min(firstPage, totalPages) : 1;

  if (validPage !== firstPage) {
    result = await fetchNotificationItems({
      userId: state.userId,
      offset: (validPage - 1) * PAGE_SIZE,
      limit: PAGE_SIZE,
      includeCount: true,
      unreadOnly: section.unreadOnly,
    });
  }

  if (!isActiveState(state) || section.requestId !== requestId) return null;

  return { page: validPage, result };
}

async function loadSection(
  state,
  sectionKey,
  { force = false, page, scroll = false } = {},
) {
  const section = state.sections[sectionKey];
  if (!section || !isActiveState(state)) return false;
  if (section.loading && !force) return false;

  const requestedPage = Math.max(1, Number(page ?? section.page) || 1);
  const requestId = section.requestId + 1;
  section.requestId = requestId;
  section.loading = true;
  section.root.setAttribute('aria-busy', 'true');
  setSectionStatus(section, `${section.loadingLabel} 불러오는 중이야.`);

  if (!section.hasRendered) {
    renderPageState(section, {
      message: `${section.loadingLabel} 확인하는 중이야.`,
      type: 'loading',
    });
  }

  renderPagination(section);
  syncBusyState(state);

  let succeeded = false;

  try {
    const response = await fetchSectionPage(
      state,
      section,
      requestedPage,
      requestId,
    );
    if (!response) return false;

    const { page: validPage, result } = response;
    section.page = validPage;
    section.total = result.count;
    section.hasRendered = true;

    if (result.items.length) {
      section.list.innerHTML = result.items
        .map(renderNotificationItem)
        .join('');
    } else {
      renderPageState(section, {
        message: section.emptyMessage,
        type: 'empty',
      });
    }

    const totalPages = getTotalPages(section.total);
    if (section.total) {
      setSectionStatus(
        section,
        `${section.countLabel} ${section.total}개 · ${section.page}/${totalPages}페이지`,
      );
    } else {
      setSectionStatus(section, '', { hidden: true });
    }
    succeeded = true;
  } catch (error) {
    console.error(`[notifications-page] ${sectionKey} fetch failed:`, error);
    if (!isActiveState(state) || section.requestId !== requestId) return false;

    if (!section.hasRendered) {
      renderPageState(section, {
        message: `${section.loadingLabel} 불러오지 못했어.`,
        type: 'error',
      });
    }

    setSectionStatus(section, '알림을 불러오지 못했어. 다시 시도해줘.', {
      isError: true,
    });
  } finally {
    if (isActiveState(state) && section.requestId === requestId) {
      section.loading = false;
      section.root.setAttribute('aria-busy', 'false');
      renderPagination(section);
      syncBusyState(state);
    }
  }

  if (succeeded && scroll && isActiveState(state)) {
    section.header.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return succeeded;
}

async function refreshPage(state) {
  if (!isActiveState(state) || state.refreshing) return;
  if (Object.values(state.sections).some((section) => section.loading)) return;

  state.refreshing = true;
  state.refreshButton.textContent = '새로고침 중...';
  syncBusyState(state);

  try {
    await Promise.allSettled([
      loadSection(state, 'unread', { force: true, page: 1 }),
      loadSection(state, 'all', { force: true, page: 1 }),
      refreshNotifications({ keepPanelOpen: false }),
    ]);
  } finally {
    if (isActiveState(state)) {
      state.refreshing = false;
      state.refreshButton.textContent = '새로고침';
      syncBusyState(state);
    }
  }
}

async function markItemRead(state, item) {
  const id = String(item.dataset.notificationId || '').trim();
  if (!id || !item.classList.contains('is-unread')) return true;
  if (state.readingIds.has(id)) return false;

  state.readingIds.add(id);

  try {
    const succeeded = await markNotificationsRead([id], state.userId);
    if (!succeeded) return false;

    if (isActiveState(state)) {
      adjustNotificationBadge(-1);
      await loadSection(state, 'unread', {
        force: true,
        page: state.sections.unread.page,
      });
    }

    refreshNotifications({ keepPanelOpen: false }).catch((error) => {
      console.error('[notifications-page] popup refresh failed:', error);
    });

    return true;
  } finally {
    state.readingIds.delete(id);
  }
}

function bindSectionPagination(state, sectionKey) {
  const section = state.sections[sectionKey];

  section.pagination.addEventListener('click', (event) => {
    const button = event.target.closest('[data-notifications-page-number]');
    if (!button || button.disabled || section.loading) return;

    const nextPage = Number(button.dataset.notificationsPageNumber || 0);
    const totalPages = getTotalPages(section.total);
    if (
      !Number.isInteger(nextPage) ||
      nextPage < 1 ||
      nextPage > totalPages ||
      nextPage === section.page
    ) {
      return;
    }

    loadSection(state, sectionKey, { page: nextPage, scroll: true });
  });
}

function bindPageEvents(state) {
  state.refreshButton.addEventListener('click', () => {
    refreshPage(state);
  });

  bindSectionPagination(state, 'unread');
  bindSectionPagination(state, 'all');

  state.root.addEventListener('click', async (event) => {
    const item = event.target.closest('.notifications-list__item[href]');
    if (!item || !state.root.contains(item)) return;
    if (!item.classList.contains('is-unread')) return;

    if (isModifiedEvent(event) || event.button !== 0) {
      markItemRead(state, item);
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (state.navigationPending) return;
    state.navigationPending = true;

    const href = item.getAttribute('href');
    await markItemRead(state, item);

    if (href && isActiveState(state)) {
      navigateTo(href);
      return;
    }

    state.navigationPending = false;
  });
}

function bindLifecycleEvents() {
  if (lifecycleEventsBound) return;
  lifecycleEventsBound = true;

  window.addEventListener('mallin:notifications-read', (event) => {
    const state = getActiveState();
    if (!state) return;

    const ids = (event.detail?.ids || []).map((id) => String(id || '').trim());
    updateRenderedReadState(state, ids);

    const hasExternalRead = ids.some((id) => !state.readingIds.has(id));
    if (hasExternalRead) {
      loadSection(state, 'unread', {
        force: true,
        page: state.sections.unread.page,
      });
    }
  });

  window.addEventListener('auth-changed', async () => {
    const state = getActiveState();
    if (!state) return;

    const user = await getCurrentUser();
    if (!isActiveState(state)) return;

    if (!user) {
      saveRedirect(
        `${window.location.pathname}${window.location.search}${window.location.hash}`,
      );
      window.location.href = loginHref();
      return;
    }

    const nextUserId = String(user.id || '').trim();
    if (!nextUserId || nextUserId === state.userId) return;

    state.userId = nextUserId;
    state.sections.unread.hasRendered = false;
    state.sections.all.hasRendered = false;
    await Promise.all([
      loadSection(state, 'unread', { force: true, page: 1 }),
      loadSection(state, 'all', { force: true, page: 1 }),
    ]);
  });
}

function getSectionElements(key) {
  const prefix = key === 'unread' ? 'notificationsUnread' : 'notificationsAll';
  const root = document.querySelector(`[data-notification-section="${key}"]`);
  const header = root?.querySelector('.notifications-section__header');
  const list = document.getElementById(`${prefix}List`);
  const pagination = document.getElementById(`${prefix}Pagination`);
  const status = document.getElementById(`${prefix}Status`);

  if (!root || !header || !list || !pagination || !status) return null;
  return { header, list, pagination, root, status };
}

export async function initNotificationsPage() {
  if (document.body?.dataset?.page !== 'notifications') return;

  const root = document.querySelector('[data-notifications-page]');
  const refreshButton = document.getElementById('notificationsPageRefreshBtn');
  const unreadElements = getSectionElements('unread');
  const allElements = getSectionElements('all');

  if (!root || !refreshButton || !unreadElements || !allElements) return;
  if (root.dataset.notificationsPageBound === 'true') return;

  root.dataset.notificationsPageBound = 'true';
  bindLifecycleEvents();

  const user = await getCurrentUser();

  if (!root.isConnected || document.body?.dataset?.page !== 'notifications') {
    return;
  }

  if (!user) {
    saveRedirect(
      `${window.location.pathname}${window.location.search}${window.location.hash}`,
    );
    window.location.href = loginHref();
    return;
  }

  const state = {
    navigationPending: false,
    readingIds: new Set(),
    refreshButton,
    refreshing: false,
    root,
    sections: {
      unread: {
        ...unreadElements,
        countLabel: '확인하지 않은 알림',
        emptyMessage: '확인하지 않은 알림이 없어.',
        hasRendered: false,
        loading: false,
        loadingLabel: '확인하지 않은 알림을',
        page: 1,
        requestId: 0,
        total: 0,
        unreadOnly: true,
      },
      all: {
        ...allElements,
        countLabel: '전체 알림',
        emptyMessage: '아직 알림이 없어.',
        hasRendered: false,
        loading: false,
        loadingLabel: '전체 알림을',
        page: 1,
        requestId: 0,
        total: 0,
        unreadOnly: false,
      },
    },
    userId: String(user.id || '').trim(),
  };

  pageStates.set(root, state);
  bindPageEvents(state);

  await Promise.all([
    loadSection(state, 'unread', { page: 1 }),
    loadSection(state, 'all', { page: 1 }),
  ]);
}
