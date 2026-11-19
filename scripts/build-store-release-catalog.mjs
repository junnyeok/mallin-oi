import { writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const STORE_RELEASE_STATES = new Set(['판매 중', '무료 지급']);
const ITEM_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;
const CONTROL_CHARACTER_PATTERN = /\p{Cc}/u;
const MAX_ITEMS = 500;
const MAX_PRICE = 2147483647;

export function buildStoreReleaseCatalog(storeItems) {
  const releases = new Map();

  for (const item of storeItems) {
    if (item.isPurchasable !== true || !STORE_RELEASE_STATES.has(item.state)) {
      continue;
    }

    const { id, price } = item;
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    if (typeof id !== 'string' || id !== id.trim() || !ITEM_ID_PATTERN.test(id)) {
      throw new Error(`Invalid store release item ID: ${JSON.stringify(id)}`);
    }
    if (releases.has(id)) {
      throw new Error(`Duplicate store release item ID: ${id}`);
    }
    if (!name || Array.from(name).length > 120 || CONTROL_CHARACTER_PATTERN.test(name)) {
      throw new Error(`Invalid store release name for ${id}`);
    }
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      throw new Error(`Invalid store release price for ${id}`);
    }

    releases.set(id, { id, name, price: price === 0 ? null : price });
  }

  if (releases.size > MAX_ITEMS) {
    throw new Error(`Store release catalog supports at most ${MAX_ITEMS} items`);
  }

  const items = [...releases.keys()].sort().map((id) => releases.get(id));
  return { version: 1, items };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error('Usage: node scripts/build-store-release-catalog.mjs <output-path>');
  }

  globalThis.window = { location: new URL('https://mallin-oi.com/') };
  const { STORE_ITEMS } = await import('../assets/js/modules/store-data.js');
  const catalog = buildStoreReleaseCatalog(STORE_ITEMS);
  await writeFile(outputPath, `${JSON.stringify(catalog)}\n`, 'utf8');
}
