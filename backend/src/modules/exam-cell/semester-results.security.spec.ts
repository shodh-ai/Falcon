import { ConflictException, ForbiddenException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { SemesterResultsService } from './semester-results.service';

type Row = Record<string, unknown>;

function setup() {
  const query = jest.fn<Promise<Row[]>, [string, unknown[]?]>();
  const manager = { query } as unknown as EntityManager;
  const globalQuery = jest.fn();
  const transaction = jest.fn(
    async (work: (manager: EntityManager) => Promise<unknown>) => work(manager),
  );
  const db = { query: globalQuery, transaction } as unknown as DataSource;
  return {
    service: new SemesterResultsService(db),
    query,
    globalQuery,
    transaction,
  };
}

const enrollment = {
  student_user_id: 'student-one',
  student_name: 'Demo Student',
  student_email: 'demo@example.invalid',
  enrollment_number: 'DEMO-1',
  course_id: 'course-one',
  course_code: 'DEMO101',
  course_name: 'Demo Course',
  credits: 4,
  grade: 'A',
  grade_points: 9,
  status: 'COMPLETED',
};

describe('semester grade-card snapshot preservation (mocked transactions)', () => {
  it('generates drafts using only the transaction manager and the semester lock', async () => {
    const { service, query, globalQuery, transaction } = setup();
    query
      .mockResolvedValueOnce([]) // advisory lock
      .mockResolvedValueOnce([]) // no protected card
      .mockResolvedValueOnce([enrollment])
      .mockResolvedValueOnce([
        { student_user_id: 'student-one', points: 36, credits: 4 },
      ])
      .mockResolvedValueOnce([]) // UFM
      .mockResolvedValueOnce([]) // existing draft
      .mockResolvedValueOnce([]); // insert
    const result = await service.generateGradeCards('tenant-one', 1);
    expect(result.generated_count).toBe(1);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(globalQuery).not.toHaveBeenCalled();
    expect(query.mock.calls[0]).toEqual([
      expect.stringContaining('pg_advisory_xact_lock'),
      ['falcon:grade-cards:tenant-one:1'],
    ]);
    expect(query.mock.calls[6][0]).toContain('INSERT INTO grade_cards');
  });

  it.each([
    'PUBLISHED',
    'published_at',
    'PROVISIONAL',
    'FINAL',
    'provisional_published_at',
    'final_published_at',
  ])(
    'blocks the whole batch when protected marker %s exists',
    async (marker) => {
      const { service, query, globalQuery } = setup();
      query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ grade_card_id: 'issued' }]);
      await expect(
        service.generateGradeCards('tenant-one', 1),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).toContain(marker);
      expect(
        query.mock.calls.some(([sql]) => /^\s*(UPDATE|INSERT)\b/.test(sql)),
      ).toBe(false);
      expect(globalQuery).not.toHaveBeenCalled();
    },
  );

  it('conditionally rechecks protection before replacing an existing draft', async () => {
    const { service, query } = setup();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([enrollment])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ grade_card_id: 'draft' }])
      .mockResolvedValueOnce([]); // update refused
    await expect(
      service.generateGradeCards('tenant-one', 1),
    ).rejects.toBeInstanceOf(ConflictException);
    const [sql] = query.mock.calls[6];
    expect(sql).toContain("status <> 'PUBLISHED' AND published_at IS NULL");
    expect(sql).toContain('RETURNING grade_card_id');
  });

  it('propagates a failed required write instead of returning success', async () => {
    const { service, query } = setup();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([enrollment])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('required write failed'));
    await expect(service.generateGradeCards('tenant-one', 1)).rejects.toThrow(
      'required write failed',
    );
  });

  it('does not downgrade a final card to provisional', async () => {
    const { service, query } = setup();
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { grade_card_id: 'issued', payload: { result_stage: 'FINAL' } },
      ]);
    await expect(
      service.publishProvisional('tenant-one', 1),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('preserves final publication history even after the card is withheld', async () => {
    const { service, query } = setup();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        grade_card_id: 'issued',
        payload: {
          result_stage: 'WITHHELD',
          final_published_at: '2026-01-01',
        },
      },
    ]);
    await expect(
      service.publishProvisional('tenant-one', 1),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('makes repeated final publication a no-op without changing timestamps or contents', async () => {
    const { service, query, globalQuery } = setup();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        grade_card_id: 'issued',
        payload: { result_stage: 'FINAL', final_published_at: '2026-01-01' },
      },
    ]);
    await expect(service.finalize('tenant-one', 1)).resolves.toEqual({
      semester: 1,
      result_stage: 'FINAL',
      updated_count: 0,
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(globalQuery).not.toHaveBeenCalled();
  });

  it('promotes provisional to final without replacing the saved course snapshot', async () => {
    const { service, query } = setup();
    const courses = [{ course_id: 'course-one', grade: 'A' }];
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          grade_card_id: 'issued',
          payload: {
            result_stage: 'PROVISIONAL',
            provisional_published_at: '2026-01-01',
            courses,
          },
        },
      ])
      .mockResolvedValueOnce([]);
    await expect(service.finalize('tenant-one', 1)).resolves.toMatchObject({
      updated_count: 1,
    });
    expect(JSON.parse(String(query.mock.calls[2][1]?.[3]))).toMatchObject({
      result_stage: 'FINAL',
      provisional_published_at: '2026-01-01',
      courses,
    });
  });

  it.each(['', '   '])(
    'rejects missing tenant %j before any query',
    async (tenant) => {
      const { service, query, transaction } = setup();
      await expect(
        service.generateGradeCards(tenant, 1),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(query).not.toHaveBeenCalled();
      expect(transaction).not.toHaveBeenCalled();
    },
  );

  it.each([0, 1.5, NaN])(
    'rejects invalid semester %s before querying',
    async (semester) => {
      const { service, query } = setup();
      await expect(service.finalize('tenant-one', semester)).rejects.toThrow(
        'Valid semester',
      );
      expect(query).not.toHaveBeenCalled();
    },
  );
});
