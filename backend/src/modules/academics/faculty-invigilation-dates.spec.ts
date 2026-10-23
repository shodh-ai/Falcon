import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { FacultyWorkspacesService } from './faculty-workspaces.service';

jest.mock('uuid', () => ({ v4: jest.fn() }));

describe('Faculty invigilation calendar-date contract', () => {
  const facultyId = '10000000-0000-4000-8000-000000000001';
  const targetId = '10000000-0000-4000-8000-000000000002';
  const tenantId = '20000000-0000-4000-8000-000000000001';
  const assignmentId = '30000000-0000-4000-8000-000000000001';
  const swapId = '40000000-0000-4000-8000-000000000001';
  const examDate = '2026-10-23';
  const timestamp = '2026-10-19T18:30:00.000Z';
  const query = jest.fn();
  const notify = {
    examDutySwapPeerRequest: jest.fn(), examDutySwapPeerRejected: jest.fn(),
    examDutySwapExamCellPending: jest.fn(),
  };
  let service: FacultyWorkspacesService;

  beforeEach(() => {
    jest.clearAllMocks();
    query.mockReset();
    service = Object.assign(Object.create(FacultyWorkspacesService.prototype), {
      dataSource: { query }, notify,
      writeDutySwapAudit: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('returns a date-only duty field while retaining timestamps and faculty/tenant restrictions', async () => {
    const duty = { assignment_id: assignmentId, exam_date: examDate, created_at: timestamp };
    query.mockResolvedValueOnce([duty]);
    await expect(service.listInvigilation(facultyId, tenantId)).resolves.toEqual([duty]);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('a.exam_date::text AS exam_date');
    expect(sql).toContain('r.tenant_id = a.tenant_id');
    expect(sql).toContain('a.tenant_id = $1 AND a.faculty_user_id = $2');
    expect(params).toEqual([tenantId, facultyId]);
  });

  it('keeps swap dates date-only and limits joined records to their tenant', async () => {
    query.mockResolvedValueOnce([]);
    await service.listInvigilationSwaps(facultyId, tenantId);
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('a.exam_date::text AS exam_date');
    expect(sql).toContain('a.tenant_id = s.tenant_id');
    expect(sql).toContain('req.tenant_id = s.tenant_id');
    expect(sql).toContain('tgt.tenant_id = s.tenant_id');
    expect(sql).toContain('s.requester_faculty_user_id = $2 OR s.target_faculty_user_id = $2');
    expect(params).toEqual([tenantId, facultyId]);
  });

  it('uses the calendar date for swap partner session conflicts', async () => {
    query.mockResolvedValueOnce([{ exam_date: examDate, session_label: 'Morning' }])
      .mockResolvedValueOnce([]);
    await service.listInvigilationSwapPartners(facultyId, tenantId, assignmentId);
    expect(query.mock.calls[0][0]).toContain('a.exam_date::text AS exam_date');
    expect(query.mock.calls[0][1]).toEqual([assignmentId, facultyId, tenantId]);
    expect(query.mock.calls[1][1]).toEqual([tenantId, facultyId, examDate, 'Morning']);
  });

  it('does not expose swap partners for another faculty assignment', async () => {
    query.mockResolvedValueOnce([]);
    await expect(service.listInvigilationSwapPartners(facultyId, tenantId, assignmentId))
      .rejects.toBeInstanceOf(NotFoundException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves the same calendar date in a mocked swap request and notification', async () => {
    query.mockResolvedValueOnce([{
      assignment_id: assignmentId, exam_date: examDate, room: 'A101',
      requester_name: 'Requester', session_label: 'Morning',
    }]).mockResolvedValueOnce([{ user_id: targetId, name: 'Target' }])
      .mockResolvedValueOnce([]).mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ swap_id: swapId, assignment_id: assignmentId, created_at: timestamp }]);

    const result = await service.requestInvigilationDutySwap(facultyId, tenantId, assignmentId, targetId, 'Test reason');

    expect(query.mock.calls[0][0]).toContain('a.exam_date::text AS exam_date');
    expect(query.mock.calls[2][1]).toEqual([tenantId, targetId, examDate, 'Morning']);
    expect(result.exam_date).toBe(examDate);
    expect(result.created_at).toBe(timestamp);
    expect(notify.examDutySwapPeerRequest).toHaveBeenCalledWith(expect.objectContaining({ examDate }));
  });

  it('keeps calendar dates and response timestamps distinct in a mocked swap response', async () => {
    query.mockResolvedValueOnce([{
      swap_id: swapId, assignment_id: assignmentId,
      requester_faculty_user_id: facultyId, target_faculty_user_id: targetId,
      status: 'PENDING_TARGET', exam_date: examDate, room: 'A101',
      requester_name: 'Requester', target_name: 'Target',
    }]).mockResolvedValueOnce([{ swap_id: swapId, status: 'REJECTED_BY_TARGET', target_responded_at: timestamp }]);

    const result = await service.respondInvigilationDutySwap(targetId, tenantId, swapId, false);

    expect(query.mock.calls[0][0]).toContain('a.exam_date::text AS exam_date');
    expect(query.mock.calls[0][1]).toEqual([swapId, tenantId]);
    expect(result.exam_date).toBe(examDate);
    expect(result.examDate).toBe(examDate);
    expect(result.target_responded_at).toBe(timestamp);
    expect(notify.examDutySwapPeerRejected).toHaveBeenCalledWith(expect.objectContaining({ examDate }));
  });

  it('does not let another faculty respond to a swap request', async () => {
    query.mockResolvedValueOnce([{ target_faculty_user_id: targetId, status: 'PENDING_TARGET' }]);
    await expect(service.respondInvigilationDutySwap(facultyId, tenantId, swapId, false))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
    expect(notify.examDutySwapPeerRejected).not.toHaveBeenCalled();
  });
});
