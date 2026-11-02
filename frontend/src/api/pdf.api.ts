import api from './axios';

/** Fetches a server-rendered PDF and saves it with the filename the server chose. */
async function downloadPdf(url: string, params: Record<string, string | undefined>, fallbackName: string) {
  const res = await api.get(url, { params, responseType: 'blob', timeout: 120000 });
  const disposition = String(res.headers['content-disposition'] || '');
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] || fallbackName;
  const href = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

export const pdfApi = {
  /** `variant` is ignored for clients — the server always sends them the client-safe PDF. */
  candidate: (id: string, opts: { variant?: 'client' | 'internal'; jobId?: string } = {}) =>
    downloadPdf(`/candidates/${id}/pdf`, { variant: opts.variant, jobId: opts.jobId }, 'candidate.pdf'),
  organization: (id: string) => downloadPdf(`/organization/${id}/pdf`, {}, 'organization.pdf'),
};
