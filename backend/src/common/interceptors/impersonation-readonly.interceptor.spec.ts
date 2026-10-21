import {
  Controller,
  Get,
  INestApplication,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AuthService } from '../../auth/auth.service';
import { JwtStrategy } from '../../auth/strategies/jwt.strategy';
import { AllowImpersonationWrite } from '../decorators/allow-impersonation-write.decorator';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { ImpersonationReadOnlyGuard } from '../guards/impersonation-readonly.guard';
import { ImpersonationReadOnlyInterceptor } from './impersonation-readonly.interceptor';

jest.mock('uuid', () => ({ v4: () => 'synthetic-uuid' }));

describe('Authenticated role and impersonation enforcement over HTTP', () => {
  const secret = 'synthetic-http-secret';
  const jwt = new JwtService({ secret });
  let app: INestApplication;
  const writes: unknown[] = [];

  @Controller(['synthetic-finance', 'api/synthetic-finance'])
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('Accountant')
  class SyntheticController {
    @Get('records') read() {
      return { records: [] };
    }
    @Post('record') write(@Req() req: { user: unknown }) {
      writes.push(req.user);
      return { ok: true };
    }
    @Post('exit-impersonation')
    @AllowImpersonationWrite()
    exit() {
      return { exited: true };
    }
  }

  beforeAll(async () => {
    const find = jest.fn(async (sub: string, tenantId: string) =>
      tenantId === 'tenant-a' &&
      ['accountant', 'student', 'inactive'].includes(sub)
        ? {
            user_id: sub,
            tenant_id: tenantId,
            is_active: sub !== 'inactive',
            role: { role_name: sub === 'student' ? 'Student' : 'Accountant' },
            role_id: 1,
            email: 'synthetic@example.test',
          }
        : null,
    );
    const module = await Test.createTestingModule({
      controllers: [SyntheticController],
      providers: [
        JwtAuthGuard,
        RolesGuard,
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: new ConfigService({ JWT_SECRET: secret }),
        },
        { provide: DataSource, useValue: { query: jest.fn() } },
        {
          provide: AuthService,
          useValue: {
            findById: find,
            syncMultiHatWorkspaceRoles: jest.fn(),
            loadUserWithSyncedWorkspaceRoles: find,
            getRoleClaims: (user: { role: { role_name: string } }) => ({
              roles: [user.role.role_name],
              primaryRole: user.role.role_name,
            }),
          },
        },
        { provide: APP_GUARD, useClass: ImpersonationReadOnlyGuard },
        {
          provide: APP_INTERCEPTOR,
          useClass: ImpersonationReadOnlyInterceptor,
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    writes.length = 0;
  });
  const sign = (sub = 'accountant', extra: Record<string, unknown> = {}) =>
    jwt.sign({ sub, tenantId: 'tenant-a', ...extra }, { expiresIn: 120 });

  it.each(['/synthetic-finance', '/api/synthetic-finance'])(
    'requires authenticated role access for alias %s',
    async (base) => {
      await request(app.getHttpServer())
        .post(base + '/record')
        .expect(401);
      await request(app.getHttpServer())
        .post(base + '/record')
        .auth(sign('student', { roles: ['Accountant'] }), { type: 'bearer' })
        .expect(403);
      await request(app.getHttpServer())
        .post(base + '/record')
        .auth(sign(), { type: 'bearer' })
        .expect(201);
      expect(writes).toHaveLength(1);
    },
  );

  it('rejects inactive, expired, foreign-tenant and missing-tenant signed sessions', async () => {
    const tokens = [
      sign('inactive'),
      sign('accountant', { tenantId: 'tenant-b' }),
      jwt.sign({ sub: 'accountant' }, { expiresIn: 120 }),
      jwt.sign({ sub: 'accountant', tenantId: 'tenant-a' }, { expiresIn: -1 }),
    ];
    for (const token of tokens)
      await request(app.getHttpServer())
        .post('/synthetic-finance/record')
        .auth(token, { type: 'bearer' })
        .expect(401);
    expect(writes).toHaveLength(0);
  });

  it('enforces read-only impersonation after controller authentication, preserving reads and explicit exit', async () => {
    const token = sign('accountant', {
      impersonator_user_id: 'owner-a',
      read_only_impersonation: true,
      impersonation_session_id: 'session-a',
    });
    await request(app.getHttpServer())
      .post('/synthetic-finance/record')
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .get('/synthetic-finance/records')
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .post('/synthetic-finance/exit-impersonation')
      .auth(token, { type: 'bearer' })
      .expect(201);
    expect(writes).toHaveLength(0);
  });
});
