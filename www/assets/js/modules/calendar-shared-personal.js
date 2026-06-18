import { supabase } from './supabase-client.js';

const CALENDAR_LABELS = {
  study: '자기개발',
  work: '업무',
  event: '이벤트',
};

function isAllowed(group, calendarType) {
  return Boolean(group?.[`allow_${calendarType}`]);
}

export async function fetchSharedPersonalGroups(calendarType) {
  const { data, error } = await supabase.rpc('get_my_calendar_groups');

  if (error) {
    console.error('[calendar-shared-personal] groups load failed:', error.message);
    throw error;
  }

  return (data || []).filter((group) => isAllowed(group, calendarType));
}

export function getSharedPersonalValue({ enabled, groupId }) {
  const isSharedPersonal = Boolean(enabled && groupId);

  return {
    isSharedPersonal,
    sharedGroupId: isSharedPersonal ? groupId : null,
  };
}

export function createSharedPersonalControls({
  prefix,
  groups = [],
  category = {},
  selectLabel = '우리 일정 그룹 선택',
}) {
  const wrap = document.createElement('div');
  wrap.className = `${prefix}-category-shared calendar-category-shared`;

  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'calendar-category-shared__toggle';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = Boolean(category.is_shared_personal);

  const labelText = document.createElement('span');
  labelText.textContent = '우리 일정';

  toggleLabel.append(checkbox, labelText);

  const select = document.createElement('select');
  select.className = 'calendar-category-shared__select';
  select.setAttribute('aria-label', selectLabel);

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = groups.length > 0 ? '그룹 선택' : '선택 가능한 그룹 없음';
  select.append(placeholder);

  groups.forEach((group) => {
    const option = document.createElement('option');
    option.value = group.id;
    option.textContent = group.name;
    select.append(option);
  });

  if (groups.some((group) => group.id === category.shared_group_id)) {
    select.value = category.shared_group_id;
  }

  function syncSelectState() {
    select.hidden = !checkbox.checked;
    select.disabled = !checkbox.checked || groups.length === 0;
  }

  checkbox.addEventListener('change', syncSelectState);
  syncSelectState();

  wrap.append(toggleLabel, select);

  return {
    element: wrap,
    getValue() {
      return getSharedPersonalValue({
        enabled: checkbox.checked,
        groupId: select.value,
      });
    },
    reset() {
      checkbox.checked = false;
      select.value = '';
      syncSelectState();
    },
  };
}

export function getSharedPersonalGroupName(category, groups = []) {
  if (!category?.is_shared_personal || !category.shared_group_id) return '';

  return groups.find((group) => group.id === category.shared_group_id)?.name || '';
}

export function getCalendarLabel(calendarType) {
  return CALENDAR_LABELS[calendarType] || '캘린더';
}
