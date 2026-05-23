const EQUIPMENT_CHANGED_EVENT = 'mallinoi:equipment-changed';
const EQUIPMENT_STORAGE_KEY = 'mallinoi:equipment-changed-at';
const EQUIPMENT_CHANNEL_NAME = 'mallinoi-equipment';

let sharedChannel = null;

function getEquipmentChannel() {
  if (!('BroadcastChannel' in window)) return null;

  if (!sharedChannel) {
    sharedChannel = new BroadcastChannel(EQUIPMENT_CHANNEL_NAME);
  }

  return sharedChannel;
}

function normalizePayload(detail = {}) {
  return {
    userId: String(detail?.userId || '').trim(),
    source: String(detail?.source || '').trim(),
    changed: Array.isArray(detail?.changed)
      ? detail.changed.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    timestamp: Date.now(),
  };
}

export function emitEquipmentChanged(detail = {}) {
  const payload = normalizePayload(detail);

  window.dispatchEvent(
    new CustomEvent(EQUIPMENT_CHANGED_EVENT, {
      detail: payload,
    }),
  );

  try {
    getEquipmentChannel()?.postMessage(payload);
  } catch (error) {
    console.warn('[equipment-events] BroadcastChannel post failed:', error);
  }

  try {
    localStorage.setItem(EQUIPMENT_STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.warn('[equipment-events] localStorage notify failed:', error);
  }
}

export function listenEquipmentChanged(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  const onCustomEvent = (event) => {
    callback(event?.detail || {});
  };

  const channel = getEquipmentChannel();

  const onChannelMessage = (event) => {
    callback(event?.data || {});
  };

  const onStorage = (event) => {
    if (event.key !== EQUIPMENT_STORAGE_KEY || !event.newValue) return;

    try {
      callback(JSON.parse(event.newValue));
    } catch (error) {
      console.warn('[equipment-events] parse storage payload failed:', error);
    }
  };

  window.addEventListener(EQUIPMENT_CHANGED_EVENT, onCustomEvent);
  window.addEventListener('storage', onStorage);

  if (channel) {
    channel.addEventListener('message', onChannelMessage);
  }

  return () => {
    window.removeEventListener(EQUIPMENT_CHANGED_EVENT, onCustomEvent);
    window.removeEventListener('storage', onStorage);

    if (channel) {
      channel.removeEventListener('message', onChannelMessage);
    }
  };
}
