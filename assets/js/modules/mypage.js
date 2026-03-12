// assets/js/modules/mypage.js
import { supabase } from './supabase-client.js';
import { loadPostsByAuthorId, formatMMDD } from './posts-repo.js';

function $(id) {
  return document.getElementById(id);
}

function saveRedirectHere() {
  try {
    sessionStorage.setItem(
      'redirectAfterLogin',
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {}
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
  return String(str)
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
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
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
        <div class="mypage-row__body">${escapeHtml(preview)}</div>
      </div>
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

  console.log('[mypage] get_my_role raw:', row);

  return {
    isAdmin: toBoolean(row?.is_admin),
  };
}

function syncRoleBadge(isAdmin) {
  const badgeEl = $('mypageRoleBadge');
  if (!badgeEl) return;

  badgeEl.classList.remove('is-admin', 'is-member');

  if (isAdmin) {
    badgeEl.textContent = '관리자';
    badgeEl.setAttribute('aria-label', '관리자 계정');
    badgeEl.classList.add('is-admin');
    return;
  }

  badgeEl.textContent = '일반회원';
  badgeEl.setAttribute('aria-label', '일반회원 계정');
  badgeEl.classList.add('is-member');
}

async function checkAccountAvailability({
  email = '',
  nickname = '',
  excludeUserId = null,
} = {}) {
  const { data, error } = await supabase.rpc('check_account_availability', {
    p_email: email || null,
    p_nickname: nickname || null,
    p_exclude_user_id: excludeUserId || null,
  });

  if (error) {
    console.error('[mypage] check_account_availability error:', error);
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    emailExists: !!row?.email_exists,
    nicknameExists: !!row?.nickname_exists,
  };
}

async function loadMyCommentsWithPosts(authorId) {
  const { data: comments, error: commentsError } = await supabase
    .from('post_comments')
    .select('id, post_id, body, created_at')
    .eq('author_id', authorId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (commentsError) throw commentsError;

  const commentList = comments || [];
  const postIds = [
    ...new Set(commentList.map((item) => Number(item.post_id)).filter(Boolean)),
  ];

  if (postIds.length === 0) {
    return { comments: [], postMap: new Map() };
  }

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id, title, category')
    .in('id', postIds);

  if (postsError) throw postsError;

  const postMap = new Map((posts || []).map((post) => [Number(post.id), post]));
  return { comments: commentList, postMap };
}

function setupPagedList({
  items,
  perPage = 10,
  listEl,
  prevBtn,
  nextBtn,
  pageInfoEl,
  emptyHtml,
  renderItem,
}) {
  let page = 1;

  function render() {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));

    if (page > totalPages) page = totalPages;
    if (page < 1) page = 1;

    if (!items.length) {
      listEl.innerHTML = emptyHtml;
      pageInfoEl.textContent = '1 / 1';
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      return;
    }

    const start = (page - 1) * perPage;
    const pageItems = items.slice(start, start + perPage);

    listEl.innerHTML = pageItems.map(renderItem).join('');
    pageInfoEl.textContent = `${page} / ${totalPages}`;
    prevBtn.disabled = page <= 1;
    nextBtn.disabled = page >= totalPages;
  }

  prevBtn.addEventListener('click', () => {
    if (page <= 1) return;
    page -= 1;
    render();
  });

  nextBtn.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    if (page >= totalPages) return;
    page += 1;
    render();
  });

  render();
}

export async function initMypage() {
  const form = $('mypageForm');
  if (!form) return;

  const msgEl = $('mypageMsg');
  const withdrawMsgEl = $('mypageWithdrawMsg');
  const logoutBtn = $('mypageLogoutBtn');
  const withdrawBtn = $('mypageWithdrawBtn');

  const emailEl = $('mypageEmail');
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
    window.location.href = './account/login.html';
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

    if (
      myPostListEl &&
      mypagePostPrevBtn &&
      mypagePostNextBtn &&
      mypagePostPageInfo
    ) {
      setupPagedList({
        items: myPosts,
        perPage: 10,
        listEl: myPostListEl,
        prevBtn: mypagePostPrevBtn,
        nextBtn: mypagePostNextBtn,
        pageInfoEl: mypagePostPageInfo,
        emptyHtml: `<div class="empty">아직 작성한 글이 없어.</div>`,
        renderItem: renderMyPostRow,
      });
    }
  } catch (e) {
    console.error('[mypage] load my posts failed:', e);

    if (myPostListEl) {
      myPostListEl.innerHTML = `<div class="empty">내 글 목록을 불러오지 못했어.</div>`;
    }
    if (mypagePostPageInfo) mypagePostPageInfo.textContent = '1 / 1';
    if (mypagePostPrevBtn) mypagePostPrevBtn.disabled = true;
    if (mypagePostNextBtn) mypagePostNextBtn.disabled = true;
  }

  try {
    const { comments, postMap } = await loadMyCommentsWithPosts(user.id);

    if (
      myCommentListEl &&
      mypageCommentPrevBtn &&
      mypageCommentNextBtn &&
      mypageCommentPageInfo
    ) {
      setupPagedList({
        items: comments,
        perPage: 10,
        listEl: myCommentListEl,
        prevBtn: mypageCommentPrevBtn,
        nextBtn: mypageCommentNextBtn,
        pageInfoEl: mypageCommentPageInfo,
        emptyHtml: `<div class="empty">아직 작성한 댓글이 없어.</div>`,
        renderItem: (comment) => renderMyCommentRow(comment, postMap),
      });
    }
  } catch (e) {
    console.error('[mypage] load my comments failed:', e);

    if (myCommentListEl) {
      myCommentListEl.innerHTML = `<div class="empty">내 댓글 목록을 불러오지 못했어.</div>`;
    }
    if (mypageCommentPageInfo) mypageCommentPageInfo.textContent = '1 / 1';
    if (mypageCommentPrevBtn) mypageCommentPrevBtn.disabled = true;
    if (mypageCommentNextBtn) mypageCommentNextBtn.disabled = true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (msgEl) msgEl.textContent = '저장 중...';

    const nickname = (nicknameEl?.value || '').trim();
    const currentPw = ($('mypageCurrentPw')?.value || '').trim();
    const newPw = ($('mypageNewPw')?.value || '').trim();
    const newPw2 = ($('mypageNewPw2')?.value || '').trim();

    if (!nickname || nickname.length < 2) {
      if (msgEl) msgEl.textContent = '닉네임은 2글자 이상이어야 해.';
      return;
    }

    try {
      const availability = await checkAccountAvailability({
        nickname,
        excludeUserId: user.id,
      });

      if (availability.nicknameExists) {
        if (msgEl) msgEl.textContent = '이미 사용 중인 닉네임이야.';
        return;
      }
    } catch (err) {
      console.error('[mypage] nickname availability check failed:', err);
      if (msgEl) msgEl.textContent = '닉네임 확인 중 오류가 발생했어.';
      return;
    }

    const { error: metaError } = await supabase.auth.updateUser({
      data: { nickname },
    });

    if (metaError) {
      console.error('[mypage] nickname update failed:', metaError);

      const lowerMessage = String(metaError.message || '').toLowerCase();
      if (
        lowerMessage.includes('profiles_nickname_unique_idx') ||
        (lowerMessage.includes('duplicate key value') &&
          lowerMessage.includes('nickname'))
      ) {
        if (msgEl) msgEl.textContent = '이미 사용 중인 닉네임이야.';
        return;
      }

      if (msgEl) msgEl.textContent = `닉네임 저장 실패: ${metaError.message}`;
      return;
    }

    if (newPw || newPw2) {
      if (!currentPw) {
        if (msgEl) {
          msgEl.textContent =
            '비밀번호를 바꾸려면 현재 비밀번호를 입력해야 해.';
        }
        return;
      }

      if (newPw.length < 6) {
        if (msgEl) msgEl.textContent = '새 비밀번호는 6자 이상이어야 해.';
        return;
      }

      if (newPw !== newPw2) {
        if (msgEl) msgEl.textContent = '새 비밀번호 확인이 맞지 않아.';
        return;
      }

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
        if (msgEl) msgEl.textContent = `비밀번호 변경 실패: ${pwError.message}`;
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
  });

  logoutBtn?.addEventListener('click', async () => {
    await supabase.auth.signOut();
    window.location.href = './index.html';
  });

  withdrawBtn?.addEventListener('click', () => {
    if (withdrawMsgEl) {
      withdrawMsgEl.textContent = '회원탈퇴는 아직 연결 전이야.';
    }
  });
}
