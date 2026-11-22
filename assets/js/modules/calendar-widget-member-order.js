function widgetMemberOrderKey({ userId, groupId, calendarType }) {
  if (!userId || !groupId || !['study', 'work', 'event'].includes(calendarType)) return null;
  return `mallin_calendar_widget_member_order:${userId}:${calendarType}:${groupId}`;
}

function validMemberIds(ids, userId) {
  if (!Array.isArray(ids)) return [];
  return [...new Set(ids.filter(id => typeof id === 'string' && id && id !== userId))];
}

export function readWidgetMemberOrder(scope) {
  const key = widgetMemberOrderKey(scope);
  if (!key) return [];
  try {
    return validMemberIds(JSON.parse(globalThis.localStorage.getItem(key)), scope.userId);
  } catch {
    return [];
  }
}

export function saveWidgetMemberOrder(scope, ids) {
  const key = widgetMemberOrderKey(scope);
  if (!key) throw new Error('Missing widget member order scope');
  globalThis.localStorage.setItem(key, JSON.stringify(validMemberIds(ids, scope.userId)));
}

export function orderWidgetMembers(roster, userId, savedIds = []) {
  const ranks = new Map(savedIds.map((id, index) => [id, index]));
  if (userId) ranks.set(userId, -1);
  const rank = member => ranks.get(member.user_id) ?? savedIds.length;
  return [...roster].sort((a, b) =>
    rank(a) - rank(b) || (a.nickname || '').localeCompare(b.nickname || '', 'ko'));
}
