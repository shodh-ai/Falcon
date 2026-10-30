import { NestFactory } from '@nestjs/core';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';
import { isVerifiedStaging } from './common/config/staging-environment';
import type { IncomingMessage } from 'http';
import { JwtService } from '@nestjs/jwt';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { anonymousStagingRequest } from './common/config/staging-request-policy';
import type { AuthTokenPayload } from './auth/interfaces/auth-provider.interface';
import type { Request, Response } from 'express';
import type { Socket } from 'socket.io';

class StagingIoAdapter extends IoAdapter {
  constructor(app: INestApplication,
    private readonly verifyTester: (token: string) => Promise<void>) { super(app); }
  createIOServer(port: number, options?: Parameters<IoAdapter['createIOServer']>[1]) {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: 'https://staging-falcon.jataka.io', credentials: true },
      allowRequest: (req: IncomingMessage, allow: (error: string | null, success: boolean) => void) => {
        allow(null, !req.headers.origin || req.headers.origin === 'https://staging-falcon.jataka.io');
      },
    });
    const invite = async (socket: Socket, next: (error?: Error) => void) => {
      try {
        const raw = socket.handshake.auth?.token ?? socket.handshake.headers.authorization;
        const token = typeof raw === 'string' ? raw.replace(/^Bearer /, '') : '';
        await this.verifyTester(token); next();
      } catch { next(new Error('Staging tester invitation required')); }
    };
    server.use(invite);
    server.on('new_namespace', (namespace: { use: (fn: typeof invite) => void }) => namespace.use(invite));
    return server;
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.FALCON_ENVIRONMENT === 'staging' && !isVerifiedStaging()) {
    throw new Error('Staging must use the verified runtime launcher');
  }
  if (isVerifiedStaging()) {
    // Run before Passport: no OAuth redirect, callback or public registration.
    app.use((req: { path: string }, res: {
      setHeader(name: string, value: string): void;
      status(code: number): { json(body: unknown): void };
    }, next: () => void) => {
      res.setHeader('X-Falcon-Environment', 'staging');
      res.setHeader('X-Falcon-Release', process.env.FALCON_RELEASE_ID!);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
      if (/^\/(?:api\/)?auth\/(?:google|register|signup)(?:\/|$)/i.test(req.path)) {
        res.status(403).json({ message: 'Staging access is invitation only' });
        return;
      }
      next();
    });
  }
  app.enableShutdownHooks();
  app.use(compression());
  const verifyTester = async (token: string): Promise<void> => {
    const claims = await app.get(JwtService).verifyAsync<AuthTokenPayload>(token, { algorithms: ['HS256'] });
    await app.get(JwtStrategy).validate(claims);
  };
  app.useWebSocketAdapter(isVerifiedStaging() ? new StagingIoAdapter(app, verifyTester) : new IoAdapter(app));
  app.use(cookieParser());
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const saasBase = process.env.SAAS_BASE_DOMAIN ?? 'localhost';
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const isDevPrivateNetworkOrigin =
        process.env.NODE_ENV !== 'production' &&
        /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(
          origin,
        );
      const allowed =
        origin === frontendUrl || (!isVerifiedStaging() && (
        origin.endsWith(`.${saasBase}`) ||
        isDevPrivateNetworkOrigin ||
        (process.env.NODE_ENV !== 'production' &&
          origin.startsWith('http://localhost'))));
      callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
    },
    credentials: true,
  });
  if (isVerifiedStaging()) {
    app.use(async (req: Request, res: Response, next: () => void) => {
      if (anonymousStagingRequest(req.method, req.path)) { next(); return; }
      try {
        const token = req.headers.authorization?.replace(/^Bearer /, '') ?? req.cookies?.falcon_auth_token;
        if (typeof token !== 'string' || !token) throw new Error();
        await verifyTester(token);
        next();
      } catch {
        res.status(401).json({ message: 'Staging access requires an invited tester account' });
      }
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
