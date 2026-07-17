import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

describe('Performance — pagination and response shape (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  async function deanToken() {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.dean.email, password: TEST_PASSWORD });
    return login.body.token as string;
  }

  it('paginates dean inbox under limit cap', async () => {
    const token = await deanToken();
    const start = Date.now();
    const res = await request(app)
      .get('/api/academics/dean/inbox?page=1&limit=100')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    const elapsed = Date.now() - start;
    expect(res.body.limit).toBeLessThanOrEqual(100);
    expect(elapsed).toBeLessThan(2000);
  });

  it('handles duplicate identical requests consistently', async () => {
    const token = await deanToken();
    const path = '/api/academics/dean/inbox?page=1&limit=5';
    const headers = {
      Authorization: `Bearer ${token}`,
      'x-tenant-subdomain': 'sgvu',
    };
    const a = await request(app).get(path).set(headers);
    const b = await request(app).get(path).set(headers);
    expect(a.body.total).toBe(b.body.total);
  });
});
