import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffProfileReviewService } from './staff-profile-review.service';

describe('StaffProfileReviewService', () => {
  it('requires a specific reason and correction target', async () => {
    const service = new StaffProfileReviewService({} as never, {} as never);
    await expect(service.returnForCorrection('tenant', 'review', 'hr', {
      reason: 'Please fix this', fields: [], documents: [],
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.returnForCorrection('tenant', 'review', 'hr', {
      reason: 'Please fix this', fields: ['salary_base'],
    })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not permit a faculty member to replace an unrequested document', async () => {
    const service = new StaffProfileReviewService({ query: jest.fn().mockResolvedValue([{
      review_id: 'review', status: 'RETURNED_FOR_CORRECTION', requested_docs: ['PAN'],
    }]) } as never, {} as never);
    await expect(service.assertDocumentCorrectionAllowed('tenant', 'staff', 'AADHAAR'))
      .rejects.toBeInstanceOf(ForbiddenException);
  });

  it('previews only active staff in an exact Pharmacy department without changing data', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce([{ dept_id: 9, dept_name: 'Pharmacy', campus_id: 1 }])
      .mockResolvedValueOnce([{
        user_id: 'staff-1', official_email: 'faculty@example.edu', name: 'Faculty',
        onboarding_status: 'COMPLETED', is_active: true, role_name: 'Faculty',
      }])
      .mockResolvedValueOnce([{
        onboarding_profile: { degree_name: 'PhD' }, onboarding_status: 'COMPLETED',
        phone: null, dept_id: 9, role_name: 'Faculty', official_email: 'faculty@example.edu',
      }])
      .mockResolvedValueOnce([]);
    const service = new StaffProfileReviewService({ query } as never, {} as never);
    const preview = await service.pharmacyPreview('tenant-1', 9);
    expect(preview.accounts).toHaveLength(1);
    expect(preview.preview_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT/i.test(sql))).toBe(true);
  });
});
