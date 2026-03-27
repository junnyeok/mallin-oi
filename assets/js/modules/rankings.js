import { supabase } from './supabase-client.js';

const CATEGORY_LABELS = {
  study: '공부',
  work: '업무',
  event: '이벤트',
  career: '이력',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getPageCategory() {
  const page = String(document.body?.dataset?.page || '')
    .trim()
    .toLowerCase();

  if (page === 'study') return 'study';
  if (page === 'work') return 'work';
  if (page === 'event') return 'event';
  if (page === 'career') return 'career';

  return null;
}

function getScopeText(category) {
  if (!category) return '전체 기준';
  return `${CATEGORY_LABELS[category] || category} 게시판 기준`;
}

function renderRankingList(listEl, rows, type = 'post') {
  if (!listEl) return;

  const countLabel = type === 'comment' ? '개' : '개';

  if (!Array.isArray(rows) || rows.length === 0) {
    listEl.innerHTML = `
      <li class="ranking-list__empty">아직 집계할 데이터가 없어.</li>
    `;
    return;
  }

  listEl.innerHTML = rows
    .map((row, index) => {
      const rankNo = Number(row?.rank_no || index + 1);
      const nickname = escapeHtml(row?.author_nickname || '익명');
      const count =
        type === 'comment'
          ? Number(row?.comment_count || 0)
          : Number(row?.post_count || 0);

      return `
        <li class="ranking-list__item">
          <span class="ranking-list__rank">${rankNo}위</span>
          <strong class="ranking-list__name">${nickname}</strong>
          <span class="ranking-list__count">${count}${countLabel}</span>
        </li>
      `;
    })
    .join('');
}

async function loadPostRankings(category) {
  const { data, error } = await supabase.rpc('get_post_author_rankings', {
    p_limit: 3,
    p_category: category,
  });

  if (error) throw error;
  return data || [];
}

async function loadCommentRankings(category) {
  const { data, error } = await supabase.rpc('get_comment_author_rankings', {
    p_limit: 3,
    p_category: category,
  });

  if (error) throw error;
  return data || [];
}

export async function initRankings() {
  const postListEl = document.getElementById('postRankingList');
  const commentListEl = document.getElementById('commentRankingList');
  const postScopeEl = document.getElementById('postRankingScope');
  const commentScopeEl = document.getElementById('commentRankingScope');

  if (!postListEl && !commentListEl) return;

  const category = getPageCategory();
  const scopeText = getScopeText(category);

  if (postScopeEl) postScopeEl.textContent = scopeText;
  if (commentScopeEl) commentScopeEl.textContent = scopeText;

  try {
    const [postRows, commentRows] = await Promise.all([
      loadPostRankings(category),
      loadCommentRankings(category),
    ]);

    renderRankingList(postListEl, postRows, 'post');
    renderRankingList(commentListEl, commentRows, 'comment');
  } catch (error) {
    console.error('[rankings] load failed:', error);

    if (postListEl) {
      postListEl.innerHTML = `
        <li class="ranking-list__empty">게시물 랭킹을 불러오지 못했어.</li>
      `;
    }

    if (commentListEl) {
      commentListEl.innerHTML = `
        <li class="ranking-list__empty">댓글 랭킹을 불러오지 못했어.</li>
      `;
    }
  }
}
