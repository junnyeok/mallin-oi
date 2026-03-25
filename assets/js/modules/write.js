import { supabase } from './supabase-client.js';
import { loadEditablePostById } from './posts-repo.js';

const ALLOWED_CATEGORIES = new Set(['study', 'work', 'event', 'career']);
const STORAGE_BUCKET = 'post-assets';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const VIDEO_MAX_BYTES = 100 * 1024 * 1024;
const FILE_MAX_BYTES = 30 * 1024 * 1024;

let attachmentState = [];
let removedStoragePaths = new Set();

function $(selector) {
  return document.querySelector(selector);
}

function createLocalId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
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

  const clean = raw.map((tag) => tag.replace(/^#/, '').trim()).filter(Boolean);

  return [...new Set(clean)];
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
    console.error('[write] get_my_role failed:', error);
    return { isAdmin: false };
  }

  const row = Array.isArray(data) ? data[0] : data;

  return {
    isAdmin: toBoolean(row?.is_admin),
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
    titleEl.textContent = isEdit ? '게시물 수정' : '새 글쓰기';
  }

  if (descEl) {
    descEl.textContent = isEdit
      ? '기존 게시물을 수정할 수 있어.'
      : '제목, 요약, 본문을 입력해서 새 게시물을 등록해줘.';
  }

  if (submitBtn) {
    submitBtn.textContent = isEdit ? '수정 완료' : '등록하기';
  }

  if (note) {
    note.textContent = isEdit
      ? '수정 모드야. 내용을 바꾼 뒤 저장해줘.'
      : '로그인한 사용자만 글을 등록할 수 있어.';
  }
}

function setPinnedUiVisible(isAdmin) {
  const row = $('#pinnedRow');
  if (!row) return;
  row.hidden = !isAdmin;
}

function resetAttachmentInputs() {
  const fileInput = $('#writeFile');
  const imageInput = $('#writeImage');
  const videoInput = $('#writeVideo');

  if (fileInput) fileInput.value = '';
  if (imageInput) imageInput.value = '';
  if (videoInput) videoInput.value = '';
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '0B';

  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let current = value;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)}${units[unitIndex]}`;
}

function getAttachmentLabel(type) {
  if (type === 'image') return '이미지';
  if (type === 'video') return '동영상';
  return '파일';
}

function renderAttachmentList() {
  const listEl = $('#writeAttachmentList');
  if (!listEl) return;

  if (!attachmentState.length) {
    listEl.innerHTML = `<div class="write-attach-empty">첨부한 파일이 없어.</div>`;
    return;
  }

  listEl.innerHTML = attachmentState
    .map((item) => {
      const label = getAttachmentLabel(item.type);
      const name = escapeHtml(item.title || item.fileName || '첨부파일');
      const size = formatBytes(item.size);
      const removable = item.removable !== false;

      return `
        <div class="write-attach-item" data-id="${escapeHtml(item.id)}">
          <div class="write-attach-item__body">
            <span class="write-attach-item__badge">${label}</span>
            <div class="write-attach-item__meta">
              <p class="write-attach-item__title">${name}</p>
              <p class="write-attach-item__sub">${size}</p>
            </div>
          </div>
          ${
            removable
              ? `<button type="button" class="write-attach-item__remove" data-remove-id="${escapeHtml(item.id)}">삭제</button>`
              : ''
          }
        </div>
      `;
    })
    .join('');
}

function pushAttachment(file, type) {
  attachmentState.push({
    id: createLocalId(),
    type,
    title: file.name,
    fileName: file.name,
    mimeType: file.type || '',
    size: Number(file.size || 0),
    file,
    removable: true,
  });

  renderAttachmentList();
}

function validateAttachment(file, type) {
  if (!file) return '파일을 찾지 못했어.';

  const size = Number(file.size || 0);

  if (type === 'image' && size > IMAGE_MAX_BYTES) {
    return '이미지는 10MB 이하만 가능해.';
  }

  if (type === 'video' && size > VIDEO_MAX_BYTES) {
    return '동영상은 100MB 이하만 가능해.';
  }

  if (type === 'file' && size > FILE_MAX_BYTES) {
    return '일반 파일은 30MB 이하만 가능해.';
  }

  return '';
}

function bindAttachmentInputs(note) {
  const imageInput = $('#writeImage');
  const videoInput = $('#writeVideo');
  const fileInput = $('#writeFile');
  const listEl = $('#writeAttachmentList');

  if (imageInput) {
    imageInput.addEventListener('change', () => {
      const files = Array.from(imageInput.files || []);
      for (const file of files) {
        const errorMsg = validateAttachment(file, 'image');
        if (errorMsg) {
          if (note) note.textContent = errorMsg;
          continue;
        }
        pushAttachment(file, 'image');
      }
      imageInput.value = '';
    });
  }

  if (videoInput) {
    videoInput.addEventListener('change', () => {
      const files = Array.from(videoInput.files || []);
      for (const file of files) {
        const errorMsg = validateAttachment(file, 'video');
        if (errorMsg) {
          if (note) note.textContent = errorMsg;
          continue;
        }
        pushAttachment(file, 'video');
      }
      videoInput.value = '';
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', () => {
      const files = Array.from(fileInput.files || []);
      for (const file of files) {
        const errorMsg = validateAttachment(file, 'file');
        if (errorMsg) {
          if (note) note.textContent = errorMsg;
          continue;
        }
        pushAttachment(file, 'file');
      }
      fileInput.value = '';
    });
  }

  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-id]');
      if (!btn) return;

      const id = btn.getAttribute('data-remove-id');
      const found = attachmentState.find((item) => item.id === id);
      if (!found) return;

      if (found.path) {
        removedStoragePaths.add(found.path);
      }

      attachmentState = attachmentState.filter((item) => item.id !== id);
      renderAttachmentList();
    });
  }
}

async function uploadSingleAttachment(user, item) {
  if (!item?.file) {
    return {
      id: item.id,
      type: item.type,
      title: item.title || item.fileName || '첨부',
      url: item.url || '',
      path: item.path || '',
      fileName: item.fileName || '',
      mimeType: item.mimeType || '',
      size: Number(item.size || 0),
    };
  }

  const ext = item.file.name.includes('.')
    ? item.file.name.split('.').pop()
    : 'bin';
  const safeExt = String(ext || 'bin').replace(/[^a-zA-Z0-9]/g, '') || 'bin';
  const fileName = `${Date.now()}-${Math.random().toString(16).slice(2)}.${safeExt}`;
  const path = `${user.id}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, item.file, {
      cacheControl: '3600',
      upsert: false,
      contentType: item.file.type || undefined,
    });

  if (uploadError) throw uploadError;

  const { data: publicData } = supabase.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(path);

  return {
    id: item.id,
    type: item.type,
    title: item.title || item.fileName || item.file.name || '첨부',
    url: publicData?.publicUrl || '',
    path,
    fileName: item.file.name || item.fileName || '',
    mimeType: item.file.type || item.mimeType || '',
    size: Number(item.file.size || item.size || 0),
  };
}

async function uploadAllAttachments(user, note) {
  const result = [];

  for (const item of attachmentState) {
    if (note) {
      note.textContent = `첨부 업로드 중... (${result.length + 1}/${attachmentState.length})`;
    }

    const uploaded = await uploadSingleAttachment(user, item);
    result.push(uploaded);
  }

  return result;
}

async function deleteRemovedStorageObjects() {
  const paths = [...removedStoragePaths].filter(Boolean);
  if (!paths.length) return;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  if (error) {
    console.error('[write] storage remove failed:', error);
  }

  removedStoragePaths = new Set();
}

function normalizeSecretPassword(value) {
  return String(value || '').trim();
}

async function sha256Hex(value) {
  const src = new TextEncoder().encode(String(value || ''));
  const hashBuffer = await crypto.subtle.digest('SHA-256', src);
  const bytes = Array.from(new Uint8Array(hashBuffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
}

function syncPrivatePasswordUi(isEdit = false) {
  const isPrivateEl = $('#isPrivate');
  const row = $('#privatePasswordRow');
  const input = $('#privatePassword');

  if (!isPrivateEl || !row || !input) return;

  const visible = !!isPrivateEl.checked;
  row.hidden = !visible;

  if (!visible) {
    input.value = '';
    return;
  }

  input.placeholder = isEdit
    ? '새 비밀번호 입력 (비워두면 기존 비밀번호 유지)'
    : '비밀글 비밀번호 입력 (4~30자)';
}

async function loadEditablePost(postId, userId) {
  const data = await loadEditablePostById(postId);
  if (!data) return null;

  if (!data.author_id || String(data.author_id) !== String(userId)) {
    return 'FORBIDDEN';
  }

  return data;
}

function fillWriteForm(post, isAdmin) {
  const titleEl = $('#title');
  const excerptEl = $('#excerpt');
  const bodyEl = $('#body');
  const categoryEl = $('#category');
  const tagsEl = $('#tags');
  const pinnedEl = $('#pinned');
  const isPrivateEl = $('#isPrivate');
  const privatePasswordEl = $('#privatePassword');

  if (titleEl) titleEl.value = post.title || '';
  if (excerptEl) excerptEl.value = post.excerpt || '';
  if (bodyEl) bodyEl.value = post.body || '';
  if (categoryEl) categoryEl.value = normalizeCategory(post.category);
  if (tagsEl)
    tagsEl.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
  if (pinnedEl) pinnedEl.checked = isAdmin ? !!post.pinned : false;
  if (isPrivateEl) isPrivateEl.checked = !!post.is_private;
  if (privatePasswordEl) privatePasswordEl.value = '';

  attachmentState = Array.isArray(post.media_items)
    ? post.media_items.map((item) => ({
        id: item.id || createLocalId(),
        type: item.type,
        title: item.title || item.fileName || '첨부',
        url: item.url || '',
        path: item.path || '',
        fileName: item.fileName || '',
        mimeType: item.mimeType || '',
        size: Number(item.size || 0),
        removable: true,
      }))
    : [];

  removedStoragePaths = new Set();
  renderAttachmentList();
  syncPrivatePasswordUi(true);
}

export async function initWrite() {
  const form = $('#writeForm');
  if (!form) return;

  const note = $('#writeNote');
  const submitBtn = $('#writeSubmitBtn');
  const editPostId = getEditPostId();

  setWriteModeUi(!!editPostId);
  renderAttachmentList();
  bindAttachmentInputs(note);

  const isPrivateEl = $('#isPrivate');
  if (isPrivateEl) {
    isPrivateEl.addEventListener('change', () => {
      syncPrivatePasswordUi(!!editPostId);
    });
  }
  syncPrivatePasswordUi(!!editPostId);

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = './login.html';
    return;
  }

  const { isAdmin } = await getMyRole();
  setPinnedUiVisible(isAdmin);

  if (editPostId) {
    try {
      const editablePost = await loadEditablePost(editPostId, user.id);

      if (editablePost === 'FORBIDDEN') {
        alert('본인 글만 수정할 수 있어.');
        window.location.href = `./post.html?id=${editPostId}`;
        return;
      }

      if (!editablePost) {
        alert('수정할 게시물을 찾지 못했어.');
        window.location.href = './posts-all.html';
        return;
      }

      fillWriteForm(editablePost, isAdmin);
    } catch (error) {
      console.error('[write] load editable post failed:', error);
      alert('수정 데이터를 불러오지 못했어.');
      window.location.href = './posts-all.html';
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
    const isPrivate = !!$('#isPrivate')?.checked;
    const privatePassword = normalizeSecretPassword(
      $('#privatePassword')?.value || '',
    );

    if (!title || !excerpt || !body) {
      if (note) note.textContent = '제목, 요약, 본문은 필수야.';
      return;
    }

    if (isPrivate) {
      if (!editPostId && privatePassword.length < 4) {
        if (note) note.textContent = '비밀글은 비밀번호를 4자 이상 입력해줘.';
        return;
      }

      if (privatePassword && privatePassword.length < 4) {
        if (note) note.textContent = '비밀글 비밀번호는 4자 이상이어야 해.';
        return;
      }
    }

    if (note) {
      note.textContent = editPostId ? '수정 준비 중...' : '등록 준비 중...';
    }
    if (submitBtn) submitBtn.disabled = true;

    try {
      const mediaItems = await uploadAllAttachments(user, note);

      if (editPostId) {
        const payload = {
          title,
          excerpt,
          body,
          category,
          tags,
          pinned,
          media_items: mediaItems,
          is_private: isPrivate,
        };

        if (isPrivate) {
          if (privatePassword) {
            payload.secret_password_hash = await sha256Hex(privatePassword);
          }
        } else {
          payload.secret_password_hash = null;
        }

        const { error } = await supabase
          .from('posts')
          .update(payload)
          .eq('id', editPostId)
          .eq('author_id', user.id);

        if (error) throw error;

        await deleteRemovedStorageObjects();

        if (note) note.textContent = '수정 완료! 상세 페이지로 이동할게.';

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
        media_items: mediaItems,
        author_id: user.id,
        author_nickname: getNicknameFromUser(user),
        is_private: isPrivate,
        secret_password_hash: isPrivate
          ? await sha256Hex(privatePassword)
          : null,
      };

      const { data, error } = await supabase
        .from('posts')
        .insert(payload)
        .select('id')
        .single();

      if (error) throw error;

      if (note) note.textContent = '등록 완료! 상세 페이지로 이동할게.';
      form.reset();
      resetAttachmentInputs();
      attachmentState = [];
      removedStoragePaths = new Set();
      renderAttachmentList();
      setPinnedUiVisible(isAdmin);
      syncPrivatePasswordUi(false);

      setTimeout(() => {
        window.location.href = `./post.html?id=${data.id}`;
      }, 400);
    } catch (error) {
      console.error('[write] save failed:', error);
      if (note) note.textContent = `저장 실패: ${error.message}`;
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}
