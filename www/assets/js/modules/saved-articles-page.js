import { getSavedArticles, removeArticle, savedArticlesChanged } from './saved-articles.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

export function initSavedArticlesPage() {
  const page = document.getElementById('savedArticlesPage');
  if (!page || page.dataset.bound) return;
  page.dataset.bound = 'true';

  const heading = page.querySelector('h1');
  const list = page.querySelector('ul');
  const empty = page.querySelector('#savedArticlesEmpty');
  const status = page.querySelector('#savedArticlesStatus');

  function render() {
    const articles = getSavedArticles();
    const offline = !navigator.onLine || new URLSearchParams(location.search).has('offline');
    empty.hidden = articles.length > 0;
    list.hidden = articles.length === 0;
    list.replaceChildren();

    for (const article of articles) {
      const item = element('li', 'saved-articles__item');
      const row = element('div', 'saved-articles__row');
      const link = element('a', 'saved-articles__link');
      link.href = article.url;
      link.append(
        element('span', 'saved-articles__title', article.title),
        element('span', 'saved-articles__date', new Date(article.savedAt).toLocaleDateString('ko-KR')),
      );

      const remove = element('button', 'saved-articles__remove', '저장 취소');
      remove.type = 'button';
      remove.setAttribute('aria-label', article.title + ' 저장 취소');
      remove.addEventListener('click', () => {
        try {
          if (!removeArticle(article.id)) return;
          status.textContent = '글 저장을 취소했어.';
          heading.focus();
        } catch {
          status.textContent = '저장을 취소하지 못했어. 다시 시도해줘.';
        }
      });

      row.append(link, remove);
      item.append(row);
      if (offline && article.body) {
        const snapshot = element('details', 'saved-articles__snapshot');
        snapshot.append(element('summary', '', '저장한 본문'), element('p', '', article.body));
        item.append(snapshot);
      }
      list.append(item);
    }
  }

  const listeners = new AbortController();
  document.addEventListener(savedArticlesChanged, render, { signal: listeners.signal });
  window.addEventListener('online', render, { signal: listeners.signal });
  window.addEventListener('offline', render, { signal: listeners.signal });
  window.addEventListener('mallin:before-pjax-swap', () => listeners.abort(), {
    once: true,
    signal: listeners.signal,
  });
  render();
}

initSavedArticlesPage();
