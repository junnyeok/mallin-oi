import { supabase } from './supabase-client.js';

export const ALLOWED_CATEGORIES = new Set(['study', 'work', 'event', 'career']);

function normalizeCategory(category) {
  const value = String(category || '')
    .trim()
    .toLowerCase();

  return ALLOWED_CATEGORIES.has(value) ? value : 'study';
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return [
      ...new Set(tags.map((t) => String(t || '').trim()).filter(Boolean)),
    ];
  }

  if (typeof tags === 'string') {
    return [
      ...new Set(
        tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      ),
    ];
  }

  return [];
}

function normalizeMediaItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      id: String(item?.id || ''),
      type: String(item?.type || '').trim(),
      title: String(item?.title || '').trim(),
      url: String(item?.url || '').trim(),
      path: String(item?.path || '').trim(),
      fileName: String(item?.fileName || '').trim(),
      mimeType: String(item?.mimeType || '').trim(),
      size: Number(item?.size || 0),
    }))
    .filter((item) => item.type && (item.url || item.path));
}

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function createCommentCountMap(rows = []) {
  const map = new Map();

  rows.forEach((row) => {
    const postId = Number(row?.post_id || 0);
    const count = Number(row?.comment_count || 0);

    if (!Number.isFinite(postId) || postId <= 0) return;
    map.set(postId, Number.isFinite(count) ? count : 0);
  });

  return map;
}

async function loadCommentCountMap(postIds = []) {
  const safeIds = [
    ...new Set(
      postIds
        .map((id) => Number(id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  ];

  if (!safeIds.length) return new Map();

  const { data, error } = await supabase.rpc('get_post_comment_counts', {
    p_post_ids: safeIds,
  });

  if (error) throw error;

  return createCommentCountMap(data || []);
}

export function mapPostRow(row, commentCount = 0) {
  const mediaItems = normalizeMediaItems(row?.media_items);
  const isPrivate = !!row?.is_private;
  const isUnlocked = isPrivate ? row?.is_unlocked === true : true;
  const safeBody = isUnlocked ? String(row?.body || '') : '';

  return {
    id: row.id,
    title: String(row?.title || ''),
    excerpt: String(row?.excerpt || ''),
    body: safeBody,
    category: normalizeCategory(row?.category),
    date: formatDateOnly(row?.created_at),
    createdAt: row?.created_at,
    updatedAt: row?.updated_at,
    views: Number(row?.views || 0),
    likesCount: Number(row?.likes_count || 0),
    commentCount: Number(commentCount || 0),
    pinned: !!row?.pinned,
    tags: normalizeTags(row?.tags),
    mediaItems,
    hasAttachments: mediaItems.length > 0,
    authorId: row?.author_id || '',
    authorNickname: String(row?.author_nickname || '익명'),
    isPrivate,
    isUnlocked,
    url: `./post.html?id=${encodeURIComponent(row.id)}`,
  };
}

export function formatMMDD(dateStr) {
  const d = new Date(dateStr);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}/${dd}`;
}

export function getIdNum(id) {
  return Number(id || 0);
}

export function sortByDateDesc(posts) {
  return [...posts].sort((a, b) => {
    const bt = new Date(b.createdAt || b.date || 0).getTime();
    const at = new Date(a.createdAt || a.date || 0).getTime();
    if (bt !== at) return bt - at;

    const bn = getIdNum(b.id);
    const an = getIdNum(a.id);
    if (bn !== an) return bn - an;

    return String(b.title || '').localeCompare(String(a.title || ''), 'ko');
  });
}

export async function loadPosts() {
  const { data, error } = await supabase
    .from('posts_public_list')
    .select(
      'id, title, excerpt, category, tags, pinned, views, likes_count, media_items, author_id, author_nickname, created_at, updated_at, is_private',
    )
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const rows = data || [];
  const commentCountMap = await loadCommentCountMap(rows.map((row) => row.id));

  return rows.map((row) =>
    mapPostRow(
      {
        ...row,
        body: '',
        is_unlocked: !row.is_private,
      },
      commentCountMap.get(Number(row.id)) || 0,
    ),
  );
}

export async function loadPostById(id, secretPassword = null) {
  const safeId = Number(id);
  if (!Number.isFinite(safeId)) return null;

  const { data, error } = await supabase.rpc('get_post_detail', {
    p_post_id: safeId,
    p_secret_password: secretPassword || null,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const commentCountMap = await loadCommentCountMap([safeId]);
  return mapPostRow(row, commentCountMap.get(safeId) || 0);
}

export async function loadEditablePostById(id) {
  const safeId = Number(id);
  if (!Number.isFinite(safeId)) return null;

  const { data, error } = await supabase.rpc('get_post_for_edit', {
    p_post_id: safeId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    ...row,
    tags: normalizeTags(row.tags),
    media_items: normalizeMediaItems(row.media_items),
    is_private: !!row.is_private,
  };
}

export async function loadPostsByAuthorId(authorId) {
  if (!authorId) return [];

  const { data, error } = await supabase
    .from('posts_public_list')
    .select(
      'id, title, excerpt, category, tags, pinned, views, likes_count, media_items, author_id, author_nickname, created_at, updated_at, is_private',
    )
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const rows = data || [];
  const commentCountMap = await loadCommentCountMap(rows.map((row) => row.id));

  return rows.map((row) =>
    mapPostRow(
      {
        ...row,
        body: '',
        is_unlocked: true,
      },
      commentCountMap.get(Number(row.id)) || 0,
    ),
  );
}
