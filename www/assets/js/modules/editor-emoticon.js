const caretMarker = '\uFEFF';
const emoticonSelector = 'img[data-emoticon-code], img.inline-emoticon';
const lineBoundary = 'p, div, li, ul, ol, h1, h2, h3, h4, h5, h6, blockquote, pre, figure, td, th';

export function stripEmoticonCaretMarkers(value) {
  return value.replaceAll(caretMarker, '');
}

export function placeCaretAfterEmoticon(emoticon) {
  const doc = emoticon.ownerDocument;
  // WebKit needs an editable text position after the non-editable image.
  const marker = doc.createTextNode(caretMarker);
  emoticon.after(marker);
  const range = doc.createRange();
  range.setStart(marker, marker.length);
  range.collapse(true);
  const selection = doc.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  return range;
}

function isCaretSpacing(text) {
  return stripEmoticonCaretMarkers(text) === '';
}

function precedingEmoticon(editor, range) {
  let node = range.startContainer;
  const context = node.nodeType === 1 ? node : node.parentElement;
  if (context.closest('[contenteditable="false"]')) return null;
  const line = context.closest(lineBoundary);
  const boundary = editor.contains(line) ? line : editor;

  // Real text and explicit line breaks still use the browser's normal deletion.
  if (node.nodeType === 3 && !isCaretSpacing(node.data.slice(0, range.startOffset))) return null;
  let previous = node.nodeType === 1 ? node.childNodes[range.startOffset - 1] : null;

  while (node !== boundary || previous) {
    if (!previous) {
      previous = node.previousSibling;
      node = node.parentNode;
      continue;
    }

    if (previous.nodeType === 1) {
      if (previous.matches(emoticonSelector)) return previous;
      if (previous.matches(`${lineBoundary}, br, [contenteditable="false"], img, video, iframe`)) return null;
      if (previous.lastChild) {
        node = previous;
        previous = previous.lastChild;
        continue;
      }
    } else if (previous.nodeType === 3 && !isCaretSpacing(previous.data)) return null;

    previous = previous.previousSibling;
  }

  return null;
}

export function bindInlineEmoticonDeletion(editor) {
  let composing = false;
  editor.addEventListener('compositionstart', () => { composing = true; });
  editor.addEventListener('compositionend', () => { composing = false; });

  function deleteAtCaret(event) {
    if (composing || event.isComposing || !event.cancelable || event.defaultPrevented) return;
    const selection = editor.ownerDocument.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return;
    const emoticon = precedingEmoticon(editor, range);
    if (!emoticon) return;

    event.preventDefault();
    const deletion = range.cloneRange();
    deletion.setStartBefore(emoticon);
    const marker = emoticon.nextSibling;
    if (marker?.nodeType === 3 && marker.data.startsWith(caretMarker) && range.comparePoint(marker, 1) > 0) {
      deletion.setEnd(marker, 1);
    }
    deletion.deleteContents();
    deletion.collapse(true);
    selection.removeAllRanges();
    selection.addRange(deletion);
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward' }));
  }

  editor.addEventListener('beforeinput', (event) => {
    if (event.inputType === 'deleteContentBackward') deleteAtCaret(event);
  });
  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Backspace' && event.keyCode !== 229 && !event.altKey && !event.ctrlKey && !event.metaKey) {
      deleteAtCaret(event);
    }
  });
}
