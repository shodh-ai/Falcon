import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(compression());
  app.useWebSocketAdapter(new IoAdapter(app));
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
        origin === frontendUrl ||
        origin.endsWith(`.${saasBase}`) ||
        isDevPrivateNetworkOrigin ||
        (process.env.NODE_ENV !== 'production' &&
          origin.startsWith('http://localhost'));
      callback(allowed ? null : new Error('Not allowed by CORS'), allowed);
    },
    credentials: true,
  });
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
