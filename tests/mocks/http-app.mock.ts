import express, { type Express } from 'express';

/** Minimal HTTP app for Supertest infrastructure validation. */
export function createMockHttpApp(): Express {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', env: process.env.NODE_ENV ?? 'test' });
  });

  app.get('/api/ping', (_req, res) => {
    res.json({ pong: true });
  });

  return app;
}
