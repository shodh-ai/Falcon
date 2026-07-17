import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

describe('Authentication API (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('logs in with valid credentials', async () => {
    const res = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.faculty.email, password: TEST_PASSWORD })
      .expect(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('Faculty');
  });

  it('rejects invalid login', async () => {
    await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.faculty.email, password: 'wrong' })
      .expect(401);
  });

  it('rejects missing payload', async () => {
    await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({})
      .expect(400);
  });

  it('returns profile for authorized token', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.dean.email, password: TEST_PASSWORD });
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.role).toBe('Dean');
  });

  it('rejects unauthorized request without token', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('x-tenant-subdomain', 'sgvu')
      .expect(401);
  });

  it('rejects expired/invalid token', async () => {
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid-token')
      .set('x-tenant-subdomain', 'sgvu')
      .expect(401);
  });

  it('logs out and invalidates session', async () => {
    const login = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email: TEST_USERS.hod.email, password: TEST_PASSWORD });
    await request(app)
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${login.body.token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(401);
  });
});
