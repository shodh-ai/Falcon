import { Test, TestingModule } from '@nestjs/testing';
import { AcademicsService } from './academics.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { HelpdeskTicket } from '../../entities/helpdesk-ticket.entity';
import { StudentProfile } from '../../entities/student-profile.entity';
import { User } from '../../entities/user.entity';
import { NotificationEmitterService } from '../../core/notifications/notification-emitter.service';
import { StudentCourseEnrollment } from '../../entities/student-course-enrollment.entity';
import { Subject } from '../../entities/subject.entity';
import { Batch } from '../../entities/batch.entity';
import { StaffLeaveRequest } from '../../entities/staff-leave-request.entity';
import { StaffGatePass } from '../../entities/staff-gate-pass.entity';
import { AcademicCourse } from '../../entities/academic-course.entity';
import { AcademicTimetable } from '../../entities/academic-timetable.entity';
import { StaffAttendance } from '../../entities/staff-attendance.entity';
import { GradingPolicy } from '../../entities/grading-policy.entity';
import { ExamResult } from '../../entities/exam-result.entity';
import { AttendanceRecord } from '../../entities/attendance-record.entity';
import { StudentEnrollmentSyncService } from './student-enrollment-sync.service';
import { StudentMentorSyncService } from './student-mentor-sync.service';
import { DeanAuditService } from './dean-audit.service';
import { EnterpriseAuditService } from '../../core/audit/enterprise-audit.service';

describe('AcademicsService', () => {
  let service: AcademicsService;

  const mockHelpdeskTickets = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockUsers = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    manager: {
      query: jest.fn(),
    },
  };

  const mockStudentProfiles = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
  };

  const mockRepository = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  const mockNotify = {
    emit: jest.fn(),
  };

  const mockEnrollmentSync = {
    syncStudentEnrollments: jest.fn(),
  };

  const mockMentorSync = {
    syncStudentMentors: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AcademicsService,
        {
          provide: getRepositoryToken(HelpdeskTicket),
          useValue: mockHelpdeskTickets,
        },
        { provide: getRepositoryToken(User), useValue: mockUsers },
        {
          provide: getRepositoryToken(StudentProfile),
          useValue: mockStudentProfiles,
        },
        {
          provide: getRepositoryToken(StudentCourseEnrollment),
          useValue: mockRepository,
        },
        { provide: getRepositoryToken(Subject), useValue: mockRepository },
        { provide: getRepositoryToken(Batch), useValue: mockRepository },
        {
          provide: getRepositoryToken(AttendanceRecord),
          useValue: mockRepository,
        },
        { provide: getRepositoryToken(ExamResult), useValue: mockRepository },
        {
          provide: getRepositoryToken(GradingPolicy),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(AcademicCourse),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(AcademicTimetable),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(StaffAttendance),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(StaffLeaveRequest),
          useValue: mockRepository,
        },
        {
          provide: getRepositoryToken(StaffGatePass),
          useValue: mockRepository,
        },
        { provide: NotificationEmitterService, useValue: mockNotify },
        {
          provide: StudentEnrollmentSyncService,
          useValue: mockEnrollmentSync,
        },
        { provide: StudentMentorSyncService, useValue: mockMentorSync },
        {
          provide: DeanAuditService,
          useValue: { logAction: jest.fn(), recentActions: jest.fn().mockResolvedValue([]) },
        },
        {
          provide: EnterpriseAuditService,
          useValue: { logAction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<AcademicsService>(AcademicsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Dean scope resolution', () => {
    it('resolves departments from assigned schools via programs', async () => {
      mockUsers.manager.query
        .mockResolvedValueOnce([
          {
            school_id: 1,
            school_name: 'School of Engineering & Technology',
            school_code: 'SOET',
          },
        ])
        .mockResolvedValueOnce([{ dept_id: 10 }, { dept_id: 11 }])
        // HOD dept query (3rd raw query in resolveDeanScope)
        .mockResolvedValueOnce([])
        // user dept_id fallback query (4th)
        .mockResolvedValueOnce([{ dept_id: null }]);

      const scope = await (service as any).resolveDeanScope('dean-user-id');

      expect(scope.schoolIds).toEqual([1]);
      expect(scope.departmentIds).toEqual([10, 11]);
      expect(scope.schools[0].school_name).toBe(
        'School of Engineering & Technology',
      );
    });

    it('falls back to dean dept_id when no school programs are linked', async () => {
      // schoolIds empty → deptRows query is skipped; only 3 queries: schoolRows, hodDeptRows, deanRow
      mockUsers.manager.query
        .mockResolvedValueOnce([])  // schoolRows
        .mockResolvedValueOnce([])  // hodDeptRows
        .mockResolvedValueOnce([{ dept_id: 5 }]);  // deanRow

      const scope = await (service as any).resolveDeanScope('dean-user-id');

      expect(scope.schoolIds).toEqual([]);
      expect(scope.departmentIds).toEqual([5]);
    });
  });

  describe('listProfileUpdateRequests', () => {
    it('should return empty array if no pending tickets', async () => {
      mockHelpdeskTickets.find.mockResolvedValue([]);

      const result = await service.listProfileUpdateRequests();

      expect(result).toEqual([]);
      expect(mockHelpdeskTickets.find).toHaveBeenCalledWith({
        where: { category: 'ACADEMICS', status: 'PENDING' },
        order: { created_at: 'ASC' },
      });
      expect(mockUsers.find).not.toHaveBeenCalled();
    });

    it('should map tickets with student and profile data', async () => {
      const tickets = [
        {
          ticket_id: 't1',
          student_user_id: 's1',
          subject: 'sub',
          description: 'desc',
          status: 'PENDING',
          created_at: new Date('2026-06-09'),
        },
      ];
      const students = [
        {
          user_id: 's1',
          name: 'John Doe',
          email: 'john@example.com',
          department: { dept_name: 'Computer Science' },
        },
      ];
      const profiles = [
        {
          user_id: 's1',
          enrollment_no: 'EN123',
          parent_info: { mobile: '1234567890', address: '123 Main St' },
        },
      ];

      mockHelpdeskTickets.find.mockResolvedValue(tickets);
      mockUsers.find.mockResolvedValue(students);
      mockStudentProfiles.find.mockResolvedValue(profiles);

      const result = await service.listProfileUpdateRequests();

      expect(result).toHaveLength(1);
      expect(result[0].ticket_id).toBe('t1');
      expect(result[0].student.name).toBe('John Doe');
      expect(result[0].student.enrollment_no).toBe('EN123');
      expect(result[0].student.mobile).toBe('1234567890');
      expect(result[0].student.address).toBe('123 Main St');
      expect(result[0].student.department).toBe('Computer Science');
    });
  });

  describe('resolveProfileUpdateRequest', () => {
    it('should throw NotFoundException if ticket not found', async () => {
      mockHelpdeskTickets.findOne.mockResolvedValue(null);

      await expect(
        service.resolveProfileUpdateRequest('admin1', 't1', {
          action: 'APPROVE',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should resolve and update profile on APPROVE', async () => {
      const ticket = {
        ticket_id: 't1',
        student_user_id: 's1',
        status: 'PENDING',
        conversation: [],
      };
      const profile = { user_id: 's1', parent_info: { mobile: 'old' } };

      mockHelpdeskTickets.findOne.mockResolvedValue(ticket);
      mockStudentProfiles.findOne.mockResolvedValue(profile);

      const result = await service.resolveProfileUpdateRequest('admin1', 't1', {
        action: 'APPROVE',
        updated_name: 'New Name',
        updated_mobile: 'new mobile',
      });

      expect(result.success).toBe(true);
      expect(ticket.status).toBe('RESOLVED');
      expect(ticket.conversation).toHaveLength(1);
      expect(ticket.conversation[0].message).toContain('approved and applied');

      expect(mockUsers.update).toHaveBeenCalledWith(
        { user_id: 's1' },
        { name: 'New Name' },
      );

      expect(profile.parent_info.mobile).toBe('new mobile');
      expect(mockStudentProfiles.save).toHaveBeenCalledWith(profile);
      expect(mockHelpdeskTickets.save).toHaveBeenCalledWith(ticket);
    });

    it('should reject without updating profile on REJECT', async () => {
      const ticket = {
        ticket_id: 't1',
        student_user_id: 's1',
        status: 'PENDING',
        conversation: [],
      };

      mockHelpdeskTickets.findOne.mockResolvedValue(ticket);

      const result = await service.resolveProfileUpdateRequest('admin1', 't1', {
        action: 'REJECT',
        rejection_reason: 'Invalid document',
      });

      expect(result.success).toBe(true);
      expect(ticket.status).toBe('RESOLVED');
      expect(ticket.conversation[0].message).toContain('rejected');
      expect(ticket.conversation[0].message).toContain('Invalid document');

      expect(mockUsers.update).not.toHaveBeenCalled();
      expect(mockStudentProfiles.save).not.toHaveBeenCalled();
      expect(mockHelpdeskTickets.save).toHaveBeenCalledWith(ticket);
    });
  });
});
