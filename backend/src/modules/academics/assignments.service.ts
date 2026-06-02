import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'fs';
import { basename, extname, resolve } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Repository } from 'typeorm';
import { AcademicAssignment } from '../../entities/academic-assignment.entity';
import { AssignmentSubmission } from '../../entities/assignment-submission.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { ObjectStorageService } from '../../storage/object-storage.service';
import { assertPdfUpload } from './lms-upload.config';

@Injectable()
export class AssignmentsService {
  constructor(
    @InjectRepository(AcademicAssignment)
    private readonly assignments: Repository<AcademicAssignment>,
    @InjectRepository(AssignmentSubmission)
    private readonly submissions: Repository<AssignmentSubmission>,
    @InjectRepository(AcademicTimetable)
    private readonly timetable: Repository<AcademicTimetable>,
    @InjectRepository(StudentCourseEnrollment)
    private readonly enrollments: Repository<StudentCourseEnrollment>,
    private readonly objectStorage: ObjectStorageService,
  ) {}

  async listFacultyAssignments(facultyUserId: string, tenantId: string, courseId?: string) {
    const qb = this.assignments
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.course', 'course')
      .where('assignment.tenant_id = :tenantId', { tenantId })
      .andWhere('assignment.faculty_user_id = :facultyUserId', { facultyUserId })
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
      due_date?: string;
    },
    file?: Express.Multer.File,
  ) {
    if (!dto.course_id || !dto.title?.trim() || !dto.max_marks || !dto.due_date) {
      throw new BadRequestException('Course, title, max marks, and due date are required');
    }

    await this.assertFacultyTeachesCourse(dto.course_id, facultyUserId, tenantId);

    const stored = file ? await this.persistAssignmentFile(tenantId, 'assignment-references', file) : null;
    const row = this.assignments.create({
      tenant_id: tenantId,
      course_id: dto.course_id,
      faculty_user_id: facultyUserId,
      title: dto.title.trim(),
      description: dto.description?.trim() || null,
      reference_file_path: stored?.filePath ?? null,
      reference_file_key: stored?.fileKey ?? null,
      max_marks: Number(dto.max_marks),
      due_date: new Date(dto.due_date),
    });

    return this.assignments.save(row);
  }

  async listAssignmentRoster(facultyUserId: string, tenantId: string, assignmentId: string) {
    const assignment = await this.assignments.findOne({
      where: { tenant_id: tenantId, assignment_id: assignmentId, faculty_user_id: facultyUserId },
      relations: ['course'],
    });
    if (!assignment) throw new NotFoundException('Assignment not found');

    const enrolled = await this.enrollments.find({
      where: { tenant_id: tenantId, course_id: assignment.course_id, status: 'ENROLLED' },
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
          status: sub?.marks_awarded ? 'GRADED' : sub ? 'SUBMITTED' : 'NOT_SUBMITTED',
        };
      }),
    };
  }

  async listSubmissions(facultyUserId: string, tenantId: string, assignmentId: string) {
    const assignment = await this.assignments.findOne({
      where: { tenant_id: tenantId, assignment_id: assignmentId, faculty_user_id: facultyUserId },
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
      })),
    };
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
      throw new ForbiddenException('You can grade only your assignment submissions');
    }

    const marks = Number(dto.marks_awarded);
    if (Number.isNaN(marks) || marks < 0 || marks > submission.assignment.max_marks) {
      throw new BadRequestException(`Marks must be between 0 and ${submission.assignment.max_marks}`);
    }

    submission.marks_awarded = marks.toFixed(2);
    submission.faculty_remarks = dto.faculty_remarks?.trim() || null;
    return this.submissions.save(submission);
  }

  async listStudentAssignments(studentUserId: string, tenantId: string) {
    const enrolled = await this.enrollments.find({
      where: { tenant_id: tenantId, student_user_id: studentUserId, status: 'ENROLLED' },
    });
    const courseIds = enrolled.map((row) => row.course_id);
    if (courseIds.length === 0) return [];

    const assignments = await this.assignments
      .createQueryBuilder('assignment')
      .leftJoinAndSelect('assignment.course', 'course')
      .where('assignment.tenant_id = :tenantId', { tenantId })
      .andWhere('assignment.course_id IN (:...courseIds)', { courseIds })
      .orderBy('assignment.due_date', 'ASC')
      .getMany();

    const submissions = await this.submissions.find({
      where: { tenant_id: tenantId, student_user_id: studentUserId },
    });
    const submissionByAssignment = new Map(submissions.map((row) => [row.assignment_id, row]));

    return assignments.map((assignment) => {
      const submission = submissionByAssignment.get(assignment.assignment_id);
      const pastDue = new Date(assignment.due_date).getTime() < Date.now();
      return {
        assignment,
        submission: submission ?? null,
        status: submission?.marks_awarded
          ? 'GRADED'
          : submission
            ? 'SUBMITTED'
            : pastDue
              ? 'OVERDUE'
              : 'PENDING',
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

    if (new Date() > new Date(assignment.due_date)) {
      throw new ForbiddenException('The deadline for this assignment has passed.');
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
    if (!enrollment) throw new ForbiddenException('You are not enrolled in this course');

    const stored = await this.persistAssignmentFile(tenantId, 'assignment-submissions', file!);
    await this.submissions.upsert(
      {
        tenant_id: tenantId,
        assignment_id: assignmentId,
        student_user_id: studentUserId,
        file_path: stored.filePath,
        file_key: stored.fileKey,
        submitted_at: new Date(),
        marks_awarded: null,
        faculty_remarks: null,
      },
      ['tenant_id', 'assignment_id', 'student_user_id'],
    );

    return this.submissions.findOne({
      where: { tenant_id: tenantId, assignment_id: assignmentId, student_user_id: studentUserId },
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
      throw new ForbiddenException('You can download only your assignment submissions');
    }
    return submission;
  }

  async streamSubmissionFile(submission: AssignmentSubmission) {
    if (submission.file_key && this.objectStorage.isEnabled()) {
      const stream = await this.objectStorage.getDownloadStream(submission.file_key);
      return { stream, filename: `${submission.submission_id}.pdf`, mimeType: 'application/pdf' };
    }
    const uploadRoot = resolve(process.env.UPLOAD_PATH || './uploads');
    const filePath = submission.file_path.startsWith('/')
      ? submission.file_path
      : resolve(process.cwd(), submission.file_path);
    const resolved = filePath.includes(uploadRoot) ? filePath : resolve(uploadRoot, submission.file_path);
    if (!existsSync(resolved)) throw new NotFoundException('File not found on server');
    return {
      stream: createReadStream(resolved),
      filename: basename(resolved),
      mimeType: 'application/pdf',
    };
  }

  private async assertFacultyTeachesCourse(courseId: string, facultyUserId: string, tenantId: string) {
    const row = await this.timetable.findOne({
      where: { tenant_id: tenantId, course_id: courseId, faculty_user_id: facultyUserId },
    });
    if (!row) throw new NotFoundException('Course not found in your teaching timetable');
  }

  private async persistAssignmentFile(
    tenantId: string,
    folder: string,
    file: Express.Multer.File,
  ): Promise<{ filePath: string; fileKey: string | null }> {
    const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
    if (this.objectStorage.isEnabled()) {
      const key = this.objectStorage.buildKey(tenantId, `${folder}/${uniqueName}`);
      const stored = await this.objectStorage.upload(tenantId, key, file.buffer, file.mimetype);
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
