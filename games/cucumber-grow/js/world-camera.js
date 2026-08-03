export const CAMERA_DRAG_THRESHOLD_PX = 9;

export function clampCameraOffset(offset, viewportHeight, contentHeight) {
  const minimum = Math.min(0, viewportHeight - contentHeight);
  return Math.min(0, Math.max(minimum, offset));
}

export function isTapGesture({ deltaX, deltaY, durationMs, cancelled = false }) {
  return (
    !cancelled &&
    durationMs <= 650 &&
    Math.hypot(deltaX, deltaY) < CAMERA_DRAG_THRESHOLD_PX
  );
}

export class WorldCameraController {
  constructor({
    viewport,
    content,
    onTap,
    onCameraMove = () => {},
    isInteractionBlocked = () => false,
    windowRef = globalThis.window,
  }) {
    this.viewport = viewport;
    this.content = content;
    this.onTap = onTap;
    this.onCameraMove = onCameraMove;
    this.isInteractionBlocked = isInteractionBlocked;
    this.window = windowRef;
    this.offset = 0;
    this.gesture = null;
    this.activePointers = new Set();
    this.animationFrame = null;
    this.resizeObserver = null;
    this.bound = {
      pointerdown: (event) => this.handlePointerDown(event),
      pointermove: (event) => this.handlePointerMove(event),
      pointerup: (event) => this.handlePointerUp(event),
      pointercancel: (event) => this.handlePointerCancel(event),
      wheel: (event) => this.handleWheel(event),
      inactive: () => this.cancelGesture(),
      resize: () => this.refreshBounds(),
    };
  }

  mount() {
    this.viewport.addEventListener("pointerdown", this.bound.pointerdown, { passive: false });
    this.viewport.addEventListener("pointermove", this.bound.pointermove, { passive: false });
    this.viewport.addEventListener("pointerup", this.bound.pointerup, { passive: false });
    this.viewport.addEventListener("pointercancel", this.bound.pointercancel, { passive: false });
    this.viewport.addEventListener("wheel", this.bound.wheel, { passive: false });
    this.window?.addEventListener?.("resize", this.bound.resize);
    this.window?.addEventListener?.("gameappinactive", this.bound.inactive);
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(() => this.refreshBounds());
      this.resizeObserver.observe(this.viewport);
      this.resizeObserver.observe(this.content);
    }
    this.refreshBounds();
  }

  handlePointerDown(event) {
    if (this.isInteractionBlocked() || event.button > 0) return;
    this.activePointers.add(event.pointerId);
    if (this.activePointers.size > 1) {
      this.cancelGesture();
      return;
    }
    event.preventDefault();
    this.gesture = {
      pointerId: event.pointerId,
      target: event.target,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startOffset: this.offset,
      startedAt: performance.now?.() ?? Date.now(),
      dragging: false,
      cancelled: false,
    };
    this.viewport.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    gesture.lastX = event.clientX;
    gesture.lastY = event.clientY;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (!gesture.dragging && Math.hypot(deltaX, deltaY) >= CAMERA_DRAG_THRESHOLD_PX) {
      gesture.dragging = true;
      this.viewport.classList.add("is-dragging");
    }
    if (gesture.dragging) this.setOffset(gesture.startOffset + deltaY);
  }

  handlePointerUp(event) {
    this.activePointers.delete(event.pointerId);
    const gesture = this.gesture;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    const durationMs = (performance.now?.() ?? Date.now()) - gesture.startedAt;
    const target = gesture.target;
    const shouldTap = isTapGesture({
      deltaX,
      deltaY,
      durationMs,
      cancelled: gesture.cancelled || this.activePointers.size > 0,
    });
    this.finishGesture(event.pointerId);
    if (shouldTap && !this.isInteractionBlocked()) this.onTap?.(target, event);
  }

  handlePointerCancel(event) {
    this.activePointers.delete(event.pointerId);
    if (this.gesture?.pointerId === event.pointerId) this.cancelGesture();
  }

  handleWheel(event) {
    if (this.isInteractionBlocked() || event.ctrlKey) return;
    event.preventDefault();
    this.setOffset(this.offset - event.deltaY);
  }

  finishGesture(pointerId) {
    this.viewport.releasePointerCapture?.(pointerId);
    this.viewport.classList.remove("is-dragging");
    this.gesture = null;
  }

  cancelGesture() {
    if (this.gesture) {
      this.gesture.cancelled = true;
      this.finishGesture(this.gesture.pointerId);
    }
    this.activePointers.clear();
  }

  setOffset(offset) {
    this.offset = clampCameraOffset(
      offset,
      this.viewport.clientHeight,
      this.content.scrollHeight
    );
    if (this.animationFrame !== null) return;
    const requestFrame = this.window?.requestAnimationFrame?.bind(this.window) ?? ((callback) => callback());
    this.animationFrame = requestFrame(() => {
      this.animationFrame = null;
      this.content.style.setProperty("--camera-y", `${this.offset}px`);
      this.onCameraMove(this.offset);
    });
  }

  refreshBounds() {
    this.setOffset(this.offset);
  }

  revealBottom() {
    this.setOffset(this.viewport.clientHeight - this.content.scrollHeight);
  }

  reset() {
    this.setOffset(0);
  }

  destroy() {
    this.cancelGesture();
    this.resizeObserver?.disconnect();
    this.viewport.removeEventListener("pointerdown", this.bound.pointerdown);
    this.viewport.removeEventListener("pointermove", this.bound.pointermove);
    this.viewport.removeEventListener("pointerup", this.bound.pointerup);
    this.viewport.removeEventListener("pointercancel", this.bound.pointercancel);
    this.viewport.removeEventListener("wheel", this.bound.wheel);
    this.window?.removeEventListener?.("resize", this.bound.resize);
    this.window?.removeEventListener?.("gameappinactive", this.bound.inactive);
  }
}
