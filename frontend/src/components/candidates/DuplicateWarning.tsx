import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { candidateApi } from '../../api/candidate.api';
import { DuplicateMatch } from '../../types';
import Icon from '../shared/Icon';

/**
 * Live "this person may already exist" check while creating a candidate
 * (RC-80). Debounced; matches on email, phone, LinkedIn or full name.
 */
export default function DuplicateWarning({
  firstName,
  lastName,
  email,
  phone,
  linkedinUrl,
}: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  linkedinUrl: string;
}) {
  const [matches, setMatches] = useState<DuplicateMatch[]>([]);

  useEffect(() => {
    const probe = {
      firstName: firstName.trim() || undefined,
      lastName: lastName.trim() || undefined,
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      linkedinUrl: linkedinUrl.trim() || undefined,
    };
    const enough = probe.email || (probe.phone && probe.phone.replace(/\D/g, '').length >= 7) || probe.linkedinUrl || (probe.firstName && probe.lastName);
    if (!enough) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      candidateApi
        .findDuplicates(probe)
        .then((m) => !cancelled && setMatches(m))
        .catch(() => !cancelled && setMatches([]));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [firstName, lastName, email, phone, linkedinUrl]);

  if (!matches.length) return null;
  return (
    <div className="rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs dark:border-amber-400/20 dark:bg-amber-500/10">
      <p className="flex items-center gap-1.5 font-medium text-amber-800 dark:text-amber-300">
        <Icon name="alert" size={13} /> Possible duplicate{matches.length > 1 ? 's' : ''} already in the database
      </p>
      <ul className="mt-1.5 space-y-1">
        {matches.map((m) => (
          <li key={m._id} className="text-amber-900/80 dark:text-amber-200/80">
            <Link to={`/candidates/${m._id}`} target="_blank" className="font-medium underline-offset-2 hover:underline">
              {m.firstName} {m.lastName}
            </Link>
            {m.currentTitle && ` · ${m.currentTitle}`}
            <span className="text-amber-700/70 dark:text-amber-300/60"> — same {m.matchedOn.join(', ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
