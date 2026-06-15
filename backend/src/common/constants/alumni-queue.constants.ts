export const ALUMNI_CONVERSION_QUEUE = 'alumni-conversion';

export type AlumniConversionJob = {
  tenantId: string;
  studentUserId: string;
  autoVerify: boolean;
  linkedinUrl?: string;
  placementOrganization?: string;
  personalEmail?: string;
};
