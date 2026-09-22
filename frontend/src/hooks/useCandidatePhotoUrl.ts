import { useEffect, useState } from 'react';
import { candidateApi } from '../api/candidate.api';

// The photo route is authenticated (same as the resume), so it can't be used
// directly as an <img src> — this fetches it as a blob and hands back an
// object URL instead. `version` (e.g. the candidate's syncedAt) should
// change whenever the photo does, since `photoUrl` itself is always the same
// `/api/candidates/:id/photo` path and wouldn't otherwise trigger a refetch
// after a replace.
export function useCandidatePhotoUrl(candidateId: string, photoUrl?: string, version?: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!candidateId || !photoUrl) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    let objectUrl: string | null = null;
    candidateApi
      .getPhotoBlob(candidateId)
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [candidateId, photoUrl, version]);

  return url;
}
