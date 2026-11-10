import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../assets/js/modules/write.js', import.meta.url), 'utf8');
const guardSource = source.slice(source.indexOf('function createWriteLeaveGuard('), source.indexOf('\nfunction navigateWithPjax('));

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, []); listeners.get(type).push(fn); },
    removeEventListener(type, fn) { listeners.set(type, (listeners.get(type) || []).filter(x => x !== fn)); },
    dispatch(type, event = {}) {
      event.stopImmediatePropagation = () => { event.stopped = true; };
      event.preventDefault = () => { event.defaultPrevented = true; };
      for (const fn of [...(listeners.get(type) || [])]) { fn(event); if (event.stopped) break; }
      return event;
    },
  };
}

function createHarness({ guarded = false, answer = true } = {}) {
  const tasks = [];
  const editor = { innerHTML: '' };
  const form = eventTarget();
  const window = eventTarget();
  const document = eventTarget();
  const entries = [{ url: '/study.html', state: { pjax: true } }, { url: '/write.html', state: { pjax: true } }];
  if (guarded) entries.push({ url: '/write.html', state: { pjax: true, __mallinWriteGuard: true } });
  let index = entries.length - 1;
  let renderedUrl = '/write.html';
  let confirms = 0;
  let observer;
  const location = { get href() { return 'https://mallin-oi.com' + entries[index].url; } };
  function traverse(delta) {
    tasks.push(() => {
      const next = index + delta;
      if (next < 0 || next >= entries.length) return;
      index = next;
      const event = window.dispatch('popstate', { state: entries[index].state });
      // The real router sees only popstate events the guard lets through.
      if (!event.stopped) renderedUrl = entries[index].url;
    });
  }
  window.location = location;
  window.history = {
    get state() { return entries[index].state; },
    pushState(state, _, href) { entries.splice(index + 1); entries.push({ state, url: new URL(href).pathname }); index++; },
    back() { traverse(-1); }, forward() { traverse(1); },
  };
  window.confirm = () => { confirms++; return answer; };
  const context = {
    window, document, URL,
    $: selector => selector === '#bodyEditor' ? editor : null,
    attachmentState: [], removedStoragePaths: new Set(),
    WRITE_LEAVE_MESSAGE: '글이 삭제됩니다. 이동하시겠습니까?', WRITE_HISTORY_GUARD_KEY: '__mallinWriteGuard',
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} disconnect() {} },
    setTimeout: fn => tasks.push(fn),
  };
  const guard = vm.runInNewContext(guardSource + '\ncreateWriteLeaveGuard', context)(form);
  return {
    guard, editor, entries,
    mutate(value) { editor.innerHTML = value; observer(); },
    input(value) { editor.innerHTML = value; form.dispatch('input'); },
    back() { window.history.back(); },
    flush() { for (let n = 0; tasks.length; n++) { assert.ok(n < 30, 'history must settle'); tasks.shift()(); } },
    get renderedUrl() { return renderedUrl; }, get url() { return entries[index].url; }, get confirms() { return confirms; },
  };
}

test('초기화 중 본문 변환은 뒤로가기용 방문 기록을 추가하지 않는다', () => {
  const h = createHarness();
  h.mutate('<p><br></p>');
  h.mutate('<p>불러온 수정 대상 글</p>');
  assert.equal(h.entries.length, 2);
  h.guard.resetBaseline();
  h.back(); h.flush();
  assert.equal(h.renderedUrl, '/study.html');
  assert.equal(h.confirms, 0);
});

test('작성 후 뒤로가기 확인은 이전 페이지까지 이동한다', () => {
  const h = createHarness();
  h.guard.resetBaseline();
  h.input('<p>한글 작성 중</p>');
  h.back(); h.flush();
  assert.equal(h.confirms, 1);
  assert.equal(h.url, '/study.html');
  assert.equal(h.renderedUrl, '/study.html');
});

test('새로고침으로 남은 보호 기록을 재사용하여 글쓰기 페이지가 중복되지 않는다', () => {
  const h = createHarness({ guarded: true });
  h.guard.resetBaseline(); h.input('<p>다시 작성</p>');
  assert.equal(h.entries.length, 3);
  h.back(); h.flush();
  assert.equal(h.renderedUrl, '/study.html');
  assert.equal(h.confirms, 1);
});

test('뒤로가기 취소는 본문과 작성 페이지를 유지하고 재시도할 수 있다', () => {
  const h = createHarness({ answer: false });
  h.guard.resetBaseline(); h.input('<p>보존할 본문</p>');
  for (let n = 0; n < 2; n++) {
    h.back(); h.flush();
    assert.equal(h.url, '/write.html');
    assert.equal(h.renderedUrl, '/write.html');
    assert.equal(h.editor.innerHTML, '<p>보존할 본문</p>');
    assert.equal(h.entries.length, 3);
  }
  assert.equal(h.confirms, 2);
});

test('작성 내용을 전부 지우고 뒤로가면 확인 없이 이전 페이지로 이동한다', () => {
  const h = createHarness();
  h.guard.resetBaseline(); h.input('본문'); h.input('');
  h.back(); h.flush();
  assert.equal(h.renderedUrl, '/study.html'); assert.equal(h.confirms, 0);
});

function listener(type, parameter) {
  const prefix = `editor.addEventListener('${type}', (${parameter}) => {`;
  const start = source.indexOf(prefix);
  assert.ok(start >= 0);
  // These handlers end before the next listener declaration.
  const end = source.indexOf('\n  });', start);
  return source.slice(start + prefix.length, end);
}

test('한글 조합 시작과 첫 입력에서 안내 문구를 즉시 숨기고 본문은 다시 쓰지 않는다', () => {
  let empty = true;
  const editor = { innerHTML: 'ㅎ', classList: { remove(name) { assert.equal(name, 'is-empty'); empty = false; } } };
  const context = vm.createContext({ editor, isEditorComposing: false, editorCompositionSequence: 0,
    updateEditorEmptyState(root) { empty = !root.innerHTML; },
    reconcileAttachmentStateWithEditor() { assert.fail('IME 중 DOM 변환 금지'); },
  });
  vm.runInContext(`(() => {${listener('compositionstart', '')}})()`, context);
  assert.equal(empty, false);
  empty = true;
  vm.runInContext(`((event) => {${listener('input', 'event')}})({isComposing:true})`, context);
  assert.equal(empty, false); assert.equal(editor.innerHTML, 'ㅎ');
  editor.innerHTML = '';
  vm.runInContext(`((event) => {${listener('input', 'event')}})({isComposing:true})`, context);
  assert.equal(empty, true);
});
