// Shared category ordering for the website and Capacitor calendars.
const controllers = new WeakMap();

export function orderCategories(categories, ids) {
  const byId = new Map(categories.map((category) => [String(category.id), category]));
  if (ids.length !== byId.size || new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id))) {
    throw new Error('카테고리 목록이 변경됐어요. 다시 열어 주세요.');
  }
  return ids.map((id, index) => ({ ...byId.get(id), sort_order: (index + 1) * 10 }));
}

export function nextCategorySortOrder(categories) {
  return Math.max(0, ...categories.map((category) => Number(category.sort_order) || 0)) + 10;
}

export async function persistCategoryOrder({ client, table, userId, categories, ids }) {
  if (!userId) throw new Error('로그인이 필요해요.');
  const ordered = orderCategories(categories, ids);
  const previous = new Map(categories.map((category) => [String(category.id), category]));
  const applied = [];
  async function write(id, from, to) {
    const { data, error } = await client.from(table)
      .update({ sort_order: to }).eq('user_id', userId).eq('id', id)
      .eq('sort_order', from).select('id');
    if (error) throw error;
    if (data?.length !== 1) throw new Error('다른 곳에서 카테고리가 변경됐어요.');
  }
  try {
    for (const category of ordered) {
      const oldOrder = previous.get(String(category.id)).sort_order;
      if (oldOrder === category.sort_order) continue;
      await write(category.id, oldOrder, category.sort_order);
      applied.push({ id: category.id, oldOrder, newOrder: category.sort_order });
    }
  } catch (error) {
    // Only restore our own successful rank writes; never overwrite concurrent edits.
    for (const change of applied.reverse()) {
      try { await write(change.id, change.newOrder, change.oldOrder); }
      catch { /* The caller reloads the server order after a failed save. */ }
    }
    throw error;
  }
  return ordered;
}

export function resetCategoryReorder(root) {
  controllers.get(root)?.destroy();
}

function lockDragScroll(root) {
  const snapshots = [];
  const documentRef = root.ownerDocument;
  const windowRef = documentRef.defaultView;
  let scrollTarget = null;
  for (let element = root; element; element = element.parentElement) {
    const properties = ['overflow', 'overflow-anchor', 'overscroll-behavior', 'scroll-behavior', 'scrollbar-gutter'];
    const snapshot = {
      element, top: element.scrollTop, left: element.scrollLeft,
      styles: properties.map((name) => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]),
    };
    snapshots.push(snapshot);
    // Only the nearest scrollable category container may move, never the page.
    if (!scrollTarget && element !== documentRef.body && element !== documentRef.documentElement &&
        element.scrollHeight > element.clientHeight &&
        /auto|scroll/.test(windowRef.getComputedStyle(element).overflowY)) {
      scrollTarget = snapshot;
    }
    element.style.setProperty('overflow-anchor', 'none');
    element.style.setProperty('overscroll-behavior', 'none');
    element.style.setProperty('scroll-behavior', 'auto');
    // Preserve layout for non-scrollable ancestors and reserve existing scrollbar space.
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
      element.style.setProperty('scrollbar-gutter', 'stable');
      element.style.setProperty('overflow', 'hidden');
    }
  }
  const hold = () => snapshots.forEach(({ element, top, left }) => {
    if (element.scrollTop !== top) element.scrollTop = top;
    if (element.scrollLeft !== left) element.scrollLeft = left;
  });
  return {
    hold,
    scrollAtEdge(pointerY, elapsedSeconds) {
      if (!scrollTarget) return;
      const { element } = scrollTarget;
      const rect = element.getBoundingClientRect();
      const top = Math.max(0, rect.top + element.clientTop);
      const bottom = Math.min(windowRef.innerHeight, rect.top + element.clientTop + element.clientHeight);
      const speed = getCategoryEdgeScrollSpeed(pointerY, top, bottom);
      if (!speed) return;
      const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.max(0, Math.min(maximum, scrollTarget.top + speed * elapsedSeconds));
      // The lock accepts this controlled movement and still rejects touch/anchor scrolling.
      scrollTarget.top = element.scrollTop;
    },
    restore() {
      hold();
      snapshots.forEach(({ element, styles }) => {
        styles.forEach(([name, value, priority]) => {
          if (value) element.style.setProperty(name, value, priority);
          else element.style.removeProperty(name);
        });
      });
    },
  };
}

export function getCategoryEdgeScrollSpeed(pointerY, top, bottom) {
  if (bottom <= top) return 0;
  const edge = Math.min(56, (bottom - top) / 4);
  const upper = (top + edge - pointerY) / edge;
  const lower = (pointerY - (bottom - edge)) / edge;
  if (upper > 0) return -(80 + 400 * Math.min(1, upper));
  if (lower > 0) return 80 + 400 * Math.min(1, lower);
  return 0;
}

function createDragPreview(row, documentRef) {
  const rect = row.getBoundingClientRect();
  const preview = row.cloneNode(true);
  preview.removeAttribute('id');
  preview.removeAttribute('data-category-order-id');
  preview.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  const inputs = row.querySelectorAll('input, textarea, select');
  preview.querySelectorAll('input, textarea, select').forEach((element, index) => {
    element.value = inputs[index].value;
    if ('checked' in element) element.checked = inputs[index].checked;
  });
  preview.classList.add('calendar-category-drag-preview');
  preview.setAttribute('aria-hidden', 'true');
  preview.inert = true;
  preview.style.left = `${rect.left}px`;
  preview.style.top = `${rect.top}px`;
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  documentRef.body.append(preview);
  return preview;
}

export function enableCategoryReorder({ root, categories, onReorder }) {
  if (!root || !onReorder) return;
  resetCategoryReorder(root);
  const documentRef = root.ownerDocument;
  const windowRef = documentRef.defaultView;
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const status = documentRef.createElement('p');
  status.className = 'calendar-category-order-status';
  status.setAttribute('role', 'status');
  status.textContent = '왼쪽 손잡이를 누른 채 위아래로 끌어 순서를 바꿔요.';
  root.after(status);
  let drag = null;
  let frame = null;
  let busy = false;
  let destroyed = false;
  const rows = () => Array.from(root.children).filter((row) => row.dataset.categoryOrderId);
  const ids = () => rows().map((row) => row.dataset.categoryOrderId);
  const restore = (order) => {
    const byId = new Map(rows().map((row) => [row.dataset.categoryOrderId, row]));
    order.forEach((id) => { if (byId.has(id)) root.append(byId.get(id)); });
  };
  const announcePosition = (row) => {
    status.textContent = `${row.dataset.categoryOrderName}, ${rows().indexOf(row) + 1}번째`;
  };

  Array.from(root.children).forEach((row, index) => {
    const category = categories[index];
    if (!category) return;
    row.dataset.categoryOrderId = String(category.id);
    row.dataset.categoryOrderName = category.name;
    row.classList.add('calendar-category-sortable');
    const handle = documentRef.createElement('button');
    handle.type = 'button';
    handle.className = 'calendar-category-handle';
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', `${category.name} 순서 이동`);
    handle.title = '누른 채 위아래로 이동 · 키보드 위/아래 방향키';
    handle.disabled = categories.length < 2;
    row.prepend(handle);
  });

  async function commit(before, focusHandle) {
    const order = ids();
    if (order.every((id, index) => id === before[index])) return;
    busy = true;
    root.inert = true;
    root.setAttribute('aria-busy', 'true');
    status.textContent = '순서를 저장하고 있어요…';
    try {
      await onReorder(order);
      if (!destroyed) status.textContent = '순서를 저장했어요.';
    } catch (error) {
      if (!destroyed) {
        restore(error.categoryOrder || before);
        status.textContent = '순서를 저장하지 못했어요. 연결을 확인한 뒤 다시 이동해 주세요.';
      }
    } finally {
      busy = false;
      root.inert = false;
      root.removeAttribute('aria-busy');
      if (!destroyed && focusHandle?.isConnected) focusHandle.focus({ preventScroll: true });
    }
  }

  function stop(cancel = false) {
    if (!drag) return;
    const current = drag;
    drag = null;
    windowRef.cancelAnimationFrame(frame);
    frame = null;
    current.preview.remove();
    current.row.classList.remove('is-category-placeholder');
    if (root.hasPointerCapture?.(current.pointerId)) root.releasePointerCapture(current.pointerId);
    if (cancel) {
      restore(current.before);
      status.textContent = '순서 이동을 취소했어요.';
    }
    current.scrollLock.restore();
    if (!cancel) {
      void commit(current.before, current.handle);
    }
  }

  function moveAtPointer() {
    if (!drag) return;
    drag.scrollLock.hold();
    drag.preview.style.transform = `translate3d(0, ${drag.y - drag.startY}px, 0)`;
    const siblings = rows().filter((row) => row !== drag.row);
    const next = siblings.find((row) => {
      const rect = row.getBoundingClientRect();
      return drag.y < rect.top + rect.height / 2;
    });
    if (drag.row.nextElementSibling !== (next || null)) {
      root.insertBefore(drag.row, next || null);
      drag.scrollLock.hold();
      announcePosition(drag.row);
    }
  }

  function tick(timestamp) {
    if (!drag) return;
    if (!root.isConnected || !root.getClientRects().length) { stop(true); return; }
    const elapsed = Math.min(32, Math.max(0, timestamp - (drag.lastFrame ?? timestamp - 16))) / 1000;
    drag.lastFrame = timestamp;
    drag.scrollLock.hold();
    drag.scrollLock.scrollAtEdge(drag.y, elapsed);
    moveAtPointer();
    frame = windowRef.requestAnimationFrame(tick);
  }

  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest('.calendar-category-handle');
    if (!handle || handle.disabled || busy || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    const row = handle.closest('[data-category-order-id]');
    const scrollLock = lockDragScroll(root);
    const preview = createDragPreview(row, documentRef);
    drag = { row, handle, pointerId: event.pointerId, y: event.clientY, startY: event.clientY, before: ids(), scrollLock, preview };
    root.setPointerCapture(event.pointerId);
    row.classList.add('is-category-placeholder');
    handle.focus({ preventScroll: true });
    announcePosition(row);
    frame = windowRef.requestAnimationFrame(tick);
  }, options);
  root.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    drag.y = event.clientY;
    moveAtPointer();
  }, options);
  root.addEventListener('pointerup', (event) => {
    if (drag?.pointerId === event.pointerId) stop();
  }, options);
  root.addEventListener('pointercancel', () => stop(true), options);
  root.addEventListener('lostpointercapture', () => stop(true), options);
  windowRef.addEventListener('blur', () => stop(true), options);
  windowRef.addEventListener('resize', () => stop(true), options);
  documentRef.addEventListener('visibilitychange', () => {
    if (documentRef.hidden) stop(true);
  }, options);
  // Non-passive touch handling also covers iOS scroll/rubber-band gestures.
  const preventDragScroll = (event) => {
    if (drag && event.cancelable) event.preventDefault();
  };
  documentRef.addEventListener('touchmove', preventDragScroll, { ...options, passive: false, capture: true });
  documentRef.addEventListener('wheel', preventDragScroll, { ...options, passive: false, capture: true });
  root.addEventListener('keydown', (event) => {
    if (drag) {
      if (event.key === 'Escape') { event.preventDefault(); stop(true); }
      else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) event.preventDefault();
      return;
    }
    const handle = event.target.closest('.calendar-category-handle');
    if (!handle || busy || drag || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const row = handle.closest('[data-category-order-id]');
    const before = ids();
    const adjacent = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!adjacent) return;
    if (event.key === 'ArrowUp') root.insertBefore(row, adjacent);
    else root.insertBefore(adjacent, row);
    void commit(before, handle);
  }, options);

  controllers.set(root, {
    destroy() {
      destroyed = true;
      stop(true);
      abort.abort();
      status.remove();
      root.inert = false;
      root.removeAttribute('aria-busy');
      root.querySelectorAll('.calendar-category-handle').forEach((handle) => handle.remove());
      controllers.delete(root);
    },
  });
}
