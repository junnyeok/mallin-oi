// Read-only summaries of the same records already loaded by each preview.
// No extra requests, storage, or account writes.
export function summarizePreview(store = {}, todayKey) {
  const monthKey = todayKey.slice(0, 7);
  const entries = Object.entries(store)
    .filter(([date]) => date.startsWith(monthKey + '-'))
    .flatMap(([date, todos]) => todos.map((todo) => ({
      ...todo,
      date,
      time: todo.todoTime || todo.eventTime || todo.startTime || '',
    })))
    .sort((a, b) => a.date.localeCompare(b.date) ||
      (a.time || '99:99').localeCompare(b.time || '99:99'));
  return {
    total: entries.length,
    today: entries.filter((item) => item.date === todayKey).length,
    done: entries.filter((item) => item.done).length,
    remainingDays: new Set(entries.filter((item) => item.date >= todayKey).map((item) => item.date)).size,
    upcoming: entries.filter((item) => item.date >= todayKey && !item.done).slice(0, 3),
  };
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function compactPreviewCalendar(root, kind) {
  // A preview stays compact even on a busy day. The surrounding calendar link
  // opens the complete schedule; the extra count keeps omitted items visible.
  root.querySelectorAll(`.${kind}-calendar-day__badges`).forEach((wrap) => {
    const badges = [...wrap.querySelectorAll(`.${kind}-calendar-day__badge`)];
    if (badges.length <= 3) return;
    let count = 0;
    for (const child of wrap.children) {
      if (child.classList.contains(`${kind}-calendar-day__badge`)) count += 1;
      if (count > 3) child.hidden = true;
    }
    const more = element('span', 'section-calendar__more', `+${badges.length - 3}개 더 보기`);
    wrap.append(more);
  });
}

export function renderPreviewSummary(kind, {
  store = {}, todayKey = '', categories = [], status = 'ready',
} = {}) {
  const root = document.querySelector(`[data-calendar-summary="${kind}"]`);
  const upcomingRoot = document.querySelector(`[data-calendar-upcoming="${kind}"]`);
  if (!root || !upcomingRoot) return;
  root.replaceChildren();
  upcomingRoot.replaceChildren();
  root.setAttribute('aria-busy', 'false');

  if (status !== 'ready') {
    const message = status === 'error'
      ? '일정을 불러오지 못했어요. 페이지를 새로고침해 다시 확인해줘.'
      : '로그인하면 내 일정의 요약을 볼 수 있어요.';
    root.append(element('p', 'section-note', message));
    upcomingRoot.append(element('p', 'section-note', status === 'error'
      ? '연결이 복구되면 내 일정을 다시 확인할 수 있어요.'
      : '내 계정에 저장된 일정만 이곳에 표시돼요.'));
    const link = element('a', 'section-summary-link', status === 'error' ? '캘린더 열기 →' : '로그인하기 →');
    link.href = status === 'error' ? `./calendar-${kind}.html` : './login.html';
    root.append(link);
    return;
  }

  const summary = summarizePreview(store, todayKey);
  const stats = element('dl', 'section-stats');
  const third = kind === 'study'
    ? ['완료한 실천', summary.done]
    : ['남은 일정일', summary.remainingDays];
  for (const [label, value] of [['이번 달 일정', summary.total], ['오늘 일정', summary.today], third]) {
    const item = element('div', '');
    item.append(element('dt', '', label), element('dd', '', String(value)));
    stats.append(item);
  }
  root.append(stats, element('p', 'section-note', '이번 달 · 내 계정의 저장된 일정 기준'));

  if (!summary.upcoming.length) {
    upcomingRoot.append(element('p', 'section-note', '이번 달 남은 미완료 일정이 없어요. 캘린더에서 새로운 일정을 기록해봐.'));
    return;
  }
  const list = element('ul', 'section-agenda');
  for (const todo of summary.upcoming) {
    const category = categories.find((item) => item.id === todo.categoryId || item.slug === todo.type);
    const title = kind === 'work' ? category?.name || todo.text : todo.text;
    const item = element('li', '');
    const link = element('a', '');
    link.href = `./calendar-${kind}.html`;
    const date = element('time', '', todo.date === todayKey ? '오늘' : `${Number(todo.date.slice(5, 7))}/${Number(todo.date.slice(8))}`);
    date.dateTime = todo.date;
    const body = element('span', 'section-agenda__body');
    body.append(element('strong', '', title || '일정'));
    // Work start time can inherit from a category; avoid claiming it is unset.
    const timeLabel = kind === 'work' ? '상세 캘린더에서 근무 시간 확인' : todo.time || '시간 미지정';
    body.append(element('small', '', timeLabel));
    link.append(date, body);
    item.append(link);
    list.append(item);
  }
  upcomingRoot.append(list);
}
