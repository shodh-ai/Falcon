import {
  BadRequestException,
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import { GUARDS_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

describe('student exam data isolation', () => {
  afterEach(() => jest.restoreAllMocks());

  it('requires tenant and enrolled courses for schedule reads', async () => {
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest
        .fn<unknown, [string, Record<string, unknown>]>()
        .mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([]),
    };
    const schedules = { createQueryBuilder: () => builder };
    const unused = {} as never;
    const service = new ExamsService(
      schedules as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );
    await service.listUpcomingSchedulesForStudent('student-a', 'tenant-a');
    expect(builder.andWhere.mock.calls[0]).toEqual([
      's.tenant_id = :tenantId',
      { tenantId: 'tenant-a' },
    ]);
    expect(builder.andWhere.mock.calls[1][0]).toContain(
      'e.student_user_id = :studentUserId',
    );
    expect(builder.andWhere.mock.calls[1][0]).toContain(
      "e.status = 'ENROLLED'",
    );
    expect(builder.andWhere.mock.calls[1][0]).toContain('e.deleted_at IS NULL');
    expect(builder.andWhere.mock.calls[1][1]).toEqual({
      studentUserId: 'student-a',
    });
    expect(builder.andWhere.mock.calls[1][0]).not.toContain('e.semester =');
    expect(builder.orderBy).toHaveBeenCalledWith('s.exam_date', 'ASC');
    expect(builder.addOrderBy).toHaveBeenCalledWith('s.start_time', 'ASC');
  });

  it('binds the semester inside the authenticated student enrollment scope', async () => {
    const row = { exam_schedule_id: 'exam-a', subject_id: 7 };
    const builder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest
        .fn<unknown, [string, Record<string, unknown>]>()
        .mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([row]),
    };
    const unused = {} as never;
    const service = new ExamsService(
      { createQueryBuilder: () => builder } as never,
      unused,
      unused,
      unused,
      unused,
      unused,
      unused,
    );

    await expect(
      service.listUpcomingSchedulesForStudent('student-a', 'tenant-a', 3),
    ).resolves.toEqual([row]);
    expect(builder.andWhere.mock.calls[0]).toEqual([
      's.tenant_id = :tenantId',
      { tenantId: 'tenant-a' },
    ]);
    const [enrollmentSql, params] = builder.andWhere.mock.calls[1];
    expect(enrollmentSql).toContain('EXISTS (');
    expect(enrollmentSql).toContain('e.tenant_id = :tenantId');
    expect(enrollmentSql).toContain('e.student_user_id = :studentUserId');
    expect(enrollmentSql).toContain("e.status = 'ENROLLED'");
    expect(enrollmentSql).toContain('e.deleted_at IS NULL');
    expect(enrollmentSql).toContain('AND e.semester = :semester');
    expect(params).toEqual({ studentUserId: 'student-a', semester: 3 });
  });

  it.each([
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    'rejects invalid semester %p before reading schedules',
    async (semester) => {
      const schedules = { createQueryBuilder: jest.fn() };
      const unused = {} as never;
      const service = new ExamsService(
        schedules as never,
        unused,
        unused,
        unused,
        unused,
        unused,
        unused,
      );
      await expect(
        service.listUpcomingSchedulesForStudent(
          'student-a',
          'tenant-a',
          semester,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(schedules.createQueryBuilder).not.toHaveBeenCalled();
    },
  );

  it('preserves student authentication guards and forwards the optional semester', async () => {
    const listUpcomingSchedulesForStudent = jest.fn().mockResolvedValue([]);
    const controller = new ExamsController({
      listUpcomingSchedulesForStudent,
    } as never);
    const req = { user: { user_id: 'student-a', tenant_id: 'tenant-a' } };
    await controller.schedule(req, 3);
    expect(listUpcomingSchedulesForStudent).toHaveBeenLastCalledWith(
      'student-a',
      'tenant-a',
      3,
    );
    await controller.schedule(req);
    expect(listUpcomingSchedulesForStudent).toHaveBeenLastCalledWith(
      'student-a',
      'tenant-a',
      undefined,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ExamsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
    const scheduleHandler = Object.getOwnPropertyDescriptor(
      ExamsController.prototype,
      'schedule',
    )?.value as object;
    expect(Reflect.getMetadata(ROLES_KEY, scheduleHandler)).toEqual([
      'Student',
    ]);
  });

  it('uses the registered query pipe to accept omitted/integer semesters and reject malformed values', async () => {
    const metadata = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      ExamsController,
      'schedule',
    ) as Record<string, { data?: string; pipes?: ParseIntPipe[] }>;
    const pipe = Object.values(metadata).find(
      (parameter) => parameter.data === 'semester',
    )?.pipes?.[0];
    expect(pipe).toBeInstanceOf(ParseIntPipe);
    const argument = {
      type: 'query' as const,
      metatype: Number,
      data: 'semester',
    };
    await expect(
      pipe!.transform(undefined as never, argument),
    ).resolves.toBeUndefined();
    await expect(pipe!.transform('3', argument)).resolves.toBe(3);
    for (const value of ['1.5', 'abc', '', '2 OR 1=1']) {
      await expect(pipe!.transform(value, argument)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });

  it('does not create an exam application for another student or tenant course', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValue([]);
    const applications = { create: jest.fn(), save: jest.fn() };
    const unused = {} as never;
    const service = new ExamsService(
      unused,
      applications as never,
      unused,
      { query } as never,
      unused,
      unused,
      unused,
    );
    await expect(
      service.createApplication(
        'student-a',
        { subject_id: 99, application_type: 'BACKLOG' },
        'tenant-a',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.mock.calls[0][1]).toEqual(['student-a', 'tenant-a', 99]);
    expect(query.mock.calls[0][0]).toContain('e.student_user_id = $1');
    expect(query.mock.calls[0][0]).toContain('e.tenant_id = $2');
    expect(query.mock.calls[0][0]).toContain('e.deleted_at IS NULL');
    expect(query.mock.calls[0][0]).toContain(
      "e.status IN ('ENROLLED', 'COMPLETED', 'FAILED')",
    );
    expect(applications.create).not.toHaveBeenCalled();
    expect(applications.save).not.toHaveBeenCalled();
  });

  it.each<['production' | 'development', string | undefined]>([
    ['production', 'true'],
    ['development', undefined],
  ])(
    'does not bypass eligibility in %s with demo flag %p',
    async (environment, demoFlag) => {
      jest.replaceProperty(process, 'env', {
        ...process.env,
        NODE_ENV: environment,
        ADMIT_CARD_DEMO_BYPASS: demoFlag,
      });
      const unused = {} as never;
      const service = new ExamsService(
        unused,
        unused,
        unused,
        unused,
        { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
        unused,
        {
          evaluate: jest.fn().mockResolvedValue({
            eligible: false,
            reason: 'shortfall',
            attendance_percent: 10,
            effective_threshold: 75,
          }),
        } as never,
      );
      const eligibility = await service.checkEligibility(
        'student-a',
        'tenant-a',
      );
      expect(eligibility.eligible).toBe(false);
      expect(eligibility.attendance_percent).toBe(10);
      expect(eligibility.reasons).toHaveLength(1);
    },
  );

  it('propagates hall-ticket database failures instead of generating a misleading PDF', async () => {
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockImplementation((sql: string) => {
        if (sql.includes('FROM exam_schedules'))
          return Promise.reject(new Error('Database unavailable'));
        return Promise.resolve([
          { user_id: 'student-a', name: 'Student A', email: 'a@example.test' },
        ]);
      });
    const pdf = { generate: jest.fn() };
    const unused = {} as never;
    const service = new ExamsService(
      unused,
      unused,
      unused,
      { query } as never,
      { getPendingDues: jest.fn().mockResolvedValue([]) } as never,
      pdf as never,
      {
        evaluate: jest.fn().mockResolvedValue({
          eligible: true,
          attendance_percent: 80,
          effective_threshold: 75,
        }),
      } as never,
    );
    await expect(
      service.generateAdmitCardOrThrow('student-a', 'tenant-a'),
    ).rejects.toThrow('Database unavailable');
    expect(pdf.generate).not.toHaveBeenCalled();
  });
});
