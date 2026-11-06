// Runs on the SWFS portal's /extension/* pages. Relays the connect token the
// page posts (same-window, same-origin only) to the extension, then acks back.
(() => {
  document.documentElement.dataset.swfsExtension = chrome.runtime.getManifest().version;

  window.addEventListener('message', async (event) => {
    if (event.source !== window || event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.type !== 'SWFS_EXTENSION_CONNECT') return;
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'connect',
        token: data.token,
        expiresAt: data.expiresAt,
        user: data.user,
      });
      if (res?.ok) window.postMessage({ type: 'SWFS_EXTENSION_CONNECTED' }, window.location.origin);
      else console.warn('[SWFS Sourcer]', res?.error);
    } catch (err) {
      console.warn('[SWFS Sourcer] connect failed', err);
    }
  });
})();
