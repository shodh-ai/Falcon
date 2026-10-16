'use strict';
// Test launcher for the unchanged real Nest application. No guards are mocked.
const path = require('node:path');
const fs = require('node:fs');
const { loadEnv, ROOT, LOCAL } = require('./core.cjs');
const env = loadEnv();
if (!['development', 'test'].includes(env.NODE_ENV) || env.DB_HOST !== '127.0.0.1' || Number(env.DB_PORT) !== 5433 || env.DB_DATABASE !== 'university_governance' || env.FALCON_SMOKE_ENABLE !== '1') throw new Error('Refusing non-local test API launch.');
Object.assign(process.env, env, {
  NODE_ENV: 'test', DB_SYNCHRONIZE: 'false', TYPEORM_LOGGING: 'false', TYPEORM_SLOW_MS: '0',
  REDIS_HOST: '127.0.0.1', REDIS_PORT: '6391', REDIS_PASSWORD: '',
  S3_ENDPOINT: '', S3_ACCESS_KEY: '', S3_SECRET_KEY: '',
  EMAIL_HOST: '127.0.0.1', EMAIL_PORT: '1', EMAIL_USER: '', EMAIL_PASSWORD: '',
  RAZORPAY_KEY_ID: '', RAZORPAY_KEY_SECRET: '', ALLOW_MOCK_PAYMENTS: 'false',
  DEFAULT_TENANT_SUBDOMAIN: 'falcon-student-smoke', SAAS_BASE_DOMAIN: 'localhost',
  FRONTEND_URL: 'http://falcon-student-smoke.localhost:3100',
  UPLOAD_PATH: path.join(LOCAL, 'uploads'),
  TS_NODE_COMPILER_OPTIONS: JSON.stringify({ module: 'commonjs', moduleResolution: 'node', resolvePackageJsonExports: false }),
});
fs.mkdirSync(LOCAL, { recursive: true });
process.chdir(ROOT);
require('reflect-metadata');
require('ts-node/register/transpile-only');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { SchedulerRegistry } = require('@nestjs/schedule');
const { IoAdapter } = require('@nestjs/platform-socket.io');
const { AppModule } = require(path.join(ROOT, 'src/app.module.ts'));

async function start() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.use(require('cookie-parser')());
  app.use(require('compression')());
  app.useWebSocketAdapter(new IoAdapter(app));
  app.enableCors({ origin: process.env.FRONTEND_URL, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.use((_req, res, next) => { res.setHeader('X-Falcon-Smoke-Environment', 'test'); res.setHeader('X-Falcon-Smoke-Database', 'university_governance'); next(); });
  await app.init();
  const schedule = app.get(SchedulerRegistry);
  for (const job of schedule.getCronJobs().values()) job.stop();
  for (const name of schedule.getIntervals()) schedule.deleteInterval(name);
  for (const name of schedule.getTimeouts()) schedule.deleteTimeout(name);
  await app.listen(4100, '127.0.0.1');
  console.log('Real Falcon test API listening on loopback:4100; isolated Redis/storage; scheduled maintenance disabled; authentication/validation unchanged.');
  const stop = async () => { await app.close(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}
start().catch((error) => { console.error('Smoke API startup failed:', error.message); process.exit(1); });
