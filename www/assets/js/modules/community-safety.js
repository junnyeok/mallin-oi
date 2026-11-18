import { supabase } from './supabase-client.js';
import { getCurrentUser, requireLogin } from './auth-store.js';

const reportReasons = new Map([
  ['abuse', '괴롭힘·혐오·폭력 또는 부적절한 내용'],
  ['spam', '스팸·사기'],
  ['child-safety', '아동 안전을 위협하는 내용'],
  ['other', '그 외 운영 기준 위반'],
]);
const labels = {
  post: '게시글',
  comment: '댓글',
  member: '회원',
  suggestion: '건의사항',
  'suggestion-reply': '건의사항 답변',
  qna: '질문',
  'qna-reply': '질문 답변',
};

let blockCache = null;

export async function getBlockedMemberIds() {
  const user = await getCurrentUser();
  if (!user) return new Set();
  if (blockCache?.userId === user.id) return blockCache.result;

  const result = (async () => {
    const { data, error } = await supabase.from('community_member_blocks').select('blocked_id');
    if (error) {
      blockCache = null;
      console.warn('[community] could not load blocked members:', error.code);
      return new Set();
    }
    return new Set(data.map(({ blocked_id }) => blocked_id));
  })();
  blockCache = { userId: user.id, result };
  return result;
}

export async function withoutBlockedMembers(rows, authorId = (row) => row.author_id) {
  const blocked = await getBlockedMemberIds();
  return rows.filter((row) => !blocked.has(authorId(row)));
}

function element(tag, text = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  return node;
}

function button(label, action) {
  const node = element('button', label);
  node.type = 'button';
  node.className = 'community-safety__button';
  node.addEventListener('click', action);
  return node;
}

export async function showCommunityReport({ kind, id, secretPassword = null }) {
  if (!(await requireLogin())) return;

  const dialog = element('dialog');
  dialog.className = 'community-safety__dialog';
  dialog.setAttribute('aria-labelledby', 'community-report-title');
  const title = element('h2', labels[kind] + ' 신고');
  title.id = 'community-report-title';
  const form = element('form');
  const label = element('label', '신고 사유');
  const reason = element('select');
  reason.required = true;
  reason.append(new Option('사유 선택', ''));
  for (const [value, text] of reportReasons) reason.append(new Option(text, value));
  label.append(reason);
  const status = element('p');
  status.setAttribute('role', 'status');
  const actions = element('div');
  actions.className = 'community-safety__actions';
  const submit = element('button', '신고 제출');
  submit.className = 'community-safety__button';
  submit.type = 'submit';
  actions.append(button('닫기', () => dialog.close()), submit);
  const notice = element('p', '신고 대상과 사유는 운영자가 검토할 수 있어요.');
  form.append(notice, label, status, actions);
  dialog.append(title, form);
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    const { error } = await supabase.rpc('report_community_content', {
      p_target_kind: kind,
      p_target_id: String(id),
      p_reason: reason.value,
      p_secret_password: secretPassword || null,
    });
    status.textContent = error
      ? (error.code === '54000' ? '오늘 신고 횟수를 모두 사용했어요.' : '신고를 접수하지 못했어요.')
      : '신고를 접수했어요. 운영자가 확인할게요.';
    if (error) submit.disabled = false;
    else reason.disabled = true;
  });
  document.body.append(dialog);
  dialog.showModal();
}

export async function mountCommunityActions(container, { authorId, kind, id, secretPassword = null, onBlock }) {
  if (!container) return;
  container.replaceChildren();
  const user = await getCurrentUser();
  if (user?.id === authorId) return;
  const blocked = await getBlockedMemberIds();
  if (!blocked.has(authorId) && id) {
    container.append(button(labels[kind] + ' 신고', () =>
      showCommunityReport({ kind, id, secretPassword })));
  }
  if (authorId) {
    const isBlocked = blocked.has(authorId);
    const change = button(isBlocked ? '차단 해제' : '회원 차단', async () => {
      if (!(await requireLogin())) return;
      if (!isBlocked && !confirm('이 회원의 글과 댓글을 숨길까요?')) return;
      change.disabled = true;
      const { error } = isBlocked
        ? await supabase.from('community_member_blocks').delete().eq('blocked_id', authorId)
        : await supabase.from('community_member_blocks').insert({ blocked_id: authorId });
      if (error && error.code !== '23505') {
        alert('차단 상태를 변경하지 못했어요.');
        change.disabled = false;
        return;
      }
      blockCache = null;
      onBlock?.(isBlocked);
    });
    container.append(change);
  }
}

export async function mountCommunitySettings(container, isAdmin) {
  if (!container) return;
  const blocked = await getBlockedMemberIds();
  const details = element('details');
  details.append(element('summary', '차단한 회원'));
  if (!blocked.size) details.append(element('p', '차단한 회원이 없어요.'));
  else {
    const { data } = await supabase.from('public_profiles').select('id,nickname').in('id', [...blocked]);
    for (const id of blocked) {
      const row = element('div');
      row.className = 'community-safety__row';
      const link = element('a', data?.find((member) => member.id === id)?.nickname || '차단한 회원');
      link.href = './profile.html?user=' + encodeURIComponent(id);
      row.append(link, button('차단 해제', async (event) => {
        const control = event.currentTarget;
        control.disabled = true;
        const { error } = await supabase.from('community_member_blocks').delete().eq('blocked_id', id);
        if (error) {
          control.disabled = false;
          alert('차단을 해제하지 못했어요.');
          return;
        }
        blockCache = null;
        row.remove();
        blocked.delete(id);
        if (!blocked.size) details.append(element('p', '차단한 회원이 없어요.'));
      }));
      details.append(row);
    }
  }
  container.replaceChildren(details);
  if (isAdmin) mountReportQueue(container);
}

function mountReportQueue(container) {
  const details = element('details');
  const list = element('div');
  details.append(element('summary', '신고 관리'), list);
  container.append(details);
  details.addEventListener('toggle', async () => {
    if (!details.open) return;
    const { data, error } = await supabase
      .from('community_reports')
      .select('id,target_kind,target_id,post_id,inquiry_thread_id,reason,created_at')
      .eq('resolved', false)
      .order('created_at', { ascending: true })
      .limit(100);
    list.replaceChildren();
    if (error || !data.length) {
      list.append(element('p', error ? '신고를 불러오지 못했어요.' : '처리 대기 중인 신고가 없어요.'));
      return;
    }
    for (const item of data) {
      const row = element('div');
      row.className = 'community-safety__row';
      const target = element('a', labels[item.target_kind] + ' #' + item.target_id);
      if (item.inquiry_thread_id) {
        const board = item.target_kind.startsWith('qna') ? 'qna' : 'suggestion';
        const base = window.Capacitor?.isNativePlatform?.() ? 'https://mallin-oi.com/' : window.location.href;
        const url = new URL(board + '.html', base);
        url.searchParams.set('thread', item.inquiry_thread_id);
        target.href = url.href;
      } else if (item.target_kind === 'member') {
        target.href = './profile.html?user=' + encodeURIComponent(item.target_id);
      } else {
        target.href = './post.html?id=' + encodeURIComponent(item.post_id) +
          (item.target_kind === 'comment' ? '&comment=' + encodeURIComponent(item.target_id) : '');
      }
      const date = new Date(item.created_at).toLocaleDateString('ko-KR');
      row.append(target, element('span', reportReasons.get(item.reason)), element('time', date),
        button('검토 완료', async (event) => {
          const control = event.currentTarget;
          control.disabled = true;
          const { error } = await supabase.from('community_reports').update({ resolved: true }).eq('id', item.id);
          if (error) {
            control.disabled = false;
            alert('신고를 처리하지 못했어요.');
            return;
          }
          row.remove();
          if (!list.childElementCount) list.append(element('p', '목록을 다시 열어 남은 신고를 확인하세요.'));
        }));
      if (item.target_kind !== 'member') {
        const preview = element('details');
        const body = element('p');
        body.className = 'community-safety__preview';
        preview.append(element('summary', '내용 확인'), body);
        preview.addEventListener('toggle', async () => {
          if (!preview.open) return;
          const { data, error } = await supabase.rpc('read_community_report_content', {
            p_report_id: item.id,
          });
          body.textContent = error ? '내용을 읽지 못했어요.' : data || '현재 확인할 본문이 없어요.';
        });
        row.append(preview);
      }
      list.append(row);
    }
  });
}
