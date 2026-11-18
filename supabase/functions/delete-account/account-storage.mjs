const ACCOUNT_BUCKETS = ['profile-images', 'post-assets'];
const PAGE_SIZE = 100;
const ACCOUNT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function isStorageEntryName(name) {
  return typeof name === 'string' && name.length > 0
    && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\');
}

async function listPage(bucket, prefix, offset) {
  const { data, error } = await bucket.list(prefix, {
    limit: PAGE_SIZE,
    offset,
    sortBy: { column: 'name', order: 'asc' },
  });
  if (error) throw error;
  if (!Array.isArray(data)) throw new Error('Invalid storage listing');
  return data;
}

async function collectFilePaths(bucket, userId) {
  const paths = [];
  const folders = [userId];
  for (const prefix of folders) {
    let offset = 0;
    for (;;) {
      const items = await listPage(bucket, prefix, offset);
      for (const item of items) {
        if (!isStorageEntryName(item.name)) throw new Error('Invalid storage entry name');
        const path = `${prefix}/${item.name}`;
        if (item.id === null) folders.push(path);
        else if (typeof item.id === 'string' && item.id) paths.push(path);
        else throw new Error('Invalid storage entry');
      }
      if (items.length < PAGE_SIZE) break;
      offset += items.length;
    }
  }
  return paths;
}

export async function removeAccountUploads(storage, userId) {
  if (typeof userId !== 'string' || !ACCOUNT_ID.test(userId)) {
    throw new Error('Invalid account identifier');
  }
  for (const name of ACCOUNT_BUCKETS) {
    // The authenticated client also enforces the user's folder through Storage RLS.
    const bucket = storage.from(name);
    const paths = await collectFilePaths(bucket, userId);
    for (let i = 0; i < paths.length; i += PAGE_SIZE) {
      const { error } = await bucket.remove(paths.slice(i, i + PAGE_SIZE));
      if (error) throw error;
    }
    if ((await listPage(bucket, userId, 0)).length > 0) {
      throw new Error('Account uploads remain after cleanup');
    }
  }
}
