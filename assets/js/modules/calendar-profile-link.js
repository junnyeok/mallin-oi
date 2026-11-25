const SITE_APP_PROFILE = 'mallinoisite://profile';
const WEB_PROFILE = 'https://mallin-oi.com/profile.html';
const SITE_STORES = {
  ios: [
    'itms-apps://itunes.apple.com/app/id6836208752',
    'https://apps.apple.com/kr/app/id6836208752',
  ],
  android: [
    'market://details?id=com.mallinoi.site',
    'https://play.google.com/store/apps/details?id=com.mallinoi.site',
  ],
};

let openingProfile = false;

async function openWithLauncher(launcher, url) {
  try {
    return (await launcher?.openUrl({ url }))?.completed === true;
  } catch {
    return false;
  }
}

function showProfileOptions(opener, launcher, [storeApp, storeWeb]) {
  const dialog = document.createElement('dialog');
  dialog.className = 'calendar-site-profile';
  dialog.setAttribute('aria-labelledby', 'calendarSiteProfileTitle');
  dialog.setAttribute('aria-describedby', 'calendarSiteProfileDescription');
  dialog.innerHTML = `
    <header class="calendar-site-profile__header">
      <h2 id="calendarSiteProfileTitle">말린오이닷컴 앱을 이용할까요?</h2>
      <button type="button" class="calendar-site-profile__close" aria-label="닫기">×</button>
    </header>
    <p id="calendarSiteProfileDescription">앱을 설치하거나 업데이트하면 앱에서 내 프로필을 볼 수 있어요. 인터넷 사이트에서도 열 수 있어요.</p>
    <div class="calendar-site-profile__actions">
      <a class="app-calendar-account__btn app-calendar-account__btn--primary" data-site-store>스토어로 가기</a>
      <a class="app-calendar-account__btn" data-site-web>인터넷사이트에서 열기</a>
    </div>
    <p class="calendar-site-profile__status" role="status" hidden></p>
  `;

  const closeButton = dialog.querySelector('button');
  const status = dialog.querySelector('[role="status"]');
  const storeLink = dialog.querySelector('[data-site-store]');
  const webLink = dialog.querySelector('[data-site-web]');
  const legacyBackdrop = typeof dialog.showModal === 'function' ? null : document.createElement('div');

  function removeDialog() {
    (legacyBackdrop || dialog).remove();
    if (opener?.isConnected && !opener.hidden) opener.focus({ preventScroll: true });
  }

  function closeDialog() {
    if (legacyBackdrop) removeDialog();
    else if (dialog.open) dialog.close();
  }

  function bindLink(link, webUrl, appUrl = webUrl) {
    link.href = webUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    if (typeof launcher?.openUrl !== 'function') {
      link.addEventListener('click', closeDialog);
      return;
    }

    link.addEventListener('click', async (event) => {
      event.preventDefault();
      if (dialog.hasAttribute('aria-busy')) return;

      status.hidden = true;
      dialog.setAttribute('aria-busy', 'true');
      const opened = await openWithLauncher(launcher, appUrl) ||
        (appUrl !== webUrl && await openWithLauncher(launcher, webUrl));
      dialog.removeAttribute('aria-busy');
      if (opened) {
        closeDialog();
      } else if (dialog.isConnected) {
        status.textContent = '페이지를 열지 못했어요. 잠시 후 다시 시도해 주세요.';
        status.hidden = false;
      }
    });
  }

  bindLink(storeLink, storeWeb, storeApp);
  bindLink(webLink, WEB_PROFILE);
  closeButton.addEventListener('click', closeDialog);

  if (legacyBackdrop) {
    legacyBackdrop.className = 'calendar-site-profile-backdrop';
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    legacyBackdrop.append(dialog);
    document.body.append(legacyBackdrop);
    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeDialog();
      if (event.key !== 'Tab') return;
      const edge = event.shiftKey ? closeButton : webLink;
      if (document.activeElement !== edge) return;
      event.preventDefault();
      (event.shiftKey ? webLink : closeButton).focus();
    });
    closeButton.focus();
  } else {
    dialog.addEventListener('close', removeDialog, { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }
}

export async function openCalendarProfile(opener) {
  if (openingProfile || document.querySelector('.calendar-site-profile[open]')) return;

  const capacitor = window.Capacitor;
  const stores = SITE_STORES[capacitor?.getPlatform?.()];
  if (!stores) {
    window.location.assign(WEB_PROFILE);
    return;
  }

  openingProfile = true;
  try {
    const launcher = capacitor.Plugins?.AppLauncher;
    if (!await openWithLauncher(launcher, SITE_APP_PROFILE)) {
      if (opener?.hidden || opener?.isConnected === false) return;
      showProfileOptions(opener, launcher, stores);
    }
  } finally {
    openingProfile = false;
  }
}
