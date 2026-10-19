import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { StaffProfileReviewService, STAFF_PROFILE_REVIEW_FIELDS } from './staff-profile-review.service';
import { StudentOnboardingService } from './student-onboarding.service';

const docs = ['PHOTO', 'AADHAAR', 'PAN', 'HIGHEST_DEGREE'];
const actor = { user_id: 'hr', tenant_id: 'tenant', role: 'HRAdmin' };
const review = { review_id: 'review', tenant_id: 'tenant', user_id: 'staff', status: 'APPROVED', documents_deferred: true };
const runner = () => ({ connect: jest.fn(), startTransaction: jest.fn(), commitTransaction: jest.fn(), rollbackTransaction: jest.fn(), release: jest.fn(), query: jest.fn() });
function documentService() {
  const qr = runner();
  qr.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT * FROM staff_profile_reviews')) return [review];
    if (sql.includes('SELECT verification_id')) return [];
    if (sql.includes('SELECT doc_type')) return docs.map((doc_type) => ({ doc_type, file_path: `${doc_type}.pdf` }));
    if (sql.includes('INSERT INTO staff_profile_document_verifications')) return [{ verification_id: 'decision' }];
    return [];
  });
  const service = new StaffProfileReviewService({ createQueryRunner: () => qr } as never, {} as never, {} as never);
  jest.spyOn(service, 'detail').mockResolvedValue({ review } as never);
  jest.spyOn(service, 'documentDigest').mockResolvedValue({ sha256: 'a'.repeat(64), size: 10 });
  return { service, qr };
}
describe('Deferred document verification', () => {
  it('hashes all four originals and appends a decision without changing the profile approval', async () => {
    const { service, qr } = documentService();
    await expect(service.verifyDocuments('tenant', 'review', actor, docs)).resolves.toMatchObject({ document_review_status: 'VERIFIED' });
    expect(service.detail).toHaveBeenCalledWith('tenant', 'review', actor);
    expect(service.documentDigest).toHaveBeenCalledTimes(4);
    const insert = qr.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO staff_profile_document_verifications'))!;
    expect(JSON.parse(insert[1][4])).toHaveLength(4);
    expect(insert[1][5]).toMatch(/^[a-f0-9]{64}$/);
    expect(qr.query.mock.calls.some(([sql]) => sql.includes('UPDATE staff_profile_reviews'))).toBe(false);
    expect(qr.commitTransaction).toHaveBeenCalledTimes(1);
  });
  it('does not verify or change documents when an original is missing', async () => {
    const { service, qr } = documentService();
    jest.mocked(service.documentDigest).mockRejectedValue(new Error('original missing'));
    await expect(service.verifyDocuments('tenant', 'review', actor, docs)).rejects.toThrow('original missing');
    expect(qr.rollbackTransaction).toHaveBeenCalled();
    expect(qr.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(false);
  });
  it.each(['CampusAdmin', 'SuperAdmin', 'Faculty'])('denies document decisions by %s', async (role) => {
    const { service, qr } = documentService();
    await expect(service.verifyDocuments('tenant', 'review', { ...actor, role }, docs)).rejects.toThrow('Only HR Admin');
    expect(qr.connect).not.toHaveBeenCalled();
  });
  it('denies self approval and out-of-scope access', async () => {
    const { service, qr } = documentService();
    await expect(service.verifyDocuments('tenant', 'review', { ...actor, user_id: 'staff' }, docs)).rejects.toThrow('own documents');
    jest.mocked(service.detail).mockRejectedValue(new Error('Wrong campus'));
    qr.connect.mockClear();
    await expect(service.verifyDocuments('tenant', 'review', actor, docs)).rejects.toThrow('Wrong campus');
    expect(qr.connect).not.toHaveBeenCalled();
  });
  it('replays an existing decision without rereading files or changing facts', async () => {
    const { service, qr } = documentService();
    qr.query.mockReset().mockResolvedValueOnce([review]).mockResolvedValueOnce([{ verification_id: 'existing' }]);
    await expect(service.verifyDocuments('tenant', 'review', actor, docs)).resolves.toMatchObject({ verification_id: 'existing', replayed: true });
    expect(service.documentDigest).not.toHaveBeenCalled();
  });
  it.each([{ values: [] }, { values: ['PHOTO', 'PHOTO', 'PAN', 'HIGHEST_DEGREE'] }, { values: [...docs, 'PHOTO'] }])('rejects incomplete or duplicated inspection attestations $values', async ({ values }) => {
    const { service, qr } = documentService();
    await expect(service.verifyDocuments('tenant', 'review', actor, values)).rejects.toThrow('Confirm all required');
    expect(qr.connect).not.toHaveBeenCalled();
  });
  it('hashes bytes from tenant-scoped object storage and rejects foreign/empty objects', async () => {
    const storage = { isEnabled: () => true, getBucketName: () => 'bucket', getDownloadStream: jest.fn().mockResolvedValue(Readable.from([Buffer.from('original')])) };
    const service = new StaffProfileReviewService({} as never, {} as never, {} as never, storage as never);
    await expect(service.documentDigest('tenant', 's3://bucket/tenant/original.pdf', 'PAN')).resolves.toEqual({ size: 8, sha256: createHash('sha256').update('original').digest('hex') });
    await expect(service.documentDigest('tenant', 's3://bucket/other/original.pdf', 'PAN')).rejects.toThrow('missing or unreadable');
    storage.getDownloadStream.mockResolvedValue(Readable.from([]));
    await expect(service.documentDigest('tenant', 'tenant/empty.pdf', 'PAN')).rejects.toThrow('missing or unreadable');
  });
});

describe('Details-only approval', () => {
  function setup() {
    const qr = runner();
    qr.query.mockResolvedValue([{ user_id: 'staff', onboarding_status: 'COMPLETED', role_name: 'Faculty', name: 'Faculty' }]);
    const reviews = new StaffProfileReviewService({} as never, {} as never, {} as never);
    jest.spyOn(reviews, 'activeReview').mockResolvedValue({ ...review, status: 'PENDING_HR', revision: 1, source: 'PHARMACY_RECHECK', requested_fields: [], requested_docs: [], return_reason: null, submitted_snapshot_hash: 'hash' });
    jest.spyOn(reviews, 'snapshot').mockResolvedValue({ user: {}, profile: {}, documentManifest: [], hash: 'hash' });
    jest.spyOn(reviews, 'appendEvent').mockResolvedValue('hash');
    const service = new StudentOnboardingService({ createQueryRunner: () => qr } as never, {} as never, { dismissVerificationNotifications: jest.fn().mockResolvedValue(undefined) } as never, {} as never, {} as never, {} as never, reviews);
    jest.spyOn(service as never, 'assertVerificationCampus' as never).mockResolvedValue(undefined as never);
    jest.spyOn(service as never, 'assertVerificationKindAndDepartment' as never).mockResolvedValue('staff' as never);
    jest.spyOn(service as never, 'finalizeStaffOnboarding' as never).mockResolvedValue(undefined as never);
    return { service, qr, reviews };
  }
  it('restores access without approving missing documents or resetting onboarding', async () => {
    const { service, qr, reviews } = setup();
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review', { reviewedFields: STAFF_PROFILE_REVIEW_FIELDS, reason: 'Documents await storage recovery' })).resolves.toEqual({ onboarding_status: 'COMPLETED', document_review_status: 'PENDING' });
    expect(qr.query.mock.calls.some(([sql]) => sql.includes('UPDATE staff_onboarding_docs') || sql.includes('UPDATE users'))).toBe(false);
    expect(qr.query).toHaveBeenCalledWith(expect.stringContaining('documents_deferred = $4'), ['tenant', 'review', 'hr', true]);
    expect(reviews.appendEvent).toHaveBeenCalledWith(qr, expect.objectContaining({ revision: 2 }), 'PROFILE_APPROVED_DOCUMENTS_DEFERRED', 'hr', expect.stringContaining('Documents await storage recovery'));
    expect(qr.commitTransaction).toHaveBeenCalled();
  });
  it.each([{ reviewedFields: [] }, { reviewedFields: [...STAFF_PROFILE_REVIEW_FIELDS, 'staff_mobile'] }, { reviewedFields: ['salary_base'] }])('rejects incomplete/invalid reviewed details', async ({ reviewedFields }) => {
    const { service, qr } = setup();
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review', { reviewedFields, reason: 'Pending documents' })).rejects.toThrow('Confirm every profile detail');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });
  it('retains self-approval and stale-review protection', async () => {
    const { service } = setup();
    const details = { reviewedFields: STAFF_PROFILE_REVIEW_FIELDS, reason: 'Pending documents' };
    await expect(service.approve('tenant', 'staff', undefined, { ...actor, user_id: 'staff' }, 'staff', 'review', details)).rejects.toThrow('own profile');
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'old-review', details)).rejects.toThrow('no longer current');
  });
  it('does not silently relax legacy/full document approval', async () => {
    const { service, qr } = setup();
    await expect(service.approve('tenant', 'staff', undefined, actor, 'staff', 'review')).rejects.toThrow('Missing documents');
    expect(qr.commitTransaction).not.toHaveBeenCalled();
  });
});
