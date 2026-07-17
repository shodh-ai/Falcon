import request from 'supertest';
import { createWorkflowApiMock, resetWorkflowApiMock } from '../../mocks/api-gateway.mock';
import { TEST_PASSWORD, TEST_USERS } from '../../helpers/test-users';
import { HOD_API } from '../../helpers/workflow-routes';

async function hodToken(app: ReturnType<typeof createWorkflowApiMock>) {
  const res = await request(app)
    .post('/api/auth/local-login')
    .set('x-tenant-subdomain', 'sgvu')
    .send({ email: TEST_USERS.hod.email, password: TEST_PASSWORD });
  return res.body.token as string;
}

describe('HOD API workflows (mock gateway)', () => {
  const app = createWorkflowApiMock();

  beforeEach(() => resetWorkflowApiMock());

  it('GET dashboard succeeds', async () => {
    const token = await hodToken(app);
    await request(app)
      .get(HOD_API.dashboard)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
  });

  it('GET leave approvals supports pagination', async () => {
    const token = await hodToken(app);
    const res = await request(app)
      .get(`${HOD_API.leaveApprovals}?page=1&limit=10`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .expect(200);
    expect(res.body.total).toBeGreaterThanOrEqual(0);
    expect(res.body.limit).toBe(10);
  });

  it('PATCH leave approval validates decision', async () => {
    const token = await hodToken(app);
    await request(app)
      .patch(`${HOD_API.leaveApprovals}/l1`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({})
      .expect(400);
  });

  it('PATCH leave approval approves request', async () => {
    const token = await hodToken(app);
    const res = await request(app)
      .patch(`${HOD_API.leaveApprovals}/l1`)
      .set('Authorization', `Bearer ${token}`)
      .set('x-tenant-subdomain', 'sgvu')
      .send({ decision: 'approve' })
      .expect(200);
    expect(res.body.status).toBe('HOD_APPROVED');
  });
});
