import { jobService } from './job.service';
import { candidateService } from './candidate.service';
import { auditLogService } from './auditLog.service';
import { clientHomeRepository } from '../repositories/clientHome.repository';
import { pipelineRepository } from '../repositories/pipeline.repository';
import { scopePlacement } from './pipeline.service';

function summarize(jobs: any[], candidates: any[], pipelineSummary: any, recentActivity: any[]) {
  const openJobs = jobs.filter((j: any) => j.status === 'OPEN').length;
  const totalCandidates = candidates.length;

  return {
    openJobs,
    totalJobs: jobs.length,
    totalCandidates,
    shortlisted: (pipelineSummary as any).SHORTLISTED || 0,
    inInterview: (pipelineSummary as any).INTERVIEW || 0,
    selected: ((pipelineSummary as any).OFFER || 0) + ((pipelineSummary as any).HIRED || 0),
    pipelineSummary,
    recentActivity,
  };
}

export const dashboardService = {
  getSummary: async (organizationId: string) => {
    const [jobs, candidates, pipelineSummary, recentActivity] = await Promise.all([
      jobService.getJobsForOrganization(organizationId),
      candidateService.getCandidatesForOrganization(organizationId),
      candidateService.getPipelineSummary(organizationId),
      auditLogService.getOrganizationActivity(organizationId, 5),
    ]);

    return summarize(jobs, candidates, pipelineSummary, recentActivity);
  },

  // SWFS admin/recruiter view: summary aggregated across every client.
  getGlobalSummary: async () => {
    const [jobs, candidates, pipelineSummary, recentActivity] = await Promise.all([
      jobService.getAllJobs(),
      candidateService.getAllCandidates(),
      candidateService.getPipelineSummary(null),
      auditLogService.getAllActivity(5),
    ]);

    return summarize(jobs, candidates, pipelineSummary, recentActivity);
  },

  /**
   * Client home: what needs the client's attention, for their org only —
   * submissions awaiting review, interviews coming up, offers out, their
   * roles' pipelines and active placements. No SWFS-internal fields.
   */
  getClientHome: async (organizationId: string) => {
    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
    const [awaitingReview, interviews, offers, roles, placements] = await Promise.all([
      clientHomeRepository.awaitingReview(organizationId),
      pipelineRepository.upcomingInterviews(organizationId, from, to),
      pipelineRepository.openOffers(organizationId),
      clientHomeRepository.rolesWithPipeline(organizationId),
      pipelineRepository.listPlacements(organizationId),
    ]);
    return {
      awaitingReview,
      upcomingInterviews: interviews,
      openOffers: offers,
      roles,
      activePlacements: placements.filter((p) => p.status === 'ACTIVE').map((p) => scopePlacement(p, false)),
    };
  },
};
