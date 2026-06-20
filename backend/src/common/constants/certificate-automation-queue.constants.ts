export const CERTIFICATE_AUTOMATION_QUEUE = 'certificate-automation';

export type CertificateGenerationJob = {
  jobId: string;
  tenantId: string;
  eventId: string;
  requestedBy: string;
};
