// assets/js/modules/update-banner.js

let isUpdateBannerVisible = false;
let isUpdateFlowRunning = false;

export function showUpdateBanner(onUpdateClick, options = {}) {
  if (
    isUpdateBannerVisible ||
    document.getElementById('update-banner') ||
    document.querySelector('[data-update-banner]')
  ) {
    return;
  }

  const targetVersion = String(options.targetVersion || '').trim();

  const banner = document.createElement('div');
  banner.id = 'update-banner';
  banner.dataset.updateBanner = 'true';
  if (targetVersion) {
    banner.dataset.targetVersion = targetVersion;
  }

  banner.innerHTML = `
    <div class="update-inner">
      <span>🚀 새 업데이트가 있어!</span>
      <button id="update-btn">업데이트하기</button>
    </div>
  `;

  document.body.appendChild(banner);
  isUpdateBannerVisible = true;

  document.getElementById('update-btn').addEventListener('click', () => {
    if (isUpdateFlowRunning) return;

    isUpdateFlowRunning = true;
    const button = document.getElementById('update-btn');
    if (button) {
      button.disabled = true;
      button.setAttribute('aria-disabled', 'true');
    }

    if (typeof onUpdateClick === 'function') {
      onUpdateClick(targetVersion);
    } else {
      location.reload();
    }
  });
}
