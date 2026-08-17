const PLUGIN_NAME = 'CompletionAudioSession';

function getNativePlugin(windowRef) {
  if (windowRef?.Capacitor?.isNativePlatform?.() !== true) return null;

  if (windowRef.Capacitor?.registerPlugin) {
    return windowRef.Capacitor.registerPlugin(PLUGIN_NAME);
  }

  return windowRef.Capacitor?.Plugins?.[PLUGIN_NAME] || null;
}

export async function beginCompletionAudioSession(windowRef = window) {
  const plugin = getNativePlugin(windowRef);
  if (!plugin?.beginInterruption) return false;

  try {
    const result = await plugin.beginInterruption();
    return result?.active !== false;
  } catch {
    return false;
  }
}

export async function shouldPlayCompletionSound(windowRef = window) {
  const plugin = getNativePlugin(windowRef);
  if (!plugin) return true;
  if (!plugin.isExternalAudioPlaying) return false;

  try {
    const result = await plugin.isExternalAudioPlaying();
    return result?.playing === false;
  } catch {
    // 네이티브 판별에 실패하면 사용자의 외부 오디오를 보호한다.
    return false;
  }
}

export async function endCompletionAudioSession(windowRef = window) {
  const plugin = getNativePlugin(windowRef);
  if (!plugin?.endInterruption) return false;

  try {
    await plugin.endInterruption();
    return true;
  } catch {
    return false;
  }
}
