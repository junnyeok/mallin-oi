// 첫 화면이 그려지기 전에 적용한다. 일반 사이트에는 앱의 화면 설정을 적용하지 않는다.
(() => {
  const key = 'mallin:calendar-appearance';
  const native = window.Capacitor?.isNativePlatform?.() === true;
  const localPreview = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
    && (new URLSearchParams(location.search).get('app') === 'calendar'
      || /\/app-calendar(?:-settings)?\.html$/.test(location.pathname));
  const available = native || localPreview;
  const normalize = value => value === 'dark' ? 'dark' : 'light';
  let appearance = 'light';
  try { appearance = normalize(localStorage.getItem(key)); } catch { /* 기본 라이트 모드 */ }
  const plugin = native
    ? (window.Capacitor.registerPlugin?.('CalendarWidgets') || window.Capacitor.Plugins?.CalendarWidgets)
    : null;

  function apply(value) {
    appearance = normalize(value);
    if (available) document.documentElement.dataset.calendarAppearance = appearance;
    window.dispatchEvent(new CustomEvent('calendar-appearance-change', { detail: appearance }));
  }

  if (available) apply(appearance);

  // 위젯과 앱이 공유하는 네이티브 설정을 기준으로 복구한다. 일정 조회는 필요하지 않다.
  const ready = native
    ? Promise.resolve().then(() => plugin.getAppearance()).then(result => {
      apply(result.appearance);
      try { localStorage.setItem(key, appearance); } catch { /* 네이티브 저장값 사용 */ }
    }).catch(() => { /* 구버전 앱에서는 현재 화면을 유지하고 변경 시 오류를 안내한다. */ })
    : Promise.resolve();

  window.CalendarAppearance = {
    available,
    native,
    ready,
    get: () => available ? appearance : 'light',
    async set(value) {
      if (!available) throw new Error('화면 모드는 말린오이 캘린더 앱에서 변경할 수 있어요.');
      if (!['light', 'dark'].includes(value)) throw new Error('화면 모드를 확인해 주세요.');
      await ready;
      if (native) {
        try { await plugin.setAppearance({ appearance: value }); }
        catch { throw new Error('화면 모드를 저장하지 못했어요. 앱을 다시 열고 시도해 주세요.'); }
      }
      try { localStorage.setItem(key, value); }
      catch {
        if (!native) throw new Error('화면 설정을 저장할 수 없어요. 저장 공간 설정을 확인해 주세요.');
      }
      apply(value);
    },
  };
})();
