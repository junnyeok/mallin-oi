const ALLOWED_EXTERNAL_HOSTS = new Set(["mallinoi.com", "www.mallinoi.com"]);

function getCapacitor() {
  return globalThis.Capacitor ?? null;
}

function plugin(name) {
  return getCapacitor()?.Plugins?.[name] ?? null;
}

async function safeCall(target, method, payload) {
  try {
    if (typeof target?.[method] !== "function") return null;
    return await target[method](payload);
  } catch {
    return null;
  }
}

function toBase64Utf8(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

export class NativeBridge {
  constructor() {
    this.capacitor = getCapacitor();
    this.isNative = this.capacitor?.isNativePlatform?.() === true;
    this.platform = this.capacitor?.getPlatform?.() ?? "web";
    this.preferences = plugin("Preferences");
    this.listeners = [];
  }

  async initialize() {
    if (!this.isNative) {
      return { native: false, platform: "web", connected: navigator.onLine };
    }

    await safeCall(plugin("StatusBar"), "setOverlaysWebView", { overlay: true });
    await safeCall(plugin("StatusBar"), "setStyle", { style: "DARK" });
    await safeCall(plugin("StatusBar"), "setBackgroundColor", { color: "#00000000" });
    await safeCall(plugin("ScreenOrientation"), "lock", { orientation: "portrait" });
    const network = await safeCall(plugin("Network"), "getStatus");
    return {
      native: true,
      platform: this.platform,
      connected: network?.connected !== false,
    };
  }

  async hideSplash() {
    await safeCall(plugin("SplashScreen"), "hide", { fadeOutDuration: 220 });
  }

  async getAppInfo() {
    const info = await safeCall(plugin("App"), "getInfo");
    return info ?? { name: "말린오이: 오이키우기", version: "0.1.0-dev", build: "1" };
  }

  async haptic(kind = "light", enabled = true) {
    if (!enabled || !this.isNative) return false;
    const haptics = plugin("Haptics");
    if (kind === "success" || kind === "warning" || kind === "error") {
      const result = await safeCall(haptics, "notification", {
        type: kind.toUpperCase(),
      });
      return result !== null;
    }
    const styles = { light: "LIGHT", medium: "MEDIUM", heavy: "HEAVY" };
    const result = await safeCall(haptics, "impact", {
      style: styles[kind] ?? styles.light,
    });
    return result !== null;
  }

  async openExternal(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return false;
    }
    if (parsed.protocol !== "https:" || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
      return false;
    }
    if (this.isNative) {
      const result = await safeCall(plugin("Browser"), "open", {
        url: parsed.href,
        presentationStyle: "popover",
      });
      return result !== null;
    }
    globalThis.open?.(parsed.href, "_blank", "noopener,noreferrer");
    return true;
  }

  async shareBackup(text, fileName) {
    if (this.isNative && plugin("Filesystem") && plugin("Share")) {
      const writeResult = await safeCall(plugin("Filesystem"), "writeFile", {
        path: fileName,
        data: toBase64Utf8(text),
        directory: "CACHE",
        recursive: true,
      });
      if (writeResult?.uri) {
        const shared = await safeCall(plugin("Share"), "share", {
          title: "오이키우기 진행 백업",
          text: "말린오이: 오이키우기 진행 데이터 백업입니다.",
          files: [writeResult.uri],
          dialogTitle: "백업 파일 내보내기",
        });
        return shared !== null;
      }
    }

    const blob = new Blob([text], { type: "application/json" });
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.rel = "noopener";
    link.click();
    globalThis.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
    return true;
  }

  async exitApp() {
    if (this.platform !== "android") return false;
    const result = await safeCall(plugin("App"), "exitApp");
    return result !== null;
  }

  async addAppStateListener(callback) {
    const app = plugin("App");
    if (!this.isNative || typeof app?.addListener !== "function") return null;
    const handle = await app.addListener("appStateChange", callback);
    this.listeners.push(handle);
    return handle;
  }

  async addBackButtonListener(callback) {
    const app = plugin("App");
    if (this.platform !== "android" || typeof app?.addListener !== "function") {
      return null;
    }
    const handle = await app.addListener("backButton", callback);
    this.listeners.push(handle);
    return handle;
  }

  async addNetworkListener(callback) {
    const network = plugin("Network");
    if (!this.isNative || typeof network?.addListener !== "function") return null;
    const handle = await network.addListener("networkStatusChange", callback);
    this.listeners.push(handle);
    return handle;
  }

  async destroy() {
    const listeners = this.listeners.splice(0);
    await Promise.all(listeners.map((handle) => handle?.remove?.().catch?.(() => {})));
  }
}
