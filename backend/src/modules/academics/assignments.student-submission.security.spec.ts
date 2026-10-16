import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { AcademicAssignment } from '../../entities/academic-assignment.entity';
import { AssignmentSubmission } from '../../entities/assignment-submission.entity';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { AssignmentsService } from './assignments.service';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));

describe('Student assignment submission download isolation', () => {
  const tenantId = 'tenant-a';
  const studentId = 'student-a';
  const assignmentId = 'assignment-a';

  function setup() {
    const assignment = {
      assignment_id: assignmentId,
      tenant_id: tenantId,
      course_id: 'course-a',
      semester: 2,
      section_code: 'S',
      start_date: new Date('2026-01-01'),
      due_date: new Date('2026-01-10'),
      deleted_at: null,
    } as AcademicAssignment;
    const submission = {
      submission_id: 'submission-a',
      tenant_id: tenantId,
      student_user_id: studentId,
      assignment_id: assignmentId,
      assignment,
      file_path: 'uploads/tenant-a/assignment-submissions/solution.pdf',
      file_key: null,
      status: 'SUBMITTED',
      deleted_at: null,
    } as AssignmentSubmission;
    const enrollment = {
      tenant_id: tenantId,
      student_user_id: studentId,
      course_id: 'course-a',
      status: 'ENROLLED',
      semester: 2,
      section_code: 's',
      deleted_at: null,
    } as StudentCourseEnrollment;
    const submissions = { findOne: jest.fn().mockResolvedValue(submission) };
    const enrollments = { findOne: jest.fn().mockResolvedValue(enrollment) };
    const target = new AssignmentsService(
      {} as Repository<AcademicAssignment>,
      submissions as unknown as Repository<AssignmentSubmission>,
      {} as never,
      enrollments as unknown as Repository<StudentCourseEnrollment>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return {
      target,
      assignment,
      submission,
      enrollment,
      submissions,
      enrollments,
    };
  }

  it.each(['SUBMITTED', 'GRADED', 'RETURNED_FOR_REVISION'])(
    'allows only the owner to view an existing %s solution',
    async (status) => {
      const { target, submission, submissions, enrollments } = setup();
      submission.status = status;

      await expect(
        target.getSubmissionForStudentDownload(
          studentId,
          tenantId,
          assignmentId,
        ),
      ).resolves.toBe(submission);
      expect(submissions.findOne).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          assignment_id: assignmentId,
          student_user_id: studentId,
        },
        relations: ['assignment'],
      });
      expect(enrollments.findOne).toHaveBeenCalledWith({
        where: {
          tenant_id: tenantId,
          student_user_id: studentId,
          course_id: 'course-a',
          status: 'ENROLLED',
        },
      });
    },
  );

  it('keeps preview available after the upload deadline', async () => {
    const { target, submission, assignment } = setup();
    assignment.start_date = new Date(0);
    assignment.due_date = new Date(1);

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).resolves.toBe(submission);
  });

  it('returns not found for a missing submission without looking up enrollment', async () => {
    const { target, submissions, enrollments } = setup();
    submissions.findOne.mockResolvedValue(null);

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(enrollments.findOne).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, tenantId, assignmentId],
    [studentId, undefined, assignmentId],
    [studentId, tenantId, undefined],
  ])(
    'fails closed before querying when an identity parameter is missing',
    async (student, tenant, assignment) => {
      const { target, submissions, enrollments } = setup();

      await expect(
        target.getSubmissionForStudentDownload(
          student as string,
          tenant as string,
          assignment as string,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(submissions.findOne).not.toHaveBeenCalled();
      expect(enrollments.findOne).not.toHaveBeenCalled();
    },
  );

  it.each([
    [
      'another student',
      (row: AssignmentSubmission) => {
        row.student_user_id = 'student-b';
      },
    ],
    [
      'another tenant',
      (row: AssignmentSubmission) => {
        row.tenant_id = 'tenant-b';
      },
    ],
    [
      'another assignment',
      (row: AssignmentSubmission) => {
        row.assignment_id = 'assignment-b';
      },
    ],
    [
      'an archived submission',
      (row: AssignmentSubmission) => {
        row.deleted_at = new Date();
      },
    ],
    [
      'an archived assignment',
      (row: AssignmentSubmission) => {
        row.assignment.deleted_at = new Date();
      },
    ],
    [
      'a foreign assignment relation',
      (row: AssignmentSubmission) => {
        row.assignment.tenant_id = 'tenant-b';
      },
    ],
    [
      'a mismatched assignment relation',
      (row: AssignmentSubmission) => {
        row.assignment.assignment_id = 'assignment-b';
      },
    ],
  ] as const)(
    'denies %s even if returned by storage',
    async (_label, change) => {
      const { target, submission, enrollments } = setup();
      change(submission);

      await expect(
        target.getSubmissionForStudentDownload(
          studentId,
          tenantId,
          assignmentId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(enrollments.findOne).not.toHaveBeenCalled();
    },
  );

  it('denies a missing assignment relation', async () => {
    const { target, submission } = setup();
    submission.assignment = undefined as unknown as AcademicAssignment;

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('denies a student without a current enrollment', async () => {
    const { target, enrollments } = setup();
    enrollments.findOne.mockResolvedValue(null);

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies an archived enrollment', async () => {
    const { target, enrollment } = setup();
    enrollment.deleted_at = new Date();

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('denies a different semester', async () => {
    const { target, enrollment } = setup();
    enrollment.semester = 3;

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).rejects.toThrow('not assigned to your semester');
  });

  it('denies a different section', async () => {
    const { target, enrollment } = setup();
    enrollment.section_code = 'T';

    await expect(
      target.getSubmissionForStudentDownload(studentId, tenantId, assignmentId),
    ).rejects.toThrow('not assigned to your section');
  });
});
