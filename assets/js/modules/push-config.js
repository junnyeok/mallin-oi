// assets/js/modules/push-config.js

// ✅ VAPID public key만 프론트에 둔다.
// ❌ VAPID private key는 절대 프론트엔드에 넣지 말 것.
// Supabase secrets에 넣은 VAPID_PUBLIC_KEY와 같은 값으로 교체.
export const VAPID_PUBLIC_KEY =
  'BFti9SVOqDjE021QSwYlR9LeVWoCAQDQwg1IYxy4NaqvJYO_KB0j5LmGUNWmUbC7W-VoYXwsCiebSV6sdH6cwPQ';

export function urlBase64ToUint8Array(base64String = '') {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = `${base64String}${padding}`
    .replaceAll('-', '+')
    .replaceAll('_', '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}
