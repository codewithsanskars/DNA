import api from './axios';

/** Branded profile exports: both formats use the same SWFS letterhead template (server-side). */
export type ExportFormat = 'pdf' | 'docx';

export const EXPORT_FORMATS: { value: ExportFormat; label: string }[] = [
  { value: 'pdf', label: 'PDF' },
  { value: 'docx', label: 'Word' },
];

/** Fetches a server-rendered document and saves it with the filename the server chose. */
async function downloadDoc(url: string, params: Record<string, string | undefined>, fallbackName: string) {
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
  /** `variant` is ignored for clients — the server always sends them the client-safe version. */
  candidate: (id: string, opts: { variant?: 'client' | 'internal'; jobId?: string; format?: ExportFormat } = {}) => {
    const format = opts.format ?? 'pdf';
    return downloadDoc(`/candidates/${id}/pdf`, { variant: opts.variant, jobId: opts.jobId, format }, `candidate.${format}`);
  },
  organization: (id: string, format: ExportFormat = 'pdf') =>
    downloadDoc(`/organization/${id}/pdf`, { format }, `organization.${format}`),
};
