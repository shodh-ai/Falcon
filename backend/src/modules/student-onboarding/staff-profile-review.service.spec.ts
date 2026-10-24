import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { StaffProfileReviewService } from './staff-profile-review.service';

describe('StaffProfileReviewService', () => {
  it('requires a specific reason and correction target', async () => {
    const service = new StaffProfileReviewService({} as never, {} as never, {} as never);
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
    }]) } as never, {} as never, {} as never);
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
    const service = new StaffProfileReviewService({ query } as never, {} as never, {} as never);
    const preview = await service.pharmacyPreview('tenant-1', 9);
    expect(preview.accounts).toHaveLength(1);
    expect(preview.preview_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(query.mock.calls.every(([sql]) => /^\s*SELECT/i.test(sql))).toBe(true);
  });

  it('commits the correction and its email together before starting delivery', async () => {
    const review = { review_id: 'review', tenant_id: 'tenant', user_id: 'staff', revision: 1, status: 'PENDING_HR' };
    const qr = { connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([review]) };
    const notifications = { enqueueCorrection: jest.fn(), deliverPending: jest.fn().mockResolvedValue(undefined) };
    const service = new StaffProfileReviewService({ createQueryRunner: () => qr } as never, {} as never, notifications as never);
    jest.spyOn(service, 'appendEvent').mockResolvedValue('hash');
    await expect(service.returnForCorrection('tenant', 'review', 'hr', {
      reason: 'Please upload a clear PAN card', documents: ['PAN'],
    })).resolves.toEqual({ status: 'RETURNED_FOR_CORRECTION', email_status: 'QUEUED' });
    expect(notifications.enqueueCorrection).toHaveBeenCalledWith(qr, { ...review, revision: 2 }, {
      reason: 'Please upload a clear PAN card', documents: ['PAN'], fields: [],
    });
    expect(qr.commitTransaction.mock.invocationCallOrder[0]).toBeLessThan(notifications.deliverPending.mock.invocationCallOrder[0]);
  });

  it('rolls back the decision if the durable notification cannot be saved', async () => {
    const qr = { connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([
        { review_id: 'review', tenant_id: 'tenant', user_id: 'staff', revision: 1, status: 'PENDING_HR' },
      ]) };
    const notifications = { enqueueCorrection: jest.fn().mockRejectedValue(new Error('DB unavailable')), deliverPending: jest.fn() };
    const service = new StaffProfileReviewService({ createQueryRunner: () => qr } as never, {} as never, notifications as never);
    jest.spyOn(service, 'appendEvent').mockResolvedValue('hash');
    await expect(service.returnForCorrection('tenant', 'review', 'hr', { reason: 'Fix mobile', fields: ['staff_mobile'] })).rejects.toThrow('DB unavailable');
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.commitTransaction).not.toHaveBeenCalled();
    expect(notifications.deliverPending).not.toHaveBeenCalled();
  });

  it('rejects corrections against a stale profile revision without changing status or notifying', async () => {
    const qr = { connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([
        { review_id: 'review', tenant_id: 'tenant', user_id: 'staff', revision: 3, status: 'PENDING_HR' },
      ]) };
    const notifications = { enqueueCorrection: jest.fn(), deliverPending: jest.fn() };
    const service = new StaffProfileReviewService({ createQueryRunner: () => qr } as never, {} as never, notifications as never);
    await expect(service.returnForCorrection('tenant', 'review', 'hr', { reason: 'Wrong Aadhaar', documents: ['AADHAAR'], revision: 2 })).rejects.toThrow('changed since you opened');
    expect(qr.query).toHaveBeenCalledTimes(1);
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(notifications.enqueueCorrection).not.toHaveBeenCalled();
    expect(notifications.deliverPending).not.toHaveBeenCalled();
  });

  it('requires an actual replacement upload when an initial pending document is returned', async () => {
    const qr = { connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(),
      rollbackTransaction: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([]) };
    const service = new StaffProfileReviewService({ createQueryRunner: () => qr } as never, {} as never, {} as never);
    jest.spyOn(service, 'activeReview').mockResolvedValue({ review_id: 'review', tenant_id: 'tenant', user_id: 'staff',
      status: 'RETURNED_FOR_CORRECTION', revision: 2, requested_fields: [], requested_docs: ['PAN'],
      source: 'INITIAL', return_reason: 'PAN is blurry', submitted_snapshot_hash: 'hash' });
    jest.spyOn(service, 'snapshot').mockResolvedValue({ user: {}, profile: {},
      documentManifest: [{ doc_type: 'PAN', status: 'PENDING', file_path: 'old.pdf', uploaded_at: null }], hash: 'hash' });
    await expect(service.resubmit('tenant', 'staff')).rejects.toThrow('Upload a replacement for PAN');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });
});
