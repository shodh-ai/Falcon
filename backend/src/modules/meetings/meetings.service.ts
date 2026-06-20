import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { User } from '../../entities/user.entity';
import { PortalMeeting } from '../../entities/portal-meeting.entity';
import { PortalMeetingParticipant } from '../../entities/portal-meeting-participant.entity';
import { PortalMeetingMinutes } from '../../entities/portal-meeting-minutes.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import {
  PublishMeetingMinutesDto,
  RequestMeetingDto,
  RespondMeetingDto,
  ScheduleMeetingDto,
  UpdateMeetingAgendaDto,
} from './dto/meetings.dto';

type ActorContext = {
  userId: string;
  tenantId: string;
  roles: string[];
  primaryRole?: string;
};

type EligibleUser = {
  user_id: string;
  name: string;
  email: string;
  role_name: string;
  dept_name?: string | null;
  relation:
    | 'direct_report'
    | 'manager'
    | 'department_peer'
    | 'hod'
    | 'dean'
    | 'executive';
};

const EXECUTIVE_ROLES = new Set([
  'superadmin',
  'president',
  'chairman',
  'registrar',
  'hradmin',
  'hr',
]);

const STAFF_MEETING_ROLES = new Set([
  'faculty',
  'hod',
  'dean',
  'hr',
  'hradmin',
  'president',
  'chairman',
  'registrar',
  'accountant',
  'superadmin',
]);

@Injectable()
export class MeetingsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(PortalMeeting)
    private readonly meetings: Repository<PortalMeeting>,
    @InjectRepository(PortalMeetingParticipant)
    private readonly participants: Repository<PortalMeetingParticipant>,
    @InjectRepository(PortalMeetingMinutes)
    private readonly minutesRepo: Repository<PortalMeetingMinutes>,
    private readonly notify: NotificationEmitterService,
  ) {}

  private normalizeRoles(roles: string[]) {
    return roles.map((r) => r.trim().toLowerCase());
  }

  private isExecutive(roles: string[]) {
    return this.normalizeRoles(roles).some((r) => EXECUTIVE_ROLES.has(r));
  }

  private meetingActionLink(roleHint: string | undefined, meetingId: string) {
    const r = (roleHint ?? 'faculty').toLowerCase();
    if (r === 'hod') return `/hod/meetings?meeting=${meetingId}`;
    if (r === 'dean') return `/dean/meetings?meeting=${meetingId}`;
    if (r === 'president') return `/president/meetings?meeting=${meetingId}`;
    if (r === 'hr' || r === 'hradmin')
      return `/hr/meetings?meeting=${meetingId}`;
    return `/faculty/meetings?meeting=${meetingId}`;
  }

  private parseMeetingTime(meetingAt: string) {
    const starts = new Date(meetingAt);
    if (Number.isNaN(starts.getTime())) {
      throw new BadRequestException('Invalid meeting date/time');
    }
    if (starts.getTime() <= Date.now()) {
      throw new BadRequestException('Meeting time must be in the future');
    }
    const ends = new Date(starts.getTime() + 60 * 60 * 1000);
    return { starts, ends };
  }

  private dedupeParticipants(rows: EligibleUser[]) {
    const seen = new Set<string>();
    return rows.filter((row) => {
      if (seen.has(row.user_id)) return false;
      seen.add(row.user_id);
      return true;
    });
  }

  private async loadActor(userId: string, tenantId: string) {
    const user = await this.users.findOne({
      where: { user_id: userId, tenant_id: tenantId },
      relations: ['role', 'department'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  private async resolveHodDepartmentIds(hodUserId: string) {
    const directDepartments = await this.dataSource.query<
      Array<{ dept_id: number }>
    >(`SELECT dept_id FROM departments WHERE hod_user_id = $1`, [hodUserId]);
    const hod = await this.users.findOne({ where: { user_id: hodUserId } });
    return Array.from(
      new Set<number>([
        ...directDepartments.map((row) => Number(row.dept_id)),
        ...(hod?.dept_id ? [hod.dept_id] : []),
      ]),
    );
  }

  private async resolveDeanScope(deanUserId: string) {
    const schoolRows = await this.dataSource.query<
      Array<{ school_id: number }>
    >(
      `SELECT school_id FROM schools WHERE dean_user_id = $1 AND deleted_at IS NULL`,
      [deanUserId],
    );
    const schoolIds = schoolRows.map((row) => Number(row.school_id));
    let departmentIds: number[] = [];
    if (schoolIds.length) {
      const deptRows = await this.dataSource.query<Array<{ dept_id: number }>>(
        `SELECT DISTINCT dept_id
         FROM iam_programs
         WHERE school_id = ANY($1::int[]) AND dept_id IS NOT NULL AND deleted_at IS NULL`,
        [schoolIds],
      );
      departmentIds = deptRows.map((row) => Number(row.dept_id));
    }
    const dean = await this.users.findOne({ where: { user_id: deanUserId } });
    if (dean?.dept_id) {
      departmentIds = Array.from(new Set([...departmentIds, dean.dept_id]));
    }
    return { schoolIds, departmentIds };
  }

  private async listUsersInDepartments(
    tenantId: string,
    deptIds: number[],
    roleNames: string[],
    excludeUserId?: string,
  ) {
    if (!deptIds.length) return [];
    return this.dataSource.query<EligibleUser[]>(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
              'department_peer'::text AS relation
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.dept_id = ANY($2::int[])
         AND lower(r.role_name) = ANY($3::text[])
         AND ($4::uuid IS NULL OR u.user_id <> $4)
       ORDER BY u.name ASC`,
      [
        tenantId,
        deptIds,
        roleNames.map((r) => r.toLowerCase()),
        excludeUserId ?? null,
      ],
    );
  }

  private async listRolePeers(
    tenantId: string,
    actorUserId: string,
    roleName: string,
    deptIds?: number[],
  ) {
    if (deptIds?.length) {
      return this.listUsersInDepartments(
        tenantId,
        deptIds,
        [roleName],
        actorUserId,
      );
    }
    return this.dataSource.query<EligibleUser[]>(
      `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
              'department_peer'::text AS relation
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.user_id <> $2
         AND lower(r.role_name) = lower($3)
       ORDER BY u.name ASC`,
      [tenantId, actorUserId, roleName],
    );
  }

  private async listDeanPeers(tenantId: string, actorUserId: string) {
    return this.dataSource.query<EligibleUser[]>(
      `SELECT DISTINCT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
              'department_peer'::text AS relation
       FROM schools s
       JOIN users u ON u.user_id = s.dean_user_id
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND u.user_id <> $2
         AND s.deleted_at IS NULL
       ORDER BY u.name ASC`,
      [tenantId, actorUserId],
    );
  }

  private async syncMeetingStatus(meetingId: string) {
    const meeting = await this.meetings.findOne({
      where: { meeting_id: meetingId },
    });
    if (!meeting) return;

    const rows = await this.participants.find({
      where: { meeting_id: meetingId },
    });
    const invitees = rows.filter((p) => p.participant_role === 'INVITEE');
    const decisionTargets =
      meeting.meeting_mode === 'REQUESTED'
        ? rows.filter((p) => p.participant_role === 'ORGANIZER')
        : invitees;

    if (!decisionTargets.length) {
      meeting.status = 'CONFIRMED';
      await this.meetings.save(meeting);
      return;
    }

    if (decisionTargets.some((p) => p.rsvp_status === 'DECLINED')) {
      meeting.status = 'DECLINED';
    } else if (decisionTargets.every((p) => p.rsvp_status === 'ACCEPTED')) {
      meeting.status = 'CONFIRMED';
    } else {
      meeting.status = 'PENDING';
    }
    await this.meetings.save(meeting);
  }

  async listEligibleParticipants(
    actor: ActorContext,
    direction: 'schedule' | 'request',
  ) {
    const roles = this.normalizeRoles(actor.roles);
    const user = await this.loadActor(actor.userId, actor.tenantId);
    const primary = (
      actor.primaryRole ??
      user.role?.role_name ??
      roles[0] ??
      ''
    ).toLowerCase();

    if (this.isExecutive(roles)) {
      const rows = await this.dataSource.query<EligibleUser[]>(
        `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
                'executive'::text AS relation
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.tenant_id = $1
           AND u.is_active = true
           AND u.user_id <> $2
           AND lower(r.role_name) NOT IN ('student', 'applicant', 'parent', 'alumni')
         ORDER BY u.name ASC
         LIMIT 200`,
        [actor.tenantId, actor.userId],
      );
      return { direction, participants: rows };
    }

    if (primary === 'dean') {
      const scope = await this.resolveDeanScope(actor.userId);
      if (direction === 'schedule') {
        const faculty = await this.listUsersInDepartments(
          actor.tenantId,
          scope.departmentIds,
          ['Faculty'],
          actor.userId,
        );
        const hods = await this.dataSource.query<EligibleUser[]>(
          `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
                  'hod'::text AS relation
           FROM departments d
           JOIN users u ON u.user_id = d.hod_user_id
           JOIN roles r ON r.role_id = u.role_id
           WHERE d.dept_id = ANY($1::int[]) AND u.tenant_id = $2 AND u.is_active = true
             AND u.user_id <> $3
           ORDER BY u.name ASC`,
          [scope.departmentIds, actor.tenantId, actor.userId],
        );
        const deanPeers = await this.listDeanPeers(
          actor.tenantId,
          actor.userId,
        );
        return {
          direction,
          participants: this.dedupeParticipants([
            ...deanPeers,
            ...hods,
            ...faculty,
          ]),
        };
      }
      const deans = await this.dataSource.query<EligibleUser[]>(
        `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
                'executive'::text AS relation
         FROM users u
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE u.tenant_id = $1 AND u.is_active = true
           AND lower(r.role_name) IN ('president', 'chairman', 'registrar', 'superadmin')
           AND u.user_id <> $2
         ORDER BY u.name ASC`,
        [actor.tenantId, actor.userId],
      );
      return { direction, participants: deans };
    }

    if (primary === 'hod') {
      const deptIds = await this.resolveHodDepartmentIds(actor.userId);
      if (direction === 'schedule') {
        const faculty = await this.listUsersInDepartments(
          actor.tenantId,
          deptIds,
          ['Faculty'],
          actor.userId,
        );
        const hodPeers = await this.listRolePeers(
          actor.tenantId,
          actor.userId,
          'HOD',
          deptIds,
        );
        return {
          direction,
          participants: this.dedupeParticipants([...hodPeers, ...faculty]),
        };
      }
      const deans = await this.dataSource.query<EligibleUser[]>(
        `SELECT DISTINCT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
                'dean'::text AS relation
         FROM schools s
         JOIN iam_programs p ON p.school_id = s.school_id AND p.deleted_at IS NULL
         JOIN users u ON u.user_id = s.dean_user_id
         JOIN roles r ON r.role_id = u.role_id
         LEFT JOIN departments d ON d.dept_id = u.dept_id
         WHERE p.dept_id = ANY($1::int[])
           AND u.tenant_id = $2
           AND u.is_active = true
           AND u.user_id <> $3
         ORDER BY u.name ASC`,
        [deptIds, actor.tenantId, actor.userId],
      );
      return { direction, participants: deans };
    }

    if (primary === 'faculty' || roles.includes('faculty')) {
      if (direction === 'schedule') {
        const deptIds = user.dept_id ? [user.dept_id] : [];
        const facultyPeers = await this.listRolePeers(
          actor.tenantId,
          actor.userId,
          'Faculty',
          deptIds.length ? deptIds : undefined,
        );
        return { direction, participants: facultyPeers };
      }
      const hodRows = await this.dataSource.query<EligibleUser[]>(
        `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
                'manager'::text AS relation
         FROM departments d
         JOIN users u ON u.user_id = d.hod_user_id
         JOIN roles r ON r.role_id = u.role_id
         WHERE d.dept_id = $3 AND u.tenant_id = $1 AND u.is_active = true AND u.user_id <> $2
         LIMIT 1`,
        [actor.tenantId, actor.userId, user.dept_id],
      );
      if (!hodRows.length && user.reporting_officer_id) {
        const manager = await this.dataSource.query<EligibleUser[]>(
          `SELECT u.user_id, u.name, u.official_email AS email, r.role_name, d.dept_name,
                  'manager'::text AS relation
           FROM users u
           JOIN roles r ON r.role_id = u.role_id
           LEFT JOIN departments d ON d.dept_id = u.dept_id
           WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true`,
          [user.reporting_officer_id, actor.tenantId],
        );
        return { direction, participants: manager };
      }
      return { direction, participants: hodRows };
    }

    return { direction, participants: [] as EligibleUser[] };
  }

  private async assertCanInvite(actor: ActorContext, inviteeIds: string[]) {
    const eligible = await this.listEligibleParticipants(actor, 'schedule');
    const allowed = new Set(eligible.participants.map((p) => p.user_id));
    for (const id of inviteeIds) {
      if (!allowed.has(id)) {
        throw new ForbiddenException(
          'One or more invitees are outside your scheduling scope',
        );
      }
    }
  }

  private async assertCanRequest(actor: ActorContext, recipientId: string) {
    const eligible = await this.listEligibleParticipants(actor, 'request');
    if (!eligible.participants.some((p) => p.user_id === recipientId)) {
      throw new ForbiddenException(
        'You cannot request a meeting with this person',
      );
    }
  }

  private async formatMeetingRow(meetingId: string) {
    const rows = await this.dataSource.query(
      `SELECT m.*,
              org.name AS organizer_name,
              req.name AS requester_name,
              COALESCE(
                json_agg(
                  json_build_object(
                    'participant_id', p.participant_id,
                    'user_id', p.user_id,
                    'name', pu.name,
                    'email', pu.official_email,
                    'participant_role', p.participant_role,
                    'rsvp_status', p.rsvp_status,
                    'response_note', p.response_note
                  )
                  ORDER BY p.participant_role DESC, pu.name ASC
                ) FILTER (WHERE p.participant_id IS NOT NULL),
                '[]'::json
              ) AS participants,
              CASE WHEN mins.minutes_id IS NULL THEN NULL ELSE json_build_object(
                'minutes_id', mins.minutes_id,
                'notes', mins.notes,
                'decisions', mins.decisions,
                'action_items', mins.action_items,
                'published_at', mins.published_at
              ) END AS minutes
       FROM portal_meetings m
       JOIN users org ON org.user_id = m.organizer_user_id
       JOIN users req ON req.user_id = m.requester_user_id
       LEFT JOIN portal_meeting_participants p ON p.meeting_id = m.meeting_id
       LEFT JOIN users pu ON pu.user_id = p.user_id
       LEFT JOIN portal_meeting_minutes mins ON mins.meeting_id = m.meeting_id
       WHERE m.meeting_id = $1
       GROUP BY m.meeting_id, org.name, req.name, mins.minutes_id, mins.notes, mins.decisions, mins.action_items, mins.published_at`,
      [meetingId],
    );
    return rows[0] ?? null;
  }

  async listMeetings(actor: ActorContext) {
    const rows = await this.dataSource.query<Array<{ meeting_id: string }>>(
      `SELECT m.meeting_id
       FROM portal_meetings m
       LEFT JOIN portal_meeting_participants p ON p.meeting_id = m.meeting_id
       WHERE m.tenant_id = $1
         AND (m.organizer_user_id = $2 OR m.requester_user_id = $2 OR p.user_id = $2)
       GROUP BY m.meeting_id, m.starts_at
       ORDER BY m.starts_at DESC`,
      [actor.tenantId, actor.userId],
    );
    const details: Record<string, unknown>[] = [];
    for (const row of rows) {
      const meeting = await this.formatMeetingRow(row.meeting_id);
      if (meeting) details.push(meeting);
    }
    return details;
  }

  async getMeeting(actor: ActorContext, meetingId: string) {
    const meeting = await this.formatMeetingRow(meetingId);
    if (!meeting || meeting.tenant_id !== actor.tenantId) {
      throw new NotFoundException('Meeting not found');
    }
    const participantIds = (
      meeting.participants as Array<{ user_id: string }>
    ).map((p) => p.user_id);
    const allowed =
      meeting.organizer_user_id === actor.userId ||
      meeting.requester_user_id === actor.userId ||
      participantIds.includes(actor.userId) ||
      this.isExecutive(actor.roles);
    if (!allowed)
      throw new ForbiddenException('Not authorized to view this meeting');
    return meeting;
  }

  async scheduleMeeting(actor: ActorContext, dto: ScheduleMeetingDto) {
    if (!dto.invitee_user_ids.length) {
      throw new BadRequestException('Select at least one invitee');
    }
    const { starts, ends } = this.parseMeetingTime(dto.meeting_at);
    await this.assertCanInvite(actor, dto.invitee_user_ids);
    const actorUser = await this.loadActor(actor.userId, actor.tenantId);

    const meeting = await this.meetings.save(
      this.meetings.create({
        tenant_id: actor.tenantId,
        organizer_user_id: actor.userId,
        requester_user_id: actor.userId,
        title: dto.title.trim(),
        venue: dto.venue.trim(),
        starts_at: starts,
        ends_at: ends,
        agenda: dto.agenda?.trim() ?? null,
        meeting_mode: 'SCHEDULED',
        status: 'PENDING',
      }),
    );

    await this.participants.save(
      this.participants.create({
        meeting_id: meeting.meeting_id,
        user_id: actor.userId,
        participant_role: 'ORGANIZER',
        rsvp_status: 'PENDING',
      }),
    );

    for (const userId of dto.invitee_user_ids) {
      if (userId === actor.userId) continue;
      await this.participants.save(
        this.participants.create({
          meeting_id: meeting.meeting_id,
          user_id: userId,
          participant_role: 'INVITEE',
          rsvp_status: 'PENDING',
        }),
      );
      const invitee = await this.users.findOne({ where: { user_id: userId } });
      this.notify.meetingInvited({
        tenantId: actor.tenantId,
        userId,
        meetingId: meeting.meeting_id,
        organizerName: actorUser.name,
        title: meeting.title,
        startsAt: starts.toISOString(),
        actionLink: this.meetingActionLink(
          invitee?.role?.role_name,
          meeting.meeting_id,
        ),
      });
    }

    return this.formatMeetingRow(meeting.meeting_id);
  }

  async requestMeeting(actor: ActorContext, dto: RequestMeetingDto) {
    const { starts, ends } = this.parseMeetingTime(dto.meeting_at);
    await this.assertCanRequest(actor, dto.recipient_user_id);
    const actorUser = await this.loadActor(actor.userId, actor.tenantId);
    const recipient = await this.loadActor(
      dto.recipient_user_id,
      actor.tenantId,
    );

    const meeting = await this.meetings.save(
      this.meetings.create({
        tenant_id: actor.tenantId,
        organizer_user_id: dto.recipient_user_id,
        requester_user_id: actor.userId,
        title: dto.title.trim(),
        venue: dto.venue.trim(),
        starts_at: starts,
        ends_at: ends,
        agenda: dto.agenda?.trim() ?? null,
        meeting_mode: 'REQUESTED',
        status: 'PENDING',
      }),
    );

    await this.participants.save([
      this.participants.create({
        meeting_id: meeting.meeting_id,
        user_id: actor.userId,
        participant_role: 'ATTENDEE',
        rsvp_status: 'PENDING',
      }),
      this.participants.create({
        meeting_id: meeting.meeting_id,
        user_id: dto.recipient_user_id,
        participant_role: 'ORGANIZER',
        rsvp_status: 'PENDING',
      }),
    ]);

    this.notify.meetingRequestedUpward({
      tenantId: actor.tenantId,
      userId: dto.recipient_user_id,
      meetingId: meeting.meeting_id,
      requesterName: actorUser.name,
      title: meeting.title,
      startsAt: starts.toISOString(),
      actionLink: this.meetingActionLink(
        recipient.role?.role_name,
        meeting.meeting_id,
      ),
    });

    return this.formatMeetingRow(meeting.meeting_id);
  }

  async respondMeeting(
    actor: ActorContext,
    meetingId: string,
    dto: RespondMeetingDto,
  ) {
    const meeting = await this.meetings.findOne({
      where: { meeting_id: meetingId, tenant_id: actor.tenantId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');

    const participant = await this.participants.findOne({
      where: { meeting_id: meetingId, user_id: actor.userId },
    });
    if (!participant)
      throw new ForbiddenException('You are not a participant in this meeting');

    participant.rsvp_status = dto.response;
    participant.response_note = dto.note?.trim() ?? null;
    await this.participants.save(participant);
    await this.syncMeetingStatus(meetingId);

    const refreshed = await this.meetings.findOne({
      where: { meeting_id: meetingId },
    });
    if (!refreshed) throw new NotFoundException('Meeting not found');

    const actorUser = await this.loadActor(actor.userId, actor.tenantId);
    const notifyUserId =
      refreshed.meeting_mode === 'REQUESTED' &&
      refreshed.requester_user_id !== actor.userId
        ? refreshed.requester_user_id
        : refreshed.organizer_user_id;

    if (notifyUserId !== actor.userId) {
      const recipient = await this.users.findOne({
        where: { user_id: notifyUserId },
        relations: ['role'],
      });
      this.notify.portalMeetingResponded({
        tenantId: actor.tenantId,
        userId: notifyUserId,
        meetingId: refreshed.meeting_id,
        responderName: actorUser.name,
        title: refreshed.title,
        status: dto.response === 'ACCEPTED' ? 'ACCEPTED' : 'DECLINED',
        startsAt: refreshed.starts_at.toISOString(),
        remarks: dto.note,
        actionLink: this.meetingActionLink(
          recipient?.role?.role_name,
          refreshed.meeting_id,
        ),
      });
    }

    return this.formatMeetingRow(meetingId);
  }

  async updateAgenda(
    actor: ActorContext,
    meetingId: string,
    dto: UpdateMeetingAgendaDto,
  ) {
    const meeting = await this.meetings.findOne({
      where: { meeting_id: meetingId, tenant_id: actor.tenantId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (
      meeting.organizer_user_id !== actor.userId &&
      !this.isExecutive(actor.roles)
    ) {
      throw new ForbiddenException('Only the organizer can update the agenda');
    }
    meeting.agenda = dto.agenda.trim();
    await this.meetings.save(meeting);

    const rows = await this.participants.find({
      where: { meeting_id: meetingId },
    });
    for (const p of rows) {
      if (p.user_id === actor.userId) continue;
      const user = await this.users.findOne({
        where: { user_id: p.user_id },
        relations: ['role'],
      });
      this.notify.meetingAgendaUpdated({
        tenantId: actor.tenantId,
        userId: p.user_id,
        meetingId,
        title: meeting.title,
        actionLink: this.meetingActionLink(user?.role?.role_name, meetingId),
      });
    }
    return this.formatMeetingRow(meetingId);
  }

  async publishMinutes(
    actor: ActorContext,
    meetingId: string,
    dto: PublishMeetingMinutesDto,
  ) {
    const meeting = await this.meetings.findOne({
      where: { meeting_id: meetingId, tenant_id: actor.tenantId },
    });
    if (!meeting) throw new NotFoundException('Meeting not found');
    if (
      meeting.organizer_user_id !== actor.userId &&
      !this.isExecutive(actor.roles)
    ) {
      throw new ForbiddenException('Only the organizer can publish minutes');
    }

    let minutes = await this.minutesRepo.findOne({
      where: { meeting_id: meetingId },
    });
    if (!minutes) {
      minutes = this.minutesRepo.create({
        meeting_id: meetingId,
        notes: dto.notes.trim(),
        decisions: dto.decisions?.trim() ?? null,
        action_items: dto.action_items?.trim() ?? null,
        created_by: actor.userId,
        updated_by: actor.userId,
        published_at: new Date(),
      });
    } else {
      minutes.notes = dto.notes.trim();
      minutes.decisions = dto.decisions?.trim() ?? null;
      minutes.action_items = dto.action_items?.trim() ?? null;
      minutes.updated_by = actor.userId;
      minutes.published_at = new Date();
    }
    await this.minutesRepo.save(minutes);
    meeting.status = 'COMPLETED';
    await this.meetings.save(meeting);

    const rows = await this.participants.find({
      where: { meeting_id: meetingId },
    });
    for (const p of rows) {
      if (p.user_id === actor.userId) continue;
      const user = await this.users.findOne({
        where: { user_id: p.user_id },
        relations: ['role'],
      });
      this.notify.meetingMinutesPublished({
        tenantId: actor.tenantId,
        userId: p.user_id,
        meetingId,
        title: meeting.title,
        actionLink: this.meetingActionLink(user?.role?.role_name, meetingId),
      });
    }
    return this.formatMeetingRow(meetingId);
  }
}
