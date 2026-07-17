import request from 'supertest';
import { createMockHttpApp } from '../mocks/http-app.mock';
import { mockEmailService, mockPaymentGateway } from '../mocks/external-services';
import { isTestDatabaseAvailable } from '../helpers/db';
import { testEnv } from '../helpers/env';

describe('Integration test infrastructure', () => {
  describe('Supertest + Express mock app', () => {
    const app = createMockHttpApp();

    it('GET /health returns ok', async () => {
      const res = await request(app).get('/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('GET /api/ping returns pong', async () => {
      const res = await request(app).get('/api/ping').expect(200);
      expect(res.body.pong).toBe(true);
    });
  });

  describe('External service mocks', () => {
    it('records mocked email without sending', async () => {
      await mockEmailService.send({
        to: 'test@example.com',
        subject: 'Infra',
        body: 'Phase A',
      });
      expect(mockEmailService.getSent()).toHaveLength(1);
    });

    it('mocks payment gateway capture', async () => {
      const result = await mockPaymentGateway.charge(100);
      expect(result.status).toBe('captured');
    });
  });

  describe('Test database (optional)', () => {
    it('reports DB availability without failing CI', async () => {
      const env = testEnv();
      const available = await isTestDatabaseAvailable();
      if (env.testDbEnabled) {
        expect(available).toBe(true);
      } else {
        expect(typeof available).toBe('boolean');
      }
    });
  });
});
