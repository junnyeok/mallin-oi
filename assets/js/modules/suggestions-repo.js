// assets/js/modules/suggestions-repo.js
import { supabase } from './supabase-client.js';

export async function loadSuggestions() {
  const { data, error } = await supabase
    .from('suggestions')
    .select('id, body, author_id, author_nickname, created_at')
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function insertSuggestion(payload) {
  const { error } = await supabase.from('suggestions').insert(payload);
  if (error) throw error;
}

export async function updateSuggestion(suggestionId, body) {
  const { error } = await supabase
    .from('suggestions')
    .update({ body })
    .eq('id', suggestionId);

  if (error) throw error;
}

export async function deleteSuggestion(suggestionId) {
  const { error } = await supabase
    .from('suggestions')
    .delete()
    .eq('id', suggestionId);

  if (error) throw error;
}

export async function loadSuggestionReplies(suggestionIds = []) {
  if (!suggestionIds.length) return [];

  const { data, error } = await supabase
    .from('suggestion_admin_comments')
    .select('id, suggestion_id, body, author_id, author_nickname, created_at')
    .in('suggestion_id', suggestionIds)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function insertSuggestionReply(payload) {
  const { error } = await supabase
    .from('suggestion_admin_comments')
    .insert(payload);

  if (error) throw error;
}

export async function deleteSuggestionReply(replyId) {
  const { error } = await supabase
    .from('suggestion_admin_comments')
    .delete()
    .eq('id', replyId);

  if (error) throw error;
}

export function groupRepliesBySuggestion(replyRows = []) {
  const map = new Map();

  replyRows.forEach((row) => {
    const key = Number(row.suggestion_id);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });

  return map;
}
