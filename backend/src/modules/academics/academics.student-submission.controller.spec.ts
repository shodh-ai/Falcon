import 'reflect-metadata';
import type { Response } from 'express';
import { ForbiddenException } from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { resolveApiModule } from '../../module-control/module-catalog';
import { AcademicsController } from './academics.controller';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
// This unit test does not exercise unrelated spreadsheet, PDF, notification,
// or faculty services. Isolate their heavyweight runtime dependencies.
jest.mock('./academics.service', () => ({ AcademicsService: jest.fn() }));
jest.mock('./academics-faculty.service', () => ({
  AcademicsFacultyService: jest.fn(),
}));
jest.mock('./assignments.service', () => ({ AssignmentsService: jest.fn() }));
jest.mock('./faculty-workspaces.service', () => ({
  FacultyWorkspacesService: jest.fn(),
}));
jest.mock('./course-lms.service', () => ({ CourseLmsService: jest.fn() }));
jest.mock('./academic-proxy.service', () => ({
  AcademicProxyService: jest.fn(),
}));
jest.mock('./pdf/marksheet-pdf.service', () => ({
  MarksheetPdfService: jest.fn(),
}));
jest.mock('./marks-history.service', () => ({
  MarksHistoryService: jest.fn(),
}));
jest.mock('./course-allocation-bulk.service', () => ({
  CourseAllocationBulkService: jest.fn(),
}));
jest.mock('./hod-portal-ext.service', () => ({
  HodPortalExtService: jest.fn(),
}));
jest.mock('./faculty-teaching-departments.service', () => ({
  FacultyTeachingDepartmentsService: jest.fn(),
}));

describe('Student own-submission PDF endpoint', () => {
  function setup() {
    const submission = { submission_id: 'submission-a' };
    const pipe = jest.fn().mockReturnValue('piped');
    const assignments = {
      getSubmissionForStudentDownload: jest.fn().mockResolvedValue(submission),
      streamSubmissionFile: jest.fn().mockResolvedValue({
        stream: { pipe },
        filename: 'solution.pdf',
        mimeType: 'application/pdf',
      }),
    };
    const target = new AcademicsController(
      {} as never,
      {} as never,
      assignments as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const req = { user: { user_id: 'student-a', tenant_id: 'tenant-a' } };
    return { target, assignments, submission, pipe, res, req, setHeader };
  }

  it('uses the authenticated student and tenant and returns a private inline PDF', async () => {
    const { target, assignments, submission, pipe, res, req, setHeader } =
      setup();

    await expect(
      target.downloadStudentSubmission('assignment-a', req, res),
    ).resolves.toBe('piped');

    expect(assignments.getSubmissionForStudentDownload).toHaveBeenCalledWith(
      'student-a',
      'tenant-a',
      'assignment-a',
    );
    expect(assignments.streamSubmissionFile).toHaveBeenCalledWith(submission);
    expect(setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      'inline; filename="solution.pdf"',
    );
    expect(setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(setHeader).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(pipe).toHaveBeenCalledWith(res);
  });

  it('never opens storage when ownership authorization fails', async () => {
    const { target, assignments, pipe, res, req, setHeader } = setup();
    assignments.getSubmissionForStudentDownload.mockRejectedValue(
      new ForbiddenException(),
    );

    await expect(
      target.downloadStudentSubmission('assignment-a', req, res),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(assignments.streamSubmissionFile).not.toHaveBeenCalled();
    expect(setHeader).not.toHaveBeenCalled();
    expect(pipe).not.toHaveBeenCalled();
  });

  it('requires a tenant before calling the service', async () => {
    const { target, assignments, res } = setup();

    await expect(
      target.downloadStudentSubmission(
        'assignment-a',
        { user: { user_id: 'student-a' } },
        res,
      ),
    ).rejects.toThrow();
    expect(assignments.getSubmissionForStudentDownload).not.toHaveBeenCalled();
  });

  it('keeps the endpoint Student-only and owned by the LMS module', () => {
    const handler = Object.getOwnPropertyDescriptor(
      AcademicsController.prototype,
      'downloadStudentSubmission',
    )?.value as object;
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
      'student/assignments/:assignmentId/submission/download',
    );
    expect(Reflect.getMetadata('roles', handler)).toEqual(['Student']);
    expect(
      resolveApiModule(
        '/api/academics/student/assignments/assignment-a/submission/download',
      ),
    ).toBe('lms_learning');
  });
});
