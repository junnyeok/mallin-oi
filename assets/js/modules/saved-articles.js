const storagePrefix = 'mallin:saved-article:v1:';
export const savedArticlesChanged = 'mallin:saved-articles-changed';

function articleId(value) {
  const id = String(value ?? '');
  return /^[1-9]\d*$/.test(id) ? id : '';
}

function articleUrl(id) {
  const url = new URL('../../../post.html', import.meta.url);
  url.searchParams.set('id', id);
  return url.href;
}

function articleText(body) {
  const value = String(body ?? '');
  if (!/<\/?[a-z][^>]*>/i.test(value)) return value.trim();

  const template = document.createElement('template');
  template.innerHTML = value;
  const content = template.content;
  content.querySelectorAll('script, style, template, iframe, object, embed')
    .forEach(element => element.remove());
  content.querySelectorAll('br').forEach(element => element.replaceWith('\n'));
  content.querySelectorAll('p, div, h1, h2, h3, h4, h5, h6, li, blockquote, pre, tr')
    .forEach(element => element.after('\n'));
  return content.textContent.replace(/\n{3,}/g, '\n\n').trim();
}

function reportChange() {
  document.dispatchEvent(new Event(savedArticlesChanged));
}

export function getSavedArticles() {
  const articles = [];
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(storagePrefix)) continue;
      const id = articleId(key.slice(storagePrefix.length));
      if (!id) continue;
      try {
        const record = JSON.parse(localStorage.getItem(key));
        if (typeof record?.title !== 'string' || !record.title.trim() ||
            typeof record.body !== 'string' || !Number.isFinite(record.savedAt)) continue;
        articles.push({ id, title: record.title, body: record.body, url: articleUrl(id), savedAt: record.savedAt });
      } catch {
        // A malformed entry should leave the remaining saved articles readable.
      }
    }
  } catch {
    return [];
  }
  return articles.sort((a, b) => b.savedAt - a.savedAt);
}

export function saveArticle({ id, title, body, isPrivate }) {
  const key = articleId(id);
  const name = typeof title === 'string' ? title.trim() : '';
  if (!key || !name || isPrivate) throw new Error('Article unavailable');
  const record = { title: name, body: articleText(body), savedAt: Date.now() };
  localStorage.setItem(storagePrefix + key, JSON.stringify(record));
  reportChange();
  return true;
}

export function removeArticle(value) {
  const id = articleId(value);
  if (!id || localStorage.getItem(storagePrefix + id) === null) return false;
  localStorage.removeItem(storagePrefix + id);
  reportChange();
  return true;
}

globalThis.window?.addEventListener('storage', event => {
  if (event.storageArea === localStorage && (event.key === null || event.key.startsWith(storagePrefix))) {
    reportChange();
  }
});
