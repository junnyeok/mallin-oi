import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const readModule = async (name) => (
  await readFile(new URL(`../assets/js/modules/${name}.js`, import.meta.url), 'utf8')
).replace(/^import .*\n/gm, '').replace(/^export /gm, '');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const rows = Array.from({ length: 25 }, (_, index) => ({
  id: 25 - index,
  category: 'career',
  title: `글 ${25 - index}`,
  author_id: index ? 'allowed' : 'blocked',
}));

const repoSource = await readModule('posts-repo');

function fixture({ getRows, getBlockedMemberIds, rpc = () => assert.fail('unexpected RPC') }) {
  const reads = [];
  const supabase = {
    rpc,
    from(table) {
      assert.equal(table, 'posts_public_list');
      const read = { fields: '', orders: [], filters: [] };
      const query = {
        select(fields) { read.fields = fields; return query; },
        eq(...filter) { read.filters.push(filter); return query; },
        order(field) { read.orders.push(field); return query; },
        range(start, end) { read.range = [start, end]; return query; },
        then(resolve, reject) {
          reads.push(read);
          return Promise.resolve(getRows(read)).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const repo = runInNewContext(repoSource + `
    ({ loadLatestPosts, loadPostSummaries, fillPostCommentCounts, loadPostById });
  `, { supabase, getBlockedMemberIds });
  return { repo, reads };
}

test('latest posts start reading rows while block data is pending and fill the twelve visible slots', async () => {
  const blocked = deferred();
  const firstRows = deferred();
  const { repo, reads } = fixture({
    getBlockedMemberIds: () => blocked.promise,
    getRows: ({ range }) => range[0] === 0 ? firstRows.promise : { data: rows.slice(range[0], range[1] + 1) },
  });
  const result = repo.loadLatestPosts({ category: 'career' });
  await Promise.resolve();
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0].range, [0, 11]);
  assert.deepEqual(reads[0].filters, [['category', 'career']]);
  assert.deepEqual(reads[0].orders, ['created_at', 'id']);
  assert.doesNotMatch(reads[0].fields, /media_items|excerpt|tags/);
  firstRows.resolve({ data: rows.slice(0, 12) });
  blocked.resolve(new Set(['blocked']));

  const posts = await result;
  assert.deepEqual(reads[1].range, [12, 23]);
  assert.deepEqual(Array.from(posts, ({ id }) => id), Array.from({ length: 12 }, (_, index) => 24 - index));
  assert.ok(posts.every((post) => post.commentCount === null));
});

test('two article navigation widgets share a lightweight request for the same page', async () => {
  const { repo, reads } = fixture({
    getBlockedMemberIds: async () => new Set(['blocked']),
    getRows: () => ({ data: rows }),
  });
  const view = {};
  const otherPosts = repo.loadPostSummaries(view);
  assert.equal(repo.loadPostSummaries(view), otherPosts);
  const posts = await otherPosts;
  assert.equal(reads.length, 1);
  assert.doesNotMatch(reads[0].fields, /media_items/);
  assert.equal(posts.length, 24);
  await repo.loadPostSummaries(view);
  assert.equal(reads.length, 2);
});

test('comment counts are requested only for uncached rows and an overlapping batch reuses the request', async () => {
  const wait = deferred();
  const requested = [];
  const { repo } = fixture({
    getBlockedMemberIds: async () => new Set(),
    getRows: () => ({ data: rows }),
    rpc(name, { p_post_ids }) {
      assert.equal(name, 'get_post_comment_counts');
      requested.push(Array.from(p_post_ids));
      return wait.promise;
    },
  });
  const posts = await repo.loadPostSummaries();
  const first = repo.fillPostCommentCounts(posts.slice(0, 2));
  const overlap = repo.fillPostCommentCounts(posts.slice(1, 3));
  assert.deepEqual(requested, [[25, 24], [23]]);
  wait.resolve({ data: [{ post_id: 25, comment_count: 3 }] });
  await Promise.all([first, overlap]);
  assert.deepEqual(Array.from(posts.slice(0, 4), ({ commentCount }) => commentCount), [3, 0, 0, null]);
  await repo.fillPostCommentCounts(posts.slice(0, 3));
  assert.equal(requested.length, 2);
});

test('the home list renders links without waiting for their comments count', async () => {
  const list = { isConnected: true, innerHTML: '' };
  const hydrated = deferred();
  const updateStarted = deferred();
  const fakePost = { id: 25, url: './post.html?id=25', title: '최신 글' };
  const homeSource = await readModule('posts-ui');
  const init = runInNewContext(homeSource + '\ninitPostsUI', {
    document: {
      body: { dataset: { page: 'home' } },
      querySelector: (selector) => selector === '#latestList' ? list : null,
    },
    loadLatestPosts: async () => [fakePost],
    updatePostListCommentCounts(posts, container) {
      assert.equal(posts[0], fakePost);
      assert.equal(container, list);
      updateStarted.resolve();
      return hydrated.promise;
    },
    renderPostListCommentCount: () => '–',
    getDisplayViews: () => 0,
    formatMMDD: () => '11/22',
    console,
  });
  const rendered = init();
  await updateStarted.promise;
  await rendered;
  assert.match(list.innerHTML, /post\.html\?id=25/);
  assert.match(list.innerHTML, /최신 글/);
  hydrated.resolve();
});
