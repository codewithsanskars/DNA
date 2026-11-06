import { getSettings, saveSettings, getAuth, clearAuth, originOf, isBuiltInOrigin, normalizeUrl } from '../lib/config.js';
import { api } from '../lib/api.js';
import { toast } from '../sidepanel/ui.js';

const $ = (id) => document.getElementById(id);
$('version').textContent = chrome.runtime.getManifest().version;

async function load() {
  const s = await getSettings();
  $('portalUrl').value = s.portalUrl;
  $('floatingButton').checked = s.floatingButton;
  $('aiEnrich').checked = s.aiEnrich;
  $('defaultTags').value = s.defaultTags;
  await showConnection();
}

async function showConnection() {
  const auth = await getAuth();
  if (!auth) {
    $('connState').textContent = 'Not connected';
    $('connDetail').textContent = 'Open the side panel and click “Connect to SWFS”.';
    $('disconnect').hidden = true;
    return;
  }
  $('connState').textContent = `Connected as ${auth.user?.email || 'SWFS staff'}`;
  $('connDetail').textContent = auth.expiresAt ? `Expires ${new Date(auth.expiresAt).toLocaleDateString()}` : '';
  $('disconnect').hidden = false;
}

$('savePortal').onclick = async () => {
  const url = normalizeUrl($('portalUrl').value);
  const origin = originOf(url);
  if (!origin || !/^https?:$/.test(new URL(origin).protocol)) return toast('Enter a full URL, e.g. https://portal.swfs.ai', true);
  if (!isBuiltInOrigin(origin)) {
    // Must run inside the click gesture.
    const ok = await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!ok) return toast('The extension needs permission to talk to that portal.', true);
  }
  const prev = await getSettings();
  await saveSettings({ portalUrl: url });
  if (originOf(prev.portalUrl) !== origin) {
    await clearAuth(); // a token from another portal is useless here
    toast('Saved. Connect again from the side panel.');
  } else toast('Saved.');
  showConnection();
};

for (const id of ['floatingButton', 'aiEnrich']) {
  $(id).onchange = async (e) => {
    await saveSettings({ [id]: e.target.checked });
    toast('Saved.');
  };
}
$('defaultTags').onchange = async (e) => {
  await saveSettings({ defaultTags: e.target.value.trim() });
  toast('Saved.');
};

$('test').onclick = async () => {
  try {
    const [me, ai] = await Promise.all([api.me(), api.aiStatus().catch(() => null)]);
    const aiText = ai ? (ai.available ? ` AI: ${ai.model} (${ai.provider}).` : ' AI is offline.') : '';
    toast(`Connected to ${(await getSettings()).portalUrl} as ${me?.email || me?.user?.email || 'you'}.${aiText}`);
  } catch (err) {
    toast(err.message || 'Connection failed.', true);
  }
  showConnection();
};

$('disconnect').onclick = async () => {
  await clearAuth();
  toast('Disconnected.');
  showConnection();
};

load();
