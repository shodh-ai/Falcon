import {
  type CanActivate,
  type ExecutionContext,
  type INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

// Real controller/pipes/role guard. Authentication and service are test doubles;
// PostgreSQL authorization/storage behavior is covered in the separate PG suite.
describe('issued hall-ticket HTTP boundary', () => {
  const tenant = '11111111-1111-4111-8111-111111111111';
  const student = '22222222-2222-4222-8222-222222222222';
  const entry = '33333333-3333-4333-8333-333333333333';
  const bytes = Buffer.from('%PDF-1.4\nissued fixture\n%%EOF');
  const exams = {
    generateAdmitCardOrThrow: jest.fn().mockResolvedValue(bytes),
    listIssuedAdmitCards: jest.fn().mockResolvedValue([]),
  };
  const base = '/api/academics/exams';
  let app: INestApplication<App>;

  beforeAll(async () => {
    const auth: CanActivate = {
      canActivate(context: ExecutionContext) {
        const req = context.switchToHttp().getRequest<{
          headers: Record<string, string | undefined>;
          user?: object;
        }>();
        const role = req.headers['x-fixture-role'];
        if (!role) throw new UnauthorizedException();
        req.user = {
          role,
          user_id: student,
          tenant_id: req.headers['x-fixture-tenant'],
        };
        return true;
      },
    };
    const module = await Test.createTestingModule({
      controllers: [ExamsController],
      providers: [RolesGuard, { provide: ExamsService, useValue: exams }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(auth)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });
  beforeEach(() => jest.clearAllMocks());
  afterAll(async () => app?.close());

  it.each(['admit-card', 'admit-cards'])(
    'requires authentication for %s',
    async (path) => {
      await request(app.getHttpServer()).get(`${base}/${path}`).expect(401);
      expect(exams.generateAdmitCardOrThrow).not.toHaveBeenCalled();
      expect(exams.listIssuedAdmitCards).not.toHaveBeenCalled();
    },
  );

  it.each(['Faculty', 'ExamCell', 'Dean', 'SuperAdmin'])(
    'rejects %s on student-only routes',
    async (role) => {
      for (const path of ['admit-card', 'admit-cards'])
        await request(app.getHttpServer())
          .get(`${base}/${path}`)
          .set('x-fixture-role', role)
          .set('x-fixture-tenant', tenant)
          .expect(403);
      expect(exams.generateAdmitCardOrThrow).not.toHaveBeenCalled();
      expect(exams.listIssuedAdmitCards).not.toHaveBeenCalled();
    },
  );

  it.each(['admit-card', 'admit-cards'])(
    'requires authenticated tenant context for %s',
    async (path) => {
      await request(app.getHttpServer())
        .get(`${base}/${path}?tenant_id=${tenant}`)
        .set('x-fixture-role', 'Student')
        .expect(403);
      expect(exams.generateAdmitCardOrThrow).not.toHaveBeenCalled();
      expect(exams.listIssuedAdmitCards).not.toHaveBeenCalled();
    },
  );

  it('validates the issued entry ID before calling the service', async () => {
    await request(app.getHttpServer())
      .get(`${base}/admit-card?entry_id=../../secret`)
      .set('x-fixture-role', 'Student')
      .set('x-fixture-tenant', tenant)
      .expect(400);
    expect(exams.generateAdmitCardOrThrow).not.toHaveBeenCalled();
  });

  it('uses only server identity and returns issued PDF bytes with private cache headers', async () => {
    const response = await request(app.getHttpServer())
      .get(
        `${base}/admit-card?entry_id=${entry}&student_user_id=forged&tenant_id=forged`,
      )
      .set('x-fixture-role', 'Student')
      .set('x-fixture-tenant', tenant)
      .expect(200);
    expect(exams.generateAdmitCardOrThrow).toHaveBeenCalledWith(
      student,
      tenant,
      entry,
    );
    expect(response.body).toEqual(bytes);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('lists tickets with authenticated identity rather than query scope', async () => {
    await request(app.getHttpServer())
      .get(`${base}/admit-cards?student_user_id=forged&tenant_id=forged`)
      .set('x-fixture-role', 'Student')
      .set('x-fixture-tenant', tenant)
      .expect(200);
    expect(exams.listIssuedAdmitCards).toHaveBeenCalledWith(student, tenant);
  });
});
