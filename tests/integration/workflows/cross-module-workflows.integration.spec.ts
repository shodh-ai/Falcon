import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';

describe('Cross-module approval workflows (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  async function login(email: string) {
    const res = await request(app)
      .post('/api/auth/local-login')
      .set('x-tenant-subdomain', 'sgvu')
      .send({ email, password: TEST_PASSWORD });
    return res.body.token as string;
  }

  it('Faculty → HOD attendance approval chain', async () => {
    const facultyToken = await login(TEST_USERS.faculty.email);
    const submit = await request(app)
      .post('/api/academics/faculty/attendance')
      .set('Authorization', `Bearer ${facultyToken}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ course_id: 'c1', records: [] })
      .expect(201);
    expect(submit.body.status).toBe('PENDING_HOD_APPROVAL');

    const hodToken = await login(TEST_USERS.hod.email);
    await request(app)
      .get('/api/academics/hod/dashboard')
      .set('Authorization', `Bearer ${hodToken}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
  });

  it('HOD → Dean funding escalation endpoint reachable by dean', async () => {
    const deanToken = await login(TEST_USERS.dean.email);
    const res = await request(app)
      .patch('/api/academics/dean/funding-requests/fr1')
      .set('Authorization', `Bearer ${deanToken}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ decision: 'approve' })
      .expect(200);
    expect(res.body.status).toBe('APPROVED');
  });

  it('Exam Cell → Dean result approval inbox', async () => {
    const deanToken = await login(TEST_USERS.dean.email);
    const res = await request(app)
      .get('/api/academics/dean/inbox?page=1')
      .set('Authorization', `Bearer ${deanToken}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.data[0].type).toBe('result_approval');
  });
});
