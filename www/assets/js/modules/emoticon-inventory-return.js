// Only explicit emoticon-settings navigation carries a return destination.
export function getEmoticonReturnHref(search, origin) {
  const params = new URLSearchParams(search);
  if (params.get('from') !== 'emoticon-settings') return '';
  try {
    const url = new URL(params.get('returnTo') || '', origin);
    if (url.origin !== origin || !/^\/(?:post|write)\.html$/.test(url.pathname)) return '';
    if (url.pathname === '/post.html' && !/^\d+$/.test(url.searchParams.get('id') || '')) return '';
    return url.pathname + url.search + url.hash;
  } catch { return ''; }
}

export function initEmoticonSettingsNavigation() {
  window.__mallinDisposeEmoticonSettingsNavigation?.();
  const prepare = (link) => {
    const current = new URL(window.location.href);
    if (!/^\/(?:post|write)\.html$/.test(current.pathname)) return;
    const target = new URL('./inventory.html', current);
    target.searchParams.set('from', 'emoticon-settings');
    target.searchParams.set('returnTo', current.pathname + current.search + current.hash);
    target.hash = 'emoticon-inventory';
    link.href = target.pathname + target.search + target.hash;
    if (current.pathname === '/write.html') {
      // Keep the live draft, files, undo history and caret in the original tab.
      link.target = '_blank';
      link.rel = 'opener';
    }
  };
  document.querySelectorAll('a.emoticon-setting-link').forEach(prepare);
  const onClick = (event) => {
    const link = event.target.closest?.('a.emoticon-setting-link');
    if (link) prepare(link);
  };
  document.addEventListener('click', onClick, true);
  window.__mallinDisposeEmoticonSettingsNavigation = () => document.removeEventListener('click', onClick, true);
}

export function initEmoticonInventoryReturn() {
  const link = document.getElementById('emoticonReturnLink');
  if (!link) return;
  const href = getEmoticonReturnHref(window.location.search, window.location.origin);
  link.hidden = !href;
  if (!href) return;
  link.href = href;
  link.onclick = (event) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    try {
      const opener = window.opener;
      if (!opener || opener.closed || opener.location.origin !== window.location.origin) return;
      if (opener.location.pathname + opener.location.search + opener.location.hash !== href) return;
      event.preventDefault();
      opener.focus();
      opener.dispatchEvent(new Event('mallin:emoticon-settings-return'));
      window.close();
    } catch { /* A regular link remains available if the original tab was closed. */ }
  };
}
