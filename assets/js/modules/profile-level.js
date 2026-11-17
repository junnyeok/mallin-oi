import { supabase } from './supabase-client.js';

const requests = new WeakMap();

export async function loadProfileLevel(userId, root = document.getElementById('profileLevel')) {
  if (!root) return;
  const request = {};
  requests.set(root, request);
  root.hidden = true;
  if (!userId) return;
  try {
    const {data, error} = await supabase.from('public_member_levels')
      .select('level,total_xp,level_xp,next_level_xp').eq('id', userId).maybeSingle();
    if (error) throw error;
    if (!root.isConnected || requests.get(root) !== request || !data) return;
    const total = Number(data.total_xp);
    const level = Number(data.level);
    const current = Number(data.level_xp);
    const required = Number(data.next_level_xp);
    if (![total, level, current, required].every(Number.isFinite) || total < 0 || level < 1 || required <= 0 || current < 0 || current >= required) return;
    const format = value => value.toLocaleString('ko-KR');
    root.querySelector('[data-level-badge]').textContent = `Lv. ${format(level)}`;
    root.querySelector('[data-level-total]').textContent = `총 ${format(total)} XP`;
    root.querySelector('[data-level-detail]').textContent = `${format(current)} / ${format(required)} XP`;
    root.querySelector('[data-level-remaining]').textContent = `다음 레벨까지 ${format(required - current)} XP`;
    const progress = root.querySelector('progress');
    progress.max = required;
    progress.value = current;
    progress.setAttribute('aria-label', `레벨 ${level}, 다음 레벨 경험치 ${format(current)} / ${format(required)}`);
    root.hidden = false;
  } catch (error) {
    console.warn('[profile] level load failed:', error?.message || error);
  }
}
