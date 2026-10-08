import type { Page } from '@playwright/test';

export async function mockRegistrarApis(page: Page): Promise<void> {
  await page.route('**/api/search/directory**', async (route) => {
    const url = route.request().url();
    if (url.includes('/filters')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          roles: ['Student', 'Faculty'],
          departments: ['Mech Engg'],
          batches: ['2024'],
          statuses: ['Active'],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            user_id: 'u-1',
            name: 'Test Student',
            email: 'student@test.edu',
            role_name: 'Student',
            university_id: 'PRN001',
            dept_name: 'Mech Engg',
            batch: '2024',
            status: 'Active',
          },
        ],
        total: 1,
        page: 1,
        limit: 25,
        total_pages: 1,
      }),
    });
  });

  await page.route('**/api/admin/student-verifications/**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: 'v-1',
            name: 'Pending Student',
            official_email: 'pending@test.edu',
            onboarding_status: 'PENDING_ADMIN_APPROVAL',
            role_name: 'Student',
            portal_kind: 'student',
            submitted_at: new Date().toISOString(),
            doc_count: '3',
          },
        ]),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/api/leadership/issues**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kpis: { open_tickets: 2, sla_breaches: 0, avg_resolution_hours: 12 },
        department_heatmap: [],
        escalation_inbox: [],
      }),
    });
  });

  await page.route('**/api/helpdesk/tickets/profile-corrections**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/tasks/submissions/my**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          submission_id: 'sub-1',
          file_name: 'compliance.pdf',
          file_path: '/uploads/compliance.pdf',
          text_input: 'Monthly report',
          uploaded_at: new Date().toISOString(),
          assignment: { task: { task_name: 'IQAC Monthly Evidence' } },
        },
        {
          submission_id: 'sub-2',
          file_name: 'audit.xlsx',
          file_path: '/uploads/audit.xlsx',
          text_input: 'Audit workbook',
          uploaded_at: new Date().toISOString(),
          assignment: { task: { task_name: 'Governance Audit' } },
        },
      ]),
    });
  });

  await page.route('**/tasks/assignments/my**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/phd-lifecycle/registrar/candidates**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/api/super-admin/hierarchy**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        campuses: [{ campus_id: 1, campus_name: 'Main Campus' }],
        schools: [{ school_id: 1, school_name: 'Engineering', campus_id: 1 }],
        departments: [{ dept_id: 1, dept_name: 'Mech Engg', school_id: 1 }],
        programs: [{ program_id: 1, program_name: 'B.Tech ME', school_id: 1 }],
        batches: [{ batch_id: '2024', batch_name: '2024' }],
      }),
    });
  });

  await page.route('**/api/super-admin/assignments**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/iam/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([]),
    });
  });

  await page.route('**/uploads/download**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: Buffer.from('%PDF-1.4 mock'),
    });
  });
}
