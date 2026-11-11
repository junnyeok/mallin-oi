import { supabase } from './supabase-client.js';

const cache = new Map();
const metadataKey = type => `mallin_${type}_order_v1`;
const cacheKey = (userId, type) => `${userId}:${type}`;
export function normalizeOrder(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).filter(id =>
    typeof id === 'string' && /^[\w-]{1,100}$/.test(id)))];
}
export function sortByItemOrder(items, ids, key = item => item.id) {
  const ranks = new Map(normalizeOrder(ids).map((id, index) => [id, index]));
  return [...items].sort((a, b) =>
    (ranks.get(key(a)) ?? Infinity) - (ranks.get(key(b)) ?? Infinity));
}
// Reordering a selected subset keeps unselected items in their existing slots.
export function mergeVisibleOrder(previous, visible) {
  const next = normalizeOrder(visible);
  const base = normalizeOrder([...normalizeOrder(previous), ...next]);
  const visibleIds = new Set(next);
  let index = 0;
  return base.map(id => visibleIds.has(id) ? next[index++] : id);
}
export function getItemOrder(userId, type) {
  return cache.get(cacheKey(userId, type)) || [];
}
export async function loadItemOrder(userId, type) {
  if (!userId) return [];
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || data?.user?.id !== userId) return getItemOrder(userId, type);
    const ids = normalizeOrder(data.user.user_metadata?.[metadataKey(type)]);
    cache.set(cacheKey(userId, type), ids);
    return ids;
  } catch {
    return getItemOrder(userId, type);
  }
}
export async function saveItemOrder(userId, type, visibleIds) {
  if (!['bgm', 'emoticon'].includes(type)) throw new Error('잘못된 순서 종류');
  const { data: current, error: authError } = await supabase.auth.getUser();
  if (authError || !userId || current?.user?.id !== userId) throw new Error('로그인을 확인해줘.');
  const ids = mergeVisibleOrder(current.user.user_metadata?.[metadataKey(type)], visibleIds);
  const { error } = await supabase.auth.updateUser({ data: { [metadataKey(type)]: ids } });
  if (error) throw error;
  cache.set(cacheKey(userId, type), ids);
  window.dispatchEvent(new CustomEvent('mallin:item-order-changed', { detail: { userId, type, ids } }));
  return ids;
}

let orderInteractionBusy = false;
let statusTimer;
function announceOrder(message) {
  let status = document.querySelector('.item-order-status');
  if (!status) {
    status = document.createElement('div');
    status.className = 'item-order-status';
    status.setAttribute('role', 'status');
    document.body.append(status);
  }
  status.textContent = message;
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.remove(), 4000);
}

export function appendItemOrderButton(card, options) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'item-order-button';
  button.textContent = '↔';
  card.dataset.orderItemId = options.itemId;
  const item = options.items.find(item => item.id === options.itemId);
  button.setAttribute('aria-label', `${item?.label || ''} 순서 변경`);
  button.setAttribute('aria-description', '누른 채 원하는 자리로 끌어줘. 키보드는 방향키로 이동할 수 있어.');
  button.title = '누른 채 끌어서 순서 변경';
  button.onclick = event => { event.preventDefault(); event.stopPropagation(); };
  button.oncontextmenu = event => event.preventDefault();
  const getCards = () => Array.from(card.parentElement?.children || []).filter(el => el.dataset.orderItemId);

  async function commit(targetId) {
    const cards = getCards();
    const ids = cards.map(el => el.dataset.orderItemId);
    const from = ids.indexOf(options.itemId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    orderInteractionBusy = true;
    const parent = card.parentElement;
    parent.setAttribute('aria-busy', 'true');
    announceOrder('순서를 저장하고 있어.');
    try {
      await saveItemOrder(options.userId, options.type, ids);
      await options.onSaved?.();
      announceOrder(`${item?.label || '품목'}을 ${to + 1}번째로 옮겼어.`);
      const replacement = Array.from(parent.children).find(el => el.dataset.orderItemId === options.itemId);
      replacement?.querySelector('.item-order-button')?.focus({ preventScroll: true });
    } catch {
      announceOrder('저장하지 못해서 기존 순서를 유지했어. 다시 시도해줘.');
    } finally {
      parent.removeAttribute('aria-busy');
      orderInteractionBusy = false;
    }
  }

  button.onkeydown = event => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation();
    if (orderInteractionBusy) return;
    const cards = getCards();
    const index = cards.indexOf(card);
    const offset = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
    const target = cards[index + offset];
    if (target) void commit(target.dataset.orderItemId);
  };

  button.onpointerdown = event => {
    if (!event.isPrimary || event.button !== 0 || orderInteractionBusy) return;
    event.preventDefault();
    event.stopPropagation();
    orderInteractionBusy = true;
    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startY = event.clientY;
    let x = startX;
    let y = startY;
    let ghost = null;
    let target = null;
    let frame = 0;
    let finished = false;
    const cards = getCards();
    const parent = card.parentElement;
    const hiddenCards = cards.filter(el => el.classList.contains('inventory-item-hidden'));
    const more = parent.parentElement?.querySelector(':scope > .inventory-more-area');
    const moreWasHidden = more?.hidden;
    let scroller = parent;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    button.setPointerCapture(pointerId);

    function updateTarget() {
      target?.classList.remove('item-order-drop-target');
      target = null;
      for (const candidate of cards) {
        if (candidate === card) continue;
        const rect = candidate.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          target = candidate;
          target.classList.add('item-order-drop-target');
          break;
        }
      }
    }
    function tick() {
      if (finished || !ghost) return;
      if (!button.isConnected) { finish(false); return; }
      const rect = scroller?.getBoundingClientRect();
      const top = Math.max(0, rect?.top || 0);
      const bottom = Math.min(window.innerHeight, rect?.bottom || window.innerHeight);
      const step = y < top + 44 ? -8 : y > bottom - 44 ? 8 : 0;
      if (step) {
        if (scroller) scroller.scrollTop += step;
        else window.scrollBy(0, step);
      }
      updateTarget();
      frame = requestAnimationFrame(tick);
    }
    function begin() {
      if (ghost || finished) return;
      const rect = card.getBoundingClientRect();
      ghost = card.cloneNode(true);
      ghost.removeAttribute('id');
      ghost.querySelectorAll('[id]').forEach(el => el.removeAttribute('id'));
      ghost.classList.add('item-order-ghost');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.inert = true;
      Object.assign(ghost.style, { width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px` });
      document.body.append(ghost);
      card.classList.add('item-order-dragging');
      hiddenCards.forEach(el => el.classList.remove('inventory-item-hidden'));
      if (more) more.hidden = true;
      button.setAttribute('aria-pressed', 'true');
      moveGhost();
      frame = requestAnimationFrame(tick);
    }
    function moveGhost() {
      if (ghost) ghost.style.transform = `translate(${x - startX}px, ${y - startY}px)`;
    }
    const hold = setTimeout(begin, 180);
    function move(e) {
      if (e.pointerId !== pointerId) return;
      e.preventDefault();
      x = e.clientX;
      y = e.clientY;
      if (Math.hypot(x - startX, y - startY) >= 5) begin();
      moveGhost();
      if (ghost) updateTarget();
    }
    function finish(save) {
      if (finished) return;
      finished = true;
      clearTimeout(hold);
      cancelAnimationFrame(frame);
      const targetId = target?.dataset.orderItemId;
      ghost?.remove();
      target?.classList.remove('item-order-drop-target');
      card.classList.remove('item-order-dragging');
      hiddenCards.forEach(el => el.classList.add('inventory-item-hidden'));
      if (more) more.hidden = moreWasHidden;
      button.removeAttribute('aria-pressed');
      button.removeEventListener('pointermove', move);
      button.removeEventListener('pointerup', up);
      button.removeEventListener('pointercancel', cancel);
      button.removeEventListener('lostpointercapture', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', escape);
      if (button.hasPointerCapture(pointerId)) button.releasePointerCapture(pointerId);
      orderInteractionBusy = false;
      if (save && targetId) void commit(targetId);
    }
    function up(e) { if (e.pointerId === pointerId) finish(true); }
    function cancel() { finish(false); }
    function escape(e) { if (e.key === 'Escape') { e.preventDefault(); finish(false); } }
    button.addEventListener('pointermove', move);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', cancel);
    button.addEventListener('lostpointercapture', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', escape);
  };
  card.append(button);
}
