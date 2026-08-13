import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { NotificationDispatchService } from '../../core/notifications/notification-dispatch.service';
import { assignmentPublishedMessage } from '../../core/notifications/notification-message.catalog';
import { AcademicAssignment } from '../../entities/academic-assignment.entity';
import { AssignmentNotificationAudit } from '../../entities/assignment-notification-audit.entity';
import { AssignmentSubmission } from '../../entities/assignment-submission.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { FalconNotification } from '../../entities/falcon-notification.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { User } from '../../entities/user.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { assertPdfUpload } from './lms-upload.config';

export type AssignmentSubmissionStatus =
  | 'SUBMITTED'
  | 'GRADED'
  | 'RETURNED_FOR_REVISION';

@Injectable()
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    @InjectRepository(AcademicAssignment)
    private readonly assignments: Repository<AcademicAssignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissions: Repository<AssignmentSubmission>,
    @InjectRepository(AcademicTimetable)
    private readonly timetable: Repository<AcademicTimetable>,
    @InjectRepository(StudentCourseEnrollment)
    private readonly enrollments: Repository<StudentCourseEnrollment>,
    @InjectRepository(AssignmentNotificationAudit)
    private readonly notificationAudits: Repository<AssignmentNotificationAudit>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(FalconNotification)
    private readonly falconNotifications: Repository<FalconNotification>,
    private readonly objectStorage: ObjectStorageService,
    private readonly notifyDispatch: NotificationDispatchService,
  ) {}

  async listFacultyAssignments(
    facultyUserId: string,
    tenantId: string,
    courseId?: string,
  ) {
    const qb = this.assignments
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.course', 'course')
      .where('assignment.tenant_id = :tenantId', { tenantId })
      .andWhere('assignment.faculty_user_id = :facultyUserId', {
        facultyUserId,
      })
      .orderBy('assignment.due_date', 'ASC');

    if (courseId) {
      qb.andWhere('assignment.course_id = :courseId', { courseId });
    }

    const rows = await qb.getMany();
    const counts = await Promise.all(
      rows.map((row) =>
        this.submissions.count({
          where: { tenant_id: tenantId, assignment_id: row.assignment_id },
        }),
      ),
    );

    return rows.map((row, index) => ({
      ...row,
      submission_count: counts[index] ?? 0,
    }));
  }

  async createFacultyAssignment(
    facultyUserId: string,
    tenantId: string,
    dto: {
      course_id?: string;
      title?: string;
      description?: string;
      max_marks?: string | number;
      start_date?: string;
      due_date?: string;
      semester?: string | number;
      section_code?: string;
    },
    file?: Express.Multer.File,
  ) {
    if (
      !dto.course_id ||
      !dto.title?.trim() ||
      !dto.max_marks ||
      !dto.due_date
    ) {
      throw new BadRequestException(
        'Course, title, max marks, and due date are required',
      );
    }

    await this.assertFacultyTeachesCourse(
      dto.course_id,
      facultyUserId,
      tenantId,
    );
    const startDate = dto.start_date ? new Date(dto.start_date) : new Date();
    const dueDate = new Date(dto.due_date);
    if (startDate > dueDate) {
      throw new BadRequestException('Publish date must be before the deadline');
    }

    const stored = file
      ? await this.persistAssignmentFile(
          tenantId,
          'assignment-references',
          file,
        )
      : null;
    const semester = this.parseOptionalSemester(dto.semester);
    const sectionCode = this.parseOptionalSection(dto.section_code);
    const row = this.assignments.create({
      tenant_id: tenantId,
      course_id: dto.course_id,
      faculty_user_id: facultyUserId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      reference_file_path: stored?.filePath ?? null,
      reference_file_key: stored?.fileKey ?? null,
      max_marks: Number(dto.max_marks),
      start_date: startDate,
      due_date: dueDate,
      semester,
      section_code: sectionCode,
    });

    const saved = await this.assignments.save(row);
    const notified_count = await this.notifyStudentsOfPublishedAssignment(
      saved,
      facultyUserId,
      tenantId,
    );
    return { ...saved, notified_count };
  }

  async updateFacultyAssignment(
    facultyUserId: string,
    tenantId: string,
    assignmentId: string,
    dto: {
      title?: string;
      description?: string;
      max_marks?: string | number;
      start_date?: string;
      due_date?: string;
      semester?: string | number;
      section_code?: string;
    },
    file?: Express.Multer.File,
  ) {
    const assignment = await this.assignments.findOne({
      where: {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        faculty_user_id: facultyUserId,
      },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (dto.title?.trim()) assignment.title = dto.title.trim();
    if (dto.description !== undefined)
      assignment.description = dto.description?.trim() || null;
    if (dto.max_marks !== undefined) {
      const maxMarks = Number(dto.max_marks);
      if (Number.isNaN(maxMarks) || maxMarks <= 0)
        throw new BadRequestException('Invalid max_marks');
      assignment.max_marks = maxMarks;
    }
    if (dto.start_date) assignment.start_date = new Date(dto.start_date);
    if (dto.due_date) assignment.due_date = new Date(dto.due_date);
    if (dto.semester !== undefined) {
      assignment.semester = this.parseOptionalSemester(dto.semester);
    }
    if (dto.section_code !== undefined) {
      assignment.section_code = this.parseOptionalSection(dto.section_code);
    }
    if (assignment.start_date > assignment.due_date) {
      throw new BadRequestException('Publish date must be before the deadline');
    }

    if (file) {
      const stored = await this.persistAssignmentFile(
        tenantId,
        'assignment-references',
        file,
      );
      assignment.reference_file_path = stored.filePath;
      assignment.reference_file_key = stored.fileKey;
    }

    const saved = await this.assignments.save(assignment);
    const notified_count = await this.notifyStudentsOfPublishedAssignment(
      saved,
      facultyUserId,
      tenantId,
    );
    return { ...saved, notified_count };
  }

  /** Future-dated assignments: notify once start_date is reached. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async notifyDueScheduledAssignments(): Promise<number> {
    const due = await this.assignments
      .createQueryBuilder('a')
      .where('a.start_date <= NOW()')
      .andWhere('a.notifications_sent_at IS NULL')
      .orderBy('a.start_date', 'ASC')
      .take(100)
      .getMany();

    let total = 0;
    for (const assignment of due) {
      total += await this.notifyStudentsOfPublishedAssignment(
        assignment,
        assignment.faculty_user_id,
        assignment.tenant_id,
      );
    }
    return total;
  }

  async listAssignmentRoster(
    facultyUserId: string,
    tenantId: string,
    assignmentId: string,
  ) {
    const assignment = await this.assignments.findOne({
      where: {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        faculty_user_id: facultyUserId,
      },
      relations: ['course'],
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const enrolled = await this.enrollments.find({
      where: {
        tenant_id: tenantId,
        course_id: assignment.course_id,
        status: 'ENROLLED',
      },
      relations: ['student'],
      order: { student_user_id: 'ASC' },
    });

    const submissions = await this.submissions.find({
      where: { tenant_id: tenantId, assignment_id: assignmentId },
    });
    const byStudent = new Map(submissions.map((s) => [s.student_user_id, s]));

    return {
      assignment,
      roster: enrolled.map((row) => {
        const sub = byStudent.get(row.student_user_id);
        return {
          student_user_id: row.student_user_id,
          student_name: row.student?.name ?? 'Student',
          student_email: row.student?.email ?? null,
          submitted: Boolean(sub),
          submission_id: sub?.submission_id ?? null,
          submitted_at: sub?.submitted_at ?? null,
          marks_awarded: sub?.marks_awarded ?? null,
          faculty_remarks: sub?.faculty_remarks ?? null,
          revision_due_at: sub?.revision_due_at ?? null,
          status: this.deriveRosterStatus(sub),
        };
      }),
    };
  }

  private deriveRosterStatus(sub?: AssignmentSubmission | null): string {
    if (!sub) return 'NOT_SUBMITTED';
    if (sub.status === 'RETURNED_FOR_REVISION') return 'RETURNED_FOR_REVISION';
    if (sub.marks_awarded != null || sub.status === 'GRADED') return 'GRADED';
    return 'SUBMITTED';
  }

  private deriveStudentStatus(
    assignment: AcademicAssignment,
    submission?: AssignmentSubmission | null,
  ): string {
    if (submission?.status === 'RETURNED_FOR_REVISION')
      return 'RETURNED_FOR_REVISION';
    if (submission?.marks_awarded != null || submission?.status === 'GRADED')
      return 'GRADED';
    if (submission) return 'SUBMITTED';
    const pastDue = new Date(assignment.due_date).getTime() < Date.now();
    return pastDue ? 'OVERDUE' : 'PENDING';
  }

  private canStudentSubmit(
    assignment: AcademicAssignment,
    submission?: AssignmentSubmission | null,
  ): boolean {
    if (submission?.status === 'RETURNED_FOR_REVISION') {
      const revisionDue = submission.revision_due_at
        ? new Date(submission.revision_due_at).getTime()
        : new Date(assignment.due_date).getTime();
      return Date.now() <= revisionDue;
    }
    return new Date() <= new Date(assignment.due_date);
  }

  async listSubmissions(
    facultyUserId: string,
    tenantId: string,
    assignmentId: string,
  ) {
    const assignment = await this.assignments.findOne({
      where: {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        faculty_user_id: facultyUserId,
      },
      relations: ['course'],
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const rows = await this.submissions.find({
      where: { tenant_id: tenantId, assignment_id: assignmentId },
      relations: ['student'],
      order: { submitted_at: 'ASC' },
    });

    return {
      assignment,
      submissions: rows.map((row) => ({
        submission_id: row.submission_id,
        student_user_id: row.student_user_id,
        student_name: row.student?.name ?? 'Student',
        student_email: row.student?.email ?? null,
        file_path: row.file_path,
        submitted_at: row.submitted_at,
        marks_awarded: row.marks_awarded,
        faculty_remarks: row.faculty_remarks,
        status: row.status,
        revision_due_at: row.revision_due_at,
      })),
    };
  }

  async returnForRevision(
    facultyUserId: string,
    tenantId: string,
    submissionId: string,
    dto: { faculty_remarks?: string; revision_days?: number },
  ) {
    const remarks = dto.faculty_remarks?.trim();
    if (!remarks) {
      throw new BadRequestException(
        'Remarks are required when returning an assignment',
      );
    }

    const submission = await this.submissions.findOne({
      where: { tenant_id: tenantId, submission_id: submissionId },
      relations: ['assignment'],
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.assignment.faculty_user_id !== facultyUserId) {
      throw new ForbiddenException(
        'You can return only your assignment submissions',
      );
    }

    const extensionDays =
      dto.revision_days && dto.revision_days > 0 ? dto.revision_days : 3;
    const revisionDue = new Date();
    revisionDue.setDate(revisionDue.getDate() + extensionDays);

    submission.status = 'RETURNED_FOR_REVISION';
    submission.revision_due_at = revisionDue;
    submission.faculty_remarks = remarks;
    submission.marks_awarded = null;
    await this.submissions.save(submission);

    const courseId = submission.assignment.course_id;
    await this.notifyDispatch.dispatch({
      tenantId,
      userId: submission.student_user_id,
      category: 'ACADEMICS',
      title: 'Assignment returned for revision',
      message: `${submission.assignment.title}: ${remarks}. Re-upload by ${revisionDue.toLocaleDateString()}.`,
      actionLink: `/student/courses/${courseId}`,
      severity: 'warning',
      intent: 'action_required',
      actionLabel: 'Check and Re-Upload',
      metadata: {
        assignment_id: submission.assignment_id,
        submission_id: submission.submission_id,
      },
    });

    return submission;
  }

  async gradeSubmission(
    facultyUserId: string,
    tenantId: string,
    submissionId: string,
    dto: { marks_awarded?: string | number; faculty_remarks?: string },
  ) {
    const submission = await this.submissions.findOne({
      where: { tenant_id: tenantId, submission_id: submissionId },
      relations: ['assignment'],
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.assignment.faculty_user_id !== facultyUserId) {
      throw new ForbiddenException(
        'You can grade only your assignment submissions',
      );
    }

    const marks = Number(dto.marks_awarded);
    if (
      Number.isNaN(marks) ||
      marks < 0 ||
      marks > submission.assignment.max_marks
    ) {
      throw new BadRequestException(
        `Marks must be between 0 and ${submission.assignment.max_marks}`,
      );
    }

    submission.marks_awarded = marks.toFixed(2);
    submission.faculty_remarks = dto.faculty_remarks?.trim() || null;
    submission.status = 'GRADED';
    submission.revision_due_at = null;
    return this.submissions.save(submission);
  }

  async listStudentAssignments(studentUserId: string, tenantId: string) {
    const enrolled = await this.enrollments.find({
      where: {
        tenant_id: tenantId,
        student_user_id: studentUserId,
        status: 'ENROLLED',
      },
    });
    const courseIds = enrolled.map((row) => row.course_id);
    if (courseIds.length === 0) return [];

    const enrollmentByCourse = new Map(
      enrolled.map((row) => [row.course_id, row]),
    );

    const assignments = await this.assignments
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.course', 'course')
      .where('assignment.tenant_id = :tenantId', { tenantId })
      .andWhere('assignment.course_id IN (:...courseIds)', { courseIds })
      .orderBy('assignment.due_date', 'ASC')
      .getMany();

    const nowMs = Date.now();
    const visibleAssignments = assignments.filter((assignment) => {
      if (new Date(assignment.start_date).getTime() > nowMs) return false;
      const enrollment = enrollmentByCourse.get(assignment.course_id);
      if (!enrollment) return false;
      if (
        assignment.semester != null &&
        enrollment.semester !== assignment.semester
      ) {
        return false;
      }
      if (
        assignment.section_code &&
        (enrollment.section_code ?? '').toUpperCase() !==
          assignment.section_code.toUpperCase()
      ) {
        return false;
      }
      return true;
    });

    const submissions = await this.submissions.find({
      where: { tenant_id: tenantId, student_user_id: studentUserId },
    });
    const submissionByAssignment = new Map(
      submissions.map((row) => [row.assignment_id, row]),
    );

    return visibleAssignments.map((assignment) => {
      const submission = submissionByAssignment.get(assignment.assignment_id);
      return {
        assignment: {
          assignment_id: assignment.assignment_id,
          title: assignment.title,
          start_date: assignment.start_date.toISOString(),
          due_date: assignment.due_date.toISOString(),
          max_marks: assignment.max_marks,
          description: assignment.description,
          has_reference_file: !!assignment.reference_file_path,
          course_id: assignment.course_id,
        },
        submission: submission ?? null,
        status: this.deriveStudentStatus(assignment, submission),
        can_resubmit: this.canStudentSubmit(assignment, submission),
      };
    });
  }

  async submitAssignment(
    studentUserId: string,
    tenantId: string,
    assignmentId: string,
    file?: Express.Multer.File,
  ) {
    const assignment = await this.assignments.findOne({
      where: { tenant_id: tenantId, assignment_id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (new Date() < new Date(assignment.start_date)) {
      throw new ForbiddenException('This assignment is not visible yet.');
    }

    const existing = await this.submissions.findOne({
      where: {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        student_user_id: studentUserId,
      },
    });
    if (!this.canStudentSubmit(assignment, existing)) {
      throw new ForbiddenException(
        'The deadline for this assignment has passed.',
      );
    }

    assertPdfUpload(file);

    const enrollment = await this.enrollments.findOne({
      where: {
        tenant_id: tenantId,
        student_user_id: studentUserId,
        course_id: assignment.course_id,
        status: 'ENROLLED',
      },
    });
    if (!enrollment)
      throw new ForbiddenException('You are not enrolled in this course');
    this.assertEnrollmentMatchesAssignment(assignment, enrollment);

    const stored = await this.persistAssignmentFile(
      tenantId,
      'assignment-submissions',
      file!,
    );
    await this.submissions.upsert(
      {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        student_user_id: studentUserId,
        file_path: stored.filePath,
        file_key: stored.fileKey,
        submitted_at: new Date(),
        marks_awarded: null,
        faculty_remarks:
          existing?.status === 'RETURNED_FOR_REVISION'
            ? existing.faculty_remarks
            : null,
        status: 'SUBMITTED',
        revision_due_at: null,
      },
      ['tenant_id', 'assignment_id', 'student_user_id'],
    );

    return this.submissions.findOne({
      where: {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        student_user_id: studentUserId,
      },
    });
  }

  async getSubmissionForFacultyDownload(
    facultyUserId: string,
    tenantId: string,
    submissionId: string,
  ) {
    const submission = await this.submissions.findOne({
      where: { tenant_id: tenantId, submission_id: submissionId },
      relations: ['assignment'],
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.assignment.faculty_user_id !== facultyUserId) {
      throw new ForbiddenException(
        'You can download only your assignment submissions',
      );
    }
    return submission;
  }

  async streamSubmissionFile(submission: AssignmentSubmission) {
    if (submission.file_key && this.objectStorage.isEnabled()) {
      const stream = await this.objectStorage.getDownloadStream(
        submission.file_key,
      );
      return {
        stream,
        filename: `${submission.submission_id}.pdf`,
        mimeType: 'application/pdf',
      };
    }
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = submission.file_path.startsWith('/')
      ? submission.file_path
      : resolve(process.cwd(), submission.file_path);
    const resolved = filePath.includes(uploadRoot)
      ? filePath
      : resolve(uploadRoot, submission.file_path);
    if (!existsSync(resolved))
      throw new NotFoundException('File not found on server');
    return {
      stream: createReadStream(resolved),
      filename: basename(resolved),
      mimeType: 'application/pdf',
    };
  }

  async getAssignmentForStudentDownload(
    studentUserId: string,
    tenantId: string,
    assignmentId: string,
  ) {
    const assignment = await this.assignments.findOne({
      where: { tenant_id: tenantId, assignment_id: assignmentId },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    if (new Date() < new Date(assignment.start_date)) {
      throw new ForbiddenException('This assignment is not visible yet.');
    }

    const enrollment = await this.enrollments.findOne({
      where: {
        tenant_id: tenantId,
        student_user_id: studentUserId,
        course_id: assignment.course_id,
        status: 'ENROLLED',
      },
    });
    if (!enrollment)
      throw new ForbiddenException('You are not enrolled in this course');
    this.assertEnrollmentMatchesAssignment(assignment, enrollment);

    if (!assignment.reference_file_path) {
      throw new NotFoundException('No reference file attached');
    }

    return assignment;
  }

  async streamAssignmentFile(assignment: AcademicAssignment) {
    if (assignment.reference_file_key && this.objectStorage.isEnabled()) {
      const stream = await this.objectStorage.getDownloadStream(
        assignment.reference_file_key,
      );
      return {
        stream,
        filename: `${assignment.title.replace(/\s+/g, '_')}_ref.pdf`,
        mimeType: 'application/pdf',
      };
    }
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = assignment.reference_file_path!.startsWith('/')
      ? assignment.reference_file_path!
      : resolve(process.cwd(), assignment.reference_file_path!);
    const resolved = filePath.includes(uploadRoot)
      ? filePath
      : resolve(uploadRoot, assignment.reference_file_path!);
    if (!existsSync(resolved))
      throw new NotFoundException('File not found on server');
    return {
      stream: createReadStream(resolved),
      filename: basename(resolved),
      mimeType: 'application/pdf',
    };
  }

  private assertEnrollmentMatchesAssignment(
    assignment: AcademicAssignment,
    enrollment: StudentCourseEnrollment,
  ) {
    if (
      assignment.semester != null &&
      enrollment.semester !== assignment.semester
    ) {
      throw new ForbiddenException(
        'This assignment is not assigned to your semester',
      );
    }
    if (
      assignment.section_code &&
      (enrollment.section_code ?? '').toUpperCase() !==
        assignment.section_code.toUpperCase()
    ) {
      throw new ForbiddenException(
        'This assignment is not assigned to your section',
      );
    }
  }

  private parseOptionalSemester(value?: string | number | null): number | null {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) {
      throw new BadRequestException('Invalid semester');
    }
    return n;
  }

  private parseOptionalSection(value?: string | null): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = value.trim().toUpperCase();
    return trimmed || null;
  }

  /**
   * Notify enrolled students when an assignment is visible (start_date <= now).
   * Never throws — assignment save must succeed even if delivery fails.
   */
  private async notifyStudentsOfPublishedAssignment(
    assignment: AcademicAssignment,
    facultyUserId: string,
    tenantId: string,
  ): Promise<number> {
    try {
      if (new Date(assignment.start_date).getTime() > Date.now()) {
        await this.upsertNotificationAudit({
          tenantId,
          assignmentId: assignment.assignment_id,
          facultyUserId,
          studentsTargeted: 0,
          studentsNotified: 0,
          deliveryStatus: 'SKIPPED_SCHEDULED',
          failedUserIds: [],
          errorSummary: 'Assignment publish date is in the future',
        });
        return 0;
      }

      if (assignment.notifications_sent_at) {
        return 0;
      }

      const existingAudit = await this.notificationAudits.findOne({
        where: {
          tenant_id: tenantId,
          assignment_id: assignment.assignment_id,
        },
      });
      if (
        existingAudit?.delivery_status === 'SENT' ||
        existingAudit?.delivery_status === 'SKIPPED_DUPLICATE'
      ) {
        if (!assignment.notifications_sent_at) {
          await this.assignments.update(
            { assignment_id: assignment.assignment_id, tenant_id: tenantId },
            { notifications_sent_at: new Date() },
          );
        }
        return existingAudit.students_notified;
      }

      const qb = this.enrollments
        .createQueryBuilder('e')
        .where('e.tenant_id = :tenantId', { tenantId })
        .andWhere('e.course_id = :courseId', {
          courseId: assignment.course_id,
        })
        .andWhere('e.status = :status', { status: 'ENROLLED' });

      if (assignment.semester != null) {
        qb.andWhere('e.semester = :semester', {
          semester: assignment.semester,
        });
      }
      if (assignment.section_code) {
        qb.andWhere('UPPER(e.section_code) = :section', {
          section: assignment.section_code.toUpperCase(),
        });
      }

      const enrolled = await qb.getMany();
      const studentIds = [...new Set(enrolled.map((e) => e.student_user_id))];

      if (studentIds.length === 0) {
        await this.upsertNotificationAudit({
          tenantId,
          assignmentId: assignment.assignment_id,
          facultyUserId,
          studentsTargeted: 0,
          studentsNotified: 0,
          deliveryStatus: 'SENT',
          failedUserIds: [],
          errorSummary: 'No enrolled students matched filters',
        });
        await this.assignments.update(
          { assignment_id: assignment.assignment_id, tenant_id: tenantId },
          { notifications_sent_at: new Date() },
        );
        return 0;
      }

      const [faculty, courseRows] = await Promise.all([
        this.users.findOne({ where: { user_id: facultyUserId } }),
        this.timetable.query(
          `SELECT course_code, course_name FROM academic_courses
           WHERE tenant_id = $1 AND course_id = $2 LIMIT 1`,
          [tenantId, assignment.course_id],
        ),
      ]);

      const course = courseRows[0];
      const facultyName = faculty?.name?.trim() || 'Faculty';
      const courseName = course?.course_name ?? 'Course';
      const courseCode = course?.course_code;

      const alreadyNotified = await this.falconNotifications
        .createQueryBuilder('n')
        .select('n.user_id', 'user_id')
        .where('n.tenant_id = :tenantId', { tenantId })
        .andWhere('n.user_id IN (:...studentIds)', { studentIds })
        .andWhere('n.deleted_at IS NULL')
        .andWhere(`n.metadata->>'assignmentId' = :assignmentId`, {
          assignmentId: assignment.assignment_id,
        })
        .getRawMany<{ user_id: string }>();

      const alreadySet = new Set(alreadyNotified.map((r) => r.user_id));
      const toNotify = studentIds.filter((id) => !alreadySet.has(id));

      if (toNotify.length === 0) {
        await this.upsertNotificationAudit({
          tenantId,
          assignmentId: assignment.assignment_id,
          facultyUserId,
          studentsTargeted: studentIds.length,
          studentsNotified: studentIds.length,
          deliveryStatus: 'SKIPPED_DUPLICATE',
          failedUserIds: [],
          errorSummary: 'Students already notified for this assignment',
        });
        await this.assignments.update(
          { assignment_id: assignment.assignment_id, tenant_id: tenantId },
          { notifications_sent_at: new Date() },
        );
        return studentIds.length;
      }

      const failedUserIds: string[] = [];
      let notified = 0;

      for (const userId of toNotify) {
        const ok = await this.emitAssignmentNotificationWithRetry({
          tenantId,
          userId,
          assignment,
          facultyName,
          courseName,
          courseCode,
        });
        if (ok) notified += 1;
        else failedUserIds.push(userId);
      }

      const deliveryStatus =
        failedUserIds.length === 0
          ? 'SENT'
          : notified === 0
            ? 'FAILED'
            : 'PARTIAL';

      await this.upsertNotificationAudit({
        tenantId,
        assignmentId: assignment.assignment_id,
        facultyUserId,
        studentsTargeted: studentIds.length,
        studentsNotified: notified + alreadySet.size,
        deliveryStatus,
        failedUserIds,
        errorSummary:
          failedUserIds.length > 0
            ? `Failed for ${failedUserIds.length} student(s)`
            : null,
      });

      // Only mark complete when every targeted student was notified.
      // PARTIAL/FAILED stay eligible for the 5-minute retry cron.
      if (deliveryStatus === 'SENT') {
        await this.assignments.update(
          { assignment_id: assignment.assignment_id, tenant_id: tenantId },
          { notifications_sent_at: new Date() },
        );
      }

      return notified + alreadySet.size;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Assignment notification failed for ${assignment.assignment_id}: ${message}`,
      );
      try {
        await this.upsertNotificationAudit({
          tenantId,
          assignmentId: assignment.assignment_id,
          facultyUserId,
          studentsTargeted: 0,
          studentsNotified: 0,
          deliveryStatus: 'FAILED',
          failedUserIds: [],
          errorSummary: message.slice(0, 1000),
        });
      } catch (auditErr) {
        this.logger.error(
          `Failed to write assignment notification audit: ${
            auditErr instanceof Error ? auditErr.message : String(auditErr)
          }`,
        );
      }
      return 0;
    }
  }

  private async emitAssignmentNotificationWithRetry(input: {
    tenantId: string;
    userId: string;
    assignment: AcademicAssignment;
    facultyName: string;
    courseName: string;
    courseCode?: string;
  }): Promise<boolean> {
    const payload = {
      tenantId: input.tenantId,
      userId: input.userId,
      assignmentId: input.assignment.assignment_id,
      courseId: input.assignment.course_id,
      courseName: input.courseName,
      courseCode: input.courseCode,
      assignmentTitle: input.assignment.title,
      facultyName: input.facultyName,
      dueDate: new Date(input.assignment.due_date).toISOString(),
      maxMarks: input.assignment.max_marks,
      semester: input.assignment.semester,
      sectionCode: input.assignment.section_code,
    };
    const msg = assignmentPublishedMessage(payload);

    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        await this.notifyDispatch.dispatch({
          tenantId: input.tenantId,
          userId: input.userId,
          ...msg,
        });
        return true;
      } catch (err) {
        this.logger.warn(
          `Notify attempt ${attempt + 1} failed for student ${input.userId}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 75));
        }
      }
    }
    return false;
  }

  private async upsertNotificationAudit(input: {
    tenantId: string;
    assignmentId: string;
    facultyUserId: string;
    studentsTargeted: number;
    studentsNotified: number;
    deliveryStatus:
      | 'PENDING'
      | 'SENT'
      | 'PARTIAL'
      | 'FAILED'
      | 'SKIPPED_SCHEDULED'
      | 'SKIPPED_DUPLICATE';
    failedUserIds: string[];
    errorSummary: string | null;
  }) {
    const existing = await this.notificationAudits.findOne({
      where: {
        tenant_id: input.tenantId,
        assignment_id: input.assignmentId,
      },
    });

    if (existing) {
      existing.faculty_user_id = input.facultyUserId;
      existing.students_targeted = input.studentsTargeted;
      existing.students_notified = input.studentsNotified;
      existing.delivery_status = input.deliveryStatus;
      existing.failed_user_ids = input.failedUserIds;
      existing.error_summary = input.errorSummary;
      await this.notificationAudits.save(existing);
      return;
    }

    await this.notificationAudits.save(
      this.notificationAudits.create({
        tenant_id: input.tenantId,
        assignment_id: input.assignmentId,
        faculty_user_id: input.facultyUserId,
        students_targeted: input.studentsTargeted,
        students_notified: input.studentsNotified,
        delivery_status: input.deliveryStatus,
        failed_user_ids: input.failedUserIds,
        error_summary: input.errorSummary,
      }),
    );
  }

  private async assertFacultyTeachesCourse(
    courseId: string,
    facultyUserId: string,
    tenantId: string,
  ) {
    const row = await this.timetable.findOne({
      where: {
        tenant_id: tenantId,
        course_id: courseId,
        faculty_user_id: facultyUserId,
      },
    });
    if (row) return;

    const allocation = await this.timetable.query(
      `SELECT 1 FROM academic_course_allocations
       WHERE tenant_id = $1 AND course_id = $2 AND faculty_user_id = $3 AND status = 'ACTIVE'
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (allocation.length) return;

    const marks = await this.timetable.query(
      `SELECT 1 FROM academic_marks
       WHERE tenant_id = $1 AND course_id = $2 AND uploaded_by = $3
       LIMIT 1`,
      [tenantId, courseId, facultyUserId],
    );
    if (marks.length) return;

    throw new NotFoundException('Course not found in your teaching timetable');
  }

  private async persistAssignmentFile(
    tenantId: string,
    folder: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string; fileKey: string | null }> {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(
        tenantId,
        `${folder}/${uniqueName}`,
      );
      const stored = await this.objectStorage.upload(
        tenantId,
        key,
        file.buffer,
        file.mimetype,
      );
      return { filePath: stored.url, fileKey: stored.key };
    }

    const uploadPath = process.env.UPLOAD_PATH || './uploads';
    const targetDir = `${uploadPath}/${tenantId}/${folder}`;
    mkdirSync(targetDir, { recursive: true });
    const fullPath = `${targetDir}/${uniqueName}`;
    writeFileSync(fullPath, file.buffer);
    return { filePath: fullPath, fileKey: null };
  }
}
