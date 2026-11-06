// Service worker: side-panel wiring, the portal ⇄ extension connect handshake,
// and registering the bridge script on a custom portal origin.
import { getSettings, setAuth, originOf, isBuiltInOrigin } from './lib/config.js';

const BRIDGE_ID = 'swfs-portal-bridge-custom';

async function setup() {
  // Toolbar icon opens the side panel.
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  await syncBridgeRegistration();
}

/** Built-in localhost origins are covered by the manifest; a custom portal origin is registered here. */
async function syncBridgeRegistration() {
  const { portalUrl } = await getSettings();
  const origin = originOf(portalUrl);
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [BRIDGE_ID] });
  } catch {
    /* not registered yet */
  }
  if (!origin || isBuiltInOrigin(origin)) return;
  const granted = await chrome.permissions.contains({ origins: [`${origin}/*`] });
  if (!granted) return;
  await chrome.scripting.registerContentScripts([
    { id: BRIDGE_ID, matches: [`${origin}/extension/*`], js: ['src/content/portal-bridge.js'], runAt: 'document_start' },
  ]);
}

chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.settings) syncBridgeRegistration();
});
chrome.permissions.onAdded.addListener(syncBridgeRegistration);

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      // From portal-bridge.js on /extension/connect.
      case 'connect': {
        const { portalUrl } = await getSettings();
        const expected = originOf(portalUrl);
        const from = sender.origin || originOf(sender.url);
        if (!from || from !== expected) {
          return { ok: false, error: `This extension is set to ${expected}, not ${from}. Change the portal URL in settings.` };
        }
        if (typeof msg.token !== 'string' || msg.token.split('.').length !== 3) return { ok: false, error: 'Invalid token' };
        await setAuth({ token: msg.token, expiresAt: msg.expiresAt, user: msg.user || null, connectedAt: Date.now() });
        chrome.runtime.sendMessage({ type: 'auth-changed' }).catch(() => {});
        return { ok: true };
      }
      // From the floating "Add to SWFS" button on LinkedIn (a user click, so the panel may open).
      case 'open-panel': {
        if (sender.tab?.id != null) await chrome.sidePanel.open({ tabId: sender.tab.id });
        return { ok: true };
      }
      default:
        return { ok: false, error: 'Unknown message' };
    }
  })()
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: err?.message || String(err) }));
  return true; // async response
});
