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
