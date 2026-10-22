import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { ExamsService } from './exams.service';

describe('Examination application persistence', () => {
  function setup(
    duplicate = false,
    sources: Array<{
      max_marks: unknown;
      result_id?: string;
      session_id?: string;
      mark_id?: string;
    }> = [{ max_marks: '50' }],
    enrolled = true,
    legacySources: Array<{ max_marks: unknown }> = [],
  ) {
    const repository = {
      create: jest.fn((value: object) => value),
      save: jest.fn((value: object) =>
        Promise.resolve({ ...value, exam_application_id: 'application' }),
      ),
    };
    const query = jest.fn((sql: string) =>
      Promise.resolve(
        sql.includes('SELECT exam_application_id')
          ? duplicate
            ? [{ exam_application_id: 'existing' }]
            : []
          : sql.includes('SELECT ar.result_id, c.course_id')
            ? sources
            : sql.includes('SELECT ar.result_id, ar.course_id')
              ? legacySources
              : sql.includes('FROM student_course_enrollments')
                ? enrolled
                  ? [{}]
                  : []
                : [],
      ),
    );
    const manager = {
      query,
      getRepository: jest.fn().mockReturnValue(repository),
    };
    const finance = {
      createDemand: jest.fn().mockResolvedValue({ demand_id: 'demand' }),
      notifyDemandGenerated: jest.fn(),
    };
    const service = new ExamsService(
      {} as never,
      {} as never,
      { findOne: jest.fn().mockResolvedValue({ user_id: 'student' }) } as never,
      {
        transaction: async (
          callback: (executor: typeof manager) => Promise<unknown>,
        ) => callback(manager),
      } as never,
      finance as never,
      {} as never,
      {} as never,
    );
    return { service, repository, query, finance, manager };
  }

  it('rejects an active duplicate before creating another fee demand', async () => {
    const { service, finance, repository } = setup(true);
    await expect(
      service.createApplication('tenant', 'student', {
        subject_id: 1,
        application_type: 'RE_EVALUATION',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(finance.createDemand).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('saves application, demand and audit in the same transaction; notifies after it returns', async () => {
    const { service, manager, finance, query } = setup();
    await service.createApplication('tenant', 'student', {
      subject_id: 1,
      application_type: 'RE_EVALUATION',
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND s.semester = e.semester'),
      ['tenant', 'student', 1],
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('FOR UPDATE OF r, s, m, ar'),
      ['tenant', 'student', 1],
    );
    expect(finance.createDemand).toHaveBeenCalledWith(
      expect.objectContaining({
        student_user_id: 'student',
        total_amount: 500,
      }),
      'tenant',
      { manager, notify: false },
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO exam_audit_logs'),
      expect.arrayContaining(['EXAM_APPLICATION_CREATED', 'application']),
    );
    expect(finance.notifyDemandGenerated).toHaveBeenCalledWith(
      { demand_id: 'demand' },
      'tenant',
    );
  });

  it.each([
    ['unpublished', []],
    ['ambiguous', [{ max_marks: '50' }, { max_marks: '50' }]],
    ['missing maximum', [{ max_marks: null }]],
    ['zero maximum', [{ max_marks: '0' }]],
    ['nonfinite maximum', [{ max_marks: 'NaN' }]],
  ])(
    'rejects a %s source before application, fee or audit writes',
    async (_label, sources) => {
      const { service, finance, repository, query } = setup(false, sources);
      await expect(
        service.createApplication('tenant', 'student', {
          subject_id: 1,
          application_type: 'RE_EVALUATION',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.save).not.toHaveBeenCalled();
      expect(finance.createDemand).not.toHaveBeenCalled();
      expect(finance.notifyDemandGenerated).not.toHaveBeenCalled();
      expect(
        query.mock.calls.some(([sql]) =>
          sql.includes('INSERT INTO exam_audit_logs'),
        ),
      ).toBe(false);
    },
  );

  it('rejects a subject outside the enrolled semester before any writes', async () => {
    const { service, finance, repository } = setup(
      false,
      [{ max_marks: '50' }],
      false,
    );
    await expect(
      service.createApplication('tenant', 'student', {
        subject_id: 1,
        application_type: 'RE_EVALUATION',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repository.create).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });

  it('preserves a single supported legacy published source', async () => {
    const { service, finance } = setup(false, [], true, [{ max_marks: '50' }]);
    await service.createApplication('tenant', 'student', {
      subject_id: 1,
      application_type: 'RE_EVALUATION',
    });
    expect(finance.createDemand).toHaveBeenCalledTimes(1);
  });

  it('rejects multiple legacy published sources before charging', async () => {
    const { service, finance, repository } = setup(false, [], true, [
      { max_marks: '50' },
      { max_marks: '50' },
    ]);
    await expect(
      service.createApplication('tenant', 'student', {
        subject_id: 1,
        application_type: 'RE_EVALUATION',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(finance.createDemand).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('refuses fee-less generic backlog intake and requires an explicitly offered retake', async () => {
    const { service, finance, repository, query } = setup();
    await expect(
      service.createApplication('tenant', 'student', {
        subject_id: 1,
        application_type: 'BACKLOG',
      }),
    ).rejects.toThrow(
      'Apply through an available backlog or supplementary examination offering',
    );
    expect(finance.createDemand).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it('persists the selected source identities before charging when a subject has multiple exams', async () => {
    const sources = [
      {
        result_id: '11111111-1111-4111-8111-111111111111',
        session_id: '22222222-2222-4222-8222-222222222222',
        mark_id: '33333333-3333-4333-8333-333333333333',
        max_marks: '50',
      },
      {
        result_id: '44444444-4444-4444-8444-444444444444',
        session_id: '55555555-5555-4555-8555-555555555555',
        mark_id: '66666666-6666-4666-8666-666666666666',
        max_marks: '100',
      },
    ];
    const { service, repository, finance, query } = setup(false, sources);
    await service.createApplication('tenant', 'student', {
      subject_id: 1,
      application_type: 'RE_EVALUATION',
      source_result_id: sources[1].result_id,
      source_session_id: sources[1].session_id,
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        source_result_id: sources[1].result_id,
        source_session_id: sources[1].session_id,
        source_mark_id: sources[1].mark_id,
      }),
    );
    expect(finance.createDemand).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('AND ar.result_id = $4::uuid'),
      ['tenant', 'student', 1, sources[1].result_id, sources[1].session_id],
    );
  });

  it('rejects unavailable or mismatched source identities before any fee or application writes', async () => {
    const { service, repository, finance } = setup(false, [
      { result_id: '11111111-1111-4111-8111-111111111111', max_marks: '50' },
    ]);
    await expect(
      service.createApplication('tenant', 'student', {
        subject_id: 1,
        application_type: 'RE_EVALUATION',
        source_result_id: '44444444-4444-4444-8444-444444444444',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.create).not.toHaveBeenCalled();
    expect(finance.createDemand).not.toHaveBeenCalled();
  });
});
