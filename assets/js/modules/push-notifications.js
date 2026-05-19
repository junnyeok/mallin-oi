// assets/js/modules/push-notifications.js
import { supabase } from './supabase-client.js';

const MODULE_VERSION = encodeURIComponent(
  String(window.__SITE_VERSION__ || 'dev').trim(),
);

const { getCurrentUser, showLoginRequiredPopup } = await import(
  `./auth-store.js?v=${MODULE_VERSION}`
);

const { VAPID_PUBLIC_KEY, urlBase64ToUint8Array } = await import(
  `./push-config.js?v=${MODULE_VERSION}`
);

const STATUS_TEXT = {
  unsupported: '지원 안 됨',
  loggedOut: '로그인 필요',
  denied: '권한 차단됨',
  enabled: '켜짐',
  disabled: '꺼짐',
  checking: '확인 중',
};

function $(id) {
  return document.getElementById(id);
}

function isPushSupported() {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

function setPushUi({
  status = 'checking',
  message = '',
  enableDisabled = false,
  disableDisabled = false,
} = {}) {
  const statusEl = $('pushNotificationStatus');
  const messageEl = $('pushNotificationMessage');
  const enableBtn = $('pushNotificationEnableBtn');
  const disableBtn = $('pushNotificationDisableBtn');

  if (statusEl) {
    statusEl.textContent = STATUS_TEXT[status] || STATUS_TEXT.checking;
    statusEl.dataset.status = status;
  }

  if (messageEl) {
    messageEl.textContent = message;
  }

  if (enableBtn) {
    enableBtn.disabled = !!enableDisabled;
    enableBtn.hidden = status === 'enabled';
  }

  if (disableBtn) {
    disableBtn.disabled = !!disableDisabled;
    disableBtn.hidden = status !== 'enabled';
  }
}

function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission;
}

async function getReadyRegistration() {
  if (!('serviceWorker' in navigator)) return null;

  const registration = await navigator.serviceWorker.ready;

  if (!registration?.pushManager) {
    return null;
  }

  return registration;
}

async function getCurrentSubscription() {
  const registration = await getReadyRegistration();
  if (!registration) return null;

  return registration.pushManager.getSubscription();
}

function normalizeSubscription(subscription) {
  const json = subscription?.toJSON?.();

  return {
    endpoint: subscription?.endpoint || json?.endpoint || '',
    p256dh: json?.keys?.p256dh || '',
    auth: json?.keys?.auth || '',
  };
}

async function loadPreference(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('user_notification_preferences')
    .select('push_enabled')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[push] preference load failed:', error);
    return null;
  }

  return data;
}

async function refreshPushStatus() {
  const user = await getCurrentUser();

  if (!user) {
    setPushUi({
      status: 'loggedOut',
      message: '로그인하면 휴대폰 알림을 켤 수 있어.',
      enableDisabled: false,
      disableDisabled: true,
    });
    return;
  }

  if (!isPushSupported()) {
    setPushUi({
      status: 'unsupported',
      message:
        '이 브라우저는 휴대폰 푸시 알림을 지원하지 않아. 최신 Chrome 또는 홈 화면에 추가한 PWA에서 다시 시도해줘.',
      enableDisabled: true,
      disableDisabled: true,
    });
    return;
  }

  const permission = getPermissionState();

  if (permission === 'denied') {
    setPushUi({
      status: 'denied',
      message:
        '알림 권한이 차단돼 있어. 브라우저 또는 OS 설정에서 말린오이닷컴 알림을 직접 허용해야 해.',
      enableDisabled: true,
      disableDisabled: true,
    });
    return;
  }

  const [subscription, preference] = await Promise.all([
    getCurrentSubscription(),
    loadPreference(user.id),
  ]);

  if (subscription && preference?.push_enabled) {
    setPushUi({
      status: 'enabled',
      message:
        '댓글, 답글, 좋아요, 새 상품 소식을 휴대폰 알림으로 받을 수 있어.',
      enableDisabled: true,
      disableDisabled: false,
    });
    return;
  }

  setPushUi({
    status: 'disabled',
    message: '댓글, 답글, 좋아요, 새 상품 소식을 휴대폰 알림으로 받을 수 있어.',
    enableDisabled: false,
    disableDisabled: true,
  });
}

async function enablePushNotifications() {
  const user = await getCurrentUser();

  if (!user) {
    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message: '휴대폰 알림은 로그인 후 켤 수 있어.',
    });
    return;
  }

  if (!isPushSupported()) {
    await refreshPushStatus();
    return;
  }

  if (!VAPID_PUBLIC_KEY || VAPID_PUBLIC_KEY.includes('여기에_')) {
    setPushUi({
      status: 'disabled',
      message: 'VAPID 공개키가 아직 설정되지 않았어.',
      enableDisabled: false,
      disableDisabled: true,
    });
    return;
  }

  if (Notification.permission === 'denied') {
    await refreshPushStatus();
    return;
  }

  setPushUi({
    status: 'checking',
    message: '알림 권한을 확인하는 중이야.',
    enableDisabled: true,
    disableDisabled: true,
  });

  const permission = await Notification.requestPermission();

  if (permission !== 'granted') {
    await refreshPushStatus();
    return;
  }

  const registration = await getReadyRegistration();

  if (!registration) {
    setPushUi({
      status: 'unsupported',
      message: '서비스 워커가 준비되지 않았어. 새로고침 후 다시 시도해줘.',
      enableDisabled: true,
      disableDisabled: true,
    });
    return;
  }

  let subscription = await registration.pushManager.getSubscription();

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
  }

  const normalized = normalizeSubscription(subscription);

  const { error } = await supabase.rpc('register_my_push_subscription', {
    p_endpoint: normalized.endpoint,
    p_p256dh: normalized.p256dh,
    p_auth: normalized.auth,
    p_user_agent: navigator.userAgent || '',
    p_device_label: '',
  });

  if (error) {
    console.error('[push] register subscription failed:', error);
    setPushUi({
      status: 'disabled',
      message: '푸시 알림 저장 중 오류가 발생했어. 잠시 후 다시 시도해줘.',
      enableDisabled: false,
      disableDisabled: true,
    });
    return;
  }

  await refreshPushStatus();
}

async function disablePushNotifications() {
  const user = await getCurrentUser();

  if (!user) {
    showLoginRequiredPopup({
      title: '로그인이 필요해',
      message: '휴대폰 알림 설정은 로그인 후 변경할 수 있어.',
    });
    return;
  }

  setPushUi({
    status: 'checking',
    message: '휴대폰 알림을 끄는 중이야.',
    enableDisabled: true,
    disableDisabled: true,
  });

  const subscription = await getCurrentSubscription();
  const endpoint = subscription?.endpoint || '';

  if (subscription) {
    try {
      await subscription.unsubscribe();
    } catch (error) {
      console.warn('[push] browser unsubscribe failed:', error);
    }
  }

  const { error } = await supabase.rpc('disable_my_push_subscription', {
    p_endpoint: endpoint || null,
  });

  if (error) {
    console.error('[push] disable subscription failed:', error);
  }

  await refreshPushStatus();
}

export async function initPushNotifications() {
  const box = $('notificationPushBox');
  const enableBtn = $('pushNotificationEnableBtn');
  const disableBtn = $('pushNotificationDisableBtn');

  if (!box || !enableBtn || !disableBtn) return;

  enableBtn.addEventListener('click', () => {
    enablePushNotifications().catch((error) => {
      console.error('[push] enable failed:', error);
      refreshPushStatus();
    });
  });

  disableBtn.addEventListener('click', () => {
    disablePushNotifications().catch((error) => {
      console.error('[push] disable failed:', error);
      refreshPushStatus();
    });
  });

  window.addEventListener('auth-changed', () => {
    refreshPushStatus().catch((error) => {
      console.error('[push] auth refresh failed:', error);
    });
  });

  window.addEventListener('focus', () => {
    refreshPushStatus().catch((error) => {
      console.error('[push] focus refresh failed:', error);
    });
  });

  await refreshPushStatus();
}
