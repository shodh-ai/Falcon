import { ForbiddenException } from '@nestjs/common';
import { AcademicsController } from './academics.controller';

jest.mock('uuid', () => ({ v4: () => 'test-uuid' }));
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

describe('student result access security', () => {
  const tenantId = 'tenant-a';
  const studentId = 'student-a';

  function controller(marksHistory: { getPublishedExamReports: jest.Mock }) {
    return new AcademicsController(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      marksHistory as never,
      {} as never,
      {} as never,
      {} as never,
    );
  }

  it('returns only declared reports for a student requesting their own ID', async () => {
    const reports = [{ result_id: 'result-a', grade: 'A' }];
    const marksHistory = {
      getPublishedExamReports: jest.fn().mockResolvedValue(reports),
    };

    await expect(
      controller(marksHistory).studentResults(studentId, {
        user: { user_id: studentId, role: 'Student', tenant_id: tenantId },
      }),
    ).resolves.toEqual(reports);
    expect(marksHistory.getPublishedExamReports).toHaveBeenCalledWith(
      tenantId,
      studentId,
    );
  });

  it('rejects a student requesting another student ID before querying', () => {
    const marksHistory = { getPublishedExamReports: jest.fn() };

    expect(() =>
      controller(marksHistory).studentResults('student-b', {
        user: { user_id: studentId, roles: ['Student'], tenant_id: tenantId },
      }),
    ).toThrow(ForbiddenException);
    expect(marksHistory.getPublishedExamReports).not.toHaveBeenCalled();
  });

  it('requires tenant context for staff access', () => {
    const marksHistory = { getPublishedExamReports: jest.fn() };

    expect(() =>
      controller(marksHistory).studentResults('student-b', {
        user: { user_id: 'faculty-a', roles: ['Faculty'] },
      }),
    ).toThrow(ForbiddenException);
    expect(marksHistory.getPublishedExamReports).not.toHaveBeenCalled();
  });

  it('passes the authenticated staff tenant when looking up another student', async () => {
    const marksHistory = {
      getPublishedExamReports: jest.fn().mockResolvedValue([]),
    };

    await controller(marksHistory).studentResults('student-b', {
      user: { user_id: 'faculty-a', roles: ['Faculty'], tenant_id: tenantId },
    });
    expect(marksHistory.getPublishedExamReports).toHaveBeenCalledWith(
      tenantId,
      'student-b',
    );
  });
});
