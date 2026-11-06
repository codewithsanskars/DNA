// Settings + auth persisted in chrome.storage. Shared by the background worker,
// side panel and options page (all ES modules).

export const DEFAULT_SETTINGS = {
  portalUrl: 'http://localhost:5173',
  floatingButton: true,
  aiEnrich: true,
  defaultTags: 'linkedin-sourced',
};

const BUILT_IN_ORIGINS = ['http://localhost:5173', 'http://localhost:5000'];

export const normalizeUrl = (url) => String(url || '').trim().replace(/\/+$/, '');

export function originOf(url) {
  try {
    return new URL(normalizeUrl(url)).origin;
  } catch {
    return null;
  }
}

export const isBuiltInOrigin = (origin) => BUILT_IN_ORIGINS.includes(origin);

export async function getSettings() {
  const { settings } = await chrome.storage.sync.get('settings');
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

export async function saveSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  next.portalUrl = normalizeUrl(next.portalUrl);
  await chrome.storage.sync.set({ settings: next });
  return next;
}

/** Auth lives in local (not sync) storage: a token shouldn't roam between devices. */
export async function getAuth() {
  const { auth } = await chrome.storage.local.get('auth');
  if (!auth?.token) return null;
  if (auth.expiresAt && auth.expiresAt < Date.now()) {
    await chrome.storage.local.remove('auth');
    return null;
  }
  return auth;
}

export const setAuth = (auth) => chrome.storage.local.set({ auth });
export const clearAuth = () => chrome.storage.local.remove('auth');

/** Last few captures, newest first, for the panel's "Recent" list. */
export async function getRecent() {
  const { recent } = await chrome.storage.local.get('recent');
  return Array.isArray(recent) ? recent : [];
}

export async function pushRecent(entry) {
  const list = (await getRecent()).filter((r) => r.id !== entry.id);
  list.unshift({ ...entry, at: Date.now() });
  await chrome.storage.local.set({ recent: list.slice(0, 12) });
}
