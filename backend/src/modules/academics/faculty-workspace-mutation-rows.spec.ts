import { NotFoundException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('faculty workflow PostgreSQL mutation results', () => {
  const query = jest.fn();
  const audit = jest.fn();
  const notify = { examDutySwapPeerRejected: jest.fn(), approvalRequired: jest.fn() };
  let service: FacultyWorkspacesService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query }, notify, writeDutySwapAudit: audit, deanAudit: { logAction: audit },
    });
  });

  const swap = { swap_id: 'swap', requester_faculty_user_id: 'requester', target_faculty_user_id: 'target', status: 'PENDING_TARGET', exam_date: '2026-10-23' };

  it('returns the saved swap response and timestamp from an UPDATE tuple', async () => {
    query.mockResolvedValueOnce([swap]).mockResolvedValueOnce([[{ ...swap, status: 'REJECTED_BY_TARGET', target_responded_at: '2026-10-19T12:00:00Z' }], 1]);
    const saved = await service.respondInvigilationDutySwap('target', 'tenant', 'swap', false);
    expect(saved.swap_id).toBe('swap');
    expect(saved.status).toBe('REJECTED_BY_TARGET');
    expect(saved.target_responded_at).toBe('2026-10-19T12:00:00Z');
    expect(audit).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[1][0]).toContain("AND status = 'PENDING_TARGET' AND deleted_at IS NULL");
    expect(query.mock.calls[1][1]).toEqual(['REJECTED_BY_TARGET', null, 'swap', 'tenant', 'target']);
  });

  it('returns the saved cancellation from an UPDATE tuple', async () => {
    const updated = { ...swap, status: 'CANCELLED' };
    query.mockResolvedValueOnce([swap]).mockResolvedValueOnce([[updated], 1]);
    await expect(service.cancelInvigilationDutySwap('requester', 'tenant', 'swap')).resolves.toEqual(updated);
    expect(query.mock.calls[1][0]).toContain("AND status IN ('PENDING_TARGET', 'PENDING_EXAM_CELL') AND deleted_at IS NULL");
    expect(query.mock.calls[1][1]).toEqual(['swap', 'tenant', 'requester']);
  });

  it.each(['respond', 'cancel'])('does not audit an empty %s UPDATE tuple', async action => {
    query.mockResolvedValueOnce([swap]).mockResolvedValueOnce([[], 0]);
    await expect(action === 'respond'
      ? service.respondInvigilationDutySwap('target', 'tenant', 'swap', false)
      : service.cancelInvigilationDutySwap('requester', 'tenant', 'swap'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(audit).not.toHaveBeenCalled();
    expect(notify.examDutySwapPeerRejected).not.toHaveBeenCalled();
  });

  it('returns the saved HOD decision from an UPDATE tuple', async () => {
    const saved = { request_id: 'request', status: 'REJECTED_HOD', amount: 100 };
    query.mockResolvedValueOnce([{ dept_id: 1 }]).mockResolvedValueOnce([[saved], 1]);
    await expect(service.updateHodFundingRequest('request', 'REJECTED_HOD', 'Reason', 'hod', 'tenant')).resolves.toEqual(saved);
  });

  it('returns the saved Dean decision and audits its actual amount', async () => {
    const saved = { request_id: 'request', status: 'REJECTED_DEAN', amount: 100 };
    query.mockResolvedValueOnce([{ dept_id: 1 }]).mockResolvedValueOnce([[saved], 1]);
    await expect(service.updateDeanFundingRequest('request', 'REJECTED_DEAN', 'Reason', 'dean', 'tenant')).resolves.toEqual(saved);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining({ newValue: expect.objectContaining({ amount: 100 }) }));
  });

  it.each(['hod', 'dean'])('does not treat an empty %s funding tuple as a saved decision', async role => {
    query.mockResolvedValueOnce([{ dept_id: 1 }]).mockResolvedValueOnce([[], 0]);
    await expect(role === 'hod'
      ? service.updateHodFundingRequest('request', 'REJECTED_HOD', 'Reason', 'hod', 'tenant')
      : service.updateDeanFundingRequest('request', 'REJECTED_DEAN', 'Reason', 'dean', 'tenant'))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(audit).not.toHaveBeenCalled();
    expect(notify.approvalRequired).not.toHaveBeenCalled();
  });

  it('returns the actual project report rather than the driver tuple', async () => {
    const saved = { report_id: 'report', status: 'APPROVED', ce_marks: 5 };
    query.mockResolvedValueOnce([{ report_id: 'report', faculty_user_id: 'faculty' }]).mockResolvedValueOnce([[saved], 1]);
    await expect(service.reviewProjectReport('report', 'faculty', 'tenant', { status: 'APPROVED', ce_marks: 5 })).resolves.toEqual(saved);
  });

  it('rejects a project report that disappears before UPDATE', async () => {
    query.mockResolvedValueOnce([{ report_id: 'report', faculty_user_id: 'faculty' }]).mockResolvedValueOnce([[], 0]);
    await expect(service.reviewProjectReport('report', 'faculty', 'tenant', { status: 'APPROVED' })).rejects.toBeInstanceOf(NotFoundException);
  });
});
