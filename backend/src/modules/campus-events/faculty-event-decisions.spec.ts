import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CampusEventsService } from './campus-events.service';
import { RejectEventDto } from './dto/reject-event.dto';

describe('faculty event decision boundaries', () => {
  const query = jest.fn();
  const notification = jest.fn();
  let service: CampusEventsService;
  beforeEach(() => {
    jest.resetAllMocks();
    service = Object.assign(Object.create(CampusEventsService.prototype), {
      dataSource: { query }, notifyDepartmentHod: notification, notifyCoordinatorRejected: notification,
    });
  });

  it.each(['   ', '', ' a ', 'x'.repeat(501), null])('rejects invalid reason %p before any query', async reason => {
    await expect(service.rejectEvent('tenant', 'faculty', ['Faculty'], 'event', reason as string)).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    expect(notification).not.toHaveBeenCalled();
  });

  it('trims rejection text and rechecks the advisor and pending state in the write', async () => {
    query.mockResolvedValueOnce([{ faculty_advisor_id: 'faculty' }]).mockResolvedValueOnce([{ event_id: 'event' }]);
    await service.rejectEvent('tenant', 'faculty', ['Faculty'], 'event', '  Missing venue  ');
    const [sql, params] = query.mock.calls[1];
    expect(sql).toContain("advisor_approval = 'PENDING'");
    expect(sql).toContain('c.tenant_id = $2 AND c.faculty_advisor_id = $4');
    expect(params).toEqual(['event', 'tenant', 'Missing venue', 'faculty', false]);
    expect(notification).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0]).toContain('c.tenant_id = e.tenant_id');
  });

  it('does not notify when an approval loses the advisor or state race', async () => {
    query.mockResolvedValueOnce([{ faculty_advisor_id: 'faculty' }]).mockResolvedValueOnce([]);
    await expect(service.approveEvent('tenant', 'faculty', ['Faculty'], 'event')).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls[1][0]).toContain('c.tenant_id = $2 AND c.faculty_advisor_id = $3');
    expect(query.mock.calls[1][1]).toEqual(['event', 'tenant', 'faculty', false]);
    expect(notification).not.toHaveBeenCalled();
  });

  it('does not notify when a rejection is already processed', async () => {
    query.mockResolvedValueOnce([{ faculty_advisor_id: 'faculty' }]).mockResolvedValueOnce([]);
    await expect(service.rejectEvent('tenant', 'faculty', ['Faculty'], 'event', 'Not approved')).rejects.toBeInstanceOf(BadRequestException);
    expect(notification).not.toHaveBeenCalled();
  });

  it('denies a different advisor before an update', async () => {
    query.mockResolvedValueOnce([{ faculty_advisor_id: 'other-faculty' }]);
    await expect(service.approveEvent('tenant', 'faculty', ['Faculty'], 'event')).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('preserves SuperAdmin scope while requiring a pending event', async () => {
    query.mockResolvedValueOnce([{ event_id: 'event', club_id: 'club', title: 'Proposal' }]).mockResolvedValueOnce([]);
    await service.approveEvent('tenant', 'admin', ['SuperAdmin'], 'event');
    expect(query.mock.calls[0][1]).toEqual(['event', 'tenant', 'admin', true]);
    expect(query.mock.calls[0][0]).toContain("status = 'PENDING_ADVISOR'");
    expect(query.mock.calls[1][1]).toEqual(['club', 'tenant']);
  });

  it('validates trimmed reason length at the HTTP boundary too', async () => {
    const blank = plainToInstance(RejectEventDto, { comment: '   ' });
    expect((await validate(blank)).length).toBeGreaterThan(0);
    const valid = plainToInstance(RejectEventDto, { comment: '  Need a venue  ' });
    expect(await validate(valid)).toEqual([]);
    expect(valid.comment).toBe('Need a venue');
  });

  it('returns the saved event from the PostgreSQL UPDATE tuple', async () => {
    const event = { event_id: 'event', club_id: 'club', title: 'Proposal' };
    query.mockResolvedValueOnce([{ faculty_advisor_id: 'faculty' }])
      .mockResolvedValueOnce([[event], 1]);
    await expect(service.rejectEvent('tenant', 'faculty', ['Faculty'], 'event', 'Need a venue')).resolves.toEqual(event);
    expect(notification).toHaveBeenCalledWith('tenant', event, 'Faculty Coordinator');
  });

  it.each(['approve', 'reject'])('rejects a zero-row PostgreSQL %s tuple without notifying', async decision => {
    query.mockResolvedValueOnce([{ faculty_advisor_id: 'faculty' }]).mockResolvedValueOnce([[], 0]);
    const result = decision === 'approve'
      ? service.approveEvent('tenant', 'faculty', ['Faculty'], 'event')
      : service.rejectEvent('tenant', 'faculty', ['Faculty'], 'event', 'Need a venue');
    await expect(result).rejects.toBeInstanceOf(BadRequestException);
    expect(notification).not.toHaveBeenCalled();
  });
});
