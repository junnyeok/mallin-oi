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

function formatDateOnly(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function mapPostRow(row) {
  return {
    id: row.id,
    title: String(row.title || ''),
    excerpt: String(row.excerpt || ''),
    body: String(row.body || ''),
    category: normalizeCategory(row.category),
    date: formatDateOnly(row.created_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    views: Number(row.views || 0),
    pinned: !!row.pinned,
    tags: normalizeTags(row.tags),
    authorId: row.author_id || '',
    authorNickname: String(row.author_nickname || '익명'),
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
    .from('posts')
    .select(
      'id, title, excerpt, body, category, tags, pinned, views, author_id, author_nickname, created_at, updated_at',
    )
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapPostRow);
}

export async function loadPostById(id) {
  const safeId = Number(id);
  if (!Number.isFinite(safeId)) return null;

  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, title, excerpt, body, category, tags, pinned, views, author_id, author_nickname, created_at, updated_at',
    )
    .eq('id', safeId)
    .maybeSingle();

  if (error) throw error;
  return data ? mapPostRow(data) : null;
}

export async function loadPostsByAuthorId(authorId) {
  if (!authorId) return [];

  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, title, excerpt, body, category, tags, pinned, views, author_id, author_nickname, created_at, updated_at',
    )
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return (data || []).map(mapPostRow);
}
