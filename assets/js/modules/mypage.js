// assets/js/modules/mypage.js
import { supabase } from './supabase-client.js';
import { isMypageVerified, saveRedirect, signOutUser } from './auth-store.js';
import { loadPostsByAuthorId } from './posts-repo.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { renderTextWithEmoticons } = await import(
  `./emoticons.js?v=${MODULE_VERSION}`
);

function $(id) {
  return document.getElementById(id);
}

function saveRedirectHere() {
  saveRedirect(`${window.location.pathname}${window.location.search}`);
}

function isCalendarAppMode() {
  return (
    new URLSearchParams(window.location.search || '').get('app') ===
      'calendar' ||
    document.body?.dataset?.appMode === 'calendar' ||
    document.documentElement.classList.contains('is-calendar-app-mode') ||
    window.Capacitor?.isNativePlatform?.() === true
  );
}

function getWithdrawRedirectHref() {
  return isCalendarAppMode() ? './app-calendar.html?app=calendar' : './index.html';
}

function getLoginRedirectHref() {
  return isCalendarAppMode() ? './login.html?app=calendar' : './login.html';
}

function getPrevMypageRedirectHref() {
  return isCalendarAppMode()
    ? './prev-mypage.html?app=calendar'
    : './prev-mypage.html';
}

function setWithdrawMessage(el, message, type = '') {
  if (!el) return;
  el.textContent = message;
  el.dataset.state = type;
}

async function signOutAfterWithdraw() {
  try {
    await signOutUser();
  } catch (error) {
    console.warn('[mypage] signOut after withdraw failed:', error);
    try {
      await supabase.auth.signOut();
    } catch (fallbackError) {
      console.warn('[mypage] fallback signOut failed:', fallbackError);
    }
  }
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(
    2,
    '0',
  )}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(
    2,
    '0',
  )}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function trimCommentPreview(text, max = 70) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '(내용 없음)';

  const parts = clean.split(/(\[emo:[a-z0-9-]+\])/gi).filter(Boolean);

  let result = '';
  let length = 0;
  let truncated = false;

  for (const part of parts) {
    const isToken = /^\[emo:[a-z0-9-]+\]$/i.test(part);
    const unitLength = isToken ? 2 : part.length;

    if (length + unitLength > max) {
      if (!isToken) {
        const remain = Math.max(0, max - length);
        if (remain > 0) {
          result += part.slice(0, remain);
        }
      }
      truncated = true;
      break;
    }

    result += part;
    length += unitLength;
  }

  return truncated ? `${result}...` : result;
}

function isValidNickname(v) {
  return String(v || '').trim().length >= 2;
}

function isStrongPassword(v) {
  const value = String(v || '');
  return (
    value.length >= 10 &&
    /[A-Za-z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value)
  );
}

function renderMyPostRow(post) {
  return `
    <a class="mypage-row" href="${post.url}">
      <div class="mypage-row__main">
        <div class="mypage-row__title">${escapeHtml(post.title)}</div>
        <div class="mypage-row__body">${escapeHtml(post.excerpt || '(요약 없음)')}</div>
      </div>
      <span class="mypage-row__meta">
        ${formatMMDD(post.date)} · ${escapeHtml(post.category)}
      </span>
    </a>
  `;
}

function renderMyCommentRow(comment, postMap) {
  const post = postMap.get(Number(comment.post_id));
  const postTitle = post?.title || `게시물 #${comment.post_id}`;
  const postCategory = post?.category || '-';
  const postUrl = `./post.html?id=${encodeURIComponent(comment.post_id)}`;
  const preview = trimCommentPreview(comment.body);

  return `
    <a class="mypage-row" href="${postUrl}">
      <div class="mypage-row__main">
        <div class="mypage-row__title">${escapeHtml(postTitle)}</div>
        <div class="mypage-row__body">
          ${renderTextWithEmoticons(preview, {
            imageClass: 'inline-emoticon inline-emoticon--compact',
          })}
        </div>      </div>
      <span class="mypage-row__meta">
        ${formatDateTime(comment.created_at)} · ${escapeHtml(postCategory)}
      </span>
    </a>
  `;
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    console.error('[mypage] getUser failed:', error);
    return null;
  }

  return data.user || null;
}

function toBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;

  const text = String(value ?? '')
    .trim()
    .toLowerCase();

  return text === 'true' || text === 't' || text === '1';
}

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[mypage] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

function syncRoleBadge(isAdmin) {
  const badgeEl = $('mypageRoleBadge');
  if (!badgeEl) return;
  badgeEl.textContent = isAdmin ? '관리자' : '일반회원';
}

async function loadMyCommentsWithPosts(userId) {
  const { data: comments, error } = await supabase
    .from('post_comments')
    .select('id, post_id, body, created_at')
    .eq('author_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;

  const postIds = Array.from(
    new Set(
      (comments || []).map((item) => Number(item.post_id)).filter(Boolean),
    ),
  );

  let postRows = [];
  if (postIds.length) {
    const { data, error: postError } = await supabase
      .from('posts')
      .select('id, title, category')
      .in('id', postIds);

    if (postError) throw postError;
    postRows = data || [];
  }

  const postMap = new Map(postRows.map((post) => [Number(post.id), post]));

  return {
    comments: comments || [],
    postMap,
  };
}

function setupPagedList({
  items = [],
  perPage = 10,
  listEl,
  prevBtn,
  nextBtn,
  pageInfoEl,
  emptyHtml = '',
  renderItem,
}) {
  let currentPage = 1;
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));

  function render() {
    if (!items.length) {
      listEl.innerHTML = emptyHtml;
      pageInfoEl.textContent = '1 / 1';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const start = (currentPage - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);

    listEl.innerHTML = pageItems.map(renderItem).join('');
    pageInfoEl.textContent = `${currentPage} / ${totalPages}`;

    prevBtn.disabled = currentPage <= 1;
    nextBtn.disabled = currentPage >= totalPages;
  }

  prevBtn.addEventListener('click', () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    if (currentPage >= totalPages) return;
    currentPage += 1;
    render();
  });

  render();

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}

export async function initMypage() {
  const form = $('mypageForm');
  if (!form) return;
  if (form.dataset.mypageBound === 'true') return;
  form.dataset.mypageBound = 'true';

  const msgEl = $('mypageMsg');
  const withdrawMsgEl = $('mypageWithdrawMsg');
  const logoutBtn = $('mypageLogoutBtn');
  const withdrawBtn = $('mypageWithdrawBtn');

  const emailEl = $('mypageEmail');
  const emailTextEl = $('mypageEmailText');
  const nicknameEl = $('mypageNickname');
  const createdAtEl = $('mypageCreatedAt');
  const postCountEl = $('mypagePostCount');

  const myPostListEl = $('mypagePostList');
  const myCommentListEl = $('mypageCommentList');

  const mypagePostPrevBtn = $('mypagePostPrevBtn');
  const mypagePostNextBtn = $('mypagePostNextBtn');
  const mypagePostPageInfo = $('mypagePostPageInfo');

  const mypageCommentPrevBtn = $('mypageCommentPrevBtn');
  const mypageCommentNextBtn = $('mypageCommentNextBtn');
  const mypageCommentPageInfo = $('mypageCommentPageInfo');

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = getLoginRedirectHref();
    return;
  }

  if (!isMypageVerified()) {
    window.location.href = getPrevMypageRedirectHref();
    return;
  }

  try {
    const role = await getMyRole();
    syncRoleBadge(role.isAdmin);
  } catch (e) {
    console.error('[mypage] role check failed:', e);
    syncRoleBadge(false);
  }

  if (emailEl) emailEl.value = user.email || '';
  if (emailTextEl) emailTextEl.textContent = user.email || '-';

  if (nicknameEl) {
    nicknameEl.value =
      user.user_metadata?.nickname ||
      user.user_metadata?.display_name ||
      (user.email ? user.email.split('@')[0] : '');
  }

  if (createdAtEl) createdAtEl.textContent = formatDate(user.created_at);

  try {
    const myPosts = await loadPostsByAuthorId(user.id);

    if (postCountEl) postCountEl.textContent = String(myPosts.length);
  } catch (e) {
    console.error('[mypage] load my posts failed:', e);
    if (postCountEl) postCountEl.textContent = '0';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (msgEl) msgEl.textContent = '저장 중...';

    const nickname = nicknameEl?.value?.trim() || '';
    const currentPw = $('mypageCurrentPw')?.value?.trim() || '';
    const newPw = $('mypageNewPw')?.value?.trim() || '';
    const newPw2 = $('mypageNewPw2')?.value?.trim() || '';

    if (!isValidNickname(nickname)) {
      if (msgEl) msgEl.textContent = '닉네임은 2글자 이상 입력해줘.';
      nicknameEl?.focus();
      return;
    }

    if (newPw || newPw2 || currentPw) {
      if (!currentPw) {
        if (msgEl)
          msgEl.textContent = '비밀번호를 바꾸려면 현재 비밀번호를 입력해줘.';
        $('mypageCurrentPw')?.focus();
        return;
      }

      if (!newPw || !newPw2) {
        if (msgEl) msgEl.textContent = '새 비밀번호를 모두 입력해줘.';
        return;
      }

      if (!isStrongPassword(newPw)) {
        if (msgEl) {
          msgEl.textContent =
            '새 비밀번호는 영문자+숫자+특수기호를 포함한 10자 이상이어야 해.';
        }
        return;
      }

      if (newPw !== newPw2) {
        if (msgEl) msgEl.textContent = '새 비밀번호 확인이 맞지 않아.';
        return;
      }
    }

    try {
      const currentNickname =
        user.user_metadata?.nickname ||
        user.user_metadata?.display_name ||
        (user.email ? user.email.split('@')[0] : '');

      if (nickname !== currentNickname) {
        const { error: metaError } = await supabase.auth.updateUser({
          data: {
            ...(user.user_metadata || {}),
            nickname,
          },
        });

        if (metaError) {
          console.error('[mypage] nickname update failed:', metaError);
          if (msgEl)
            msgEl.textContent = `닉네임 변경 실패: ${metaError.message}`;
          return;
        }

        const { error: profileNickError } = await supabase
          .from('profiles')
          .update({
            nickname,
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);

        if (profileNickError) {
          console.error(
            '[mypage] profile nickname update failed:',
            profileNickError,
          );
          if (msgEl) msgEl.textContent = '닉네임 저장 중 오류가 발생했어.';
          return;
        }
      }

      if (newPw || newPw2 || currentPw) {
        const { error: reauthError } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: currentPw,
        });

        if (reauthError) {
          console.error('[mypage] current password check failed:', reauthError);
          if (msgEl) msgEl.textContent = '현재 비밀번호가 맞지 않아.';
          return;
        }

        const { error: pwError } = await supabase.auth.updateUser({
          password: newPw,
        });

        if (pwError) {
          console.error('[mypage] password update failed:', pwError);
          if (msgEl)
            msgEl.textContent = `비밀번호 변경 실패: ${pwError.message}`;
          return;
        }
      }

      const currentPwEl = $('mypageCurrentPw');
      const newPwEl = $('mypageNewPw');
      const newPw2El = $('mypageNewPw2');

      if (currentPwEl) currentPwEl.value = '';
      if (newPwEl) newPwEl.value = '';
      if (newPw2El) newPw2El.value = '';

      if (msgEl) msgEl.textContent = '회원정보 저장 완료!';
    } catch (error) {
      console.error('[mypage] save failed:', error);
      if (msgEl) msgEl.textContent = '회원정보 저장 중 오류가 발생했어.';
    }
  });

  logoutBtn?.addEventListener('click', async () => {
    await signOutUser();
    window.location.href = getWithdrawRedirectHref();
  });

  withdrawBtn?.addEventListener('click', async () => {
    if (withdrawBtn.disabled) return;

    const firstOk = window.confirm(
      '회원탈퇴를 진행할까요?\n계정과 프로필, 캘린더 기록 등 계정에 연결된 데이터가 삭제됩니다.',
    );
    if (!firstOk) return;

    const finalText = window.prompt(
      '정말 탈퇴하려면 아래에 "회원탈퇴"를 입력해주세요.',
    );
    if (finalText !== '회원탈퇴') {
      setWithdrawMessage(withdrawMsgEl, '입력 문구가 맞지 않아 탈퇴를 취소했어.');
      return;
    }

    withdrawBtn.disabled = true;
    withdrawBtn.setAttribute('aria-busy', 'true');
    setWithdrawMessage(withdrawMsgEl, '회원탈퇴 처리 중...', 'loading');

    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirmText: '회원탈퇴' },
      });

      if (error) {
        throw error;
      }

      if (data?.success !== true) {
        throw new Error(data?.message || '회원탈퇴 처리에 실패했어.');
      }

      setWithdrawMessage(
        withdrawMsgEl,
        '회원탈퇴가 완료됐어. 로그인 화면으로 이동할게.',
        'success',
      );
      await signOutAfterWithdraw();
      window.alert('회원탈퇴가 완료되었습니다.');
      window.location.href = getWithdrawRedirectHref();
    } catch (error) {
      console.error('[mypage] withdraw failed:', error);
      setWithdrawMessage(
        withdrawMsgEl,
        error?.message || '회원탈퇴 처리 중 오류가 발생했어.',
        'error',
      );
      withdrawBtn.disabled = false;
      withdrawBtn.setAttribute('aria-busy', 'false');
    }
  });

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
