// assets/js/modules/write.js
/* =================================================
  write.js
  - write.html 전용
  - 등록 클릭:
    1) posts.json에 추가할 객체(JSON) 생성
    2) posts/pXXX.html 템플릿 생성 (✅ 본문 포함)
    3) 결과를 localStorage에 저장 -> 다음 등록 전까지 안 사라짐
================================================= */

const STORAGE_KEY = 'writeOutput_v1';

// ✅ home 제외: write에서 허용하는 카테고리 고정
const ALLOWED_CATEGORIES = new Set(['study', 'work', 'event', 'career']);

function $(sel) {
  return document.querySelector(sel);
}

function pad3(n) {
  return String(n).padStart(3, '0');
}

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  }
}

/* ===== posts.json에서 다음 id 자동 계산 ===== */
async function getNextPostId() {
  try {
    const res = await fetch('./assets/data/posts.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('posts.json fetch failed');
    const posts = await res.json();

    const nums = posts
      .map((p) => String(p.id || ''))
      .map((id) => {
        const m = id.match(/^p(\d{3})$/);
        return m ? Number(m[1]) : null;
      })
      .filter((v) => typeof v === 'number' && !Number.isNaN(v));

    const max = nums.length ? Math.max(...nums) : 0;
    return `p${pad3(max + 1)}`;
  } catch (e) {
    console.warn('[write] getNextPostId fallback:', e);
    return 'pNEW';
  }
}

function parseTags(input) {
  const raw = String(input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const clean = raw.map((t) => t.replace(/^#/, ''));
  return Array.from(new Set(clean));
}

function categoryLogo(category) {
  return `../images/logo-${category}.png`;
}

function categoryPageCss(category) {
  return `../assets/css/pages/${category}.css`;
}

function buildPostObject({ id, title, excerpt, category, date, pinned, tags }) {
  return {
    id,
    title: title.trim(),
    excerpt: excerpt.trim(),
    category,
    date,
    views: 0,
    pinned: !!pinned,
    tags,
    url: `posts/${id}.html`,
  };
}

/* ========= 본문 변환 =========
  - HTML 태그가 있으면: 그대로 넣음
  - 순수 텍스트면: 문단/줄바꿈을 HTML로 변환 + XSS 방지용 escape
*/
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function looksLikeHtml(text) {
  // 아주 단순 판단: "<"가 있고, 태그처럼 보이면 HTML로 간주
  const t = String(text || '').trim();
  if (!t) return false;
  return /<\s*[a-zA-Z][\s\S]*>/.test(t);
}

function renderBodyHtml(bodyInput) {
  const raw = String(bodyInput || '').trim();

  if (!raw) {
    return `<p class="post-body__hint">
  (여기는 본문 영역) 나중에 글 내용(HTML/Markdown 변환)을 넣으면 됨.
</p>`;
  }

  // HTML이면 그대로(사용자 책임)
  if (looksLikeHtml(raw)) return raw;

  // 텍스트면 안전하게 escape 후 문단 처리
  const safe = escapeHtml(raw);

  // \n\n 기준 문단, 문단 내부 \n 은 <br>
  const paras = safe
    .split(/\n{2,}/g)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replaceAll('\n', '<br />')}</p>`);

  return paras.join('\n');
}

/* ✅ 현재 프로젝트 post 페이지 구조 기반 템플릿 */
function buildPostHtmlTemplate({ id, category, bodyHtml }) {
  const logo = categoryLogo(category);
  const pageCss = categoryPageCss(category);

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>게시물 | 말린오이닷컴</title>

    <!-- ✅ 상위폴더 기준 상대경로 -->
    <link rel="shortcut icon" href="../images/favicon.ico" />

    <!-- 공통 -->
    <link rel="stylesheet" href="../assets/css/00-reset.css" />
    <link rel="stylesheet" href="../assets/css/01-tokens.css" />
    <link rel="stylesheet" href="../assets/css/02-base.css" />
    <link rel="stylesheet" href="../assets/css/03-layout.css" />
    <link rel="stylesheet" href="../assets/css/components/buttons.css" />
    <link rel="stylesheet" href="../assets/css/components/forms.css" />
    <link rel="stylesheet" href="../assets/css/components/cursor-buddy.css" />
    <link rel="stylesheet" href="../assets/css/components/nav.css" />
    <link rel="stylesheet" href="../assets/css/components/footer.css" />
    <link rel="stylesheet" href="../assets/css/components/weekly-nav-btn.css" />
    <link rel="stylesheet" href="../assets/css/components/post-btn.css" />
    <link rel="stylesheet" href="../assets/css/components/scroll-buttons.css" />
    <link rel="stylesheet" href="../assets/css/components/write-btn.css" />

    <!-- 페이지 css -->
    <link rel="stylesheet" href="${pageCss}" />

    <!-- main -->
    <link rel="stylesheet" href="../assets/css/main/post-main.css" />
    <link rel="stylesheet" href="../assets/css/main/posts-all-main.css" />
  </head>

  <!-- ✅ 이 게시물은 ${id} -->
  <body class="theme-${category}" data-page="${category}" data-post-id="${id}">
    <div class="page">
      <!-- 헤더 -->
      <header class="site-header">
        <div class="container header-inner">
          <a class="logo" href="../index.html" aria-label="홈으로">
            <img src="${logo}" alt="말린오이닷com" />
            <img src="../images/logo-word.png" alt="말린오이닷컴" />
          </a>

          <form class="search" role="search">
            <label class="sr-only" for="q">검색</label>
            <input id="q" class="search__input" type="search" placeholder="검색어를 입력하세요." />
            <button class="btn search__btn" type="submit" aria-label="검색">🔍</button>
          </form>

          <a class="write-btn write-btn--corner" href="../write.html" aria-label="새 글 쓰기">
            ✍️ 새글쓰기
          </a>
        </div>

        <nav class="site-nav" aria-label="주요 메뉴">
          <ul class="site-nav__list">
            <li class="site-nav__item"><a class="site-nav__link" href="../index.html">홈</a></li>
            <li class="site-nav__item"><a class="site-nav__link" href="../menu/study.html">공부</a></li>
            <li class="site-nav__item"><a class="site-nav__link" href="../menu/work.html">업무</a></li>
            <li class="site-nav__item"><a class="site-nav__link" href="../menu/event.html">이벤트</a></li>
            <li class="site-nav__item"><a class="site-nav__link" href="../menu/career.html">이력</a></li>
          </ul>
        </nav>
      </header>

      <main class="site-main">
        <section class="post">
          <div class="container">
            <div class="post__top">
              <a class="post__back" href="#" id="postBack">← 뒤로가기</a>
            </div>

            <article class="post-card" aria-labelledby="postTitle">
              <header class="post-head">
                <div class="post-meta">
                  <span class="chip" id="postCategory">category</span>
                  <span class="chip chip--muted" id="postViews">👀 0</span>
                </div>

                <h1 class="post-title" id="postTitle">로딩중...</h1>
                <p class="post-excerpt" id="postExcerpt"></p>
                <div class="post-tags" id="postTags"></div>
              </header>

              <hr class="post-divider" />

              <section class="post-body">
${bodyHtml
  .split('\n')
  .map((line) => `                ${line}`)
  .join('\n')}
              </section>
            </article>

            <nav class="post-pager" aria-label="이전글 다음글"
              style="margin: var(--space-16) 0 var(--space-24); display:flex; align-items:center; justify-content:space-between; gap: var(--space-12);">
              <a href="#" id="postPrevBtn" class="weekly-nav__btn" aria-disabled="true">← 이전글</a>
              <a href="../posts-all.html" id="postListBtn" class="weekly-nav__btn">목록</a>
              <a href="#" id="postNextBtn" class="weekly-nav__btn" aria-disabled="true">다음글 →</a>
            </nav>

            <section class="post-detail-list posts-all__list" aria-label="다른 게시물 목록">
              <div class="post-detail-list__head">
                <h2 class="post-detail-list__title">다른 게시물</h2>
              </div>

              <div class="posts-all__rows" id="detailPostList"></div>

              <div class="post-detail-list__pager post posts-all__pager" aria-label="목록 페이지네이션">
                <button type="button" class="weekly-nav__btn" id="detailPrevBtn" aria-label="이전 페이지">←</button>
                <span class="post-detail-list__page" id="detailPageInfo">1 / 1</span>
                <button type="button" class="weekly-nav__btn" id="detailNextBtn" aria-label="다음 페이지">→</button>
              </div>
            </section>
          </div>
        </section>
      </main>

      <footer class="site-footer">
        <div class="container footer-inner">
          <div class="footer-brand">
            <a class="footer-brand__logo" href="../index.html" aria-label="홈으로">
              <img src="${logo}" alt="말린오이닷컴" />
            </a>
            <p class="footer-brand__desc">공부 · 업무 · 이벤트 · 이력을 한 곳에 정리하는 개인 사이트.</p>
          </div>

          <nav class="footer-nav" aria-label="푸터 링크">
            <h2 class="footer-title">바로가기</h2>
            <ul class="footer-list">
              <li><a class="footer-link" href="../menu/study.html">공부</a></li>
              <li><a class="footer-link" href="../menu/work.html">업무</a></li>
              <li><a class="footer-link" href="../menu/event.html">이벤트</a></li>
              <li><a class="footer-link" href="../menu/career.html">이력</a></li>
            </ul>
          </nav>

          <div class="footer-contact">
            <h2 class="footer-title">연락</h2>
            <ul class="footer-list">
              <li><a class="footer-link" href="mailto:junna961@icloud.com">junna961@icloud.com</a></li>
              <li><a class="footer-link" href="https://www.instagram.com/junnyeok/" target="_blank" rel="noopener">Instagram</a></li>
              <li><a class="footer-link" href="https://github.com" target="_blank" rel="noopener">GitHub</a></li>
            </ul>
          </div>
        </div>

        <div class="footer-bottom">
          <div class="container footer-bottom__inner">
            <small>© <span id="year"></span> 말린오이닷컴. All rights reserved.</small>
            <a class="footer-link footer-link--small" href="#">개인정보처리방침</a>
          </div>
        </div>
      </footer>
    </div>

    <img id="cukeBuddy" src="../images/logo-home.png" alt="말린오이" class="cursor-buddy" />
    <script type="module" src="../assets/js/main.js"></script>
  </body>
</html>`;
}

/* ===== localStorage 저장/복원 ===== */
function saveOutput({ id, jsonText, htmlText }) {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        id,
        jsonText,
        htmlText,
        savedAt: Date.now(),
      })
    );
  } catch (e) {
    console.warn('[write] saveOutput failed:', e);
  }
}

function loadOutput() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function initWrite() {
  const form = $('#writeForm');
  if (!form) return;

  const outJson = $('#outJson');
  const outHtml = $('#outHtml');
  const copyJsonBtn = $('#copyJson');
  const copyHtmlBtn = $('#copyHtml');
  const note = $('#writeNote');
  const dateEl = $('#date');

  if (dateEl && !dateEl.value) dateEl.value = todayISO();

  // ✅ 페이지 들어왔을 때 이전 결과가 있으면 복원 (다음 등록 전까지 유지)
  const cached = loadOutput();
  if (cached?.jsonText || cached?.htmlText) {
    outJson.textContent = cached.jsonText || '';
    outHtml.textContent = cached.htmlText || '';
    copyJsonBtn.disabled = !cached.jsonText;
    copyHtmlBtn.disabled = !cached.htmlText;

    const when = cached.savedAt ? new Date(cached.savedAt) : null;
    note.textContent = cached.id
      ? `이전 생성 결과(${cached.id}) 복원됨${
          when ? ` (저장: ${when.toLocaleString()})` : ''
        }`
      : '이전 생성 결과 복원됨';
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    note.textContent = '생성 중...';

    const title = $('#title')?.value || '';
    const excerpt = $('#excerpt')?.value || '';
    const body = $('#body')?.value || '';

    // ✅ home 완전 차단: 허용 목록으로만 고정
    let category = $('#category')?.value || 'study';
    if (!ALLOWED_CATEGORIES.has(category)) category = 'study';

    const date = $('#date')?.value || todayISO();
    const tags = parseTags($('#tags')?.value || '');
    const pinned = !!$('#pinned')?.checked;

    if (!title.trim() || !excerpt.trim()) {
      note.textContent = '제목이랑 요약은 필수야.';
      return;
    }

    const id = await getNextPostId();

    const postObj = buildPostObject({
      id,
      title,
      excerpt,
      category,
      date,
      pinned,
      tags,
    });

    const jsonText = JSON.stringify(postObj, null, 2);

    // ✅✅ 본문 HTML 생성해서 템플릿에 주입
    const bodyHtml = renderBodyHtml(body);
    const htmlText = buildPostHtmlTemplate({ id, category, bodyHtml });

    outJson.textContent = jsonText;
    outHtml.textContent = htmlText;

    copyJsonBtn.disabled = false;
    copyHtmlBtn.disabled = false;

    // ✅ 저장: 다음 등록 전까지 출력 유지
    saveOutput({ id, jsonText, htmlText });

    // 속도용: JSON 자동 복사
    const ok = await copyToClipboard(jsonText);
    note.textContent = ok
      ? `완료! 새 글 ID: ${id} — JSON 복사됨. (posts.json에 붙여넣고, posts/${id}.html 파일 만들어서 HTML 붙여넣기)`
      : `완료! 새 글 ID: ${id} — 복사는 실패했어. 아래 출력에서 직접 복사해줘.`;
  });

  copyJsonBtn?.addEventListener('click', async () => {
    const ok = await copyToClipboard(outJson.textContent || '');
    note.textContent = ok
      ? 'JSON 복사 완료!'
      : 'JSON 복사 실패. 직접 복사해줘.';
  });

  copyHtmlBtn?.addEventListener('click', async () => {
    const ok = await copyToClipboard(outHtml.textContent || '');
    note.textContent = ok
      ? 'HTML 복사 완료!'
      : 'HTML 복사 실패. 직접 복사해줘.';
  });
}
