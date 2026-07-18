import type { Page } from '@playwright/test';
import { TEST_USERS } from '../../helpers/test-users';

export type MockPortalUser = {
  role: string;
  roles?: string[];
  primaryRole?: string;
  email: string;
  token?: string;
};

export async function mockAuthenticatedSession(page: Page, user: MockPortalUser): Promise<void> {
  const token = user.token ?? `e2e-mock-token-${user.role}`;
  const payload = {
    role: user.role,
    roles: user.roles ?? [user.role],
    primaryRole: user.primaryRole ?? user.role,
    email: user.email,
    onboarding_status: 'COMPLETED',
  };

  await page.route('**/api/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });

  await page.route('**/api/auth/me/permissions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ permissions: [] }),
    });
  });

  await page.addInitScript(
    ([t, u]) => {
      localStorage.setItem('token', t);
      localStorage.setItem('user', u);
    },
    [token, JSON.stringify(payload)],
  );
}

export const PORTAL_MOCK_USERS = {
  faculty: {
    role: 'Faculty',
    email: TEST_USERS.faculty.email,
  },
  hod: {
    role: 'HOD',
    email: TEST_USERS.hod.email,
  },
  dean: {
    role: 'Dean',
    email: TEST_USERS.dean.email,
  },
  examcell: {
    role: 'examcell',
    email: TEST_USERS.examcell.email,
  },
  registrar: {
    role: 'Registrar',
    email: TEST_USERS.registrar.email,
  },
} as const;
