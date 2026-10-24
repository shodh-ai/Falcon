import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { json, type NextFunction, type Request, type Response } from 'express';
import type { IncomingMessage } from 'node:http';
import type { Server, ServerOptions } from 'socket.io';
import cookieParser from 'cookie-parser';
import {
  assertNotificationStagingRuntime,
  notificationStagingConfig,
  STAGING_TARGETS,
} from './config';
import { NotificationStagingModule, requestOneStagingCapture } from './module';
import { DataSource } from 'typeorm';
import { NotificationDispatchService } from '../core/notifications/notification-dispatch.service';

export function notificationStagingRoute(
  method: string,
  path: string,
): boolean {
  if (
    method === 'GET' &&
    [
      '/health',
      '/api/auth/me',
      '/api/auth/me/permissions',
      '/api/auth/profile',
      '/api/tenants/resolve/notification-staging',
      '/api/notifications',
      '/api/notifications/recent',
      '/api/notifications/unread-count',
    ].includes(path)
  )
    return true;
  if (
    method === 'POST' &&
    ['/api/auth/local-login', '/api/notifications/mark-all-read'].includes(path)
  )
    return true;
  return (
    method === 'PATCH' &&
    /^\/api\/notifications\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\/(read|dismiss)$/.test(
      path,
    )
  );
}

export function notificationStagingAccess(frontend: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const peer = (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
    const method =
      req.method === 'OPTIONS'
        ? String(req.headers['access-control-request-method'] ?? '')
        : req.method;
    if (
      peer !== STAGING_TARGETS.ingress ||
      (req.headers.origin && req.headers.origin !== frontend)
    ) {
      res
        .status(403)
        .json({ message: 'Isolated notification staging ingress required' });
      return;
    }
    if (!notificationStagingRoute(method, req.path)) {
      res
        .status(404)
        .json({ message: 'Route unavailable in notification staging' });
      return;
    }
    next();
  };
}

export function stagingSocketAllowed(
  req: IncomingMessage,
  frontend: string,
): boolean {
  return (
    req.headers.origin === frontend &&
    (req.socket.remoteAddress ?? '').replace(/^::ffff:/, '') ===
      STAGING_TARGETS.ingress
  );
}

class NotificationStagingSocketAdapter extends IoAdapter {
  constructor(
    app: INestApplication,
    private readonly frontend: string,
  ) {
    super(app);
  }
  override createIOServer(port: number, options?: ServerOptions) {
    // Overrides the shared gateway's broad CORS at the actual Engine.IO boundary.
    return super.createIOServer(port, {
      ...options,
      cors: { origin: this.frontend, credentials: true },
      allowRequest: (
        req: IncomingMessage,
        done: (error: string | null, success: boolean) => void,
      ) => done(null, stagingSocketAllowed(req, this.frontend)),
    }) as Server;
  }
}

export async function startNotificationStaging() {
  assertNotificationStagingRuntime();
  const settings = notificationStagingConfig(process.env);
  const module = await NotificationStagingModule.configure(settings);
  const app = await NestFactory.create(module, {
    logger: false,
    abortOnError: false,
    bodyParser: false,
  });
  app.use(notificationStagingAccess(settings.frontend));
  app.enableCors({
    origin: settings.frontend,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
  });
  app.use(json({ limit: '16kb' }));
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useWebSocketAdapter(
    new NotificationStagingSocketAdapter(app, settings.frontend),
  );
  app.enableShutdownHooks();
  // Internal container only; no direct published port. Host ingress is loopback-only.
  await app.listen(4110, '0.0.0.0');
  return app;
}

/** Separate operator-only invocation, never part of normal HTTP startup. */
export async function requestNotificationStagingOnce() {
  assertNotificationStagingRuntime();
  if (
    process.argv.slice(2).join(' ') !==
    '--approved-notification-staging --capture-once'
  )
    throw new Error('Explicit one-shot capture execution required');
  const settings = notificationStagingConfig(process.env);
  const app = await NestFactory.createApplicationContext(
    await NotificationStagingModule.configure(settings),
    { logger: false, abortOnError: false },
  );
  try {
    return await requestOneStagingCapture(
      app.get(DataSource),
      app.get(NotificationDispatchService),
      settings,
    );
  } finally {
    await app.close();
  }
}

if (require.main === module)
  void (
    process.argv.includes('--capture-once')
      ? requestNotificationStagingOnce().then((result) => {
          console.log(JSON.stringify(result));
        })
      : startNotificationStaging()
  ).catch(() => {
    console.error(
      'Notification staging startup failed (ISOLATED_CONFIGURATION)',
    );
    // Only the explicitly invoked staging child exits; release partial providers.
    process.exit(1);
  });
