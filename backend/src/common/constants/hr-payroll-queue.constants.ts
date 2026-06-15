export const HR_PAYROLL_QUEUE = 'hr-payroll';

export type HrPayrollJob = {
  jobId: string;
  tenantId: string;
  monthKey: string;
  startedByUserId?: string;
};
