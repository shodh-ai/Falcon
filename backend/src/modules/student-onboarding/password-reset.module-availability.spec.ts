import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('faculty onboarding availability', () => {
  it('keeps staff onboarding and independent verification available when HRMS is off', () => {
    const source = readFileSync(
      join(__dirname, 'student-onboarding.controller.ts'),
      'utf8',
    );

    expect(source).toMatch(
      /@Controller\('api\/staff\/onboarding'\)\s+@BelongsToModule\('CORE'\)/,
    );
    expect(source).toMatch(
      /@Controller\('api\/staff\/verifications'\)\s+@BelongsToModule\('CORE'\)/,
    );
    expect(source).toMatch(
      /@Controller\('api\/student\/onboarding'\)[\s\S]*?@Post\('reset-password'\)\s+@BelongsToModule\('CORE'\)/,
    );
  });
});
