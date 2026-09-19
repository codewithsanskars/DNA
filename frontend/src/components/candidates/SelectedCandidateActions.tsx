import { useState, MouseEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Button from '../shared/Button';
import Modal from '../shared/Modal';
import { candidateApi } from '../../api/candidate.api';
import { queryKeys } from '../../api/queryKeys';
import { useToast } from '../shared/Toast';
import { GlobalStatus, CandidateStatus } from '../../types';

interface SelectedCandidateActionsProps {
  candidateId: string;
  candidateName: string;
  size?: 'sm' | 'md';
}

// Actions available on a SELECTED candidate: move them to Onboarded (as an
// SWFS or client-company hire), reject them (to one of a few landing
// statuses), or reach out (no-op for now, wired up later).
export default function SelectedCandidateActions({
  candidateId,
  candidateName,
  size = 'sm',
}: SelectedCandidateActionsProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [showOnboardModal, setShowOnboardModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.candidates });
    queryClient.invalidateQueries({ queryKey: queryKeys.candidate(candidateId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
  };

  const updateGlobalStatus = useMutation({
    mutationFn: ({ globalStatus, status }: { globalStatus: GlobalStatus; status: CandidateStatus }) =>
      candidateApi.updateGlobalStatus(candidateId, globalStatus, status),
    onSuccess: () => {
      invalidate();
      setShowOnboardModal(false);
      setShowRejectModal(false);
      toast.success('Candidate updated');
    },
    onError: () => toast.error('Couldn’t update this candidate', 'Please try again.'),
  });

  // Row actions live inside clickable table rows elsewhere — keep clicks here
  // from also triggering a row navigation.
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <div className="grid grid-cols-3 gap-1.5" onClick={stop}>
      <Button variant="primary" size={size} className="w-full" onClick={() => setShowOnboardModal(true)}>
        Onboard
      </Button>
      <Button variant="secondary" size={size} className="w-full">
        Reach Out
      </Button>
      <Button variant="danger" size={size} className="w-full" onClick={() => setShowRejectModal(true)}>
        Reject
      </Button>

      {showOnboardModal && (
        <Modal
          title="Onboard candidate"
          description={`Move ${candidateName} to Onboarded.`}
          onClose={() => setShowOnboardModal(false)}
        >
          <div className="flex gap-2">
            <Button
              variant="primary"
              className="flex-1"
              loading={updateGlobalStatus.isPending}
              onClick={() => updateGlobalStatus.mutate({ globalStatus: 'ONBOARDED', status: 'SWFS' })}
            >
              SWFS
            </Button>
            <Button
              variant="secondary"
              className="flex-1"
              loading={updateGlobalStatus.isPending}
              onClick={() => updateGlobalStatus.mutate({ globalStatus: 'ONBOARDED', status: 'COMPANY' })}
            >
              Company
            </Button>
          </div>
        </Modal>
      )}

      {showRejectModal && (
        <Modal
          title="Reject candidate"
          description={`Choose what happens to ${candidateName}.`}
          onClose={() => setShowRejectModal(false)}
        >
          <div className="space-y-2">
            <Button
              variant="danger"
              className="w-full justify-start"
              loading={updateGlobalStatus.isPending}
              onClick={() => updateGlobalStatus.mutate({ globalStatus: 'ARCHIVED', status: 'BLACKLISTED' })}
            >
              Archive as Blacklisted
            </Button>
            <Button
              variant="danger"
              className="w-full justify-start"
              loading={updateGlobalStatus.isPending}
              onClick={() => updateGlobalStatus.mutate({ globalStatus: 'ARCHIVED', status: 'NOT_INTERESTED' })}
            >
              Archive as Not Interested
            </Button>
            <Button
              variant="secondary"
              className="w-full justify-start"
              loading={updateGlobalStatus.isPending}
              onClick={() => updateGlobalStatus.mutate({ globalStatus: 'OPEN', status: 'LOOKING' })}
            >
              Back to Open (Looking)
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
