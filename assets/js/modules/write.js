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

export async function initWrite() {
  const form = $('#writeForm');
  if (!form) return;

  const note = $('#writeNote');
  const submitBtn = $('#writeSubmitBtn');

  const user = await getCurrentUser();

  if (!user) {
    saveRedirectHere();
    window.location.href = './account/login.html';
    return;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = $('#title')?.value?.trim() || '';
    const excerpt = $('#excerpt')?.value?.trim() || '';
    const body = $('#body')?.value?.trim() || '';
    const category = normalizeCategory($('#category')?.value || 'study');
    const tags = parseTags($('#tags')?.value || '');
    const pinned = !!$('#pinned')?.checked;

    if (!title || !excerpt || !body) {
      note.textContent = '제목, 요약, 본문은 필수야.';
      return;
    }

    note.textContent = '등록 중...';
    if (submitBtn) submitBtn.disabled = true;

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

    setTimeout(() => {
      window.location.href = `./post.html?id=${data.id}`;
    }, 400);
  });
}
