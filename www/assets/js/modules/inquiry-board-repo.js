// assets/js/modules/inquiry-board-repo.js
import { supabase } from './supabase-client.js';

function getPrefix(boardType) {
  return boardType === 'qna' ? 'qna' : 'suggestion';
}

export async function loadBoardThreads(boardType) {
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`list_${prefix}_threads`);
  if (error) throw error;
  return data || [];
}

export async function loadBoardReplies(boardType, threadIds = []) {
  if (!Array.isArray(threadIds) || !threadIds.length) return [];
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`list_${prefix}_replies`, {
    p_thread_ids: threadIds,
  });
  if (error) throw error;
  return data || [];
}

export async function createBoardThread(boardType, payload) {
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`create_${prefix}_thread`, {
    p_body: payload.body,
    p_is_secret: !!payload.is_secret,
    p_secret_password: payload.secret_password || '',
  });
  if (error) throw error;
  return data;
}

export async function deleteBoardThread(boardType, threadId) {
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`delete_${prefix}_thread`, {
    p_thread_id: threadId,
  });
  if (error) throw error;
  return data;
}

export async function unlockBoardThread(boardType, threadId, password) {
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`unlock_${prefix}_thread`, {
    p_thread_id: threadId,
    p_secret_password: password || '',
  });
  if (error) throw error;
  return data || null;
}

export async function createBoardReply(boardType, threadId, body) {
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`create_${prefix}_reply`, {
    p_thread_id: threadId,
    p_body: body,
  });
  if (error) throw error;
  return data;
}

export async function deleteBoardReply(boardType, replyId) {
  const prefix = getPrefix(boardType);
  const { data, error } = await supabase.rpc(`delete_${prefix}_reply`, {
    p_reply_id: replyId,
  });
  if (error) throw error;
  return data;
}

export function groupRepliesByThread(replyRows = [], keyName = 'thread_id') {
  const map = new Map();

  replyRows.forEach((row) => {
    const key = Number(row[keyName]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  });

  return map;
}
