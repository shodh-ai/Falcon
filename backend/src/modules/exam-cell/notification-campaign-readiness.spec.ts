import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ExamCellOperationsService } from './exam-cell-operations.service';

function setup(students = ['synthetic-student']) {
  const query = jest.fn(
    (sql: string): Promise<Array<Record<string, unknown>>> => {
      if (sql.includes('SELECT u.user_id'))
        return Promise.resolve(students.map((user_id) => ({ user_id })));
      return Promise.resolve([{ campaign_id: 'synthetic-campaign' }]);
    },
  );
  const dispatch = jest
    .fn()
    .mockResolvedValue({ notification_id: 'synthetic-notification' });
  const log = jest.fn().mockResolvedValue(undefined);
  const service = new ExamCellOperationsService(
    { query } as never,
    {} as never,
    {} as never,
    { log } as never,
    { dispatch } as never,
  );
  return { service, query, dispatch, log };
}
const dto = {
  channel: 'IN_APP',
  subject: 'Synthetic examination alert',
  body: 'Synthetic local message',
  audience: 'ALL_STUDENTS',
};

describe('Examination campaign delivery readiness', () => {
  it.each(['EMAIL', 'SMS', 'WHATSAPP'])(
    'rejects unimplemented %s delivery before any campaign, queue or audit write',
    async (channel) => {
      const { service, query, dispatch, log } = setup();
      await expect(
        service.sendNotificationCampaign('tenant', 'actor', {
          ...dto,
          channel,
        }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(query).not.toHaveBeenCalled();
      expect(dispatch).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    },
  );

  it.each([
    { channel: 'PUSH' },
    { subject: '' },
    { subject: 'x'.repeat(201) },
    { body: '  ' },
    { audience: 'SELECTED_STUDENTS' },
  ])('rejects unsupported or invalid campaign input %j', async (input) => {
    const { service, query } = setup();
    await expect(
      service.sendNotificationCampaign('tenant', 'actor', { ...dto, ...input }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
  });

  it('preserves real tenant-scoped in-app delivery and never enqueues an external provider stub', async () => {
    const { service, query, dispatch, log } = setup(['student-a', 'student-b']);
    await expect(
      service.sendNotificationCampaign('tenant', 'actor', dto),
    ).resolves.toMatchObject({
      channel: 'IN_APP',
      delivered: 2,
      message: '2 in-app notifications created on student accounts.',
    });
    expect(query.mock.calls[0][0]).toContain('u.tenant_id = $1');
    expect(query.mock.calls[0][0]).toContain(
      'u.is_active = TRUE AND u.deleted_at IS NULL',
    );
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant',
        userId: 'student-a',
        queueDelivery: false,
        metadata: { channel: 'IN_APP', campaign: true },
      }),
    );
    expect(log).toHaveBeenCalledWith(
      'tenant',
      'actor',
      expect.objectContaining({
        action: 'NOTIFICATION_CAMPAIGN_SENT',
        new_value: { subject: dto.subject, channel: 'IN_APP', delivered: 2 },
      }),
    );
  });

  it('propagates persistence failure instead of returning a fabricated delivery count', async () => {
    const { service, dispatch, log } = setup();
    dispatch.mockRejectedValueOnce(
      new Error('Synthetic notification persistence failed'),
    );
    await expect(
      service.sendNotificationCampaign('tenant', 'actor', dto),
    ).rejects.toThrow('Synthetic notification persistence failed');
    expect(log).not.toHaveBeenCalled();
  });

  it('reports a genuine zero-recipient campaign without claiming delivery', async () => {
    const { service, dispatch } = setup([]);
    await expect(
      service.sendNotificationCampaign('tenant', 'actor', dto),
    ).resolves.toMatchObject({
      delivered: 0,
      channel: 'IN_APP',
      message:
        'No students found for this tenant — campaign saved but nothing was delivered.',
    });
    expect(dispatch).not.toHaveBeenCalled();
  });
});
