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
    /** Server-resolved department scope frozen when the export is requested. */
    authorized_dept_ids?: number[] | null;
  };
};
