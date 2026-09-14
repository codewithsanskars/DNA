import { jobService } from './job.service';
import { candidateService } from './candidate.service';
import { auditLogService } from './auditLog.service';

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
};
