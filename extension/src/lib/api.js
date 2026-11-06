// Thin client for the SWFS portal API. Extension pages with host permissions
// aren't bound by CORS, and every call carries the extension's bearer token.
import { getAuth, getSettings, clearAuth } from './config.js';

export class AuthError extends Error {}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function base() {
  const { portalUrl } = await getSettings();
  return `${portalUrl}/api`;
}

async function request(path, { method = 'GET', body, form, timeout = 60000 } = {}) {
  const auth = await getAuth();
  if (!auth) throw new AuthError('Not connected');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  let res;
  try {
    res = await fetch(`${await base()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${auth.token}`,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new ApiError(err.name === 'AbortError' ? 'The request timed out.' : 'Can’t reach the SWFS portal. Check the portal URL in settings.', 0);
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 401) {
    await clearAuth();
    throw new AuthError('Your connection expired. Connect again.');
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON (e.g. HTML error page) */
  }
  if (!res.ok || json?.success === false) {
    throw new ApiError(json?.error || `Request failed (${res.status})`, res.status);
  }
  return json?.data;
}

const qs = (params) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')).toString();

export const api = {
  me: () => request('/auth/me'),
  aiStatus: () => request('/ai/status'),
  jobs: () => request('/jobs'),
  organizations: () => request('/organization/list'),
  duplicates: (probe) => request(`/candidates/duplicates?${qs(probe)}`),
  parseProfileText: (text) => request('/ai/parse-resume/text', { method: 'POST', body: { text }, timeout: 180000 }),
  matchPreview: (jobId, profile) => request('/ai/match-preview', { method: 'POST', body: { jobId, profile } }),
  createCandidate: (payload) => request('/candidates', { method: 'POST', body: payload }),
  linkJob: (candidateId, jobId) => request(`/candidates/${candidateId}/link-job`, { method: 'POST', body: { jobId } }),
  uploadPhoto: (candidateId, blob) => {
    const form = new FormData();
    form.append('photo', blob, 'linkedin-photo.jpg');
    return request(`/candidates/${candidateId}/photo`, { method: 'POST', form });
  },
};

export async function portalLink(path) {
  const { portalUrl } = await getSettings();
  return `${portalUrl}${path}`;
}
