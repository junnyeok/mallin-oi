import { supabase } from './supabase-client.js';

const ALLOWED_CATEGORIES = new Set(['study', 'work', 'event', 'career']);

function $(sel) {
  return document.querySelector(sel);
}

function normalizeCategory(value) {
  const v = String(value || '')
    .trim()
    .toLowerCase();
  return ALLOWED_CATEGORIES.has(v) ? v : 'study';
}

function parseTags(input) {
  const raw = String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const clean = raw.map((t) => t.replace(/^#/, ''));
  return Array.from(new Set(clean));
}

function saveRedirectHere() {
  try {
    sessionStorage.setItem(
      'redirectAfterLogin',
      `${window.location.pathname}${window.location.search}`,
    );
  } catch {}
}

function getNicknameFromUser(user) {
  return (
    user?.user_metadata?.nickname ||
    user?.user_metadata?.display_name ||
    (user?.email ? user.email.split('@')[0] : '익명')
  );
}

async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error('[write] getUser failed:', error);
    return null;
  }
  return data.user || null;
}

async function getMyRole() {
  const { data, error } = await supabase.rpc('get_my_role');

  if (error) {
    console.error('[write] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    isAdmin: !!row?.is_admin,
  };
}

function getEditPostId() {
  const sp = new URLSearchParams(window.location.search);
  const id = Number(sp.get('edit') || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function setWriteModeUi(isEdit) {
  const titleEl = document.querySelector('.write__title');
  const descEl = document.querySelector('.write__desc');
  const submitBtn = $('#writeSubmitBtn');
  const note = $('#writeNote');

  if (titleEl) {
    titleEl.textContent = isEdit ? '글 수정' : '새 글 쓰기';
  }

  if (descEl) {
    descEl.textContent = isEdit
      ? '기존 게시물을 수정 중이야. 저장하면 바로 상세 페이지에 반영돼.'
      : '이제 글은 수파베이스 DB에 바로 저장돼. 등록하면 자동으로 전체보기와 상세 페이지에 반영돼.';
  }

  if (submitBtn) {
    submitBtn.textContent = isEdit ? '수정 완료' : '등록';
  }

  if (note) note.textContent = '';
}

function setPinnedUiVisible(visible) {
  const pinnedRow = $('#pinnedRow');
  const pinnedEl = $('#pinned');

  if (pinnedRow) pinnedRow.hidden = !visible;
  if (!visible && pinnedEl) pinnedEl.checked = false;
}

async function loadEditablePost(postId, userId, isAdmin = false) {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, title, excerpt, body, category, tags, pinned, author_id, author_nickname',
    )
    .eq('id', postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (
    !isAdmin &&
    (!data.author_id || String(data.author_id) !== String(userId))
  ) {
    return 'FORBIDDEN';
  }

  return data;
}

function fillWriteForm(post, isAdmin = false) {
  const titleEl = $('#title');
  const excerptEl = $('#excerpt');
  const bodyEl = $('#body');
  const categoryEl = $('#category');
  const tagsEl = $('#tags');
  const pinnedEl = $('#pinned');

  if (titleEl) titleEl.value = post.title || '';
  if (excerptEl) excerptEl.value = post.excerpt || '';
  if (bodyEl) bodyEl.value = post.body || '';
  if (categoryEl) categoryEl.value = normalizeCategory(post.category);
  if (tagsEl)
    tagsEl.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';

  if (pinnedEl) {
    pinnedEl.checked = isAdmin ? !!post.pinned : false;
  }
}

export async function initWrite() {
  const form = $('#writeForm');
  if (!form) return;

  const note = $('#writeNote');
  const submitBtn = $('#writeSubmitBtn');
  const editPostId = getEditPostId();

  setWriteModeUi(!!editPostId);

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = './login.html';
    return;
  }

  const { isAdmin } = await getMyRole();
  setPinnedUiVisible(isAdmin);

  if (editPostId) {
    if (note) note.textContent = '수정할 글을 불러오는 중...';

    try {
      const editablePost = await loadEditablePost(editPostId, user.id, isAdmin);

      if (editablePost === 'FORBIDDEN') {
        if (note) note.textContent = '본인이 작성한 글만 수정할 수 있어.';
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      if (!editablePost) {
        if (note) note.textContent = '수정할 게시물을 찾지 못했어.';
        if (submitBtn) submitBtn.disabled = true;
        return;
      }

      fillWriteForm(editablePost, isAdmin);
      if (note) {
        note.textContent = isAdmin
          ? '수정 모드야. 관리자 권한으로 게시물을 수정할 수 있어.'
          : '수정 모드야. 내용을 바꾼 뒤 저장해줘.';
      }
    } catch (error) {
      console.error('[write] load editable post failed:', error);
      if (note) note.textContent = '게시물 정보를 불러오지 못했어.';
      if (submitBtn) submitBtn.disabled = true;
      return;
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = $('#title')?.value?.trim() || '';
    const excerpt = $('#excerpt')?.value?.trim() || '';
    const body = $('#body')?.value?.trim() || '';
    const category = normalizeCategory($('#category')?.value || 'study');
    const tags = parseTags($('#tags')?.value || '');
    const pinned = isAdmin ? !!$('#pinned')?.checked : false;

    if (!title || !excerpt || !body) {
      note.textContent = '제목, 요약, 본문은 필수야.';
      return;
    }

    note.textContent = editPostId ? '수정 중...' : '등록 중...';
    if (submitBtn) submitBtn.disabled = true;

    if (editPostId) {
      const payload = {
        title,
        excerpt,
        body,
        category,
        tags,
        pinned,
      };

      let query = supabase.from('posts').update(payload).eq('id', editPostId);

      if (!isAdmin) {
        query = query.eq('author_id', user.id);
      }

      const { error } = await query;

      if (submitBtn) submitBtn.disabled = false;

      if (error) {
        console.error('[write] update failed:', error);
        note.textContent = `수정 실패: ${error.message}`;
        return;
      }

      note.textContent = '수정 완료! 상세 페이지로 이동할게.';

      setTimeout(() => {
        window.location.href = `./post.html?id=${editPostId}`;
      }, 400);

      return;
    }

    const payload = {
      title,
      excerpt,
      body,
      category,
      tags,
      pinned,
      author_id: user.id,
      author_nickname: getNicknameFromUser(user),
    };

    const { data, error } = await supabase
      .from('posts')
      .insert(payload)
      .select('id')
      .single();

    if (submitBtn) submitBtn.disabled = false;

    if (error) {
      console.error('[write] insert failed:', error);
      note.textContent = `등록 실패: ${error.message}`;
      return;
    }

    note.textContent = '등록 완료! 상세 페이지로 이동할게.';
    form.reset();
    setPinnedUiVisible(isAdmin);

    setTimeout(() => {
      window.location.href = `./post.html?id=${data.id}`;
    }, 400);
  });
}
