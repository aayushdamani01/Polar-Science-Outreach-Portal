import { useEffect, useState } from 'react';

const CONNECTION_KEYS = ['connection', 'mozConnection', 'webkitConnection'];

function getConnection() {
  if (typeof navigator === 'undefined') return null;

  for (const key of CONNECTION_KEYS) {
    if (navigator[key]) return navigator[key];
  }

  return null;
}

/**
 * Classify the current connection without changing any UI.
 *
 * Phase 1 deliberately keeps this logic local to the hook. A global context
 * belongs to Phase 2.
 */
export function classifyNetwork({ online, effectiveType, downlink, rtt, saveData }) {
  if (!online) return 'offline';

  // Respect the browser/user request to minimize data usage.
  if (saveData) return 'slow';

  const type = String(effectiveType || '').toLowerCase();

  if (type === 'slow-2g' || type === '2g') return 'slow';

  // Very weak measured links are slow even when effectiveType briefly says 3g/4g.
  if (typeof downlink === 'number' && downlink > 0 && downlink < 0.75) return 'slow';
  if (typeof rtt === 'number' && rtt >= 700) return 'slow';

  if (type === '3g') return 'medium';
  if (typeof downlink === 'number' && downlink > 0 && downlink < 2.5) return 'medium';
  if (typeof rtt === 'number' && rtt >= 300) return 'medium';

  // If the Network Information API is unavailable, preserve the current full
  // site instead of incorrectly degrading the experience.
  return 'fast';
}

function readNetworkSnapshot() {
  const connection = getConnection();
  const online = typeof navigator === 'undefined' ? true : navigator.onLine;

  const snapshot = {
    online,
    effectiveType: connection?.effectiveType ?? null,
    downlink: typeof connection?.downlink === 'number' ? connection.downlink : null,
    rtt: typeof connection?.rtt === 'number' ? connection.rtt : null,
    saveData: Boolean(connection?.saveData),
    supported: Boolean(connection),
  };

  return {
    ...snapshot,
    quality: classifyNetwork(snapshot),
  };
}

/**
 * Phase 1 network detector.
 * Returns live connection information and one of:
 * fast | medium | slow | offline
 */
export function useNetworkQuality() {
  const [network, setNetwork] = useState(readNetworkSnapshot);

  useEffect(() => {
    const connection = getConnection();

    const updateNetwork = () => {
      const next = readNetworkSnapshot();
      setNetwork(next);

      // Temporary Phase 1 debug output. No visible UI changes yet.
      console.debug('[NCPOR network]', {
        quality: next.quality,
        online: next.online,
        effectiveType: next.effectiveType,
        downlinkMbps: next.downlink,
        rttMs: next.rtt,
        saveData: next.saveData,
        networkInformationApiSupported: next.supported,
      });
    };

    updateNetwork();

    window.addEventListener('online', updateNetwork);
    window.addEventListener('offline', updateNetwork);
    connection?.addEventListener?.('change', updateNetwork);

    return () => {
      window.removeEventListener('online', updateNetwork);
      window.removeEventListener('offline', updateNetwork);
      connection?.removeEventListener?.('change', updateNetwork);
    };
  }, []);

  return network;
}

export default useNetworkQuality;
