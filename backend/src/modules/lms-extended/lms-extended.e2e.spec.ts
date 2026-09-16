import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { LmsExtendedController } from './lms-extended.controller';
import { LmsExtendedService } from './lms-extended.service';

class TestIdentityGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    req.user = {
      user_id: req.headers['x-test-user'],
      tenant_id: req.headers['x-test-tenant'],
      role: req.headers['x-test-role'],
    };
    return true;
  }
}

describe('LMS HTTP scope contract (e2e)', () => {
  let app: INestApplication;
  const lms = {
    listCourseQuizzes: jest.fn().mockResolvedValue([]),
    listThreads: jest.fn().mockResolvedValue([]),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [LmsExtendedController],
      providers: [{ provide: LmsExtendedService, useValue: lms }],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestIdentityGuard)
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('passes authenticated tenant, user and role into quiz scope checks', async () => {
    await request(app.getHttpServer())
      .get('/api/lms/courses/course-a/quizzes')
      .set('x-test-tenant', 'tenant-a')
      .set('x-test-user', 'student-a')
      .set('x-test-role', 'Student')
      .expect(200);
    expect(lms.listCourseQuizzes).toHaveBeenCalledWith(
      'tenant-a',
      'course-a',
      'student-a',
      ['Student'],
    );
  });

  it('fails closed when authenticated tenant context is absent', async () => {
    await request(app.getHttpServer())
      .get('/api/lms/courses/course-a/forums')
      .set('x-test-user', 'student-a')
      .set('x-test-role', 'Student')
      .expect(403);
    expect(lms.listThreads).not.toHaveBeenCalled();
  });
});
