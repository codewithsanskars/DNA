import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { candidateApi, BulkAction } from '../../api/candidate.api';
import { queryKeys } from '../../api/queryKeys';
import { Candidate, GlobalStatus, Job } from '../../types';
import { useStaff } from '../../hooks/useWorkflow';
import { humanize } from '../../utils/format';
import { errorMessage } from '../../utils/errors';
import { exportCandidatesCsv } from '../../utils/exportCandidates';
import Button from '../shared/Button';
import { Input, Select } from '../shared/Field';
import { useToast } from '../shared/Toast';
import { useConfirm } from '../shared/Confirm';

type Panel = 'addTags' | 'removeTags' | 'setOwner' | 'setGlobalStatus' | 'linkJob' | null;
const STATUSES: GlobalStatus[] = ['OPEN', 'SELECTED', 'ONBOARDED', 'ARCHIVED'];

/**
 * Bulk actions over a selection (RC-82): tag / untag, assign owner, change
 * status, link to a role, export, delete. SWFS staff only — clients get the
 * export button on its own.
 */
export default function BulkActionBar({
  selected,
  jobs,
  onClear,
}: {
  selected: Candidate[];
  jobs: Job[];
  onClear: () => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const { data: staff = [] } = useStaff();
  const [panel, setPanel] = useState<Panel>(null);
  const [value, setValue] = useState('');

  const run = useMutation({
    mutationFn: (op: BulkAction) => candidateApi.bulk(selected.map((c) => c._id), op),
    onSuccess: (res, op) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
      queryClient.invalidateQueries({ queryKey: queryKeys.jobs });
      queryClient.invalidateQueries({ queryKey: queryKeys.candidateTags });
      toast.success(`${op.action === 'delete' ? 'Deleted' : 'Updated'} ${res.affected} candidate${res.affected === 1 ? '' : 's'}`);
      setPanel(null);
      setValue('');
      if (op.action === 'delete') onClear();
    },
    onError: (err) => toast.error('Bulk action failed', errorMessage(err, 'Please try again.')),
  });

  const apply = () => {
    const tags = value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (panel === 'addTags' || panel === 'removeTags') tags.length && run.mutate({ action: panel, tags });
    else if (panel === 'setOwner') run.mutate({ action: 'setOwner', ownerId: value || null });
    else if (panel === 'setGlobalStatus' && value) run.mutate({ action: 'setGlobalStatus', globalStatus: value as GlobalStatus });
    else if (panel === 'linkJob' && value) run.mutate({ action: 'linkJob', jobId: value });
  };

  const openPanel = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
    setValue('');
  };

  const n = selected.length;

  return (
    <div className="sticky top-2 z-20 mb-3 rounded-lg border border-brand/30 bg-card px-3 py-2 shadow-md animate-scale-in">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[13px] font-semibold text-foreground">{n} selected</span>
        <Button size="sm" variant={panel === 'addTags' ? 'secondary' : 'ghost'} icon="tag" onClick={() => openPanel('addTags')}>
          Tag
        </Button>
        <Button size="sm" variant={panel === 'removeTags' ? 'secondary' : 'ghost'} onClick={() => openPanel('removeTags')}>
          Untag
        </Button>
        <Button size="sm" variant={panel === 'setOwner' ? 'secondary' : 'ghost'} icon="user-plus" onClick={() => openPanel('setOwner')}>
          Owner
        </Button>
        <Button size="sm" variant={panel === 'setGlobalStatus' ? 'secondary' : 'ghost'} onClick={() => openPanel('setGlobalStatus')}>
          Status
        </Button>
        <Button size="sm" variant={panel === 'linkJob' ? 'secondary' : 'ghost'} icon="briefcase" onClick={() => openPanel('linkJob')}>
          Link to role
        </Button>
        {n >= 2 && n <= 4 && (
          <Button
            size="sm"
            variant="ghost"
            icon="columns"
            onClick={() => navigate(`/compare?ids=${selected.map((c) => c._id).join(',')}`)}
          >
            Compare
          </Button>
        )}
        <Button size="sm" variant="ghost" icon="download" onClick={() => exportCandidatesCsv(selected, true)}>
          Export
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon="trash"
          onClick={async () => {
            const ok = await confirm({
              title: `Delete ${n} candidate${n === 1 ? '' : 's'}?`,
              description: 'This permanently removes them with their role links, feedback and history. Archive instead to keep the record.',
              confirmLabel: 'Delete permanently',
              tone: 'danger',
            });
            if (ok) run.mutate({ action: 'delete' });
          }}
        >
          Delete
        </Button>
        <button type="button" onClick={onClear} className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground">
          Clear
        </button>
      </div>

      {panel && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {(panel === 'addTags' || panel === 'removeTags') && (
            <Input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && apply()}
              placeholder="tags, comma-separated"
              className="!w-64"
            />
          )}
          {panel === 'setOwner' && (
            <Select value={value} onChange={(e) => setValue(e.target.value)} className="!w-56">
              <option value="">Unassigned</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          )}
          {panel === 'setGlobalStatus' && (
            <Select value={value} onChange={(e) => setValue(e.target.value)} className="!w-56">
              <option value="">Choose status…</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          )}
          {panel === 'linkJob' && (
            <Select value={value} onChange={(e) => setValue(e.target.value)} className="!w-72">
              <option value="">Choose a role…</option>
              {jobs
                .filter((j) => j.status !== 'CLOSED')
                .map((j) => (
                  <option key={j._id} value={j._id}>
                    {j.title}
                  </option>
                ))}
            </Select>
          )}
          <Button size="sm" variant="primary" onClick={apply} loading={run.isPending}>
            Apply to {n}
          </Button>
        </div>
      )}
    </div>
  );
}
