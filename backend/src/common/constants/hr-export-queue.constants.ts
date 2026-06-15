export const HR_DOCUMENT_EXPORT_QUEUE = 'hr-document-export';

export type HrDocumentExportJob = {
  jobId: string;
  tenantId: string;
  entityId: number;
  requestedBy: string;
  filters: {
    document_type: string;
    dept_id?: number;
    role_id?: number;
  };
};
