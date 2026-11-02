import { ReactNode } from 'react';
import { Candidate } from '../../types';
import { WORK_AUTH_LABELS, SOURCE_LABELS, daysUntil, formatDay, formatMoney } from '../../utils/labels';
import { timeAgo } from '../../utils/format';
import Icon, { IconName } from '../shared/Icon';
import Badge from '../shared/Badge';

function Fact({ icon, label, value }: { icon: IconName; label: string; value: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-subtle-foreground" />
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-wide text-subtle-foreground">{label}</p>
        <p className="text-[13px] text-foreground">{value}</p>
      </div>
    </div>
  );
}

const yearRange = (a?: number | string, b?: number | string, current?: boolean) =>
  [a, current ? 'Present' : b].filter(Boolean).join(' – ');

const monthYear = (v?: string) => (v ? new Date(v).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }) : undefined);

/**
 * The extended profile (RC-01..RC-12). Compensation, tags, owner and
 * last-contacted are SWFS-internal: the API omits them for clients, so they
 * simply don't render there.
 */
export default function ProfileDetails({ candidate, isAdmin }: { candidate: Candidate; isAdmin: boolean }) {
  const c = candidate;
  const availability =
    c.availableFrom != null
      ? daysUntil(c.availableFrom) <= 0
        ? 'Available now'
        : `From ${formatDay(c.availableFrom)}`
      : c.noticePeriod != null
        ? `${c.noticePeriod} days' notice`
        : null;

  const facts: { icon: IconName; label: string; value: ReactNode }[] = [];
  if (c.yearsExperience != null) facts.push({ icon: 'briefcase', label: 'Experience', value: `${c.yearsExperience} yrs` });
  if (availability) facts.push({ icon: 'calendar', label: 'Availability', value: availability });
  if (c.workAuthorization) facts.push({ icon: 'file', label: 'Work authorization', value: WORK_AUTH_LABELS[c.workAuthorization] });
  if (c.languages?.length) facts.push({ icon: 'message', label: 'Languages', value: c.languages.join(', ') });
  if (isAdmin && (c.currentCtc != null || c.expectedCtc != null)) {
    facts.push({
      icon: 'tag',
      label: 'Current → expected',
      value: `${formatMoney(c.currentCtc, c.ctcCurrency)} → ${formatMoney(c.expectedCtc, c.ctcCurrency)}`,
    });
  }
  if (isAdmin && c.source) facts.push({ icon: 'inbox', label: 'Source', value: SOURCE_LABELS[c.source] ?? c.source });
  if (isAdmin) {
    facts.push({ icon: 'user-plus', label: 'Owner', value: c.owner?.name ?? <span className="text-subtle-foreground">Unassigned</span> });
    facts.push({
      icon: 'phone',
      label: 'Last contacted',
      value: c.lastContactedAt ? timeAgo(c.lastContactedAt) : <span className="text-subtle-foreground">Never</span>,
    });
  }

  const history = c.employmentHistory ?? [];
  const education = c.education ?? [];
  const certs = c.certifications ?? [];
  if (!facts.length && !history.length && !education.length && !certs.length && !c.tags?.length) return null;

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5 shadow-xs">
      <h3 className="text-[13px] font-semibold text-foreground">Profile</h3>
      {facts.length > 0 && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{facts.map((f) => <Fact key={f.label} {...f} />)}</div>}

      {isAdmin && !!c.tags?.length && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Icon name="tag" size={13} className="text-subtle-foreground" />
          {c.tags.map((t) => (
            <Badge key={t} tone="purple">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Experience</p>
          <ol className="relative space-y-3 border-l border-border pl-4">
            {history.map((e, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ring-2 ring-card ${e.current ? 'bg-brand' : 'bg-border-strong'}`} />
                <p className="text-[13px] font-medium text-foreground">{e.title || 'Role'}</p>
                <p className="text-xs text-muted-foreground">
                  {e.company}
                  {(e.startDate || e.endDate || e.current) && ` · ${yearRange(monthYear(e.startDate), monthYear(e.endDate), e.current)}`}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {(education.length > 0 || certs.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          {education.length > 0 && (
            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Education</p>
              <ul className="space-y-2">
                {education.map((e, i) => (
                  <li key={i}>
                    <p className="text-[13px] font-medium text-foreground">{[e.degree, e.field].filter(Boolean).join(', ') || e.institution}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.degree || e.field ? e.institution : ''}
                      {(e.startYear || e.endYear) && ` · ${yearRange(e.startYear, e.endYear)}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {certs.length > 0 && (
            <div>
              <p className="mb-2 text-2xs font-semibold uppercase tracking-wide text-subtle-foreground">Certifications</p>
              <ul className="space-y-2">
                {certs.map((cert, i) => {
                  const left = cert.expiresAt ? daysUntil(cert.expiresAt) : null;
                  return (
                    <li key={i} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium text-foreground">{cert.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {cert.issuer}
                          {cert.expiresAt && `${cert.issuer ? ' · ' : ''}Expires ${formatDay(cert.expiresAt)}`}
                        </p>
                      </div>
                      {left != null && left < 0 && <Badge tone="danger">Expired</Badge>}
                      {left != null && left >= 0 && left <= 60 && <Badge tone="warning">Expires in {left}d</Badge>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
