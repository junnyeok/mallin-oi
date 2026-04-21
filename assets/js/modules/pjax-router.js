// assets/js/modules/pjax-router.js

const DEFAULT_MAIN_SELECTOR = 'main';
const LOADING_CLASS = 'is-pjax-loading';

function isModifiedEvent(event) {
  return (
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || false
  );
}

function isSpecialProtocol(href = '') {
  return /^(mailto:|tel:|javascript:|data:|blob:)/i.test(String(href || ''));
}

function isHtmlLikePath(pathname = '') {
  if (!pathname) return false;
  return (
    pathname === '/' || pathname.endsWith('/') || pathname.endsWith('.html')
  );
}

function isPjaxAllowedUrl(url) {
  if (!(url instanceof URL)) return false;
  if (url.origin !== window.location.origin) return false;
  if (!isHtmlLikePath(url.pathname)) return false;

  const pathname = url.pathname.toLowerCase();

  // account 쪽은 기본 제외
  // 단, signup 페이지만 예외적으로 허용해서
  // BGM 끊김 없이 이동되게 함
  if (pathname.includes('/account/')) {
    return pathname.endsWith('/account/signup.html');
  }

  return true;
}

function normalizeSameOriginUrl(rawValue, baseUrl) {
  const value = String(rawValue || '').trim();
  if (!value) return value;
  if (value.startsWith('#')) return value;
  if (isSpecialProtocol(value)) return value;

  const resolved = new URL(value, baseUrl);

  if (resolved.origin === window.location.origin) {
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  }

  return resolved.toString();
}

function rewriteFragmentUrls(root, pageUrl) {
  if (!root) return;

  const selector =
    '[href], [src], [poster], form[action], source[src], audio[src], video[src], img[src], a[href], link[href]';

  root.querySelectorAll(selector).forEach((node) => {
    ['href', 'src', 'poster', 'action'].forEach((attr) => {
      if (!node.hasAttribute(attr)) return;
      const raw = node.getAttribute(attr);
      if (!raw) return;
      const nextValue = normalizeSameOriginUrl(raw, pageUrl);
      node.setAttribute(attr, nextValue);
    });
  });
}

function parseHtml(htmlText) {
  const parser = new DOMParser();
  return parser.parseFromString(htmlText, 'text/html');
}

async function fetchNextDocument(url) {
  const response = await fetch(url.toString(), {
    method: 'GET',
    cache: 'no-cache',
    headers: {
      'X-Requested-With': 'PJAX',
    },
  });

  if (!response.ok) {
    throw new Error(`PJAX fetch failed: ${response.status}`);
  }

  const html = await response.text();
  return parseHtml(html);
}

function syncDocumentTitle(nextDoc) {
  document.title = nextDoc.title || document.title;
}

function syncBodyState(nextBody) {
  if (!nextBody || !document.body) return;

  document.body.className = nextBody.className || '';

  [...document.body.attributes].forEach((attr) => {
    if (attr.name.startsWith('data-')) {
      document.body.removeAttribute(attr.name);
    }
  });

  [...nextBody.attributes].forEach((attr) => {
    if (attr.name === 'class' || attr.name === 'style') return;
    if (attr.name.startsWith('data-')) {
      document.body.setAttribute(attr.name, attr.value);
    }
  });
}

function markCurrentStylesheetsManaged() {
  document
    .querySelectorAll('head link[rel="stylesheet"]')
    .forEach((link) => link.setAttribute('data-pjax-managed', 'true'));
}

function createStylesheetClone(link, nextUrl) {
  const clone = document.createElement('link');

  [...link.attributes].forEach((attr) => {
    if (attr.name === 'href') return;
    clone.setAttribute(attr.name, attr.value);
  });

  clone.setAttribute('data-pjax-managed', 'true');

  const href = link.getAttribute('href') || '';
  clone.setAttribute('href', normalizeSameOriginUrl(href, nextUrl));

  return clone;
}

function getComparableHref(value) {
  try {
    const url = new URL(value, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch (error) {
    return String(value || '');
  }
}

function syncManagedStylesheets(nextDoc, nextUrl) {
  const currentManaged = [
    ...document.querySelectorAll(
      'head link[rel="stylesheet"][data-pjax-managed="true"]',
    ),
  ];

  const incomingLinks = [
    ...nextDoc.querySelectorAll('head link[rel="stylesheet"]'),
  ];

  const currentMap = new Map(
    currentManaged.map((node) => [getComparableHref(node.href), node]),
  );

  const nextItems = incomingLinks.map((link) => {
    const href = normalizeSameOriginUrl(
      link.getAttribute('href') || '',
      nextUrl,
    );
    return {
      key: getComparableHref(href),
      href,
      source: link,
    };
  });

  const nextKeySet = new Set(nextItems.map((item) => item.key));

  // 현재 것 중 다음 페이지에 없는 것만 제거
  currentManaged.forEach((node) => {
    const key = getComparableHref(node.href);
    if (!nextKeySet.has(key)) {
      node.remove();
    }
  });

  const bootScript = document.querySelector(
    'script[type="module"][src*="assets/js/boot.js"]',
  );

  nextItems.forEach((item) => {
    if (currentMap.has(item.key)) return;

    const clone = createStylesheetClone(item.source, nextUrl);
    clone.setAttribute('href', item.href);

    if (bootScript?.parentNode) {
      bootScript.parentNode.insertBefore(clone, bootScript);
    } else {
      document.head.appendChild(clone);
    }
  });
}

function getCurrentMain(selector = DEFAULT_MAIN_SELECTOR) {
  return document.querySelector(selector);
}

function getNextMain(nextDoc, selector = DEFAULT_MAIN_SELECTOR) {
  return nextDoc.querySelector(selector);
}

function shouldHandleAnchor(anchor, event) {
  if (!anchor) return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.getAttribute('target') === '_blank') return false;
  if (anchor.hasAttribute('data-no-pjax')) return false;
  if (isModifiedEvent(event)) return false;

  const href = anchor.getAttribute('href') || '';
  if (!href || href.startsWith('#')) return false;
  if (isSpecialProtocol(href)) return false;

  const url = new URL(href, window.location.href);

  if (!isPjaxAllowedUrl(url)) return false;

  const current = new URL(window.location.href);

  if (
    url.pathname === current.pathname &&
    url.search === current.search &&
    url.hash !== current.hash
  ) {
    return false;
  }

  return true;
}

function setLoading(isLoading) {
  document.documentElement.classList.toggle(LOADING_CLASS, isLoading);
  document.body?.classList.toggle(LOADING_CLASS, isLoading);
}

let isNavigating = false;
const PJAX_NAVIGATE_GLOBAL_KEY = '__mallinNavigate';
let currentNavToken = 0;

export async function initPjaxRouter({
  mainSelector = DEFAULT_MAIN_SELECTOR,
  onAfterSwap = async () => {},
} = {}) {
  markCurrentStylesheetsManaged();

  async function navigate(rawUrl, options = {}) {
    const {
      replace = false,
      scrollToTop = true,
      preserveHash = false,
    } = options;

    const nextUrl = new URL(rawUrl, window.location.href);

    if (!isPjaxAllowedUrl(nextUrl)) {
      window.location.href = nextUrl.toString();
      return;
    }

    if (isNavigating) return;
    isNavigating = true;
    currentNavToken += 1;
    const navToken = currentNavToken;

    setLoading(true);

    try {
      const nextDoc = await fetchNextDocument(nextUrl);
      if (navToken !== currentNavToken) return;

      const currentMain = getCurrentMain(mainSelector);
      const nextMain = getNextMain(nextDoc, mainSelector);

      if (!currentMain || !nextMain) {
        window.location.href = nextUrl.toString();
        return;
      }

      rewriteFragmentUrls(nextMain, nextUrl.toString());
      syncManagedStylesheets(nextDoc, nextUrl.toString());
      syncDocumentTitle(nextDoc);
      syncBodyState(nextDoc.body);

      if (replace) {
        window.history.replaceState({ pjax: true }, '', nextUrl.toString());
      } else {
        window.history.pushState({ pjax: true }, '', nextUrl.toString());
      }

      window.dispatchEvent(
        new CustomEvent('mallin:before-pjax-swap', {
          detail: {
            from: window.location.href,
            to: nextUrl.toString(),
          },
        }),
      );

      currentMain.replaceWith(nextMain);

      if (scrollToTop) {
        if (preserveHash && nextUrl.hash) {
          const target = document.querySelector(nextUrl.hash);
          if (target) {
            target.scrollIntoView({ block: 'start' });
          } else {
            window.scrollTo(0, 0);
          }
        } else {
          window.scrollTo(0, 0);
        }
      }

      await onAfterSwap({
        url: nextUrl,
        doc: nextDoc,
        main: nextMain,
      });
    } catch (error) {
      console.error('[pjax] navigation failed:', error);
      window.location.href = nextUrl.toString();
    } finally {
      setLoading(false);
      isNavigating = false;
    }
  }

  window[PJAX_NAVIGATE_GLOBAL_KEY] = navigate;

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!shouldHandleAnchor(anchor, event)) return;

    event.preventDefault();

    const href = anchor.getAttribute('href');
    navigate(href, {
      replace: false,
      scrollToTop: true,
      preserveHash: true,
    });
  });

  window.addEventListener('popstate', async () => {
    const nextUrl = new URL(window.location.href);

    if (!isPjaxAllowedUrl(nextUrl)) {
      window.location.reload();
      return;
    }

    await navigate(nextUrl.toString(), {
      replace: true,
      scrollToTop: true,
      preserveHash: true,
    });
  });
}
