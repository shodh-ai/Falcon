import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RedisService } from '../../core/redis/redis.service';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { NotificationService } from '../integrations/notification.service';
import {
  BookWorkspaceDto,
  MentorFeedbackDto,
  RequestMentorMeetingDto,
} from './dto/founder.dto';

const FOUNDER_STATUSES = ['L2_APPROVED', 'FUNDED'];
const MAX_WEEKLY_CONFERENCE_HOURS = 4;

@Injectable()
export class EcellFounderService {
  private readonly logger = new Logger(EcellFounderService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly redis: RedisService,
    private readonly notify: NotificationEmitterService,
    private readonly integrations: NotificationService,
  ) { }

  private tenant(tenantId?: string) {
    return tenantId ?? 'a0000000-0000-4000-8000-000000000001';
  }

  private mentorPortalLink(roleName: string) {
    const role = roleName.trim().toLowerCase();
    if (role === 'alumni') return '/alumni/mentorship';
    if (role === 'president' || role === 'chairman')
      return '/president/meetings';
    if (role === 'dean') return '/dean/meetings';
    return '/faculty/mentorship';
  }

  private async getFounderProject(tenantId: string, studentUserId: string) {
    const rows = await this.db.query(
      `SELECT p.*, u.name AS student_name
       FROM ecell_projects p
       JOIN users u ON u.user_id = p.student_user_id
       WHERE p.tenant_id = $1
         AND p.student_user_id = $2
         AND p.current_status = ANY($3)
       ORDER BY CASE p.current_status WHEN 'FUNDED' THEN 0 ELSE 1 END, p.updated_at DESC
       LIMIT 1`,
      [tenantId, studentUserId, FOUNDER_STATUSES],
    );
    if (!rows[0]) {
      throw new ForbiddenException(
        'Founder Mode unlocks after Level 2 approval or funding',
      );
    }
    return rows[0] as Record<string, unknown>;
  }

  async founderStatus(tenantId: string | undefined, studentUserId: string) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT project_id, startup_name, current_status, approved_funding_amount
       FROM ecell_projects
       WHERE tenant_id = $1 AND student_user_id = $2 AND current_status = ANY($3)
       ORDER BY CASE current_status WHEN 'FUNDED' THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 1`,
      [tid, studentUserId, FOUNDER_STATUSES],
    );
    return {
      unlocked: Boolean(rows[0]),
      project: rows[0] ?? null,
    };
  }

  async listWorkspaces(tenantId?: string) {
    return this.db.query(
      `SELECT workspace_id, name, capacity, amenities, is_active
       FROM ecell_workspaces
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY name ASC`,
      [this.tenant(tenantId)],
    );
  }

  async workspaceCalendar(
    tenantId: string | undefined,
    workspaceId: string,
    date: string,
  ) {
    const day = date.slice(0, 10);
    const rows = await this.db.query(
      `SELECT b.booking_id, b.start_time, b.end_time, b.purpose, b.status,
              p.startup_name, w.name AS workspace_name
       FROM ecell_workspace_bookings b
       JOIN ecell_projects p ON p.project_id = b.project_id
       JOIN ecell_workspaces w ON w.workspace_id = b.workspace_id
       WHERE b.tenant_id = $1
         AND b.workspace_id = $2
         AND b.status = 'CONFIRMED'
         AND b.start_time >= $3::date
         AND b.start_time < ($3::date + INTERVAL '1 day')
       ORDER BY b.start_time ASC`,
      [this.tenant(tenantId), workspaceId, day],
    );
    return rows;
  }

  async listMyBookings(tenantId: string | undefined, studentUserId: string) {
    const project = await this.getFounderProject(
      this.tenant(tenantId),
      studentUserId,
    );
    return this.db.query(
      `SELECT b.*, w.name AS workspace_name
       FROM ecell_workspace_bookings b
       JOIN ecell_workspaces w ON w.workspace_id = b.workspace_id
       WHERE b.project_id = $1 AND b.status = 'CONFIRMED'
       ORDER BY b.start_time DESC
       LIMIT 30`,
      [project.project_id],
    );
  }

  async bookWorkspace(
    tenantId: string | undefined,
    studentUserId: string,
    dto: BookWorkspaceDto,
  ) {
    const tid = this.tenant(tenantId);
    const project = await this.getFounderProject(tid, studentUserId);
    const start = new Date(dto.start_time);
    const end = new Date(dto.end_time);
    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime()) ||
      end <= start
    ) {
      throw new BadRequestException('Invalid booking time range');
    }
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);
    if (durationHours <= 0 || durationHours > 4) {
      throw new BadRequestException(
        'Each booking must be between 1 minute and 4 hours',
      );
    }

    const workspaceRows = await this.db.query(
      `SELECT * FROM ecell_workspaces
       WHERE workspace_id = $1 AND tenant_id = $2 AND is_active = true`,
      [dto.workspace_id, tid],
    );
    if (!workspaceRows[0]) throw new NotFoundException('Workspace not found');

    const weekStart = new Date(start);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const weekly = await this.db.query(
      `SELECT COALESCE(SUM(EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0), 0) AS hours
       FROM ecell_workspace_bookings
       WHERE project_id = $1
         AND status = 'CONFIRMED'
         AND start_time >= $2
         AND start_time < $3`,
      [project.project_id, weekStart.toISOString(), weekEnd.toISOString()],
    );
    const usedHours = Number(weekly[0]?.hours ?? 0);
    if (usedHours + durationHours > MAX_WEEKLY_CONFERENCE_HOURS) {
      throw new BadRequestException(
        `Weekly conference room limit is ${MAX_WEEKLY_CONFERENCE_HOURS} hours (used ${usedHours.toFixed(1)}h)`,
      );
    }

    const slotKey = start.toISOString();
    const lockOwner = randomUUID();
    const locked = await this.redis.acquireWorkspaceSlotLock(
      dto.workspace_id,
      slotKey,
      lockOwner,
    );
    if (!locked) {
      throw new BadRequestException(
        'This time slot is being booked by another startup — try again',
      );
    }

    try {
      const overlap = await this.db.query(
        `SELECT booking_id FROM ecell_workspace_bookings
         WHERE workspace_id = $1
           AND status = 'CONFIRMED'
           AND start_time < $3
           AND end_time > $2
         LIMIT 1`,
        [dto.workspace_id, start.toISOString(), end.toISOString()],
      );
      if (overlap[0]) {
        throw new BadRequestException(
          'This room is already booked for the selected time',
        );
      }

      const rows = await this.db.query(
        `INSERT INTO ecell_workspace_bookings (
           tenant_id, workspace_id, project_id, booked_by_user_id,
           start_time, end_time, purpose, status
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'CONFIRMED')
         RETURNING *`,
        [
          tid,
          dto.workspace_id,
          project.project_id,
          studentUserId,
          start.toISOString(),
          end.toISOString(),
          dto.purpose ?? null,
        ],
      );
      return rows[0];
    } finally {
      await this.redis.releaseWorkspaceSlotLock(
        dto.workspace_id,
        slotKey,
        lockOwner,
      );
    }
  }

  async listMentors(tenantId?: string) {
    const tid = this.tenant(tenantId);
    const faculty = await this.db.query(
      `SELECT u.user_id, u.name, r.role_name,
              d.dept_name,
              'Faculty' AS mentor_type,
              COALESCE(u.phone, 'Campus mentor') AS expertise_label
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       LEFT JOIN departments d ON d.dept_id = u.dept_id
       WHERE u.tenant_id = $1
         AND u.is_active = true
         AND r.role_name IN ('Faculty', 'HOD', 'Dean', 'President')
       ORDER BY u.name ASC
       LIMIT 50`,
      [tid],
    );
    const alumni = await this.db.query(
      `SELECT u.user_id, ap.name, 'Alumni' AS role_name,
              ap.current_organization AS dept_name,
              'Alumni' AS mentor_type,
              COALESCE(ap.designation, 'Industry mentor') AS expertise_label
       FROM alumni_profiles ap
       JOIN users u ON u.user_id = COALESCE(ap.user_id, ap.student_user_id)
       WHERE ap.tenant_id = $1
         AND ap.opt_in_mentorship = true
         AND ap.verification_status IN ('VERIFIED', 'APPROVED')
       ORDER BY ap.name ASC
       LIMIT 50`,
      [tid],
    );
    return [...faculty, ...alumni];
  }

  async requestMentorMeeting(
    tenantId: string | undefined,
    studentUserId: string,
    dto: RequestMentorMeetingDto,
  ) {
    const tid = this.tenant(tenantId);
    const project = await this.getFounderProject(tid, studentUserId);
    const mentorRows = await this.db.query(
      `SELECT u.user_id, u.name, u.tenant_id, r.role_name
       FROM users u
       JOIN roles r ON r.role_id = u.role_id
       WHERE u.user_id = $1 AND u.tenant_id = $2 AND u.is_active = true`,
      [dto.mentor_user_id, tid],
    );
    if (!mentorRows[0]) throw new NotFoundException('Mentor not found');

    const rows = await this.db.query(
      `INSERT INTO ecell_mentor_meetings (
         tenant_id, project_id, requested_by_user_id, mentor_user_id,
         topic, requested_time, status
       ) VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')
       RETURNING *`,
      [
        tid,
        project.project_id,
        studentUserId,
        dto.mentor_user_id,
        dto.topic,
        dto.requested_time,
      ],
    );
    const meeting = rows[0];
    const mentor = mentorRows[0] as {
      user_id: string;
      name: string;
      role_name: string;
    };
    const startupName = String(project.startup_name);

    this.notify.ecellMentorMeetingRequested({
      tenantId: tid,
      userId: mentor.user_id,
      startupName,
      topic: dto.topic,
      requestedTime: dto.requested_time,
      actionLink: this.mentorPortalLink(mentor.role_name),
    });

    return meeting;
  }

  async listStudentMeetings(
    tenantId: string | undefined,
    studentUserId: string,
  ) {
    await this.getFounderProject(this.tenant(tenantId), studentUserId);
    return this.db.query(
      `SELECT m.*, u.name AS mentor_name, p.startup_name
       FROM ecell_mentor_meetings m
       JOIN users u ON u.user_id = m.mentor_user_id
       JOIN ecell_projects p ON p.project_id = m.project_id
       WHERE m.requested_by_user_id = $1 AND m.tenant_id = $2
       ORDER BY m.created_at DESC
       LIMIT 30`,
      [studentUserId, this.tenant(tenantId)],
    );
  }

  async listMentorInbox(mentorUserId: string, tenantId?: string) {
    return this.db.query(
      `SELECT m.*, u.name AS founder_name, p.startup_name
       FROM ecell_mentor_meetings m
       JOIN users u ON u.user_id = m.requested_by_user_id
       JOIN ecell_projects p ON p.project_id = m.project_id
       WHERE m.mentor_user_id = $1 AND m.tenant_id = $2
         AND m.status IN ('PENDING', 'ACCEPTED')
       ORDER BY m.requested_time ASC`,
      [mentorUserId, this.tenant(tenantId)],
    );
  }

  async listMentorFeedbackPending(mentorUserId: string, tenantId?: string) {
    return this.db.query(
      `SELECT m.*, p.startup_name
       FROM ecell_mentor_meetings m
       JOIN ecell_projects p ON p.project_id = m.project_id
       WHERE m.mentor_user_id = $1
         AND m.tenant_id = $2
         AND m.status = 'COMPLETED'
         AND m.mentor_feedback IS NULL
         AND m.feedback_requested_at IS NOT NULL
       ORDER BY m.requested_time DESC`,
      [mentorUserId, this.tenant(tenantId)],
    );
  }

  async respondMentorMeeting(
    tenantId: string | undefined,
    mentorUserId: string,
    meetingId: string,
    accept: boolean,
    body: { meeting_link?: string; decline_reason?: string },
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `SELECT m.*, p.startup_name, mu.name AS mentor_name, r.role_name AS mentor_role
       FROM ecell_mentor_meetings m
       JOIN ecell_projects p ON p.project_id = m.project_id
       JOIN users mu ON mu.user_id = m.mentor_user_id
       JOIN roles r ON r.role_id = mu.role_id
       WHERE m.meeting_id = $1 AND m.tenant_id = $2`,
      [meetingId, tid],
    );
    if (!rows[0]) throw new NotFoundException('Meeting not found');
    const meeting = rows[0] as Record<string, unknown>;
    if (String(meeting.mentor_user_id) !== mentorUserId) {
      throw new ForbiddenException('Not assigned to this mentoring request');
    }
    if (String(meeting.status) !== 'PENDING') {
      throw new BadRequestException('Meeting already processed');
    }

    if (accept) {
      const link = body.meeting_link?.trim();
      if (!link || link.length < 3) {
        throw new BadRequestException(
          'Please provide a Google Meet link or cabin number',
        );
      }
      const updated = await this.db.query(
        `UPDATE ecell_mentor_meetings
         SET status = 'ACCEPTED', meeting_link = $3, updated_at = NOW()
         WHERE meeting_id = $1 AND tenant_id = $2
         RETURNING *`,
        [meetingId, tid, link],
      );
      this.notify.ecellMentorMeetingResponded({
        tenantId: tid,
        userId: String(meeting.requested_by_user_id),
        mentorName: String(meeting.mentor_name),
        accepted: true,
        requestedTime: String(meeting.requested_time),
        meetingLink: link,
        actionLink: '/student/e-cell',
      });
      await this.pushStudentWhatsApp(
        String(meeting.requested_by_user_id),
        `Your meeting with ${String(meeting.mentor_name)} is confirmed for ${new Date(String(meeting.requested_time)).toLocaleString()}! ${link}`,
      );
      return updated[0];
    }

    const reason = body.decline_reason?.trim();
    if (!reason || reason.length < 3) {
      throw new BadRequestException('Decline reason is required');
    }
    const updated = await this.db.query(
      `UPDATE ecell_mentor_meetings
       SET status = 'DECLINED', decline_reason = $3, updated_at = NOW()
       WHERE meeting_id = $1 AND tenant_id = $2
       RETURNING *`,
      [meetingId, tid, reason],
    );
    this.notify.ecellMentorMeetingResponded({
      tenantId: tid,
      userId: String(meeting.requested_by_user_id),
      mentorName: String(meeting.mentor_name),
      accepted: false,
      requestedTime: String(meeting.requested_time),
      declineReason: reason,
      actionLink: '/student/e-cell',
    });
    return updated[0];
  }

  async submitMentorFeedback(
    tenantId: string | undefined,
    mentorUserId: string,
    meetingId: string,
    dto: MentorFeedbackDto,
  ) {
    const tid = this.tenant(tenantId);
    const rows = await this.db.query(
      `UPDATE ecell_mentor_meetings
       SET mentor_feedback = $4, updated_at = NOW()
       WHERE meeting_id = $1 AND tenant_id = $2 AND mentor_user_id = $3
         AND status = 'COMPLETED' AND mentor_feedback IS NULL
       RETURNING *`,
      [meetingId, tid, mentorUserId, dto.mentor_feedback.trim()],
    );
    if (!rows[0])
      throw new NotFoundException(
        'Feedback session not found or already submitted',
      );
    return rows[0];
  }

  async listAdminMentorProgress(tenantId?: string) {
    return this.db.query(
      `SELECT m.meeting_id, m.topic, m.requested_time, m.status, m.mentor_feedback,
              p.startup_name, mu.name AS mentor_name, su.name AS founder_name
       FROM ecell_mentor_meetings m
       JOIN ecell_projects p ON p.project_id = m.project_id
       JOIN users mu ON mu.user_id = m.mentor_user_id
       JOIN users su ON su.user_id = m.requested_by_user_id
       WHERE m.tenant_id = $1
       ORDER BY m.requested_time DESC
       LIMIT 100`,
      [this.tenant(tenantId)],
    );
  }

  @Interval(60_000)
  async completePastMeetingsAndRequestFeedback() {
    try {
      const tableExists = await this.db.query(
        `SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'ecell_mentor_meetings') AS exists`
      );
      if (!tableExists[0]?.exists) return;

      const due = await this.db.query(
        `UPDATE ecell_mentor_meetings
         SET status = 'COMPLETED',
             feedback_requested_at = NOW(),
             updated_at = NOW()
         WHERE status = 'ACCEPTED'
           AND requested_time < NOW() - INTERVAL '1 hour'
         RETURNING meeting_id, tenant_id, mentor_user_id, requested_by_user_id, topic,
                   (SELECT startup_name FROM ecell_projects p WHERE p.project_id = ecell_mentor_meetings.project_id) AS startup_name`,
      );
      for (const row of due as Array<Record<string, unknown>>) {
        const mentorRows = await this.db.query(
          `SELECT u.name, r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = $1`,
          [row.mentor_user_id],
        );
        const mentor = mentorRows[0] as { name: string; role_name: string } | undefined;
        this.notify.ecellMentorFeedbackRequested({
          tenantId: String(row.tenant_id),
          userId: String(row.mentor_user_id),
          startupName: String(row.startup_name ?? 'Startup'),
          topic: String(row.topic ?? 'Mentoring session'),
          actionLink: this.mentorPortalLink(mentor?.role_name ?? 'Faculty'),
        });
      }
      if (due.length) {
        this.logger.debug(`Marked ${due.length} e-cell mentor meeting(s) completed`);
      }
    } catch (e) {
      // Table might not exist yet, suppress error to prevent log pollution
      if (e.message?.includes('does not exist')) return;
      this.logger.error('Failed to complete past mentor meetings', e);
    }
  }

  private async pushStudentWhatsApp(studentUserId: string, message: string) {
    const rows = await this.db.query(
      `SELECT u.phone, sp.phone AS profile_phone
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.user_id
       WHERE u.user_id = $1`,
      [studentUserId],
    );
    const phone = (rows[0]?.phone ?? rows[0]?.profile_phone) as
      | string
      | undefined;
    if (phone) await this.integrations.queueWhatsApp(phone, message);
  }
}
