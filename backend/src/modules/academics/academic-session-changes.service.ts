import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomUUID } from 'crypto';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { parseAllocationSemester, programsMatch } from './allocation-semester.util';

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
type CohortAllocation = {
  course_id: string;
  academic_year: string;
  program_name: string | null;
  semester: string | null;
};
type Leg = MoveInput & {
  course_id: string;
  original_faculty_id: string;
  faculty_dept_id: number | null;
  section: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;
const academicYearForDate = (date: string) => {
  const year = Number(date.slice(0, 4));
  const start = Number(date.slice(5, 7)) >= 7 ? year : year - 1;
  return `${start}-${start + 1}`;
};
const sameCohort = (
  first: { course_id: string; section: string | null; source_date: string },
  second: { course_id: string; section: string | null; source_date: string },
  allocations: CohortAllocation[],
) => {
  const scope = (row: typeof first) => allocations.filter((item) =>
    item.course_id === row.course_id && item.academic_year === academicYearForDate(row.source_date));
  const a = scope(first);
  const b = scope(second);
  if (!a.length || !b.length) return false;
  const valid = (row: CohortAllocation) => row.program_name?.trim() &&
    parseAllocationSemester(row.semester).semesterNum != null;
  if ([...a, ...b].some((row) => !valid(row))) return false;
  const matches = (left: CohortAllocation, right: CohortAllocation) => {
    const x = parseAllocationSemester(left.semester);
    const y = parseAllocationSemester(right.semester);
    return x.semesterNum === y.semesterNum &&
      programsMatch(left.program_name, right.program_name);
  };
  // A and B sections can exchange times if the real rosters and clash checks
  // permit it. Never treat different programmes or semesters as interchangeable.
  return a.every((left) => b.every((right) => matches(left, right)));
};
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
       JOIN users dean ON dean.user_id=s.dean_user_id AND dean.tenant_id=$1
       WHERE d.dept_id=ANY($2::int[]) AND s.dean_user_id=$3::uuid`,
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
    // An explicit null exchanges a room-assigned class into a roomless slot.
    // Only an omitted target_room means the original room should be retained.
    const targetRoom = input.target_room === undefined ? slot.room : input.target_room?.trim() || null;
    const seconds = (time: string) => time.split(':').reduce((total, segment) => total * 60 + Number(segment), 0);
    if (seconds(end) - seconds(start) !== seconds(slot.end_time) - seconds(slot.start_time)) {
      throw new BadRequestException('A moved class must retain its scheduled duration');
    }
    if (sourceDate === targetDate && start === slot.start_time && end === slot.end_time &&
        targetRoom === slot.room) {
      throw new BadRequestException('Choose a new time, date or room for this class');
    }
    if ((new Date(`${sourceDate}T00:00:00Z`).getUTCDay() || 7) !== Number(slot.day_of_week)) {
      throw new BadRequestException('Original date does not match the weekly class slot');
    }
    const existing = await manager.query(
      `SELECT 1 FROM academic_class_moves WHERE tenant_id=$1 AND source_timetable_id=$2::uuid
         AND source_date=$3::date AND status IN
           ('PENDING_FACULTY_ACCEPTANCE','PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
      [tenantId, input.timetable_id, sourceDate],
    );
    if (existing.length) throw new BadRequestException('This dated class already has a pending or approved move');
    const covered = await manager.query<Array<{ proxy_id: string; status: string; department_hod_name: string | null }>>(
      `SELECT p.proxy_id,p.status,hod.name AS department_hod_name
       FROM academic_proxy_requests p
       JOIN users af ON af.user_id=p.absent_faculty_id AND af.tenant_id=p.tenant_id
       LEFT JOIN departments d ON d.dept_id=af.dept_id
       LEFT JOIN users hod ON hod.user_id=d.hod_user_id AND hod.tenant_id=p.tenant_id
       WHERE p.tenant_id=$1 AND p.timetable_id=$2::uuid
         AND p.date_of_proxy=$3::date AND p.status IN
         ('PENDING_SUBSTITUTE_ACCEPTANCE','PENDING_HOD_APPROVAL','APPROVED') LIMIT 1`,
      [tenantId, input.timetable_id, sourceDate],
    );
    if (covered.length) throw new BadRequestException(
      `Class cover ${covered[0].proxy_id} is ${covered[0].status.replaceAll('_', ' ').toLowerCase()}. ` +
      `Resolve it in Class cover${covered[0].department_hod_name ? ` with ${covered[0].department_hod_name}` : ' with the source department HOD'} before requesting a swap.`,
    );
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
      target_room: targetRoom,
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
      course_code: string;
    }>>(
      `SELECT t.timetable_id,t.course_id,c.course_code,
              COALESCE(p.proxy_faculty_id,t.faculty_user_id) AS faculty_user_id,
              d.day::text AS date,
              t.start_time,t.end_time,t.room,t.section
       FROM unnest($2::date[]) AS d(day)
       JOIN academic_timetables t ON t.tenant_id=$1
         AND t.day_of_week=EXTRACT(ISODOW FROM d.day)::int AND t.deleted_at IS NULL
         AND (t.valid_from IS NULL OR t.valid_from<=d.day)
         AND (t.valid_to IS NULL OR t.valid_to>=d.day)
       JOIN academic_courses c ON c.course_id=t.course_id AND c.tenant_id=t.tenant_id
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
      course_code: string;
    }>>(
      `SELECT m.source_timetable_id AS timetable_id,m.course_id,c.course_code,
              COALESCE(p.proxy_faculty_id,m.original_faculty_id) AS faculty_user_id,
              m.target_date::text AS date,
              m.target_start_time AS start_time,m.target_end_time AS end_time,
              m.target_room AS room,t.section
       FROM academic_class_moves m
       JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
       JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
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
    const years = [...new Set(targetDates.map(academicYearForDate))];
    const courseIds = [...new Set([...existing, ...targets].map((row) => row.course_id))];
    const allocationRows = await manager.query<Array<{
      course_id: string; academic_year: string; program_name: string | null; semester: string | null;
    }>>(
      `SELECT course_id,academic_year,program_name,semester
       FROM academic_course_allocations
       WHERE tenant_id=$1 AND status='ACTIVE'
         AND course_id=ANY($2::uuid[]) AND academic_year=ANY($3::text[])`,
      [tenantId, courseIds, years],
    );
    const scopes = (courseId: string, date: string) => allocationRows.filter((row) =>
      row.course_id === courseId && row.academic_year === academicYearForDate(date));
    const provablySeparate = (target: typeof targets[number], other: typeof targets[number]) => {
      const own = scopes(target.course_id, target.date);
      const theirs = scopes(other.course_id, other.date);
      if (!own.length || !theirs.length) return false;
      const parsed = [...own, ...theirs].map((row) => ({
        program: row.program_name,
        semester: parseAllocationSemester(row.semester).semesterNum,
      }));
      if (parsed.some((row) => !row.program?.trim() || row.semester == null)) return false;
      return own.every((a) => theirs.every((b) =>
        parseAllocationSemester(a.semester).semesterNum !== parseAllocationSemester(b.semester).semesterNum ||
        !programsMatch(a.program_name, b.program_name)));
    };
    const rosterCache = new Map<string, Set<string>>();
    const roster = async (row: typeof targets[number]) => {
      const key = `${row.course_id}|${row.section ?? ''}`;
      if (!rosterCache.has(key)) rosterCache.set(key,
        await this.studentIds(manager, tenantId, row.course_id, row.section));
      return rosterCache.get(key)!;
    };
    const orphanCache = new Map<string, boolean>();
    const hasNoCohortEvidence = async (courseId: string) => {
      if (!orphanCache.has(courseId)) {
        const [activity] = await manager.query<Array<{
          has_enrollment: boolean; has_attendance: boolean;
        }>>(
          `SELECT EXISTS (SELECT 1 FROM student_course_enrollments
                          WHERE tenant_id=$1 AND course_id=$2) AS has_enrollment,
                  EXISTS (SELECT 1 FROM course_attendance_logs
                          WHERE tenant_id=$1 AND course_id=$2) AS has_attendance`,
          [tenantId, courseId],
        );
        orphanCache.set(courseId, !activity?.has_enrollment && !activity?.has_attendance);
      }
      return orphanCache.get(courseId)!;
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
        if (!otherStudents.size) {
          // A tenant-wide timetable includes other programmes and orphaned
          // legacy slots. A missing roster is only safe to disregard when
          // current allocations prove distinct cohorts, or the course has no
          // active allocation, enrollment or attendance at all.
          if (provablySeparate(target, other) ||
              (!scopes(other.course_id, other.date).length &&
                await hasNoCohortEvidence(other.course_id))) continue;
          throw new BadRequestException(
            `Cannot verify student groups for overlapping ${'course_code' in other ? other.course_code : other.course_id}; map its roster or current allocation`,
          );
        }
        if ([...ownStudents].some((id) => otherStudents.has(id))) {
          throw new BadRequestException('Student group has another class at the proposed time');
        }
      }
    }
  }

  async swapCandidates(actorId: string, tenantId: string, timetableId: string,
    sourceDateValue: string, otherDateValue: string) {
    if (!UUID.test(timetableId || '')) throw new BadRequestException('Choose your first class');
    const sourceDate = this.date(sourceDateValue);
    const otherDate = this.date(otherDateValue);
    if (sourceDate < campusToday() || otherDate < campusToday()) {
      throw new BadRequestException('Choose future class dates');
    }
    const [actor] = await this.dataSource.query<Array<{ dept_id: number | null }>>(
      `SELECT dept_id FROM users WHERE tenant_id=$1 AND user_id=$2 AND is_active=true`,
      [tenantId, actorId],
    );
    if (!actor?.dept_id) throw new ForbiddenException('A department assignment is required for class swaps');
    const [source] = await this.dataSource.query<Array<Slot>>(
      `SELECT t.timetable_id,t.course_id,t.faculty_user_id,u.dept_id AS faculty_dept_id,
              t.section,t.day_of_week,t.start_time,t.end_time,t.room
       FROM academic_timetables t JOIN users u ON u.tenant_id=t.tenant_id AND u.user_id=t.faculty_user_id
       WHERE t.tenant_id=$1 AND t.timetable_id=$2::uuid AND t.deleted_at IS NULL
         AND t.faculty_user_id=$3::uuid AND u.dept_id=$4::int
         AND t.day_of_week=EXTRACT(ISODOW FROM $5::date)::int
         AND (t.valid_from IS NULL OR t.valid_from<=$5::date)
         AND (t.valid_to IS NULL OR t.valid_to>=$5::date)`,
      [tenantId, timetableId, actorId, actor.dept_id, sourceDate],
    );
    if (!source) throw new NotFoundException('Choose one of your published classes on the first date');
    const candidates = await this.dataSource.query<Array<Slot & {
      course_code: string; course_name: string; faculty_name: string;
    }>>(
      `SELECT t.timetable_id,t.course_id,t.faculty_user_id,u.dept_id AS faculty_dept_id,
              t.section,t.day_of_week,t.start_time,t.end_time,t.room,
              c.course_code,c.course_name,u.name AS faculty_name
       FROM academic_timetables t
       JOIN users u ON u.tenant_id=t.tenant_id AND u.user_id=t.faculty_user_id AND u.is_active=true
       JOIN academic_courses c ON c.tenant_id=t.tenant_id AND c.course_id=t.course_id
       WHERE t.tenant_id=$1 AND u.dept_id=$2::int AND t.deleted_at IS NULL
         AND t.day_of_week=EXTRACT(ISODOW FROM $3::date)::int
         AND (t.valid_from IS NULL OR t.valid_from<=$3::date)
         AND (t.valid_to IS NULL OR t.valid_to>=$3::date)
         AND NOT (t.timetable_id=$4::uuid AND $3::date=$5::date)
         AND NOT EXISTS (SELECT 1 FROM academic_class_moves m
           WHERE m.tenant_id=t.tenant_id AND m.source_timetable_id=t.timetable_id
             AND m.source_date=$3::date AND m.status IN
               ('PENDING_FACULTY_ACCEPTANCE','PENDING_HOD_APPROVAL','APPROVED'))
         AND NOT EXISTS (SELECT 1 FROM academic_proxy_requests p
           WHERE p.tenant_id=t.tenant_id AND p.timetable_id=t.timetable_id
             AND p.date_of_proxy=$3::date AND p.status IN
               ('PENDING_SUBSTITUTE_ACCEPTANCE','PENDING_HOD_APPROVAL','APPROVED'))
         AND NOT EXISTS (SELECT 1 FROM course_attendance_logs a
           WHERE a.tenant_id=t.tenant_id AND a.timetable_id=t.timetable_id AND a.date=$3::date)
       ORDER BY t.start_time,c.course_code,u.name`,
      [tenantId, actor.dept_id, otherDate, timetableId, sourceDate],
    );
    const allocations = await this.dataSource.query<CohortAllocation[]>(
      `SELECT course_id,academic_year,program_name,semester FROM academic_course_allocations
       WHERE tenant_id=$1 AND status='ACTIVE' AND course_id=ANY($2::uuid[])
         AND academic_year=ANY($3::text[])`,
      [tenantId, [...new Set([source.course_id, ...candidates.map((row) => row.course_id)])],
        [...new Set([academicYearForDate(sourceDate), academicYearForDate(otherDate)])]],
    );
    const duration = (row: Slot) => Date.parse(`1970-01-01T${row.end_time}Z`) -
      Date.parse(`1970-01-01T${row.start_time}Z`);
    const eligible = candidates.filter((row) => duration(row) === duration(source) &&
      sameCohort({ ...source, source_date: sourceDate },
        { ...row, source_date: otherDate }, allocations));
    return { candidates: eligible.map((row) => ({
      timetable_id: row.timetable_id, course_code: row.course_code,
      course_name: row.course_name, faculty_name: row.faculty_name,
      start_time: row.start_time, end_time: row.end_time, room: row.room,
      section: row.section,
    })), message: eligible.length ? null :
      'No class in the same programme and semester with equal duration was found on that date.' };
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
      if (actor.role_name === 'Dean') {
        await this.assertDeanDepartments(manager, tenantId, actorId, legs.map((leg) => leg.faculty_dept_id));
      }
      if (!legs.some((leg) => leg.original_faculty_id === actorId)) {
        throw new ForbiddenException('Choose at least one class that you teach');
      }
      if (legs.some((leg) => leg.faculty_dept_id == null ||
          Number(leg.faculty_dept_id) !== Number(actor.dept_id))) {
        throw new ForbiddenException('Both classes must belong to your department');
      }
      if (moveType === 'SWAP') {
        const [a, b] = legs;
        const allocations = await manager.query<CohortAllocation[]>(
          `SELECT course_id,academic_year,program_name,semester FROM academic_course_allocations
           WHERE tenant_id=$1 AND status='ACTIVE' AND course_id=ANY($2::uuid[])
             AND academic_year=ANY($3::text[])`,
          [tenantId, [...new Set(legs.map((leg) => leg.course_id))],
            [...new Set(legs.map((leg) => academicYearForDate(leg.source_date)))]],
        );
        if (!sameCohort(a, b, allocations)) {
          throw new BadRequestException(
            'Swap classes must serve the same programme and semester; verify both course allocations',
          );
        }
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
      const counterpart = legs.find((leg) => leg.original_faculty_id !== actorId)?.original_faculty_id;
      const status = counterpart ? 'PENDING_FACULTY_ACCEPTANCE' : 'PENDING_HOD_APPROVAL';
      for (const leg of legs) {
        await manager.query(
          `INSERT INTO academic_class_moves (
             change_group_id,tenant_id,source_timetable_id,course_id,original_faculty_id,
             source_date,target_date,target_start_time,target_end_time,target_room,
             move_type,status,reason,requested_by_user_id
           ) VALUES ($1::uuid,$2,$3::uuid,$4,$5,$6::date,$7::date,$8::time,$9::time,$10,
             $11,$12,$13,$14::uuid)`,
          [groupId,tenantId,leg.timetable_id,leg.course_id,leg.original_faculty_id,
            leg.source_date,leg.target_date,leg.target_start_time,leg.target_end_time,
            leg.target_room,moveType,status,reason.trim(),actorId],
        );
      }
      return { change_group_id: groupId, status, legs: legs.length, counterpart };
    });
    if (result.counterpart) {
      this.notify.approvalRequired({ tenantId, userId: result.counterpart,
        title: 'A colleague proposes swapping a class with you',
        message: 'Review the two dated classes. Your acceptance is needed before HOD approval.',
        actionLink: '/faculty/timetable', requestType: 'CLASS_TIMETABLE_CHANGE',
      });
      return result;
    }
    const hods = await this.dataSource.query<Array<{ hod_user_id: string }>>(
      `SELECT DISTINCT d.hod_user_id FROM academic_class_moves m
       JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
       JOIN departments d ON d.dept_id=u.dept_id
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

  async respondToSwap(actorId: string, tenantId: string, groupId: string,
    action: 'ACCEPT' | 'DECLINE') {
    if (!UUID.test(groupId || '') || !['ACCEPT', 'DECLINE'].includes(action)) {
      throw new BadRequestException('Invalid swap response');
    }
    const result = await this.dataSource.transaction(async (manager) => {
      await this.actorScope(manager, tenantId, actorId);
      const rows = await manager.query<Array<{
        status: string; original_faculty_id: string; requested_by_user_id: string;
      }>>(
        `SELECT status,original_faculty_id,requested_by_user_id FROM academic_class_moves
         WHERE tenant_id=$1 AND change_group_id=$2::uuid FOR UPDATE`,
        [tenantId, groupId],
      );
      if (rows.length !== 2 || rows.some((row) => row.status !== 'PENDING_FACULTY_ACCEPTANCE')) {
        throw new BadRequestException('This swap is no longer awaiting faculty acceptance');
      }
      const requester = rows[0].requested_by_user_id;
      if (requester === actorId || rows.some((row) => row.requested_by_user_id !== requester) ||
          !rows.some((row) => row.original_faculty_id === actorId)) {
        throw new ForbiddenException('Only the other class faculty may respond to this swap');
      }
      const next = action === 'ACCEPT' ? 'PENDING_HOD_APPROVAL' : 'REJECTED';
      await manager.query(
        `UPDATE academic_class_moves SET status=$3,counterpart_responded_by_user_id=$4::uuid,
           counterpart_responded_at=NOW(),counterpart_response=$5
         WHERE tenant_id=$1 AND change_group_id=$2::uuid
             AND status='PENDING_FACULTY_ACCEPTANCE'`,
        [tenantId, groupId, next, actorId, action],
      );
      return { change_group_id: groupId, status: next, requester };
    });
    if (action === 'ACCEPT') {
      const hods = await this.dataSource.query<Array<{ hod_user_id: string }>>(
        `SELECT DISTINCT d.hod_user_id FROM academic_class_moves m
         JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
         JOIN departments d ON d.dept_id=u.dept_id
         WHERE m.tenant_id=$1 AND m.change_group_id=$2::uuid AND d.hod_user_id IS NOT NULL`,
        [tenantId, groupId],
      );
      for (const hod of hods) this.notify.approvalRequired({
        tenantId, userId: hod.hod_user_id,
        title: 'Accepted class swap awaits HOD approval',
        message: 'Both faculty are ready; review the clash-checked dated class swap.',
        actionLink: '/hod/approvals/proxy', requestType: 'CLASS_TIMETABLE_CHANGE',
      });
    }
    this.notify.timetableChanged({
      tenantId, userId: result.requester, courseName: 'Your proposed swap',
      changeSummary: action === 'ACCEPT'
        ? 'The other faculty accepted. The HOD will review the request.'
        : 'The other faculty declined. No classes were changed.',
      actionLink: '/faculty/timetable',
    });
    return result;
  }

  async listMy(actorId: string, tenantId: string) {
    return this.dataSource.query(
      `SELECT m.*,c.course_code,c.course_name,u.name AS faculty_name,
              t.start_time AS original_start_time,t.end_time AS original_end_time,
              t.room AS original_room
       FROM academic_class_moves m
       JOIN academic_courses c ON c.course_id=m.course_id AND c.tenant_id=m.tenant_id
       JOIN academic_timetables t ON t.timetable_id=m.source_timetable_id AND t.tenant_id=m.tenant_id
       JOIN users u ON u.user_id=m.original_faculty_id AND u.tenant_id=m.tenant_id
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
       LEFT JOIN departments d ON d.dept_id=u.dept_id
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
        const allocations = await manager.query<CohortAllocation[]>(
          `SELECT course_id,academic_year,program_name,semester FROM academic_course_allocations
           WHERE tenant_id=$1 AND status='ACTIVE' AND course_id=ANY($2::uuid[])
             AND academic_year=ANY($3::text[])`,
          [tenantId, [...new Set(legs.map((leg) => leg.course_id))],
            [...new Set(legs.map((leg) => academicYearForDate(leg.source_date)))]],
        );
        if (legs.length !== 2 || !sameCohort(legs[0], legs[1], allocations)) {
          throw new BadRequestException('The classes no longer have the same programme and semester');
        }
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
