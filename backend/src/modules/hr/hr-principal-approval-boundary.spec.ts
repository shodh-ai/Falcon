import { ForbiddenException } from '@nestjs/common';
import { HrTeamService } from './hr-team.service';
describe('Principal reporting does not inherit specialist final review', () => {
  function setup() {
    const query = jest.fn().mockResolvedValue([]),
      decide = jest.fn().mockResolvedValue({ status: 'HOD_APPROVED' });
    return {
      query,
      decide,
      service: new HrTeamService(
        { query } as never,
        {} as never,
        {} as never,
        { actOnTeamRequest: decide } as never,
        {} as never,
        {} as never,
      ),
    };
  }
  test.each(['DOCUMENT', 'APPRAISAL', 'ATTENDANCE_OVERRIDE'])(
    'denies %s without an independently assigned specialist role',
    async (tab) => {
      const { service, query, decide } = setup();
      await expect(
        service.bulkActOnRequests(
          'principal',
          'tenant',
          ['record'],
          'APPROVE',
          'Reviewed evidence',
          tab,
          ['Principal', 'Faculty'],
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
      expect(decide).not.toHaveBeenCalled();
    },
  );
  test('ordinary reporting decisions retain existing workforce authorization and downstream flow', async () => {
    const { service, decide } = setup();
    await expect(
      service.bulkActOnRequests(
        'principal',
        'tenant',
        ['request'],
        'APPROVE',
        'Reviewed evidence',
        'LEAVE',
        ['Principal', 'Faculty'],
      ),
    ).resolves.toEqual({ processed: 1, action: 'APPROVE', tab: 'LEAVE' });
    expect(decide).toHaveBeenCalledWith(
      'principal',
      'tenant',
      'request',
      'APPROVE',
      'Reviewed evidence',
    );
  });
});
