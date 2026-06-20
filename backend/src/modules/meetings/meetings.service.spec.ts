import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { MeetingsService } from './meetings.service';

describe('MeetingsService', () => {
  const notify = {
    meetingInvited: jest.fn(),
    meetingRequestedUpward: jest.fn(),
    portalMeetingResponded: jest.fn(),
    meetingAgendaUpdated: jest.fn(),
    meetingMinutesPublished: jest.fn(),
  };

  const dataSource = {
    query: jest.fn(),
  };

  const users = {
    findOne: jest.fn(),
  };

  const meetings = {
    save: jest.fn(async (row) => ({ meeting_id: 'm1', ...row })),
    findOne: jest.fn(),
    create: jest.fn((row) => row),
  };

  const participants = {
    save: jest.fn(async (row) => row),
    findOne: jest.fn(),
    find: jest.fn(),
    create: jest.fn((row) => row),
  };

  const minutesRepo = {
    findOne: jest.fn(),
    save: jest.fn(async (row) => row),
    create: jest.fn((row) => row),
  };

  let service: MeetingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MeetingsService(
      dataSource as never,
      users as never,
      meetings as never,
      participants as never,
      minutesRepo as never,
      notify as never,
    );
  });

  it('rejects schedule when no invitees selected at controller validation layer', async () => {
    await expect(
      service.scheduleMeeting(
        {
          userId: 'u1',
          tenantId: 't1',
          roles: ['Faculty'],
          primaryRole: 'Faculty',
        },
        {
          title: 'Review',
          venue: 'Room 101',
          meeting_at: '2099-06-20T10:00:00.000Z',
          invitee_user_ids: [],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('blocks invitees outside scheduling scope', async () => {
    jest.spyOn(service, 'listEligibleParticipants').mockResolvedValue({
      direction: 'schedule',
      participants: [
        {
          user_id: 'allowed',
          name: 'Allowed',
          email: 'a@x.com',
          role_name: 'Faculty',
          relation: 'department_peer',
        },
      ],
    });

    await expect(
      service.scheduleMeeting(
        { userId: 'u1', tenantId: 't1', roles: ['HOD'], primaryRole: 'HOD' },
        {
          title: 'Review',
          venue: 'Room 101',
          meeting_at: '2099-06-20T10:00:00.000Z',
          invitee_user_ids: ['outside'],
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects meetings scheduled in the past', async () => {
    await expect(
      service.scheduleMeeting(
        {
          userId: 'u1',
          tenantId: 't1',
          roles: ['Faculty'],
          primaryRole: 'Faculty',
        },
        {
          title: 'Review',
          venue: 'Room 101',
          meeting_at: '2000-01-01T10:00:00.000Z',
          invitee_user_ids: ['u2'],
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
