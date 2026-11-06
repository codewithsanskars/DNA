import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Modal from '../shared/Modal';
import Pagination, { PAGE_SIZE } from '../shared/Pagination';
import Badge, { StageBadge } from '../shared/Badge';
import Button from '../shared/Button';
import Icon from '../shared/Icon';
import CandidateAvatar from '../candidates/CandidateAvatar';
import { candidateApi } from '../../api/candidate.api';
import { pipelineApi } from '../../api/pipeline.api';
import { queryKeys } from '../../api/queryKeys';
import { CandidateStage } from '../../types';
import { timeAgo } from '../../utils/format';
import { formatDay, formatMoney, PLACEMENT_STATUS_TONE, REJECTION_LABELS } from '../../utils/labels';
import { humanize } from '../../utils/format';

export interface CandidateListSpec {
  title: string;
  description?: string;
  /** Comma-joined stages, e.g. "INTERVIEW" or "APPLIED,SCREENING". */
  stage?: string;
  source?: string;
  /** Limit to one role. */
  jobId?: string;
  /** "Open full list" target. */
  fullListPath?: string;
}

/**
 * Drill-down list of candidates behind a card or chart mark. Uses the
 * scoped, paginated list endpoint — clients only ever see their own roles.
 */
export function CandidateListModal({ spec, onClose }: { spec: CandidateListSpec; onClose: () => void }) {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const params = { stage: spec.stage, source: spec.source, jobId: spec.jobId, page, pageSize: PAGE_SIZE, sort: 'updated' };
  const { data, isLoading, isFetching } = useQuery({
    queryKey: queryKeys.candidateList(params),
    queryFn: () => candidateApi.list(params),
    placeholderData: keepPreviousData,
  });
  const stages = spec.stage?.split(',') as CandidateStage[] | undefined;

  return (
    <Modal
      title={spec.title}
      description={data ? `${data.total} candidate${data.total === 1 ? '' : 's'}${spec.description ? ` · ${spec.description}` : ''}` : spec.description}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {spec.fullListPath && (
            <Button variant="ghost" size="sm" iconRight="arrow-right" className="mr-auto" onClick={() => navigate(spec.fullListPath!)}>
              Open full list
            </Button>
          )}
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !data?.items.length ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Icon name="users" size={20} className="text-subtle-foreground" />
          <p className="text-sm text-muted-foreground">No one here right now.</p>
        </div>
      ) : (
        <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
          <ul className="-mx-2 divide-y divide-border">
            {data.items.map((c) => {
              // The links that match the filter, so the row shows *why* it's here.
              const links = stages ? c.jobLinks.filter((l) => stages.includes(l.stage)) : c.jobLinks;
              return (
                <li key={c._id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/candidates/${c._id}`)}
                    className="flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted"
                  >
                    <CandidateAvatar candidateId={c._id} name={c.firstName} photoUrl={c.photoUrl} version={c.syncedAt} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-foreground">
                        {c.firstName} {c.lastName}
                      </p>
                      <p className="truncate text-2xs text-subtle-foreground">{[c.currentTitle, c.currentCompany].filter(Boolean).join(' · ') || '—'}</p>
                    </div>
                    <div className="flex max-w-[50%] flex-col items-end gap-1">
                      {links.slice(0, 2).map((l) => (
                        <span key={l.jobId} className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                          <span className="max-w-[12rem] truncate">{l.jobTitle}</span>
                          <StageBadge stage={l.stage} />
                        </span>
                      ))}
                      {links[0]?.stageUpdatedAt && <span className="text-2xs text-subtle-foreground">in stage {timeAgo(links[0].stageUpdatedAt).replace(' ago', '')}</span>}
                      {links[0]?.stage === 'REJECTED' && links[0].rejectionReason && (
                        <span className="text-2xs text-subtle-foreground">{REJECTION_LABELS[links[0].rejectionReason]}</span>
                      )}
                    </div>
                    <Icon name="arrow-right" size={13} className="shrink-0 text-subtle-foreground" />
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-3" page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
        </div>
      )}
    </Modal>
  );
}

/** Active placements with the money behind the billing / margin cards. Pay rate only exists for admins. */
export function PlacementsModal({ onClose, isAdmin }: { onClose: () => void; isAdmin: boolean }) {
  const navigate = useNavigate();
  const { data = [], isLoading } = useQuery({ queryKey: queryKeys.placements, queryFn: pipelineApi.getPlacements });
  const active = data.filter((p) => p.status === 'ACTIVE');
  return (
    <Modal title="Active placements" description={`${active.length} people currently placed`} onClose={onClose} size="xl">
      {isLoading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">Loading…</p>
      ) : !data.length ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center">
          <Icon name="award" size={20} className="text-subtle-foreground" />
          <p className="text-sm text-muted-foreground">No placements recorded yet.</p>
          <p className="text-xs text-subtle-foreground">Record one from a candidate’s profile once they start.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border text-2xs uppercase tracking-wide text-subtle-foreground">
              <tr>
                <th className="py-2 pr-3 font-medium">Candidate</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Start</th>
                <th className="py-2 pr-3 text-right font-medium">Bill /hr</th>
                {isAdmin && <th className="py-2 pr-3 text-right font-medium">Pay /hr</th>}
                {isAdmin && <th className="py-2 pr-3 text-right font-medium">Margin /hr</th>}
                <th className="py-2 pr-3 text-right font-medium">Fee</th>
                <th className="py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((p) => (
                <tr key={p.id} onClick={() => navigate(`/candidates/${p.candidateId}`)} className="cursor-pointer hover:bg-muted">
                  <td className="py-2.5 pr-3 font-medium text-foreground">{p.candidateName}</td>
                  <td className="py-2.5 pr-3 text-muted-foreground">
                    {p.jobTitle}
                    {isAdmin && p.organizationName && <span className="text-subtle-foreground"> · {p.organizationName}</span>}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-muted-foreground">{formatDay(p.startDate)}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-foreground">{p.billRate != null ? `$${p.billRate}` : '—'}</td>
                  {isAdmin && <td className="py-2.5 pr-3 text-right tabular-nums text-foreground">{p.payRate != null ? `$${p.payRate}` : '—'}</td>}
                  {isAdmin && (
                    <td className="py-2.5 pr-3 text-right font-medium tabular-nums text-foreground">
                      {p.billRate != null && p.payRate != null ? `$${(p.billRate - p.payRate).toFixed(2)}` : '—'}
                    </td>
                  )}
                  <td className="py-2.5 pr-3 text-right tabular-nums text-muted-foreground">{formatMoney(p.fee)}</td>
                  <td className="py-2.5">
                    <Badge tone={PLACEMENT_STATUS_TONE[p.status]}>{humanize(p.status)}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
