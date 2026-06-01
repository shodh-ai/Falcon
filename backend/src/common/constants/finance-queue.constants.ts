export const FINANCE_BULK_DEMAND_QUEUE = 'finance-bulk-demand';

export type FinanceBulkDemandJob = {
  jobId: string;
  tenantId: string;
  templateId?: string;
  program?: string;
  semester?: number;
  academic_year?: string;
  due_date?: string;
  tuition_fee?: number;
  development_fee?: number;
  batch_year?: number;
};
