import { supabase } from './supabase-client.js';
import { initSiteStats } from './site-stats.js';

const PUBLIC_PEOPLE_FIELDS = 'id,nickname,profile_image_url,equipped_character_image_url,equipped_character_effect_item_id,equipped_profile_background_item_id,equipped_profile_frame_item_id,total_xp,level,level_xp,next_level_xp';

export function escapeNicknameSearch(value) {
  return String(value || '').trim().slice(0, 80).replace(/[\\%_]/g, '\\$&');
}

function normalizeItems(rows) {
  return (Array.isArray(rows) ? rows : []).filter(row => row?.user_id || row?.id).map(row => ({
    user_id: String(row.user_id || row.id),
    nickname: String(row.nickname || '').trim() || '이름 없는 회원',
    avatar_url: String(row.avatar_url || row.profile_image_url || ''),
    character_image_url: String(row.equipped_character_image_url || ''),
    effect_item_id: String(row.equipped_character_effect_item_id || ''),
    background_item_id: String(row.equipped_profile_background_item_id || ''),
    frame_item_id: String(row.equipped_profile_frame_item_id || ''),
    total_xp: Number(row.total_xp) || 0, level: Number(row.level) || 1,
    level_xp: Number(row.level_xp) || 0, next_level_xp: Number(row.next_level_xp) || 100,
  }));
}

export async function loadSitePeople({view = 'members', search = '', offset = 0, limit = 24} = {}) {
  const pageSize = Math.min(48, Math.max(1, Math.floor(Number(limit) || 24)));
  const start = Math.max(0, Math.floor(Number(offset) || 0));
  const query = String(search || '').trim().slice(0, 80);

  if (view === 'today') {
    const {data: auth, error: authError} = await supabase.auth.getSession();
    if (authError) throw authError;
    if (!auth?.session?.user?.id) {
      return {items: [], total: 0, access: 'login_required'};
    }
    await initSiteStats();
    const [{data, error}, stats] = await Promise.all([
      supabase.rpc('get_today_site_people', {p_search: query, p_offset: start, p_limit: pageSize}),
      supabase.rpc('get_site_stats'),
    ]);
    if (error) {
      if (error.code === '42501') return {items: [], total: 0, access: 'login_required'};
      throw error;
    }
    const result = Array.isArray(data) ? data[0] : data;
    const rows = Array.isArray(result?.items) ? result.items : [];
    let equipment = [];
    if (rows.length) {
      const response = await supabase.from('public_member_levels').select(PUBLIC_PEOPLE_FIELDS)
        .in('id', rows.map(row => row.user_id));
      if (response.error) throw response.error;
      equipment = response.data || [];
    }
    const byId = new Map(equipment.map(row => [row.id, row]));
    const summary = Array.isArray(stats.data) ? stats.data[0] : stats.data;
    const todayVisitCount = !stats.error && Number.isFinite(Number(summary?.today_visit_count))
      ? Number(summary.today_visit_count) : undefined;
    return {
      items: normalizeItems(rows.map(row => ({...row, ...byId.get(row.user_id)}))), total: Math.max(0, Number(result?.total) || 0),
      guestCount: Math.max(0, Number(result?.guestCount) || 0),
      date: String(result?.date || ''), todayVisitCount, access: 'allowed',
    };
  }

  let request = supabase.from('public_member_levels')
    .select(PUBLIC_PEOPLE_FIELDS, {count: 'exact'});
  if (query) request = request.ilike('nickname', `%${escapeNicknameSearch(query)}%`);
  const {data, count, error} = await request.order('total_xp', {ascending: false}).order('nickname', {ascending: true, nullsFirst: false})
    .order('id', {ascending: true}).range(start, start + pageSize - 1);
  if (error) throw error;
  return {items: normalizeItems(data), total: Math.max(0, Number(count) || 0), access: 'allowed'};
}
