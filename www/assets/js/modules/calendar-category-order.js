// Shared list ordering for the website and Capacitor calendars.
const controllers = new WeakMap();

export function orderCategories(categories, ids) {
  const byId = new Map(categories.map((category) => [String(category.id), category]));
  if (ids.length !== byId.size || new Set(ids).size !== ids.length ||
      ids.some((id) => !byId.has(id))) {
    throw new Error('카테고리 목록이 변경됐어요. 다시 열어 주세요.');
  }
  return ids.map((id, index) => ({ ...byId.get(id), sort_order: (index + 1) * 10 }));
}

// Reordering changes the default only for a new entry, never for an existing one.
export function syncReorderedCategorySelection({ calendarType, categories, renderSelect, documentRef = document }) {
  const sheet = documentRef.querySelector(`.calendar-entry-sheet[data-calendar-type="${calendarType}"].is-open`);
  const select = sheet?.querySelector('.calendar-entry-sheet__category-actions select');
  if (!select) return;
  const previous = select.value;
  const preferred = sheet.dataset.mode === 'create' ? categories[0]?.id || '' : previous;
  renderSelect(select, categories, preferred);
  if (sheet.dataset.mode === 'create' && select.value !== previous) {
    // Work entry fields use this event to apply the selected category's default times.
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
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

export function resetCalendarListReorder(root) {
  controllers.get(root)?.destroy();
}

export const resetCategoryReorder = resetCalendarListReorder;

function lockDragScroll(root, allowPageScroll) {
  const snapshots = [];
  const documentRef = root.ownerDocument;
  const windowRef = documentRef.defaultView;
  let scrollTarget = null;
  for (let element = root; element; element = element.parentElement) {
    // A page drag must keep its existing overflow layout. Changing overflow on
    // html/body can clip a scrolled schedule panel in iOS WebKit.
    const lockOverflow = !allowPageScroll && (
      element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth
    );
    const properties = ['overflow-anchor', 'overscroll-behavior', 'scroll-behavior'];
    if (lockOverflow) properties.push('overflow', 'scrollbar-gutter');
    const snapshot = {
      element, top: element.scrollTop, left: element.scrollLeft,
      styles: properties.map((name) => [name, element.style.getPropertyValue(name), element.style.getPropertyPriority(name)]),
    };
    snapshots.push(snapshot);
    if (!scrollTarget && element.scrollHeight > element.clientHeight) {
      const isPage = element === documentRef.scrollingElement;
      const isListContainer = element !== documentRef.body && element !== documentRef.documentElement &&
        /auto|scroll/.test(windowRef.getComputedStyle(element).overflowY);
      if (isListContainer || (isPage && allowPageScroll)) scrollTarget = { snapshot, isPage };
    }
    element.style.setProperty('overflow-anchor', 'none');
    element.style.setProperty('overscroll-behavior', 'none');
    element.style.setProperty('scroll-behavior', 'auto');
    if (lockOverflow) {
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
      if (!scrollTarget) return false;
      const { snapshot, isPage } = scrollTarget;
      const { element } = snapshot;
      const viewportHeight = windowRef.innerHeight;
      const contentTop = isPage ? 0 : element.getBoundingClientRect().top + element.clientTop;
      const top = Math.max(0, contentTop);
      const bottom = isPage ? viewportHeight : Math.min(viewportHeight, contentTop + element.clientHeight);
      const speed = getCategoryEdgeScrollSpeed(pointerY, top, bottom);
      if (!speed) return false;
      const previousTop = snapshot.top;
      const maximum = Math.max(0, element.scrollHeight - element.clientHeight);
      element.scrollTop = Math.max(0, Math.min(maximum, previousTop + speed * elapsedSeconds));
      // The lock accepts this controlled movement and still rejects touch/anchor scrolling.
      snapshot.top = element.scrollTop;
      return snapshot.top !== previousTop;
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

function createDragPreview(row, documentRef, previewClass) {
  const rect = row.getBoundingClientRect();
  const preview = row.cloneNode(true);
  preview.removeAttribute('id');
  preview.removeAttribute('data-category-order-id');
  preview.removeAttribute('data-category-order-name');
  preview.querySelectorAll('[id]').forEach((element) => element.removeAttribute('id'));
  const inputs = row.querySelectorAll('input, textarea, select');
  preview.querySelectorAll('input, textarea, select').forEach((element, index) => {
    element.value = inputs[index].value;
    if ('checked' in element) element.checked = inputs[index].checked;
  });
  preview.classList.add(previewClass);
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
  // Keep the category list's identifiers available to its existing diagnostics.
  Array.from(root.children).forEach((row, index) => {
    const category = categories[index];
    if (!category) return;
    row.dataset.categoryOrderId = String(category.id);
    row.dataset.categoryOrderName = category.name;
  });
  enableCalendarListReorder({ root, items: categories, onReorder });
}

export function enableCalendarListReorder({
  root,
  items,
  onReorder,
  handleSide = 'left',
  allowPageScroll = false,
  statusClass = 'calendar-category-order-status',
  instructions = `${handleSide === 'right' ? '오른쪽' : '왼쪽'} 손잡이를 누른 채 위아래로 끌어 순서를 바꿔요.`,
  itemClass = 'calendar-category-sortable',
  handleClass = 'calendar-category-handle',
  placeholderClass = 'is-category-placeholder',
  previewClass = 'calendar-category-drag-preview',
  failureMessage = '순서를 저장하지 못했어요. 연결을 확인한 뒤 다시 이동해 주세요.',
}) {
  if (!root || !onReorder) return;
  resetCalendarListReorder(root);
  const documentRef = root.ownerDocument;
  const windowRef = documentRef.defaultView;
  const abort = new AbortController();
  const options = { signal: abort.signal };
  const status = documentRef.createElement('p');
  status.className = statusClass;
  status.setAttribute('role', 'status');
  status.textContent = instructions;
  root.after(status);
  let drag = null;
  let frame = null;
  let busy = false;
  let destroyed = false;
  const itemsByRow = new Map();
  const rowByHandle = new Map();
  const handleSelector = `.${handleClass}`;
  const rows = () => Array.from(root.children).filter((row) => itemsByRow.has(row));
  const ids = () => rows().map((row) => itemsByRow.get(row).id);
  // Shared/read-only schedules follow the editable entries in the same list.
  const boundary = () => Array.from(root.children).find((row) => !itemsByRow.has(row)) || null;
  const restore = (order) => {
    const byId = new Map(rows().map((row) => [itemsByRow.get(row).id, row]));
    const afterEditable = boundary();
    order.forEach((id) => { if (byId.has(id)) root.insertBefore(byId.get(id), afterEditable); });
  };
  const announcePosition = (row) => {
    status.textContent = `${itemsByRow.get(row).name}, ${rows().indexOf(row) + 1}번째`;
  };

  Array.from(root.children).forEach((row, index) => {
    const item = items[index];
    if (!item) return;
    itemsByRow.set(row, { id: String(item.id), name: item.name });
    row.classList.add(itemClass);
    const handle = documentRef.createElement('button');
    handle.type = 'button';
    handle.className = handleClass;
    handle.textContent = '⠿';
    handle.setAttribute('aria-label', `${item.name} 순서 이동`);
    handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown');
    handle.title = '누른 채 위아래로 이동 · 키보드 위/아래 방향키';
    handle.disabled = items.length < 2;
    rowByHandle.set(handle, row);
    if (handleSide === 'right') row.append(handle);
    else row.prepend(handle);
  });

  async function commit(before, focusHandle) {
    const order = ids();
    if (order.every((id, index) => id === before[index])) return;
    busy = true;
    root.inert = true;
    root.setAttribute('aria-busy', 'true');
    status.removeAttribute('data-error');
    status.textContent = '순서를 저장하고 있어요…';
    try {
      await onReorder(order);
      if (!destroyed) status.textContent = '순서를 저장했어요.';
    } catch (error) {
      if (!destroyed) {
        restore(error?.categoryOrder || before);
        status.setAttribute('data-error', '');
        status.textContent = failureMessage;
      }
    } finally {
      busy = false;
      if (!destroyed) {
        root.inert = false;
        root.removeAttribute('aria-busy');
        if (focusHandle?.isConnected) focusHandle.focus({ preventScroll: true });
      }
    }
  }

  function stop(cancel = false) {
    if (!drag) return;
    const current = drag;
    drag = null;
    windowRef.cancelAnimationFrame(frame);
    frame = null;
    current.preview.remove();
    current.row.classList.remove(placeholderClass);
    if (root.hasPointerCapture?.(current.pointerId)) root.releasePointerCapture(current.pointerId);
    if (cancel) {
      restore(current.before);
      status.textContent = '순서 이동을 취소했어요.';
    }
    current.scrollLock.restore();
    if (!cancel && current.hasMoved) void commit(current.before, current.handle);
  }

  function moveAtPointer() {
    if (!drag?.hasMoved) return;
    drag.scrollLock.hold();
    drag.preview.style.transform = `translate3d(0, ${drag.y - drag.startY}px, 0)`;
    const siblings = rows().filter((row) => row !== drag.row);
    const next = siblings.find((row) => {
      const rect = row.getBoundingClientRect();
      return drag.y < rect.top + rect.height / 2;
    });
    const reference = next || boundary();
    if (drag.row.nextElementSibling !== reference) {
      root.insertBefore(drag.row, reference);
      drag.scrollLock.hold();
      announcePosition(drag.row);
    }
  }

  function tick(timestamp) {
    if (!drag) return;
    if (!root.isConnected || !root.getClientRects().length || drag.row.parentElement !== root) { stop(true); return; }
    const elapsed = Math.min(32, Math.max(0, timestamp - (drag.lastFrame ?? timestamp - 16))) / 1000;
    drag.lastFrame = timestamp;
    drag.scrollLock.hold();
    if (drag.hasMoved && drag.scrollLock.scrollAtEdge(drag.y, elapsed)) moveAtPointer();
    frame = windowRef.requestAnimationFrame(tick);
  }

  root.addEventListener('pointerdown', (event) => {
    const handle = event.target.closest(handleSelector);
    const row = rowByHandle.get(handle);
    if (!row || handle.disabled || busy || drag || event.button !== 0 || event.isPrimary === false) return;
    event.preventDefault();
    try { root.setPointerCapture(event.pointerId); }
    catch { return; }
    const scrollLock = lockDragScroll(root, allowPageScroll);
    const preview = createDragPreview(row, documentRef, previewClass);
    drag = {
      row, handle, pointerId: event.pointerId, y: event.clientY, startY: event.clientY,
      before: ids(), scrollLock, preview, hasMoved: false,
    };
    row.classList.add(placeholderClass);
    handle.focus({ preventScroll: true });
    status.removeAttribute('data-error');
    announcePosition(row);
    frame = windowRef.requestAnimationFrame(tick);
  }, options);
  root.addEventListener('pointermove', (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    drag.y = event.clientY;
    if (Math.abs(drag.y - drag.startY) >= 4) drag.hasMoved = true;
    moveAtPointer();
  }, options);
  root.addEventListener('pointerup', (event) => {
    if (drag?.pointerId === event.pointerId) stop();
  }, options);
  const cancelPointerDrag = (event) => {
    if (drag?.pointerId === event.pointerId) stop(true);
  };
  root.addEventListener('pointercancel', cancelPointerDrag, options);
  root.addEventListener('lostpointercapture', (event) => {
    if (event.target === root) cancelPointerDrag(event);
  }, options);
  root.addEventListener('contextmenu', (event) => {
    if (drag || rowByHandle.has(event.target.closest(handleSelector))) event.preventDefault();
  }, options);
  windowRef.addEventListener('blur', () => stop(true), options);
  windowRef.addEventListener('resize', () => stop(true), options);
  windowRef.addEventListener('pagehide', () => stop(true), options);
  windowRef.addEventListener('mallin:before-pjax-swap', () => resetCalendarListReorder(root), options);
  documentRef.addEventListener('visibilitychange', () => {
    if (documentRef.hidden) stop(true);
  }, options);
  // Non-passive touch handling also covers iOS scroll/rubber-band gestures.
  const preventDragScroll = (event) => {
    if (drag && event.cancelable) event.preventDefault();
  };
  documentRef.addEventListener('touchmove', preventDragScroll, { ...options, passive: false, capture: true });
  documentRef.addEventListener('wheel', preventDragScroll, { ...options, passive: false, capture: true });
  // Moving a row can remove focus from its handle until drop. Escape still works.
  documentRef.addEventListener('keydown', (event) => {
    if (!drag) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const handle = drag.handle;
      stop(true);
      handle.focus({ preventScroll: true });
    }
    else if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) event.preventDefault();
  }, { ...options, capture: true });
  root.addEventListener('keydown', (event) => {
    const handle = event.target.closest(handleSelector);
    const row = rowByHandle.get(handle);
    if (event.defaultPrevented || !row || handle.disabled || busy || drag || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const before = ids();
    const adjacent = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
    if (!itemsByRow.has(adjacent)) return;
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
      rowByHandle.forEach((row, handle) => {
        handle.remove();
        row.classList.remove(itemClass);
      });
      controllers.delete(root);
    },
  });
}
