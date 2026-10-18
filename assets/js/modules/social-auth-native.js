// Only a request identifier crosses the app link. Its verifier stays in the initiating WebView.
const key = 'mallin:social-request:v1';
export function socialNativeDestination(value, stored, current) {
  try {
    const url = new URL(value);
    const request = new URLSearchParams(url.hash.slice(1)).get('request');
    if (url.protocol !== 'mallinoi:' || url.hostname !== 'auth' || url.pathname !== '/callback' ||
      url.username || url.password || url.search ||
      !request || stored?.request !== request || stored.expires < Date.now()) return null;
    const target = new URL('/account/social-callback.html?app=calendar', current);
    target.hash = new URLSearchParams({ request }).toString();
    return target.href === current ? null : target.href;
  } catch { return null; }
}
export async function initSocialAuthNative() {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  if (window.__mallinSocialAuthListening) return;
  const app = window.Capacitor?.Plugins?.App;
  if (!app) return;
  const route = ({ url } = {}) => {
    let stored;
    try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch { return; }
    const destination = socialNativeDestination(url, stored, location.href);
    if (destination) { location.replace(destination); return true; }
    return false;
  };
  await app.addListener('appUrlOpen', route);
  window.__mallinSocialAuthListening = true;
  return route(await app.getLaunchUrl());
}
