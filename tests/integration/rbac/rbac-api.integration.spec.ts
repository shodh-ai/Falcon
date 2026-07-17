import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

async function loginAs(app: ReturnType<typeof createWorkflowApiMock>, email: string) {
  const res = await request(app)
    .post('/api/auth/local-login')
    .set('x-tenant-subdomain', 'sgvu')
    .send({ email, password: TEST_PASSWORD });
  return res.body.token as string;
}

describe('RBAC API guards (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('allows faculty on faculty endpoints', async () => {
    const token = await loginAs(app, TEST_USERS.faculty.email);
    await request(app)
      .get('/api/academics/faculty/today-classes')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
  });

  it('denies faculty on HOD endpoints', async () => {
    const token = await loginAs(app, TEST_USERS.faculty.email);
    await request(app)
      .get('/api/academics/hod/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(403);
  });

  it('denies HOD on dean-only endpoints', async () => {
    const token = await loginAs(app, TEST_USERS.hod.email);
    await request(app)
      .get('/api/academics/dean/command-center')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(403);
  });

  it('denies dean on super-admin style exam publish for operator', async () => {
    const token = await loginAs(app, TEST_USERS.examoperator.email);
    await request(app)
      .post('/api/exam-cell/results/publish')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ session_id: 's1' })
      .expect(403);
  });

  it('allows examcell to publish results', async () => {
    const token = await loginAs(app, TEST_USERS.examcell.email);
    await request(app)
      .post('/api/exam-cell/results/publish')
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ session_id: 's1' })
      .expect(200);
  });
});
