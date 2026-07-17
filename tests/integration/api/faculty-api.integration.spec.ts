import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';
import { FACULTY_API } from '../../helpers/workflow-routes';

async function facultyToken(app: ReturnType<typeof createWorkflowApiMock>) {
  const res = await request(app)
    .post('/api/auth/local-login')
    .set('x-tenant-subdomain', 'sgvu')
    .send({ email: TEST_USERS.faculty.email, password: TEST_PASSWORD });
  return res.body.token as string;
}

describe('Faculty API workflows (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('GET dashboard classes succeeds', async () => {
    const token = await facultyToken(app);
    const res = await request(app)
      .get(FACULTY_API.dashboard)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.classes).toBeDefined();
  });

  it('POST attendance validates payload', async () => {
    const token = await facultyToken(app);
    await request(app)
      .post(FACULTY_API.attendance)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({})
      .expect(400);
  });

  it('POST attendance submits for HOD approval', async () => {
    const token = await facultyToken(app);
    const res = await request(app)
      .post(FACULTY_API.attendance)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ course_id: 'c1', records: [] })
      .expect(201);
    expect(res.body.status).toBe('PENDING_HOD_APPROVAL');
  });
});
