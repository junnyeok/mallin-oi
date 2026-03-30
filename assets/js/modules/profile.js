import { supabase } from './supabase-client.js';
import { loadPostsByAuthorId, formatMMDD } from './posts-repo.js';
import { getCurrentUser, loginHref } from './auth-store.js';

const PROFILE_BUCKET = 'profile-images';
const PROFILE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_PROFILE_IMAGE = './images/logo-home.png';

function $(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getTargetUserIdFromUrl() {
  const sp = new URLSearchParams(window.location.search);
  return String(sp.get('user') || '').trim();
}

function trimCommentPreview(text, max = 70) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return '(내용 없음)';
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max)}...`;
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

function isValidNickname(v) {
  return String(v || '').trim().length >= 2;
}

function setMsg(text, color = 'var(--color-text-sub)') {
  const el = $('profileMsg');
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
}

function getProfileImageSrc(url) {
  return String(url || '').trim() || DEFAULT_PROFILE_IMAGE;
}

function formatPickleAmount(value) {
  return `${Number(value || 0)} 피클`;
}

function updatePickleSummary(balance = 0, isVisible = false) {
  const heroPickleEl = $('profileHeroPickle');
  const sectionEl = $('profilePickleSection');
  const balanceEl = $('profilePickleBalance');

  if (balanceEl) {
    balanceEl.textContent = formatPickleAmount(balance);
  }

  if (heroPickleEl) {
    heroPickleEl.hidden = !isVisible;
    heroPickleEl.textContent = `보유 피클 ${formatPickleAmount(balance)}`;
  }

  if (sectionEl) {
    sectionEl.hidden = !isVisible;
  }
}

function renderPickleRow(entry) {
  const amount = Number(entry?.amount || 0);
  const amountText = amount > 0 ? `+${amount} 피클` : `${amount} 피클`;
  const reasonLabel = entry?.reason_label || '피클 획득';
  const description = entry?.description || '';

  return `
    <div class="profile-row profile-row--pickle">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(reasonLabel)}</div>
        <div class="profile-row__body">${escapeHtml(
          description || '피클 내역이야.',
        )}</div>
      </div>
      <div class="profile-row__side">
        <span class="profile-row__amount">${escapeHtml(amountText)}</span>
        <span class="profile-row__meta">${formatDateTime(
          entry?.created_at,
        )}</span>
      </div>
    </div>
  `;
}

async function loadPickleLedger(userId) {
  const { data, error } = await supabase
    .from('pickle_ledger')
    .select(
      'id, amount, reason_code, reason_label, description, source_post_id, source_comment_id, created_at',
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false });

  if (error) throw error;
  return data || [];
}

function renderMyPostRow(post) {
  return `
    <a class="profile-row" href="${post.url}">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(post.title)}</div>
        <div class="profile-row__body">${escapeHtml(
          post.excerpt || '(요약 없음)',
        )}</div>
      </div>
      <span class="profile-row__meta">
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
  const isPrivatePost = !!post?.is_private;

  const preview = isPrivatePost
    ? '비밀 게시글의 댓글은 프로필에서 내용이 표시되지 않아.'
    : trimCommentPreview(comment.body);

  return `
    <a class="profile-row" href="${postUrl}">
      <div class="profile-row__main">
        <div class="profile-row__title">${escapeHtml(postTitle)}</div>
        <div class="profile-row__body">${escapeHtml(preview)}</div>
      </div>
      <span class="profile-row__meta">
        ${formatDateTime(comment.created_at)} · ${escapeHtml(postCategory)}
      </span>
    </a>
  `;
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
  if (!listEl || !prevBtn || !nextBtn || !pageInfoEl) return;

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

  prevBtn.onclick = () => {
    if (currentPage <= 1) return;
    currentPage -= 1;
    render();
  };

  nextBtn.onclick = () => {
    if (currentPage >= totalPages) return;
    currentPage += 1;
    render();
  };

  render();
}

async function loadProfileRow(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nickname, email, profile_image_url, pickles')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadPublicProfileRow(userId) {
  const { data, error } = await supabase
    .from('public_profiles')
    .select('id, nickname, profile_image_url, created_at, updated_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function loadCommentsWithPostsByAuthorId(userId) {
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
      .select('id, title, category, is_private')
      .in('id', postIds);

    if (postError) throw postError;
    postRows = data || [];
  }

  return {
    comments: comments || [],
    postMap: new Map(postRows.map((post) => [Number(post.id), post])),
  };
}

async function uploadProfileImage(user, file) {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin';
  const safeExt = String(ext || 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;
  const path = `${user.id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: false,
      contentType: file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(PROFILE_BUCKET).getPublicUrl(path);
  return data?.publicUrl || '';
}

async function updateProfileRow(userId, patch) {
  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId);

  if (error) throw error;
}

function applyProfileModeUI({
  isOwnProfile,
  nickname,
  currentUser,
  profileRow,
}) {
  const eyebrowEl = $('profileEyebrow');
  const nicknameText = $('profileNicknameText');
  const emailText = $('profileEmailText');
  const descEl = $('profileDesc');
  const form = $('profileForm');
  const formTitle = $('profileFormTitle');
  const postsTitle = $('profilePostsTitle');
  const commentsTitle = $('profileCommentsTitle');
  const avatar = $('profileAvatar');
  const heroPickleEl = $('profileHeroPickle');
  const pickleSection = $('profilePickleSection');
  if (eyebrowEl) {
    eyebrowEl.textContent = isOwnProfile ? '내프로필' : '이용자 프로필';
  }

  if (nicknameText) {
    nicknameText.textContent = nickname || '회원';
  }

  if (emailText) {
    emailText.textContent = isOwnProfile
      ? currentUser?.email || profileRow?.email || '-'
      : '다른 이용자의 공개 프로필이야.';
  }

  if (descEl) {
    descEl.textContent = isOwnProfile
      ? '여기서는 프로필 사진, 닉네임, 내가 쓴 글/댓글을 한 번에 볼 수 있어.'
      : '여기서는 이 이용자가 작성한 글과 댓글을 볼 수 있어.';
  }

  if (form) {
    form.hidden = !isOwnProfile;
  }

  if (formTitle) {
    formTitle.textContent = '프로필 설정';
  }

  if (postsTitle) {
    postsTitle.textContent = isOwnProfile ? '내가 쓴 글' : '작성한 글';
  }

  if (commentsTitle) {
    commentsTitle.textContent = isOwnProfile ? '내가 쓴 댓글' : '작성한 댓글';
  }

  if (avatar) {
    avatar.src = getProfileImageSrc(profileRow?.profile_image_url);
  }
}

function renderProfileNotFound() {
  const nicknameText = $('profileNicknameText');
  const emailText = $('profileEmailText');
  const descEl = $('profileDesc');
  const form = $('profileForm');
  const postList = $('profilePostList');
  const commentList = $('profileCommentList');
  const avatar = $('profileAvatar');

  if (nicknameText) nicknameText.textContent = '프로필을 찾을 수 없어';
  if (emailText) emailText.textContent = '-';
  if (descEl)
    descEl.textContent = '존재하지 않거나 볼 수 없는 이용자 프로필이야.';
  if (form) form.hidden = true;
  if (avatar) avatar.src = DEFAULT_PROFILE_IMAGE;
  if (heroPickleEl) heroPickleEl.hidden = true;
  if (pickleSection) pickleSection.hidden = true;
  if (postList) {
    postList.innerHTML = `<div class="empty">작성한 글을 불러올 수 없어.</div>`;
  }
  if (commentList) {
    commentList.innerHTML = `<div class="empty">작성한 댓글을 불러올 수 없어.</div>`;
  }
}

export async function initProfile() {
  if (document.body?.dataset?.page !== 'profile') return;

  const currentUser = await getCurrentUser();
  const targetUserIdFromUrl = getTargetUserIdFromUrl();

  if (!targetUserIdFromUrl && !currentUser) {
    window.location.href = loginHref();
    return;
  }

  const targetUserId = targetUserIdFromUrl || currentUser?.id || '';
  const isOwnProfile =
    !!currentUser &&
    !!targetUserId &&
    String(currentUser.id) === String(targetUserId);

  const nicknameInput = $('profileNickname');
  const avatar = $('profileAvatar');
  const imageFileInput = $('profileImageFile');
  const resetImageBtn = $('profileResetImageBtn');

  let profileRow = null;
  let pendingDefaultImage = false;

  try {
    profileRow = isOwnProfile
      ? await loadProfileRow(targetUserId)
      : await loadPublicProfileRow(targetUserId);
  } catch (error) {
    console.error('[profile] load profile failed:', error);
  }

  if (!profileRow) {
    renderProfileNotFound();
    return;
  }

  const currentNickname =
    profileRow?.nickname ||
    currentUser?.user_metadata?.nickname ||
    currentUser?.user_metadata?.display_name ||
    (currentUser?.email ? currentUser.email.split('@')[0] : '회원');

  applyProfileModeUI({
    isOwnProfile,
    nickname: currentNickname,
    currentUser,
    profileRow,
  });

  if (isOwnProfile && nicknameInput) {
    nicknameInput.value = currentNickname;
  }
  updatePickleSummary(profileRow?.pickles || 0, isOwnProfile);

  if (isOwnProfile) {
    resetImageBtn?.addEventListener('click', () => {
      pendingDefaultImage = true;
      if (imageFileInput) imageFileInput.value = '';
      if (avatar) avatar.src = DEFAULT_PROFILE_IMAGE;
      setMsg('기본 이미지로 변경할 준비가 됐어. 저장 버튼을 눌러줘.');
    });

    imageFileInput?.addEventListener('change', () => {
      pendingDefaultImage = false;

      const file = imageFileInput.files?.[0];
      if (!file) return;

      if (file.size > PROFILE_IMAGE_MAX_BYTES) {
        setMsg('프로필 사진은 5MB 이하만 올릴 수 있어.', 'red');
        imageFileInput.value = '';
        return;
      }

      if (!file.type.startsWith('image/')) {
        setMsg('이미지 파일만 올릴 수 있어.', 'red');
        imageFileInput.value = '';
        return;
      }

      if (avatar) {
        avatar.src = URL.createObjectURL(file);
      }
    });

    const form = $('profileForm');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nickname = nicknameInput?.value?.trim() || '';
      const file = imageFileInput?.files?.[0] || null;

      if (!isValidNickname(nickname)) {
        setMsg('닉네임은 2글자 이상 입력해줘.', 'red');
        nicknameInput?.focus();
        return;
      }

      if (file && file.size > PROFILE_IMAGE_MAX_BYTES) {
        setMsg('프로필 사진은 5MB 이하만 올릴 수 있어.', 'red');
        return;
      }

      setMsg('프로필 저장 중...');

      try {
        const currentMetaNickname =
          currentUser?.user_metadata?.nickname ||
          currentUser?.user_metadata?.display_name ||
          '';

        if (nickname !== currentMetaNickname) {
          const { error: metaError } = await supabase.auth.updateUser({
            data: {
              ...(currentUser?.user_metadata || {}),
              nickname,
            },
          });

          if (metaError) throw metaError;
        }

        const patch = {
          nickname,
          updated_at: new Date().toISOString(),
        };

        if (pendingDefaultImage) {
          patch.profile_image_url = null;
        } else if (file) {
          const uploadedUrl = await uploadProfileImage(currentUser, file);
          patch.profile_image_url = uploadedUrl;
        }

        await updateProfileRow(currentUser.id, patch);

        profileRow = {
          ...profileRow,
          ...patch,
        };

        applyProfileModeUI({
          isOwnProfile: true,
          nickname,
          currentUser,
          profileRow,
        });

        if (imageFileInput) imageFileInput.value = '';
        pendingDefaultImage = false;

        setMsg('프로필 저장 완료!', 'green');
        window.dispatchEvent(new Event('auth-changed'));
      } catch (error) {
        console.error('[profile] save failed:', error);
        setMsg('프로필 저장 중 오류가 발생했어.', 'red');
      }
    });
  }

  const profilePostListEl = $('profilePostList');
  const profilePostPrevBtn = $('profilePostPrevBtn');
  const profilePostNextBtn = $('profilePostNextBtn');
  const profilePostPageInfo = $('profilePostPageInfo');

  const profileCommentListEl = $('profileCommentList');
  const profileCommentPrevBtn = $('profileCommentPrevBtn');
  const profileCommentNextBtn = $('profileCommentNextBtn');
  const profileCommentPageInfo = $('profileCommentPageInfo');

  const profilePickleListEl = $('profilePickleList');
  const profilePicklePrevBtn = $('profilePicklePrevBtn');
  const profilePickleNextBtn = $('profilePickleNextBtn');
  const profilePicklePageInfo = $('profilePicklePageInfo');

  if (isOwnProfile) {
    try {
      const pickleEntries = await loadPickleLedger(targetUserId);

      setupPagedList({
        items: pickleEntries,
        perPage: 5,
        listEl: profilePickleListEl,
        prevBtn: profilePicklePrevBtn,
        nextBtn: profilePickleNextBtn,
        pageInfoEl: profilePicklePageInfo,
        emptyHtml: `<div class="empty">아직 받은 피클 내역이 없어.</div>`,
        renderItem: renderPickleRow,
      });
    } catch (error) {
      console.error('[profile] load pickle ledger failed:', error);

      if (profilePickleListEl) {
        profilePickleListEl.innerHTML =
          '<div class="empty">피클 내역을 불러오지 못했어.</div>';
      }
    }
  }

  try {
    const posts = await loadPostsByAuthorId(targetUserId);

    setupPagedList({
      items: posts,
      perPage: 3,
      listEl: profilePostListEl,
      prevBtn: profilePostPrevBtn,
      nextBtn: profilePostNextBtn,
      pageInfoEl: profilePostPageInfo,
      emptyHtml: `<div class="empty">${
        isOwnProfile ? '아직 작성한 글이 없어.' : '아직 작성한 글이 없어.'
      }</div>`,
      renderItem: renderMyPostRow,
    });
  } catch (error) {
    console.error('[profile] load posts failed:', error);

    if (profilePostListEl) {
      profilePostListEl.innerHTML = `<div class="empty">${
        isOwnProfile
          ? '내 글 목록을 불러오지 못했어.'
          : '작성한 글 목록을 불러오지 못했어.'
      }</div>`;
    }
  }

  try {
    const { comments, postMap } =
      await loadCommentsWithPostsByAuthorId(targetUserId);

    setupPagedList({
      items: comments,
      perPage: 3,
      listEl: profileCommentListEl,
      prevBtn: profileCommentPrevBtn,
      nextBtn: profileCommentNextBtn,
      pageInfoEl: profileCommentPageInfo,
      emptyHtml: `<div class="empty">${
        isOwnProfile ? '아직 작성한 댓글이 없어.' : '아직 작성한 댓글이 없어.'
      }</div>`,
      renderItem: (comment) => renderMyCommentRow(comment, postMap),
    });
  } catch (error) {
    console.error('[profile] load comments failed:', error);

    if (profileCommentListEl) {
      profileCommentListEl.innerHTML = `<div class="empty">${
        isOwnProfile
          ? '내 댓글 목록을 불러오지 못했어.'
          : '작성한 댓글 목록을 불러오지 못했어.'
      }</div>`;
    }
  }

  requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  });
}
