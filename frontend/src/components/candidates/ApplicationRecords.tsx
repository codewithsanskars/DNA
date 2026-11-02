import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { pipelineApi, InterviewInput, OfferInput, PlacementInput } from '../../api/pipeline.api';
import { queryKeys } from '../../api/queryKeys';
import { Candidate, Interview, InterviewMode, InterviewStatus, JobLink, Offer, OfferRateType, Placement } from '../../types';
import { INTERVIEW_MODE_LABELS, OFFER_STATUS_TONE, PLACEMENT_STATUS_TONE, formatDay, formatMoney } from '../../utils/labels';
import { formatDateTime, humanize } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import Modal from '../shared/Modal';
import Button from '../shared/Button';
import Badge from '../shared/Badge';
import Icon from '../shared/Icon';

import { Field, Input, Select, Textarea } from '../shared/Field';
import { useToast } from '../shared/Toast';

const MAX_ROUNDS = 3;

function useRecordsMutation<T>(candidateId: string, fn: (v: T) => Promise<unknown>, success: string, onDone?: () => void) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidateRecords(candidateId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.candidate(candidateId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
      queryClient.invalidateQueries({ queryKey: queryKeys.upcomingInterviews });
      toast.success(success);
      onDone?.();
    },
    onError: (err) => toast.error('Something went wrong', errorMessage(err, 'Please try again.')),
  });
}

// ---------------------------------------------------------------------------
// Modals
// ---------------------------------------------------------------------------

export function ScheduleInterviewModal({ candidate, link, onClose }: { candidate: Candidate; link: JobLink; onClose: () => void }) {
  const [form, setForm] = useState({ date: '', duration: '60', mode: 'VIDEO' as InterviewMode, location: '', interviewers: '', notes: '' });
  const save = useRecordsMutation(
    candidate._id,
    (input: InterviewInput) => pipelineApi.scheduleInterview(candidate._id, link.jobId, input),
    `Round ${link.interviewRound + 1} scheduled`,
    onClose
  );
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <Modal
      title={`Schedule round ${link.interviewRound + 1}`}
      description={`${candidate.firstName} ${candidate.lastName} · ${link.jobTitle}`}
      onClose={onClose}
      centered
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!form.date}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                scheduledAt: new Date(form.date).toISOString(),
                durationMinutes: Number(form.duration) || 60,
                mode: form.mode,
                location: form.location.trim() || undefined,
                interviewers: form.interviewers.trim() || undefined,
                notes: form.notes.trim() || undefined,
              })
            }
          >
            Schedule
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
          <Field label="Date & time" required>
            {(id) => <Input id={id} type="datetime-local" value={form.date} onChange={(e) => set('date', e.target.value)} autoFocus />}
          </Field>
          <Field label="Duration">
            {(id) => (
              <Select id={id} value={form.duration} onChange={(e) => set('duration', e.target.value)}>
                {[30, 45, 60, 90, 120].map((m) => (
                  <option key={m} value={m}>
                    {m} min
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
          <Field label="Mode">
            {(id) => (
              <Select id={id} value={form.mode} onChange={(e) => set('mode', e.target.value)}>
                {(Object.keys(INTERVIEW_MODE_LABELS) as InterviewMode[]).map((m) => (
                  <option key={m} value={m}>
                    {INTERVIEW_MODE_LABELS[m]}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={form.mode === 'ONSITE' ? 'Address' : form.mode === 'PHONE' ? 'Dial-in' : 'Meeting link'}>
            {(id) => <Input id={id} value={form.location} onChange={(e) => set('location', e.target.value)} placeholder={form.mode === 'VIDEO' ? 'https://meet…' : ''} />}
          </Field>
        </div>
        <Field label="Interviewers">
          {(id) => <Input id={id} value={form.interviewers} onChange={(e) => set('interviewers', e.target.value)} placeholder="e.g. Jane Doe (EM), Raj Patel" />}
        </Field>
        <Field label="Notes">
          {(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function OfferModal({ candidate, link, onClose }: { candidate: Candidate; link: JobLink; onClose: () => void }) {
  const [form, setForm] = useState({ amount: '', currency: 'USD', rateType: 'ANNUAL' as OfferRateType, startDate: '', expiresAt: '', notes: '' });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useRecordsMutation(
    candidate._id,
    (input: OfferInput) => pipelineApi.extendOffer(candidate._id, link.jobId, input),
    'Offer extended',
    onClose
  );
  const valid = form.amount.trim() && Number(form.amount) >= 0;
  return (
    <Modal
      title="Extend offer"
      description={`${candidate.firstName} ${candidate.lastName} · ${link.jobTitle}. The candidate moves to Selected.`}
      onClose={onClose}
      centered
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!valid}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                amount: Number(form.amount),
                currency: form.currency,
                rateType: form.rateType,
                startDate: form.startDate || undefined,
                expiresAt: form.expiresAt || undefined,
                notes: form.notes.trim() || undefined,
              })
            }
          >
            Extend offer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_90px_130px]">
          <Field label="Compensation" required>
            {(id) => <Input id={id} type="number" min={0} value={form.amount} onChange={(e) => set('amount', e.target.value)} autoFocus />}
          </Field>
          <Field label="Currency">
            {(id) => <Input id={id} maxLength={3} value={form.currency} onChange={(e) => set('currency', e.target.value.toUpperCase())} />}
          </Field>
          <Field label="Per">
            {(id) => (
              <Select id={id} value={form.rateType} onChange={(e) => set('rateType', e.target.value)}>
                <option value="ANNUAL">Year</option>
                <option value="HOURLY">Hour</option>
              </Select>
            )}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date">
            {(id) => <Input id={id} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />}
          </Field>
          <Field label="Offer expires">
            {(id) => <Input id={id} type="date" value={form.expiresAt} onChange={(e) => set('expiresAt', e.target.value)} />}
          </Field>
        </div>
        <Field label="Notes">
          {(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

function PlacementModal({ candidate, link, onClose }: { candidate: Candidate; link: JobLink; onClose: () => void }) {
  const [form, setForm] = useState({ startDate: '', endDate: '', billRate: '', payRate: '', fee: '', guaranteeDays: '90', notes: '' });
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const n = (v: string) => (v.trim() ? Number(v) : undefined);
  const save = useRecordsMutation(
    candidate._id,
    (input: PlacementInput) => pipelineApi.createPlacement(candidate._id, link.jobId, input),
    'Placement recorded',
    onClose
  );
  return (
    <Modal
      title="Record placement"
      description={`Marks ${candidate.firstName} as Hired for ${link.jobTitle} and moves them to Onboarded. Leave rates blank to use the role's rates.`}
      onClose={onClose}
      centered
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!form.startDate}
            loading={save.isPending}
            onClick={() =>
              save.mutate({
                startDate: form.startDate,
                endDate: form.endDate || undefined,
                billRate: n(form.billRate),
                payRate: n(form.payRate),
                fee: n(form.fee),
                guaranteeDays: n(form.guaranteeDays),
                notes: form.notes.trim() || undefined,
              })
            }
          >
            Record placement
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start date" required>
            {(id) => <Input id={id} type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} autoFocus />}
          </Field>
          <Field label="End date" hint="contracts">
            {(id) => <Input id={id} type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Bill rate" hint="$/hr">
            {(id) => <Input id={id} type="number" min={0} value={form.billRate} onChange={(e) => set('billRate', e.target.value)} />}
          </Field>
          <Field label="Pay rate" hint="$/hr · internal">
            {(id) => <Input id={id} type="number" min={0} value={form.payRate} onChange={(e) => set('payRate', e.target.value)} />}
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Placement fee" hint="perm">
            {(id) => <Input id={id} type="number" min={0} value={form.fee} onChange={(e) => set('fee', e.target.value)} />}
          </Field>
          <Field label="Guarantee period" hint="days">
            {(id) => <Input id={id} type="number" min={0} value={form.guaranteeDays} onChange={(e) => set('guaranteeDays', e.target.value)} />}
          </Field>
        </div>
        <Field label="Notes">
          {(id) => <Textarea id={id} rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />}
        </Field>
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/** Prefilled Google Calendar "new event" link — no Calendar API needed. */
function googleCalendarUrl(i: Interview) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(i.scheduledAt);
  const end = new Date(start.getTime() + i.durationMinutes * 60_000);
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Interview round ${i.round}: ${i.candidateName} — ${i.jobTitle}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: [i.interviewers && `Interviewers: ${i.interviewers}`, i.notes].filter(Boolean).join('\n'),
    location: i.location ?? '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function InterviewRow({ interview, candidateId, canAct }: { interview: Interview; candidateId: string; canAct: boolean }) {
  const update = useRecordsMutation(candidateId, (status: InterviewStatus) => pipelineApi.updateInterview(interview.id, { status }), 'Interview updated');
  const upcoming = interview.status === 'SCHEDULED' && new Date(interview.scheduledAt) > new Date();
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-2xs font-semibold text-foreground ring-1 ring-inset ring-border">
        R{interview.round}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-foreground">
          {formatDateTime(interview.scheduledAt)} · {interview.durationMinutes}m · {INTERVIEW_MODE_LABELS[interview.mode]}
        </p>
        <p className="truncate text-2xs text-subtle-foreground">
          {interview.interviewers || 'Interviewers TBD'}
          {interview.location && (
            <>
              {' · '}
              {/^https?:\/\//.test(interview.location) ? (
                <a href={interview.location} target="_blank" rel="noopener noreferrer" className="text-brand-text hover:underline">
                  Join link
                </a>
              ) : (
                interview.location
              )}
            </>
          )}
        </p>
      </div>
      {interview.status === 'SCHEDULED' && (
        <a
          href={googleCalendarUrl(interview)}
          target="_blank"
          rel="noopener noreferrer"
          title="Add to Google Calendar"
          className="mt-0.5 shrink-0 rounded p-1 text-subtle-foreground hover:bg-muted hover:text-foreground"
        >
          <Icon name="calendar" size={14} />
        </a>
      )}
      {canAct && interview.status === 'SCHEDULED' ? (
        <Select
          aria-label="Interview status"
          value={interview.status}
          onChange={(e) => update.mutate(e.target.value as InterviewStatus)}
          className="!h-7 !w-32 !text-xs"
        >
          <option value="SCHEDULED">{upcoming ? 'Upcoming' : 'Scheduled'}</option>
          <option value="COMPLETED">Completed</option>
          <option value="NO_SHOW">No-show</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
      ) : (
        <Badge tone={interview.status === 'COMPLETED' ? 'success' : interview.status === 'SCHEDULED' ? 'info' : 'neutral'}>
          {humanize(interview.status)}
        </Badge>
      )}
    </li>
  );
}

function OfferRow({ offer, candidateId, canAct }: { offer: Offer; candidateId: string; canAct: boolean }) {
  const update = useRecordsMutation(candidateId, (status: Offer['status']) => pipelineApi.updateOffer(offer.id, { status }), 'Offer updated');
  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-foreground">
            {formatMoney(offer.amount, offer.currency)}
            <span className="font-normal text-muted-foreground"> / {offer.rateType === 'ANNUAL' ? 'year' : 'hour'}</span>
          </p>
          <p className="text-2xs text-subtle-foreground">
            {offer.startDate && `Starts ${formatDay(offer.startDate)}`}
            {offer.expiresAt && ` · Expires ${formatDay(offer.expiresAt)}`}
          </p>
        </div>
        <Badge tone={OFFER_STATUS_TONE[offer.status]}>{humanize(offer.status)}</Badge>
      </div>
      {canAct && offer.status === 'EXTENDED' && (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="secondary" icon="check" loading={update.isPending} onClick={() => update.mutate('ACCEPTED')}>
            Accepted
          </Button>
          <Button size="sm" variant="danger" onClick={() => update.mutate('DECLINED')}>
            Declined
          </Button>
          <Button size="sm" variant="ghost" onClick={() => update.mutate('WITHDRAWN')}>
            Withdraw
          </Button>
        </div>
      )}
    </li>
  );
}

function PlacementRow({ placement, candidateId, isAdmin }: { placement: Placement; candidateId: string; isAdmin: boolean }) {
  const update = useRecordsMutation(candidateId, (status: Placement['status']) => pipelineApi.updatePlacement(placement.id, { status }), 'Placement updated');
  const guaranteeEnds =
    placement.guaranteeDays != null
      ? new Date(new Date(`${placement.startDate}T00:00:00`).getTime() + placement.guaranteeDays * 86_400_000)
      : null;
  return (
    <li className="py-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[13px] font-medium text-foreground">
            Started {formatDay(placement.startDate)}
            {placement.endDate && <span className="font-normal text-muted-foreground"> → {formatDay(placement.endDate)}</span>}
          </p>
          <p className="text-2xs text-subtle-foreground">
            {[
              placement.billRate != null && `Bill $${placement.billRate}/hr`,
              isAdmin && placement.payRate != null && `Pay $${placement.payRate}/hr`,
              placement.fee != null && `Fee ${formatMoney(placement.fee)}`,
              guaranteeEnds && `Guarantee to ${guaranteeEnds.toLocaleDateString()}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <Badge tone={PLACEMENT_STATUS_TONE[placement.status]}>{humanize(placement.status)}</Badge>
      </div>
      {isAdmin && placement.status === 'ACTIVE' && (
        <div className="mt-2 flex gap-1.5">
          <Button size="sm" variant="secondary" onClick={() => update.mutate('COMPLETED')} loading={update.isPending}>
            Mark completed
          </Button>
          <Button size="sm" variant="danger" onClick={() => update.mutate('TERMINATED')}>
            Terminate
          </Button>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/**
 * Interviews (RC-47), offers (RC-49) and placements (RC-50) for each role a
 * candidate is linked to. Clients schedule interviews and make offers on
 * their own roles; recording a placement is SWFS-only.
 */
export default function ApplicationRecords({ candidate, isAdmin, canAct }: { candidate: Candidate; isAdmin: boolean; canAct: boolean }) {
  const [modal, setModal] = useState<{ kind: 'interview' | 'offer' | 'placement'; link: JobLink } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.candidateRecords(candidate._id),
    queryFn: () => pipelineApi.getCandidateRecords(candidate._id),
  });

  const links = candidate.jobLinks;
  if (!links.length) return null;

  return (
    <section className="rounded-lg border border-border bg-card shadow-xs">
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-[13px] font-semibold text-foreground">Interviews, offers & placements</h3>
      </header>
      {isLoading ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">Loading…</p>
      ) : (
        <div className="divide-y divide-border">
          {links.map((link) => {
            const interviews = (data?.interviews ?? []).filter((i) => i.jobId === link.jobId).sort((a, b) => a.round - b.round);
            const offers = (data?.offers ?? []).filter((o) => o.jobId === link.jobId);
            const placements = (data?.placements ?? []).filter((p) => p.jobId === link.jobId);
            const closed = link.stage === 'REJECTED' || link.stage === 'HIRED';
            const canInterview = canAct && !closed && link.interviewRound < MAX_ROUNDS;
            const canOffer = canAct && !closed && !offers.some((o) => o.status === 'EXTENDED' || o.status === 'ACCEPTED');
            const canPlace = isAdmin && link.stage !== 'REJECTED' && !placements.some((p) => p.status === 'ACTIVE');
            const empty = !interviews.length && !offers.length && !placements.length;
            return (
              <div key={link.jobId} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-[13px] font-medium text-foreground">{link.jobTitle}</p>
                  {link.organizationName && isAdmin && <span className="truncate text-2xs text-subtle-foreground">{link.organizationName}</span>}
                </div>
                {empty && <p className="mt-1 text-xs text-subtle-foreground">Nothing scheduled yet.</p>}
                {interviews.length > 0 && (
                  <ul className="mt-1 divide-y divide-border">
                    {interviews.map((i) => (
                      <InterviewRow key={i.id} interview={i} candidateId={candidate._id} canAct={canAct} />
                    ))}
                  </ul>
                )}
                {offers.length > 0 && (
                  <ul className="mt-1 divide-y divide-border border-t border-border">
                    {offers.map((o) => (
                      <OfferRow key={o.id} offer={o} candidateId={candidate._id} canAct={canAct} />
                    ))}
                  </ul>
                )}
                {placements.length > 0 && (
                  <ul className="mt-1 divide-y divide-border border-t border-border">
                    {placements.map((p) => (
                      <PlacementRow key={p.id} placement={p} candidateId={candidate._id} isAdmin={isAdmin} />
                    ))}
                  </ul>
                )}
                {(canInterview || canOffer || canPlace) && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {canInterview && (
                      <Button size="sm" variant="secondary" icon="calendar" onClick={() => setModal({ kind: 'interview', link })}>
                        Round {link.interviewRound + 1}
                      </Button>
                    )}
                    {canOffer && (
                      <Button size="sm" variant="secondary" icon="mail" onClick={() => setModal({ kind: 'offer', link })}>
                        Offer
                      </Button>
                    )}
                    {canPlace && (
                      <Button size="sm" variant="secondary" icon="award" onClick={() => setModal({ kind: 'placement', link })}>
                        Placement
                      </Button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {modal?.kind === 'interview' && <ScheduleInterviewModal candidate={candidate} link={modal.link} onClose={() => setModal(null)} />}
      {modal?.kind === 'offer' && <OfferModal candidate={candidate} link={modal.link} onClose={() => setModal(null)} />}
      {modal?.kind === 'placement' && <PlacementModal candidate={candidate} link={modal.link} onClose={() => setModal(null)} />}
    </section>
  );
}


