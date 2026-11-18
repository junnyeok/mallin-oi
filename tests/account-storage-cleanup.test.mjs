import assert from 'node:assert/strict';
import test from 'node:test';
import { removeAccountUploads } from '../supabase/functions/delete-account/account-storage.mjs';

const account = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';

function storageFixture() {
  const buckets = {
    'profile-images': new Set([`${account}/profile.png`, `${other}/other.png`, `${account}0/neighbor.png`]),
    'post-assets': new Set([
      ...Array.from({ length: 223 }, (_, i) => `${account}/post-${i}.png`),
      `${account}/older/attachment.pdf`,
      `${other}/post.png`,
    ]),
  };
  const lists = [];
  const removals = [];
  const fixture = {
    buckets,
    lists,
    removals,
    failAtRemoval: null,
    ignoreRemovals: false,
    injectEntry: null,
    storage: {
      from(bucket) {
        const paths = buckets[bucket];
        assert.ok(paths, `Unexpected bucket ${bucket}`);
        return {
          async list(prefix, { limit, offset }) {
            lists.push({ bucket, prefix, offset });
            const grouped = new Map();
            for (const path of paths) {
              if (!path.startsWith(`${prefix}/`)) continue;
              const [name, ...rest] = path.slice(prefix.length + 1).split('/');
              grouped.set(name, { name, id: rest.length ? null : path });
            }
            const entries = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
            if (fixture.injectEntry) entries.unshift(fixture.injectEntry);
            return { data: entries.slice(offset, offset + limit), error: null };
          },
          async remove(batch) {
            removals.push({ bucket, batch });
            if (fixture.failAtRemoval === removals.length) return { error: new Error('storage failure') };
            if (!fixture.ignoreRemovals) batch.forEach((path) => paths.delete(path));
            return { error: null };
          },
        };
      },
    },
  };
  return fixture;
}

test('removes every page and nested upload in the authenticated account folders', async () => {
  const fixture = storageFixture();
  await removeAccountUploads(fixture.storage, account);
  assert.deepEqual([...fixture.buckets['profile-images']], [`${other}/other.png`, `${account}0/neighbor.png`]);
  assert.deepEqual([...fixture.buckets['post-assets']], [`${other}/post.png`]);
  assert.ok(fixture.lists.some(({ offset }) => offset === 200));
  assert.ok(fixture.lists.every(({ prefix }) => prefix === account || prefix.startsWith(`${account}/`)));
  assert.ok(fixture.removals.every(({ batch }) =>
    batch.length <= 100 && batch.every((path) => path.startsWith(`${account}/`))));
});

test('retries cleanly after some storage batches already succeeded', async () => {
  const fixture = storageFixture();
  fixture.failAtRemoval = 3;
  await assert.rejects(removeAccountUploads(fixture.storage, account), /storage failure/);
  assert.ok(fixture.buckets['post-assets'].size > 1 && fixture.buckets['post-assets'].size < 225);
  fixture.failAtRemoval = null;
  await removeAccountUploads(fixture.storage, account);
  assert.deepEqual([...fixture.buckets['post-assets']], [`${other}/post.png`]);
});

test('rejects invalid account paths and malformed entries before a remove', async () => {
  const fixture = storageFixture();
  await assert.rejects(removeAccountUploads(fixture.storage, `../${other}`), /Invalid account identifier/);
  assert.deepEqual(fixture.lists, []);
  fixture.injectEntry = { name: `../../${other}/other.png`, id: 'outside' };
  await assert.rejects(removeAccountUploads(fixture.storage, account), /Invalid storage entry name/);
  assert.deepEqual(fixture.removals, []);
});

test('fails when Storage reports success but the upload still exists', async () => {
  const fixture = storageFixture();
  fixture.ignoreRemovals = true;
  await assert.rejects(removeAccountUploads(fixture.storage, account), /uploads remain/);
});
