// Picker controls are siblings of the editable content, never part of saved HTML.
export function getPickerGeometry({ editorTop, editorBottom, caretTop, caretBottom, viewportBottom }) {
  const bottom = Math.min(editorBottom - 8, viewportBottom - 8);
  // Keep the button on the caret line, even when the page scrolls out of view.
  const buttonTop = caretTop;
  const panelTop = Math.max(buttonTop + 50, caretBottom + 8);
  return { buttonTop, panelTop, caretVisible: caretTop >= editorTop && caretTop < editorBottom, panelHeight: Math.max(0, Math.min(320, bottom - panelTop)) };
}

export function rectsOverlap(a, b) {
  return a.width > 0 && a.height > 0 && a.left < b.right && a.right > b.left &&
    a.top < b.bottom && a.bottom > b.top;
}

export function attachWriteEmoticonAnchor({ editor, toggle, panel, getRange }) {
  const wrap = editor.parentElement;
  const events = new AbortController();
  let frame = 0;
  let disposed = false;
  const viewport = () => ({
    top: window.visualViewport?.offsetTop || 0,
    bottom: (window.visualViewport?.offsetTop || 0) + (window.visualViewport?.height || window.innerHeight),
  });
  const readCaretRect = () => {
    const range = getRange();
    if (range && editor.contains(range.endContainer)) {
      const caret = range.cloneRange();
      caret.collapse(false);
      const rect = caret.getClientRects()[0];
      if (rect?.height) return rect;
      // Empty paragraphs and the boundary immediately after an image have no caret rect.
      const node = caret.endContainer;
      if (node.nodeType === Node.TEXT_NODE && node.length) {
        const end = Math.min(node.length, Math.max(1, caret.endOffset));
        caret.setStart(node, end - 1);
        caret.setEnd(node, end);
        const rects = caret.getClientRects();
        if (rects.length) return rects[rects.length - 1];
      }
      if (node.nodeType === Node.ELEMENT_NODE && caret.endOffset > 0) {
        const previous = node.childNodes[caret.endOffset - 1];
        const probe = document.createRange();
        probe.selectNodeContents(previous);
        const rects = probe.getClientRects();
        if (rects.length) return rects[rects.length - 1];
        if (previous.nodeType === Node.ELEMENT_NODE) {
          const box = previous.getBoundingClientRect();
          return { top: box.bottom - 24, bottom: box.bottom };
        }
      }
      const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      if (element && element !== editor) {
        const box = element.getBoundingClientRect();
        const height = parseFloat(getComputedStyle(element).lineHeight) || 24;
        return { top: box.top, bottom: box.top + height };
      }
    }
    const box = editor.getBoundingClientRect();
    const top = box.top + parseFloat(getComputedStyle(editor).paddingTop) - editor.scrollTop;
    return { top, bottom: top + 24 };
  };
  const caretRect = () => {
    const caret = readCaretRect();
    let bottom = caret.bottom;
    // Inline images can be taller than the text caret on the same line.
    for (const media of editor.querySelectorAll('img, video, iframe')) {
      const box = media.getBoundingClientRect();
      if (box.top < caret.bottom && box.bottom > caret.top) bottom = Math.max(bottom, box.bottom);
    }
    return { top: caret.top, bottom };
  };
  function update() {
    frame = 0;
    if (!editor.isConnected) { dispose(); return; }
    const box = editor.getBoundingClientRect();
    const origin = wrap.getBoundingClientRect().top;
    const caret = caretRect();
    const view = viewport();
    const layout = getPickerGeometry({ editorTop: box.top, editorBottom: box.bottom,
      caretTop: caret.top, caretBottom: caret.bottom, viewportTop: view.top, viewportBottom: view.bottom });
    // Controls sit outside the scrolling editor, so hide them when its caret is clipped.
    toggle.style.visibility = layout.caretVisible ? '' : 'hidden';
    panel.style.visibility = layout.caretVisible ? '' : 'hidden';
    wrap.style.setProperty('--write-emoticon-top', `${layout.buttonTop - origin}px`);
    wrap.style.setProperty('--write-emoticon-panel-top', `${layout.panelTop - origin}px`);
    wrap.style.setProperty('--write-emoticon-panel-height', `${layout.panelHeight}px`);
    const buttonRect = toggle.getBoundingClientRect();
    const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    const textRange = document.createRange();
    let overlapping = false;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.textContent.trim()) continue;
      textRange.selectNodeContents(node);
      if (Array.from(textRange.getClientRects()).some(rect => rectsOverlap(rect, buttonRect))) {
        overlapping = true;
        break;
      }
    }
    toggle.classList.toggle('is-overlapping-text', layout.caretVisible && overlapping);
  }
  function schedule() {
    if (!disposed && !frame) frame = requestAnimationFrame(update);
  }
  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '이모티콘 닫기' : '이모티콘 열기');
    wrap.classList.toggle('is-picker-open', open);
    if (open) {
      // Extra bottom padding provides room to raise the caret above the keyboard.
      const box = editor.getBoundingClientRect();
      const view = viewport();
      const desired = Math.max(box.top + 12, view.top + 12);
      const space = Math.min(box.bottom, view.bottom) - caretRect().bottom;
      if (space < 240) {
        editor.scrollTop += Math.max(0, caretRect().top - desired);
        const remaining = Math.min(editor.getBoundingClientRect().bottom, view.bottom) - caretRect().bottom;
        if (remaining < 200) window.scrollBy({ top: Math.max(0, editor.getBoundingClientRect().top - view.top - 12), behavior: 'instant' });
      }
    }
    schedule();
  }
  function selectionChanged() {
    const selection = window.getSelection();
    if (selection?.rangeCount && editor.contains(selection.focusNode)) schedule();
  }
  document.addEventListener('selectionchange', selectionChanged, { signal: events.signal });
  for (const type of ['input', 'keyup', 'pointerup', 'focus', 'scroll']) {
    editor.addEventListener(type, schedule, { signal: events.signal });
  }
  editor.addEventListener('load', schedule, { signal: events.signal, capture: true });
  window.addEventListener('scroll', schedule, { signal: events.signal, passive: true });
  window.addEventListener('resize', schedule, { signal: events.signal });
  window.visualViewport?.addEventListener('resize', schedule, { signal: events.signal });
  window.visualViewport?.addEventListener('scroll', schedule, { signal: events.signal });
  const observer = new ResizeObserver(schedule);
  observer.observe(editor);
  function dispose() {
    disposed = true;
    events.abort();
    observer.disconnect();
    cancelAnimationFrame(frame);
  }
  schedule();
  return { setOpen, schedule, dispose };
}
