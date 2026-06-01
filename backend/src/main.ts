import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(cookieParser());
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  const saasBase = process.env.SAAS_BASE_DOMAIN ?? 'localhost';
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      const allowed =
        origin === frontendUrl ||
        origin.endsWith(`.${saasBase}`) ||
        (process.env.NODE_ENV !== 'production' && origin.startsWith('http://localhost'));
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
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
