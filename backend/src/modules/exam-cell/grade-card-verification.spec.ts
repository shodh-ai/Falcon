import { NotFoundException } from '@nestjs/common';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { createHash } from 'crypto';
import {
  GradeCardVerificationService,
  type GradeCardVerificationSnapshot,
} from './grade-card-verification.service';
import { SemesterResultsService } from './semester-results.service';

const publishedCard = (): GradeCardVerificationSnapshot => ({
  grade_card_id: '00000000-0000-4000-8000-000000000001',
  student_user_id: '00000000-0000-4000-8000-000000000002',
  tenant_id: '00000000-0000-4000-8000-000000000003',
  student_name: 'Synthetic Student',
  enrollment_number: 'SYNTHETIC-001',
  semester: 6,
  cgpa: '8.00',
  status: 'PUBLISHED',
  published_at: new Date('2026-10-19T00:00:00Z'),
  has_open_ufm: false,
  payload: {
    result_stage: 'PROVISIONAL',
    sgpa: 8,
    cgpa: 8,
    rank: 1,
    verification_id: 'SYNTHETIC-DISPLAY-ID',
    courses: [
      {
        course_id: 'synthetic-course',
        course_code: 'SYN101',
        course_name: 'Synthetic Course',
        credits: 4,
        grade: 'A',
        grade_points: 8,
        status: 'COMPLETED',
      },
    ],
  },
});

function harness(origin: string | undefined = 'https://verify.example.edu') {
  let card = publishedCard();
  let issued: Record<string, unknown> | null = null;
  const query = jest
    .fn<Promise<unknown[]>, [string, unknown[]]>()
    .mockImplementation((sql: string, params: unknown[]) => {
      if (sql.includes('INSERT INTO grade_card_verifications')) {
        issued = {
          token_hash: params[2],
          revision_hash: params[3],
          verification_stage: params[4],
          issued_at: new Date('2026-10-19T01:00:00Z'),
          revoked_at: null,
        };
        return Promise.resolve([{ verification_id: 'synthetic-issuance' }]);
      }
      if (sql.includes('FROM grade_card_verifications v')) {
        return Promise.resolve(
          issued?.token_hash === params[0] ? [{ ...card, ...issued }] : [],
        );
      }
      return Promise.resolve([card]);
    });
  const service = new GradeCardVerificationService(
    { query } as never,
    { get: jest.fn().mockReturnValue(origin) } as never,
  );
  return {
    service,
    query,
    getCard: () => card,
    setCard: (next: GradeCardVerificationSnapshot) => {
      card = next;
    },
    revoke: () => {
      issued = { ...issued, revoked_at: new Date() };
    },
  };
}

async function issueToken(test: ReturnType<typeof harness>) {
  const issued = await test.service.issue(
    test.getCard().tenant_id,
    test.getCard(),
  );
  if (!issued.url) throw new Error('Synthetic verification URL was not issued');
  return new URL(issued.url).pathname.split('/').pop()!;
}

describe('Grade-card public verification', () => {
  it.each(['PROVISIONAL', 'FINAL'])(
    'stores only a token hash and returns no private data for a published %s card',
    async (stage) => {
      const test = harness();
      test.setCard({
        ...test.getCard(),
        payload: { ...test.getCard().payload, result_stage: stage },
      });
      const token = await issueToken(test);
      expect(token.length).toBe(43);
      const insertParams = test.query.mock.calls[0][1];
      expect(insertParams).not.toContain(token);
      expect(insertParams[2]).toBe(
        createHash('sha256').update(token).digest('hex'),
      );
      await expect(test.service.verifyPublic(token)).resolves.toEqual({
        valid: true,
        document_type: 'SEMESTER_GRADE_CARD',
        semester: 6,
        result_stage: stage,
        issued_at: new Date('2026-10-19T01:00:00Z'),
      });
      const lookupSql = test.query.mock.calls[1][0];
      expect(lookupSql).toContain('g.tenant_id = v.tenant_id');
      expect(lookupSql).toContain('u.tenant_id = g.tenant_id');
    },
  );

  it.each(['DRAFT', 'WITHHELD', undefined])(
    'rejects a PUBLISHED status with an unpublished payload stage %s',
    async (stage) => {
      const test = harness();
      const token = await issueToken(test);
      test.setCard({
        ...test.getCard(),
        payload: { ...test.getCard().payload, result_stage: stage },
      });
      await expect(test.service.verifyPublic(token)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      test.query.mockClear();
      await expect(
        test.service.issue(test.getCard().tenant_id, test.getCard()),
      ).resolves.toMatchObject({ url: null });
      expect(test.query).not.toHaveBeenCalled();
    },
  );

  it('preserves an unverified staff preview if the verification migration is missing', async () => {
    const test = harness();
    test.query.mockRejectedValueOnce(
      Object.assign(new Error('Verification storage not initialized'), {
        code: '42P01',
      }),
    );
    const result = await test.service.issue(
      test.getCard().tenant_id,
      test.getCard(),
    );
    expect(result.url).toBeNull();
    expect(result.notice).toContain('storage is not initialized');
  });

  it('rejects malformed and tampered tokens without exposing records', async () => {
    const test = harness();
    await expect(
      test.service.verifyPublic('predictable-student-id'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(test.query).not.toHaveBeenCalled();
    const token = await issueToken(test);
    const tampered = `${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`;
    await expect(test.service.verifyPublic(tampered)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it.each(['DRAFT', 'WITHHELD'])(
    'does not issue or verify %s grade cards',
    async (status) => {
      const test = harness();
      const token = await issueToken(test);
      test.setCard({ ...test.getCard(), status });
      await expect(test.service.verifyPublic(token)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      test.query.mockClear();
      await expect(
        test.service.issue(test.getCard().tenant_id, test.getCard()),
      ).resolves.toMatchObject({ url: null });
      expect(test.query).not.toHaveBeenCalled();
    },
  );

  it('rejects revoked tokens and any changed published revision', async () => {
    const revoked = harness();
    const revokedToken = await issueToken(revoked);
    revoked.revoke();
    await expect(
      revoked.service.verifyPublic(revokedToken),
    ).rejects.toBeInstanceOf(NotFoundException);
    const revised = harness();
    const oldToken = await issueToken(revised);
    revised.setCard({
      ...revised.getCard(),
      payload: { ...revised.getCard().payload, sgpa: 9 },
    });
    await expect(revised.service.verifyPublic(oldToken)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects cross-tenant identity and open UFM records', async () => {
    const test = harness();
    await expect(
      test.service.issue('another-tenant', test.getCard()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(test.query).not.toHaveBeenCalled();
    const token = await issueToken(test);
    test.setCard({ ...test.getCard(), tenant_id: 'another-tenant' });
    await expect(test.service.verifyPublic(token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    test.setCard({ ...publishedCard(), has_open_ufm: true });
    await expect(test.service.verifyPublic(token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('does not issue or verify a card requiring regeneration even if its status is PUBLISHED', async () => {
    const test = harness();
    const token = await issueToken(test);
    test.setCard({
      ...test.getCard(),
      payload: { ...test.getCard().payload, requires_regeneration: true },
    });
    await expect(test.service.verifyPublic(token)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    test.query.mockClear();
    await expect(
      test.service.issue(test.getCard().tenant_id, test.getCard()),
    ).resolves.toMatchObject({ url: null });
    expect(test.query).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    'http://public.example.edu',
    'https://user:password@example.edu',
    'https://example.edu/private',
  ])(
    'keeps staff previews unverified for absent or unsafe origin %s',
    async (origin) => {
      const test = harness(origin);
      // Passing undefined must represent absent configuration, rather than the harness default.
      if (origin === undefined) {
        const absent = new GradeCardVerificationService(
          { query: test.query } as never,
          { get: () => undefined } as never,
        );
        await expect(
          absent.issue(test.getCard().tenant_id, test.getCard()),
        ).resolves.toMatchObject({ url: null });
      } else {
        await expect(
          test.service.issue(test.getCard().tenant_id, test.getCard()),
        ).resolves.toMatchObject({ url: null });
      }
      expect(test.query).not.toHaveBeenCalled();
    },
  );

  it('accepts an explicit loopback origin for disposable local testing', async () => {
    const test = harness('http://127.0.0.1:4400');
    const token = await issueToken(test);
    await expect(test.service.verifyPublic(token)).resolves.toMatchObject({
      valid: true,
    });
  });
});

describe('Grade-card regeneration publication gate', () => {
  it.each(['provisional', 'final'])(
    'rejects %s publication before any write when any semester card requires regeneration',
    async (stage) => {
      const card = publishedCard();
      const query = jest
        .fn<Promise<unknown[]>, [string, unknown[]]>()
        .mockResolvedValue([
          card,
          {
            ...card,
            grade_card_id: 'another-card',
            payload: { ...card.payload, requires_regeneration: true },
          },
        ]);
      const service = new SemesterResultsService(
        {
          transaction: (
            work: (manager: { query: typeof query }) => Promise<unknown>,
          ) => work({ query }),
        } as never,
        {} as never,
      );
      await expect(
        stage === 'final'
          ? service.finalize(card.tenant_id, card.semester)
          : service.publishProvisional(card.tenant_id, card.semester),
      ).rejects.toThrow(
        'Regenerate grade cards for this semester before publishing updated results',
      );
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[0]).toEqual([
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`exam-grade-cards:${card.tenant_id}`],
      ]);
      expect(query.mock.calls[1][0]).toContain(
        'ORDER BY grade_card_id FOR UPDATE',
      );
      expect(
        query.mock.calls.some(([sql]) => sql.includes('UPDATE grade_cards')),
      ).toBe(false);
    },
  );

  it('locks the semester batch and merges only stage metadata into current persisted payloads', async () => {
    const card = publishedCard();
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([card])
      .mockResolvedValueOnce([{ grade_card_id: card.grade_card_id }]);
    const transaction = jest.fn(
      (work: (manager: { query: typeof query }) => Promise<unknown>) =>
        work({ query }),
    );
    const service = new SemesterResultsService(
      { transaction } as never,
      {} as never,
    );
    await expect(
      service.publishProvisional(card.tenant_id, card.semester),
    ).resolves.toMatchObject({ updated_count: 1, result_stage: 'PROVISIONAL' });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`exam-grade-cards:${card.tenant_id}`],
    ]);
    expect(query.mock.calls[1][0]).toContain(
      'ORDER BY grade_card_id FOR UPDATE',
    );
    const [sql, params] = query.mock.calls[2];
    expect(sql).toContain(
      "payload = COALESCE(payload, '{}'::jsonb) || $3::jsonb",
    );
    expect(sql).toContain(
      "COALESCE(payload->>'requires_regeneration', 'false') <> 'true'",
    );
    const patch = JSON.parse(String(params[2])) as Record<string, unknown>;
    expect(Object.keys(patch).sort()).toEqual([
      'provisional_published_at',
      'result_stage',
    ]);
  });

  it('rejects the enclosing transaction if checked publication does not update the entire locked batch', async () => {
    const card = publishedCard();
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([card, { ...card, grade_card_id: 'second-card' }])
      .mockResolvedValueOnce([{ grade_card_id: card.grade_card_id }]);
    let committed = false;
    let rollbackRequested = false;
    const transaction = jest.fn(
      async (work: (manager: { query: typeof query }) => Promise<unknown>) => {
        try {
          const result = await work({ query });
          committed = true;
          return result;
        } catch (error) {
          rollbackRequested = true;
          throw error;
        }
      },
    );
    const service = new SemesterResultsService(
      { transaction } as never,
      {} as never,
    );
    await expect(
      service.finalize(card.tenant_id, card.semester),
    ).rejects.toThrow('Grade cards changed during publication');
    expect(committed).toBe(false);
    expect(rollbackRequested).toBe(true);
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('actual grade-card generation replaces the stale snapshot without preserving its regeneration marker', async () => {
    const card = publishedCard();
    let releaseLock!: () => void;
    const lock = new Promise<unknown[]>((resolve) => {
      releaseLock = () => resolve([]);
    });
    const query = jest
      .fn<Promise<unknown[]>, [string, unknown[]]>()
      .mockImplementation((sql) => {
        if (sql.includes('pg_advisory_xact_lock')) return lock;
        if (sql.includes('SUM(CASE'))
          return Promise.resolve([
            {
              student_user_id: card.student_user_id,
              points: '36',
              credits: '4',
            },
          ]);
        if (sql.includes('FROM student_course_enrollments e'))
          return Promise.resolve([
            {
              student_user_id: card.student_user_id,
              student_name: card.student_name,
              student_email: 'synthetic@example.test',
              enrollment_number: card.enrollment_number,
              course_id: 'synthetic-course',
              course_code: 'SYN101',
              course_name: 'Updated Synthetic Course',
              credits: 4,
              grade: 'A+',
              grade_points: 9,
              status: 'COMPLETED',
            },
          ]);
        if (sql.includes('SELECT grade_card_id FROM grade_cards'))
          return Promise.resolve([{ grade_card_id: card.grade_card_id }]);
        return Promise.resolve([]);
      });
    const outsideTransactionQuery = jest.fn();
    const transaction = jest.fn(
      (work: (manager: { query: typeof query }) => Promise<unknown>) =>
        work({ query }),
    );
    const service = new SemesterResultsService(
      { query: outsideTransactionQuery, transaction } as never,
      {} as never,
    );
    const generation = service.generateGradeCards(
      card.tenant_id,
      card.semester,
    );
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`exam-grade-cards:${card.tenant_id}`],
    ]);
    expect(outsideTransactionQuery).not.toHaveBeenCalled();
    releaseLock();
    const result = await generation;
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(outsideTransactionQuery).not.toHaveBeenCalled();
    expect(query.mock.calls[1][0]).toContain(
      'FROM student_course_enrollments e',
    );
    const update = query.mock.calls.find(([sql]) =>
      sql.includes('SET cgpa = $4, status = $5, payload = $6::jsonb'),
    );
    expect(update).toBeDefined();
    const persistedPayload = JSON.parse(String(update![1][5])) as Record<
      string,
      unknown
    >;
    expect(persistedPayload.requires_regeneration).toBeUndefined();
    expect(persistedPayload.sgpa).toBe(9);
    expect(persistedPayload.cgpa).toBe(9);
    expect(persistedPayload.result_stage).toBe('DRAFT');
    expect(result.cards[0].requires_regeneration).toBeUndefined();
  });
});

describe('Semester grade-card PDF verification content', () => {
  afterEach(() => jest.restoreAllMocks());

  it('preserves every course and grade on continuation pages with verification only on the final page', async () => {
    const test = harness();
    const courses = Array.from({ length: 110 }, (_, index) => ({
      course_id: `synthetic-course-${index}`,
      course_code: `SYN${String(index + 1).padStart(3, '0')}`,
      course_name: `Synthetic Course ${index + 1}`,
      credits: 4,
      grade: index % 2 === 0 ? 'A' : 'B',
      grade_points: index % 2 === 0 ? 8 : 7,
      status: 'COMPLETED',
    }));
    test.setCard({
      ...test.getCard(),
      payload: { ...test.getCard().payload, courses },
    });
    const text = jest.spyOn(PDFPage.prototype, 'drawText');
    const rectangles = jest.spyOn(PDFPage.prototype, 'drawRectangle');
    const service = new SemesterResultsService(
      { query: test.query } as never,
      test.service,
    );
    const result = await service.exportGradeCardPdf(
      test.getCard().tenant_id,
      test.getCard().grade_card_id,
    );
    const pdf = await PDFDocument.load(result.buffer);
    expect(pdf.getPageCount()).toBe(3);
    const courseCalls = text.mock.calls.filter(([value]) =>
      /^SYN\d{3} /.test(value),
    );
    expect(courseCalls.map(([value]) => value)).toEqual(
      courses.map((course) => `${course.course_code} — ${course.course_name}`),
    );
    expect(
      text.mock.calls
        .filter(([, options]) => options?.x === 350)
        .map(([value]) => value),
    ).toEqual(courses.map((course) => course.grade));
    expect(
      text.mock.calls.filter(([value]) => value === 'Course'),
    ).toHaveLength(3);
    expect(courseCalls.every(([, options]) => (options?.y ?? 0) >= 180)).toBe(
      true,
    );
    expect(
      rectangles.mock.calls.every(
        ([options]) => (options?.y ?? 0) + (options?.height ?? 0) <= 161,
      ),
    ).toBe(true);
    expect(new Set(rectangles.mock.contexts).size).toBe(1);
    const finalCoursePage: unknown =
      text.mock.contexts[
        text.mock.calls.findIndex(([value]) => value.startsWith('SYN110 '))
      ];
    expect(rectangles.mock.contexts[0]).toBe(finalCoursePage);
  });

  it('generates a real QR matrix linked to the published revision', async () => {
    const test = harness();
    const issue = jest.spyOn(test.service, 'issue');
    const rectangles = jest.spyOn(PDFPage.prototype, 'drawRectangle');
    const text = jest.spyOn(PDFPage.prototype, 'drawText');
    const service = new SemesterResultsService(
      { query: test.query } as never,
      test.service,
    );
    const result = await service.exportGradeCardPdf(
      test.getCard().tenant_id,
      test.getCard().grade_card_id,
    );
    expect((await PDFDocument.load(result.buffer)).getPageCount()).toBe(1);
    expect(rectangles.mock.calls.length).toBeGreaterThan(100);
    expect(text.mock.calls.map(([value]) => value).join('\n')).not.toContain(
      'Placeholder',
    );
    const issued = await (issue.mock.results[0].value as ReturnType<
      GradeCardVerificationService['issue']
    >);
    if (!issued.url)
      throw new Error('Synthetic verification URL was not issued');
    const token = new URL(issued.url).pathname.split('/').pop()!;
    await expect(test.service.verifyPublic(token)).resolves.toMatchObject({
      valid: true,
      result_stage: 'PROVISIONAL',
    });
  });

  it('prints an explicit unverified staff-preview notice without a QR for drafts', async () => {
    const test = harness();
    test.setCard({
      ...test.getCard(),
      status: 'DRAFT',
      payload: { ...test.getCard().payload, result_stage: 'DRAFT' },
    });
    const rectangles = jest.spyOn(PDFPage.prototype, 'drawRectangle');
    const text = jest.spyOn(PDFPage.prototype, 'drawText');
    const service = new SemesterResultsService(
      { query: test.query } as never,
      test.service,
    );
    const result = await service.exportGradeCardPdf(
      test.getCard().tenant_id,
      test.getCard().grade_card_id,
    );
    expect((await PDFDocument.load(result.buffer)).getPageCount()).toBe(1);
    expect(rectangles).not.toHaveBeenCalled();
    expect(text.mock.calls.map(([value]) => value).join('\n')).toContain(
      'Unverified staff preview',
    );
    expect(
      test.query.mock.calls.some(([sql]) =>
        sql.includes('INSERT INTO grade_card_verifications'),
      ),
    ).toBe(false);
  });
});
