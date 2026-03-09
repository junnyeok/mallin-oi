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
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function renderMyPostRow(post) {
  return `
    <a class="post-row" href="${post.url}">
      <span class="post-row__title">${post.title}</span>
      <span class="post-row__meta">
        ${formatMMDD(post.date)} · ${post.category}
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

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = './account/login.html';
    return;
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

    if (myPostListEl) {
      myPostListEl.innerHTML =
        myPosts.length > 0
          ? myPosts.map(renderMyPostRow).join('')
          : `<div class="empty">아직 작성한 글이 없어.</div>`;
    }
  } catch (e) {
    console.error('[mypage] load my posts failed:', e);
    if (myPostListEl) {
      myPostListEl.innerHTML = `<div class="empty">내 글 목록을 불러오지 못했어.</div>`;
    }
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

    const { error: metaError } = await supabase.auth.updateUser({
      data: { nickname },
    });

    if (metaError) {
      console.error('[mypage] nickname update failed:', metaError);
      if (msgEl) msgEl.textContent = `닉네임 저장 실패: ${metaError.message}`;
      return;
    }

    if (newPw || newPw2) {
      if (!currentPw) {
        if (msgEl)
          msgEl.textContent =
            '비밀번호를 바꾸려면 현재 비밀번호를 입력해야 해.';
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

    $('mypageCurrentPw').value = '';
    $('mypageNewPw').value = '';
    $('mypageNewPw2').value = '';

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
