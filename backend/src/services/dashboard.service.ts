import { jobService } from './job.service';
import { candidateService } from './candidate.service';
import { auditLogService } from './auditLog.service';

export const dashboardService = {
  getSummary: async (organizationId: string) => {
    const [jobs, pipelineSummary, recentActivity] = await Promise.all([
      jobService.getJobsForOrganization(organizationId),
      candidateService.getPipelineSummary(organizationId),
      auditLogService.getOrganizationActivity(organizationId, 5),
    ]);

    const openJobs = jobs.filter((j: any) => j.status === 'OPEN').length;
    const totalCandidates = Object.values(pipelineSummary as Record<string, number>).reduce(
      (a, b) => a + b,
      0
    );

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
  },
};
