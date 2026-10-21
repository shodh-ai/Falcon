import { StaffProfileReviewService, STAFF_PROFILE_REVIEW_FIELDS } from './staff-profile-review.service';
import { invalidRecoveryFields, recoveryValues, STAFF_RECOVERY_REQUIRED_FIELDS } from './staff-profile-recovery.util';
import { uploadRootIsMounted } from './persistent-upload-root.util';
import { StudentOnboardingService } from './student-onboarding.service';

const profile = {
  staff_mobile: '9876543210', gender: 'Female', date_of_birth: '1985-02-03', current_address: 'Jaipur',
  emergency_contact_name: 'Contact', emergency_contact_phone: '9876543211',
  qualification: { degree_level: 'Doctorate', degree_name: 'PhD', university: 'University', passing_year: 2015 },
  retained_unknown: { legacy: true }, orcid_id: 'saved-optional-id',
};
const docs = ['PHOTO', 'AADHAAR', 'PAN', 'HIGHEST_DEGREE'].map(doc_type => ({ doc_type, file_path: `/uploads/tenant/${doc_type}.pdf`, status: 'PENDING', uploaded_at: null }));
const review = { review_id: 'review', tenant_id: 'tenant', user_id: 'staff', revision: 5, source: 'PHARMACY_RECHECK',
  status: 'RETURNED_FOR_CORRECTION' as const, requested_fields: [], requested_docs: [], return_reason: null,
  recovery_required: true, submitted_snapshot_hash: 'a'.repeat(64) };
const runner = () => ({ connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(), query: jest.fn().mockResolvedValue([]) });
function setup() {
  const qr = runner();
  const service = new StaffProfileReviewService({ createQueryRunner: () => qr } as never, {} as never, {} as never);
  jest.spyOn(service, 'activeReview').mockResolvedValue(review);
  jest.spyOn(service, 'snapshot').mockResolvedValue({ user: { phone: '9876543210', onboarding_status: 'COMPLETED' }, profile, documentManifest: docs, hash: 'a'.repeat(64) });
  jest.spyOn(service, 'appendEvent').mockResolvedValue('a'.repeat(64));
  jest.spyOn(service, 'documentDigest').mockResolvedValue({ sha256: 'b'.repeat(64), size: 20 });
  return { qr, service };
}

describe('Recovery essentials and persistent storage boundary', () => {
  it('requires only core information, preserves nested qualifications, optional values and unknown keys', () => {
    expect(STAFF_RECOVERY_REQUIRED_FIELDS).toHaveLength(10);
    expect(invalidRecoveryFields(profile)).toEqual([]);
    const flat = recoveryValues(profile);
    expect(flat).toMatchObject({ degree_name: 'PhD', orcid_id: 'saved-optional-id', retained_unknown: { legacy: true } });
    expect(profile).not.toHaveProperty('degree_name');
    expect(invalidRecoveryFields({ ...profile, orcid_id: '', bank_account_no: '', blood_group: '' })).toEqual([]);
  });
  it('detects blank or invalid core values without requiring optional research IDs', () => {
    expect(invalidRecoveryFields({ ...profile, staff_mobile: 'invalid', date_of_birth: '1985-02-30', current_address: '' }))
      .toEqual(expect.arrayContaining(['staff_mobile', 'date_of_birth', 'current_address']));
    expect(invalidRecoveryFields({ ...profile, qualification: { ...profile.qualification, passing_year: 3000 } })).toContain('passing_year');
    expect(invalidRecoveryFields({ ...profile, staff_mobile: '' }, '9876543210')).not.toContain('staff_mobile');
  });
  it('rejects the container root layer and prefix lookalikes; accepts an actual upload mount', () => {
    const mount = '31 22 0:3 / / rw - overlay overlay rw\n32 31 8:1 /data /app/uploads rw - ext4 /dev/sda rw';
    expect(uploadRootIsMounted('/app/uploads', mount)).toBe(true);
    expect(uploadRootIsMounted('/app/uploads/tenant', mount)).toBe(true);
    expect(uploadRootIsMounted('/app/uploads-fake', mount)).toBe(false);
    expect(uploadRootIsMounted('/app', mount)).toBe(false);
    expect(uploadRootIsMounted('/app/uploads', '32 31 0:8 / /app/uploads rw - tmpfs tmpfs rw')).toBe(false);
    expect(uploadRootIsMounted('/app/my files', '32 31 8:1 /data /app/my\\040files rw - ext4 disk rw')).toBe(true);
  });
});

describe('Recovery preservation and authoritative document gates', () => {
  it('patches only submitted keys and retains old unknown/qualification values and onboarding status', async () => {
    const { qr, service } = setup();
    await service.correctProfile('tenant', 'staff', { current_address: 'New address' });
    const update = qr.query.mock.calls.find(([sql]) => sql.includes('UPDATE users'))!;
    expect(JSON.parse(update[1][2])).toEqual({ ...profile, current_address: 'New address' });
    expect(update[0]).not.toContain('onboarding_status');
    expect(service.appendEvent).toHaveBeenCalledWith(qr, expect.anything(), 'BEFORE_PROFILE_CORRECTION', 'staff', 'current_address');
  });
  it('rejects erasure, identity/role changes and unrequested document replacements', async () => {
    const { service } = setup();
    await expect(service.correctProfile('tenant', 'staff', { orcid_id: '' })).rejects.toThrow('cannot be empty');
    await expect(service.correctProfile('tenant', 'staff', { role_id: 1 })).rejects.toThrow('Only fields');
    await expect(service.correctDocument('tenant', 'staff', 'PAN', 'new.pdf')).rejects.toThrow('not requested');
  });
  it('accepts safe same-payload profile retries without rewriting saved data', async () => {
    const { service, qr } = setup();
    await expect(service.correctProfile('tenant', 'staff', { orcid_id: 'saved-optional-id' })).resolves.toMatchObject({ replayed: true });
    expect(qr.query).not.toHaveBeenCalled(); expect(service.appendEvent).not.toHaveBeenCalled();
  });
  it('rejects replacement references with no readable bytes before overwriting the current reference', async () => {
    const { service, qr } = setup();
    jest.mocked(service.activeReview).mockResolvedValue({ ...review, requested_docs: ['PAN'] });
    jest.mocked(service.documentDigest).mockRejectedValue(new Error('file missing'));
    await expect(service.correctDocument('tenant', 'staff', 'PAN', '/uploads/tenant/new.pdf')).rejects.toThrow('file missing');
    expect(service.appendEvent).not.toHaveBeenCalled(); expect(qr.query).not.toHaveBeenCalled();
  });
  it('stores a replacement while archiving the original reference before mutation', async () => {
    const { service, qr } = setup();
    jest.mocked(service.activeReview).mockResolvedValue({ ...review, requested_docs: ['PAN'] });
    await service.correctDocument('tenant', 'staff', 'PAN', '/uploads/tenant/new.pdf');
    expect(service.appendEvent).toHaveBeenCalledWith(qr, expect.anything(), 'BEFORE_DOCUMENT_CORRECTION', 'staff', 'PAN');
    expect(qr.query.mock.calls.some(([sql]) => /DELETE/.test(sql))).toBe(false);
    expect(jest.mocked(service.appendEvent).mock.invocationCallOrder[0]).toBeLessThan(qr.query.mock.invocationCallOrder[0]);
  });
  it('requires a real replacement after the latest recovery/correction request', async () => {
    const { service, qr } = setup();
    jest.mocked(service.activeReview).mockResolvedValue({ ...review, requested_docs: ['PAN'] });
    await expect(service.resubmit('tenant', 'staff')).rejects.toThrow('replacement for PAN');
    expect(qr.query.mock.calls[0][0]).toContain("'RECOVERY_OPENED'");
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });
  it('blocks submission when core information or actual document bytes are missing', async () => {
    const { service, qr } = setup();
    jest.mocked(service.snapshot).mockResolvedValueOnce({ user: {}, profile: {}, documentManifest: docs, hash: 'hash' });
    await expect(service.resubmit('tenant', 'staff')).rejects.toThrow('important');
    jest.mocked(service.documentDigest).mockRejectedValueOnce(new Error('file missing'));
    await expect(service.resubmit('tenant', 'staff')).rejects.toThrow('file missing');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });
  it('submits with hashes of all four files without resetting onboarding or changing documents', async () => {
    const { service, qr } = setup();
    await expect(service.resubmit('tenant', 'staff')).resolves.toMatchObject({ status: 'PENDING_HR' });
    expect(service.documentDigest).toHaveBeenCalledTimes(4);
    expect(qr.query.mock.calls.some(([sql]) => /UPDATE users|UPDATE staff_onboarding_docs|DELETE/.test(sql))).toBe(false);
    expect(service.appendEvent).toHaveBeenCalledWith(qr, expect.anything(), 'RESUBMITTED', 'staff', expect.stringContaining('verified_storage_manifest'));
  });
  it('replays activation without resetting corrections or opening another review', async () => {
    const { service, qr } = setup(); qr.query.mockResolvedValue([{ user_id: 'staff' }]);
    await expect(service.activateRecovery('tenant', 'staff', 'a'.repeat(64), 'verified-backup', null)).resolves.toMatchObject({ replayed: true });
    expect(service.snapshot).not.toHaveBeenCalled(); expect(service.appendEvent).not.toHaveBeenCalled();
  });
  it('replays a submitted recovery without duplicating HR events', async () => {
    const { service, qr } = setup();
    jest.mocked(service.activeReview).mockResolvedValue({ ...review, status: 'PENDING_HR' });
    await expect(service.resubmit('tenant', 'staff')).resolves.toEqual({ status: 'PENDING_HR', replayed: true });
    expect(service.appendEvent).not.toHaveBeenCalled(); expect(service.snapshot).not.toHaveBeenCalled();
    expect(qr.query).not.toHaveBeenCalled();
  });
  it('rejects an out-of-cohort account and a changed preview before any mutation', async () => {
    const { service, qr } = setup();
    await expect(service.activateRecovery('tenant', 'staff', 'a'.repeat(64), 'backup', null)).rejects.toThrow('Active Pharmacy');
    qr.query.mockResolvedValue([{ user_id: 'staff' }]); jest.mocked(service.activeReview).mockResolvedValue({ ...review, recovery_required: false });
    await expect(service.activateRecovery('tenant', 'staff', 'c'.repeat(64), 'backup', null)).rejects.toThrow('changed after');
    expect(service.appendEvent).not.toHaveBeenCalled();
  });
  it('activates exactly one review while retaining account data, earlier approval and old document rows', async () => {
    const { service, qr } = setup();
    qr.query.mockImplementation(async (sql: string) => sql.includes("status = 'APPROVED'") ? [{ review_id: 'prior-approved' }] : [{ user_id: 'staff' }]);
    jest.mocked(service.activeReview).mockResolvedValue({ ...review, recovery_required: false, requested_fields: ['orcid_id'], requested_docs: ['PHOTO'] });
    jest.mocked(service.documentDigest).mockImplementation(async (_tenant, _path, type) => {
      if (type === 'PAN') throw new Error('Missing file'); return { sha256: 'b'.repeat(64), size: 20 };
    });
    const result = await service.activateRecovery('tenant', 'staff', 'a'.repeat(64), 'verified-backup', null);
    expect(result.required_fields).toEqual(['orcid_id']);
    expect(result.required_documents).toEqual(['PHOTO', 'PAN']);
    expect(qr.query.mock.calls.some(([sql]) => /UPDATE users|UPDATE staff_onboarding_docs|DELETE/.test(sql))).toBe(false);
    const update = qr.query.mock.calls.find(([sql]) => sql.includes('SET recovery_required'))!;
    expect(update[1][2]).toBe('prior-approved');
    expect(service.appendEvent).toHaveBeenCalledWith(qr, expect.anything(), 'RECOVERY_OPENED', null, expect.any(String));
    expect(qr.query.mock.calls.filter(([sql]) => sql.includes('INSERT INTO staff_profile_recovery_activations'))).toHaveLength(1);
  });
});

describe('Recovery HR approval cannot use document deferral', () => {
  function approvalSetup() {
    const { service: reviews } = setup(); const qr = runner();
    qr.query.mockResolvedValue([{ user_id: 'staff', onboarding_status: 'COMPLETED', role_name: 'Faculty', name: 'Faculty' }]);
    jest.mocked(reviews.activeReview).mockResolvedValue({ ...review, status: 'PENDING_HR' });
    const service = new StudentOnboardingService({ createQueryRunner: () => qr } as never, {} as never, { dismissVerificationNotifications: jest.fn().mockResolvedValue(undefined) } as never, {} as never, {} as never, {} as never, reviews);
    jest.spyOn(service as never, 'assertVerificationCampus' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'assertVerificationKindAndDepartment' as never).mockResolvedValue('staff' as never);
    jest.spyOn(service as never, 'finalizeStaffOnboarding' as never).mockResolvedValue(undefined as never);
    const actor = { user_id: 'hr', tenant_id: 'tenant', role: 'HRAdmin' };
    const attest = { reviewedFields: STAFF_PROFILE_REVIEW_FIELDS, reviewedDocuments: docs.map(d => d.doc_type), revision: 5 };
    return { service, qr, reviews, actor, attest };
  }
  it('rejects details-only, stale, incomplete and self approvals', async () => {
    const { service, qr, actor, attest } = approvalSetup();
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review', { reviewedFields: STAFF_PROFILE_REVIEW_FIELDS, reason: 'defer' })).rejects.toThrow('both details and documents');
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review', undefined, { ...attest, revision: 4 })).rejects.toThrow('changed');
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review', undefined, { ...attest, reviewedDocuments: [] })).rejects.toThrow('every required document');
    await expect(service.approve('tenant', 'staff', undefined, { ...actor, user_id: 'staff' }, 'staff', 'review', undefined, attest)).rejects.toThrow('own profile');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });
  it('approves inspected documents and preserves completed onboarding', async () => {
    const { service, qr, reviews, actor, attest } = approvalSetup();
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review', undefined, attest)).resolves.toMatchObject({ onboarding_status: 'COMPLETED' });
    expect(qr.query.mock.calls.some(([sql]) => sql.includes('UPDATE users'))).toBe(false);
    expect(reviews.appendEvent).toHaveBeenCalledWith(qr, expect.anything(), 'RECOVERY_APPROVED', 'hr', expect.stringContaining('inspected_documents'));
    expect(qr.commitTransaction).toHaveBeenCalled();
  });
});
