import { supabase } from './supabase-client.js';

const ALLOWED_CATEGORIES = new Set(['study', 'work', 'event', 'career']);
const STORAGE_BUCKET = 'post-assets';

const IMAGE_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const VIDEO_MAX_BYTES = 100 * 1024 * 1024; // 100MB
const FILE_MAX_BYTES = 30 * 1024 * 1024; // 30MB

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

  if (pinnedRow) {
    pinnedRow.hidden = !visible;
    pinnedRow.setAttribute('aria-hidden', visible ? 'false' : 'true');
  }

  if (!visible && pinnedEl) {
    pinnedEl.checked = false;
  }
}

function normalizeMediaItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item) => ({
      id: item?.id || createLocalId(),
      type: String(item?.type || '').trim(),
      title: String(item?.title || '').trim(),
      url: String(item?.url || '').trim(),
      path: String(item?.path || '').trim(),
      fileName: String(item?.fileName || '').trim(),
      mimeType: String(item?.mimeType || '').trim(),
      size: Number(item?.size || 0),
      isNew: false,
      file: null,
    }))
    .filter((item) => item.type && (item.url || item.path));
}

async function loadEditablePost(postId, userId) {
  const { data, error } = await supabase
    .from('posts')
    .select(
      'id, title, excerpt, body, category, tags, pinned, media_items, author_id, author_nickname',
    )
    .eq('id', postId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (!data.author_id || String(data.author_id) !== String(userId)) {
    return 'FORBIDDEN';
  }

  return data;
}

function formatBytes(bytes) {
  const n = Number(bytes || 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)}KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)}GB`;
}

function getAttachmentIcon(type) {
  switch (type) {
    case 'image':
      return '🖼️';
    case 'video':
      return '🎬';
    case 'file':
      return '📎';
    case 'link':
      return '🔗';
    case 'map':
      return '🗺️';
    default:
      return '📄';
  }
}

function getAttachmentTypeLabel(type) {
  switch (type) {
    case 'image':
      return '사진';
    case 'video':
      return '영상';
    case 'file':
      return '파일';
    case 'link':
      return '링크';
    case 'map':
      return '지도';
    default:
      return '첨부';
  }
}

function sanitizeFileName(name) {
  return String(name || 'file')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._-]/g, '');
}

function getFileLimitByType(type) {
  if (type === 'image') return IMAGE_MAX_BYTES;
  if (type === 'video') return VIDEO_MAX_BYTES;
  return FILE_MAX_BYTES;
}

function resetAttachmentInputs() {
  const imageInput = $('#imageFiles');
  const videoInput = $('#videoFiles');
  const docInput = $('#docFiles');
  const linkTitle = $('#linkTitle');
  const linkUrl = $('#linkUrl');
  const mapTitle = $('#mapTitle');
  const mapUrl = $('#mapUrl');

  if (imageInput) imageInput.value = '';
  if (videoInput) videoInput.value = '';
  if (docInput) docInput.value = '';
  if (linkTitle) linkTitle.value = '';
  if (linkUrl) linkUrl.value = '';
  if (mapTitle) mapTitle.value = '';
  if (mapUrl) mapUrl.value = '';
}

function renderAttachmentList() {
  const listEl = $('#attachmentList');
  if (!listEl) return;

  if (!attachmentState.length) {
    listEl.innerHTML = `<p class="write-empty">아직 추가한 첨부가 없어.</p>`;
    return;
  }

  listEl.innerHTML = attachmentState
    .map((item) => {
      const title = item.title || item.fileName || item.url || '제목 없음';
      const metaBits = [
        getAttachmentTypeLabel(item.type),
        item.fileName || '',
        formatBytes(item.size),
        item.isNew ? '새 첨부' : '기존 첨부',
      ].filter(Boolean);

      const linkHtml = item.url
        ? `<a class="write-attach-item__link" href="${escapeHtml(
            item.url,
          )}" target="_blank" rel="noopener noreferrer">열기</a>`
        : '';

      return `
        <div class="write-attach-item" data-attachment-id="${escapeHtml(item.id)}">
          <div class="write-attach-item__main">
            <div class="write-attach-item__icon">${getAttachmentIcon(item.type)}</div>
            <div class="write-attach-item__body">
              <p class="write-attach-item__title">${escapeHtml(title)}</p>
              <p class="write-attach-item__meta">${escapeHtml(metaBits.join(' · '))}</p>
              ${linkHtml}
            </div>
          </div>
          <button
            class="write-attach-remove"
            type="button"
            data-remove-attachment="${escapeHtml(item.id)}"
          >
            삭제
          </button>
        </div>
      `;
    })
    .join('');
}

function addAttachmentItem(item) {
  attachmentState.push({
    id: createLocalId(),
    type: item.type,
    title: item.title || '',
    url: item.url || '',
    path: item.path || '',
    fileName: item.fileName || '',
    mimeType: item.mimeType || '',
    size: Number(item.size || 0),
    file: item.file || null,
    isNew: !!item.isNew,
  });

  renderAttachmentList();
}

function removeAttachmentItem(localId) {
  const target = attachmentState.find((item) => item.id === localId);
  if (!target) return;

  if (target.path) {
    removedStoragePaths.add(target.path);
  }

  attachmentState = attachmentState.filter((item) => item.id !== localId);
  renderAttachmentList();
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

  if (tagsEl) {
    tagsEl.value = Array.isArray(post.tags) ? post.tags.join(', ') : '';
  }

  if (pinnedEl) {
    pinnedEl.checked = isAdmin ? !!post.pinned : false;
  }

  attachmentState = normalizeMediaItems(post.media_items);
  removedStoragePaths = new Set();
  renderAttachmentList();
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function bindFileInput(inputSelector, type, noteEl) {
  const input = $(inputSelector);
  if (!input) return;

  input.addEventListener('change', () => {
    const files = Array.from(input.files || []);
    if (!files.length) return;

    const maxBytes = getFileLimitByType(type);

    for (const file of files) {
      if (file.size > maxBytes) {
        if (noteEl) {
          noteEl.textContent = `${file.name} 파일 크기가 너무 커. ${getAttachmentTypeLabel(
            type,
          )} 용량 제한을 확인해줘.`;
        }
        continue;
      }

      addAttachmentItem({
        type,
        title: file.name,
        fileName: file.name,
        mimeType: file.type || '',
        size: file.size,
        file,
        isNew: true,
      });
    }

    input.value = '';
  });
}

function bindAttachmentUi(noteEl) {
  const addLinkBtn = $('#addLinkBtn');
  const addMapBtn = $('#addMapBtn');
  const listEl = $('#attachmentList');

  if (addLinkBtn) {
    addLinkBtn.addEventListener('click', () => {
      const title = $('#linkTitle')?.value?.trim() || '';
      const url = $('#linkUrl')?.value?.trim() || '';

      if (!url) {
        if (noteEl) noteEl.textContent = '링크 주소를 입력해줘.';
        return;
      }

      if (!isValidHttpUrl(url)) {
        if (noteEl)
          noteEl.textContent = '링크 주소는 http 또는 https 형식이어야 해.';
        return;
      }

      addAttachmentItem({
        type: 'link',
        title: title || url,
        url,
        isNew: false,
      });

      if ($('#linkTitle')) $('#linkTitle').value = '';
      if ($('#linkUrl')) $('#linkUrl').value = '';
      if (noteEl) noteEl.textContent = '링크를 추가했어.';
    });
  }

  if (addMapBtn) {
    addMapBtn.addEventListener('click', () => {
      const title = $('#mapTitle')?.value?.trim() || '';
      const url = $('#mapUrl')?.value?.trim() || '';

      if (!url) {
        if (noteEl) noteEl.textContent = '지도 링크를 입력해줘.';
        return;
      }

      if (!isValidHttpUrl(url)) {
        if (noteEl)
          noteEl.textContent = '지도 링크는 http 또는 https 형식이어야 해.';
        return;
      }

      addAttachmentItem({
        type: 'map',
        title: title || '지도',
        url,
        isNew: false,
      });

      if ($('#mapTitle')) $('#mapTitle').value = '';
      if ($('#mapUrl')) $('#mapUrl').value = '';
      if (noteEl) noteEl.textContent = '지도를 추가했어.';
    });
  }

  if (listEl) {
    listEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-remove-attachment]');
      if (!btn) return;

      const id = btn.getAttribute('data-remove-attachment');
      if (!id) return;

      removeAttachmentItem(id);
      if (noteEl) noteEl.textContent = '첨부를 삭제했어.';
    });
  }

  bindFileInput('#imageFiles', 'image', noteEl);
  bindFileInput('#videoFiles', 'video', noteEl);
  bindFileInput('#docFiles', 'file', noteEl);
}

async function uploadSingleAttachment(user, item) {
  if (!item?.file) {
    return {
      type: item.type,
      title: item.title,
      url: item.url,
      path: item.path,
      fileName: item.fileName,
      mimeType: item.mimeType,
      size: Number(item.size || 0),
    };
  }

  const safeName = sanitizeFileName(item.file.name || 'file');
  const ext = safeName.includes('.') ? safeName.split('.').pop() : '';
  const randomName = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const path = `${user.id}/${item.type}/${randomName}${ext ? `.${ext}` : ''}`;

  const { error } = await supabase.storage
    .from(STORAGE_BUCKET)
    .upload(path, item.file, {
      cacheControl: '3600',
      upsert: false,
    });

  if (error) {
    throw error;
  }

  const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);

  return {
    type: item.type,
    title: item.title || item.file.name,
    url: data?.publicUrl || '',
    path,
    fileName: item.file.name || '',
    mimeType: item.file.type || '',
    size: Number(item.file.size || 0),
  };
}

async function uploadAllAttachments(user, noteEl) {
  const finalItems = [];
  const total = attachmentState.length;
  let step = 0;

  for (const item of attachmentState) {
    step += 1;

    if (item.file) {
      if (noteEl) {
        noteEl.textContent = `첨부 업로드 중... (${step}/${total})`;
      }
    }

    const uploaded = await uploadSingleAttachment(user, item);
    finalItems.push(uploaded);
  }

  return finalItems;
}

async function deleteRemovedStorageObjects() {
  const paths = [...removedStoragePaths].filter(Boolean);
  if (!paths.length) return;

  const { error } = await supabase.storage.from(STORAGE_BUCKET).remove(paths);

  if (error) {
    console.error('[write] remove storage objects failed:', error);
  }

  removedStoragePaths = new Set();
}

export async function initWrite() {
  const form = $('#writeForm');
  if (!form) return;

  const note = $('#writeNote');
  const submitBtn = $('#writeSubmitBtn');
  const editPostId = getEditPostId();

  setWriteModeUi(!!editPostId);
  setPinnedUiVisible(false);
  attachmentState = [];
  removedStoragePaths = new Set();
  renderAttachmentList();
  bindAttachmentUi(note);

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = './login.html';
    return;
  }

  let isAdmin = false;

  try {
    const role = await getMyRole();
    isAdmin = !!role.isAdmin;
  } catch (err) {
    console.error('[write] role check failed:', err);
    isAdmin = false;
  }

  setPinnedUiVisible(isAdmin);

  if (editPostId) {
    if (note) note.textContent = '수정할 글을 불러오는 중...';

    try {
      const editablePost = await loadEditablePost(editPostId, user.id);

      if (editablePost === 'FORBIDDEN') {
        if (note) {
          note.textContent = '본인이 작성한 글만 수정할 수 있어.';
        }
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
        note.textContent = '수정 모드야. 내용을 바꾼 뒤 저장해줘.';
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
      if (note) note.textContent = '제목, 요약, 본문은 필수야.';
      return;
    }

    if (note)
      note.textContent = editPostId ? '수정 준비 중...' : '등록 준비 중...';
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
        };

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
