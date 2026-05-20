// assets/js/modules/update-banner.js

export function showUpdateBanner(onUpdateClick) {
  if (document.getElementById('update-banner')) return;

  const banner = document.createElement('div');
  banner.id = 'update-banner';

  banner.innerHTML = `
    <div class="update-inner">
      <span>🚀 새 업데이트가 있어!</span>
      <button id="update-btn">업데이트하기</button>
    </div>
  `;

  document.body.appendChild(banner);

  document.getElementById('update-btn').addEventListener('click', () => {
    if (typeof onUpdateClick === 'function') {
      onUpdateClick();
    } else {
      location.reload();
    }
  });
}
