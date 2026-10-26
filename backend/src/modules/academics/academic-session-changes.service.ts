import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';

type MoveType = 'RESCHEDULE' | 'SWAP' | 'RESHUFFLE';
type MoveInput = {
  timetable_id: string;
  source_date: string;
  target_date: string;
  target_start_time: string;
  target_end_time: string;
  target_room?: string | null;
};
type Slot = {
  timetable_id: string;
  course_id: string;
  faculty_user_id: string;
  faculty_dept_id: number | null;
  day_of_week: number;
  start_time: string;
  end_time: string;
  room: string | null;
  section: string | null;
};
type Leg = MoveInput & {
  course_id: string;
  original_faculty_id: string;
  faculty_dept_id: number | null;
  section: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const campusToday = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((row) => row.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
};

@Injectable()
export class AcademicSessionChangesService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly notify: NotificationEmitterService,
  ) {}

  private date(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') ||
        Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
        new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
      throw new BadRequestException('Dates must use a valid YYYY-MM-DD value');
    }
    return value;
  }

  private time(value: string): string {
    if (!TIME.test(value || '')) throw new BadRequestException('Times must use 24-hour HH:mm format');
    return value.length === 5 ? `${value}:00` : value;
  }

  private async lockDates(manager: EntityManager, tenantId: string, dates: string[]) {
    for (const date of [...new Set(dates)].sort()) {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))',
        [`class-move:${tenantId}:${date}`]);
    }
  }

  private async actorScope(manager: EntityManager, tenantId: string, actorId: string) {
    const [actor] = await manager.query<Array<{ dept_id: number | null; role_name: string }>>(
      `SELECT u.dept_id,r.role_name FROM users u JOIN roles r ON r.role_id=u.role_id
       WHERE u.tenant_id=$1 AND u.user_id=$2 AND u.is_active=true`,
      [tenantId, actorId],
    );
    if (!actor) throw new ForbiddenException('Active faculty account required');
    return actor;
  }

  private async assertDeanDepartments(manager: EntityManager, tenantId: string,
    deanId: string, departmentIds: Array<number | null>) {
    const expected = [...new Set(departmentIds.filter((id): id is number => id != null).map(Number))];
    if (departmentIds.some((id) => id == null)) {
      throw new ForbiddenException('All classes must belong to the Dean’s school');
    }
    const rows = await manager.query<Array<{ dept_id: number }>>(
      `SELECT d.dept_id FROM departments d JOIN schools s ON s.school_id=d.school_id
       WHERE d.tenant_id=$1 AND d.dept_id=ANY($2::int[]) AND s.dean_user_id=$3::uuid`,
      [tenantId,expected,deanId],
    );
    if (rows.length !== expected.length) {
      throw new ForbiddenException('Dean can manage only classes in their school');
    }
  }

  private async loadSlot(manager: EntityManager, tenantId: string, input: MoveInput): Promise<Leg> {
    if (!UUID.test(input.timetable_id || '')) throw new BadRequestException('Choose a valid timetable slot');
    const sourceDate = this.date(input.source_date);
    const targetDate = this.date(input.target_date);
    const today = campusToday();
    if (sourceDate < today || targetDate < today) {
      throw new BadRequestException('Past class sessions cannot be swapped');
    }
    const start = this.time(input.target_start_time);
    const end = this.time(input.target_end_time);
    if (start >= end) throw new BadRequestException('New class end time must be after start time');
    const [slot] = await manager.query<Array<Slot>>(
      `SELECT t.timetable_id,t.course_id,t.faculty_user_id,u.dept_id AS faculty_dept_id,
              t.day_of_week,t.start_time,t.end_time,t.room,t.section
       FROM academic_timetables t JOIN users u ON u.user_id=t.faculty_user_id AND u.tenant_id=t.tenant_id
       WHERE t.tenant_id=$1 AND t.timetable_id=$2::uuid AND t.deleted_at IS NULL
         AND (t.valid_from IS NULL OR t.valid_from<=$3::date)
         AND (t.valid_to IS NULL OR t.valid_to>=$3::date)`,
      [tenantId, input.timetable_id, sourceDate],
    );
    if (!slot) throw new NotFoundException('Original class slot is not active on this date');
    const seconds = (time: string) => time.split(':').reduce((total, segment) => total * 60 + Number(segment), 0);
    if (seconds(end) - seconds(start) !== seconds(slot.end_time) - seconds(slot.start_time)) {
      throw new BadRequestException('A moved class must retain its scheduled duration');
    }
    if (sourceDate === targetDate && start === slot.start_time && end === slot.end_time &&
        (input.target_room?.trim() || slot.room) === slot.room) {
      throw new BadRequestException('Choose a new time, date or room for this class');
    }
    if ((new Date(`${sourceDate}T00:00:00Z`).getUTCDay() || 7) !== Number(slot.day_of_week)) {
      throw new BadRequestException('Original date does not match the weekly class slot');
    }
    const existing = await manager.query(
      `SELECT 1 FROM academic_class_moves WHERE tenant_id=$1 AND source_timetable_id=$2::uuid
         AND source_date=$3::date AND status IN ('PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
      [tenantId, input.timetable_id, sourceDate],
    );
    if (existing.length) throw new BadRequestException('This dated class already has a pending or approved move');
    const covered = await manager.query(
      `SELECT 1 FROM academic_proxy_requests WHERE tenant_id=$1 AND timetable_id=$2::uuid
         AND date_of_proxy=$3::date AND status IN
         ('PENDING_SUBSTITUTE_ACCEPTANCE','PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
      [tenantId, input.timetable_id, sourceDate],
    );
    if (covered.length) throw new BadRequestException('Resolve the substitute arrangement before moving this class');
    const attendance = await manager.query(
      `SELECT 1 FROM course_attendance_logs WHERE tenant_id=$1 AND timetable_id=$2::uuid
         AND date=$3::date LIMIT 1`,
      [tenantId, input.timetable_id, sourceDate],
    );
    if (attendance.length) throw new BadRequestException('Attendance is already recorded for this class');
    return {
      ...input,
      source_date: sourceDate,
      target_date: targetDate,
      target_start_time: start,
      target_end_time: end,
      target_room: input.target_room?.trim() || slot.room,
      course_id: slot.course_id,
      original_faculty_id: slot.faculty_user_id,
      faculty_dept_id: slot.faculty_dept_id,
      section: slot.section,
    };
  }

  private async studentIds(manager: EntityManager, tenantId: string, courseId: string, section: string | null) {
    if (section?.toUpperCase().startsWith('BATCH-')) {
      const members = await manager.query<Array<{ student_user_id: string }>>(
        `SELECT m.student_user_id FROM academic_practical_batches b
         JOIN academic_practical_batch_members m ON m.batch_id=b.batch_id
           AND m.tenant_id=b.tenant_id AND m.course_id=b.course_id AND m.removed_at IS NULL
         WHERE b.tenant_id=$1 AND b.course_id=$2
           AND UPPER(BTRIM(b.section_code))=UPPER(BTRIM($3::text))`,
        [tenantId,courseId,section],
      );
      return new Set(members.map((row) => row.student_user_id));
    }
    const rows = await manager.query<Array<{ student_user_id: string }>>(
      `SELECT e.student_user_id FROM student_course_enrollments e
       WHERE e.tenant_id=$1 AND e.course_id=$2 AND e.status='ENROLLED'
         AND ($3::text IS NULL OR UPPER(BTRIM(e.section_code))=UPPER(BTRIM($3::text)))`,
      [tenantId, courseId, section?.trim() || null],
    );
    return new Set(rows.map((row) => row.student_user_id));
  }

  private async assertNoCollisions(manager: EntityManager, tenantId: string, legs: Leg[]) {
    const targetDates = [...new Set(legs.map((leg) => leg.target_date))];
    const recurring = await manager.query<Array<{
      timetable_id: string; course_id: string; faculty_user_id: string; date: string;
      start_time: string; end_time: string; room: string | null; section: string | null;
    }>>(
      `SELECT t.timetable_id,t.course_id,
              COALESCE(p.proxy_faculty_id,t.faculty_user_id) AS faculty_user_id,
              d.day::text AS date,
              t.start_time,t.end_time,t.room,t.section
       FROM unnest($2::date[]) AS d(day)
       JOIN academic_timetables t ON t.tenant_id=$1
         AND t.day_of_week=EXTRACT(ISODOW FROM d.day)::int AND t.deleted_at IS NULL
         AND (t.valid_from IS NULL OR t.valid_from<=d.day)
         AND (t.valid_to IS NULL OR t.valid_to>=d.day)
       LEFT JOIN academic_proxy_requests p ON p.tenant_id=t.tenant_id
         AND p.timetable_id=t.timetable_id AND p.date_of_proxy=d.day
         AND p.status='APPROVED'
       WHERE NOT EXISTS (SELECT 1 FROM academic_class_moves m
         WHERE m.tenant_id=$1 AND m.source_timetable_id=t.timetable_id
           AND m.source_date=d.day AND m.status='APPROVED')`,
      [tenantId, targetDates],
    );
    const moved = await manager.query<Array<{
      timetable_id: string; course_id: string; faculty_user_id: string; date: string;
      start_time: string; end_time: string; room: string | null; section: string | null;
    }>>(
      `SELECT m.source_timetable_id AS timetable_id,m.course_id,
              COALESCE(p.proxy_faculty_id,m.original_faculty_id) AS faculty_user_id,
              m.target_date::text AS date,
              m.target_start_time AS start_time,m.target_end_time AS end_time,
              m.target_room AS room,t.section
       FROM academic_class_moves m
       JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
       LEFT JOIN academic_proxy_requests p ON p.tenant_id=m.tenant_id
         AND p.timetable_id=m.source_timetable_id AND p.date_of_proxy=m.target_date
         AND p.status='APPROVED'
       WHERE m.tenant_id=$1 AND m.status='APPROVED' AND m.target_date=ANY($2::date[])`,
      [tenantId, targetDates],
    );
    const excluded = new Set(legs.map((leg) => `${leg.timetable_id}|${leg.source_date}`));
    const existing = [...recurring, ...moved].filter((row) => !excluded.has(`${row.timetable_id}|${row.date}`));
    const targets = legs.map((leg) => ({
      timetable_id: leg.timetable_id, course_id: leg.course_id,
      faculty_user_id: leg.original_faculty_id, date: leg.target_date,
      start_time: leg.target_start_time, end_time: leg.target_end_time,
      room: leg.target_room ?? null, section: leg.section,
    }));
    const rosterCache = new Map<string, Set<string>>();
    const roster = async (row: typeof targets[number]) => {
      const key = `${row.course_id}|${row.section ?? ''}`;
      if (!rosterCache.has(key)) rosterCache.set(key,
        await this.studentIds(manager, tenantId, row.course_id, row.section));
      return rosterCache.get(key)!;
    };
    for (const target of targets) {
      const ownStudents = await roster(target);
      if (!ownStudents.size) throw new BadRequestException('Cannot verify a clash-free move until the class roster is mapped');
      const onLeave = await manager.query(
        `SELECT 1 FROM staff_leave_requests WHERE tenant_id=$1 AND staff_user_id=$2
           AND status IN ('HOD_APPROVED','HR_APPROVED')
           AND start_date<=$3::date AND end_date>=$3::date LIMIT 1`,
        [tenantId,target.faculty_user_id,target.date],
      );
      if (onLeave.length) throw new BadRequestException('Faculty is on approved leave at the proposed date');
      for (const other of [...existing, ...targets.filter((row) => row !== target)]) {
        if (target.date !== other.date || target.start_time >= other.end_time || target.end_time <= other.start_time) continue;
        if (target.faculty_user_id === other.faculty_user_id) {
          throw new BadRequestException('Faculty timetable collision at the proposed time');
        }
        if (target.room && other.room && target.room.trim().toUpperCase() === other.room.trim().toUpperCase()) {
          throw new BadRequestException('Room is already occupied at the proposed time');
        }
        const otherStudents = await roster(other);
        if (!otherStudents.size) throw new BadRequestException('Cannot prove student groups are disjoint at the proposed time');
        if ([...ownStudents].some((id) => otherStudents.has(id))) {
          throw new BadRequestException('Student group has another class at the proposed time');
        }
      }
    }
  }

  async propose(actorId: string, tenantId: string, moveType: MoveType, inputs: MoveInput[], reason: string) {
    // Historical moves remain readable, but new one-way reschedules and
    // multi-class reshuffles are disabled at the API as well as in the UI.
    if (moveType !== 'SWAP') {
      throw new BadRequestException('Only an exact two-class swap is available');
    }
    if (!Array.isArray(inputs) || inputs.length !== 2 || !reason?.trim()) {
      throw new BadRequestException('Choose two classes to exchange and provide a reason');
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const actor = await this.actorScope(manager, tenantId, actorId);
      const allDates = inputs.flatMap((input) => [this.date(input.source_date), this.date(input.target_date)]);
      await this.lockDates(manager, tenantId, allDates);
      const legs: Leg[] = [];
      for (const input of inputs) legs.push(await this.loadSlot(manager, tenantId, input));
      if (new Set(legs.map((leg) => `${leg.timetable_id}|${leg.source_date}`)).size !== legs.length) {
        throw new BadRequestException('A class may appear only once in a change group');
      }
      const isHod = ['HOD','Dean','SuperAdmin'].includes(actor.role_name);
      if (legs.some((leg) => leg.original_faculty_id !== actorId) && !isHod) {
        throw new ForbiddenException('Faculty can move only their own classes');
      }
      if (isHod && legs.some((leg) => Number(leg.faculty_dept_id) !== Number(actor.dept_id)) &&
          actor.role_name === 'HOD') {
        throw new ForbiddenException('HOD can move only classes in their department');
      }
      if (actor.role_name === 'Dean') {
        await this.assertDeanDepartments(manager, tenantId, actorId, legs.map((leg) => leg.faculty_dept_id));
      }
      if (moveType === 'SWAP') {
        const [a, b] = legs;
        const [first, second] = inputs;
        const [sourceA] = await manager.query<Array<Slot>>(
          `SELECT start_time,end_time,room FROM academic_timetables WHERE tenant_id=$1 AND timetable_id=$2::uuid`,
          [tenantId, first.timetable_id],
        );
        const [sourceB] = await manager.query<Array<Slot>>(
          `SELECT start_time,end_time,room FROM academic_timetables WHERE tenant_id=$1 AND timetable_id=$2::uuid`,
          [tenantId, second.timetable_id],
        );
        if (a.target_date !== b.source_date || b.target_date !== a.source_date ||
            a.target_start_time !== sourceB.start_time || b.target_start_time !== sourceA.start_time ||
            a.target_end_time !== sourceB.end_time || b.target_end_time !== sourceA.end_time ||
            (a.target_room ?? '') !== (sourceB.room ?? '') || (b.target_room ?? '') !== (sourceA.room ?? '')) {
          throw new BadRequestException('A swap must exchange the exact two dated class slots');
        }
      }
      await this.assertNoCollisions(manager, tenantId, legs);
      const groupId = randomUUID();
      for (const leg of legs) {
        await manager.query(
          `INSERT INTO academic_class_moves (
             change_group_id,tenant_id,source_timetable_id,course_id,original_faculty_id,
             source_date,target_date,target_start_time,target_end_time,target_room,
             move_type,status,reason,requested_by_user_id
           ) VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6::date,$7::date,$8::time,$9::time,$10,
             $11,'PENDING_HOD_APPROVAL',$12,$13::uuid)`,
          [groupId,tenantId,leg.timetable_id,leg.course_id,leg.original_faculty_id,
            leg.source_date,leg.target_date,leg.target_start_time,leg.target_end_time,
            leg.target_room,moveType,reason.trim(),actorId],
        );
      }
      return { change_group_id: groupId, status: 'PENDING_HOD_APPROVAL', legs: legs.length };
    });
    const hods = await this.dataSource.query<Array<{ hod_user_id: string }>>(
      `SELECT DISTINCT d.hod_user_id FROM academic_class_moves m
       JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
       JOIN departments d ON d.dept_id=u.dept_id AND d.tenant_id=u.tenant_id
       WHERE m.tenant_id=$1 AND m.change_group_id=$2::uuid AND d.hod_user_id IS NOT NULL`,
      [tenantId,result.change_group_id],
    );
    for (const hod of hods) this.notify.approvalRequired({
      tenantId, userId: hod.hod_user_id,
      title: 'Class timetable change awaits approval',
      message: `${moveType.toLowerCase()} request needs a clash-checked HOD decision.`,
      actionLink: '/hod/approvals/proxy', requestType: 'CLASS_TIMETABLE_CHANGE',
    });
    return result;
  }

  async listMy(actorId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT m.*,c.course_code,c.course_name
       FROM academic_class_moves m JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
       WHERE m.tenant_id=$1 AND (m.requested_by_user_id=$2 OR m.original_faculty_id=$2)
       ORDER BY m.created_at DESC LIMIT 200`,
      [tenantId,actorId],
    );
  }

  async listPendingForHod(hodId: string, tenantId: string) {
    const actor = await this.dataSource.transaction((manager) => this.actorScope(manager, tenantId, hodId));
    if (!['HOD','Dean','SuperAdmin'].includes(actor.role_name)) throw new ForbiddenException('HOD approval required');
    return this.dataSource.query(
      `SELECT m.change_group_id,m.move_type,m.reason,m.requested_by_user_id,
              MIN(m.created_at) AS created_at,COUNT(*)::int AS legs,
              jsonb_agg(jsonb_build_object('course_code',c.course_code,
                'source_date',m.source_date,'target_date',m.target_date,
                'target_start_time',m.target_start_time,'target_end_time',m.target_end_time,
                'target_room',m.target_room) ORDER BY m.source_date) AS sessions
       FROM academic_class_moves m
       JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
       JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
       LEFT JOIN departments d ON d.tenant_id=m.tenant_id AND d.dept_id=u.dept_id
       LEFT JOIN schools s ON s.school_id=d.school_id
       WHERE m.tenant_id=$1 AND m.status='PENDING_HOD_APPROVAL'
       GROUP BY m.change_group_id,m.move_type,m.reason,m.requested_by_user_id
       HAVING $3::boolean OR BOOL_AND(
         ($4::boolean AND s.dean_user_id=$5::uuid)
         OR (NOT $4::boolean AND u.dept_id=$2::int))
       ORDER BY MIN(m.created_at)`,
      [tenantId,actor.dept_id,actor.role_name === 'SuperAdmin',
        actor.role_name === 'Dean',hodId],
    );
  }

  async decide(hodId: string, tenantId: string, groupId: string,
    action: 'APPROVE' | 'REJECT') {
    if (!UUID.test(groupId || '') || !['APPROVE','REJECT'].includes(action)) {
      throw new BadRequestException('Invalid change group or action');
    }
    const result = await this.dataSource.transaction(async (manager) => {
      const actor = await this.actorScope(manager, tenantId, hodId);
      if (!['HOD','Dean','SuperAdmin'].includes(actor.role_name)) throw new ForbiddenException('HOD approval required');
      const rows = await manager.query<Array<Leg & {
        status: string; requested_by_user_id: string;
        source_date_text: string; target_date_text: string;
      }>>(
        `SELECT m.*,m.source_timetable_id AS timetable_id,
                m.source_date::text AS source_date_text,
                m.target_date::text AS target_date_text,
                u.dept_id AS faculty_dept_id,t.section
         FROM academic_class_moves m
         JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
         JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
         WHERE m.tenant_id=$1 AND m.change_group_id=$2::uuid
         ORDER BY m.move_id FOR UPDATE OF m`,
        [tenantId,groupId],
      );
      if (!rows.length) throw new NotFoundException('Class move not found');
      if (rows.some((row) => row.status !== 'PENDING_HOD_APPROVAL')) throw new BadRequestException('Change already decided');
      if (rows.some((row) => row.requested_by_user_id === hodId)) {
        throw new ForbiddenException('The proposer cannot approve their own timetable change');
      }
      if (actor.role_name === 'HOD' && rows.some((row) => Number(row.faculty_dept_id) !== Number(actor.dept_id))) {
        throw new ForbiddenException('HOD can approve only their department classes');
      }
      if (actor.role_name === 'Dean') {
        await this.assertDeanDepartments(manager, tenantId, hodId, rows.map((row) => row.faculty_dept_id));
      }
      if (action === 'APPROVE') {
        const legs = rows.map((row) => ({
          ...row, source_date: row.source_date_text, target_date: row.target_date_text,
        }));
        const today = campusToday();
        if (legs.some((leg) => leg.source_date < today || leg.target_date < today)) {
          throw new BadRequestException('This class change is now past due; create a new request');
        }
        await this.lockDates(manager, tenantId, legs.flatMap((row) => [row.source_date,row.target_date]));
        for (const row of rows) {
          const attendance = await manager.query(
            `SELECT 1 FROM course_attendance_logs WHERE tenant_id=$1 AND timetable_id=$2::uuid
               AND date=$3::date LIMIT 1`,
            [tenantId,row.timetable_id,row.source_date_text],
          );
          if (attendance.length) throw new BadRequestException('Attendance has already been recorded for a source class');
        }
        await this.assertNoCollisions(manager, tenantId, legs);
      }
      await manager.query(
        `UPDATE academic_class_moves SET status=$3,decided_by_user_id=$4::uuid,decided_at=NOW()
         WHERE tenant_id=$1 AND change_group_id=$2::uuid AND status='PENDING_HOD_APPROVAL'`,
        [tenantId,groupId,action === 'APPROVE' ? 'APPROVED' : 'REJECTED',hodId],
      );
      return { change_group_id: groupId, status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        sessions: rows.map((row) => ({
          course_id: row.course_id, faculty_id: row.original_faculty_id,
          section: row.section, source_date: row.source_date_text,
          target_date: row.target_date_text,
          target_start_time: row.target_start_time,
        })) };
    });
    if (action === 'APPROVE') {
      for (const session of result.sessions) {
        const summary = `Class moved from ${session.source_date} to ${session.target_date} at ${String(session.target_start_time).slice(0, 5)}.`;
        this.notify.timetableChanged({ tenantId, userId: session.faculty_id,
          courseName: 'Your class', changeSummary: summary, actionLink: '/faculty/timetable' });
        const students = await this.dataSource.transaction((manager) =>
          this.studentIds(manager, tenantId, session.course_id, session.section));
        for (const studentId of students) this.notify.timetableChanged({
          tenantId, userId: studentId, courseName: 'Your class',
          changeSummary: summary, actionLink: '/student/timetable',
        });
      }
    }
    return { change_group_id: result.change_group_id, status: result.status };
  }
}
