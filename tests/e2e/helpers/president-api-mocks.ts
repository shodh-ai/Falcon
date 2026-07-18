import type { Page } from '@playwright/test';

const emptySummary = {
  total_university_revenue: 0,
  total_collected: 0,
  headcount: { students: 0, staff: 0, total: 0 },
  pending_student_verifications: 0,
  pending_governance_tasks: 0,
  pending_hr_approvals: 0,
  pending_executive_orders: 0,
  pending_convocation_ratifications: 0,
};

export async function mockPresidentApis(page: Page): Promise<void> {
  const fulfill = (body: unknown) => ({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });

  await page.route('**/api/president/**', async (route) => {
    const url = route.request().url();
    if (url.includes('executive-summary')) {
      await route.fulfill(fulfill(emptySummary));
      return;
    }
    if (url.includes('hr-approvals')) {
      await route.fulfill(fulfill({ pending_hires: 0, tenure_reviews: 0, disciplinary_cases: 0, approvals: [] }));
      return;
    }
    if (url.includes('executive-orders')) {
      await route.fulfill(fulfill({ active_suspensions: 0, pending_ratifications: 0, emergency_orders_ytd: 0, orders: [] }));
      return;
    }
    if (url.includes('pending-ratification')) {
      await route.fulfill(fulfill([]));
      return;
    }
    if (url.includes('convocation')) {
      await route.fulfill(fulfill({ eligible_graduates: 0, medals_approved: 0, pending_verifications: 0, certificates_generated: 0, total_applications: 0, graduates: [] }));
      return;
    }
    if (url.includes('compliance')) {
      await route.fulfill(fulfill({ pending_count: 0, completed_count: 0, total_assignments: 0, defaulting_units: [] }));
      return;
    }
    if (url.includes('finance-budget')) {
      await route.fulfill(fulfill({ department_budgets: [], total_allocated: 0, total_utilized: 0, pending_approvals: 0, pending_budget_expansions: 0, grant_disbursements: 0, audit_status: 'On Track' }));
      return;
    }
    if (url.includes('finance')) {
      await route.fulfill(fulfill({ collected: 0, pending: 0, status_breakdown: [] }));
      return;
    }
    if (url.includes('academics')) {
      await route.fulfill(fulfill({ schools: [] }));
      return;
    }
    if (url.includes('research')) {
      await route.fulfill(fulfill({ active_projects: 0, patents_filed: 0, grants_received: 0, extension_programs: 0, projects: [] }));
      return;
    }
    if (url.includes('hr-analytics')) {
      await route.fulfill(fulfill({ faculty_retention_rate: null, faculty_to_student_ratio: 0, total_payroll_expense: 0, headcount: { faculty: 0, staff: 0, students: 0 } }));
      return;
    }
    await route.fulfill(fulfill({}));
  });

  await page.route('**/api/leadership/issues**', async (route) => {
    await route.fulfill(fulfill({ kpis: {}, department_heatmap: [], escalation_inbox: [] }));
  });

  await page.route('**/api/meetings**', async (route) => {
    await route.fulfill(fulfill([]));
  });

  await page.route('**/api/notifications**', async (route) => {
    await route.fulfill(fulfill([]));
  });
}
