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
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
}

function normalizeBirthKey(v) {
  return String(v || '').replace(/[^0-9]/g, '');
}

function formatBirthKeyDisplay(v) {
  const digits = normalizeBirthKey(v);
  if (digits.length !== 7) return v || '';
  return `${digits.slice(0, 6)}-${digits.slice(6)}`;
}

function normalizeRecoveryAnswer(v) {
  return String(v || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function isValidNickname(v) {
  return String(v || '').trim().length >= 2;
}

function isValidRealName(v) {
  return String(v || '').trim().length >= 2;
}

function isValidBirthKey(v) {
  return /^\d{7}$/.test(normalizeBirthKey(v));
}

async function sha256Hex(value) {
  const src = new TextEncoder().encode(String(value || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', src);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
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

function setRecoveryState(text) {
  const el = $('mypageRecoveryState');
  if (!el) return;
  el.textContent = text;
}

function applyIdentityLock(locked) {
  const realNameEl = $('mypageRealName');
  const birthKeyEl = $('mypageBirthKey');
  const realNameHelpEl = $('mypageRealNameHelp');
  const birthKeyHelpEl = $('mypageBirthKeyHelp');

  if (realNameEl) {
    realNameEl.readOnly = locked;
  }

  if (birthKeyEl) {
    birthKeyEl.readOnly = locked;
  }

  if (realNameHelpEl) {
    realNameHelpEl.textContent = locked
      ? '이미 저장된 이름이야. 이름은 한 번 저장하면 수정할 수 없어.'
      : '이름은 최초 1회만 저장 가능해.';
  }

  if (birthKeyHelpEl) {
    birthKeyHelpEl.textContent = locked
      ? '이미 저장된 생년월일이야. 생년월일은 한 번 저장하면 수정할 수 없어.'
      : '생년월일도 최초 1회만 저장 가능해.';
  }
}

async function loadRecoveryProfile() {
  const { data, error } = await supabase.rpc('get_my_recovery_profile');

  if (error) {
    console.error('[mypage] get_my_recovery_profile failed:', error);
    throw error;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function initMypage() {
  const form = $('mypageForm');
  if (!form) return;

  const msgEl = $('mypageMsg');
  const withdrawMsgEl = $('mypageWithdrawMsg');
  const logoutBtn = $('mypageLogoutBtn');
  const withdrawBtn = $('mypageWithdrawBtn');

  const emailEl = $('mypageEmail');
  const emailTextEl = $('mypageEmailText');
  const nicknameEl = $('mypageNickname');
  const createdAtEl = $('mypageCreatedAt');
  const postCountEl = $('mypagePostCount');

  const realNameEl = $('mypageRealName');
  const birthKeyEl = $('mypageBirthKey');
  const recoveryQuestionEl = $('mypageRecoveryQuestion');
  const recoveryAnswerEl = $('mypageRecoveryAnswer');

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
    window.location.href = './login.html';
    return;
  }

  let recoveryProfile = null;

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
    recoveryProfile = await loadRecoveryProfile();

    if (realNameEl) {
      realNameEl.value = recoveryProfile?.real_name || '';
    }

    if (birthKeyEl) {
      birthKeyEl.value = formatBirthKeyDisplay(
        recoveryProfile?.birth_key || '',
      );
    }

    if (recoveryQuestionEl) {
      recoveryQuestionEl.value = recoveryProfile?.recovery_question || '';
    }

    applyIdentityLock(!recoveryProfile?.can_set_identity);

    if (recoveryProfile?.can_set_identity) {
      setRecoveryState(
        '이름과 생년월일은 아직 비어 있어. 이번에 저장하면 이후에는 수정할 수 없어.',
      );
    } else {
      setRecoveryState(
        '이름과 생년월일은 이미 저장 완료됐어. 아이디 힌트 질문과 답변은 계속 바꿀 수 있어.',
      );
    }
  } catch (e) {
    console.error('[mypage] recovery profile load failed:', e);
    setRecoveryState('복구정보를 불러오지 못했어.');
  }

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
        perPage: 3,
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
        perPage: 3,
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

    const nickname = nicknameEl?.value?.trim() || '';
    const currentPw = $('mypageCurrentPw')?.value?.trim() || '';
    const newPw = $('mypageNewPw')?.value?.trim() || '';
    const newPw2 = $('mypageNewPw2')?.value?.trim() || '';

    const realName = realNameEl?.value?.trim() || '';
    const birthKeyRaw = birthKeyEl?.value?.trim() || '';
    const birthKey = normalizeBirthKey(birthKeyRaw);
    const recoveryQuestion = recoveryQuestionEl?.value || '';
    const recoveryAnswer = recoveryAnswerEl?.value?.trim() || '';

    if (!isValidNickname(nickname)) {
      if (msgEl) msgEl.textContent = '닉네임은 2글자 이상 입력해줘.';
      nicknameEl?.focus();
      return;
    }

    const needSetIdentity = !!recoveryProfile?.can_set_identity;
    const hasExistingRecoveryQuestion = !!recoveryProfile?.recovery_question;
    const touchedRecoveryQuestion =
      recoveryQuestion !== (recoveryProfile?.recovery_question || '');
    const typedRecoveryAnswer =
      normalizeRecoveryAnswer(recoveryAnswer).length > 0;

    if (needSetIdentity) {
      if (!isValidRealName(realName)) {
        if (msgEl) msgEl.textContent = '이름은 2글자 이상 입력해줘.';
        realNameEl?.focus();
        return;
      }

      if (!isValidBirthKey(birthKeyRaw)) {
        if (msgEl) msgEl.textContent = '생년월일은 960829-1 형식으로 입력해줘.';
        birthKeyEl?.focus();
        return;
      }
    }

    const shouldUpdateRecovery =
      !hasExistingRecoveryQuestion ||
      touchedRecoveryQuestion ||
      typedRecoveryAnswer;

    let recoveryAnswerHash = null;

    if (shouldUpdateRecovery) {
      if (!recoveryQuestion) {
        if (msgEl) msgEl.textContent = '아이디 힌트 질문을 선택해줘.';
        recoveryQuestionEl?.focus();
        return;
      }

      if (normalizeRecoveryAnswer(recoveryAnswer).length < 2) {
        if (msgEl)
          msgEl.textContent = '아이디 힌트 답변을 2글자 이상 입력해줘.';
        recoveryAnswerEl?.focus();
        return;
      }

      recoveryAnswerHash = await sha256Hex(
        normalizeRecoveryAnswer(recoveryAnswer),
      );
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

      if (newPw.length < 6) {
        if (msgEl) msgEl.textContent = '새 비밀번호는 6자 이상이어야 해.';
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

      const { data: recoveryData, error: recoveryError } = await supabase.rpc(
        'update_my_recovery_profile',
        {
          p_real_name: needSetIdentity ? realName : null,
          p_birth_key: needSetIdentity ? birthKey : null,
          p_recovery_question: shouldUpdateRecovery ? recoveryQuestion : null,
          p_recovery_answer_hash: shouldUpdateRecovery
            ? recoveryAnswerHash
            : null,
        },
      );

      if (recoveryError) {
        console.error(
          '[mypage] update_my_recovery_profile failed:',
          recoveryError,
        );
        if (msgEl)
          msgEl.textContent = `복구정보 저장 실패: ${recoveryError.message}`;
        return;
      }

      const recoveryRow = Array.isArray(recoveryData)
        ? recoveryData[0]
        : recoveryData;

      if (!recoveryRow?.success) {
        if (msgEl)
          msgEl.textContent =
            recoveryRow?.message || '복구정보 저장에 실패했어.';
        return;
      }

      recoveryProfile = {
        ...recoveryProfile,
        real_name: recoveryRow?.real_name || '',
        birth_key: recoveryRow?.birth_key || '',
        recovery_question: recoveryRow?.recovery_question || '',
        can_set_identity: !!recoveryRow?.can_set_identity,
      };

      if (realNameEl) realNameEl.value = recoveryProfile.real_name || '';
      if (birthKeyEl) {
        birthKeyEl.value = formatBirthKeyDisplay(
          recoveryProfile.birth_key || '',
        );
      }
      if (recoveryQuestionEl) {
        recoveryQuestionEl.value = recoveryProfile.recovery_question || '';
      }
      if (recoveryAnswerEl) {
        recoveryAnswerEl.value = '';
      }

      applyIdentityLock(!recoveryProfile.can_set_identity);

      if (recoveryProfile.can_set_identity) {
        setRecoveryState(
          '이름과 생년월일은 아직 비어 있어. 이번에 저장하면 이후에는 수정할 수 없어.',
        );
      } else {
        setRecoveryState(
          '이름과 생년월일은 이미 저장 완료됐어. 아이디 힌트 질문과 답변은 계속 바꿀 수 있어.',
        );
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
      if (recoveryAnswerEl) recoveryAnswerEl.value = '';

      if (msgEl) msgEl.textContent = '회원정보 저장 완료!';
    } catch (error) {
      console.error('[mypage] save failed:', error);
      if (msgEl) msgEl.textContent = '회원정보 저장 중 오류가 발생했어.';
    }
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

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
